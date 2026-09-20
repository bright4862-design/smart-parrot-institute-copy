-- Smart Parrot Institute lesson-booking Phase 2B
-- Deterministic settlement + retry-safe settlement claims/finalization.
-- Payment execution remains in a test-mode-only Edge Function.

alter table public.bookings
  add column if not exists settlement_claimed_at timestamptz,
  add column if not exists settlement_attempts int not null default 0,
  add column if not exists settlement_last_error_code text,
  add column if not exists settlement_last_error_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bookings_settlement_attempts_nonnegative'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_settlement_attempts_nonnegative
      check (settlement_attempts >= 0);
  end if;
end $$;

create index if not exists bookings_settlement_claim_idx
  on public.bookings (status, settlement_claimed_at, ends_at)
  where status in ('hold_placed', 'awaiting_settlement');

create unique index if not exists ledger_tutor_no_show_credit_once
  on public.ledger_entries (booking_id, kind)
  where kind = 'credit_issued';

create or replace function public.compute_lesson_settlement(
  p_booking_id uuid
)
returns table (
  outcome public.lesson_outcome,
  amount_cents int,
  student_joined_at timestamptz,
  tutor_joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b public.bookings%rowtype;
  cfg jsonb;
  v_grace_minutes int;
  v_no_show_minutes int;
  v_tutor_grace_minutes int;
  v_student_join timestamptz;
  v_tutor_join timestamptz;
  v_decision_at timestamptz;
  v_last_tutor_kind text;
  v_duration_minutes numeric;
  v_tutor_late_minutes numeric;
begin
  if p_booking_id is null then
    raise exception 'booking_id_required' using errcode = '22023';
  end if;

  select *
  into b
  from public.bookings
  where id = p_booking_id;

  if not found then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;

  if b.status not in ('hold_placed', 'awaiting_settlement', 'settled') then
    raise exception 'booking_not_settleable' using errcode = '55000';
  end if;

  select p.config
  into cfg
  from public.policy_versions p
  where p.id = b.policy_version_id;

  if cfg is null then
    raise exception 'booking_policy_not_found' using errcode = 'P0002';
  end if;

  begin
    v_grace_minutes := (cfg ->> 'grace_minutes')::int;
    v_no_show_minutes := (cfg ->> 'no_show_after_minutes')::int;
    v_tutor_grace_minutes := (cfg ->> 'tutor_grace_minutes')::int;
  exception
    when others then
      raise exception 'invalid_settlement_policy' using errcode = '22023';
  end;

  if v_grace_minutes < 0
     or v_grace_minutes > 60
     or v_tutor_grace_minutes < 0
     or v_tutor_grace_minutes > 60
     or v_no_show_minutes < greatest(v_grace_minutes, v_tutor_grace_minutes)
     or v_no_show_minutes > 120 then
    raise exception 'invalid_settlement_policy' using errcode = '22023';
  end if;

  select min(e.occurred_at)
  into v_student_join
  from public.attendance_events e
  where e.booking_id = b.id
    and e.actor = 'student'
    and e.kind in ('joined', 'checked_in')
    and e.occurred_at between b.starts_at - interval '30 minutes' and b.ends_at;

  select min(e.occurred_at)
  into v_tutor_join
  from public.attendance_events e
  where e.booking_id = b.id
    and e.actor = 'tutor'
    and e.kind in ('joined', 'checked_in')
    and e.occurred_at between b.starts_at - interval '30 minutes' and b.ends_at;

  if v_tutor_join is null
     or v_tutor_join > b.starts_at + make_interval(mins => v_no_show_minutes) then
    return query
    select
      'tutor_no_show'::public.lesson_outcome,
      0,
      v_student_join,
      v_tutor_join;
    return;
  end if;

  v_decision_at := least(
    coalesce(
      v_student_join,
      b.starts_at + make_interval(mins => v_no_show_minutes)
    ),
    b.starts_at + make_interval(mins => v_no_show_minutes)
  );

  select e.kind
  into v_last_tutor_kind
  from public.attendance_events e
  where e.booking_id = b.id
    and e.actor = 'tutor'
    and e.kind in ('joined', 'checked_in', 'left')
    and e.occurred_at between b.starts_at - interval '30 minutes' and v_decision_at
  order by e.occurred_at desc, e.id desc
  limit 1;

  if v_last_tutor_kind = 'left' then
    return query
    select
      'tutor_no_show'::public.lesson_outcome,
      0,
      v_student_join,
      v_tutor_join;
    return;
  end if;

  if v_student_join is null
     or v_student_join > b.starts_at + make_interval(mins => v_no_show_minutes) then
    return query
    select
      'no_show'::public.lesson_outcome,
      b.max_charge_cents,
      v_student_join,
      v_tutor_join;
    return;
  end if;

  if v_tutor_join > b.starts_at + make_interval(mins => v_tutor_grace_minutes) then
    v_duration_minutes := extract(epoch from (b.ends_at - b.starts_at)) / 60.0;
    v_tutor_late_minutes := extract(epoch from (v_tutor_join - b.starts_at)) / 60.0;

    return query
    select
      'tutor_late'::public.lesson_outcome,
      greatest(
        0,
        round(
          b.on_time_price_cents
          * greatest(0, v_duration_minutes - v_tutor_late_minutes)
          / v_duration_minutes
        )::int
      ),
      v_student_join,
      v_tutor_join;
    return;
  end if;

  if v_student_join > b.starts_at + make_interval(mins => v_grace_minutes) then
    return query
    select
      'late'::public.lesson_outcome,
      b.max_charge_cents,
      v_student_join,
      v_tutor_join;
    return;
  end if;

  return query
  select
    'on_time'::public.lesson_outcome,
    b.on_time_price_cents,
    v_student_join,
    v_tutor_join;
end;
$$;

create or replace function public.claim_lesson_settlements(
  p_now timestamptz default clock_timestamp(),
  p_limit int default 25
)
returns table (
  booking_id uuid,
  stripe_payment_intent_id text,
  max_charge_cents int,
  currency text,
  capture_before timestamptz,
  settlement_attempt int
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_now is null or p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'invalid_settlement_claim_request' using errcode = '22023';
  end if;

  return query
  with candidates as (
    select b.id
    from public.bookings b
    join public.policy_versions p
      on p.id = b.policy_version_id
    where (
      b.status = 'hold_placed'
      and b.ends_at <= p_now - make_interval(
        mins => greatest(
          0,
          least(1440, coalesce((p.config ->> 'capture_delay_minutes')::int, 60))
        )
      )
    ) or (
      b.status = 'awaiting_settlement'
      and (
        b.settlement_claimed_at is null
        or b.settlement_claimed_at <= p_now - interval '10 minutes'
      )
    )
    order by b.ends_at, b.id
    for update of b skip locked
    limit p_limit
  ),
  moved as (
    update public.bookings b
    set status = 'awaiting_settlement',
        settlement_claimed_at = p_now,
        settlement_attempts = b.settlement_attempts + 1,
        settlement_last_error_code = null,
        settlement_last_error_at = null
    from candidates c
    where b.id = c.id
    returning
      b.id,
      b.stripe_payment_intent_id,
      b.max_charge_cents,
      b.currency,
      b.capture_before,
      b.settlement_attempts
  )
  select
    m.id,
    m.stripe_payment_intent_id,
    m.max_charge_cents,
    m.currency,
    m.capture_before,
    m.settlement_attempts
  from moved m
  order by m.id;
end;
$$;

create or replace function public.mark_lesson_settlement_failed(
  p_booking_id uuid,
  p_settlement_attempt int,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed boolean;
begin
  if p_booking_id is null
     or p_settlement_attempt is null
     or p_settlement_attempt < 1
     or p_error_code is null
     or length(trim(p_error_code)) = 0 then
    raise exception 'invalid_settlement_failure' using errcode = '22023';
  end if;

  update public.bookings
  set settlement_last_error_code = left(p_error_code, 120),
      settlement_last_error_at = clock_timestamp()
  where id = p_booking_id
    and status = 'awaiting_settlement'
    and settlement_attempts = p_settlement_attempt;

  v_changed := found;
  return v_changed;
end;
$$;

create or replace function public.finalize_lesson_settlement(
  p_booking_id uuid,
  p_settlement_attempt int,
  p_captured_cents int,
  p_released_cents int
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings%rowtype;
  s record;
  cfg jsonb;
  v_credit_cents int := 0;
begin
  if p_booking_id is null
     or p_settlement_attempt is null
     or p_settlement_attempt < 1
     or p_captured_cents is null
     or p_captured_cents < 0
     or p_released_cents is null
     or p_released_cents < 0 then
    raise exception 'invalid_settlement_finalization' using errcode = '22023';
  end if;

  select *
  into b
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;

  if b.status = 'settled' then
    if b.final_amount_cents = p_captured_cents
       and b.max_charge_cents - b.final_amount_cents = p_released_cents then
      return jsonb_build_object(
        'booking_id', b.id,
        'status', b.status,
        'outcome', b.outcome,
        'amount_cents', b.final_amount_cents,
        'idempotent', true
      );
    end if;

    raise exception 'settlement_already_finalized_with_different_amount'
      using errcode = '23505';
  end if;

  if b.status <> 'awaiting_settlement'
     or b.settlement_attempts <> p_settlement_attempt then
    raise exception 'stale_settlement_attempt' using errcode = '40001';
  end if;

  if b.stripe_payment_intent_id is null then
    raise exception 'settlement_payment_intent_missing' using errcode = '55000';
  end if;

  select *
  into s
  from public.compute_lesson_settlement(b.id);

  if s.amount_cents <> p_captured_cents
     or b.max_charge_cents - s.amount_cents <> p_released_cents then
    raise exception 'settlement_amount_mismatch' using errcode = '22023';
  end if;

  if p_captured_cents > 0 then
    insert into public.ledger_entries (
      booking_id,
      kind,
      amount_cents,
      currency,
      stripe_object_id,
      note
    ) values (
      b.id,
      'captured',
      p_captured_cents,
      b.currency,
      b.stripe_payment_intent_id,
      'Phase 2B deterministic lesson settlement'
    )
    on conflict do nothing;
  end if;

  if p_released_cents > 0 then
    insert into public.ledger_entries (
      booking_id,
      kind,
      amount_cents,
      currency,
      stripe_object_id,
      note
    ) values (
      b.id,
      'hold_released',
      p_released_cents,
      b.currency,
      b.stripe_payment_intent_id,
      'Unused authorization released at settlement'
    )
    on conflict do nothing;
  end if;

  if s.outcome = 'tutor_no_show' then
    select p.config
    into cfg
    from public.policy_versions p
    where p.id = b.policy_version_id;

    begin
      v_credit_cents := greatest(
        0,
        least(100000, coalesce((cfg ->> 'tutor_no_show_credit_cents')::int, 0))
      );
    exception
      when others then
        raise exception 'invalid_tutor_no_show_credit' using errcode = '22023';
    end;

    if v_credit_cents > 0 then
      insert into public.ledger_entries (
        booking_id,
        kind,
        amount_cents,
        currency,
        note
      ) values (
        b.id,
        'credit_issued',
        v_credit_cents,
        b.currency,
        'Tutor no-show service credit'
      )
      on conflict do nothing;
    end if;
  end if;

  update public.bookings
  set status = 'settled',
      outcome = s.outcome,
      final_amount_cents = s.amount_cents,
      settled_at = clock_timestamp(),
      settlement_claimed_at = null,
      settlement_last_error_code = null,
      settlement_last_error_at = null
  where id = b.id
  returning * into b;

  return jsonb_build_object(
    'booking_id', b.id,
    'status', b.status,
    'outcome', b.outcome,
    'amount_cents', b.final_amount_cents,
    'released_cents', p_released_cents,
    'idempotent', false
  );
end;
$$;

revoke all on function public.compute_lesson_settlement(uuid)
  from public, anon, authenticated;
revoke all on function public.claim_lesson_settlements(timestamptz, int)
  from public, anon, authenticated;
revoke all on function public.mark_lesson_settlement_failed(uuid, int, text)
  from public, anon, authenticated;
revoke all on function public.finalize_lesson_settlement(uuid, int, int, int)
  from public, anon, authenticated;

grant execute on function public.compute_lesson_settlement(uuid) to service_role;
grant execute on function public.claim_lesson_settlements(timestamptz, int) to service_role;
grant execute on function public.mark_lesson_settlement_failed(uuid, int, text) to service_role;
grant execute on function public.finalize_lesson_settlement(uuid, int, int, int) to service_role;
