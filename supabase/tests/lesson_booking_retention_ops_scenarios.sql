-- Phase 4C3 retention operations + launch-health scenarios. Ephemeral CI only.
begin;

insert into public.policy_versions(id,config,terms_markdown,terms_sha256,published_at)
values ('ci-phase4c3-2026-09-20','{"withdrawal_mode":"review_required"}'::jsonb,'CI Phase 4C3 terms','ci-phase4c3-sha','2026-09-20 00:00+00');
insert into auth.users(id,raw_user_meta_data) values
  ('73000000-0000-0000-0000-000000000001','{"full_name":"Phase4C3 Student"}'),
  ('73000000-0000-0000-0000-000000000002','{"full_name":"Phase4C3 Tutor"}'),
  ('73000000-0000-0000-0000-000000000003','{"full_name":"Phase4C3 Admin"}'),
  ('73000000-0000-0000-0000-000000000004','{"full_name":"Phase4C3 Outsider"}');
update public.profiles set role='tutor' where id='73000000-0000-0000-0000-000000000002';
update public.profiles set role='admin' where id='73000000-0000-0000-0000-000000000003';
insert into public.tutors(id,bio) values ('73000000-0000-0000-0000-000000000002','Phase4C3 tutor');
insert into public.lesson_types(id,tutor_id,name,duration_minutes,on_time_price_cents,currency)
values ('73000000-0000-0000-0000-000000000010','73000000-0000-0000-0000-000000000002','Phase4C3 English',45,3000,'eur');

insert into public.bookings(id,student_id,tutor_id,lesson_type_id,policy_version_id,starts_at,ends_at,status,currency,on_time_price_cents,max_charge_cents,hold_strategy,final_amount_cents,outcome,settled_at,created_at)
values
  ('73100000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000002','73000000-0000-0000-0000-000000000010','ci-phase4c3-2026-09-20','2026-09-25 10:00+00','2026-09-25 10:45+00','settled','eur',3000,3600,'at_checkout',3000,'on_time','2026-09-25 12:00+00','2026-09-20 09:00+00'),
  ('73100000-0000-0000-0000-000000000002','73000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000002','73000000-0000-0000-0000-000000000010','ci-phase4c3-2026-09-20','2026-09-26 10:00+00','2026-09-26 10:45+00','settled','eur',3000,3600,'at_checkout',3000,'on_time','2026-09-26 12:00+00','2026-09-20 09:05+00');

insert into public.consents(user_id,booking_id,policy_version_id,terms_sha256,checkbox_text,accepted_at)
values ('73000000-0000-0000-0000-000000000001','73100000-0000-0000-0000-000000000001','ci-phase4c3-2026-09-20','ci-phase4c3-sha','I accept the CI terms','2026-09-20 09:00+00');

create or replace function auth.uid() returns uuid language sql stable as $$ select '73000000-0000-0000-0000-000000000003'::uuid $$;

select public.admin_set_booking_retention_control(
  '73100000-0000-0000-0000-000000000002','payment_evidence',true,'payment_dispute_review','2026-09-19'
);

do $$ declare r jsonb; begin
  select public.admin_booking_launch_health('2026-09-20 15:00+00') into r;
  if r->>'schema_version'<>'smart_parrot_booking_launch_health_v2' then
    raise exception 'Launch-health schema was not upgraded: %',r;
  end if;
  if coalesce((r#>>'{counts,unclassified_evidence_bookings}')::int,0)<1 then
    raise exception 'Unclassified evidence booking was not surfaced: %',r;
  end if;
  if coalesce((r#>>'{counts,overdue_legal_hold_reviews}')::int,0)<1 then
    raise exception 'Overdue legal-hold review was not surfaced: %',r;
  end if;
  if coalesce((r#>>'{counts,unapproved_retention_classes}')::int,0)<4 then
    raise exception 'Unapproved retention classes were not surfaced: %',r;
  end if;
  if (r->>'attention_count')::int < 3 or r->>'status'<>'attention' then
    raise exception 'Retention governance gaps did not affect health: %',r;
  end if;
end $$;

do $$ declare n int; begin
  select count(*) into n from public.admin_review_queue(100,'2026-09-20 15:00+00') q
    where q.source='retention_unclassified' and q.booking_id='73100000-0000-0000-0000-000000000001';
  if n<>1 then raise exception 'Unclassified retention queue item mismatch: %',n; end if;
  select count(*) into n from public.admin_review_queue(100,'2026-09-20 15:00+00') q
    where q.source='retention_review_overdue' and q.booking_id='73100000-0000-0000-0000-000000000002';
  if n<>1 then raise exception 'Overdue legal-hold queue item mismatch: %',n; end if;
  select count(*) into n from public.admin_review_queue(100,'2026-09-20 15:00+00') q
    where q.source='retention_policy_unapproved' and q.booking_id is null;
  if n<>1 then raise exception 'Unapproved retention policy queue item mismatch: %',n; end if;
end $$;

do $$ declare n int; bad int; begin
  select count(*),count(*) filter (where period_status<>'approved_duration_required')
    into n,bad from public.admin_booking_retention_options();
  if n<>4 or bad<>0 then raise exception 'Retention options are not authoritative/fail-closed: count=% bad=%',n,bad; end if;
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$ select '73000000-0000-0000-0000-000000000004'::uuid $$;

do $$ declare blocked boolean := false; begin
  begin perform public.admin_booking_retention_options();
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Non-admin retention options unexpectedly succeeded'; end if;
end $$;

do $$ declare blocked boolean := false; begin
  begin perform public.admin_booking_launch_health('2026-09-20 15:00+00');
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Non-admin launch health unexpectedly succeeded'; end if;
end $$;

rollback;
