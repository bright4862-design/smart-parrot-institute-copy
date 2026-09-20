-- Behavioral regression scenarios for Phase 4A admin operations/evidence export.
-- Runs only in ephemeral CI PostgreSQL and rolls back all fixture data.

begin;

insert into public.policy_versions(id,config,terms_markdown,terms_sha256,published_at) values (
  'ci-phase4a-2026-10-01',
  '{"free_cancel_hours":24,"late_cancel_hours":2,"late_cancel_pct":50,"withdrawal_mode":"review_required"}'::jsonb,
  'CI Phase 4A immutable terms',
  'ci-phase4a-policy-sha256',
  '2026-10-01 00:00+00'
);

insert into auth.users(id,raw_user_meta_data) values
  ('50000000-0000-0000-0000-000000000001','{"full_name":"Phase4A Student"}'),
  ('50000000-0000-0000-0000-000000000002','{"full_name":"Phase4A Tutor"}'),
  ('50000000-0000-0000-0000-000000000003','{"full_name":"Phase4A Admin"}'),
  ('50000000-0000-0000-0000-000000000004','{"full_name":"Phase4A Outsider"}');
update public.profiles set role='tutor' where id='50000000-0000-0000-0000-000000000002';
update public.profiles set role='admin' where id='50000000-0000-0000-0000-000000000003';
insert into public.tutors(id,bio) values ('50000000-0000-0000-0000-000000000002','Phase 4A tutor');
insert into public.lesson_types(id,tutor_id,name,duration_minutes,on_time_price_cents,currency) values (
  '50000000-0000-0000-0000-000000000010','50000000-0000-0000-0000-000000000002','Phase 4A English',45,3000,'eur'
);

insert into public.bookings(
  id,student_id,tutor_id,lesson_type_id,policy_version_id,starts_at,ends_at,status,currency,on_time_price_cents,max_charge_cents,
  hold_strategy,stripe_payment_intent_id,capture_before,final_amount_cents,outcome,settled_at,created_at
) values
  ('51000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000010','ci-phase4a-2026-10-01','2026-10-10 10:00+00','2026-10-10 10:45+00','settled','eur',3000,3600,'at_checkout','pi_test_phase4a_settled','2026-10-12 00:00+00',3000,'on_time','2026-10-10 12:00+00','2026-10-01 09:00+00'),
  ('51000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000010','ci-phase4a-2026-10-01','2026-10-12 08:00+00','2026-10-12 08:45+00','hold_failed','eur',3000,3600,'deferred',null,null,null,null,null,'2026-10-01 09:00+00'),
  ('51000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000010','ci-phase4a-2026-10-01','2026-10-14 10:00+00','2026-10-14 10:45+00','cancelled','eur',3000,3600,'deferred',null,null,0,'cancelled_free',null,'2026-10-01 09:00+00');

insert into public.consents(user_id,booking_id,policy_version_id,terms_sha256,checkbox_text,express_start_request,accepted_at,ip,user_agent)
values ('50000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001','ci-phase4a-2026-10-01','ci-phase4a-policy-sha256','I accept the lesson terms',true,'2026-10-01 09:01+00','203.0.113.10','CI sensitive UA');

insert into public.attendance_events(booking_id,actor,kind,source,occurred_at,received_at,external_id,ip,user_agent,raw) values
  ('51000000-0000-0000-0000-000000000001','student','joined','daily_webhook','2026-10-10 10:00+00','2026-10-10 10:00:01+00','daily-sensitive-student','203.0.113.11','CI sensitive UA','{"sensitive":"raw-student"}'),
  ('51000000-0000-0000-0000-000000000001','tutor','joined','daily_webhook','2026-10-10 09:59+00','2026-10-10 09:59:01+00','daily-sensitive-tutor','203.0.113.12','CI sensitive UA','{"sensitive":"raw-tutor"}');

insert into public.ledger_entries(booking_id,kind,amount_cents,currency,stripe_object_id,note,created_at) values
  ('51000000-0000-0000-0000-000000000001','captured',3000,'eur','pi_test_phase4a_settled','settlement','2026-10-10 12:00+00'),
  ('51000000-0000-0000-0000-000000000002','hold_failed',0,'eur',null,'authentication_required','2026-10-11 23:00+00');

insert into public.booking_cancellation_requests(
  booking_id,requested_by,actor_role,kind,requested_at,policy_version_id,terms_sha256,outcome,amount_cents,payment_action,
  request_ip,user_agent,declaration_name,declaration_contact
) values (
  '51000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000001','student','cancel','2026-10-10 09:00+00',
  'ci-phase4a-2026-10-01','ci-phase4a-policy-sha256','cancelled_free',0,'none','203.0.113.13','CI sensitive UA',null,null
);

insert into public.compliance_notice_outbox(
  booking_id,user_id,kind,payload,queued_at,delivery_attempts,last_attempt_at,dead_lettered_at,last_error_code
) values (
  '51000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000001','cancellation_confirmation',
  '{"booking_id":"51000000-0000-0000-0000-000000000003"}'::jsonb,'2026-10-10 09:01+00',6,'2026-10-10 12:00+00','2026-10-10 12:01+00','provider_permanent_failure'
);

create or replace function auth.uid()
returns uuid language sql stable as $$
  select '50000000-0000-0000-0000-000000000003'::uuid;
$$;

-- Opening the same active case is idempotent and produces one append-only opened event.
do $$
declare c1 uuid; c2 uuid; events int;
begin
  select public.admin_open_review_case('51000000-0000-0000-0000-000000000001','dispute','Customer questioned the lesson charge','high') into c1;
  select public.admin_open_review_case('51000000-0000-0000-0000-000000000001','dispute','Retry should reuse active case','urgent') into c2;
  if c1 is null or c2<>c1 then raise exception 'Admin case idempotency mismatch c1=% c2=%',c1,c2; end if;
  select count(*) into events from public.admin_review_case_events e where e.case_id=c1 and e.action='opened';
  if events<>1 then raise exception 'Expected exactly one opened event, got %',events; end if;
end $$;

-- Queue combines the manual case with operational alerts without exposing provider payloads.
do $$
declare manual_count int; hold_count int; compliance_count int;
begin
  select count(*) into manual_count from public.admin_review_queue(50,'2026-10-12 00:00+00') q
  where q.source='manual_case' and q.booking_id='51000000-0000-0000-0000-000000000001';
  select count(*) into hold_count from public.admin_review_queue(50,'2026-10-12 00:00+00') q
  where q.source='payment_hold' and q.booking_id='51000000-0000-0000-0000-000000000002' and q.severity='urgent';
  select count(*) into compliance_count from public.admin_review_queue(50,'2026-10-12 00:00+00') q
  where q.source='compliance_delivery' and q.booking_id='51000000-0000-0000-0000-000000000003' and q.severity='urgent';
  if manual_count<>1 or hold_count<>1 or compliance_count<>1 then
    raise exception 'Admin queue mismatch manual=% hold=% compliance=%',manual_count,hold_count,compliance_count;
  end if;
end $$;

-- Customer-support export is minimized: no raw attendance, IP, UA or provider references.
do $$
declare p jsonb; access_count int;
begin
  select public.admin_export_booking_evidence('51000000-0000-0000-0000-000000000001','customer_support') into p;
  if p->>'schema_version'<>'smart_parrot_booking_evidence_v1' or p->>'purpose'<>'customer_support' then
    raise exception 'Evidence packet header mismatch: %',p;
  end if;
  if p::text like '%raw-student%' or p::text like '%203.0.113.%' or p::text like '%CI sensitive UA%'
     or p::text like '%daily-sensitive-student%' or p::text like '%pi_test_phase4a_settled%' then
    raise exception 'Minimized evidence packet leaked sensitive/provider data: %',p;
  end if;
  if jsonb_array_length(p->'attendance')<>2 or jsonb_array_length(p->'consents')<>1 or jsonb_array_length(p->'ledger')<>1 then
    raise exception 'Evidence packet omitted required evidence: %',p;
  end if;
  select count(*) into access_count from public.admin_evidence_access_log a
  where a.booking_id='51000000-0000-0000-0000-000000000001' and a.admin_id='50000000-0000-0000-0000-000000000003'
    and a.purpose='customer_support' and a.fields_profile='minimized_v1';
  if access_count<>1 then raise exception 'Evidence export audit missing'; end if;
end $$;

-- Payment-dispute export may include provider correlation IDs, still never raw/IP/UA.
do $$
declare p jsonb;
begin
  select public.admin_export_booking_evidence('51000000-0000-0000-0000-000000000001','payment_dispute') into p;
  if p::text not like '%daily-sensitive-student%' or p::text not like '%pi_test_phase4a_settled%' then
    raise exception 'Payment dispute packet missing provider correlation IDs: %',p;
  end if;
  if p::text like '%raw-student%' or p::text like '%203.0.113.%' or p::text like '%CI sensitive UA%' then
    raise exception 'Payment dispute packet leaked raw/IP/UA data: %',p;
  end if;
end $$;

-- Non-admin authenticated users fail closed even though the RPCs are granted to authenticated.
create or replace function auth.uid()
returns uuid language sql stable as $$
  select '50000000-0000-0000-0000-000000000004'::uuid;
$$;

do $$
begin
  begin
    perform public.admin_review_queue(10,'2026-10-12 00:00+00');
    raise exception 'Non-admin queue access unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_export_booking_evidence('51000000-0000-0000-0000-000000000001','customer_support');
    raise exception 'Non-admin evidence export unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

create or replace function auth.uid()
returns uuid language sql stable as $$
  select '50000000-0000-0000-0000-000000000003'::uuid;
$$;

-- Resolution is retry-idempotent and audit logged. Append-only audit rows reject mutation.
do $$
declare c uuid; ok boolean; resolved_events int;
begin
  select id into c from public.admin_review_cases where booking_id='51000000-0000-0000-0000-000000000001' and kind='dispute';
  select public.admin_resolve_review_case(c,'Evidence reviewed; no provider submission performed in Phase 4A') into ok;
  if ok is not true then raise exception 'Admin case did not resolve'; end if;
  select public.admin_resolve_review_case(c,'Evidence reviewed; no provider submission performed in Phase 4A') into ok;
  if ok is not true then raise exception 'Admin case resolution retry was not idempotent'; end if;
  select count(*) into resolved_events from public.admin_review_case_events e where e.case_id=c and e.action='resolved';
  if resolved_events<>1 then raise exception 'Expected exactly one resolved event, got %',resolved_events; end if;

  begin
    update public.admin_evidence_access_log set fields_profile='tampered' where booking_id='51000000-0000-0000-0000-000000000001';
    raise exception 'Append-only evidence access log accepted update';
  exception when raise_exception then
    if position('append-only' in sqlerrm)=0 then raise; end if;
  end;
end $$;

rollback;
