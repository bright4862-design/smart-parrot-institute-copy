-- Phase 4C launch-hardening behavioral scenarios. Ephemeral CI only.
begin;
insert into public.policy_versions(id,config,terms_markdown,terms_sha256,published_at) values ('ci-phase4c-2026-10-20','{"withdrawal_mode":"review_required"}'::jsonb,'CI Phase 4C terms','ci-phase4c-policy-sha','2026-10-20 00:00+00');
insert into auth.users(id,raw_user_meta_data) values ('70000000-0000-0000-0000-000000000001','{"full_name":"Phase4C Student"}'),('70000000-0000-0000-0000-000000000002','{"full_name":"Phase4C Tutor"}'),('70000000-0000-0000-0000-000000000003','{"full_name":"Phase4C Admin"}'),('70000000-0000-0000-0000-000000000004','{"full_name":"Phase4C Outsider"}');
update public.profiles set role='tutor' where id='70000000-0000-0000-0000-000000000002'; update public.profiles set role='admin' where id='70000000-0000-0000-0000-000000000003';
insert into public.tutors(id,bio) values ('70000000-0000-0000-0000-000000000002','Phase4C tutor');
insert into public.lesson_types(id,tutor_id,name,duration_minutes,on_time_price_cents,currency) values ('70000000-0000-0000-0000-000000000010','70000000-0000-0000-0000-000000000002','Phase4C English',45,3000,'eur');
insert into public.bookings(id,student_id,tutor_id,lesson_type_id,policy_version_id,starts_at,ends_at,status,currency,on_time_price_cents,max_charge_cents,hold_strategy,stripe_payment_intent_id,capture_before,final_amount_cents,outcome,settled_at,created_at) values ('71000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000010','ci-phase4c-2026-10-20','2026-10-25 10:00+00','2026-10-25 10:45+00','settled','eur',3000,3600,'at_checkout','pi_test_phase4c','2026-10-27 00:00+00',3000,'on_time','2026-10-25 12:00+00','2026-10-20 09:00+00');
insert into public.ledger_entries(booking_id,kind,amount_cents,currency,stripe_object_id,note,created_at) values ('71000000-0000-0000-0000-000000000001','captured',3000,'eur','pi_test_phase4c','settlement','2026-10-25 12:00+00');

do $$ declare r jsonb; s public.stripe_dispute_current_state%rowtype; begin
select public.record_stripe_dispute_event_v2('evt_phase4c_1','du_phase4c_1','charge.dispute.created','needs_response','general',3000,'eur','pi_test_phase4c','ch_test_phase4c','2026-10-27 12:00+00','2026-10-25 13:00+00','under_review','general',3000,'eur','pi_test_phase4c','ch_test_phase4c',null,'2026-10-25 13:05+00') into r;
select * into s from public.stripe_dispute_current_state where dispute_id='du_phase4c_1';
if s.current_status<>'under_review' or s.booking_id<>'71000000-0000-0000-0000-000000000001'::uuid or s.needs_reconciliation or r->>'current_status'<>'under_review' or (r->>'projection_applied')::boolean is not true then raise exception 'Provider-refreshed dispute projection failed: % / %',s,r; end if; end $$;

do $$ declare r jsonb; current_status text; event_count int; begin
select public.record_stripe_dispute_event_v2('evt_phase4c_older_arrives_late','du_phase4c_1','charge.dispute.updated','needs_response','general',3000,'eur','pi_test_phase4c','ch_test_phase4c','2026-10-27 12:00+00','2026-10-25 12:30+00','under_review','general',3000,'eur','pi_test_phase4c','ch_test_phase4c',null,'2026-10-25 13:06+00') into r;
select s.current_status into current_status from public.stripe_dispute_current_state s where s.dispute_id='du_phase4c_1'; select count(*) into event_count from public.stripe_dispute_events where dispute_id='du_phase4c_1';
if current_status<>'under_review' or event_count<>2 or (r->>'replay')::boolean or (r->>'projection_applied')::boolean is not true then raise exception 'Late event handling failed status=% count=% result=%',current_status,event_count,r; end if; end $$;

do $$ declare r jsonb; event_count int; begin
select public.record_stripe_dispute_event_v2('evt_phase4c_older_arrives_late','du_phase4c_1','charge.dispute.updated','needs_response','general',3000,'eur','pi_test_phase4c','ch_test_phase4c','2026-10-27 12:00+00','2026-10-25 12:30+00','under_review','general',3000,'eur','pi_test_phase4c','ch_test_phase4c',null,'2026-10-25 13:06+00') into r; select count(*) into event_count from public.stripe_dispute_events where dispute_id='du_phase4c_1';
if (r->>'replay')::boolean is not true or event_count<>2 then raise exception 'Dispute replay idempotency failed result=% count=%',r,event_count; end if; end $$;

do $$ declare r jsonb; current_status text; closed_ledger int; begin
select public.record_stripe_dispute_event_v2('evt_phase4c_2','du_phase4c_1','charge.dispute.closed','won','general',3000,'eur','pi_test_phase4c','ch_test_phase4c',null,'2026-10-25 13:07+00','won','general',3000,'eur','pi_test_phase4c','ch_test_phase4c',null,'2026-10-25 13:07:05+00') into r;
select s.current_status into current_status from public.stripe_dispute_current_state s where s.dispute_id='du_phase4c_1'; select count(*) into closed_ledger from public.ledger_entries where booking_id='71000000-0000-0000-0000-000000000001' and kind='dispute_closed' and stripe_object_id='du_phase4c_1';
if current_status<>'won' or closed_ledger<>1 or (r->>'projection_applied')::boolean is not true then raise exception 'Terminal dispute projection failed status=% ledger=% result=%',current_status,closed_ledger,r; end if; end $$;

do $$ declare r jsonb; s public.stripe_dispute_current_state%rowtype; closed_ledger int; begin
select public.record_stripe_dispute_event_v2('evt_phase4c_regression','du_phase4c_1','charge.dispute.updated','needs_response','general',3000,'eur','pi_test_phase4c','ch_test_phase4c','2026-10-27 12:00+00','2026-10-25 12:00+00','needs_response','general',3000,'eur','pi_test_phase4c','ch_test_phase4c','2026-10-27 12:00+00','2026-10-25 13:08+00') into r;
select * into s from public.stripe_dispute_current_state where dispute_id='du_phase4c_1'; select count(*) into closed_ledger from public.ledger_entries where booking_id='71000000-0000-0000-0000-000000000001' and kind='dispute_closed' and stripe_object_id='du_phase4c_1';
if s.current_status<>'won' or s.needs_reconciliation is not true or (r->>'projection_applied')::boolean is not false or closed_ledger<>1 then raise exception 'Terminal regression guard failed state=% result=% ledger=%',s,r,closed_ledger; end if; end $$;

do $$ begin if has_function_privilege('service_role','public.record_stripe_dispute_event(text,text,text,text,text,integer,text,text,text,timestamptz,timestamptz)','EXECUTE') then raise exception 'Deprecated event-only dispute intake remains executable by service_role'; end if; end $$;
create or replace function auth.uid() returns uuid language sql stable as $$ select '70000000-0000-0000-0000-000000000003'::uuid $$;
do $$ declare h jsonb; begin select public.admin_booking_launch_health('2026-10-25 13:10+00') into h; if h->>'schema_version'<>'smart_parrot_booking_launch_health_v1' or h->>'status'<>'attention' or (h->'counts'->>'disputes_needing_reconciliation')::int<>1 or (h->'counts'->>'open_review_cases')::int<>1 then raise exception 'Launch-health summary mismatch: %',h; end if; if h::text like '%pi_test_phase4c%' or h::text like '%ch_test_phase4c%' or h::text like '%Phase4C Student%' then raise exception 'Launch-health summary leaked provider/customer detail: %',h; end if; end $$;
select public.record_stripe_dispute_event_v2('evt_phase4c_unmatched','du_phase4c_unmatched','charge.dispute.created','needs_response','unrecognized',1200,'eur','pi_test_unknown_phase4c','ch_test_unknown_phase4c','2026-10-27 12:00+00','2026-10-25 13:09+00','needs_response','unrecognized',1200,'eur','pi_test_unknown_phase4c','ch_test_unknown_phase4c','2026-10-27 12:00+00','2026-10-25 13:09:05+00');
do $$ declare n int; begin select count(*) into n from public.admin_review_queue(100,'2026-10-25 13:10+00') q where q.source='stripe_dispute_unmatched' and q.booking_id is null and q.summary like '%current status needs_response%'; if n<>1 then raise exception 'Provider-refreshed unmatched dispute queue item missing'; end if; end $$;
create or replace function auth.uid() returns uuid language sql stable as $$ select '70000000-0000-0000-0000-000000000004'::uuid $$;
do $$ begin begin perform public.admin_booking_launch_health('2026-10-25 13:10+00'); raise exception 'Non-admin launch health unexpectedly succeeded'; exception when insufficient_privilege then null; end; end $$;
rollback;
