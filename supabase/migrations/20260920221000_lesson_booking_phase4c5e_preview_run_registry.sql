-- Smart Parrot Institute lesson-booking Phase 4C5E
-- Durable server-authoritative full-preview run/checkpoint registry.
-- The registry stores only minimized orchestration state; no provider object IDs,
-- raw webhook payloads, secrets, payment instruments, room names, IPs, or user agents.

-- Supabase advisor hardening: this trigger helper references no schema objects, so pinning
-- an empty search_path is behavior-preserving and removes search-path injection ambiguity.
alter function public.forbid_change() set search_path = '';

create table if not exists public.lesson_booking_full_preview_runs (
  run_id uuid primary key,
  scenario text not null check (scenario in (
    'near_term_success',
    'near_term_sca',
    'deferred_success',
    'deferred_hold_failure_recovery'
  )),
  booking_id uuid unique references public.bookings(id) on delete restrict,
  state text not null check (state in (
    'initialized',
    'awaiting_checkout_completion',
    'awaiting_customer_authentication',
    'awaiting_deferred_hold_worker',
    'awaiting_customer_payment_recovery',
    'awaiting_attendance_evidence',
    'lesson_in_progress',
    'awaiting_settlement_worker',
    'complete',
    'cancelled',
    'blocked_unknown_server_state'
  )),
  pause_reason text check (
    pause_reason is null or pause_reason ~ '^[a-z0-9][a-z0-9_.-]{2,79}$'
  ),
  terminal boolean not null default false,
  revision integer not null default 0 check (revision >= 0),
  last_booking_status text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  last_observed_at timestamptz,
  completed_at timestamptz,
  check ((terminal and state in ('complete','cancelled') and completed_at is not null)
    or (not terminal and state not in ('complete','cancelled') and completed_at is null)),
  check (last_observed_at is null or last_observed_at >= created_at - interval '5 minutes')
);

create table if not exists public.lesson_booking_full_preview_run_checkpoints (
  run_id uuid not null references public.lesson_booking_full_preview_runs(run_id) on delete restrict,
  revision integer not null check (revision >= 0),
  booking_id uuid references public.bookings(id) on delete restrict,
  state text not null,
  booking_status text,
  pause_reason text,
  terminal boolean not null,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  observed_at timestamptz not null,
  primary key (run_id, revision),
  check (pause_reason is null or pause_reason ~ '^[a-z0-9][a-z0-9_.-]{2,79}$')
);

alter table public.lesson_booking_full_preview_runs enable row level security;
alter table public.lesson_booking_full_preview_run_checkpoints enable row level security;
revoke all on table public.lesson_booking_full_preview_runs from anon, authenticated;
revoke all on table public.lesson_booking_full_preview_run_checkpoints from anon, authenticated;

drop trigger if exists lesson_booking_full_preview_run_checkpoints_append_only
  on public.lesson_booking_full_preview_run_checkpoints;
create trigger lesson_booking_full_preview_run_checkpoints_append_only
before update or delete on public.lesson_booking_full_preview_run_checkpoints
for each row execute function public.forbid_change();

comment on table public.lesson_booking_full_preview_runs is
  'Admin-only durable preview orchestration registry. Stores minimized state only; booking/payment/attendance authority remains in existing server records.';
comment on table public.lesson_booking_full_preview_run_checkpoints is
  'Append-only minimized preview orchestration checkpoints. No provider identifiers or raw provider evidence.';

create or replace function private.smart_parrot_full_preview_run_payload(
  p_run public.lesson_booking_full_preview_runs,
  p_replay boolean
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'schema_version', 1,
    'run_id', (p_run).run_id,
    'scenario', (p_run).scenario,
    'booking_id', (p_run).booking_id,
    'state', (p_run).state,
    'pause_reason', (p_run).pause_reason,
    'terminal', (p_run).terminal,
    'revision', (p_run).revision,
    'last_booking_status', (p_run).last_booking_status,
    'last_observed_at', (p_run).last_observed_at,
    'completed_at', (p_run).completed_at,
    'replay', p_replay
  );
$$;

revoke all on function private.smart_parrot_full_preview_run_payload(
  public.lesson_booking_full_preview_runs,
  boolean
) from public, anon, authenticated;

create or replace function public.admin_begin_booking_full_preview_run(
  p_run_id uuid,
  p_scenario text,
  p_now timestamptz default clock_timestamp()
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.lesson_booking_full_preview_runs%rowtype;
  v_scenario text := lower(trim(coalesce(p_scenario, '')));
begin
  perform private.smart_parrot_require_admin(uid);

  if p_run_id is null
     or p_now is null
     or v_scenario not in (
       'near_term_success',
       'near_term_sca',
       'deferred_success',
       'deferred_hold_failure_recovery'
     ) then
    raise exception 'invalid_full_preview_run_request' using errcode = '22023';
  end if;

  select * into r
  from public.lesson_booking_full_preview_runs
  where run_id = p_run_id
  for update;

  if found then
    if r.scenario <> v_scenario then
      raise exception 'full_preview_run_conflicting_replay' using errcode = '23505';
    end if;
    return private.smart_parrot_full_preview_run_payload(r, true);
  end if;

  insert into public.lesson_booking_full_preview_runs(
    run_id, scenario, state, pause_reason, terminal, revision,
    created_by, created_at, updated_at
  ) values (
    p_run_id, v_scenario, 'initialized', null, false, 0,
    uid, p_now, p_now
  ) returning * into r;

  insert into public.lesson_booking_full_preview_run_checkpoints(
    run_id, revision, booking_id, state, booking_status,
    pause_reason, terminal, recorded_by, observed_at
  ) values (
    r.run_id, 0, null, r.state, null,
    null, false, uid, p_now
  );

  return private.smart_parrot_full_preview_run_payload(r, false);
end;
$$;

create or replace function public.admin_refresh_booking_full_preview_run(
  p_run_id uuid,
  p_now timestamptz default clock_timestamp()
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.lesson_booking_full_preview_runs%rowtype;
  b public.bookings%rowtype;
  v_student_attendance_count integer := 0;
  v_tutor_attendance_count integer := 0;
  v_state text;
  v_pause_reason text;
  v_terminal boolean := false;
  v_booking_status text;
  v_next_revision integer;
  v_changed boolean;
begin
  perform private.smart_parrot_require_admin(uid);

  if p_run_id is null or p_now is null then
    raise exception 'invalid_full_preview_run_refresh' using errcode = '22023';
  end if;

  select * into r
  from public.lesson_booking_full_preview_runs
  where run_id = p_run_id
  for update;

  if not found then
    raise exception 'full_preview_run_not_found' using errcode = 'P0002';
  end if;

  if r.last_observed_at is not null and p_now < r.last_observed_at then
    raise exception 'full_preview_run_observation_time_regressed' using errcode = '22023';
  end if;

  if r.booking_id is null then
    update public.lesson_booking_full_preview_runs
    set updated_at = p_now
    where run_id = r.run_id
    returning * into r;
    return private.smart_parrot_full_preview_run_payload(r, true);
  end if;

  select * into b
  from public.bookings
  where id = r.booking_id;

  if not found then
    raise exception 'full_preview_booking_not_found' using errcode = 'P0002';
  end if;

  if b.client_request_id is distinct from r.run_id then
    raise exception 'full_preview_booking_request_identity_mismatch' using errcode = '22023';
  end if;

  select
    count(*) filter (where e.actor = 'student')::int,
    count(*) filter (where e.actor = 'tutor')::int
  into v_student_attendance_count, v_tutor_attendance_count
  from public.attendance_events e
  where e.booking_id = b.id;

  v_booking_status := b.status::text;
  v_pause_reason := null;

  case v_booking_status
    when 'pending_checkout' then
      if r.scenario = 'near_term_sca' then
        v_state := 'awaiting_customer_authentication';
        v_pause_reason := 'checkout_customer_authentication';
      else
        v_state := 'awaiting_checkout_completion';
        v_pause_reason := 'checkout_completion';
      end if;
    when 'card_saved' then
      v_state := 'awaiting_deferred_hold_worker';
      v_pause_reason := 'deferred_hold_worker';
    when 'hold_failed' then
      v_state := 'awaiting_customer_payment_recovery';
      v_pause_reason := 'customer_payment_recovery';
    when 'hold_placed' then
      if v_student_attendance_count = 0 or v_tutor_attendance_count = 0 then
        v_state := 'awaiting_attendance_evidence';
        v_pause_reason := 'attendance_evidence';
      elsif p_now < b.ends_at then
        v_state := 'lesson_in_progress';
      else
        v_state := 'awaiting_settlement_worker';
        v_pause_reason := 'settlement_worker';
      end if;
    when 'awaiting_settlement' then
      v_state := 'awaiting_settlement_worker';
      v_pause_reason := 'settlement_worker';
    when 'settled' then
      v_state := 'complete';
      v_terminal := true;
    when 'cancelled' then
      v_state := 'cancelled';
      v_terminal := true;
    else
      v_state := 'blocked_unknown_server_state';
      v_pause_reason := 'unknown_server_state';
  end case;

  if r.terminal and (not v_terminal or r.state <> v_state) then
    raise exception 'full_preview_terminal_state_conflict' using errcode = '22023';
  end if;

  v_changed := r.state is distinct from v_state
    or r.pause_reason is distinct from v_pause_reason
    or r.terminal is distinct from v_terminal
    or r.last_booking_status is distinct from v_booking_status;

  if not v_changed then
    update public.lesson_booking_full_preview_runs
    set last_observed_at = p_now,
        updated_at = p_now
    where run_id = r.run_id
    returning * into r;
    return private.smart_parrot_full_preview_run_payload(r, true);
  end if;

  v_next_revision := r.revision + 1;

  update public.lesson_booking_full_preview_runs
  set state = v_state,
      pause_reason = v_pause_reason,
      terminal = v_terminal,
      revision = v_next_revision,
      last_booking_status = v_booking_status,
      last_observed_at = p_now,
      updated_at = p_now,
      completed_at = case when v_terminal then coalesce(completed_at, p_now) else null end
  where run_id = r.run_id
  returning * into r;

  insert into public.lesson_booking_full_preview_run_checkpoints(
    run_id, revision, booking_id, state, booking_status,
    pause_reason, terminal, recorded_by, observed_at
  ) values (
    r.run_id, r.revision, r.booking_id, r.state, r.last_booking_status,
    r.pause_reason, r.terminal, uid, p_now
  );

  return private.smart_parrot_full_preview_run_payload(r, false);
end;
$$;

create or replace function public.admin_bind_booking_full_preview_run(
  p_run_id uuid,
  p_booking_id uuid,
  p_now timestamptz default clock_timestamp()
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.lesson_booking_full_preview_runs%rowtype;
  b public.bookings%rowtype;
begin
  perform private.smart_parrot_require_admin(uid);

  if p_run_id is null or p_booking_id is null or p_now is null then
    raise exception 'invalid_full_preview_run_binding' using errcode = '22023';
  end if;

  select * into r
  from public.lesson_booking_full_preview_runs
  where run_id = p_run_id
  for update;

  if not found then
    raise exception 'full_preview_run_not_found' using errcode = 'P0002';
  end if;

  if r.terminal then
    raise exception 'full_preview_run_terminal' using errcode = '22023';
  end if;

  select * into b
  from public.bookings
  where id = p_booking_id;

  if not found then
    raise exception 'full_preview_booking_not_found' using errcode = 'P0002';
  end if;

  if b.client_request_id is distinct from p_run_id then
    raise exception 'full_preview_booking_request_identity_mismatch' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.bookings other
    where other.client_request_id = p_run_id
      and other.id <> p_booking_id
  ) then
    raise exception 'full_preview_request_identity_ambiguous' using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.lesson_booking_full_preview_runs other
    where other.booking_id = p_booking_id
      and other.run_id <> p_run_id
  ) then
    raise exception 'full_preview_booking_already_bound' using errcode = '23505';
  end if;

  if r.booking_id is not null and r.booking_id <> p_booking_id then
    raise exception 'full_preview_run_booking_conflict' using errcode = '23505';
  end if;

  if r.booking_id is null then
    update public.lesson_booking_full_preview_runs
    set booking_id = p_booking_id,
        updated_at = p_now
    where run_id = p_run_id;
  end if;

  return public.admin_refresh_booking_full_preview_run(p_run_id, p_now);
end;
$$;

comment on function public.admin_begin_booking_full_preview_run(uuid,text,timestamptz) is
  'Admin-only idempotent creation of a minimized full-preview orchestration run.';
comment on function public.admin_bind_booking_full_preview_run(uuid,uuid,timestamptz) is
  'Admin-only binding of a preview run to the booking created with the same client_request_id.';
comment on function public.admin_refresh_booking_full_preview_run(uuid,timestamptz) is
  'Admin-only server-derived preview checkpoint refresh. Uses booking state, attendance evidence, and server time; no browser-authoritative transition.';

revoke all on function public.admin_begin_booking_full_preview_run(uuid,text,timestamptz)
  from public, anon, authenticated;
revoke all on function public.admin_bind_booking_full_preview_run(uuid,uuid,timestamptz)
  from public, anon, authenticated;
revoke all on function public.admin_refresh_booking_full_preview_run(uuid,timestamptz)
  from public, anon, authenticated;
grant execute on function public.admin_begin_booking_full_preview_run(uuid,text,timestamptz)
  to authenticated;
grant execute on function public.admin_bind_booking_full_preview_run(uuid,uuid,timestamptz)
  to authenticated;
grant execute on function public.admin_refresh_booking_full_preview_run(uuid,timestamptz)
  to authenticated;
