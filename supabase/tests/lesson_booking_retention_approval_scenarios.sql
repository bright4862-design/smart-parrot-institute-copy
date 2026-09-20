-- Phase 4C4 retention approval governance scenarios. Ephemeral CI only.
begin;

insert into auth.users(id,raw_user_meta_data) values
  ('74000000-0000-0000-0000-000000000001','{"full_name":"Phase4C4 Admin"}'),
  ('74000000-0000-0000-0000-000000000002','{"full_name":"Phase4C4 Outsider"}');
update public.profiles set role='admin' where id='74000000-0000-0000-0000-000000000001';

create or replace function auth.uid() returns uuid language sql stable as $$ select '74000000-0000-0000-0000-000000000001'::uuid $$;

select public.admin_approve_booking_retention_class(
  'booking_operations',
  365,
  730,
  'Reviewed Smart Parrot retention schedule approved by legal/DPO',
  'legal-review-2026-09-20-v1',
  'legal_review_approved'
);

do $$ declare r public.lesson_booking_retention_classes%rowtype; n int; s text; begin
  select * into r from public.lesson_booking_retention_classes where code='booking_operations';
  if r.active_retention_days<>365 or r.archive_retention_days<>730
     or r.approved_by<>'74000000-0000-0000-0000-000000000001'::uuid
     or r.approval_reference<>'legal-review-2026-09-20-v1'
     or r.approved_at is null then
    raise exception 'Reviewed retention approval was not persisted: %',row_to_json(r);
  end if;
  select period_status into s from public.admin_booking_retention_options() where code='booking_operations';
  if s<>'approved' then raise exception 'Approved class did not become approved: %',s; end if;
  select count(*) into n from public.lesson_booking_retention_approval_events
    where retention_class_code='booking_operations' and action='approved' and admin_id='74000000-0000-0000-0000-000000000001';
  if n<>1 then raise exception 'Approval audit event mismatch: %',n; end if;
end $$;

do $$ declare blocked boolean:=false; begin
  begin
    update public.lesson_booking_retention_approval_events set reason_code='tamper' where retention_class_code='booking_operations';
  exception when others then blocked:=true; end;
  if not blocked then raise exception 'Retention approval audit event was mutable'; end if;
end $$;

do $$ declare blocked boolean:=false; begin
  begin
    perform public.admin_approve_booking_retention_class(
      'payment_evidence',0,null,'Reviewed source','legal-review-invalid','legal_review_approved'
    );
  exception when sqlstate '22023' then blocked:=true; end;
  if not blocked then raise exception 'Zero-day retention approval unexpectedly succeeded'; end if;
end $$;

select public.admin_revoke_booking_retention_class_approval('booking_operations','legal_review_superseded');

do $$ declare r public.lesson_booking_retention_classes%rowtype; n int; s text; begin
  select * into r from public.lesson_booking_retention_classes where code='booking_operations';
  if r.active_retention_days is not null or r.archive_retention_days is not null
     or r.source_authority is not null or r.approved_at is not null
     or r.approved_by is not null or r.approval_reference is not null then
    raise exception 'Approval revocation did not fail closed: %',row_to_json(r);
  end if;
  select period_status into s from public.admin_booking_retention_options() where code='booking_operations';
  if s<>'approved_duration_required' then raise exception 'Revoked class did not fail closed: %',s; end if;
  select count(*) into n from public.lesson_booking_retention_approval_events
    where retention_class_code='booking_operations' and action='approval_revoked';
  if n<>1 then raise exception 'Approval revocation audit event mismatch: %',n; end if;
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$ select '74000000-0000-0000-0000-000000000002'::uuid $$;

do $$ declare blocked boolean:=false; begin
  begin
    perform public.admin_approve_booking_retention_class(
      'booking_operations',365,null,'Reviewed source authority','legal-review-outsider','legal_review_approved'
    );
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Non-admin retention approval unexpectedly succeeded'; end if;
end $$;

rollback;
