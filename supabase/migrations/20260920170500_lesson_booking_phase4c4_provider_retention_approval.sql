-- Smart Parrot Institute lesson-booking Phase 4C4
-- Controlled retention-policy approval metadata. This migration changes governance
-- state only. It does not erase, archive, anonymize, charge, refund, deploy, publish,
-- or contact an external provider.

alter table public.lesson_booking_retention_classes
  add column if not exists approved_by uuid references public.profiles(id) on delete restrict,
  add column if not exists approval_reference text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.lesson_booking_retention_classes'::regclass
      and conname='lesson_booking_retention_classes_reviewed_approval_check'
  ) then
    alter table public.lesson_booking_retention_classes
      add constraint lesson_booking_retention_classes_reviewed_approval_check check (
        (active_retention_days is null and archive_retention_days is null
          and approved_at is null and approved_by is null and approval_reference is null)
        or
        (active_retention_days is not null and approved_at is not null and approved_by is not null
          and source_authority is not null and approval_reference is not null
          and length(trim(source_authority)) between 3 and 500
          and length(trim(approval_reference)) between 3 and 200)
      );
  end if;
end $$;

create table if not exists public.lesson_booking_retention_approval_events (
  id bigint generated always as identity primary key,
  retention_class_code text not null references public.lesson_booking_retention_classes(code) on delete restrict,
  admin_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('approved','approval_revoked')),
  reason_code text not null check (reason_code ~ '^[a-z0-9][a-z0-9_.-]{2,79}$'),
  details jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);

alter table public.lesson_booking_retention_approval_events enable row level security;
revoke all on table public.lesson_booking_retention_approval_events from anon, authenticated;
revoke all on sequence public.lesson_booking_retention_approval_events_id_seq from anon, authenticated;

drop trigger if exists lesson_booking_retention_approval_events_append_only on public.lesson_booking_retention_approval_events;
create trigger lesson_booking_retention_approval_events_append_only
before update or delete on public.lesson_booking_retention_approval_events
for each row execute function public.forbid_change();

create or replace function public.admin_approve_booking_retention_class(
  p_code text,
  p_active_retention_days int,
  p_archive_retention_days int,
  p_source_authority text,
  p_review_reference text,
  p_reason_code text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid := auth.uid();
  old_row public.lesson_booking_retention_classes%rowtype;
  new_row public.lesson_booking_retention_classes%rowtype;
  v_source_authority text := trim(coalesce(p_source_authority,''));
  v_review_reference text := trim(coalesce(p_review_reference,''));
  v_reason_code text := lower(trim(coalesce(p_reason_code,'')));
begin
  perform private.smart_parrot_require_admin(uid);
  if p_code is null or p_active_retention_days is null or p_active_retention_days<1
     or (p_archive_retention_days is not null and p_archive_retention_days<1)
     or length(v_source_authority) not between 3 and 500
     or length(v_review_reference) not between 3 and 200
     or v_reason_code !~ '^[a-z0-9][a-z0-9_.-]{2,79}$' then
    raise exception 'invalid_retention_approval_request' using errcode='22023';
  end if;

  select * into old_row
  from public.lesson_booking_retention_classes c
  where c.code=p_code
  for update;
  if not found then raise exception 'retention_class_not_found' using errcode='P0002'; end if;

  update public.lesson_booking_retention_classes c
  set active_retention_days=p_active_retention_days,
      archive_retention_days=p_archive_retention_days,
      source_authority=v_source_authority,
      approved_at=clock_timestamp(),
      approved_by=uid,
      approval_reference=v_review_reference,
      updated_at=clock_timestamp()
  where c.code=p_code
  returning * into new_row;

  insert into public.lesson_booking_retention_approval_events(
    retention_class_code,admin_id,action,reason_code,details
  ) values (
    p_code,uid,'approved',v_reason_code,
    jsonb_build_object(
      'previous_active_retention_days',old_row.active_retention_days,
      'previous_archive_retention_days',old_row.archive_retention_days,
      'new_active_retention_days',new_row.active_retention_days,
      'new_archive_retention_days',new_row.archive_retention_days,
      'source_authority',new_row.source_authority,
      'approval_reference',new_row.approval_reference
    )
  );

  return jsonb_build_object(
    'schema_version','smart_parrot_retention_approval_v1',
    'retention_class',new_row.code,
    'status','approved',
    'active_retention_days',new_row.active_retention_days,
    'archive_retention_days',new_row.archive_retention_days,
    'approved_at',new_row.approved_at,
    'automatic_erasure_enabled',false
  );
end;
$$;

create or replace function public.admin_revoke_booking_retention_class_approval(
  p_code text,
  p_reason_code text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid := auth.uid();
  old_row public.lesson_booking_retention_classes%rowtype;
  v_reason_code text := lower(trim(coalesce(p_reason_code,'')));
begin
  perform private.smart_parrot_require_admin(uid);
  if p_code is null or v_reason_code !~ '^[a-z0-9][a-z0-9_.-]{2,79}$' then
    raise exception 'invalid_retention_approval_revoke_request' using errcode='22023';
  end if;

  select * into old_row
  from public.lesson_booking_retention_classes c
  where c.code=p_code
  for update;
  if not found then raise exception 'retention_class_not_found' using errcode='P0002'; end if;
  if old_row.approved_at is null then raise exception 'retention_class_not_approved' using errcode='22023'; end if;

  update public.lesson_booking_retention_classes c
  set active_retention_days=null,
      archive_retention_days=null,
      source_authority=null,
      approved_at=null,
      approved_by=null,
      approval_reference=null,
      updated_at=clock_timestamp()
  where c.code=p_code;

  insert into public.lesson_booking_retention_approval_events(
    retention_class_code,admin_id,action,reason_code,details
  ) values (
    p_code,uid,'approval_revoked',v_reason_code,
    jsonb_build_object(
      'previous_active_retention_days',old_row.active_retention_days,
      'previous_archive_retention_days',old_row.archive_retention_days,
      'previous_source_authority',old_row.source_authority,
      'previous_approval_reference',old_row.approval_reference
    )
  );

  return jsonb_build_object(
    'schema_version','smart_parrot_retention_approval_v1',
    'retention_class',p_code,
    'status','approved_duration_required',
    'automatic_erasure_enabled',false
  );
end;
$$;

create or replace function public.admin_booking_retention_options()
returns table(
  code text,
  purpose text,
  period_status text,
  active_retention_days int,
  archive_retention_days int
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare uid uuid := auth.uid();
begin
  perform private.smart_parrot_require_admin(uid);
  return query
  select c.code,
         c.purpose,
         case
           when c.approved_at is null or c.approved_by is null or c.approval_reference is null
             or c.source_authority is null or c.active_retention_days is null
             then 'approved_duration_required'::text
           else 'approved'::text
         end,
         c.active_retention_days,
         c.archive_retention_days
  from public.lesson_booking_retention_classes c
  order by c.code;
end;
$$;

revoke all on function public.admin_approve_booking_retention_class(text,int,int,text,text,text) from public, anon, authenticated;
revoke all on function public.admin_revoke_booking_retention_class_approval(text,text) from public, anon, authenticated;
grant execute on function public.admin_approve_booking_retention_class(text,int,int,text,text,text) to authenticated;
grant execute on function public.admin_revoke_booking_retention_class_approval(text,text) to authenticated;

comment on table public.lesson_booking_retention_approval_events is 'Append-only audit of reviewed retention-duration approvals/revocations. No erasure authority.';
comment on function public.admin_approve_booking_retention_class(text,int,int,text,text,text) is 'Admin-only reviewed retention approval. Requires explicit durations, source authority, and review reference; never erases data.';
comment on function public.admin_revoke_booking_retention_class_approval(text,text) is 'Admin-only approval revocation that returns a class to fail-closed unapproved state; never erases data.';
