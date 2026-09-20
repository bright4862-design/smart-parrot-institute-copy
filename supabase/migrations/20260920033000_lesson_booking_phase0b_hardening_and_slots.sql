-- Smart Parrot Institute lesson-booking Phase 0B
-- Hardens immutable evidence, isolates trigger-only privileged code, and exposes
-- only a bounded free-slot RPC. No payment mutation or live credential is added.

create schema if not exists private;

-- The original foundation migration used a generic Auth trigger name. Replace it
-- with a project-specific trigger/function so this booking domain does not keep a
-- generic public SECURITY DEFINER function around.
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists smart_parrot_booking_user_created on auth.users;

create or replace function private.smart_parrot_booking_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger smart_parrot_booking_user_created
after insert on auth.users
for each row execute function private.smart_parrot_booking_handle_new_user();

drop function if exists public.handle_new_user();
revoke all on schema private from public, anon, authenticated;
revoke execute on function private.smart_parrot_booking_handle_new_user() from public, anon, authenticated;

-- Attendance, consent, and ledger rows are dispute evidence. A booking must not
-- be deletable in a way that cascades those records away.
alter table public.attendance_events
  drop constraint if exists attendance_events_booking_id_fkey;
alter table public.attendance_events
  add constraint attendance_events_booking_id_fkey
  foreign key (booking_id) references public.bookings (id) on delete restrict;

alter table public.consents
  drop constraint if exists consents_booking_id_fkey;
alter table public.consents
  add constraint consents_booking_id_fkey
  foreign key (booking_id) references public.bookings (id) on delete restrict;

alter table public.ledger_entries
  drop constraint if exists ledger_entries_booking_id_fkey;
alter table public.ledger_entries
  add constraint ledger_entries_booking_id_fkey
  foreign key (booking_id) references public.bookings (id) on delete restrict;

-- Privileged helper: it can inspect bookings without granting anonymous callers
-- direct SELECT access to bookings. The schema is not exposed through the Data API.
create or replace function private.smart_parrot_available_slots(
  p_lesson_type_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (slot_start timestamptz, slot_end timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with lesson as (
    select lt.tutor_id, lt.duration_minutes
    from public.lesson_types lt
    where lt.id = p_lesson_type_id
      and lt.active
  ),
  candidates as (
    select distinct
      gs as slot_start,
      gs + make_interval(mins => lesson.duration_minutes) as slot_end,
      lesson.tutor_id
    from lesson
    join public.availability_windows w
      on w.tutor_id = lesson.tutor_id
     and w.period && tstzrange(p_from, p_to, '[)')
    cross join lateral generate_series(
      date_trunc('hour', greatest(lower(w.period), p_from)),
      least(upper(w.period), p_to),
      interval '15 minutes'
    ) as gs
  )
  select c.slot_start, c.slot_end
  from candidates c
  where c.slot_start >= p_from
    and c.slot_end <= p_to
    and c.slot_start > now() + interval '2 hours'
    and exists (
      select 1
      from public.availability_windows w
      where w.tutor_id = c.tutor_id
        and w.period @> tstzrange(c.slot_start, c.slot_end, '[)')
    )
    and not exists (
      select 1
      from public.bookings b
      where b.tutor_id = c.tutor_id
        and b.status <> 'cancelled'
        and b.slot && tstzrange(c.slot_start, c.slot_end, '[)')
    )
  order by c.slot_start;
$$;

-- Only this public, SECURITY INVOKER wrapper is exposed as RPC. It validates the
-- query window before delegating to the private helper.
create or replace function public.available_slots(
  p_lesson_type_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (slot_start timestamptz, slot_end timestamptz)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_lesson_type_id is null or p_from is null or p_to is null then
    raise exception 'lesson type and time range are required' using errcode = '22023';
  end if;

  if p_to <= p_from then
    raise exception 'p_to must be after p_from' using errcode = '22023';
  end if;

  if p_to > p_from + interval '31 days' then
    raise exception 'availability range cannot exceed 31 days' using errcode = '22023';
  end if;

  return query
  select s.slot_start, s.slot_end
  from private.smart_parrot_available_slots(p_lesson_type_id, p_from, p_to) s;
end;
$$;

revoke execute on function public.available_slots(uuid, timestamptz, timestamptz)
  from public;
revoke execute on function private.smart_parrot_available_slots(uuid, timestamptz, timestamptz)
  from public;

-- The public wrapper executes as the caller, so callers need schema USAGE and
-- EXECUTE on the private helper. `private` remains outside the exposed API schemas.
grant usage on schema private to anon, authenticated;
grant execute on function private.smart_parrot_available_slots(uuid, timestamptz, timestamptz)
  to anon, authenticated;
grant execute on function public.available_slots(uuid, timestamptz, timestamptz)
  to anon, authenticated;
