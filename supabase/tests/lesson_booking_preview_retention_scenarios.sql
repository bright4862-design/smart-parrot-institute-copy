-- Phase 4C2 preview-readiness/retention governance scenarios. Ephemeral CI only.
begin;

insert into public.policy_versions(id,config,terms_markdown,terms_sha256,published_at)
values ('ci-phase4c2-2026-09-20','{"withdrawal_mode":"review_required"}'::jsonb,'CI Phase 4C2 terms','ci-phase4c2-sha','2026-09-20 00:00+00');
insert into auth.users(id,raw_user_meta_data) values
  ('72000000-0000-0000-0000-000000000001','{"full_name":"Phase4C2 Student"}'),
  ('72000000-0000-0000-0000-000000000002','{"full_name":"Phase4C2 Tutor"}'),
  ('72000000-0000-0000-0000-000000000003','{"full_name":"Phase4C2 Admin"}'),
  ('72000000-0000-0000-0000-000000000004','{"full_name":"Phase4C2 Outsider"}');
update public.profiles set role='tutor' where id='72000000-0000-0000-0000-000000000002';
update public.profiles set role='admin' where id='72000000-0000-0000-0000-000000000003';
insert into public.tutors(id,bio) values ('72000000-0000-0000-0000-000000000002','Phase4C2 tutor');
insert into public.lesson_types(id,tutor_id,name,duration_minutes,on_time_price_cents,currency)
values ('72000000-0000-0000-0000-000000000010','72000000-0000-0000-0000-000000000002','Phase4C2 English',45,3000,'eur');
insert into public.bookings(id,student_id,tutor_id,lesson_type_id,policy_version_id,starts_at,ends_at,status,currency,on_time_price_cents,max_charge_cents,hold_strategy,final_amount_cents,outcome,settled_at,created_at)
values ('72100000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000002','72000000-0000-0000-0000-000000000010','ci-phase4c2-2026-09-20','2026-09-25 10:00+00','2026-09-25 10:45+00','settled','eur',3000,3600,'at_checkout',3000,'on_time','2026-09-25 12:00+00','2026-09-20 09:00+00');

create or replace function auth.uid() returns uuid language sql stable as $$ select '72000000-0000-0000-0000-000000000003'::uuid $$;

do $$ declare r jsonb; begin
  select public.admin_booking_retention_status('72100000-0000-0000-0000-000000000001') into r;
  if (r->>'classified')::boolean is not false or r->>'period_status'<>'classification_required' or (r->>'automatic_erasure_enabled')::boolean is not false then
    raise exception 'Unclassified retention state did not fail closed: %',r;
  end if;
end $$;

do $$ declare r jsonb; n int; begin
  select public.admin_set_booking_retention_control('72100000-0000-0000-0000-000000000001','payment_evidence',true,'payment_dispute','2026-12-01') into r;
  select count(*) into n from public.booking_retention_control_events where booking_id='72100000-0000-0000-0000-000000000001';
  if (r->>'classified')::boolean is not true or (r->>'legal_hold')::boolean is not true or r->>'retention_class'<>'payment_evidence' or r->>'period_status'<>'approved_duration_required' or (r->>'automatic_erasure_enabled')::boolean is not false or n<>1 then
    raise exception 'Legal hold/classification result mismatch: % events=%',r,n;
  end if;
end $$;

do $$ declare r jsonb; n int; begin
  select public.admin_set_booking_retention_control('72100000-0000-0000-0000-000000000001','payment_evidence',false,'dispute_resolved','2026-12-15') into r;
  select count(*) into n from public.booking_retention_control_events where booking_id='72100000-0000-0000-0000-000000000001';
  if (r->>'legal_hold')::boolean is not false or r->>'legal_hold_reason_code' is not null or n<>2 then
    raise exception 'Legal hold release was not audited correctly: % events=%',r,n;
  end if;
end $$;

do $$ declare blocked boolean := false; begin
  begin
    update public.booking_retention_control_events set reason_code='tampered' where booking_id='72100000-0000-0000-0000-000000000001';
  exception when others then blocked := true; end;
  if not blocked then raise exception 'Retention audit events are not append-only'; end if;
end $$;

do $$ declare blocked boolean := false; begin
  begin
    delete from public.booking_retention_controls where booking_id='72100000-0000-0000-0000-000000000001';
  exception when others then blocked := true; end;
  if not blocked then raise exception 'Retention controls can be deleted'; end if;
end $$;

do $$ declare blocked boolean := false; begin
  begin
    update public.lesson_booking_retention_classes set active_retention_days=30 where code='booking_operations';
  exception when check_violation then blocked := true; end;
  if not blocked then raise exception 'Unapproved retention duration was accepted'; end if;
end $$;

do $$ begin
  if has_table_privilege('authenticated','public.booking_retention_controls','SELECT') or has_table_privilege('authenticated','public.booking_retention_control_events','SELECT') then
    raise exception 'Browser role received direct retention table access';
  end if;
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$ select '72000000-0000-0000-0000-000000000004'::uuid $$;

do $$ declare blocked boolean := false; begin
  begin perform public.admin_booking_retention_status('72100000-0000-0000-0000-000000000001');
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Non-admin retention status unexpectedly succeeded'; end if;
end $$;

rollback;
