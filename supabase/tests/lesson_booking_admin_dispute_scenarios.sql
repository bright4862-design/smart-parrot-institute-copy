-- Phase 4B behavioral scenarios. Ephemeral CI only; all fixture writes are rolled back.
begin;

insert into public.policy_versions(id,config,terms_markdown,terms_sha256,published_at) values (
  'ci-phase4b-2026-10-20','{"withdrawal_mode":"review_required"}'::jsonb,'CI Phase 4B terms','ci-phase4b-policy-sha','2026-10-20 00:00+00'
);
insert into auth.users(id,raw_user_meta_data) values
 ('60000000-0000-0000-0000-000000000001','{"full_name":"Phase4B Student"}'),
 ('60000000-0000-0000-0000-000000000002','{"full_name":"Phase4B Tutor"}'),
 ('60000000-0000-0000-0000-000000000003','{"full_name":"Phase4B Admin A"}'),
 ('60000000-0000-0000-0000-000000000004','{"full_name":"Phase4B Admin B"}'),
 ('60000000-0000-0000-0000-000000000005','{"full_name":"Phase4B Outsider"}');
update public.profiles set role='tutor' where id='60000000-0000-0000-0000-000000000002';
update public.profiles set role='admin' where id in ('60000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000004');
insert into public.tutors(id,bio) values ('60000000-0000-0000-0000-000000000002','Phase4B tutor');
insert into public.lesson_types(id,tutor_id,name,duration_minutes,on_time_price_cents,currency) values (
 '60000000-0000-0000-0000-000000000010','60000000-0000-0000-0000-000000000002','Phase4B English',45,3000,'eur'
);
insert into public.bookings(
 id,student_id,tutor_id,lesson_type_id,policy_version_id,starts_at,ends_at,status,currency,on_time_price_cents,max_charge_cents,hold_strategy,
 stripe_payment_intent_id,capture_before,final_amount_cents,outcome,settled_at,created_at
) values (
 '61000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000010','ci-phase4b-2026-10-20',
 '2026-10-25 10:00+00','2026-10-25 10:45+00','settled','eur',3000,3600,'at_checkout','pi_test_phase4b','2026-10-27 00:00+00',3000,'on_time','2026-10-25 12:00+00','2026-10-20 09:00+00'
);
insert into public.ledger_entries(booking_id,kind,amount_cents,currency,stripe_object_id,note,created_at) values
 ('61000000-0000-0000-0000-000000000001','captured',3000,'eur','pi_test_phase4b','settlement','2026-10-25 12:00+00');

-- Provider intake is idempotent, correlates by PaymentIntent, and opens one system review case.
do $$
declare r1 jsonb; r2 jsonb; event_count int; case_count int; opened_count int;
begin
  select public.record_stripe_dispute_event('evt_phase4b_1','du_phase4b_1','charge.dispute.created','needs_response','general',3000,'eur','pi_test_phase4b','ch_test_phase4b','2026-10-27 12:00+00','2026-10-25 13:00+00') into r1;
  select public.record_stripe_dispute_event('evt_phase4b_1','du_phase4b_1','charge.dispute.created','needs_response','general',3000,'eur','pi_test_phase4b','ch_test_phase4b','2026-10-27 12:00+00','2026-10-25 13:00+00') into r2;
  if r1->>'correlation'<>'matched' or (r2->>'replay')::boolean is not true then raise exception 'Dispute correlation/replay failed: % %',r1,r2; end if;
  select count(*) into event_count from public.stripe_dispute_events where provider_event_id='evt_phase4b_1';
  select count(*) into case_count from public.admin_review_cases where booking_id='61000000-0000-0000-0000-000000000001' and kind='dispute' and status in ('open','in_review');
  select count(*) into opened_count from public.admin_review_case_events e join public.admin_review_cases c on c.id=e.case_id
    where c.booking_id='61000000-0000-0000-0000-000000000001' and e.action='opened' and e.actor_source='stripe_webhook';
  if event_count<>1 or case_count<>1 or opened_count<>1 then raise exception 'Dispute idempotency failed events=% cases=% opened=%',event_count,case_count,opened_count; end if;
end $$;

-- Updates append notes; close never auto-resolves the human review case.
do $$
declare case_id uuid; note_count int; case_status text; closed_ledger int;
begin
  perform public.record_stripe_dispute_event('evt_phase4b_2','du_phase4b_1','charge.dispute.updated','under_review','general',3000,'eur','pi_test_phase4b','ch_test_phase4b',null,'2026-10-26 10:00+00');
  perform public.record_stripe_dispute_event('evt_phase4b_3','du_phase4b_1','charge.dispute.closed','won','general',3000,'eur','pi_test_phase4b','ch_test_phase4b',null,'2026-10-27 10:00+00');
  select id,status into case_id,case_status from public.admin_review_cases where booking_id='61000000-0000-0000-0000-000000000001' and kind='dispute';
  select count(*) into note_count from public.admin_review_case_events where case_id=case_id and action='note' and actor_source='stripe_webhook';
  select count(*) into closed_ledger from public.ledger_entries where booking_id='61000000-0000-0000-0000-000000000001' and kind='dispute_closed' and stripe_object_id='du_phase4b_1';
  if note_count<>2 or case_status='resolved' or closed_ledger<>1 then raise exception 'Dispute update/close boundary failed notes=% status=% ledger=%',note_count,case_status,closed_ledger; end if;
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$ select '60000000-0000-0000-0000-000000000003'::uuid $$;

-- Admin A can claim and note the case. A second admin is blocked until the lease becomes stale.
do $$
declare c uuid; claimed_by uuid; notes int;
begin
  select id into c from public.admin_review_cases where booking_id='61000000-0000-0000-0000-000000000001' and kind='dispute';
  perform public.admin_claim_review_case(c,20);
  perform public.admin_add_review_note(c,'Reviewing minimized evidence before any provider action.');
  select r.claimed_by into claimed_by from public.admin_review_cases r where r.id=c;
  select count(*) into notes from public.admin_review_case_events where case_id=c and action='note' and actor_source='admin';
  if claimed_by<>'60000000-0000-0000-0000-000000000003'::uuid or notes<>1 then raise exception 'Admin claim/note failed'; end if;
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$ select '60000000-0000-0000-0000-000000000004'::uuid $$;
do $$
declare c uuid;
begin
  select id into c from public.admin_review_cases where booking_id='61000000-0000-0000-0000-000000000001' and kind='dispute';
  begin
    perform public.admin_claim_review_case(c,20);
    raise exception 'Second admin stole an active claim';
  exception when lock_not_available then null;
  end;
  update public.admin_review_cases set claim_expires_at=clock_timestamp()-interval '1 minute', claimed_at=clock_timestamp()-interval '30 minutes' where id=c;
  perform public.admin_claim_review_case(c,20);
  if (select claimed_by from public.admin_review_cases where id=c)<>'60000000-0000-0000-0000-000000000004'::uuid then raise exception 'Stale claim was not reclaimable'; end if;
end $$;

-- DSAR inventory is category/count only and does not expose provider or third-party payload data.
do $$
declare p jsonb;
begin
  select public.admin_data_subject_inventory('60000000-0000-0000-0000-000000000001') into p;
  if p->>'schema_version'<>'smart_parrot_dsar_inventory_v1' or (p->'counts'->>'bookings')::int<>1 then raise exception 'DSAR inventory mismatch: %',p; end if;
  if p::text like '%Phase4B Tutor%' or p::text like '%pi_test_phase4b%' or p::text like '%ch_test_phase4b%' then raise exception 'DSAR inventory leaked third-party/provider detail: %',p; end if;
end $$;

-- Unmatched provider events are surfaced as urgent queue items without inventing a booking link.
perform public.record_stripe_dispute_event('evt_phase4b_unmatched','du_phase4b_unmatched','charge.dispute.created','needs_response','unrecognized',1200,'eur','pi_test_unknown','ch_test_unknown','2026-10-28 12:00+00','2026-10-25 14:00+00');
do $$
declare n int;
begin
  select count(*) into n from public.admin_review_queue(100,clock_timestamp()) q where q.source='stripe_dispute_unmatched' and q.booking_id is null;
  if n<>1 then raise exception 'Unmatched dispute queue alert missing'; end if;
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$ select '60000000-0000-0000-0000-000000000005'::uuid $$;
do $$
begin
  begin
    perform public.admin_data_subject_inventory('60000000-0000-0000-0000-000000000001');
    raise exception 'Non-admin DSAR inventory unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
