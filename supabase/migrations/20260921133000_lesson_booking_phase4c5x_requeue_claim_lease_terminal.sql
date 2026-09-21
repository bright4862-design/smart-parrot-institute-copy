-- Smart Parrot Institute lesson-booking Phase 4C5X
-- Requeue-specific activation-scoped claim/lease generations + terminal transition evidence.
-- Preview-only: no external notifier send, Cron sender, provider/payment write, booking launch,
-- destructive cleanup, Base44 publication, or production mutation.

create table if not exists public.lesson_booking_preview_launch_blocker_requeue_lease_events (
  event_id bigint generated always as identity primary key,
  schema_version text not null check (schema_version = 'smart_parrot_booking_preview_launch_blocker_requeue_lease_event_v1'),
  activation_id bigint not null references public.lesson_booking_preview_launch_blocker_requeue_work_activations(activation_id) on delete restrict,
  work_generation_id bigint not null references public.lesson_booking_preview_launch_blocker_requeue_work_generations(work_generation_id) on delete restrict,
  queue_item_id bigint not null references public.lesson_booking_preview_launch_blocker_escalation_queue(queue_item_id) on delete restrict,
  snapshot_id bigint not null references public.lesson_booking_preview_launch_blocker_snapshots(snapshot_id) on delete restrict,
  alert_id bigint not null references public.lesson_booking_preview_launch_blocker_alerts(alert_id) on delete restrict,
  lineage_ref text not null check (lineage_ref ~ '^rqg:[0-9]+:[0-9]+:[0-9]+:[0-9]+$'),
  event_kind text not null check (event_kind in ('claimed','released','retry_scheduled','dead_lettered')),
  claim_key text not null check (claim_key ~ '^[0-9a-f]{32}$' and claim_key <> repeat('0',32)),
  lease_generation_no integer not null check (lease_generation_no between 1 and 3),
  lease_seconds integer,
  lease_expires_at timestamptz,
  next_eligible_at timestamptz,
  reason_code text,
  requeue_execution_authorized boolean not null default false check (requeue_execution_authorized = false),
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
      and reason_code = 'transient_worker_failure')
    or
    (event_kind = 'dead_lettered'
      and lease_seconds is null
      and lease_expires_at is null
      and next_eligible_at is null
      and reason_code in ('requeue_attempts_exhausted','invalid_activation_lineage'))
  )
);

create unique index if not exists lesson_booking_preview_requeue_lease_claim_key_uq
  on public.lesson_booking_preview_launch_blocker_requeue_lease_events(claim_key)
  where event_kind = 'claimed';

create unique index if not exists lesson_booking_preview_requeue_lease_generation_uq
  on public.lesson_booking_preview_launch_blocker_requeue_lease_events(activation_id, lease_generation_no)
  where event_kind = 'claimed';

create unique index if not exists lesson_booking_preview_requeue_lease_terminal_claim_uq
  on public.lesson_booking_preview_launch_blocker_requeue_lease_events(claim_key)
  where event_kind in ('released','retry_scheduled','dead_lettered');

create index if not exists lesson_booking_preview_requeue_lease_activation_event_idx
  on public.lesson_booking_preview_launch_blocker_requeue_lease_events(activation_id, event_id desc);

alter table public.lesson_booking_preview_launch_blocker_requeue_lease_events enable row level security;

revoke all on table public.lesson_booking_preview_launch_blocker_requeue_lease_events
  from public, anon, authenticated, service_role;

drop trigger if exists lesson_booking_preview_launch_blocker_requeue_lease_events_append_only
  on public.lesson_booking_preview_launch_blocker_requeue_lease_events;
create trigger lesson_booking_preview_launch_blocker_requeue_lease_events_append_only
before update or delete on public.lesson_booking_preview_launch_blocker_requeue_lease_events
for each row execute function public.forbid_change();

create or replace function public.service_claim_booking_preview_launch_blocker_requeue_work(
  p_activation_id bigint,
  p_claim_key text,
  p_lease_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activation public.lesson_booking_preview_launch_blocker_requeue_work_activations%rowtype;
  v_work public.lesson_booking_preview_launch_blocker_requeue_work_generations%rowtype;
  v_eligibility public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations%rowtype;
  v_dead public.lesson_booking_preview_launch_blocker_escalation_work_events%rowtype;
  v_existing_claim public.lesson_booking_preview_launch_blocker_requeue_lease_events%rowtype;
  v_existing_terminal public.lesson_booking_preview_launch_blocker_requeue_lease_events%rowtype;
  v_latest_event public.lesson_booking_preview_launch_blocker_requeue_lease_events%rowtype;
  v_latest_snapshot_id bigint;
  v_latest_activation_id bigint;
  v_latest_work_generation_id bigint;
  v_latest_eligibility_generation_id bigint;
  v_latest_dead_event_id bigint;
  v_claim_key text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_claim_key,''::text)));
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_lease_generation_no integer;
  v_lease_expires_at timestamptz;
  v_event_id bigint;
begin
  if p_activation_id is null or p_activation_id < 1 then
    raise exception 'invalid_preview_requeue_activation_id' using errcode='22023';
  end if;
  if v_claim_key !~ '^[0-9a-f]{32}$' or v_claim_key = pg_catalog.repeat('0',32) then
    raise exception 'invalid_preview_requeue_claim_key' using errcode='22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 300 then
    raise exception 'invalid_preview_requeue_lease_seconds' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(20260921,40520);

  select s.snapshot_id into v_latest_snapshot_id
  from public.lesson_booking_preview_launch_blocker_snapshots s
  order by s.snapshot_id desc
  limit 1;
  if v_latest_snapshot_id is null then
    raise exception 'preview_launch_blocker_snapshot_missing' using errcode='P0002';
  end if;

  select * into v_activation
  from public.lesson_booking_preview_launch_blocker_requeue_work_activations a
  where a.activation_id = p_activation_id;
  if not found then
    raise exception 'preview_requeue_activation_missing' using errcode='P0002';
  end if;
  if v_activation.snapshot_id <> v_latest_snapshot_id then
    raise exception 'stale_preview_requeue_claim_snapshot' using errcode='40001';
  end if;
  if v_activation.activation_status <> 'activated'
     or v_activation.lease_handoff_state <> 'eligible_for_internal_claim'
     or v_activation.claim_scope <> 'internal_preview_escalation_lease'
     or v_activation.claim_eligible is distinct from true then
    raise exception 'preview_requeue_activation_not_claim_eligible' using errcode='55000';
  end if;

  select a.activation_id into v_latest_activation_id
  from public.lesson_booking_preview_launch_blocker_requeue_work_activations a
  where a.queue_item_id = v_activation.queue_item_id
  order by a.activation_id desc
  limit 1;
  if v_latest_activation_id is distinct from v_activation.activation_id then
    raise exception 'stale_preview_requeue_claim_activation' using errcode='40001';
  end if;

  select * into v_work
  from public.lesson_booking_preview_launch_blocker_requeue_work_generations w
  where w.work_generation_id = v_activation.work_generation_id
    and w.queue_item_id = v_activation.queue_item_id
    and w.snapshot_id = v_activation.snapshot_id
    and w.lineage_ref = v_activation.lineage_ref;
  if not found or v_work.work_state <> 'prepared' or v_work.claim_eligible then
    raise exception 'stale_preview_requeue_claim_work_generation' using errcode='40001';
  end if;

  select w.work_generation_id into v_latest_work_generation_id
  from public.lesson_booking_preview_launch_blocker_requeue_work_generations w
  where w.queue_item_id = v_activation.queue_item_id
  order by w.work_generation_no desc, w.work_generation_id desc
  limit 1;
  if v_latest_work_generation_id is distinct from v_activation.work_generation_id then
    raise exception 'stale_preview_requeue_claim_work_generation' using errcode='40001';
  end if;

  select * into v_eligibility
  from public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations g
  where g.generation_id = v_activation.eligibility_generation_id
    and g.review_id = v_activation.review_id
    and g.queue_item_id = v_activation.queue_item_id
    and g.snapshot_id = v_activation.snapshot_id
    and g.alert_id = v_activation.alert_id
    and g.dead_letter_event_id = v_activation.dead_letter_event_id;
  if not found
     or v_eligibility.requeue_eligible is distinct from true
     or v_eligibility.review_decision <> 'retry_after_review' then
    raise exception 'stale_preview_requeue_claim_eligibility' using errcode='40001';
  end if;
  if v_eligibility.expires_at <= v_now then
    raise exception 'preview_requeue_claim_eligibility_expired' using errcode='55000';
  end if;

  select g.generation_id into v_latest_eligibility_generation_id
  from public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations g
  where g.review_id = v_eligibility.review_id
  order by g.generation_no desc, g.generation_id desc
  limit 1;
  if v_latest_eligibility_generation_id is distinct from v_eligibility.generation_id then
    raise exception 'stale_preview_requeue_claim_eligibility_generation' using errcode='40001';
  end if;

  select * into v_dead
  from public.lesson_booking_preview_launch_blocker_escalation_work_events e
  where e.event_id = v_activation.dead_letter_event_id
    and e.queue_item_id = v_activation.queue_item_id
    and e.snapshot_id = v_activation.snapshot_id
    and e.alert_id = v_activation.alert_id;
  if not found or v_dead.event_kind <> 'dead_lettered' or v_dead.reason_code <> 'attempts_exhausted' then
    raise exception 'stale_preview_requeue_claim_dead_letter' using errcode='40001';
  end if;

  select e.event_id into v_latest_dead_event_id
  from public.lesson_booking_preview_launch_blocker_escalation_work_events e
  where e.queue_item_id = v_activation.queue_item_id
  order by e.event_id desc
  limit 1;
  if v_latest_dead_event_id is distinct from v_activation.dead_letter_event_id then
    raise exception 'stale_preview_requeue_claim_dead_letter_lineage' using errcode='40001';
  end if;

  select * into v_existing_claim
  from public.lesson_booking_preview_launch_blocker_requeue_lease_events e
  where e.claim_key = v_claim_key and e.event_kind = 'claimed';
  if found then
    if v_existing_claim.activation_id <> v_activation.activation_id then
      raise exception 'preview_requeue_claim_key_conflict' using errcode='23505';
    end if;
    select * into v_existing_terminal
    from public.lesson_booking_preview_launch_blocker_requeue_lease_events e
    where e.claim_key = v_claim_key and e.event_kind in ('released','retry_scheduled','dead_lettered')
    order by e.event_id desc
    limit 1;
    if found then
      raise exception 'preview_requeue_claim_key_closed' using errcode='55000';
    end if;
    if v_existing_claim.lease_expires_at <= v_now then
      raise exception 'stale_preview_requeue_lease' using errcode='40001';
    end if;
    return pg_catalog.jsonb_build_object(
      'schema_version','smart_parrot_booking_preview_launch_blocker_requeue_claim_v1',
      'event_id',v_existing_claim.event_id,
      'activation_id',v_existing_claim.activation_id,
      'work_generation_id',v_existing_claim.work_generation_id,
      'queue_item_id',v_existing_claim.queue_item_id,
      'snapshot_id',v_existing_claim.snapshot_id,
      'alert_id',v_existing_claim.alert_id,
      'lineage_ref',v_existing_claim.lineage_ref,
      'claim_key',v_existing_claim.claim_key,
      'lease_generation_no',v_existing_claim.lease_generation_no,
      'lease_seconds',v_existing_claim.lease_seconds,
      'lease_expires_at',v_existing_claim.lease_expires_at,
      'recorded_at',v_existing_claim.recorded_at,
      'work_state','leased',
      'lease_active',true,
      'replay',true,
      'requeue_execution_authorized',false,
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
  from public.lesson_booking_preview_launch_blocker_requeue_lease_events e
  where e.activation_id = v_activation.activation_id
  order by e.event_id desc
  limit 1;

  if found then
    if v_latest_event.event_kind = 'dead_lettered' then
      raise exception 'preview_requeue_work_dead_lettered' using errcode='55000';
    end if;
    if v_latest_event.event_kind = 'claimed' and v_latest_event.lease_expires_at > v_now then
      raise exception 'preview_requeue_work_already_leased' using errcode='55P03';
    end if;
    if v_latest_event.event_kind = 'retry_scheduled' and v_latest_event.next_eligible_at > v_now then
      raise exception 'preview_requeue_retry_not_ready' using errcode='55000';
    end if;
  end if;

  select coalesce(max(e.lease_generation_no),0) + 1 into v_lease_generation_no
  from public.lesson_booking_preview_launch_blocker_requeue_lease_events e
  where e.activation_id = v_activation.activation_id
    and e.event_kind = 'claimed';

  if v_lease_generation_no > 3 then
    raise exception 'preview_requeue_claim_generations_exhausted' using errcode='55000';
  end if;

  v_lease_expires_at := v_now + pg_catalog.make_interval(secs => p_lease_seconds);

  insert into public.lesson_booking_preview_launch_blocker_requeue_lease_events(
    schema_version,activation_id,work_generation_id,queue_item_id,snapshot_id,alert_id,lineage_ref,
    event_kind,claim_key,lease_generation_no,lease_seconds,lease_expires_at,recorded_at
  ) values (
    'smart_parrot_booking_preview_launch_blocker_requeue_lease_event_v1',
    v_activation.activation_id,v_activation.work_generation_id,v_activation.queue_item_id,
    v_activation.snapshot_id,v_activation.alert_id,v_activation.lineage_ref,
    'claimed',v_claim_key,v_lease_generation_no,p_lease_seconds,v_lease_expires_at,v_now
  ) returning event_id into v_event_id;

  return pg_catalog.jsonb_build_object(
    'schema_version','smart_parrot_booking_preview_launch_blocker_requeue_claim_v1',
    'event_id',v_event_id,
    'activation_id',v_activation.activation_id,
    'work_generation_id',v_activation.work_generation_id,
    'queue_item_id',v_activation.queue_item_id,
    'snapshot_id',v_activation.snapshot_id,
    'alert_id',v_activation.alert_id,
    'lineage_ref',v_activation.lineage_ref,
    'claim_key',v_claim_key,
    'lease_generation_no',v_lease_generation_no,
    'lease_seconds',p_lease_seconds,
    'lease_expires_at',v_lease_expires_at,
    'recorded_at',v_now,
    'work_state','leased',
    'lease_active',true,
    'replay',false,
    'requeue_execution_authorized',false,
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

create or replace function public.service_transition_booking_preview_launch_blocker_requeue_work(
  p_activation_id bigint,
  p_claim_key text,
  p_outcome text,
  p_reason_code text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activation public.lesson_booking_preview_launch_blocker_requeue_work_activations%rowtype;
  v_claim public.lesson_booking_preview_launch_blocker_requeue_lease_events%rowtype;
  v_existing_terminal public.lesson_booking_preview_launch_blocker_requeue_lease_events%rowtype;
  v_latest_event public.lesson_booking_preview_launch_blocker_requeue_lease_events%rowtype;
  v_latest_snapshot_id bigint;
  v_latest_activation_id bigint;
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
  if p_activation_id is null or p_activation_id < 1 then
    raise exception 'invalid_preview_requeue_activation_id' using errcode='22023';
  end if;
  if v_claim_key !~ '^[0-9a-f]{32}$' or v_claim_key = pg_catalog.repeat('0',32) then
    raise exception 'invalid_preview_requeue_claim_key' using errcode='22023';
  end if;
  if v_outcome not in ('release','retry','dead_letter') then
    raise exception 'invalid_preview_requeue_transition_outcome' using errcode='22023';
  end if;
  if (v_outcome='release' and v_reason_code <> 'observed_no_send')
     or (v_outcome='retry' and v_reason_code <> 'transient_worker_failure')
     or (v_outcome='dead_letter' and v_reason_code not in ('requeue_attempts_exhausted','invalid_activation_lineage')) then
    raise exception 'invalid_preview_requeue_transition_reason' using errcode='22023';
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

  select * into v_activation
  from public.lesson_booking_preview_launch_blocker_requeue_work_activations a
  where a.activation_id = p_activation_id;
  if not found then
    raise exception 'preview_requeue_activation_missing' using errcode='P0002';
  end if;
  if v_activation.snapshot_id <> v_latest_snapshot_id then
    raise exception 'stale_preview_requeue_transition_snapshot' using errcode='40001';
  end if;

  select a.activation_id into v_latest_activation_id
  from public.lesson_booking_preview_launch_blocker_requeue_work_activations a
  where a.queue_item_id = v_activation.queue_item_id
  order by a.activation_id desc
  limit 1;
  if v_latest_activation_id is distinct from v_activation.activation_id then
    raise exception 'stale_preview_requeue_transition_activation' using errcode='40001';
  end if;

  select * into v_existing_terminal
  from public.lesson_booking_preview_launch_blocker_requeue_lease_events e
  where e.claim_key = v_claim_key
    and e.event_kind in ('released','retry_scheduled','dead_lettered')
  order by e.event_id desc
  limit 1;
  if found then
    if v_existing_terminal.activation_id <> v_activation.activation_id
       or v_existing_terminal.event_kind <> v_event_kind
       or v_existing_terminal.reason_code <> v_reason_code then
      raise exception 'preview_requeue_transition_conflict' using errcode='23505';
    end if;
    return pg_catalog.jsonb_build_object(
      'schema_version','smart_parrot_booking_preview_launch_blocker_requeue_transition_v1',
      'event_id',v_existing_terminal.event_id,
      'activation_id',v_existing_terminal.activation_id,
      'work_generation_id',v_existing_terminal.work_generation_id,
      'queue_item_id',v_existing_terminal.queue_item_id,
      'snapshot_id',v_existing_terminal.snapshot_id,
      'alert_id',v_existing_terminal.alert_id,
      'lineage_ref',v_existing_terminal.lineage_ref,
      'lease_generation_no',v_existing_terminal.lease_generation_no,
      'outcome',v_outcome,
      'reason_code',v_existing_terminal.reason_code,
      'work_state',v_work_state,
      'next_eligible_at',v_existing_terminal.next_eligible_at,
      'recorded_at',v_existing_terminal.recorded_at,
      'replay',true,
      'requeue_execution_authorized',false,
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
  from public.lesson_booking_preview_launch_blocker_requeue_lease_events e
  where e.claim_key = v_claim_key and e.event_kind = 'claimed';
  if not found or v_claim.activation_id <> v_activation.activation_id then
    raise exception 'preview_requeue_claim_missing' using errcode='P0002';
  end if;

  select * into v_latest_event
  from public.lesson_booking_preview_launch_blocker_requeue_lease_events e
  where e.activation_id = v_activation.activation_id
  order by e.event_id desc
  limit 1;
  if not found or v_latest_event.event_id <> v_claim.event_id or v_claim.lease_expires_at <= v_now then
    raise exception 'stale_preview_requeue_lease' using errcode='40001';
  end if;

  if v_outcome='retry' and v_claim.lease_generation_no >= 3 then
    raise exception 'preview_requeue_retry_generations_exhausted' using errcode='55000';
  end if;
  if v_outcome='dead_letter'
     and v_reason_code='requeue_attempts_exhausted'
     and v_claim.lease_generation_no < 3 then
    raise exception 'preview_requeue_attempts_not_exhausted' using errcode='55000';
  end if;

  if v_outcome='retry' then
    v_backoff_seconds := case
      when v_claim.lease_generation_no = 1 then 60
      else 180
    end;
    v_next_eligible_at := v_now + pg_catalog.make_interval(secs => v_backoff_seconds);
  end if;

  insert into public.lesson_booking_preview_launch_blocker_requeue_lease_events(
    schema_version,activation_id,work_generation_id,queue_item_id,snapshot_id,alert_id,lineage_ref,
    event_kind,claim_key,lease_generation_no,next_eligible_at,reason_code,recorded_at
  ) values (
    'smart_parrot_booking_preview_launch_blocker_requeue_lease_event_v1',
    v_activation.activation_id,v_activation.work_generation_id,v_activation.queue_item_id,
    v_activation.snapshot_id,v_activation.alert_id,v_activation.lineage_ref,
    v_event_kind,v_claim_key,v_claim.lease_generation_no,v_next_eligible_at,v_reason_code,v_now
  ) returning event_id into v_event_id;

  return pg_catalog.jsonb_build_object(
    'schema_version','smart_parrot_booking_preview_launch_blocker_requeue_transition_v1',
    'event_id',v_event_id,
    'activation_id',v_activation.activation_id,
    'work_generation_id',v_activation.work_generation_id,
    'queue_item_id',v_activation.queue_item_id,
    'snapshot_id',v_activation.snapshot_id,
    'alert_id',v_activation.alert_id,
    'lineage_ref',v_activation.lineage_ref,
    'lease_generation_no',v_claim.lease_generation_no,
    'outcome',v_outcome,
    'reason_code',v_reason_code,
    'work_state',v_work_state,
    'next_eligible_at',v_next_eligible_at,
    'recorded_at',v_now,
    'replay',false,
    'requeue_execution_authorized',false,
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

create or replace function public.service_list_booking_preview_launch_blocker_requeue_work(
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
    raise exception 'invalid_preview_requeue_inspection_limit' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(20260921,40520);

  select s.snapshot_id into v_latest_snapshot_id
  from public.lesson_booking_preview_launch_blocker_snapshots s
  order by s.snapshot_id desc
  limit 1;

  if v_latest_snapshot_id is null then
    v_items := '[]'::jsonb;
  else
    with latest_activation as (
      select distinct on (a.queue_item_id) a.*
      from public.lesson_booking_preview_launch_blocker_requeue_work_activations a
      where a.snapshot_id = v_latest_snapshot_id
      order by a.queue_item_id, a.activation_id desc
    ),
    candidate as (
      select
        a.activation_id,a.work_generation_id,a.queue_item_id,a.snapshot_id,a.alert_id,a.lineage_ref,
        e.event_kind,e.lease_generation_no,e.lease_expires_at,e.next_eligible_at,e.recorded_at as last_event_at,
        case
          when e.event_id is null then 'available'
          when e.event_kind='dead_lettered' then 'dead_lettered'
          when e.event_kind='claimed' and e.lease_expires_at > v_now then 'leased'
          when e.event_kind='retry_scheduled' and e.next_eligible_at > v_now then 'retry_wait'
          else 'available'
        end as work_state
      from latest_activation a
      left join lateral (
        select ev.*
        from public.lesson_booking_preview_launch_blocker_requeue_lease_events ev
        where ev.activation_id=a.activation_id
        order by ev.event_id desc
        limit 1
      ) e on true
      order by a.queue_item_id
      limit v_limit
    )
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'activation_id',c.activation_id,
      'work_generation_id',c.work_generation_id,
      'queue_item_id',c.queue_item_id,
      'snapshot_id',c.snapshot_id,
      'alert_id',c.alert_id,
      'lineage_ref',c.lineage_ref,
      'lease_generation_no',coalesce(c.lease_generation_no,0),
      'work_state',c.work_state,
      'lease_expires_at',case when c.work_state='leased' then c.lease_expires_at else null end,
      'next_eligible_at',case when c.work_state='retry_wait' then c.next_eligible_at else null end,
      'last_event_at',c.last_event_at
    ) order by c.queue_item_id), '[]'::jsonb)
    into v_items
    from candidate c;
  end if;

  return pg_catalog.jsonb_build_object(
    'schema_version','smart_parrot_booking_preview_launch_blocker_requeue_inspection_v1',
    'captured_at',v_now,
    'item_count',pg_catalog.jsonb_array_length(v_items),
    'items',v_items,
    'requeue_execution_authorized',false,
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

revoke all on function public.service_claim_booking_preview_launch_blocker_requeue_work(bigint,text,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.service_claim_booking_preview_launch_blocker_requeue_work(bigint,text,integer)
  to service_role;

revoke all on function public.service_transition_booking_preview_launch_blocker_requeue_work(bigint,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.service_transition_booking_preview_launch_blocker_requeue_work(bigint,text,text,text)
  to service_role;

revoke all on function public.service_list_booking_preview_launch_blocker_requeue_work(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.service_list_booking_preview_launch_blocker_requeue_work(integer)
  to service_role;

comment on table public.lesson_booking_preview_launch_blocker_requeue_lease_events is
  'Append-only PREVIEW activation-scoped requeue lease evidence. Lease generations are independent of exhausted Phase T attempts and authorize no external notification/provider/payment action.';
comment on function public.service_claim_booking_preview_launch_blocker_requeue_work(bigint,text,integer) is
  'Claims one exact current Phase W activation for 30-300 seconds using PostgreSQL server time. At most three requeue lease generations exist per activation; no notifier send authority is granted.';
comment on function public.service_transition_booking_preview_launch_blocker_requeue_work(bigint,text,text,text) is
  'Closes one exact active requeue lease with idempotent release/retry/dead-letter evidence. Retry timing is server-derived and bounded independently of Phase T history.';
comment on function public.service_list_booking_preview_launch_blocker_requeue_work(integer) is
  'Returns minimized current requeue lease state for the latest preview snapshot without claim keys, provider/customer identifiers, secrets, tokens, or payment material.';
