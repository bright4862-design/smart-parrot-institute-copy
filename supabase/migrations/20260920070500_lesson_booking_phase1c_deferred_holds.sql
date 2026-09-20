-- Smart Parrot Institute lesson-booking Phase 1C
-- Deferred off-session authorization + customer-present recovery state.
-- This migration deliberately adds no capture/settlement primitive.

alter table public.bookings
  add column if not exists hold_recovery_checkout_session_id text,
  add column if not exists hold_recovery_checkout_expires_at timestamptz,
  add column if not exists hold_recovery_attempts int not null default 0,
  add column if not exists hold_last_error_code text,
  add column if not exists hold_last_error_at timestamptz;

create unique index if not exists bookings_hold_recovery_checkout_unique
  on public.bookings (hold_recovery_checkout_session_id)
  where hold_recovery_checkout_session_id is not null;

create index if not exists bookings_hold_failed_deadline_idx
  on public.bookings (status, starts_at)
  where status = 'hold_failed';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bookings_hold_recovery_attempts_nonnegative'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_hold_recovery_attempts_nonnegative
      check (hold_recovery_attempts >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'bookings_hold_recovery_checkout_test_only'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_hold_recovery_checkout_test_only
      check (
        hold_recovery_checkout_session_id is null
        or hold_recovery_checkout_session_id like 'cs_test_%'
      );
  end if;
end $$;

comment on column public.bookings.hold_recovery_checkout_session_id is
  'Current customer-present test Checkout Session used to repair a failed deferred hold.';
comment on column public.bookings.hold_recovery_checkout_expires_at is
  'Server-recorded expiry of the current hold-recovery Checkout Session.';
comment on column public.bookings.hold_recovery_attempts is
  'Monotonic generation used to make each replacement recovery Checkout idempotent.';
comment on column public.bookings.hold_last_error_code is
  'Latest machine-readable deferred-hold failure code; immutable detail remains in ledger_entries.';
comment on column public.bookings.hold_last_error_at is
  'Server time of the latest deferred-hold failure.';

create or replace function public.attach_hold_recovery_checkout(
  p_student_id uuid,
  p_booking_id uuid,
  p_checkout_session_id text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
begin
  if p_student_id is null
    or p_booking_id is null
    or p_checkout_session_id is null
    or p_expires_at is null then
    raise exception 'invalid_hold_recovery_attachment'
      using errcode = '22023';
  end if;

  if p_checkout_session_id not like 'cs_test_%' then
    raise exception 'live_checkout_disabled'
      using errcode = '22023';
  end if;

  select b.*
  into v_booking
  from public.bookings b
  where b.id = p_booking_id
    and b.student_id = p_student_id
  for update;

  if not found then
    raise exception 'booking_not_found'
      using errcode = 'P0002';
  end if;

  if v_booking.hold_strategy <> 'deferred'
    or v_booking.status <> 'hold_failed' then
    raise exception 'hold_recovery_not_available'
      using errcode = 'P0001';
  end if;

  if v_booking.hold_recovery_checkout_session_id is not null then
    if v_booking.hold_recovery_checkout_session_id = p_checkout_session_id then
      return jsonb_build_object(
        'booking_id', v_booking.id,
        'status', v_booking.status,
        'hold_recovery_checkout_session_id', v_booking.hold_recovery_checkout_session_id,
        'hold_recovery_checkout_expires_at', v_booking.hold_recovery_checkout_expires_at,
        'hold_recovery_attempts', v_booking.hold_recovery_attempts,
        'attached', false
      );
    end if;

    raise exception 'hold_recovery_checkout_already_attached'
      using errcode = '23505';
  end if;

  update public.bookings
  set hold_recovery_checkout_session_id = p_checkout_session_id,
      hold_recovery_checkout_expires_at = p_expires_at,
      hold_recovery_attempts = hold_recovery_attempts + 1
  where id = v_booking.id
  returning * into v_booking;

  return jsonb_build_object(
    'booking_id', v_booking.id,
    'status', v_booking.status,
    'hold_recovery_checkout_session_id', v_booking.hold_recovery_checkout_session_id,
    'hold_recovery_checkout_expires_at', v_booking.hold_recovery_checkout_expires_at,
    'hold_recovery_attempts', v_booking.hold_recovery_attempts,
    'attached', true
  );
end;
$$;

comment on function public.attach_hold_recovery_checkout(uuid, uuid, text, timestamptz) is
  'Service-role-only attachment of a test Checkout Session used to repair a deferred hold failure.';

revoke all on function public.attach_hold_recovery_checkout(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.attach_hold_recovery_checkout(uuid, uuid, text, timestamptz)
  to service_role;

create or replace function public.clear_expired_hold_recovery_checkout(
  p_booking_id uuid,
  p_checkout_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cleared boolean;
begin
  update public.bookings
  set hold_recovery_checkout_session_id = null,
      hold_recovery_checkout_expires_at = null
  where id = p_booking_id
    and status = 'hold_failed'
    and hold_recovery_checkout_session_id = p_checkout_session_id;

  v_cleared := found;
  return v_cleared;
end;
$$;

comment on function public.clear_expired_hold_recovery_checkout(uuid, text) is
  'Service-role-only compare-and-clear for an expired hold-recovery Checkout Session.';

revoke all on function public.clear_expired_hold_recovery_checkout(uuid, text)
  from public, anon, authenticated;
grant execute on function public.clear_expired_hold_recovery_checkout(uuid, text)
  to service_role;
