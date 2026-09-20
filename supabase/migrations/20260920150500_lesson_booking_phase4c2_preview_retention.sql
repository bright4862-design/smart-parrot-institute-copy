-- Smart Parrot Institute lesson-booking Phase 4C2
-- Preview-readiness governance + configurable retention/legal-hold metadata.
-- No automatic erasure is introduced by this migration. Retention durations are
-- deliberately NULL until a documented France/EU/accounting decision approves them.

create table if not exists public.lesson_booking_retention_classes (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{2,63}$'),
  purpose text not null check (length(trim(purpose)) between 3 and 500),
  active_retention_days int check (active_retention_days is null or active_retention_days > 0),
  archive_retention_days int check (archive_retention_days is null or archive_retention_days > 0),
  source_authority text check (source_authority is null or length(trim(source_authority)) between 3 and 500),
  approved_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  check (
    (active_retention_days is null and archive_retention_days is null)
    or (approved_at is not null and source_authority is not null)
  )
);

insert into public.lesson_booking_retention_classes(code,purpose)
values
  ('booking_operations','Active booking operations and customer-service data'),
  ('payment_evidence','Payment authorization, capture, recovery, ledger, and dispute evidence'),
  ('consumer_compliance','Cancellation, withdrawal, policy, consent, and durable-medium evidence'),
  ('legal_claim_archive','Restricted intermediate archive for an identified legal-claim or litigation purpose')
on conflict (code) do nothing;

create table if not exists public.booking_retention_controls (
  booking_id uuid primary key references public.bookings(id) on delete restrict,
  retention_class_code text not null references public.lesson_booking_retention_classes(code) on delete restrict,
  legal_hold boolean not null default false,
  legal_hold_reason_code text,
  legal_hold_set_at timestamptz,
  legal_hold_set_by uuid references public.profiles(id) on delete restrict,
  review_after date,
  updated_at timestamptz not null default clock_timestamp(),
  check (legal_hold_reason_code is null or legal_hold_reason_code ~ '^[a-z0-9][a-z0-9_.-]{2,79}$'),
  check (
    (legal_hold and legal_hold_reason_code is not null and legal_hold_set_at is not null and legal_hold_set_by is not null)
    or (not legal_hold and legal_hold_reason_code is null and legal_hold_set_at is null and legal_hold_set_by is null)
  )
);

create table if not exists public.booking_retention_control_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  admin_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('control_created','class_changed','legal_hold_set','legal_hold_released','review_changed')),
  reason_code text not null check (reason_code ~ '^[a-z0-9][a-z0-9_.-]{2,79}$'),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);

alter table public.lesson_booking_retention_classes enable row level security;
alter table public.booking_retention_controls enable row level security;
alter table public.booking_retention_control_events enable row level security;

revoke all on table public.lesson_booking_retention_classes from anon, authenticated;
revoke all on table public.booking_retention_controls from anon, authenticated;
revoke all on table public.booking_retention_control_events from anon, authenticated;
revoke all on sequence public.booking_retention_control_events_id_seq from anon, authenticated;

drop trigger if exists booking_retention_events_append_only on public.booking_retention_control_events;
create trigger booking_retention_events_append_only
before update or delete on public.booking_retention_control_events
for each row execute function public.forbid_change();

create or replace function private.smart_parrot_retention_forbid_delete()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  raise exception '% cannot be deleted; change governance state through an audited control update', tg_table_name;
end;
$$;

revoke all on function private.smart_parrot_retention_forbid_delete() from public, anon, authenticated;

drop trigger if exists booking_retention_controls_no_delete on public.booking_retention_controls;
create trigger booking_retention_controls_no_delete
before delete on public.booking_retention_controls
for each row execute function private.smart_parrot_retention_forbid_delete();

drop trigger if exists lesson_booking_retention_classes_no_delete on public.lesson_booking_retention_classes;
create trigger lesson_booking_retention_classes_no_delete
before delete on public.lesson_booking_retention_classes
for each row execute function private.smart_parrot_retention_forbid_delete();

create or replace function public.admin_booking_retention_status(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  uid uuid := auth.uid();
  control_row public.booking_retention_controls%rowtype;
  class_row public.lesson_booking_retention_classes%rowtype;
begin
  perform private.smart_parrot_require_admin(uid);
  if p_booking_id is null or not exists(select 1 from public.bookings b where b.id=p_booking_id) then
    raise exception 'booking_not_found' using errcode='P0002';
  end if;

  select * into control_row from public.booking_retention_controls c where c.booking_id=p_booking_id;
  if not found then
    return jsonb_build_object(
      'schema_version','smart_parrot_booking_retention_v1',
      'classified',false,
      'legal_hold',false,
      'period_status','classification_required',
      'automatic_erasure_enabled',false
    );
  end if;

  select * into class_row from public.lesson_booking_retention_classes c where c.code=control_row.retention_class_code;
  return jsonb_build_object(
    'schema_version','smart_parrot_booking_retention_v1',
    'classified',true,
    'retention_class',control_row.retention_class_code,
    'legal_hold',control_row.legal_hold,
    'legal_hold_reason_code',control_row.legal_hold_reason_code,
    'review_after',control_row.review_after,
    'period_status',case
      when class_row.approved_at is null or class_row.active_retention_days is null then 'approved_duration_required'
      else 'approved'
    end,
    'active_retention_days',class_row.active_retention_days,
    'archive_retention_days',class_row.archive_retention_days,
    'automatic_erasure_enabled',false
  );
end;
$$;

create or replace function public.admin_set_booking_retention_control(
  p_booking_id uuid,
  p_retention_class text,
  p_legal_hold boolean,
  p_reason_code text,
  p_review_after date default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid := auth.uid();
  old_row public.booking_retention_controls%rowtype;
  new_row public.booking_retention_controls%rowtype;
  event_action text;
  reason_code text := lower(trim(coalesce(p_reason_code,'')));
begin
  perform private.smart_parrot_require_admin(uid);
  if p_booking_id is null or not exists(select 1 from public.bookings b where b.id=p_booking_id) then
    raise exception 'booking_not_found' using errcode='P0002';
  end if;
  if p_retention_class is null or not exists(select 1 from public.lesson_booking_retention_classes c where c.code=p_retention_class) then
    raise exception 'retention_class_not_found' using errcode='22023';
  end if;
  if p_legal_hold is null or reason_code !~ '^[a-z0-9][a-z0-9_.-]{2,79}$' then
    raise exception 'invalid_retention_control_request' using errcode='22023';
  end if;

  select * into old_row from public.booking_retention_controls c where c.booking_id=p_booking_id for update;

  insert into public.booking_retention_controls(
    booking_id,retention_class_code,legal_hold,legal_hold_reason_code,legal_hold_set_at,legal_hold_set_by,review_after,updated_at
  ) values (
    p_booking_id,p_retention_class,p_legal_hold,
    case when p_legal_hold then reason_code else null end,
    case when p_legal_hold then clock_timestamp() else null end,
    case when p_legal_hold then uid else null end,
    p_review_after,clock_timestamp()
  )
  on conflict (booking_id) do update set
    retention_class_code=excluded.retention_class_code,
    legal_hold=excluded.legal_hold,
    legal_hold_reason_code=excluded.legal_hold_reason_code,
    legal_hold_set_at=case
      when excluded.legal_hold and not public.booking_retention_controls.legal_hold then excluded.legal_hold_set_at
      when excluded.legal_hold then public.booking_retention_controls.legal_hold_set_at
      else null end,
    legal_hold_set_by=case
      when excluded.legal_hold and not public.booking_retention_controls.legal_hold then excluded.legal_hold_set_by
      when excluded.legal_hold then public.booking_retention_controls.legal_hold_set_by
      else null end,
    review_after=excluded.review_after,
    updated_at=clock_timestamp()
  returning * into new_row;

  if old_row.booking_id is null then event_action := 'control_created';
  elsif old_row.legal_hold is false and new_row.legal_hold is true then event_action := 'legal_hold_set';
  elsif old_row.legal_hold is true and new_row.legal_hold is false then event_action := 'legal_hold_released';
  elsif old_row.retention_class_code is distinct from new_row.retention_class_code then event_action := 'class_changed';
  else event_action := 'review_changed'; end if;

  insert into public.booking_retention_control_events(booking_id,admin_id,action,reason_code,details)
  values (p_booking_id,uid,event_action,reason_code,jsonb_build_object(
    'previous_class',old_row.retention_class_code,
    'new_class',new_row.retention_class_code,
    'previous_legal_hold',coalesce(old_row.legal_hold,false),
    'new_legal_hold',new_row.legal_hold,
    'review_after',new_row.review_after
  ));

  return public.admin_booking_retention_status(p_booking_id);
end;
$$;

revoke all on function public.admin_booking_retention_status(uuid) from public, anon, authenticated;
revoke all on function public.admin_set_booking_retention_control(uuid,text,boolean,text,date) from public, anon, authenticated;
grant execute on function public.admin_booking_retention_status(uuid) to authenticated;
grant execute on function public.admin_set_booking_retention_control(uuid,text,boolean,text,date) to authenticated;

comment on table public.lesson_booking_retention_classes is 'Configurable retention classes. Durations remain null until a documented authority approves them; this table does not trigger erasure.';
comment on table public.booking_retention_controls is 'Per-booking retention classification and legal-hold state. Mutable only through audited admin RPCs; deletion is forbidden.';
comment on table public.booking_retention_control_events is 'Append-only audit trail for retention classification and legal-hold changes.';
comment on function public.admin_booking_retention_status(uuid) is 'Admin-only retention/legal-hold metadata. No automatic erasure authority.';
comment on function public.admin_set_booking_retention_control(uuid,text,boolean,text,date) is 'Admin-only audited retention/legal-hold control. Does not erase, anonymize, archive, or move booking evidence.';
