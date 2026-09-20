-- Smart Parrot Institute lesson-booking Phase 1A
-- Atomically creates a server-authoritative booking reservation plus immutable
-- consent evidence. Stripe Checkout is deliberately not part of this migration.

alter table public.bookings
  add column if not exists client_request_id uuid;

create unique index if not exists bookings_student_request_id_unique
  on public.bookings (student_id, client_request_id)
  where client_request_id is not null;

comment on column public.bookings.client_request_id is
  'Client-generated idempotency key. Unique per student when present.';

create or replace function public.create_booking_reservation(
  p_student_id uuid,
  p_lesson_type_id uuid,
  p_starts_at timestamptz,
  p_request_id uuid,
  p_express_start_request boolean default false,
  p_ip text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.bookings%rowtype;
  v_booking public.bookings%rowtype;
  v_lesson public.lesson_types%rowtype;
  v_policy public.policy_versions%rowtype;
  v_ends_at timestamptz;
  v_late_surcharge_pct numeric;
  v_hold_lead_hours int;
  v_max_charge_cents int;
  v_hold_strategy text;
  v_hold_due_at timestamptz;
  v_checkbox_text text;
  v_ip inet;
  v_now timestamptz := now();

  function booking_payload(p_booking public.bookings, p_created boolean)
  returns jsonb
  language sql
  immutable
  as $inner$
    select jsonb_build_object(
      'booking_id', p_booking.id,
      'created', p_created,
      'status', p_booking.status,
      'student_id', p_booking.student_id,
      'tutor_id', p_booking.tutor_id,
      'lesson_type_id', p_booking.lesson_type_id,
      'policy_version_id', p_booking.policy_version_id,
      'starts_at', p_booking.starts_at,
      'ends_at', p_booking.ends_at,
      'currency', p_booking.currency,
      'on_time_price_cents', p_booking.on_time_price_cents,
      'max_charge_cents', p_booking.max_charge_cents,
      'hold_strategy', p_booking.hold_strategy,
      'hold_due_at', p_booking.hold_due_at,
      'client_request_id', p_booking.client_request_id
    );
  $inner$;
begin
  if p_student_id is null
    or p_lesson_type_id is null
    or p_starts_at is null
    or p_request_id is null then
    raise exception 'invalid_booking_request'
      using errcode = '22023', detail = 'student, lesson type, start time, and request id are required';
  end if;

  -- Idempotency is checked before any catalog or availability work. A retried
  -- request returns the same reservation, but reusing a key for different input
  -- is rejected rather than silently mutating intent.
  select b.*
  into v_existing
  from public.bookings b
  where b.student_id = p_student_id
    and b.client_request_id = p_request_id;

  if found then
    if v_existing.lesson_type_id <> p_lesson_type_id
      or v_existing.starts_at <> p_starts_at then
      raise exception 'idempotency_key_reused'
        using errcode = '22023', detail = 'request id already belongs to a different booking intent';
    end if;

    return booking_payload(v_existing, false);
  end if;

  select lt.*
  into v_lesson
  from public.lesson_types lt
  where lt.id = p_lesson_type_id
    and lt.active;

  if not found then
    raise exception 'lesson_type_not_found'
      using errcode = 'P0002';
  end if;

  select pv.*
  into v_policy
  from public.policy_versions pv
  order by pv.published_at desc, pv.id desc
  limit 1;

  if not found then
    raise exception 'booking_policy_not_configured'
      using errcode = 'P0002';
  end if;

  begin
    v_late_surcharge_pct := (v_policy.config ->> 'late_surcharge_pct')::numeric;
    v_hold_lead_hours := (v_policy.config ->> 'hold_lead_hours')::int;
  exception
    when invalid_text_representation then
      raise exception 'invalid_booking_policy_config'
        using errcode = '22023';
  end;

  if v_late_surcharge_pct is null
    or v_late_surcharge_pct < 0
    or v_late_surcharge_pct > 100
    or v_hold_lead_hours is null
    or v_hold_lead_hours <= 0
    or v_hold_lead_hours > 168 then
    raise exception 'invalid_booking_policy_config'
      using errcode = '22023';
  end if;

  if p_starts_at < v_now + interval '14 days'
    and not coalesce(p_express_start_request, false) then
    raise exception 'express_start_request_required'
      using errcode = '22023';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_lesson.duration_minutes);

  if not exists (
    select 1
    from private.smart_parrot_available_slots(
      p_lesson_type_id,
      p_starts_at,
      v_ends_at
    ) s
    where s.slot_start = p_starts_at
      and s.slot_end = v_ends_at
  ) then
    raise exception 'slot_unavailable'
      using errcode = 'P0001';
  end if;

  v_max_charge_cents := round(
    v_lesson.on_time_price_cents * (1 + v_late_surcharge_pct / 100.0)
  )::int;

  if p_starts_at - v_now < make_interval(hours => v_hold_lead_hours) then
    v_hold_strategy := 'at_checkout';
    v_hold_due_at := null;
  else
    v_hold_strategy := 'deferred';
    v_hold_due_at := p_starts_at - make_interval(hours => v_hold_lead_hours);
  end if;

  if p_ip is not null
    and length(p_ip) <= 64
    and p_ip ~ '^[0-9A-Fa-f:.]+$' then
    begin
      v_ip := p_ip::inet;
    exception
      when invalid_text_representation then
        v_ip := null;
    end;
  end if;

  begin
    insert into public.bookings (
      student_id,
      tutor_id,
      lesson_type_id,
      policy_version_id,
      starts_at,
      ends_at,
      currency,
      on_time_price_cents,
      max_charge_cents,
      hold_strategy,
      hold_due_at,
      client_request_id
    ) values (
      p_student_id,
      v_lesson.tutor_id,
      v_lesson.id,
      v_policy.id,
      p_starts_at,
      v_ends_at,
      v_lesson.currency,
      v_lesson.on_time_price_cents,
      v_max_charge_cents,
      v_hold_strategy,
      v_hold_due_at,
      p_request_id
    )
    returning * into v_booking;
  exception
    when exclusion_violation then
      raise exception 'slot_taken'
        using errcode = 'P0001';
    when unique_violation then
      -- Concurrent retry with the same request id: return the winner. Other
      -- uniqueness failures are re-thrown.
      select b.*
      into v_existing
      from public.bookings b
      where b.student_id = p_student_id
        and b.client_request_id = p_request_id;

      if found then
        if v_existing.lesson_type_id <> p_lesson_type_id
          or v_existing.starts_at <> p_starts_at then
          raise exception 'idempotency_key_reused'
            using errcode = '22023';
        end if;
        return booking_payload(v_existing, false);
      end if;

      raise;
  end;

  v_checkbox_text := format(
    'I have read the Lesson & Lateness Policy (%s).',
    v_policy.id
  );

  if coalesce(p_express_start_request, false) then
    v_checkbox_text := v_checkbox_text
      || ' I ask for my lesson to take place within the 14-day withdrawal period.';
  end if;

  insert into public.consents (
    user_id,
    booking_id,
    policy_version_id,
    terms_sha256,
    checkbox_text,
    express_start_request,
    ip,
    user_agent
  ) values (
    p_student_id,
    v_booking.id,
    v_policy.id,
    v_policy.terms_sha256,
    v_checkbox_text,
    coalesce(p_express_start_request, false),
    v_ip,
    left(nullif(p_user_agent, ''), 1000)
  );

  return booking_payload(v_booking, true);
end;
$$;

comment on function public.create_booking_reservation(
  uuid, uuid, timestamptz, uuid, boolean, text, text
) is
  'Server-only atomic reservation + consent boundary. Re-reads catalog/policy, enforces availability and idempotency, and never calls Stripe.';

revoke all on function public.create_booking_reservation(
  uuid, uuid, timestamptz, uuid, boolean, text, text
) from public, anon, authenticated;

grant execute on function public.create_booking_reservation(
  uuid, uuid, timestamptz, uuid, boolean, text, text
) to service_role;
