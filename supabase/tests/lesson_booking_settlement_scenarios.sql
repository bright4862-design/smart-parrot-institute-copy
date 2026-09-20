-- Behavioral regression scenarios for Phase 2B deterministic settlement.
-- Runs only in ephemeral CI Postgres and rolls back all fixture data.

begin;

insert into public.policy_versions (
  id,
  config,
  terms_markdown,
  terms_sha256,
  published_at
) values (
  'ci-2026-10-01',
  '{
    "grace_minutes": 5,
    "no_show_after_minutes": 15,
    "tutor_grace_minutes": 5,
    "tutor_no_show_credit_cents": 1000,
    "capture_delay_minutes": 60,
    "late_surcharge_pct": 20,
    "hold_lead_hours": 48,
    "hold_fix_deadline_hours": 24
  }'::jsonb,
  'CI policy',
  'ci-policy-sha256',
  '2026-09-20T00:00:00Z'
);

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', '{"full_name":"CI Student"}'),
  ('00000000-0000-0000-0000-000000000002', '{"full_name":"CI Tutor"}');

update public.profiles
set role = 'tutor'
where id = '00000000-0000-0000-0000-000000000002';

insert into public.tutors (id, bio)
values ('00000000-0000-0000-0000-000000000002', 'CI tutor');

insert into public.lesson_types (
  id,
  tutor_id,
  name,
  duration_minutes,
  on_time_price_cents,
  currency
) values (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000002',
  'CI English 45',
  45,
  3000,
  'eur'
);

insert into public.bookings (
  id, student_id, tutor_id, lesson_type_id, policy_version_id,
  starts_at, ends_at, status, currency, on_time_price_cents, max_charge_cents,
  hold_strategy, stripe_payment_intent_id, settlement_claimed_at, settlement_attempts
) values
  ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000010','ci-2026-10-01','2026-10-02 10:00+00','2026-10-02 10:45+00','awaiting_settlement','eur',3000,3600,'at_checkout','pi_test_on_time','2099-01-01',1),
  ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000010','ci-2026-10-01','2026-10-03 10:00+00','2026-10-03 10:45+00','awaiting_settlement','eur',3000,3600,'at_checkout','pi_test_late','2099-01-01',1),
  ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000010','ci-2026-10-01','2026-10-04 10:00+00','2026-10-04 10:45+00','awaiting_settlement','eur',3000,3600,'at_checkout','pi_test_no_show','2099-01-01',1),
  ('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000010','ci-2026-10-01','2026-10-05 10:00+00','2026-10-05 10:45+00','awaiting_settlement','eur',3000,3600,'at_checkout','pi_test_tutor_late','2099-01-01',1),
  ('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000010','ci-2026-10-01','2026-10-06 10:00+00','2026-10-06 10:45+00','awaiting_settlement','eur',3000,3600,'at_checkout','pi_test_tutor_no_show','2099-01-01',1),
  ('10000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000010','ci-2026-10-01','2026-10-07 10:00+00','2026-10-07 10:45+00','awaiting_settlement','eur',3000,3600,'at_checkout','pi_test_tutor_left','2099-01-01',1),
  ('10000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000010','ci-2026-10-01','2026-10-08 10:00+00','2026-10-08 10:45+00','awaiting_settlement','eur',3000,3600,'at_checkout','pi_test_rejoined','2099-01-01',1),
  ('10000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000010','ci-2026-10-01','2026-10-09 10:00+00','2026-10-09 10:45+00','awaiting_settlement','eur',3000,3600,'at_checkout','pi_test_student_cutoff','2099-01-01',1),
  ('10000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000010','ci-2026-10-01','2026-10-10 10:00+00','2026-10-10 10:45+00','awaiting_settlement','eur',3000,3600,'at_checkout','pi_test_tutor_cutoff','2099-01-01',1);

insert into public.attendance_events (booking_id, actor, kind, source, occurred_at, external_id) values
  ('10000000-0000-0000-0000-000000000001','tutor','joined','admin','2026-10-02 09:59+00','ci-1-t'),
  ('10000000-0000-0000-0000-000000000001','student','joined','admin','2026-10-02 10:05+00','ci-1-s'),
  ('10000000-0000-0000-0000-000000000002','tutor','joined','admin','2026-10-03 09:59+00','ci-2-t'),
  ('10000000-0000-0000-0000-000000000002','student','joined','admin','2026-10-03 10:06+00','ci-2-s'),
  ('10000000-0000-0000-0000-000000000003','tutor','joined','admin','2026-10-04 09:59+00','ci-3-t'),
  ('10000000-0000-0000-0000-000000000004','student','joined','admin','2026-10-05 10:00+00','ci-4-s'),
  ('10000000-0000-0000-0000-000000000004','tutor','joined','admin','2026-10-05 10:06+00','ci-4-t'),
  ('10000000-0000-0000-0000-000000000005','student','joined','admin','2026-10-06 10:00+00','ci-5-s'),
  ('10000000-0000-0000-0000-000000000006','tutor','joined','admin','2026-10-07 09:59+00','ci-6-tj'),
  ('10000000-0000-0000-0000-000000000006','tutor','left','admin','2026-10-07 10:04+00','ci-6-tl'),
  ('10000000-0000-0000-0000-000000000006','student','joined','admin','2026-10-07 10:08+00','ci-6-s'),
  ('10000000-0000-0000-0000-000000000007','tutor','joined','admin','2026-10-08 09:59+00','ci-7-tj1'),
  ('10000000-0000-0000-0000-000000000007','tutor','left','admin','2026-10-08 10:03+00','ci-7-tl'),
  ('10000000-0000-0000-0000-000000000007','tutor','joined','admin','2026-10-08 10:07+00','ci-7-tj2'),
  ('10000000-0000-0000-0000-000000000007','student','joined','admin','2026-10-08 10:08+00','ci-7-s'),
  ('10000000-0000-0000-0000-000000000008','tutor','joined','admin','2026-10-09 09:59+00','ci-8-t'),
  ('10000000-0000-0000-0000-000000000008','student','joined','admin','2026-10-09 10:15+00','ci-8-s'),
  ('10000000-0000-0000-0000-000000000009','student','joined','admin','2026-10-10 10:00+00','ci-9-s'),
  ('10000000-0000-0000-0000-000000000009','tutor','joined','admin','2026-10-10 10:15+00','ci-9-t');

do $$
declare
  v_bad text;
begin
  with expected(booking_id, expected_outcome, expected_amount) as (
    values
      ('10000000-0000-0000-0000-000000000001'::uuid, 'on_time'::public.lesson_outcome, 3000),
      ('10000000-0000-0000-0000-000000000002'::uuid, 'late'::public.lesson_outcome, 3600),
      ('10000000-0000-0000-0000-000000000003'::uuid, 'no_show'::public.lesson_outcome, 3600),
      ('10000000-0000-0000-0000-000000000004'::uuid, 'tutor_late'::public.lesson_outcome, 2600),
      ('10000000-0000-0000-0000-000000000005'::uuid, 'tutor_no_show'::public.lesson_outcome, 0),
      ('10000000-0000-0000-0000-000000000006'::uuid, 'tutor_no_show'::public.lesson_outcome, 0),
      ('10000000-0000-0000-0000-000000000007'::uuid, 'late'::public.lesson_outcome, 3600),
      ('10000000-0000-0000-0000-000000000008'::uuid, 'late'::public.lesson_outcome, 3600),
      ('10000000-0000-0000-0000-000000000009'::uuid, 'tutor_late'::public.lesson_outcome, 2000)
  ),
  actual as (
    select
      e.booking_id,
      e.expected_outcome,
      e.expected_amount,
      s.outcome as actual_outcome,
      s.amount_cents as actual_amount
    from expected e
    cross join lateral public.compute_lesson_settlement(e.booking_id) s
  )
  select string_agg(
    format('%s expected %s/%s got %s/%s', booking_id, expected_outcome, expected_amount, actual_outcome, actual_amount),
    E'\n'
  )
  into v_bad
  from actual
  where actual_outcome <> expected_outcome
     or actual_amount <> expected_amount;

  if v_bad is not null then
    raise exception 'settlement scenario mismatch:%', E'\n' || v_bad;
  end if;
end;
$$;

insert into public.bookings (
  id, student_id, tutor_id, lesson_type_id, policy_version_id,
  starts_at, ends_at, status, currency, on_time_price_cents, max_charge_cents,
  hold_strategy, stripe_payment_intent_id, capture_before
) values (
  '20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000010',
  'ci-2026-10-01',
  '2026-10-01 10:00+00',
  '2026-10-01 10:45+00',
  'hold_placed',
  'eur',
  3000,
  3600,
  'at_checkout',
  'pi_test_claim_finalize',
  '2026-10-05 00:00+00'
);

do $$
declare
  c record;
  f jsonb;
  v_count int;
begin
  select *
  into c
  from public.claim_lesson_settlements('2026-10-01 12:00+00'::timestamptz, 1);

  if c.booking_id <> '20000000-0000-0000-0000-000000000001'::uuid
     or c.settlement_attempt <> 1 then
    raise exception 'claim_lesson_settlements did not claim the expected booking';
  end if;

  select public.finalize_lesson_settlement(c.booking_id, c.settlement_attempt, 0, 3600)
  into f;

  if f ->> 'status' <> 'settled'
     or f ->> 'outcome' <> 'tutor_no_show'
     or (f ->> 'amount_cents')::int <> 0 then
    raise exception 'finalize_lesson_settlement returned unexpected result: %', f;
  end if;

  select count(*) into v_count
  from public.ledger_entries
  where booking_id = c.booking_id
    and kind = 'hold_released'
    and amount_cents = 3600
    and stripe_object_id = 'pi_test_claim_finalize';
  if v_count <> 1 then
    raise exception 'expected exactly one hold_released ledger entry, got %', v_count;
  end if;

  select count(*) into v_count
  from public.ledger_entries
  where booking_id = c.booking_id
    and kind = 'credit_issued'
    and amount_cents = 1000;
  if v_count <> 1 then
    raise exception 'expected exactly one tutor no-show credit ledger entry, got %', v_count;
  end if;

  select public.finalize_lesson_settlement(c.booking_id, c.settlement_attempt, 0, 3600)
  into f;

  if coalesce((f ->> 'idempotent')::boolean, false) is not true then
    raise exception 'expected idempotent finalization retry';
  end if;

  select count(*) into v_count
  from public.ledger_entries
  where booking_id = c.booking_id
    and kind in ('hold_released', 'credit_issued');
  if v_count <> 2 then
    raise exception 'idempotent retry duplicated settlement ledger evidence';
  end if;
end;
$$;

rollback;
