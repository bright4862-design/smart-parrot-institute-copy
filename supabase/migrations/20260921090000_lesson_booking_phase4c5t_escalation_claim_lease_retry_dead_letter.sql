-- Smart Parrot Institute lesson-booking Phase 4C5T
-- Minimized escalation claim/lease + append-only retry/dead-letter evidence.
-- Preview-only: no external notifier send, Cron sender, provider/payment write, booking launch, or destructive cleanup.

create table if not exists public.lesson_booking_preview_launch_blocker_escalation_work_events (
  event_id bigint generated always as identity primary key,
  schema_version text not null check (schema_version = 'smart_parrot_booking_preview_launch_blocker_escalation_work_event_v1'),
  queue_item_id bigint not null references public.lesson_booking_preview_launch_blocker_escalation_queue(queue_item_id) on delete restrict,
  snapshot_id bigint not null references public.lesson_booking_preview_launch_blocker_snapshots(snapshot_id) on delete restrict,
  alert_id bigint not null references public.lesson_booking_preview_launch_blocker_alerts(alert_id) on delete restrict,
  event_kind text not null check (event_kind in ('claimed','released','retry_scheduled','dead_lettered')),
  claim_key text not null check (claim_key ~ '^[0-9a-f]{32}$'),
  attempt_no integer not null check (attempt_no > 0),
  lease_seconds integer,
  lease_expires_at timestamptz,
  next_eligible_at timestamptz,
  reason_code text,
  automatic_notification_authorized boolean not null default false check (automatic_notification_authorized = false),
  notifier_send_authorized boolean not null default false check (notifier_send_authorized = false),
  outcome_suppresses_blocker boolean not null default false check (outcome_suppresses_blocker = false),
  provider_write_authorized boolean not null default false check (provider_write_authorized = false),
  booking_launch_authorized boolean not null default false check (booking_launch_authorized = false),
  destructive_cleanup_authorized boolean not null default false check (destructive_cleanup_authorized = false),
  server_time_authoritative boolean not null default true check (server_time_authoritative = true),
  recorded_at timestamptz not null default statement_timestamp(),
  check (
    (event_kind = 'claimed'
      and lease_seconds between 30 and 300
      and lease_expires_at is not null
      and next_eligible_at is null
      and reason_code is null)
    or
    (event_kind = 'released'
      and lease_seconds is null
      and lease_expires_at is null
      and next_eligible_at is null
      and reason_code = 'observed_no_send')
    or
    (event_kind = 'retry_scheduled'
      and lease_seconds is null
      and lease_expires_at is null
      and next_eligible_at is not null
      and reason_code = 'transient_failure')
    or
    (event_kind = 'dead_lettered'
      and lease_seconds is null
      and lease_expires_at is null
      and next_eligible_at is null
      and reason_code in ('attempts_exhausted','invalid_work_item'))
  )
);

create unique index if not exists lesson_booking_preview_escalation_work_claim_key_uq
  on public.lesson_booking_preview_launch_blocker_escalation_work_events(claim_key)
  where event_kind = 'claimed';

create unique index if not exists lesson_booking_preview_escalation_work_claim_attempt_uq
  on public.lesson_booking_preview_launch_blocker_escalation_work_events(queue_item_id, attempt_no)
  where event_kind = 'claimed';

create unique index if not exists lesson_booking_preview_escalation_work_terminal_claim_uq
  on public.lesson_booking_preview_launch_blocker_escalation_work_events(claim_key)
  where event_kind in ('released','retry_scheduled','dead_lettered');

create index if not exists lesson_booking_preview_escalation_work_queue_event_idx
  on public.lesson_booking_preview_launch_blocker_escalation_work_events(queue_item_id, event_id desc);

alter table public.lesson_booking_preview_launch_blocker_escalation_work_events enable row level security;

revoke all on table public.lesson_booking_preview_launch_blocker_escalation_work_events
  from public, anon, authenticated, service_role;

drop trigger if exists lesson_booking_preview_launch_blocker_escalation_work_events_append_only
  on public.lesson_booking_preview_launch_blocker_escalation_work_events;
create trigger lesson_booking_preview_launch_blocker_escalation_work_events_append_only
before update or delete on public.lesson_booking_preview_launch_blocker_escalation_work_events
for each row execute function public.forbid_change();

create or replace function public.service_claim_booking_preview_launch_blocker_escalation_work(
  p_queue_item_id bigint,
  p_claim_key text,
  p_lease_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue public.lesson_booking_preview_launch_blocker_escalation_queue%rowtype;
  v_latest_snapshot_id bigint;
  v_existing_claim public.lesson_booking_preview_launch_blocker_escalation_work_events%rowtype;
  v_existing_terminal public.lesson_booking_preview_launch_blocker_escalation_work_events%rowtype;
  v_latest_event public.lesson_booking_preview_launch_blocker_escalation_work_events%rowtype;
  v_claim_key text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_claim_key,''::text)));
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_attempt_no integer;
  v_event_id bigint;
  v_lease_expires_at timestamptz;
begin
  if p_queue_item_id is null or p_queue_item_id < 1 then
    raise exception 'invalid_preview_escalation_queue_item_id' using errcode='22023';
  end if;
  if v_claim_key !~ '^[0-9a-f]{32}$' or v_claim_key = repeat('0',32) then
    raise exception 'invalid_preview_escalation_claim_key' using errcode='22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 300 then
    raise exception 'invalid_preview_escalation_lease_seconds' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(20260921,40520);

  select s.snapshot_id into v_latest_snapshot_id
  from public.lesson_booking_preview_launch_blocker_snapshots s
  order by s.snapshot_id desc
  limit 1;
  if v_latest_snapshot_id is null then
    raise exception 'preview_launch_blocker_snapshot_missing' using errcode='P0002';
  end if;

  select * into v_queue
  from public.lesson_booking_preview_launch_blocker_escalation_queue q
  where q.queue_item_id = p_queue_item_id;
  if not found then
    raise exception 'preview_escalation_queue_item_missing' using errcode='P0002';
  end if;
  if v_queue.snapshot_id <> v_latest_snapshot_id then
    raise exception 'stale_preview_escalation_queue_item' using errcode='40001';
  end if;

  select * into v_existing_claim
  from public.lesson_booking_preview_launch_blocker_escalation_work_events e
  where e.claim_key = v_claim_key and e.event_kind = 'claimed';
  if found then
    if v_existing_claim.queue_item_id <> p_queue_item_id then
      raise exception 'preview_escalation_claim_key_conflict' using errcode='23505';
    end if;
    select * into v_existing_terminal
    from public.lesson_booking_preview_launch_blocker_escalation_work_events e
    where e.claim_key = v_claim_key and e.event_kind in ('released','retry_scheduled','dead_lettered')
    order by e.event_id desc
    limit 1;
    if found then
      raise exception 'preview_escalation_claim_key_closed' using errcode='55000';
    end if;
    if v_existing_claim.lease_expires_at <= v_now then
      raise exception 'stale_preview_escalation_lease' using errcode='40001';
    end if;
    return pg_catalog.jsonb_build_object(
      'schema_version','smart_parrot_booking_preview_launch_blocker_escalation_claim_v1',
      'event_id',v_existing_claim.event_id,
      'queue_item_id',v_existing_claim.queue_item_id,
      'snapshot_id',v_existing_claim.snapshot_id,
      'alert_id',v_existing_claim.alert_id,
      'claim_key',v_existing_claim.claim_key,
      'attempt_no',v_existing_claim.attempt_no,
      'lease_seconds',v_existing_claim.lease_seconds,
      'lease_expires_at',v_existing_claim.lease_expires_at,
      'recorded_at',v_existing_claim.recorded_at,
      'work_state','leased',
      'lease_active',true,
      'replay',true,
      'automatic_notification_authorized',false,
      'notifier_send_authorized',false,
      'outcome_suppresses_blocker',false,
      'provider_write_authorized',false,
      'booking_launch_authorized',false,
      'destructive_cleanup_authorized',false,
      'server_time_authoritative',true
    );
  end if;

  select * into v_latest_event
  from public.lesson_booking_preview_launch_blocker_escalation_work_events e
  where e.queue_item_id = p_queue_item_id
  order by e.event_id desc
  limit 1;

  if found then
    if v_latest_event.event_kind = 'dead_lettered' then
      raise exception 'preview_escalation_work_dead_lettered' using errcode='55000';
    end if;
    if v_latest_event.event_kind = 'claimed' and v_latest_event.lease_expires_at > v_now then
      raise exception 'preview_escalation_work_already_leased' using errcode='55P03';
    end if;
    if v_latest_event.event_kind = 'retry_scheduled' and v_latest_event.next_eligible_at > v_now then
      raise exception 'preview_escalation_retry_not_ready' using errcode='55000';
    end if;
  end if;

  select coalesce(max(e.attempt_no),0) + 1 into v_attempt_no
  from public.lesson_booking_preview_launch_blocker_escalation_work_events e
  where e.queue_item_id = p_queue_item_id and e.event_kind = 'claimed';

  v_lease_expires_at := v_now + pg_catalog.make_interval(secs => p_lease_seconds);

  insert into public.lesson_booking_preview_launch_blocker_escalation_work_events(
    schema_version,queue_item_id,snapshot_id,alert_id,event_kind,claim_key,attempt_no,
    lease_seconds,lease_expires_at
  ) values (
    'smart_parrot_booking_preview_launch_blocker_escalation_work_event_v1',
    v_queue.queue_item_id,v_queue.snapshot_id,v_queue.alert_id,'claimed',v_claim_key,v_attempt_no,
    p_lease_seconds,v_lease_expires_at
  ) returning event_id into v_event_id;

  return pg_catalog.jsonb_build_object(
    'schema_version','smart_parrot_booking_preview_launch_blocker_escalation_claim_v1',
    'event_id',v_event_id,
    'queue_item_id',v_queue.queue_item_id,
    'snapshot_id',v_queue.snapshot_id,
    'alert_id',v_queue.alert_id,
    'claim_key',v_claim_key,
    'attempt_no',v_attempt_no,
    'lease_seconds',p_lease_seconds,
    'lease_expires_at',v_lease_expires_at,
    'recorded_at',v_now,
    'work_state','leased',
    'lease_active',true,
    'replay',false,
    'automatic_notification_authorized',false,
    'notifier_send_authorized',false,
    'outcome_suppresses_blocker',false,
    'provider_write_authorized',false,
    'booking_launch_authorized',false,
    'destructive_cleanup_authorized',false,
    'server_time_authoritative',true
  );
end;
$$;

create or replace function public.service_transition_booking_preview_launch_blocker_escalation_work(
  p_queue_item_id bigint,
  p_claim_key text,
  p_outcome text,
  p_reason_code text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue public.lesson_booking_preview_launch_blocker_escalation_queue%rowtype;
  v_latest_snapshot_id bigint;
  v_claim public.lesson_booking_preview_launch_blocker_escalation_work_events%rowtype;
  v_existing_terminal public.lesson_booking_preview_launch_blocker_escalation_work_events%rowtype;
  v_latest_event public.lesson_booking_preview_launch_blocker_escalation_work_events%rowtype;
  v_claim_key text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_claim_key,''::text)));
  v_outcome text := pg_catalog.btrim(coalesce(p_outcome,''::text));
  v_reason_code text := pg_catalog.btrim(coalesce(p_reason_code,''::text));
  v_event_kind text;
  v_work_state text;
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_backoff_seconds integer;
  v_next_eligible_at timestamptz;
  v_event_id bigint;
begin
  if p_queue_item_id is null or p_queue_item_id < 1 then
    raise exception 'invalid_preview_escalation_queue_item_id' using errcode='22023';
  end if;
  if v_claim_key !~ '^[0-9a-f]{32}$' or v_claim_key = repeat('0',32) then
    raise exception 'invalid_preview_escalation_claim_key' using errcode='22023';
  end if;
  if v_outcome not in ('release','retry','dead_letter') then
    raise exception 'invalid_preview_escalation_transition_outcome' using errcode='22023';
  end if;
  if (v_outcome='release' and v_reason_code <> 'observed_no_send')
     or (v_outcome='retry' and v_reason_code <> 'transient_failure')
     or (v_outcome='dead_letter' and v_reason_code not in ('attempts_exhausted','invalid_work_item')) then
    raise exception 'invalid_preview_escalation_transition_reason' using errcode='22023';
  end if;

  v_event_kind := case v_outcome
    when 'release' then 'released'
    when 'retry' then 'retry_scheduled'
    else 'dead_lettered'
  end;
  v_work_state := case v_outcome
    when 'release' then 'available'
    when 'retry' then 'retry_wait'
    else 'dead_lettered'
  end;

  perform pg_catalog.pg_advisory_xact_lock(20260921,40520);

  select s.snapshot_id into v_latest_snapshot_id
  from public.lesson_booking_preview_launch_blocker_snapshots s
  order by s.snapshot_id desc
  limit 1;
  if v_latest_snapshot_id is null then
    raise exception 'preview_launch_blocker_snapshot_missing' using errcode='P0002';
  end if;

  select * into v_queue
  from public.lesson_booking_preview_launch_blocker_escalation_queue q
  where q.queue_item_id = p_queue_item_id;
  if not found then
    raise exception 'preview_escalation_queue_item_missing' using errcode='P0002';
  end if;
  if v_queue.snapshot_id <> v_latest_snapshot_id then
    raise exception 'stale_preview_escalation_queue_item' using errcode='40001';
  end if;

  select * into v_existing_terminal
  from public.lesson_booking_preview_launch_blocker_escalation_work_events e
  where e.claim_key = v_claim_key and e.event_kind in ('released','retry_scheduled','dead_lettered')
  order by e.event_id desc
  limit 1;
  if found then
    if v_existing_terminal.queue_item_id <> p_queue_item_id
       or v_existing_terminal.event_kind <> v_event_kind
       or v_existing_terminal.reason_code <> v_reason_code then
      raise exception 'preview_escalation_transition_conflict' using errcode='23505';
    end if;
    return pg_catalog.jsonb_build_object(
      'schema_version','smart_parrot_booking_preview_launch_blocker_escalation_transition_v1',
      'event_id',v_existing_terminal.event_id,
      'queue_item_id',v_existing_terminal.queue_item_id,
      'snapshot_id',v_existing_terminal.snapshot_id,
      'alert_id',v_existing_terminal.alert_id,
      'claim_key',v_existing_terminal.claim_key,
      'attempt_no',v_existing_terminal.attempt_no,
      'outcome',v_outcome,
      'reason_code',v_existing_terminal.reason_code,
      'work_state',v_work_state,
      'next_eligible_at',v_existing_terminal.next_eligible_at,
      'recorded_at',v_existing_terminal.recorded_at,
      'replay',true,
      'automatic_notification_authorized',false,
      'notifier_send_authorized',false,
      'outcome_suppresses_blocker',false,
      'provider_write_authorized',false,
      'booking_launch_authorized',false,
      'destructive_cleanup_authorized',false,
      'server_time_authoritative',true
    );
  end if;

  select * into v_claim
  from public.lesson_booking_preview_launch_blocker_escalation_work_events e
  where e.claim_key = v_claim_key and e.event_kind = 'claimed';
  if not found or v_claim.queue_item_id <> p_queue_item_id then
    raise exception 'preview_escalation_claim_missing' using errcode='P0002';
  end if;

  select * into v_latest_event
  from public.lesson_booking_preview_launch_blocker_escalation_work_events e
  where e.queue_item_id = p_queue_item_id
  order by e.event_id desc
  limit 1;
  if not found or v_latest_event.event_id <> v_claim.event_id or v_claim.lease_expires_at <= v_now then
    raise exception 'stale_preview_escalation_lease' using errcode='40001';
  end if;

  if v_outcome='dead_letter' and v_reason_code='attempts_exhausted' and v_claim.attempt_no < 5 then
    raise exception 'preview_escalation_attempts_not_exhausted' using errcode='55000';
  end if;

  if v_outcome='retry' then
    v_backoff_seconds := case
      when v_claim.attempt_no <= 1 then 30
      when v_claim.attempt_no = 2 then 60
      when v_claim.attempt_no = 3 then 120
      when v_claim.attempt_no = 4 then 240
      when v_claim.attempt_no = 5 then 480
      else 900
    end;
    v_next_eligible_at := v_now + pg_catalog.make_interval(secs => v_backoff_seconds);
  end if;

  insert into public.lesson_booking_preview_launch_blocker_escalation_work_events(
    schema_version,queue_item_id,snapshot_id,alert_id,event_kind,claim_key,attempt_no,
    next_eligible_at,reason_code
  ) values (
    'smart_parrot_booking_preview_launch_blocker_escalation_work_event_v1',
    v_queue.queue_item_id,v_queue.snapshot_id,v_queue.alert_id,v_event_kind,v_claim_key,v_claim.attempt_no,
    v_next_eligible_at,v_reason_code
  ) returning event_id into v_event_id;

  return pg_catalog.jsonb_build_object(
    'schema_version','smart_parrot_booking_preview_launch_blocker_escalation_transition_v1',
    'event_id',v_event_id,
    'queue_item_id',v_queue.queue_item_id,
    'snapshot_id',v_queue.snapshot_id,
    'alert_id',v_queue.alert_id,
    'claim_key',v_claim_key,
    'attempt_no',v_claim.attempt_no,
    'outcome',v_outcome,
    'reason_code',v_reason_code,
    'work_state',v_work_state,
    'next_eligible_at',v_next_eligible_at,
    'recorded_at',v_now,
    'replay',false,
    'automatic_notification_authorized',false,
    'notifier_send_authorized',false,
    'outcome_suppresses_blocker',false,
    'provider_write_authorized',false,
    'booking_launch_authorized',false,
    'destructive_cleanup_authorized',false,
    'server_time_authoritative',true
  );
end;
$$;

create or replace function public.service_list_booking_preview_launch_blocker_escalation_work(
  p_limit integer default 25
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := coalesce(p_limit,25);
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_latest_snapshot_id bigint;
  v_items jsonb;
begin
  if v_limit < 1 or v_limit > 100 then
    raise exception 'invalid_preview_escalation_inspection_limit' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(20260921,40520);

  select s.snapshot_id into v_latest_snapshot_id
  from public.lesson_booking_preview_launch_blocker_snapshots s
  order by s.snapshot_id desc
  limit 1;

  if v_latest_snapshot_id is null then
    v_items := '[]'::jsonb;
  else
    with candidate as (
      select
        q.queue_item_id,q.snapshot_id,q.alert_id,q.delivery_key,q.severity,q.escalation_class,q.blocker_count,
        e.event_kind,e.attempt_no,e.lease_expires_at,e.next_eligible_at,e.recorded_at as last_event_at,
        case
          when e.event_id is null then 'available'
          when e.event_kind='dead_lettered' then 'dead_lettered'
          when e.event_kind='claimed' and e.lease_expires_at > v_now then 'leased'
          when e.event_kind='retry_scheduled' and e.next_eligible_at > v_now then 'retry_wait'
          else 'available'
        end as work_state
      from public.lesson_booking_preview_launch_blocker_escalation_queue q
      left join lateral (
        select ev.*
        from public.lesson_booking_preview_launch_blocker_escalation_work_events ev
        where ev.queue_item_id=q.queue_item_id
        order by ev.event_id desc
        limit 1
      ) e on true
      where q.snapshot_id=v_latest_snapshot_id
      order by q.queue_item_id
      limit v_limit
    )
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'queue_item_id',c.queue_item_id,
      'snapshot_id',c.snapshot_id,
      'alert_id',c.alert_id,
      'delivery_key',c.delivery_key,
      'severity',c.severity,
      'escalation_class',c.escalation_class,
      'blocker_count',c.blocker_count,
      'attempt_no',coalesce(c.attempt_no,0),
      'work_state',c.work_state,
      'lease_expires_at',case when c.work_state='leased' then c.lease_expires_at else null end,
      'next_eligible_at',case when c.work_state='retry_wait' then c.next_eligible_at else null end,
      'last_event_at',c.last_event_at
    ) order by c.queue_item_id), '[]'::jsonb)
    into v_items
    from candidate c;
  end if;

  return pg_catalog.jsonb_build_object(
    'schema_version','smart_parrot_booking_preview_launch_blocker_escalation_inspection_v1',
    'captured_at',v_now,
    'item_count',pg_catalog.jsonb_array_length(v_items),
    'items',v_items,
    'automatic_notification_authorized',false,
    'notifier_send_authorized',false,
    'outcome_suppresses_blocker',false,
    'provider_write_authorized',false,
    'booking_launch_authorized',false,
    'destructive_cleanup_authorized',false,
    'server_time_authoritative',true
  );
end;
$$;

revoke all on function public.service_claim_booking_preview_launch_blocker_escalation_work(bigint,text,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.service_claim_booking_preview_launch_blocker_escalation_work(bigint,text,integer)
  to service_role;

revoke all on function public.service_transition_booking_preview_launch_blocker_escalation_work(bigint,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.service_transition_booking_preview_launch_blocker_escalation_work(bigint,text,text,text)
  to service_role;

revoke all on function public.service_list_booking_preview_launch_blocker_escalation_work(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.service_list_booking_preview_launch_blocker_escalation_work(integer)
  to service_role;

comment on table public.lesson_booking_preview_launch_blocker_escalation_work_events is
  'Service-only append-only preview escalation claim/lease and release/retry/dead-letter evidence. No external notification/provider authority is granted.';
comment on function public.service_claim_booking_preview_launch_blocker_escalation_work(bigint,text,integer) is
  'Claims current preview escalation work with a bounded 30-300 second PostgreSQL-server-time lease. Exact active claim retries replay; concurrent or stale leases are rejected.';
comment on function public.service_transition_booking_preview_launch_blocker_escalation_work(bigint,text,text,text) is
  'Appends one idempotent release/retry/dead-letter outcome for the exact active lease. Retry backoff is server-derived; no external notification is sent.';
comment on function public.service_list_booking_preview_launch_blocker_escalation_work(integer) is
  'Returns minimized service-only escalation work state for the latest preview snapshot without claim keys, blocker codes, customer/provider identifiers, secrets, or payment data.';