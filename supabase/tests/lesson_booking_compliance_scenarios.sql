-- Behavioral regression scenarios for Phase 3B cancellation UX/compliance delivery contract.
-- Runs only in ephemeral CI PostgreSQL and rolls back all fixture data.

begin;

insert into public.policy_versions (
  id, config, terms_markdown, terms_sha256, published_at
) values (
  'ci-phase3b-2026-10-01',
  '{
    "free_cancel_hours": 24,
    "late_cancel_hours": 2,
    "late_cancel_pct": 50,
    "withdrawal_mode": "service_14d",
    "withdrawal_window_days": 14
  }'::jsonb,
  'CI Phase 3B immutable terms',
  'ci-phase3b-policy-sha256',
  '2026-10-01T00:00:00Z'
);

insert into auth.users (id, raw_user_meta_data) values
  ('40000000-0000-0000-0000-000000000001', '{"full_name":"Phase3B Student"}'),
  ('40000000-0000-0000-0000-000000000002', '{"full_name":"Phase3B Tutor"}');
update public.profiles set role='tutor' where id='40000000-0000-0000-0000-000000000002';
insert into public.tutors(id,bio) values ('40000000-0000-0000-0000-000000000002','Phase 3B CI tutor');
insert into public.lesson_types(id,tutor_id,name,duration_minutes,on_time_price_cents,currency) values
  ('40000000-0000-0000-0000-000000000010','40000000-0000-0000-0000-000000000002','Phase 3B English',45,3000,'eur');

insert into public.bookings(
  id,student_id,tutor_id,lesson_type_id,policy_version_id,starts_at,ends_at,status,currency,on_time_price_cents,max_charge_cents,
  hold_strategy,stripe_payment_intent_id,capture_before,hold_due_at,created_at
) values
  ('41000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000010','ci-phase3b-2026-10-01','2026-10-11 10:00+00','2026-10-11 10:45+00','hold_placed','eur',3000,3600,'at_checkout','pi_test_phase3b_quote','2026-10-13 00:00+00',null,'2026-10-01 09:00+00'),
  ('41000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000010','ci-phase3b-2026-10-01','2026-10-20 10:00+00','2026-10-20 10:45+00','card_saved','eur',3000,3600,'deferred',null,null,'2026-10-18 10:00+00','2026-10-01 09:00+00'),
  ('41000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000010','ci-phase3b-2026-10-01','2026-10-21 10:00+00','2026-10-21 10:45+00','card_saved','eur',3000,3600,'deferred',null,null,'2026-10-19 10:00+00','2026-10-01 09:00+00');

-- Preview must match the same policy math used by the mutating cancellation claim.
do $$
declare
  q jsonb;
  p jsonb;
begin
  select private.smart_parrot_booking_action_preview(
    '40000000-0000-0000-0000-000000000001',
    '41000000-0000-0000-0000-000000000001',
    '2026-10-10 22:00+00'
  ) into q;
  if (q#>>'{cancellation,eligible}') <> 'true'
     or (q#>>'{cancellation,amount_cents}')::int <> 1800
     or (q#>>'{cancellation,outcome}') <> 'cancelled_late' then
    raise exception 'Phase 3B cancellation preview mismatch: %', q;
  end if;

  select public.prepare_booking_cancellation(
    '40000000-0000-0000-0000-000000000001',
    '41000000-0000-0000-0000-000000000001',
    'cancel',
    '2026-10-10 22:00+00'
  ) into p;
  if (p->>'amount_cents')::int <> (q#>>'{cancellation,amount_cents}')::int
     or p->>'outcome' <> q#>>'{cancellation,outcome}' then
    raise exception 'Preview/prepare parity mismatch preview=% prepare=%', q, p;
  end if;
end $$;

-- Withdrawal preview is server-timestamped and the declaration fields are retained
-- in append-only evidence and copied into the acknowledgement payload.
do $$
declare
  q jsonb;
  p jsonb;
  f jsonb;
  payload jsonb;
begin
  select private.smart_parrot_booking_action_preview(
    '40000000-0000-0000-0000-000000000001',
    '41000000-0000-0000-0000-000000000002',
    '2026-10-05 12:00+00'
  ) into q;
  if (q#>>'{withdrawal,eligible}') <> 'true'
     or (q#>>'{withdrawal,amount_cents}')::int <> 0
     or (q#>>'{withdrawal,declaration_required}') <> 'true' then
    raise exception 'Phase 3B withdrawal preview mismatch: %', q;
  end if;

  select public.prepare_booking_cancellation(
    '40000000-0000-0000-0000-000000000001',
    '41000000-0000-0000-0000-000000000002',
    'withdrawal',
    '2026-10-05 12:00+00',
    null,
    'CI Phase3B',
    'Phase3B Student',
    'student@example.test'
  ) into p;
  select public.finalize_booking_cancellation(
    '41000000-0000-0000-0000-000000000002',
    (p->>'cancellation_attempt')::int,
    0,
    0
  ) into f;
  if f->>'notice_kind' <> 'withdrawal_acknowledgement' then
    raise exception 'Withdrawal finalization did not queue acknowledgement: %', f;
  end if;

  select o.payload into payload from public.compliance_notice_outbox o
  where o.booking_id='41000000-0000-0000-0000-000000000002';
  if payload->>'declaration_name' <> 'Phase3B Student'
     or payload->>'declaration_contact' <> 'student@example.test'
     or payload->>'requested_at' is null then
    raise exception 'Withdrawal acknowledgement payload incomplete: %', payload;
  end if;
end $$;

-- Public status is student-scoped and exposes delivery state without provider IDs/errors.
create or replace function auth.uid()
returns uuid language sql stable as $$
  select '40000000-0000-0000-0000-000000000001'::uuid;
$$;

do $$
declare s jsonb;
begin
  select public.booking_compliance_status('41000000-0000-0000-0000-000000000002') into s;
  if s->>'state' <> 'queued' or s ? 'provider_message_id' or s ? 'last_error_code' then
    raise exception 'Unsafe initial compliance status: %', s;
  end if;
end $$;

-- Delivery worker claim/failure/retry/completion is lease- and attempt-bound.
do $$
declare
  n uuid;
  attempt int;
  failed jsonb;
  claimed_early int;
  completed boolean;
  s jsonb;
begin
  select c.notice_id,c.delivery_attempt into n,attempt
  from public.claim_compliance_notices(10,'2026-10-05 12:01+00') c
  where c.booking_id='41000000-0000-0000-0000-000000000002';
  if n is null or attempt<>1 then raise exception 'First compliance claim mismatch notice=% attempt=%',n,attempt; end if;

  select public.fail_compliance_notice_delivery(n,attempt,'provider_503','2026-10-05 12:01+00') into failed;
  if failed->>'state'<>'retrying' or (failed->>'delivery_attempts')::int<>1 then raise exception 'Retry state mismatch: %',failed; end if;

  select count(*) into claimed_early from public.claim_compliance_notices(10,'2026-10-05 12:05+00');
  if claimed_early<>0 then raise exception 'Notice reclaimed before retry deadline'; end if;

  select c.notice_id,c.delivery_attempt into n,attempt
  from public.claim_compliance_notices(10,'2026-10-05 12:06+00') c
  where c.booking_id='41000000-0000-0000-0000-000000000002';
  if n is null or attempt<>2 then raise exception 'Second compliance claim mismatch notice=% attempt=%',n,attempt; end if;

  select public.complete_compliance_notice_delivery(n,attempt,'provider-test-message-123','2026-10-05 12:07+00') into completed;
  if completed is not true then raise exception 'Compliance completion was not accepted'; end if;

  select public.booking_compliance_status('41000000-0000-0000-0000-000000000002') into s;
  if s->>'state'<>'delivered' or s ? 'provider_message_id' or s ? 'last_error_code' then
    raise exception 'Unsafe delivered compliance status: %',s;
  end if;
end $$;

-- Six failed delivery claims dead-letter and surface in the service-only alert feed.
insert into public.compliance_notice_outbox(
  booking_id,user_id,kind,payload,queued_at,delivery_attempts,next_attempt_at
) values (
  '41000000-0000-0000-0000-000000000003',
  '40000000-0000-0000-0000-000000000001',
  'cancellation_confirmation',
  '{"booking_id":"41000000-0000-0000-0000-000000000003"}'::jsonb,
  '2026-10-01 00:00+00',
  5,
  '2026-10-06 08:20+00'
);

do $$
declare
  n uuid;
  attempt int;
  failed jsonb;
  alerts int;
begin
  select c.notice_id,c.delivery_attempt into n,attempt
  from public.claim_compliance_notices(10,'2026-10-06 08:20+00') c
  where c.booking_id='41000000-0000-0000-0000-000000000003';
  if n is null or attempt<>6 then raise exception 'Dead-letter claim mismatch notice=% attempt=%',n,attempt; end if;
  select public.fail_compliance_notice_delivery(n,attempt,'provider_permanent_failure','2026-10-06 08:21+00') into failed;
  if failed->>'state'<>'needs_attention' then raise exception 'Dead-letter state mismatch: %',failed; end if;
  select count(*) into alerts from public.list_compliance_delivery_alerts(50,'2026-10-06 08:22+00') a
  where a.booking_id='41000000-0000-0000-0000-000000000003' and a.state='dead_letter';
  if alerts<>1 then raise exception 'Dead-letter alert feed mismatch count=%',alerts; end if;
end $$;

rollback;
