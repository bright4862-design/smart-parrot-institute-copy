-- Smart Parrot Institute lesson-booking Phase 4B
-- Admin case leasing/notes, alert acknowledgement, minimized Stripe dispute intake,
-- and DSAR inventory boundaries. No provider dispute write or automatic erasure.

alter table public.admin_review_cases
  alter column opened_by drop not null,
  add column if not exists opened_source text not null default 'admin',
  add column if not exists claimed_by uuid references public.profiles(id) on delete restrict,
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_expires_at timestamptz;

alter table public.admin_review_case_events
  alter column admin_id drop not null,
  add column if not exists actor_source text not null default 'admin';

do $$
begin
  if not exists (select 1 from pg_constraint where conname='admin_review_cases_opened_source_check' and conrelid='public.admin_review_cases'::regclass) then
    alter table public.admin_review_cases add constraint admin_review_cases_opened_source_check
      check (opened_source in ('admin','stripe_webhook','system'));
  end if;
  if not exists (select 1 from pg_constraint where conname='admin_review_cases_opener_check' and conrelid='public.admin_review_cases'::regclass) then
    alter table public.admin_review_cases add constraint admin_review_cases_opener_check
      check ((opened_source='admin' and opened_by is not null) or (opened_source<>'admin' and opened_by is null));
  end if;
  if not exists (select 1 from pg_constraint where conname='admin_review_cases_claim_check' and conrelid='public.admin_review_cases'::regclass) then
    alter table public.admin_review_cases add constraint admin_review_cases_claim_check
      check ((claimed_by is null and claimed_at is null and claim_expires_at is null)
          or (claimed_by is not null and claimed_at is not null and claim_expires_at is not null and claim_expires_at > claimed_at));
  end if;
  if not exists (select 1 from pg_constraint where conname='admin_review_case_events_actor_source_check' and conrelid='public.admin_review_case_events'::regclass) then
    alter table public.admin_review_case_events add constraint admin_review_case_events_actor_source_check
      check (actor_source in ('admin','stripe_webhook','system'));
  end if;
  if not exists (select 1 from pg_constraint where conname='admin_review_case_events_actor_check' and conrelid='public.admin_review_case_events'::regclass) then
    alter table public.admin_review_case_events add constraint admin_review_case_events_actor_check
      check ((actor_source='admin' and admin_id is not null) or (actor_source<>'admin' and admin_id is null));
  end if;
end $$;

create index if not exists admin_review_cases_claim_idx
  on public.admin_review_cases(status, claim_expires_at)
  where status='in_review';

create table if not exists public.stripe_dispute_events (
  provider_event_id text primary key,
  dispute_id text not null,
  booking_id uuid references public.bookings(id) on delete restrict,
  event_type text not null check (event_type in ('charge.dispute.created','charge.dispute.updated','charge.dispute.closed')),
  dispute_status text not null check (dispute_status in ('warning_needs_response','warning_under_review','warning_closed','needs_response','under_review','won','lost','prevented')),
  reason text not null,
  amount_cents int not null check (amount_cents >= 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  stripe_payment_intent_id text,
  stripe_charge_id text,
  evidence_due_at timestamptz,
  event_created_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp(),
  check (provider_event_id like 'evt_%'),
  check (dispute_id like 'du_%')
);

create index if not exists stripe_dispute_events_dispute_idx
  on public.stripe_dispute_events(dispute_id, event_created_at desc);
create index if not exists stripe_dispute_events_booking_idx
  on public.stripe_dispute_events(booking_id, received_at desc)
  where booking_id is not null;

alter table public.stripe_dispute_events enable row level security;
revoke all on table public.stripe_dispute_events from anon, authenticated;

drop trigger if exists stripe_dispute_events_append_only on public.stripe_dispute_events;
create trigger stripe_dispute_events_append_only
before update or delete on public.stripe_dispute_events
for each row execute function public.forbid_change();

create table if not exists public.admin_operational_alert_acknowledgements (
  id bigint generated always as identity primary key,
  source text not null check (source in ('payment_hold','settlement_error','cancellation_error','compliance_delivery')),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  admin_id uuid not null references public.profiles(id) on delete restrict,
  note text,
  acknowledged_at timestamptz not null default clock_timestamp(),
  snoozed_until timestamptz not null,
  check (snoozed_until > acknowledged_at),
  check (note is null or length(note) <= 1000)
);
create index if not exists admin_operational_alert_ack_active_idx
  on public.admin_operational_alert_acknowledgements(source, booking_id, snoozed_until desc);
alter table public.admin_operational_alert_acknowledgements enable row level security;
revoke all on table public.admin_operational_alert_acknowledgements from anon, authenticated;
drop trigger if exists admin_operational_alert_ack_append_only on public.admin_operational_alert_acknowledgements;
create trigger admin_operational_alert_ack_append_only
before update or delete on public.admin_operational_alert_acknowledgements
for each row execute function public.forbid_change();

create or replace function public.admin_claim_review_case(
  p_case_id uuid,
  p_lease_minutes int default 20
) returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid := auth.uid();
  c public.admin_review_cases%rowtype;
  now_at timestamptz := clock_timestamp();
begin
  perform private.smart_parrot_require_admin(uid);
  if p_case_id is null or p_lease_minutes is null or p_lease_minutes < 5 or p_lease_minutes > 120 then
    raise exception 'invalid_admin_case_claim' using errcode='22023';
  end if;
  select * into c from public.admin_review_cases where id=p_case_id for update;
  if not found then raise exception 'admin_review_case_not_found' using errcode='P0002'; end if;
  if c.status='resolved' then raise exception 'admin_review_case_resolved' using errcode='55000'; end if;
  if c.claimed_by is not null and c.claim_expires_at > now_at and c.claimed_by <> uid then
    raise exception 'admin_review_case_claimed' using errcode='55P03';
  end if;
  update public.admin_review_cases
  set status='in_review', claimed_by=uid, claimed_at=now_at,
      claim_expires_at=now_at + make_interval(mins=>p_lease_minutes)
  where id=c.id;
  insert into public.admin_review_case_events(case_id,admin_id,action,details)
  values (c.id,uid,'claimed',jsonb_build_object('lease_minutes',p_lease_minutes,'reclaimed_stale',c.claim_expires_at is not null and c.claim_expires_at <= now_at));
  return true;
end;
$$;

create or replace function public.admin_add_review_note(
  p_case_id uuid,
  p_note text
) returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid := auth.uid();
  clean_note text := nullif(trim(coalesce(p_note,'')),'');
begin
  perform private.smart_parrot_require_admin(uid);
  if p_case_id is null or clean_note is null or length(clean_note) > 2000 then
    raise exception 'invalid_admin_case_note' using errcode='22023';
  end if;
  if not exists (select 1 from public.admin_review_cases where id=p_case_id) then
    raise exception 'admin_review_case_not_found' using errcode='P0002';
  end if;
  insert into public.admin_review_case_events(case_id,admin_id,action,details)
  values (p_case_id,uid,'note',jsonb_build_object('note',clean_note));
  return true;
end;
$$;

create or replace function public.admin_acknowledge_alert(
  p_source text,
  p_booking_id uuid,
  p_snooze_minutes int default 30,
  p_note text default null
) returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid := auth.uid();
  clean_note text := nullif(trim(coalesce(p_note,'')),'');
  now_at timestamptz := clock_timestamp();
begin
  perform private.smart_parrot_require_admin(uid);
  if p_source is null or p_source not in ('payment_hold','settlement_error','cancellation_error','compliance_delivery')
     or p_booking_id is null or p_snooze_minutes is null or p_snooze_minutes < 5 or p_snooze_minutes > 240
     or (clean_note is not null and length(clean_note)>1000) then
    raise exception 'invalid_admin_alert_acknowledgement' using errcode='22023';
  end if;
  if not exists (select 1 from public.bookings where id=p_booking_id) then
    raise exception 'booking_not_found' using errcode='P0002';
  end if;
  insert into public.admin_operational_alert_acknowledgements(source,booking_id,admin_id,note,acknowledged_at,snoozed_until)
  values (p_source,p_booking_id,uid,clean_note,now_at,now_at+make_interval(mins=>p_snooze_minutes));
  return true;
end;
$$;

create or replace function public.record_stripe_dispute_event(
  p_provider_event_id text,
  p_dispute_id text,
  p_event_type text,
  p_dispute_status text,
  p_reason text,
  p_amount_cents int,
  p_currency text,
  p_payment_intent_id text,
  p_charge_id text,
  p_evidence_due_at timestamptz,
  p_event_created_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  booking_uuid uuid;
  case_uuid uuid;
  inserted_event text;
  priority_value text := 'high';
  clean_reason text := left(trim(coalesce(p_reason,'')),120);
  existing public.stripe_dispute_events%rowtype;
begin
  if p_provider_event_id is null or p_provider_event_id not like 'evt_%'
     or p_dispute_id is null or p_dispute_id not like 'du_%'
     or p_event_type not in ('charge.dispute.created','charge.dispute.updated','charge.dispute.closed')
     or p_dispute_status not in ('warning_needs_response','warning_under_review','warning_closed','needs_response','under_review','won','lost','prevented')
     or clean_reason='' or p_amount_cents is null or p_amount_cents<0
     or p_currency is null or lower(p_currency)!~'^[a-z]{3}$' or p_event_created_at is null then
    raise exception 'invalid_stripe_dispute_event' using errcode='22023';
  end if;

  if p_payment_intent_id is not null then
    select b.id into booking_uuid from public.bookings b
    where b.stripe_payment_intent_id=p_payment_intent_id limit 1;
  end if;
  if booking_uuid is null and p_payment_intent_id is not null then
    select l.booking_id into booking_uuid from public.ledger_entries l
    where l.stripe_object_id=p_payment_intent_id order by l.id desc limit 1;
  end if;
  if booking_uuid is null and p_charge_id is not null then
    select l.booking_id into booking_uuid from public.ledger_entries l
    where l.stripe_object_id=p_charge_id order by l.id desc limit 1;
  end if;

  insert into public.stripe_dispute_events(
    provider_event_id,dispute_id,booking_id,event_type,dispute_status,reason,amount_cents,currency,
    stripe_payment_intent_id,stripe_charge_id,evidence_due_at,event_created_at
  ) values (
    p_provider_event_id,p_dispute_id,booking_uuid,p_event_type,p_dispute_status,clean_reason,p_amount_cents,lower(p_currency),
    nullif(p_payment_intent_id,''),nullif(p_charge_id,''),p_evidence_due_at,p_event_created_at
  ) on conflict (provider_event_id) do nothing
  returning provider_event_id into inserted_event;

  if inserted_event is null then
    select * into existing from public.stripe_dispute_events where provider_event_id=p_provider_event_id;
    select c.id into case_uuid from public.admin_review_cases c
      where c.booking_id=existing.booking_id and c.kind='dispute' and c.status in ('open','in_review')
      order by c.opened_at limit 1;
    return jsonb_build_object('received',true,'replay',true,'booking_id',existing.booking_id,'review_case_id',case_uuid);
  end if;

  if booking_uuid is null then
    return jsonb_build_object('received',true,'replay',false,'booking_id',null,'review_case_id',null,'correlation','unmatched');
  end if;

  if p_dispute_status in ('needs_response','warning_needs_response')
     and p_evidence_due_at is not null and p_evidence_due_at <= clock_timestamp()+interval '48 hours' then
    priority_value := 'urgent';
  end if;

  select c.id into case_uuid from public.admin_review_cases c
  where c.booking_id=booking_uuid and c.kind='dispute' and c.status in ('open','in_review')
  order by c.opened_at limit 1;

  if case_uuid is null then
    begin
      insert into public.admin_review_cases(booking_id,kind,status,priority,reason,opened_by,opened_source)
      values (booking_uuid,'dispute','open',priority_value,
        left('Stripe test dispute '||p_dispute_id||' status '||p_dispute_status||' reason '||clean_reason,1000),
        null,'stripe_webhook') returning id into case_uuid;
      insert into public.admin_review_case_events(case_id,admin_id,actor_source,action,details)
      values (case_uuid,null,'stripe_webhook','opened',jsonb_build_object(
        'provider_event_id',p_provider_event_id,'dispute_id',p_dispute_id,'status',p_dispute_status,'reason',clean_reason,
        'evidence_due_at',p_evidence_due_at));
    exception when unique_violation then
      select c.id into case_uuid from public.admin_review_cases c
      where c.booking_id=booking_uuid and c.kind='dispute' and c.status in ('open','in_review')
      order by c.opened_at limit 1;
    end;
  else
    insert into public.admin_review_case_events(case_id,admin_id,actor_source,action,details)
    values (case_uuid,null,'stripe_webhook','note',jsonb_build_object(
      'provider_event_id',p_provider_event_id,'dispute_id',p_dispute_id,'event_type',p_event_type,
      'status',p_dispute_status,'reason',clean_reason,'evidence_due_at',p_evidence_due_at));
  end if;

  if p_event_type='charge.dispute.created' then
    insert into public.ledger_entries(booking_id,kind,amount_cents,currency,stripe_object_id,note)
    values (booking_uuid,'dispute_opened',p_amount_cents,lower(p_currency),p_dispute_id,'Stripe test dispute opened: '||clean_reason)
    on conflict do nothing;
  elsif p_event_type='charge.dispute.closed' then
    insert into public.ledger_entries(booking_id,kind,amount_cents,currency,stripe_object_id,note)
    values (booking_uuid,'dispute_closed',p_amount_cents,lower(p_currency),p_dispute_id,'Stripe test dispute closed with status '||p_dispute_status)
    on conflict do nothing;
  end if;

  return jsonb_build_object('received',true,'replay',false,'booking_id',booking_uuid,'review_case_id',case_uuid,'correlation','matched');
end;
$$;

-- Rebuild the queue with acknowledgement snoozing and unmatched dispute alerts.
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
set search_path=''
as $$
declare uid uuid := auth.uid();
begin
  perform private.smart_parrot_require_admin(uid);
  if p_limit is null or p_limit<1 or p_limit>100 or p_now is null then
    raise exception 'invalid_admin_review_queue_request' using errcode='22023';
  end if;
  return query
  with items as (
    select 'manual_case'::text s,c.id cid,c.booking_id bid,c.kind cat,c.priority sev,
      left(c.reason,500) summary,c.opened_at happened
    from public.admin_review_cases c where c.status in ('open','in_review')
    union all
    select 'payment_hold',null::uuid,b.id,'payment',case when b.starts_at<=p_now+interval '12 hours' then 'urgent' else 'high' end,
      'Payment hold failed before lesson',coalesce(b.hold_due_at,b.created_at)
    from public.bookings b where b.status='hold_failed' and b.starts_at>=p_now-interval '1 day' and b.starts_at<=p_now+interval '48 hours'
    union all
    select 'settlement_error',null::uuid,b.id,'payment',
      case when b.settlement_attempts>=6 or b.settlement_last_error_at<=p_now-interval '6 hours' then 'urgent' else 'high' end,
      'Settlement requires operator review',b.settlement_last_error_at
    from public.bookings b where b.settlement_last_error_at is not null and b.status='awaiting_settlement'
    union all
    select 'cancellation_error',null::uuid,b.id,'cancellation',
      case when b.cancellation_attempts>=6 or b.cancellation_last_error_at<=p_now-interval '6 hours' then 'urgent' else 'high' end,
      'Cancellation payment/finalization requires operator review',b.cancellation_last_error_at
    from public.bookings b where b.cancellation_last_error_at is not null and b.cancellation_requested_at is not null and b.status<>'cancelled'
    union all
    select 'compliance_delivery',null::uuid,o.booking_id,'compliance',
      case when o.dead_lettered_at is not null or o.queued_at<=p_now-interval '48 hours' then 'urgent' else 'high' end,
      case when o.dead_lettered_at is not null then 'Compliance acknowledgement delivery dead-lettered' else 'Compliance acknowledgement delivery overdue' end,
      coalesce(o.dead_lettered_at,o.last_attempt_at,o.queued_at)
    from public.compliance_notice_outbox o
    where o.delivered_at is null and (o.dead_lettered_at is not null or o.queued_at<=p_now-interval '24 hours')
    union all
    select 'stripe_dispute_unmatched',null::uuid,null::uuid,'dispute','urgent',
      left('Unmatched Stripe test dispute '||d.dispute_id||' ('||d.dispute_status||')',500),d.received_at
    from public.stripe_dispute_events d
    where d.booking_id is null
      and not exists (select 1 from public.stripe_dispute_events newer where newer.dispute_id=d.dispute_id and newer.received_at>d.received_at)
  )
  select i.s,i.cid,i.bid,i.cat,i.sev,i.summary,i.happened
  from items i
  where i.s='manual_case' or i.bid is null or not exists (
    select 1 from public.admin_operational_alert_acknowledgements a
    where a.source=i.s and a.booking_id=i.bid and a.snoozed_until>p_now
  )
  order by case i.sev when 'urgent' then 0 when 'high' then 1 else 2 end,
    i.happened nulls first,i.bid
  limit p_limit;
end;
$$;

create or replace function public.admin_data_subject_inventory(p_subject_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  uid uuid := auth.uid();
  booking_count int;
  consent_count int;
  student_attendance_count int;
  cancellation_count int;
  compliance_count int;
begin
  perform private.smart_parrot_require_admin(uid);
  if p_subject_id is null or not exists (select 1 from public.profiles where id=p_subject_id) then
    raise exception 'data_subject_not_found' using errcode='P0002';
  end if;
  select count(*) into booking_count from public.bookings where student_id=p_subject_id;
  select count(*) into consent_count from public.consents where user_id=p_subject_id;
  select count(*) into student_attendance_count from public.attendance_events e
    join public.bookings b on b.id=e.booking_id where b.student_id=p_subject_id and e.actor='student';
  select count(*) into cancellation_count from public.booking_cancellation_requests where requested_by=p_subject_id;
  select count(*) into compliance_count from public.compliance_notice_outbox where user_id=p_subject_id;
  return jsonb_build_object(
    'schema_version','smart_parrot_dsar_inventory_v1','subject_id',p_subject_id,'generated_at',clock_timestamp(),
    'counts',jsonb_build_object('bookings',booking_count,'consents',consent_count,'student_attendance_events',student_attendance_count,
      'cancellation_or_withdrawal_requests',cancellation_count,'compliance_notices',compliance_count),
    'boundaries',jsonb_build_array(
      'Inventory only: this RPC does not erase, rectify, or disclose third-party personal data',
      'Raw provider webhook payloads, IP addresses, user agents, secrets, and tutor attendance are excluded',
      'Retention or erasure decisions require purpose/legal-basis review before mutation',
      'Evidence needed for an active dispute or legal claim must not be automatically deleted'
    )
  );
end;
$$;

revoke all on function public.admin_claim_review_case(uuid,int) from public,anon,authenticated;
revoke all on function public.admin_add_review_note(uuid,text) from public,anon,authenticated;
revoke all on function public.admin_acknowledge_alert(text,uuid,int,text) from public,anon,authenticated;
revoke all on function public.admin_data_subject_inventory(uuid) from public,anon,authenticated;
revoke all on function public.record_stripe_dispute_event(text,text,text,text,text,int,text,text,text,timestamptz,timestamptz) from public,anon,authenticated;

grant execute on function public.admin_claim_review_case(uuid,int) to authenticated;
grant execute on function public.admin_add_review_note(uuid,text) to authenticated;
grant execute on function public.admin_acknowledge_alert(text,uuid,int,text) to authenticated;
grant execute on function public.admin_data_subject_inventory(uuid) to authenticated;
grant execute on function public.record_stripe_dispute_event(text,text,text,text,text,int,text,text,text,timestamptz,timestamptz) to service_role;

comment on table public.stripe_dispute_events is
  'Append-only, minimized Stripe test dispute intake. Stores correlation/status fields only; never raw webhook payload or submitted evidence.';
comment on function public.record_stripe_dispute_event(text,text,text,text,text,int,text,text,text,timestamptz,timestamptz) is
  'Service-only idempotent dispute intake. Opens/notes an internal review case but never submits, accepts, updates, or closes a Stripe dispute.';
comment on function public.admin_data_subject_inventory(uuid) is
  'Admin-only DSAR triage inventory. It is intentionally not an erasure action or a complete Article 15 disclosure packet.';
