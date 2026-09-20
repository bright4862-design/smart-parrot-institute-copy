-- Smart Parrot Institute lesson-booking Phase 1B
-- Test-mode Stripe Checkout attachment + webhook idempotency primitives.
-- This migration deliberately contains no capture/settlement function.

alter table public.bookings
  add column if not exists stripe_setup_intent_id text,
  add column if not exists stripe_checkout_mode text,
  add column if not exists checkout_expires_at timestamptz;

create unique index if not exists bookings_stripe_setup_intent_unique
  on public.bookings (stripe_setup_intent_id)
  where stripe_setup_intent_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bookings_stripe_checkout_mode_check'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_stripe_checkout_mode_check
      check (stripe_checkout_mode is null or stripe_checkout_mode in ('payment', 'setup'));
  end if;
end $$;

create unique index if not exists consents_stripe_checkout_session_unique
  on public.consents (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create unique index if not exists ledger_kind_stripe_object_unique
  on public.ledger_entries (kind, stripe_object_id)
  where stripe_object_id is not null;

comment on column public.bookings.stripe_setup_intent_id is
  'Stripe SetupIntent created by a completed setup-mode Checkout Session.';
comment on column public.bookings.stripe_checkout_mode is
  'Checkout mode chosen from the server-owned hold strategy: payment or setup.';
comment on column public.bookings.checkout_expires_at is
  'Server-recorded Stripe Checkout Session expiry; not a browser-authoritative timer.';

create or replace function public.attach_booking_checkout(
  p_student_id uuid,
  p_booking_id uuid,
  p_checkout_session_id text,
  p_checkout_mode text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_expected_mode text;
begin
  if p_student_id is null
    or p_booking_id is null
    or p_checkout_session_id is null
    or p_checkout_mode is null
    or p_expires_at is null then
    raise exception 'invalid_checkout_attachment'
      using errcode = '22023';
  end if;

  -- This branch is intentionally test-mode only. A production enablement must
  -- be an explicit later change, not a secret swap.
  if p_checkout_session_id not like 'cs_test_%' then
    raise exception 'live_checkout_disabled'
      using errcode = '22023';
  end if;

  if p_checkout_mode not in ('payment', 'setup') then
    raise exception 'invalid_checkout_mode'
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

  if v_booking.stripe_checkout_session_id is not null then
    if v_booking.stripe_checkout_session_id = p_checkout_session_id
      and v_booking.stripe_checkout_mode = p_checkout_mode then
      return jsonb_build_object(
        'booking_id', v_booking.id,
        'status', v_booking.status,
        'stripe_checkout_session_id', v_booking.stripe_checkout_session_id,
        'stripe_checkout_mode', v_booking.stripe_checkout_mode,
        'checkout_expires_at', v_booking.checkout_expires_at,
        'attached', false
      );
    end if;

    raise exception 'checkout_already_attached'
      using errcode = '23505';
  end if;

  if v_booking.status <> 'pending_checkout' then
    raise exception 'booking_not_pending_checkout'
      using errcode = 'P0001';
  end if;

  v_expected_mode := case
    when v_booking.hold_strategy = 'at_checkout' then 'payment'
    when v_booking.hold_strategy = 'deferred' then 'setup'
    else null
  end;

  if v_expected_mode is null or p_checkout_mode <> v_expected_mode then
    raise exception 'checkout_mode_mismatch'
      using errcode = '22023';
  end if;

  update public.bookings
  set stripe_checkout_session_id = p_checkout_session_id,
      stripe_checkout_mode = p_checkout_mode,
      checkout_expires_at = p_expires_at
  where id = v_booking.id
  returning * into v_booking;

  return jsonb_build_object(
    'booking_id', v_booking.id,
    'status', v_booking.status,
    'stripe_checkout_session_id', v_booking.stripe_checkout_session_id,
    'stripe_checkout_mode', v_booking.stripe_checkout_mode,
    'checkout_expires_at', v_booking.checkout_expires_at,
    'attached', true
  );
end;
$$;

comment on function public.attach_booking_checkout(uuid, uuid, text, text, timestamptz) is
  'Service-role-only attachment of a test Checkout Session to a reservation. Enforces mode from the server-owned hold strategy.';

revoke all on function public.attach_booking_checkout(uuid, uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.attach_booking_checkout(uuid, uuid, text, text, timestamptz)
  to service_role;
