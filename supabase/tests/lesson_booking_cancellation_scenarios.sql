-- Behavioral regression scenarios for Phase 3A cancellation/withdrawal.
-- Runs only in ephemeral CI PostgreSQL and rolls back all fixture data.

begin;

insert into public.policy_versions (
  id, config, terms_markdown, terms_sha256, published_at
) values
(
  'ci-cancel-2026-10-01',
  '{
    "grace_minutes": 5,
    "no_show_after_minutes": 15,
    "tutor_grace_minutes": 5,
    "capture_delay_minutes": 60,
    "late_surcharge_pct": 20,
    "hold_lead_hours": 48,
    "hold_fix_deadline_hours": 24,
    "free_cancel_hours": 24,
    "late_cancel_hours": 2,
    "late_cancel_pct": 50,
    "withdrawal_mode": "service_14d",
    "withdrawal_window_days": 14
  }'::jsonb,
  'CI cancellation policy',
  'ci-cancel-policy-sha256',
  '2026-09-20T00:00:00Z'
),
(
  'ci-cancel-review-required',
  '{
    "grace_minutes": 5,
    "no_show_after_minutes": 15,
    "tutor_grace_minutes": 5,
    "capture_delay_minutes": 60,
    "late_surcharge_pct": 20,
    "hold_lead_hours": 48,
    "hold_fix_deadline_hours": 24,
    "free_cancel_hours": 24,
    "late_cancel_hours": 2,
    "late_cancel_pct": 50,
    "withdrawal_mode": "review_required",
    "withdrawal_window_days": 14
  }'::jsonb,
  'CI cancellation policy pending legal review',
  'ci-cancel-review-sha256',
  '2026-09-20T00:00:01Z'
);

insert into auth.users (id, raw_user_meta_data) values
  ('30000000-0000-0000-0000-000000000001', '{"full_name":"Cancel Student"}'),
  ('30000000-0000-0000-0000-000000000002', '{"full_name":"Cancel Tutor"}');

update public.profiles set role = 'tutor' where id = '30000000-0000-0000-0000-000000000002';
insert into public.tutors (id, bio) values ('30000000-0000-0000-0000-000000000002', 'Cancellation CI tutor');
insert into public.lesson_types (id,tutor_id,name,duration_minutes,on_time_price_cents,currency) values
('30000000-0000-0000-0000-000000000010','30000000-0000-0000-0000-000000000002','Cancellation CI English 45',45,3000,'eur');

insert into public.bookings (
  id,student_id,tutor_id,lesson_type_id,policy_version_id,starts_at,ends_at,status,currency,on_time_price_cents,max_charge_cents,
  hold_strategy,stripe_payment_intent_id,capture_before,created_at
) values
('31000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000010','ci-cancel-2026-10-01','2026-10-10 10:00+00','2026-10-10 10:45+00','hold_placed','eur',3000,3600,'at_checkout','pi_test_cancel_free','2026-10-12 00:00+00','2026-10-01 09:00+00'),
('31000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000010','ci-cancel-2026-10-01','2026-10-11 10:00+00','2026-10-11 10:45+00','hold_placed','eur',3000,3600,'at_checkout','pi_test_cancel_late','2026-10-13 00:00+00','2026-10-01 09:00+00'),
('31000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000010','ci-cancel-2026-10-01','2026-10-12 10:00+00','2026-10-12 10:45+00','hold_placed','eur',3000,3600,'at_checkout','pi_test_cancel_very_late','2026-10-14 00:00+00','2026-10-01 09:00+00'),
('31000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000010','ci-cancel-2026-10-01','2026-10-13 10:00+00','2026-10-13 10:45+00','hold_placed','eur',3000,3600,'at_checkout','pi_test_tutor_cancel','2026-10-15 00:00+00','2026-10-01 09:00+00'),
('31000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000010','ci-cancel-2026-10-01','2026-10-14 10:00+00','2026-10-14 10:45+00','hold_placed','eur',3000,3600,'at_checkout','pi_test_withdrawal','2026-10-16 00:00+00','2026-10-01 09:00+00'),
('31000000-0000-0000-0000-000000000006','30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000010','ci-cancel-2026-10-01','2026-10-20 10:00+00','2026-10-20 10:45+00','card_saved','eur',3000,3600,'deferred',null,null,'2026-09-01 09:00+00'),
('31000000-0000-0000-0000-000000000007','30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000010','ci-cancel-review-required','2026-10-21 10:00+00','2026-10-21 10:45+00','card_saved','eur',3000,3600,'deferred',null,null,'2026-10-01 09:00+00');

do $$ declare p jsonb; f jsonb; c int; begin
  select public.prepare_booking_cancellation('30000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','cancel','2026-10-09 00:00+00','127.0.0.1','CI') into p;
  if p->>'outcome'<>'cancelled_free' or (p->>'amount_cents')::int<>0 or p->>'payment_action'<>'release' then raise exception 'free cancellation prepare mismatch: %',p; end if;
  select public.finalize_booking_cancellation('31000000-0000-0000-0000-000000000001',(p->>'cancellation_attempt')::int,0,3600) into f;
  if f->>'status'<>'cancelled' or f->>'outcome'<>'cancelled_free' then raise exception 'free cancellation finalize mismatch: %',f; end if;
  select count(*) into c from public.ledger_entries where booking_id='31000000-0000-0000-0000-000000000001' and kind='hold_released' and amount_cents=3600;
  if c<>1 then raise exception 'free cancellation release count %',c; end if;
end $$;

do $$ declare p jsonb; f jsonb; begin
  select public.prepare_booking_cancellation('30000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000002','cancel','2026-10-10 22:00+00') into p;
  if p->>'outcome'<>'cancelled_late' or (p->>'amount_cents')::int<>1800 or p->>'payment_action'<>'capture' then raise exception 'late cancellation prepare mismatch: %',p; end if;
  select public.finalize_booking_cancellation('31000000-0000-0000-0000-000000000002',(p->>'cancellation_attempt')::int,1800,1800) into f;
  if f->>'outcome'<>'cancelled_late' or (f->>'amount_cents')::int<>1800 or (f->>'released_cents')::int<>1800 then raise exception 'late cancellation finalize mismatch: %',f; end if;
end $$;

do $$ declare p jsonb; f jsonb; begin
  select public.prepare_booking_cancellation('30000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000003','cancel','2026-10-12 09:00+00') into p;
  if p->>'outcome'<>'cancelled_very_late' or (p->>'amount_cents')::int<>3600 or p->>'payment_action'<>'capture' then raise exception 'very-late cancellation prepare mismatch: %',p; end if;
  select public.finalize_booking_cancellation('31000000-0000-0000-0000-000000000003',(p->>'cancellation_attempt')::int,3600,0) into f;
  if f->>'outcome'<>'cancelled_very_late' or (f->>'amount_cents')::int<>3600 then raise exception 'very-late cancellation finalize mismatch: %',f; end if;
end $$;

do $$ declare p jsonb; f jsonb; begin
  select public.prepare_booking_cancellation('30000000-0000-0000-0000-000000000002','31000000-0000-0000-0000-000000000004','cancel','2026-10-12 08:00+00') into p;
  if p->>'actor_role'<>'tutor' or p->>'outcome'<>'cancelled_by_tutor' or (p->>'amount_cents')::int<>0 or p->>'payment_action'<>'release' then raise exception 'tutor cancellation prepare mismatch: %',p; end if;
  select public.finalize_booking_cancellation('31000000-0000-0000-0000-000000000004',(p->>'cancellation_attempt')::int,0,3600) into f;
  if f->>'outcome'<>'cancelled_by_tutor' then raise exception 'tutor cancellation finalize mismatch: %',f; end if;
end $$;

do $$ declare p jsonb; p2 jsonb; f jsonb; f2 jsonb; c int; begin
  select public.prepare_booking_cancellation('30000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000005','withdrawal','2026-10-05 12:00+00',null,null,'Cancel Student','cancel.student@example.test') into p;
  if p->>'kind'<>'withdrawal' or p->>'outcome'<>'cancelled_free' or (p->>'amount_cents')::int<>0 or p->>'payment_action'<>'release' then raise exception 'withdrawal prepare mismatch: %',p; end if;
  select public.prepare_booking_cancellation('30000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000005','withdrawal','2026-10-05 12:01+00',null,null,'Cancel Student','cancel.student@example.test') into p2;
  if p2->>'request_id'<>p->>'request_id' or p2->>'idempotent'<>'true' then raise exception 'withdrawal prepare not idempotent'; end if;
  select public.finalize_booking_cancellation('31000000-0000-0000-0000-000000000005',(p->>'cancellation_attempt')::int,0,3600) into f;
  select public.finalize_booking_cancellation('31000000-0000-0000-0000-000000000005',(p->>'cancellation_attempt')::int,0,3600) into f2;
  if f->>'notice_kind'<>'withdrawal_acknowledgement' or f2->>'idempotent'<>'true' then raise exception 'withdrawal finalization mismatch'; end if;
  select count(*) into c from public.compliance_notice_outbox where booking_id='31000000-0000-0000-0000-000000000005' and kind='withdrawal_acknowledgement';
  if c<>1 then raise exception 'withdrawal acknowledgement count %',c; end if;
end $$;

do $$ begin
  begin
    perform public.prepare_booking_cancellation('30000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000006','withdrawal','2026-10-05 12:00+00',null,null,'Cancel Student','cancel.student@example.test');
    raise exception 'expected withdrawal_window_expired';
  exception when others then if sqlerrm<>'withdrawal_window_expired' then raise; end if; end;
end $$;

do $$ begin
  begin
    perform public.prepare_booking_cancellation('30000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000007','withdrawal','2026-10-05 12:00+00',null,null,'Cancel Student','cancel.student@example.test');
    raise exception 'expected withdrawal_not_enabled_for_policy';
  exception when others then if sqlerrm<>'withdrawal_not_enabled_for_policy' then raise; end if; end;
end $$;

do $$ declare captures int; releases int; notices int; begin
  select count(*) into captures from public.ledger_entries where booking_id='31000000-0000-0000-0000-000000000002' and kind='captured' and amount_cents=1800;
  select count(*) into releases from public.ledger_entries where booking_id='31000000-0000-0000-0000-000000000002' and kind='hold_released' and amount_cents=1800;
  select count(*) into notices from public.compliance_notice_outbox where booking_id='31000000-0000-0000-0000-000000000002' and kind='cancellation_confirmation';
  if captures<>1 or releases<>1 or notices<>1 then raise exception 'late cancellation evidence mismatch capture=% release=% notice=%',captures,releases,notices; end if;
end $$;

rollback;
