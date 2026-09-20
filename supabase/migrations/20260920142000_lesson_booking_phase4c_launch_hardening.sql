-- Smart Parrot Institute lesson-booking Phase 4C
-- Launch hardening: provider-refreshed Stripe dispute projection + operator health.
-- The append-only webhook event stream remains evidence; mutable "current state" is
-- derived only from a fresh test-mode Stripe API read, never from browser state
-- or webhook delivery order.

create table if not exists public.stripe_dispute_current_state (
  dispute_id text primary key,
  booking_id uuid references public.bookings(id) on delete restrict,
  current_status text not null check (current_status in (
    'warning_needs_response','warning_under_review','warning_closed',
    'needs_response','under_review','won','lost','prevented'
  )),
  reason text not null,
  amount_cents int not null check (amount_cents >= 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  stripe_payment_intent_id text,
  stripe_charge_id text,
  evidence_due_at timestamptz,
  provider_snapshot_fetched_at timestamptz not null,
  latest_source_event_id text not null,
  first_seen_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  needs_reconciliation boolean not null default false,
  check (dispute_id like 'du_%'),
  check (latest_source_event_id like 'evt_%')
);

create index if not exists stripe_dispute_current_state_booking_idx
  on public.stripe_dispute_current_state(booking_id, updated_at desc)
  where booking_id is not null;

create index if not exists stripe_dispute_current_state_attention_idx
  on public.stripe_dispute_current_state(needs_reconciliation, updated_at desc)
  where needs_reconciliation;

alter table public.stripe_dispute_current_state enable row level security;
revoke all on table public.stripe_dispute_current_state from anon, authenticated;

create or replace function private.smart_parrot_dispute_status_is_terminal(p_status text)
returns boolean
language sql
immutable
security invoker
set search_path=''
as $$
  select p_status in ('warning_closed','won','lost','prevented');
$$;

revoke all on function private.smart_parrot_dispute_status_is_terminal(text)
  from public, anon, authenticated;

-- Phase 4B's event-only intake is intentionally no longer executable by the
-- service role. The v2 function below requires a freshly retrieved provider
-- snapshot so an out-of-order webhook cannot become current state by itself.
revoke execute on function public.record_stripe_dispute_event(
  text,text,text,text,text,int,text,text,text,timestamptz,timestamptz
) from service_role;

create or replace function public.record_stripe_dispute_event_v2(
  p_provider_event_id text,
  p_dispute_id text,
  p_event_type text,
  p_event_dispute_status text,
  p_event_reason text,
  p_event_amount_cents int,
  p_event_currency text,
  p_event_payment_intent_id text,
  p_event_charge_id text,
  p_event_evidence_due_at timestamptz,
  p_event_created_at timestamptz,
  p_current_dispute_status text,
  p_current_reason text,
  p_current_amount_cents int,
  p_current_currency text,
  p_current_payment_intent_id text,
  p_current_charge_id text,
  p_current_evidence_due_at timestamptz,
  p_provider_snapshot_fetched_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  booking_uuid uuid;
  correlated_uuid uuid;
  case_uuid uuid;
  inserted_event text;
  replay boolean := false;
  priority_value text := 'high';
  event_reason text := left(trim(coalesce(p_event_reason,'')),120);
  current_reason text := left(trim(coalesce(p_current_reason,'')),120);
  state_row public.stripe_dispute_current_state%rowtype;
  state_created boolean := false;
  projection_applied boolean := false;
  became_linked boolean := false;
  previous_status text;
  previous_booking uuid;
  reconciliation boolean := false;
begin
  if p_provider_event_id is null or p_provider_event_id not like 'evt_%'
     or p_dispute_id is null or p_dispute_id not like 'du_%'
     or p_event_type not in ('charge.dispute.created','charge.dispute.updated','charge.dispute.closed')
     or p_event_dispute_status not in (
       'warning_needs_response','warning_under_review','warning_closed',
       'needs_response','under_review','won','lost','prevented'
     )
     or p_current_dispute_status not in (
       'warning_needs_response','warning_under_review','warning_closed',
       'needs_response','under_review','won','lost','prevented'
     )
     or event_reason='' or current_reason=''
     or p_event_amount_cents is null or p_event_amount_cents<0
     or p_current_amount_cents is null or p_current_amount_cents<0
     or p_event_currency is null or lower(p_event_currency)!~'^[a-z]{3}$'
     or p_current_currency is null or lower(p_current_currency)!~'^[a-z]{3}$'
     or p_event_created_at is null or p_provider_snapshot_fetched_at is null then
    raise exception 'invalid_stripe_dispute_event_v2' using errcode='22023';
  end if;

  if nullif(p_current_payment_intent_id,'') is not null then
    select b.id into correlated_uuid from public.bookings b
    where b.stripe_payment_intent_id=p_current_payment_intent_id limit 1;
  end if;
  if correlated_uuid is null and nullif(p_current_payment_intent_id,'') is not null then
    select l.booking_id into correlated_uuid from public.ledger_entries l
    where l.stripe_object_id=p_current_payment_intent_id order by l.id desc limit 1;
  end if;
  if correlated_uuid is null and nullif(p_current_charge_id,'') is not null then
    select l.booking_id into correlated_uuid from public.ledger_entries l
    where l.stripe_object_id=p_current_charge_id order by l.id desc limit 1;
  end if;
  if correlated_uuid is null and nullif(p_event_payment_intent_id,'') is not null then
    select b.id into correlated_uuid from public.bookings b
    where b.stripe_payment_intent_id=p_event_payment_intent_id limit 1;
  end if;
  if correlated_uuid is null and nullif(p_event_payment_intent_id,'') is not null then
    select l.booking_id into correlated_uuid from public.ledger_entries l
    where l.stripe_object_id=p_event_payment_intent_id order by l.id desc limit 1;
  end if;
  if correlated_uuid is null and nullif(p_event_charge_id,'') is not null then
    select l.booking_id into correlated_uuid from public.ledger_entries l
    where l.stripe_object_id=p_event_charge_id order by l.id desc limit 1;
  end if;

  insert into public.stripe_dispute_events(
    provider_event_id,dispute_id,booking_id,event_type,dispute_status,reason,amount_cents,currency,
    stripe_payment_intent_id,stripe_charge_id,evidence_due_at,event_created_at
  ) values (
    p_provider_event_id,p_dispute_id,correlated_uuid,p_event_type,p_event_dispute_status,event_reason,
    p_event_amount_cents,lower(p_event_currency),nullif(p_event_payment_intent_id,''),
    nullif(p_event_charge_id,''),p_event_evidence_due_at,p_event_created_at
  ) on conflict (provider_event_id) do nothing
  returning provider_event_id into inserted_event;

  replay := inserted_event is null;

  select * into state_row from public.stripe_dispute_current_state
  where dispute_id=p_dispute_id for update;

  if not found then
    begin
      insert into public.stripe_dispute_current_state(
        dispute_id,booking_id,current_status,reason,amount_cents,currency,
        stripe_payment_intent_id,stripe_charge_id,evidence_due_at,
        provider_snapshot_fetched_at,latest_source_event_id,needs_reconciliation
      ) values (
        p_dispute_id,correlated_uuid,p_current_dispute_status,current_reason,p_current_amount_cents,
        lower(p_current_currency),nullif(p_current_payment_intent_id,''),nullif(p_current_charge_id,''),
        p_current_evidence_due_at,p_provider_snapshot_fetched_at,p_provider_event_id,false
      ) returning * into state_row;
      state_created := true;
      projection_applied := true;
      booking_uuid := correlated_uuid;
    exception when unique_violation then
      select * into state_row from public.stripe_dispute_current_state
      where dispute_id=p_dispute_id for update;
    end;
  end if;

  if not state_created then
    previous_status := state_row.current_status;
    previous_booking := state_row.booking_id;
    booking_uuid := coalesce(state_row.booking_id, correlated_uuid);

    if state_row.booking_id is not null and correlated_uuid is not null
       and state_row.booking_id <> correlated_uuid then
      reconciliation := true;
      booking_uuid := state_row.booking_id;
    end if;

    if p_provider_snapshot_fetched_at > state_row.provider_snapshot_fetched_at then
      if private.smart_parrot_dispute_status_is_terminal(state_row.current_status)
         and (not private.smart_parrot_dispute_status_is_terminal(p_current_dispute_status)
              or p_current_dispute_status <> state_row.current_status) then
        reconciliation := true;
        update public.stripe_dispute_current_state
        set latest_source_event_id=p_provider_event_id,
            updated_at=clock_timestamp(),
            needs_reconciliation=true
        where dispute_id=p_dispute_id returning * into state_row;
      else
        update public.stripe_dispute_current_state
        set booking_id=booking_uuid,
            current_status=p_current_dispute_status,
            reason=current_reason,
            amount_cents=p_current_amount_cents,
            currency=lower(p_current_currency),
            stripe_payment_intent_id=nullif(p_current_payment_intent_id,''),
            stripe_charge_id=nullif(p_current_charge_id,''),
            evidence_due_at=p_current_evidence_due_at,
            provider_snapshot_fetched_at=p_provider_snapshot_fetched_at,
            latest_source_event_id=p_provider_event_id,
            updated_at=clock_timestamp(),
            needs_reconciliation=reconciliation
        where dispute_id=p_dispute_id returning * into state_row;
        projection_applied := true;
      end if;
    elsif p_provider_snapshot_fetched_at = state_row.provider_snapshot_fetched_at
       and (p_current_dispute_status <> state_row.current_status
            or lower(p_current_currency) <> state_row.currency
            or p_current_amount_cents <> state_row.amount_cents) then
      reconciliation := true;
      update public.stripe_dispute_current_state
      set needs_reconciliation=true,updated_at=clock_timestamp()
      where dispute_id=p_dispute_id returning * into state_row;
    end if;

    became_linked := previous_booking is null and state_row.booking_id is not null;
    booking_uuid := state_row.booking_id;
  else
    became_linked := booking_uuid is not null;
  end if;

  if booking_uuid is null then
    return jsonb_build_object('received',true,'replay',replay,'booking_id',null,
      'review_case_id',null,'correlation','unmatched','current_status',state_row.current_status,
      'projection_applied',projection_applied,'needs_reconciliation',state_row.needs_reconciliation);
  end if;

  if state_row.current_status in ('needs_response','warning_needs_response')
     and state_row.evidence_due_at is not null
     and state_row.evidence_due_at <= clock_timestamp()+interval '48 hours' then
    priority_value := 'urgent';
  end if;
  if state_row.needs_reconciliation then priority_value := 'urgent'; end if;

  select c.id into case_uuid from public.admin_review_cases c
  where c.booking_id=booking_uuid and c.kind='dispute' and c.status in ('open','in_review')
  order by c.opened_at limit 1;

  if case_uuid is null then
    begin
      insert into public.admin_review_cases(booking_id,kind,status,priority,reason,opened_by,opened_source)
      values (booking_uuid,'dispute','open',priority_value,
        left('Stripe test dispute '||p_dispute_id||' current status '||state_row.current_status||
             ' reason '||state_row.reason,1000),null,'stripe_webhook') returning id into case_uuid;
      insert into public.admin_review_case_events(case_id,admin_id,actor_source,action,details)
      values (case_uuid,null,'stripe_webhook','opened',jsonb_build_object(
        'provider_event_id',p_provider_event_id,'dispute_id',p_dispute_id,
        'event_status',p_event_dispute_status,'current_status',state_row.current_status,
        'projection_applied',projection_applied,'needs_reconciliation',state_row.needs_reconciliation,
        'evidence_due_at',state_row.evidence_due_at));
    exception when unique_violation then
      select c.id into case_uuid from public.admin_review_cases c
      where c.booking_id=booking_uuid and c.kind='dispute' and c.status in ('open','in_review')
      order by c.opened_at limit 1;
    end;
  elsif not replay or projection_applied or state_row.needs_reconciliation then
    insert into public.admin_review_case_events(case_id,admin_id,actor_source,action,details)
    values (case_uuid,null,'stripe_webhook','note',jsonb_build_object(
      'provider_event_id',p_provider_event_id,'dispute_id',p_dispute_id,'event_type',p_event_type,
      'event_status',p_event_dispute_status,'current_status',state_row.current_status,
      'projection_applied',projection_applied,'needs_reconciliation',state_row.needs_reconciliation,
      'evidence_due_at',state_row.evidence_due_at));
  end if;

  if state_created or became_linked then
    insert into public.ledger_entries(booking_id,kind,amount_cents,currency,stripe_object_id,note)
    select booking_uuid,'dispute_opened',state_row.amount_cents,state_row.currency,p_dispute_id,
      'Stripe test dispute observed from provider-refreshed current state'
    where not exists (select 1 from public.ledger_entries l
      where l.booking_id=booking_uuid and l.kind='dispute_opened' and l.stripe_object_id=p_dispute_id);
  end if;

  if private.smart_parrot_dispute_status_is_terminal(state_row.current_status)
     and (state_created or became_linked or (projection_applied and previous_status is not null
          and not private.smart_parrot_dispute_status_is_terminal(previous_status))) then
    insert into public.ledger_entries(booking_id,kind,amount_cents,currency,stripe_object_id,note)
    select booking_uuid,'dispute_closed',state_row.amount_cents,state_row.currency,p_dispute_id,
      'Stripe test dispute terminal provider state: '||state_row.current_status
    where not exists (select 1 from public.ledger_entries l
      where l.booking_id=booking_uuid and l.kind='dispute_closed' and l.stripe_object_id=p_dispute_id);
  end if;

  return jsonb_build_object('received',true,'replay',replay,'booking_id',booking_uuid,
    'review_case_id',case_uuid,'correlation','matched','current_status',state_row.current_status,
    'projection_applied',projection_applied,'needs_reconciliation',state_row.needs_reconciliation);
end;
$$;

revoke all on function public.record_stripe_dispute_event_v2(
  text,text,text,text,text,int,text,text,text,timestamptz,timestamptz,
  text,text,int,text,text,text,timestamptz,timestamptz
) from public, anon, authenticated;
grant execute on function public.record_stripe_dispute_event_v2(
  text,text,text,text,text,int,text,text,text,timestamptz,timestamptz,
  text,text,int,text,text,text,timestamptz,timestamptz
) to service_role;

create or replace function public.admin_review_queue(
  p_limit int default 50,p_now timestamptz default clock_timestamp()
) returns table(source text,review_case_id uuid,booking_id uuid,category text,severity text,summary text,occurred_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare uid uuid := auth.uid();
begin
  perform private.smart_parrot_require_admin(uid);
  if p_limit is null or p_limit<1 or p_limit>100 or p_now is null then raise exception 'invalid_admin_review_queue_request' using errcode='22023'; end if;
  return query with items as (
    select 'manual_case'::text s,c.id cid,c.booking_id bid,c.kind cat,c.priority sev,left(c.reason,500) summary,c.opened_at happened
    from public.admin_review_cases c where c.status in ('open','in_review')
    union all
    select 'payment_hold',null::uuid,b.id,'payment',case when b.starts_at<=p_now+interval '12 hours' then 'urgent' else 'high' end,
      'Payment hold failed before lesson',coalesce(b.hold_due_at,b.created_at) from public.bookings b
    where b.status='hold_failed' and b.starts_at>=p_now-interval '1 day' and b.starts_at<=p_now+interval '48 hours'
    union all
    select 'settlement_error',null::uuid,b.id,'payment',case when b.settlement_attempts>=6 or b.settlement_last_error_at<=p_now-interval '6 hours' then 'urgent' else 'high' end,
      'Settlement requires operator review',b.settlement_last_error_at from public.bookings b
    where b.settlement_last_error_at is not null and b.status='awaiting_settlement'
    union all
    select 'cancellation_error',null::uuid,b.id,'cancellation',case when b.cancellation_attempts>=6 or b.cancellation_last_error_at<=p_now-interval '6 hours' then 'urgent' else 'high' end,
      'Cancellation payment/finalization requires operator review',b.cancellation_last_error_at from public.bookings b
    where b.cancellation_last_error_at is not null and b.cancellation_requested_at is not null and b.status<>'cancelled'
    union all
    select 'compliance_delivery',null::uuid,o.booking_id,'compliance',case when o.dead_lettered_at is not null or o.queued_at<=p_now-interval '48 hours' then 'urgent' else 'high' end,
      case when o.dead_lettered_at is not null then 'Compliance acknowledgement delivery dead-lettered' else 'Compliance acknowledgement delivery overdue' end,
      coalesce(o.dead_lettered_at,o.last_attempt_at,o.queued_at) from public.compliance_notice_outbox o
    where o.delivered_at is null and (o.dead_lettered_at is not null or o.queued_at<=p_now-interval '24 hours')
    union all
    select 'stripe_dispute_unmatched',null::uuid,null::uuid,'dispute',case when s.needs_reconciliation then 'urgent' else 'high' end,
      left('Unmatched Stripe test dispute '||s.dispute_id||' current status '||s.current_status||case when s.needs_reconciliation then ' (provider state needs reconciliation)' else '' end,500),s.updated_at
    from public.stripe_dispute_current_state s where s.booking_id is null
  )
  select i.s,i.cid,i.bid,i.cat,i.sev,i.summary,i.happened from items i
  where i.s='manual_case' or i.bid is null or not exists (select 1 from public.admin_operational_alert_acknowledgements a
    where a.source=i.s and a.booking_id=i.bid and a.snoozed_until>p_now)
  order by case i.sev when 'urgent' then 0 when 'high' then 1 else 2 end,i.happened nulls first,i.bid limit p_limit;
end;
$$;

create or replace function public.admin_booking_launch_health(p_now timestamptz default clock_timestamp()) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  uid uuid := auth.uid(); hold_failed_near_term int; stale_settlement_claims int; settlement_errors int;
  cancellation_errors int; overdue_compliance int; dead_lettered_compliance int; unmatched_disputes int;
  dispute_reconciliation int; open_review_cases int; active_claimed_cases int; stale_claimed_cases int; attention_count int;
begin
  perform private.smart_parrot_require_admin(uid);
  if p_now is null then raise exception 'invalid_admin_launch_health_request' using errcode='22023'; end if;
  select count(*) into hold_failed_near_term from public.bookings b where b.status='hold_failed' and b.starts_at>=p_now-interval '1 day' and b.starts_at<=p_now+interval '48 hours';
  select count(*) into stale_settlement_claims from public.bookings b where b.status='awaiting_settlement' and b.settlement_claimed_at is not null and b.settlement_claimed_at<=p_now-interval '10 minutes';
  select count(*) into settlement_errors from public.bookings b where b.status='awaiting_settlement' and b.settlement_last_error_at is not null;
  select count(*) into cancellation_errors from public.bookings b where b.status<>'cancelled' and b.cancellation_requested_at is not null and b.cancellation_last_error_at is not null;
  select count(*) into overdue_compliance from public.compliance_notice_outbox o where o.delivered_at is null and o.dead_lettered_at is null and o.queued_at<=p_now-interval '24 hours';
  select count(*) into dead_lettered_compliance from public.compliance_notice_outbox o where o.delivered_at is null and o.dead_lettered_at is not null;
  select count(*) into unmatched_disputes from public.stripe_dispute_current_state s where s.booking_id is null;
  select count(*) into dispute_reconciliation from public.stripe_dispute_current_state s where s.needs_reconciliation;
  select count(*) into open_review_cases from public.admin_review_cases c where c.status in ('open','in_review');
  select count(*) into active_claimed_cases from public.admin_review_cases c where c.status='in_review' and c.claimed_by is not null and c.claim_expires_at>p_now;
  select count(*) into stale_claimed_cases from public.admin_review_cases c where c.status='in_review' and c.claimed_by is not null and c.claim_expires_at<=p_now;
  attention_count := hold_failed_near_term+stale_settlement_claims+settlement_errors+cancellation_errors+overdue_compliance+dead_lettered_compliance+unmatched_disputes+dispute_reconciliation+stale_claimed_cases;
  return jsonb_build_object('schema_version','smart_parrot_booking_launch_health_v1','generated_at',p_now,
    'status',case when attention_count=0 then 'healthy' else 'attention' end,'attention_count',attention_count,
    'counts',jsonb_build_object('hold_failed_near_term',hold_failed_near_term,'stale_settlement_claims',stale_settlement_claims,
      'settlement_errors',settlement_errors,'cancellation_errors',cancellation_errors,'overdue_compliance_notices',overdue_compliance,
      'dead_lettered_compliance_notices',dead_lettered_compliance,'unmatched_disputes',unmatched_disputes,
      'disputes_needing_reconciliation',dispute_reconciliation,'open_review_cases',open_review_cases,
      'active_claimed_cases',active_claimed_cases,'stale_claimed_cases',stale_claimed_cases),
    'boundaries',jsonb_build_array('Counts only: no secret values, provider payloads, customer identifiers, or evidence bodies are returned',
      'A nonzero count is an operator signal, not authority to move money or change provider dispute state',
      'Provider integration readiness remains separate from operational health'));
end;
$$;

revoke all on function public.admin_booking_launch_health(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_booking_launch_health(timestamptz) to authenticated;
comment on table public.stripe_dispute_current_state is 'Server-only current Stripe test dispute projection refreshed from the provider API. Append-only stripe_dispute_events remains the evidentiary event stream.';
comment on function public.record_stripe_dispute_event_v2(text,text,text,text,text,int,text,text,text,timestamptz,timestamptz,text,text,int,text,text,text,timestamptz,timestamptz) is 'Service-only idempotent dispute intake requiring a fresh Stripe test dispute snapshot. Webhook order never directly defines current state; no provider dispute write exists.';
comment on function public.admin_booking_launch_health(timestamptz) is 'Admin-only count summary for stuck lesson-booking work. Returns no customer/provider identifiers or secret values.';
