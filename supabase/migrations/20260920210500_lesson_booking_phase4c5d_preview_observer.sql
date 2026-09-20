-- Smart Parrot Institute lesson-booking Phase 4C5D
-- Minimized admin-only observer for the disabled full-preview execution shell.
-- It exposes server-authoritative statuses/counts only; no provider identifiers,
-- raw webhook payloads, secrets, IPs, user agents, or payment-method details.

create or replace function public.admin_observe_booking_preview_run(
  p_booking_id uuid,
  p_now timestamptz default clock_timestamp()
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  b public.bookings%rowtype;
  v_consent_count int;
  v_ledger_count int;
  v_attendance_count int;
  v_student_attendance_count int;
  v_tutor_attendance_count int;
  v_settlement_evidence_count int;
  v_authorization_state text;
begin
  perform private.smart_parrot_require_admin(uid);

  if p_booking_id is null or p_now is null then
    raise exception 'invalid_preview_observation_request' using errcode = '22023';
  end if;

  select *
  into b
  from public.bookings
  where id = p_booking_id;

  if not found then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;

  select count(*)::int
  into v_consent_count
  from public.consents c
  where c.booking_id = b.id;

  select count(*)::int
  into v_ledger_count
  from public.ledger_entries l
  where l.booking_id = b.id;

  select
    count(*)::int,
    count(*) filter (where e.actor = 'student')::int,
    count(*) filter (where e.actor = 'tutor')::int
  into
    v_attendance_count,
    v_student_attendance_count,
    v_tutor_attendance_count
  from public.attendance_events e
  where e.booking_id = b.id;

  select count(*)::int
  into v_settlement_evidence_count
  from public.ledger_entries l
  where l.booking_id = b.id
    and l.kind in ('captured', 'hold_released', 'credit_issued', 'refunded');

  v_authorization_state := case
    when b.status = 'pending_checkout' then 'pending_checkout'
    when b.status = 'card_saved' then 'deferred_hold_pending'
    when b.status = 'hold_failed' then 'hold_failed'
    when b.status in ('hold_placed', 'awaiting_settlement') then 'authorized_manual_capture'
    when b.status = 'settled' then 'settled'
    when b.status = 'cancelled' then 'cancelled'
    else 'unknown'
  end;

  return jsonb_build_object(
    'schema_version', 1,
    'booking_id', b.id,
    'booking_status', b.status,
    'hold_strategy', b.hold_strategy,
    'checkout_mode', b.stripe_checkout_mode,
    'authorization_state', v_authorization_state,
    'has_payment_intent', b.stripe_payment_intent_id is not null,
    'has_capture_deadline', b.capture_before is not null,
    'consent_evidence_count', v_consent_count,
    'payment_ledger_count', v_ledger_count,
    'attendance_evidence_count', v_attendance_count,
    'student_attendance_count', v_student_attendance_count,
    'tutor_attendance_count', v_tutor_attendance_count,
    'settlement_evidence_count', v_settlement_evidence_count,
    'hold_attempts', b.hold_attempts,
    'hold_error_present', b.hold_last_error_code is not null,
    'settlement_attempts', b.settlement_attempts,
    'settlement_error_present', b.settlement_last_error_code is not null,
    'lesson_end_passed', p_now >= b.ends_at,
    'settled', b.status = 'settled',
    'outcome', b.outcome,
    'observed_at', p_now
  );
end;
$$;

comment on function public.admin_observe_booking_preview_run(uuid, timestamptz) is
  'Admin-only minimized observer for preview booking/payment/attendance/settlement state. Returns status/count evidence only and never provider identifiers or raw provider payloads.';

revoke all on function public.admin_observe_booking_preview_run(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.admin_observe_booking_preview_run(uuid, timestamptz)
  to authenticated;
