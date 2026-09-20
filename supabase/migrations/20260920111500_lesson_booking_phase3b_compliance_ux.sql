-- Phase 3B: cancellation/withdrawal UX support and durable-medium delivery contract.
-- Browser-facing functions expose only participant-safe quote/status data. Delivery
-- worker functions remain service-role-only and do not send any production email.

alter table public.booking_cancellation_requests
  add column if not exists declaration_name text,
  add column if not exists declaration_contact text;

alter table public.compliance_notice_outbox
  add column if not exists last_attempt_at timestamptz,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists locked_until timestamptz,
  add column if not exists dead_lettered_at timestamptz;

update public.compliance_notice_outbox
set next_attempt_at = queued_at
where next_attempt_at is null and delivered_at is null;

create index if not exists compliance_notice_delivery_due_idx
  on public.compliance_notice_outbox (next_attempt_at, queued_at)
  where delivered_at is null and dead_lettered_at is null;

create or replace function private.smart_parrot_booking_action_preview(
  p_actor_id uuid,
  p_booking_id uuid,
  p_now timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings%rowtype;
  p public.policy_versions%rowtype;
  actor text;
  now_at timestamptz := coalesce(p_now, clock_timestamp());
  free_h int;
  late_h int;
  late_pct numeric;
  withdrawal_days int;
  cancel_eligible boolean := false;
  cancel_reason text := null;
  cancel_outcome public.lesson_outcome := null;
  cancel_amount int := null;
  withdrawal_eligible boolean := false;
  withdrawal_reason text := null;
  base_reason text := null;
begin
  if p_actor_id is null or p_booking_id is null then
    raise exception 'authenticated_user_required' using errcode = '42501';
  end if;

  select * into b from public.bookings where id = p_booking_id;
  if not found or (p_actor_id <> b.student_id and p_actor_id <> b.tutor_id) then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;

  actor := case when p_actor_id = b.student_id then 'student' else 'tutor' end;
  select * into p from public.policy_versions where id = b.policy_version_id;
  if not found then
    raise exception 'booking_policy_not_found' using errcode = 'P0002';
  end if;

  if b.status = 'cancelled' then base_reason := 'already_cancelled';
  elsif b.cancellation_requested_at is not null then base_reason := 'cancellation_already_requested';
  elsif b.status in ('awaiting_settlement', 'settled') then base_reason := 'booking_not_cancellable';
  elsif now_at >= b.starts_at then base_reason := 'too_late_to_cancel';
  end if;

  if base_reason is not null then
    cancel_reason := base_reason;
  elsif actor = 'tutor' then
    cancel_eligible := true;
    cancel_outcome := 'cancelled_by_tutor';
    cancel_amount := 0;
  elsif b.status = 'pending_checkout' then
    cancel_eligible := true;
    cancel_outcome := 'cancelled_free';
    cancel_amount := 0;
  else
    begin
      free_h := (p.config->>'free_cancel_hours')::int;
      late_h := (p.config->>'late_cancel_hours')::int;
      late_pct := (p.config->>'late_cancel_pct')::numeric;
    exception when others then
      free_h := null; late_h := null; late_pct := null;
    end;

    if free_h is null or late_h is null or late_pct is null
       or free_h <= late_h or late_h < 0 or free_h > 720 or late_pct < 0 or late_pct > 100 then
      cancel_reason := 'policy_unavailable';
    elsif b.starts_at - now_at >= make_interval(hours => free_h) then
      cancel_eligible := true;
      cancel_outcome := 'cancelled_free';
      cancel_amount := 0;
    elsif b.starts_at - now_at >= make_interval(hours => late_h) then
      cancel_eligible := true;
      cancel_outcome := 'cancelled_late';
      cancel_amount := round(b.max_charge_cents * late_pct / 100.0)::int;
    else
      cancel_eligible := true;
      cancel_outcome := 'cancelled_very_late';
      cancel_amount := b.max_charge_cents;
    end if;
  end if;

  if actor <> 'student' then
    withdrawal_reason := 'student_only';
  elsif base_reason is not null then
    withdrawal_reason := base_reason;
  elsif coalesce(p.config->>'withdrawal_mode', 'review_required') <> 'service_14d' then
    withdrawal_reason := 'not_enabled_for_policy';
  else
    begin
      withdrawal_days := coalesce((p.config->>'withdrawal_window_days')::int, 14);
    exception when others then
      withdrawal_days := null;
    end;

    if withdrawal_days is null or withdrawal_days < 1 or withdrawal_days > 30 then
      withdrawal_reason := 'policy_unavailable';
    elsif now_at >= b.created_at + make_interval(days => withdrawal_days) then
      withdrawal_reason := 'window_expired';
    else
      withdrawal_eligible := true;
    end if;
  end if;

  return jsonb_build_object(
    'booking_id', b.id,
    'status', b.status,
    'starts_at', b.starts_at,
    'ends_at', b.ends_at,
    'currency', b.currency,
    'policy_version_id', p.id,
    'terms_sha256', p.terms_sha256,
    'cancellation', jsonb_build_object(
      'eligible', cancel_eligible,
      'reason', cancel_reason,
      'outcome', cancel_outcome,
      'amount_cents', cancel_amount
    ),
    'withdrawal', jsonb_build_object(
      'eligible', withdrawal_eligible,
      'reason', withdrawal_reason,
      'outcome', case when withdrawal_eligible then 'cancelled_free' else null end,
      'amount_cents', case when withdrawal_eligible then 0 else null end,
      'declaration_required', withdrawal_eligible
    )
  );
end;
$$;

revoke all on function private.smart_parrot_booking_action_preview(uuid, uuid, timestamptz)
  from public, anon, authenticated;

create or replace function public.preview_booking_actions(p_booking_id uuid)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select private.smart_parrot_booking_action_preview(auth.uid(), p_booking_id, clock_timestamp());
$$;

revoke all on function public.preview_booking_actions(uuid) from public, anon, authenticated;
grant execute on function public.preview_booking_actions(uuid) to authenticated;

-- Withdrawal declarations must preserve the information used for the online
-- declaration/acknowledgement flow. Monetary/timing decisions remain server-owned.
drop function if exists public.prepare_booking_cancellation(uuid, uuid, text, timestamptz, text, text);
create or replace function public.prepare_booking_cancellation(
  p_actor_id uuid,
  p_booking_id uuid,
  p_kind text,
  p_now timestamptz default clock_timestamp(),
  p_ip text default null,
  p_user_agent text default null,
  p_declaration_name text default null,
  p_declaration_contact text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings%rowtype;
  p public.policy_versions%rowtype;
  r public.booking_cancellation_requests%rowtype;
  actor text;
  free_h int;
  late_h int;
  late_pct numeric;
  withdrawal_mode text;
  withdrawal_days int;
  result_outcome public.lesson_outcome;
  amount int;
  action text;
  parsed_ip inet;
  now_at timestamptz := coalesce(p_now, clock_timestamp());
  declaration_name text := nullif(trim(coalesce(p_declaration_name, '')), '');
  declaration_contact text := nullif(lower(trim(coalesce(p_declaration_contact, ''))), '');
begin
  if p_actor_id is null or p_booking_id is null or p_kind is null or p_kind not in ('cancel','withdrawal') then
    raise exception 'invalid_cancellation_request' using errcode='22023';
  end if;

  select * into b from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'booking_not_found' using errcode='P0002'; end if;
  if p_actor_id=b.student_id then actor:='student';
  elsif p_actor_id=b.tutor_id then actor:='tutor';
  else raise exception 'booking_not_found' using errcode='P0002'; end if;

  select * into r from public.booking_cancellation_requests where booking_id=b.id;
  if b.status='cancelled' then
    if found and r.requested_by=p_actor_id and r.kind=p_kind then return private.smart_parrot_cancellation_payload(b,r,true); end if;
    raise exception 'booking_already_cancelled' using errcode='55000';
  end if;
  if b.cancellation_requested_at is not null then
    if found and r.requested_by=p_actor_id and r.kind=p_kind then return private.smart_parrot_cancellation_payload(b,r,true); end if;
    raise exception 'cancellation_already_requested' using errcode='55000';
  end if;
  if b.status in ('awaiting_settlement','settled') then raise exception 'booking_not_cancellable' using errcode='55000'; end if;
  if now_at>=b.starts_at then raise exception 'too_late_to_cancel' using errcode='55000'; end if;
  if p_kind='withdrawal' and actor<>'student' then raise exception 'withdrawal_student_only' using errcode='42501'; end if;

  select * into p from public.policy_versions where id=b.policy_version_id;
  if not found then raise exception 'booking_policy_not_found' using errcode='P0002'; end if;

  if p_kind='withdrawal' then
    if declaration_name is null or length(declaration_name) > 200
       or declaration_contact is null or length(declaration_contact) > 320
       or declaration_contact !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      raise exception 'withdrawal_declaration_incomplete' using errcode='22023';
    end if;
    withdrawal_mode:=coalesce(p.config->>'withdrawal_mode','review_required');
    if withdrawal_mode<>'service_14d' then raise exception 'withdrawal_not_enabled_for_policy' using errcode='55000'; end if;
    begin withdrawal_days:=coalesce((p.config->>'withdrawal_window_days')::int,14);
    exception when others then raise exception 'invalid_withdrawal_policy' using errcode='22023'; end;
    if withdrawal_days<1 or withdrawal_days>30 then raise exception 'invalid_withdrawal_policy' using errcode='22023'; end if;
    if now_at>=b.created_at+make_interval(days=>withdrawal_days) then raise exception 'withdrawal_window_expired' using errcode='55000'; end if;
    result_outcome:='cancelled_free'; amount:=0;
  elsif actor='tutor' then result_outcome:='cancelled_by_tutor'; amount:=0;
  elsif b.status='pending_checkout' then result_outcome:='cancelled_free'; amount:=0;
  else
    begin
      free_h:=(p.config->>'free_cancel_hours')::int;
      late_h:=(p.config->>'late_cancel_hours')::int;
      late_pct:=(p.config->>'late_cancel_pct')::numeric;
    exception when others then raise exception 'invalid_cancellation_policy' using errcode='22023'; end;
    if free_h is null or late_h is null or late_pct is null or free_h<=late_h or late_h<0 or free_h>720 or late_pct<0 or late_pct>100 then
      raise exception 'invalid_cancellation_policy' using errcode='22023';
    end if;
    if b.starts_at-now_at>=make_interval(hours=>free_h) then result_outcome:='cancelled_free'; amount:=0;
    elsif b.starts_at-now_at>=make_interval(hours=>late_h) then result_outcome:='cancelled_late'; amount:=round(b.max_charge_cents*late_pct/100.0)::int;
    else result_outcome:='cancelled_very_late'; amount:=b.max_charge_cents; end if;
  end if;

  if amount>0 then
    if b.status<>'hold_placed' or b.stripe_payment_intent_id is null then raise exception 'cancellation_payment_not_ready' using errcode='55000'; end if;
    action:='capture';
  elsif b.status='hold_placed' and b.stripe_payment_intent_id is not null then action:='release';
  else
    if b.status='card_saved' and b.hold_due_at is not null and b.hold_due_at<=now_at then raise exception 'cancellation_payment_state_sync_required' using errcode='55000'; end if;
    action:='none';
  end if;

  if p_ip is not null and length(p_ip)<=64 and p_ip~'^[0-9A-Fa-f:.]+$' then
    begin parsed_ip:=p_ip::inet; exception when invalid_text_representation then parsed_ip:=null; end;
  end if;

  insert into public.booking_cancellation_requests(
    booking_id,requested_by,actor_role,kind,requested_at,policy_version_id,terms_sha256,outcome,amount_cents,payment_action,
    request_ip,user_agent,declaration_name,declaration_contact
  ) values (
    b.id,p_actor_id,actor,p_kind,now_at,p.id,p.terms_sha256,result_outcome,amount,action,
    parsed_ip,left(nullif(p_user_agent,''),1000),declaration_name,declaration_contact
  ) returning * into r;

  update public.bookings set cancellation_requested_at=now_at,cancellation_request_kind=p_kind,
    cancellation_requested_by=p_actor_id,cancellation_attempts=cancellation_attempts+1,
    cancellation_last_error_code=null,cancellation_last_error_at=null
  where id=b.id returning * into b;
  return private.smart_parrot_cancellation_payload(b,r,false);
end;
$$;

revoke all on function public.prepare_booking_cancellation(uuid,uuid,text,timestamptz,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.prepare_booking_cancellation(uuid,uuid,text,timestamptz,text,text,text,text)
  to service_role;

create or replace function private.enrich_compliance_notice_payload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.booking_cancellation_requests%rowtype;
begin
  if new.kind = 'withdrawal_acknowledgement' then
    select * into r from public.booking_cancellation_requests where booking_id = new.booking_id;
    if found then
      new.payload := new.payload || jsonb_build_object(
        'declaration_name', r.declaration_name,
        'declaration_contact', r.declaration_contact
      );
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function private.enrich_compliance_notice_payload() from public, anon, authenticated;
drop trigger if exists compliance_notice_payload_enrichment on public.compliance_notice_outbox;
create trigger compliance_notice_payload_enrichment
before insert on public.compliance_notice_outbox
for each row execute function private.enrich_compliance_notice_payload();

create or replace function public.booking_compliance_status(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  b public.bookings%rowtype;
  n public.compliance_notice_outbox%rowtype;
  state text;
begin
  if uid is null or p_booking_id is null then raise exception 'authenticated_user_required' using errcode='42501'; end if;
  select * into b from public.bookings where id=p_booking_id and student_id=uid;
  if not found then raise exception 'booking_not_found' using errcode='P0002'; end if;
  select * into n from public.compliance_notice_outbox where booking_id=b.id order by queued_at desc limit 1;
  if not found then return jsonb_build_object('booking_id',b.id,'state','not_queued'); end if;
  state := case
    when n.delivered_at is not null then 'delivered'
    when n.dead_lettered_at is not null then 'needs_attention'
    when n.delivery_attempts > 0 then 'retrying'
    else 'queued'
  end;
  return jsonb_build_object(
    'booking_id', b.id,
    'kind', n.kind,
    'state', state,
    'queued_at', n.queued_at,
    'delivered_at', n.delivered_at,
    'delivery_attempts', n.delivery_attempts
  );
end;
$$;

revoke all on function public.booking_compliance_status(uuid) from public, anon, authenticated;
grant execute on function public.booking_compliance_status(uuid) to authenticated;

create or replace function public.claim_compliance_notices(
  p_limit int default 25,
  p_now timestamptz default clock_timestamp()
) returns table(
  notice_id uuid,
  booking_id uuid,
  user_id uuid,
  kind text,
  payload jsonb,
  delivery_attempt int
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_now is null then
    raise exception 'invalid_compliance_claim_request' using errcode='22023';
  end if;
  return query
  with candidates as (
    select o.id
    from public.compliance_notice_outbox o
    where o.delivered_at is null
      and o.dead_lettered_at is null
      and coalesce(o.next_attempt_at, o.queued_at) <= p_now
      and (o.locked_until is null or o.locked_until <= p_now)
    order by o.queued_at, o.id
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.compliance_notice_outbox o
    set delivery_attempts = o.delivery_attempts + 1,
        last_attempt_at = p_now,
        locked_until = p_now + interval '10 minutes',
        last_error_code = null
    from candidates c
    where o.id = c.id
    returning o.*
  )
  select c.id, c.booking_id, c.user_id, c.kind, c.payload, c.delivery_attempts
  from claimed c
  order by c.queued_at, c.id;
end;
$$;

create or replace function public.complete_compliance_notice_delivery(
  p_notice_id uuid,
  p_delivery_attempt int,
  p_provider_message_id text,
  p_now timestamptz default clock_timestamp()
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_notice_id is null or p_delivery_attempt is null or p_delivery_attempt < 1
     or nullif(trim(p_provider_message_id),'') is null or p_now is null then
    raise exception 'invalid_compliance_delivery_completion' using errcode='22023';
  end if;
  update public.compliance_notice_outbox
  set delivered_at=p_now,
      provider_message_id=left(trim(p_provider_message_id),500),
      locked_until=null,
      next_attempt_at=null,
      last_error_code=null
  where id=p_notice_id and delivered_at is null and dead_lettered_at is null
    and delivery_attempts=p_delivery_attempt;
  return found;
end;
$$;

create or replace function public.fail_compliance_notice_delivery(
  p_notice_id uuid,
  p_delivery_attempt int,
  p_error_code text,
  p_now timestamptz default clock_timestamp()
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n public.compliance_notice_outbox%rowtype;
  retry_seconds int;
begin
  if p_notice_id is null or p_delivery_attempt is null or p_delivery_attempt < 1
     or nullif(trim(p_error_code),'') is null or p_now is null then
    raise exception 'invalid_compliance_delivery_failure' using errcode='22023';
  end if;
  select * into n from public.compliance_notice_outbox where id=p_notice_id for update;
  if not found then raise exception 'compliance_notice_not_found' using errcode='P0002'; end if;
  if n.delivered_at is not null then return jsonb_build_object('state','delivered','delivery_attempts',n.delivery_attempts); end if;
  if n.delivery_attempts <> p_delivery_attempt then raise exception 'stale_compliance_delivery_attempt' using errcode='40001'; end if;

  if n.delivery_attempts >= 6 then
    update public.compliance_notice_outbox
    set dead_lettered_at=p_now, locked_until=null, next_attempt_at=null,
        last_error_code=left(trim(p_error_code),120)
    where id=n.id;
    return jsonb_build_object('state','needs_attention','delivery_attempts',n.delivery_attempts);
  end if;

  retry_seconds := case n.delivery_attempts
    when 1 then 300
    when 2 then 900
    when 3 then 3600
    when 4 then 21600
    else 43200
  end;
  update public.compliance_notice_outbox
  set locked_until=null,
      next_attempt_at=p_now+make_interval(secs=>retry_seconds),
      last_error_code=left(trim(p_error_code),120)
  where id=n.id;
  return jsonb_build_object(
    'state','retrying',
    'delivery_attempts',n.delivery_attempts,
    'next_attempt_at',p_now+make_interval(secs=>retry_seconds)
  );
end;
$$;

create or replace function public.list_compliance_delivery_alerts(
  p_limit int default 50,
  p_now timestamptz default clock_timestamp()
) returns table(
  notice_id uuid,
  booking_id uuid,
  kind text,
  queued_at timestamptz,
  delivery_attempts int,
  state text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_now is null then
    raise exception 'invalid_compliance_alert_request' using errcode='22023';
  end if;
  return query
  select o.id, o.booking_id, o.kind, o.queued_at, o.delivery_attempts,
    case when o.dead_lettered_at is not null then 'dead_letter' else 'overdue' end
  from public.compliance_notice_outbox o
  where o.delivered_at is null
    and (o.dead_lettered_at is not null or o.queued_at <= p_now - interval '24 hours')
  order by coalesce(o.dead_lettered_at, o.queued_at), o.id
  limit p_limit;
end;
$$;

revoke all on function public.claim_compliance_notices(int,timestamptz) from public,anon,authenticated;
revoke all on function public.complete_compliance_notice_delivery(uuid,int,text,timestamptz) from public,anon,authenticated;
revoke all on function public.fail_compliance_notice_delivery(uuid,int,text,timestamptz) from public,anon,authenticated;
revoke all on function public.list_compliance_delivery_alerts(int,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_compliance_notices(int,timestamptz) to service_role;
grant execute on function public.complete_compliance_notice_delivery(uuid,int,text,timestamptz) to service_role;
grant execute on function public.fail_compliance_notice_delivery(uuid,int,text,timestamptz) to service_role;
grant execute on function public.list_compliance_delivery_alerts(int,timestamptz) to service_role;

comment on function public.preview_booking_actions(uuid) is
  'Authenticated, server-timestamped cancellation/withdrawal quote. Browser must not compute fees or withdrawal eligibility.';
comment on function public.booking_compliance_status(uuid) is
  'Student-safe acknowledgement status; never exposes provider message IDs or delivery error codes.';
comment on function public.claim_compliance_notices(int,timestamptz) is
  'Service-only durable-medium delivery claim contract with a 10-minute lease.';
