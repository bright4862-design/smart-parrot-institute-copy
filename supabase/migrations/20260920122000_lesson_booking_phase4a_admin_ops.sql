-- Smart Parrot Institute lesson-booking Phase 4A
-- Admin review queue + purpose-limited evidence export + auditable admin actions.
-- No provider write, dispute submission, live payment, or production deployment is performed here.

create table if not exists public.admin_review_cases (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  kind text not null check (kind in ('payment','attendance','cancellation','compliance','dispute','other')),
  status text not null default 'open' check (status in ('open','in_review','resolved')),
  priority text not null default 'normal' check (priority in ('normal','high','urgent')),
  reason text not null,
  opened_by uuid not null references public.profiles(id) on delete restrict,
  opened_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  resolution text,
  check ((status = 'resolved') = (resolved_at is not null)),
  check (status <> 'resolved' or nullif(trim(resolution),'') is not null)
);

create unique index if not exists admin_review_cases_one_active_kind
  on public.admin_review_cases(booking_id, kind)
  where status in ('open','in_review');
create index if not exists admin_review_cases_queue_idx
  on public.admin_review_cases(status, priority, opened_at)
  where status in ('open','in_review');

create table if not exists public.admin_review_case_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.admin_review_cases(id) on delete restrict,
  admin_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('opened','claimed','note','resolved')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create table if not exists public.admin_evidence_access_log (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  admin_id uuid not null references public.profiles(id) on delete restrict,
  purpose text not null check (purpose in ('customer_support','payment_dispute','legal_compliance','quality_review')),
  fields_profile text not null default 'minimized_v1',
  exported_at timestamptz not null default clock_timestamp()
);

alter table public.admin_review_cases enable row level security;
alter table public.admin_review_case_events enable row level security;
alter table public.admin_evidence_access_log enable row level security;

revoke all on table public.admin_review_cases from anon, authenticated;
revoke all on table public.admin_review_case_events from anon, authenticated;
revoke all on table public.admin_evidence_access_log from anon, authenticated;

drop trigger if exists admin_review_case_events_append_only on public.admin_review_case_events;
create trigger admin_review_case_events_append_only
before update or delete on public.admin_review_case_events
for each row execute function public.forbid_change();

drop trigger if exists admin_evidence_access_log_append_only on public.admin_evidence_access_log;
create trigger admin_evidence_access_log_append_only
before update or delete on public.admin_evidence_access_log
for each row execute function public.forbid_change();

create or replace function private.smart_parrot_require_admin(p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or not exists (
    select 1
    from public.profiles p
    where p.id = p_user_id and p.role = 'admin'
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.smart_parrot_require_admin(uuid)
  from public, anon, authenticated;

create or replace function public.admin_open_review_case(
  p_booking_id uuid,
  p_kind text,
  p_reason text,
  p_priority text default 'normal'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  existing_id uuid;
  case_id uuid;
  clean_reason text := nullif(trim(coalesce(p_reason,'')), '');
begin
  perform private.smart_parrot_require_admin(uid);
  if p_booking_id is null
     or p_kind is null or p_kind not in ('payment','attendance','cancellation','compliance','dispute','other')
     or p_priority is null or p_priority not in ('normal','high','urgent')
     or clean_reason is null or length(clean_reason) < 3 or length(clean_reason) > 1000 then
    raise exception 'invalid_admin_review_case' using errcode = '22023';
  end if;
  if not exists (select 1 from public.bookings b where b.id = p_booking_id) then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  select c.id into existing_id
  from public.admin_review_cases c
  where c.booking_id = p_booking_id and c.kind = p_kind and c.status in ('open','in_review')
  order by c.opened_at, c.id
  limit 1;
  if existing_id is not null then return existing_id; end if;
  insert into public.admin_review_cases(booking_id,kind,priority,reason,opened_by)
  values (p_booking_id,p_kind,p_priority,clean_reason,uid)
  returning id into case_id;
  insert into public.admin_review_case_events(case_id,admin_id,action,details)
  values (case_id,uid,'opened',jsonb_build_object('priority',p_priority,'reason',clean_reason));
  return case_id;
end;
$$;

create or replace function public.admin_resolve_review_case(
  p_case_id uuid,
  p_resolution text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  c public.admin_review_cases%rowtype;
  clean_resolution text := nullif(trim(coalesce(p_resolution,'')), '');
begin
  perform private.smart_parrot_require_admin(uid);
  if p_case_id is null or clean_resolution is null or length(clean_resolution) < 3 or length(clean_resolution) > 2000 then
    raise exception 'invalid_admin_case_resolution' using errcode = '22023';
  end if;
  select * into c from public.admin_review_cases where id = p_case_id for update;
  if not found then raise exception 'admin_review_case_not_found' using errcode = 'P0002'; end if;
  if c.status = 'resolved' then
    if c.resolution = clean_resolution then return true; end if;
    raise exception 'admin_review_case_already_resolved' using errcode = '55000';
  end if;
  update public.admin_review_cases
  set status='resolved', resolved_at=clock_timestamp(), resolution=clean_resolution
  where id=c.id;
  insert into public.admin_review_case_events(case_id,admin_id,action,details)
  values (c.id,uid,'resolved',jsonb_build_object('resolution',clean_resolution));
  return true;
end;
$$;

create or replace function public.admin_review_queue(
  p_limit int default 50,
  p_now timestamptz default clock_timestamp()
) returns table(
  source text,
  review_case_id uuid,
  booking_id uuid,
  category text,
  severity text,
  summary text,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  perform private.smart_parrot_require_admin(uid);
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_now is null then
    raise exception 'invalid_admin_review_queue_request' using errcode = '22023';
  end if;
  return query
  with items as (
    select 'manual_case'::text as q_source,c.id as q_case_id,c.booking_id as q_booking_id,c.kind as q_category,c.priority as q_severity,left(c.reason,500) as q_summary,c.opened_at as q_occurred_at
    from public.admin_review_cases c where c.status in ('open','in_review')
    union all
    select 'payment_hold'::text,null::uuid,b.id,'payment'::text,
      case when b.starts_at <= p_now + interval '12 hours' then 'urgent' else 'high' end,
      'Payment hold failed before lesson'::text,coalesce(b.hold_due_at,b.created_at)
    from public.bookings b
    where b.status='hold_failed' and b.starts_at >= p_now - interval '1 day' and b.starts_at <= p_now + interval '48 hours'
    union all
    select 'settlement_error'::text,null::uuid,b.id,'payment'::text,
      case when b.settlement_attempts >= 6 then 'urgent' else 'high' end,
      'Settlement requires operator review'::text,b.settlement_last_error_at
    from public.bookings b
    where b.settlement_last_error_at is not null and b.status='awaiting_settlement'
    union all
    select 'cancellation_error'::text,null::uuid,b.id,'cancellation'::text,
      case when b.cancellation_attempts >= 6 then 'urgent' else 'high' end,
      'Cancellation payment/finalization requires operator review'::text,b.cancellation_last_error_at
    from public.bookings b
    where b.cancellation_last_error_at is not null and b.cancellation_requested_at is not null and b.status <> 'cancelled'
    union all
    select 'compliance_delivery'::text,null::uuid,o.booking_id,'compliance'::text,
      case when o.dead_lettered_at is not null then 'urgent' else 'high' end,
      case when o.dead_lettered_at is not null then 'Compliance acknowledgement delivery dead-lettered' else 'Compliance acknowledgement delivery overdue' end::text,
      coalesce(o.dead_lettered_at,o.last_attempt_at,o.queued_at)
    from public.compliance_notice_outbox o
    where o.delivered_at is null and (o.dead_lettered_at is not null or o.queued_at <= p_now - interval '24 hours')
  )
  select i.q_source,i.q_case_id,i.q_booking_id,i.q_category,i.q_severity,i.q_summary,i.q_occurred_at
  from items i
  order by case i.q_severity when 'urgent' then 0 when 'high' then 1 else 2 end,
    i.q_occurred_at nulls first,i.q_booking_id
  limit p_limit;
end;
$$;

create or replace function public.admin_export_booking_evidence(
  p_booking_id uuid,
  p_purpose text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  b public.bookings%rowtype;
  p public.policy_versions%rowtype;
  student_name text;
  tutor_name text;
  consent_json jsonb := '[]'::jsonb;
  attendance_json jsonb := '[]'::jsonb;
  ledger_json jsonb := '[]'::jsonb;
  cancellation_json jsonb := 'null'::jsonb;
  compliance_json jsonb := '[]'::jsonb;
  packet jsonb;
begin
  perform private.smart_parrot_require_admin(uid);
  if p_booking_id is null or p_purpose is null
     or p_purpose not in ('customer_support','payment_dispute','legal_compliance','quality_review') then
    raise exception 'invalid_evidence_export_request' using errcode = '22023';
  end if;
  select * into b from public.bookings where id=p_booking_id;
  if not found then raise exception 'booking_not_found' using errcode='P0002'; end if;
  select * into p from public.policy_versions where id=b.policy_version_id;
  if not found then raise exception 'booking_policy_not_found' using errcode='P0002'; end if;
  select sp.full_name,tp.full_name into student_name,tutor_name
  from public.profiles sp join public.profiles tp on tp.id=b.tutor_id where sp.id=b.student_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'policy_version_id',c.policy_version_id,'terms_sha256',c.terms_sha256,'checkbox_text',c.checkbox_text,
    'express_start_request',c.express_start_request,'accepted_at',c.accepted_at
  ) order by c.accepted_at,c.id),'[]'::jsonb)
  into consent_json from public.consents c where c.booking_id=b.id;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'actor',e.actor,'kind',e.kind,'source',e.source,'occurred_at',e.occurred_at,'received_at',e.received_at,
    'provider_event_id',case when p_purpose='payment_dispute' then e.external_id else null end
  )) order by e.occurred_at,e.id),'[]'::jsonb)
  into attendance_json from public.attendance_events e where e.booking_id=b.id;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'kind',l.kind,'amount_cents',l.amount_cents,'currency',l.currency,'note',l.note,'created_at',l.created_at,
    'provider_reference',case when p_purpose='payment_dispute' then l.stripe_object_id else null end
  )) order by l.created_at,l.id),'[]'::jsonb)
  into ledger_json from public.ledger_entries l where l.booking_id=b.id;

  select jsonb_strip_nulls(jsonb_build_object(
    'actor_role',r.actor_role,'kind',r.kind,'requested_at',r.requested_at,'policy_version_id',r.policy_version_id,
    'terms_sha256',r.terms_sha256,'outcome',r.outcome,'amount_cents',r.amount_cents,'payment_action',r.payment_action,
    'declaration_name',case when p_purpose='legal_compliance' then r.declaration_name else null end,
    'declaration_contact',case when p_purpose='legal_compliance' then r.declaration_contact else null end
  )) into cancellation_json
  from public.booking_cancellation_requests r where r.booking_id=b.id;
  cancellation_json := coalesce(cancellation_json,'null'::jsonb);

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'kind',o.kind,'queued_at',o.queued_at,'delivered_at',o.delivered_at,'delivery_attempts',o.delivery_attempts,
    'state',case when o.delivered_at is not null then 'delivered'
                 when o.dead_lettered_at is not null then 'needs_attention'
                 when o.delivery_attempts > 0 then 'retrying' else 'queued' end,
    'provider_message_id',case when p_purpose='legal_compliance' then o.provider_message_id else null end
  )) order by o.queued_at,o.id),'[]'::jsonb)
  into compliance_json from public.compliance_notice_outbox o where o.booking_id=b.id;

  packet := jsonb_build_object(
    'schema_version','smart_parrot_booking_evidence_v1','purpose',p_purpose,'generated_at',clock_timestamp(),
    'booking',jsonb_build_object(
      'id',b.id,'student_id',b.student_id,'student_name',student_name,'tutor_id',b.tutor_id,'tutor_name',tutor_name,
      'lesson_type_id',b.lesson_type_id,'starts_at',b.starts_at,'ends_at',b.ends_at,'status',b.status,'currency',b.currency,
      'on_time_price_cents',b.on_time_price_cents,'max_charge_cents',b.max_charge_cents,
      'final_amount_cents',b.final_amount_cents,'outcome',b.outcome,'created_at',b.created_at
    ),
    'policy',jsonb_build_object('id',p.id,'terms_sha256',p.terms_sha256,'published_at',p.published_at),
    'consents',consent_json,'attendance',attendance_json,'ledger',ledger_json,'cancellation',cancellation_json,
    'compliance_delivery',compliance_json,
    'data_scope',jsonb_build_array(
      'No attendance raw payloads','No IP addresses or user-agent strings',
      'Provider event/payment references only for payment_dispute',
      'Withdrawal declaration contact only for legal_compliance'
    )
  );
  insert into public.admin_evidence_access_log(booking_id,admin_id,purpose,fields_profile)
  values (b.id,uid,p_purpose,'minimized_v1');
  return packet;
end;
$$;

revoke all on function public.admin_open_review_case(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.admin_resolve_review_case(uuid,text) from public,anon,authenticated;
revoke all on function public.admin_review_queue(int,timestamptz) from public,anon,authenticated;
revoke all on function public.admin_export_booking_evidence(uuid,text) from public,anon,authenticated;
grant execute on function public.admin_open_review_case(uuid,text,text,text) to authenticated;
grant execute on function public.admin_resolve_review_case(uuid,text) to authenticated;
grant execute on function public.admin_review_queue(int,timestamptz) to authenticated;
grant execute on function public.admin_export_booking_evidence(uuid,text) to authenticated;

comment on function public.admin_review_queue(int,timestamptz) is
  'Admin-only minimized operations queue combining manual review cases with payment, settlement, cancellation and compliance alerts.';
comment on function public.admin_export_booking_evidence(uuid,text) is
  'Admin-only purpose-limited evidence packet. Every export is audit logged; raw attendance payloads, IPs and user agents are excluded.';
comment on table public.admin_evidence_access_log is
  'Append-only accountability record for purpose-limited booking evidence exports.';
