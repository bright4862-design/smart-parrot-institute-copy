-- Phase 4C5D minimized full-preview observer scenarios. Ephemeral CI only.
begin;

insert into auth.users(id,raw_user_meta_data) values
  ('77000000-0000-0000-0000-000000000001','{"full_name":"Phase4C5D Admin"}'),
  ('77000000-0000-0000-0000-000000000002','{"full_name":"Phase4C5D Outsider"}'),
  ('77000000-0000-0000-0000-000000000003','{"full_name":"Phase4C5D Student"}'),
  ('77000000-0000-0000-0000-000000000004','{"full_name":"Phase4C5D Tutor"}');

update public.profiles set role='admin' where id='77000000-0000-0000-0000-000000000001';
update public.profiles set role='tutor' where id='77000000-0000-0000-0000-000000000004';
insert into public.tutors(id,bio,active)
values ('77000000-0000-0000-0000-000000000004','preview tutor',true);

insert into public.lesson_types(
  id,tutor_id,name,duration_minutes,on_time_price_cents,currency,active
) values (
  '77000000-0000-0000-0000-000000000010',
  '77000000-0000-0000-0000-000000000004',
  'Preview English',
  60,4900,'eur',true
);

insert into public.policy_versions(id,config,terms_markdown,terms_sha256,published_at)
values (
  'phase4c5d-policy',
  '{"grace_minutes":5,"no_show_after_minutes":15,"tutor_grace_minutes":5,"capture_delay_minutes":0}',
  'Preview terms',
  repeat('a',64),
  '2026-09-20 18:00+00'
);

insert into public.bookings(
  id,student_id,tutor_id,lesson_type_id,policy_version_id,
  starts_at,ends_at,status,currency,on_time_price_cents,max_charge_cents,
  hold_strategy,hold_attempts,stripe_checkout_mode,stripe_payment_intent_id,
  capture_before,outcome,final_amount_cents,settled_at,settlement_attempts
) values (
  '77000000-0000-0000-0000-000000000020',
  '77000000-0000-0000-0000-000000000003',
  '77000000-0000-0000-0000-000000000004',
  '77000000-0000-0000-0000-000000000010',
  'phase4c5d-policy',
  '2026-09-20 18:00+00','2026-09-20 19:00+00','settled','eur',4900,9900,
  'at_checkout',1,'payment','pi_test_forbidden_observer_value',
  '2026-09-25 18:00+00','on_time',4900,'2026-09-20 19:05+00',1
);

insert into public.consents(
  user_id,booking_id,policy_version_id,terms_sha256,checkbox_text,express_start_request,
  stripe_checkout_session_id,accepted_at,ip,user_agent
) values (
  '77000000-0000-0000-0000-000000000003',
  '77000000-0000-0000-0000-000000000020',
  'phase4c5d-policy',repeat('a',64),'Sensitive checkbox wording',true,
  'cs_test_forbidden_observer_value','2026-09-20 17:55+00','203.0.113.10','Sensitive UA'
);

insert into public.ledger_entries(
  booking_id,kind,amount_cents,currency,stripe_object_id,note,created_at
) values
  ('77000000-0000-0000-0000-000000000020','hold_placed',9900,'eur',
   'pi_test_forbidden_observer_value','sensitive provider note','2026-09-20 17:58+00'),
  ('77000000-0000-0000-0000-000000000020','captured',4900,'eur',
   'pi_test_forbidden_observer_value','sensitive settlement note','2026-09-20 19:05+00'),
  ('77000000-0000-0000-0000-000000000020','hold_released',5000,'eur',
   'pi_test_forbidden_observer_value','sensitive release note','2026-09-20 19:05+00');

insert into public.attendance_events(
  booking_id,actor,kind,source,occurred_at,external_id,ip,user_agent,raw
) values
  ('77000000-0000-0000-0000-000000000020','student','joined','daily_webhook',
   '2026-09-20 18:00+00','daily-sensitive-student','203.0.113.11','Sensitive UA','{"secret":"student"}'),
  ('77000000-0000-0000-0000-000000000020','tutor','joined','daily_webhook',
   '2026-09-20 18:00+00','daily-sensitive-tutor','203.0.113.12','Sensitive UA','{"secret":"tutor"}');

create or replace function auth.uid() returns uuid language sql stable as $$
  select '77000000-0000-0000-0000-000000000001'::uuid
$$;

do $$
declare r jsonb;
begin
  select public.admin_observe_booking_preview_run(
    '77000000-0000-0000-0000-000000000020',
    '2026-09-20 20:00+00'
  ) into r;

  if r->>'booking_status' <> 'settled'
     or r->>'authorization_state' <> 'settled'
     or (r->>'consent_evidence_count')::int <> 1
     or (r->>'payment_ledger_count')::int <> 3
     or (r->>'attendance_evidence_count')::int <> 2
     or (r->>'student_attendance_count')::int <> 1
     or (r->>'tutor_attendance_count')::int <> 1
     or (r->>'settlement_evidence_count')::int <> 2
     or not (r->>'has_payment_intent')::boolean
     or not (r->>'has_capture_deadline')::boolean
     or not (r->>'lesson_end_passed')::boolean
     or not (r->>'settled')::boolean
     or r->>'outcome' <> 'on_time' then
    raise exception 'Unexpected minimized observer result: %', r;
  end if;

  if r::text like '%pi_test_forbidden_observer_value%'
     or r::text like '%cs_test_forbidden_observer_value%'
     or r::text like '%daily-sensitive%'
     or r::text like '%203.0.113.%'
     or r::text like '%Sensitive UA%'
     or r::text like '%Sensitive checkbox%'
     or r::text like '%sensitive provider note%'
     or r::text like '%secret%' then
    raise exception 'Preview observer leaked raw/provider-sensitive evidence: %', r;
  end if;
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$
  select '77000000-0000-0000-0000-000000000002'::uuid
$$;

do $$
declare blocked boolean := false;
begin
  begin
    perform public.admin_observe_booking_preview_run(
      '77000000-0000-0000-0000-000000000020',
      '2026-09-20 20:00+00'
    );
  exception when insufficient_privilege then
    blocked := true;
  end;

  if not blocked then
    raise exception 'Non-admin preview observer unexpectedly succeeded';
  end if;
end $$;

rollback;
