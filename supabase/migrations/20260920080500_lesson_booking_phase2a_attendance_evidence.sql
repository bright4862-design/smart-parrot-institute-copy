-- Smart Parrot Institute lesson-booking Phase 2A
-- Server-authored attendance evidence for Daily and in-person/fallback check-in.
-- No payment capture or settlement is introduced here.

create index if not exists attendance_events_booking_actor_occurred_idx
  on public.attendance_events (booking_id, actor, occurred_at);

-- Daily room identity is deterministic: the private room name is the booking UUID.
alter table public.bookings
  drop constraint if exists bookings_video_room_matches_booking;
alter table public.bookings
  add constraint bookings_video_room_matches_booking
  check (video_room_name is null or video_room_name = id::text)
  not valid;
alter table public.bookings
  validate constraint bookings_video_room_matches_booking;

-- Signed Daily webhooks call an Edge Function with no Supabase credential. The
-- Edge Function verifies Daily's signature and then uses the server admin client
-- to call this service-role-only recorder. Participant identity is derived from
-- the booking; the webhook cannot choose an arbitrary actor label.
create or replace function public.record_daily_attendance_event(
  p_booking_id uuid,
  p_user_id uuid,
  p_kind text,
  p_external_id text,
  p_occurred_at timestamptz,
  p_raw jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings%rowtype;
  v_actor text;
  v_id bigint;
begin
  if p_booking_id is null or p_user_id is null or p_occurred_at is null then
    raise exception 'invalid_attendance_event' using errcode = '22023';
  end if;

  if p_kind not in ('joined', 'left') then
    raise exception 'invalid_attendance_kind' using errcode = '22023';
  end if;

  if p_external_id is null
     or length(trim(p_external_id)) = 0
     or length(p_external_id) > 255 then
    raise exception 'invalid_attendance_external_id' using errcode = '22023';
  end if;

  select * into b
  from public.bookings
  where id = p_booking_id;

  if not found then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;

  if b.status <> 'hold_placed' then
    raise exception 'lesson_not_confirmed' using errcode = '55000';
  end if;

  v_actor := case
    when p_user_id = b.student_id then 'student'
    when p_user_id = b.tutor_id then 'tutor'
    else null
  end;

  if v_actor is null then
    raise exception 'participant_not_in_booking' using errcode = '42501';
  end if;

  if p_occurred_at < b.starts_at - interval '30 minutes'
     or p_occurred_at > b.ends_at then
    raise exception 'attendance_outside_evidence_window' using errcode = '22023';
  end if;

  insert into public.attendance_events (
    booking_id,
    actor,
    kind,
    source,
    occurred_at,
    external_id,
    raw
  ) values (
    b.id,
    v_actor,
    p_kind,
    'daily_webhook',
    p_occurred_at,
    p_external_id,
    p_raw
  )
  on conflict (source, external_id) do nothing
  returning id into v_id;

  if v_id is null then
    select e.id into v_id
    from public.attendance_events e
    where e.source = 'daily_webhook'
      and e.external_id = p_external_id
      and e.booking_id = b.id
      and e.actor = v_actor
      and e.kind = p_kind
      and e.occurred_at = p_occurred_at;

    if v_id is null then
      raise exception 'attendance_replay_conflict' using errcode = '23505';
    end if;
  end if;

  return jsonb_build_object(
    'id', v_id,
    'booking_id', b.id,
    'actor', v_actor,
    'kind', p_kind,
    'source', 'daily_webhook',
    'occurred_at', p_occurred_at
  );
end;
$$;

-- Browser fallback and QR check-ins never supply a timestamp. The database owns
-- the clock, derives the actor from the authenticated user UUID, and refuses
-- evidence outside the same bounded lesson window used for Daily webhooks.
create or replace function public.record_server_check_in(
  p_booking_id uuid,
  p_user_id uuid,
  p_source text,
  p_ip inet default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings%rowtype;
  v_actor text;
  v_now timestamptz := clock_timestamp();
  v_external_id text;
  v_id bigint;
begin
  if p_booking_id is null or p_user_id is null then
    raise exception 'invalid_check_in' using errcode = '22023';
  end if;

  if p_source not in ('app_button', 'qr_scan') then
    raise exception 'invalid_check_in_source' using errcode = '22023';
  end if;

  select * into b
  from public.bookings
  where id = p_booking_id;

  if not found then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;

  if b.status <> 'hold_placed' then
    raise exception 'lesson_not_confirmed' using errcode = '55000';
  end if;

  v_actor := case
    when p_user_id = b.student_id then 'student'
    when p_user_id = b.tutor_id then 'tutor'
    else null
  end;

  if v_actor is null then
    raise exception 'participant_not_in_booking' using errcode = '42501';
  end if;

  if p_source = 'qr_scan' and v_actor <> 'student' then
    raise exception 'qr_check_in_is_student_only' using errcode = '42501';
  end if;

  if v_now < b.starts_at - interval '30 minutes'
     or v_now > b.ends_at then
    raise exception 'attendance_outside_evidence_window' using errcode = '22023';
  end if;

  -- Deduplicate repeated taps/scans inside a 30-second bucket without accepting
  -- a client-authored timestamp.
  v_external_id := format(
    '%s:%s:%s:%s',
    p_source,
    b.id,
    p_user_id,
    floor(extract(epoch from v_now) / 30)::bigint
  );

  insert into public.attendance_events (
    booking_id,
    actor,
    kind,
    source,
    occurred_at,
    external_id,
    ip,
    user_agent
  ) values (
    b.id,
    v_actor,
    'checked_in',
    p_source,
    v_now,
    v_external_id,
    p_ip,
    left(p_user_agent, 1000)
  )
  on conflict (source, external_id) do nothing
  returning id into v_id;

  if v_id is null then
    select e.id, e.occurred_at
      into v_id, v_now
    from public.attendance_events e
    where e.source = p_source
      and e.external_id = v_external_id
      and e.booking_id = b.id
      and e.actor = v_actor
      and e.kind = 'checked_in';

    if v_id is null then
      raise exception 'attendance_replay_conflict' using errcode = '23505';
    end if;
  end if;

  return jsonb_build_object(
    'id', v_id,
    'booking_id', b.id,
    'actor', v_actor,
    'kind', 'checked_in',
    'source', p_source,
    'occurred_at', v_now
  );
end;
$$;

revoke all on function public.record_daily_attendance_event(uuid, uuid, text, text, timestamptz, jsonb)
  from public, anon, authenticated;
revoke all on function public.record_server_check_in(uuid, uuid, text, inet, text)
  from public, anon, authenticated;

grant execute on function public.record_daily_attendance_event(uuid, uuid, text, text, timestamptz, jsonb)
  to service_role;
grant execute on function public.record_server_check_in(uuid, uuid, text, inet, text)
  to service_role;
