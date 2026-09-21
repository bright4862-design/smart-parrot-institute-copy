-- Smart Parrot Institute lesson-booking Phase 4C5S
-- Trusted notifier proof-adapter contract + minimized escalation work queue.
-- Preview-only: no external notifier send, Cron sender, provider write, launch authority, or destructive cleanup.

create table if not exists public.lesson_booking_preview_launch_blocker_notifier_proofs (
  proof_id bigint generated always as identity primary key,
  schema_version text not null check (schema_version = 'smart_parrot_booking_preview_launch_blocker_notifier_proof_v1'),
  handoff_id bigint not null unique references public.lesson_booking_preview_launch_blocker_delivery_handoffs(handoff_id) on delete restrict,
  snapshot_id bigint not null references public.lesson_booking_preview_launch_blocker_snapshots(snapshot_id) on delete restrict,
  alert_id bigint not null references public.lesson_booking_preview_launch_blocker_alerts(alert_id) on delete restrict,
  prepared_receipt_id bigint not null references public.lesson_booking_preview_launch_blocker_delivery_receipts(receipt_id) on delete restrict,
  delivered_receipt_id bigint not null unique references public.lesson_booking_preview_launch_blocker_delivery_receipts(receipt_id) on delete restrict,
  delivery_key text not null unique check (delivery_key ~ '^[0-9a-f]{32}$'),
  proof_kind text not null check (proof_kind in ('receipt_id_hash','message_id_hash')),
  proof_hash text not null unique check (proof_hash ~ '^[0-9a-f]{64}$'),
  trusted_notifier_proof_accepted boolean not null default true check (trusted_notifier_proof_accepted = true),
  outcome_suppresses_blocker boolean not null default false check (outcome_suppresses_blocker = false),
  notifier_send_authorized boolean not null default false check (notifier_send_authorized = false),
  provider_write_authorized boolean not null default false check (provider_write_authorized = false),
  booking_launch_authorized boolean not null default false check (booking_launch_authorized = false),
  destructive_cleanup_authorized boolean not null default false check (destructive_cleanup_authorized = false),
  server_time_authoritative boolean not null default true check (server_time_authoritative = true),
  recorded_at timestamptz not null default statement_timestamp()
);

create table if not exists public.lesson_booking_preview_launch_blocker_escalation_queue (
  queue_item_id bigint generated always as identity primary key,
  schema_version text not null check (schema_version = 'smart_parrot_booking_preview_launch_blocker_escalation_queue_v1'),
  handoff_id bigint not null references public.lesson_booking_preview_launch_blocker_delivery_handoffs(handoff_id) on delete restrict,
  snapshot_id bigint not null references public.lesson_booking_preview_launch_blocker_snapshots(snapshot_id) on delete restrict,
  alert_id bigint not null references public.lesson_booking_preview_launch_blocker_alerts(alert_id) on delete restrict,
  observation_id bigint not null unique references public.lesson_booking_preview_launch_blocker_escalation_observations(observation_id) on delete restrict,
  delivery_key text not null check (delivery_key ~ '^[0-9a-f]{32}$'),
  severity text not null check (severity in ('info','warning','critical')),
  age_class text not null check (age_class in ('fresh','aging','overdue')),
  escalation_class text not null check (escalation_class in ('review','urgent')),
  blocker_count integer not null check (blocker_count > 0),
  work_required boolean not null default true check (work_required = true),
  automatic_notification_authorized boolean not null default false check (automatic_notification_authorized = false),
  outcome_suppresses_blocker boolean not null default false check (outcome_suppresses_blocker = false),
  provider_write_authorized boolean not null default false check (provider_write_authorized = false),
  booking_launch_authorized boolean not null default false check (booking_launch_authorized = false),
  destructive_cleanup_authorized boolean not null default false check (destructive_cleanup_authorized = false),
  server_time_authoritative boolean not null default true check (server_time_authoritative = true),
  queued_at timestamptz not null default statement_timestamp(),
  unique (handoff_id, age_class, escalation_class)
);

alter table public.lesson_booking_preview_launch_blocker_notifier_proofs enable row level security;
alter table public.lesson_booking_preview_launch_blocker_escalation_queue enable row level security;

revoke all on table public.lesson_booking_preview_launch_blocker_notifier_proofs
  from public, anon, authenticated, service_role;
revoke all on table public.lesson_booking_preview_launch_blocker_escalation_queue
  from public, anon, authenticated, service_role;

drop trigger if exists lesson_booking_preview_launch_blocker_notifier_proofs_append_only
  on public.lesson_booking_preview_launch_blocker_notifier_proofs;
create trigger lesson_booking_preview_launch_blocker_notifier_proofs_append_only
before update or delete on public.lesson_booking_preview_launch_blocker_notifier_proofs
for each row execute function public.forbid_change();

drop trigger if exists lesson_booking_preview_launch_blocker_escalation_queue_append_only
  on public.lesson_booking_preview_launch_blocker_escalation_queue;
create trigger lesson_booking_preview_launch_blocker_escalation_queue_append_only
before update or delete on public.lesson_booking_preview_launch_blocker_escalation_queue
for each row execute function public.forbid_change();

create or replace function public.service_record_booking_preview_launch_blocker_trusted_delivery_proof(
  p_snapshot_id bigint,
  p_delivery_key text,
  p_proof_kind text,
  p_proof_hash text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot public.lesson_booking_preview_launch_blocker_snapshots%rowtype;
  v_handoff public.lesson_booking_preview_launch_blocker_delivery_handoffs%rowtype;
  v_prepared public.lesson_booking_preview_launch_blocker_delivery_receipts%rowtype;
  v_terminal public.lesson_booking_preview_launch_blocker_delivery_receipts%rowtype;
  v_existing public.lesson_booking_preview_launch_blocker_notifier_proofs%rowtype;
  v_delivery_key text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_delivery_key,''::text)));
  v_proof_kind text := pg_catalog.btrim(coalesce(p_proof_kind,''::text));
  v_proof_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_proof_hash,''::text)));
  v_delivered_receipt_id bigint;
  v_proof_id bigint;
begin
  if p_snapshot_id is null or p_snapshot_id < 1 then
    raise exception 'invalid_preview_launch_blocker_snapshot_id' using errcode='22023';
  end if;
  if v_delivery_key !~ '^[0-9a-f]{32}$' then
    raise exception 'invalid_preview_launch_blocker_delivery_key' using errcode='22023';
  end if;
  if v_proof_kind not in ('receipt_id_hash','message_id_hash') then
    raise exception 'invalid_preview_launch_blocker_notifier_proof_kind' using errcode='22023';
  end if;
  if v_proof_hash !~ '^[0-9a-f]{64}$' or v_proof_hash = repeat('0',64) then
    raise exception 'invalid_preview_launch_blocker_notifier_proof_hash' using errcode='22023';
  end if;

  -- Serialize against Phase P/Q/R snapshot, handoff, receipt, and escalation transitions.
  perform pg_catalog.pg_advisory_xact_lock(20260921,40516);

  select * into v_snapshot
  from public.lesson_booking_preview_launch_blocker_snapshots s
  order by s.snapshot_id desc
  limit 1;
  if not found then
    raise exception 'preview_launch_blocker_snapshot_missing' using errcode='P0002';
  end if;
  if v_snapshot.snapshot_id <> p_snapshot_id then
    raise exception 'stale_preview_launch_blocker_snapshot' using errcode='40001';
  end if;

  select * into v_handoff
  from public.lesson_booking_preview_launch_blocker_delivery_handoffs h
  where h.snapshot_id = p_snapshot_id;
  if not found then
    raise exception 'preview_launch_blocker_delivery_handoff_missing' using errcode='P0002';
  end if;

  select * into v_prepared
  from public.lesson_booking_preview_launch_blocker_delivery_receipts r
  where r.handoff_id = v_handoff.handoff_id and r.outcome = 'prepared';
  if not found then
    raise exception 'preview_launch_blocker_delivery_attempt_not_prepared' using errcode='55000';
  end if;
  if v_prepared.delivery_key <> v_delivery_key then
    raise exception 'preview_launch_blocker_delivery_key_mismatch' using errcode='22023';
  end if;

  select * into v_existing
  from public.lesson_booking_preview_launch_blocker_notifier_proofs p
  where p.handoff_id = v_handoff.handoff_id;
  if found then
    if v_existing.delivery_key <> v_delivery_key
       or v_existing.proof_kind <> v_proof_kind
       or v_existing.proof_hash <> v_proof_hash then
      raise exception 'preview_launch_blocker_notifier_proof_conflict' using errcode='23505';
    end if;
    return pg_catalog.jsonb_build_object(
      'schema_version',v_existing.schema_version,
      'proof_id',v_existing.proof_id,
      'delivered_receipt_id',v_existing.delivered_receipt_id,
      'snapshot_id',v_existing.snapshot_id,
      'alert_id',v_existing.alert_id,
      'delivery_key',v_existing.delivery_key,
      'proof_kind',v_existing.proof_kind,
      'proof_hash',v_existing.proof_hash,
      'recorded_at',v_existing.recorded_at,
      'replay',true,
      'trusted_notifier_proof_accepted',true,
      'outcome_suppresses_blocker',false,
      'notifier_send_authorized',false,
      'provider_write_authorized',false,
      'booking_launch_authorized',false,
      'destructive_cleanup_authorized',false,
      'server_time_authoritative',true
    );
  end if;

  select * into v_terminal
  from public.lesson_booking_preview_launch_blocker_delivery_receipts r
  where r.handoff_id = v_handoff.handoff_id and r.outcome in ('delivered','failed','deferred')
  order by r.receipt_id desc
  limit 1;
  if found then
    raise exception 'preview_launch_blocker_delivery_terminal_outcome_conflict' using errcode='23505';
  end if;

  insert into public.lesson_booking_preview_launch_blocker_delivery_receipts(
    schema_version,handoff_id,snapshot_id,alert_id,delivery_key,outcome,
    blocker_codes,severity,handoff_prepared_at
  ) values (
    'smart_parrot_booking_preview_launch_blocker_delivery_receipt_v1',
    v_handoff.handoff_id,v_handoff.snapshot_id,v_handoff.alert_id,v_delivery_key,'delivered',
    v_handoff.blocker_codes,v_handoff.severity,v_handoff.prepared_at
  ) returning receipt_id into v_delivered_receipt_id;

  insert into public.lesson_booking_preview_launch_blocker_notifier_proofs(
    schema_version,handoff_id,snapshot_id,alert_id,prepared_receipt_id,delivered_receipt_id,
    delivery_key,proof_kind,proof_hash
  ) values (
    'smart_parrot_booking_preview_launch_blocker_notifier_proof_v1',
    v_handoff.handoff_id,v_handoff.snapshot_id,v_handoff.alert_id,v_prepared.receipt_id,v_delivered_receipt_id,
    v_delivery_key,v_proof_kind,v_proof_hash
  ) returning proof_id into v_proof_id;

  select * into v_existing
  from public.lesson_booking_preview_launch_blocker_notifier_proofs p
  where p.proof_id = v_proof_id;

  return pg_catalog.jsonb_build_object(
    'schema_version',v_existing.schema_version,
    'proof_id',v_existing.proof_id,
    'delivered_receipt_id',v_existing.delivered_receipt_id,
    'snapshot_id',v_existing.snapshot_id,
    'alert_id',v_existing.alert_id,
    'delivery_key',v_existing.delivery_key,
    'proof_kind',v_existing.proof_kind,
    'proof_hash',v_existing.proof_hash,
    'recorded_at',v_existing.recorded_at,
    'replay',false,
    'trusted_notifier_proof_accepted',true,
    'outcome_suppresses_blocker',false,
    'notifier_send_authorized',false,
    'provider_write_authorized',false,
    'booking_launch_authorized',false,
    'destructive_cleanup_authorized',false,
    'server_time_authoritative',true
  );
end;
$$;

create or replace function public.service_prepare_booking_preview_launch_blocker_escalation_queue(
  p_snapshot_id bigint
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot public.lesson_booking_preview_launch_blocker_snapshots%rowtype;
  v_handoff public.lesson_booking_preview_launch_blocker_delivery_handoffs%rowtype;
  v_observation jsonb;
  v_existing public.lesson_booking_preview_launch_blocker_escalation_queue%rowtype;
  v_delivery_key text;
  v_observation_id bigint;
  v_severity text;
  v_age_class text;
  v_escalation_class text;
  v_blocker_count integer;
  v_queue_item_id bigint;
begin
  if p_snapshot_id is null or p_snapshot_id < 1 then
    raise exception 'invalid_preview_launch_blocker_snapshot_id' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(20260921,40516);

  select * into v_snapshot
  from public.lesson_booking_preview_launch_blocker_snapshots s
  order by s.snapshot_id desc
  limit 1;
  if not found then
    raise exception 'preview_launch_blocker_snapshot_missing' using errcode='P0002';
  end if;
  if v_snapshot.snapshot_id <> p_snapshot_id then
    raise exception 'stale_preview_launch_blocker_snapshot' using errcode='40001';
  end if;
  if v_snapshot.status <> 'blocked' or cardinality(v_snapshot.blocker_codes) = 0 then
    raise exception 'preview_launch_blocker_not_unresolved' using errcode='55000';
  end if;

  select * into v_handoff
  from public.lesson_booking_preview_launch_blocker_delivery_handoffs h
  where h.snapshot_id = p_snapshot_id;
  if not found then
    raise exception 'preview_launch_blocker_delivery_handoff_missing' using errcode='P0002';
  end if;

  v_observation := public.service_observe_booking_preview_launch_blocker_escalation(p_snapshot_id);
  v_observation_id := (v_observation->>'observation_id')::bigint;
  v_severity := v_observation->>'severity';
  v_age_class := v_observation->>'age_class';
  v_escalation_class := v_observation->>'escalation_class';
  v_blocker_count := cardinality(v_snapshot.blocker_codes);
  v_delivery_key := pg_catalog.md5(pg_catalog.concat_ws('|',
    'smart_parrot_booking_preview_launch_blocker_delivery_v1',
    v_handoff.handoff_id::text,
    v_handoff.snapshot_id::text,
    v_handoff.alert_id::text
  ));

  if v_escalation_class = 'none' then
    return pg_catalog.jsonb_build_object(
      'schema_version','smart_parrot_booking_preview_launch_blocker_escalation_queue_v1',
      'queue_item_id',null,
      'snapshot_id',v_snapshot.snapshot_id,
      'alert_id',v_handoff.alert_id,
      'delivery_key',v_delivery_key,
      'severity',v_severity,
      'age_class',v_age_class,
      'escalation_class',v_escalation_class,
      'blocker_count',v_blocker_count,
      'queued_at',null,
      'replay',false,
      'queue_required',false,
      'automatic_notification_authorized',false,
      'outcome_suppresses_blocker',false,
      'provider_write_authorized',false,
      'booking_launch_authorized',false,
      'destructive_cleanup_authorized',false,
      'server_time_authoritative',true
    );
  end if;

  select * into v_existing
  from public.lesson_booking_preview_launch_blocker_escalation_queue q
  where q.observation_id = v_observation_id;
  if found then
    return pg_catalog.jsonb_build_object(
      'schema_version',v_existing.schema_version,
      'queue_item_id',v_existing.queue_item_id,
      'snapshot_id',v_existing.snapshot_id,
      'alert_id',v_existing.alert_id,
      'delivery_key',v_existing.delivery_key,
      'severity',v_existing.severity,
      'age_class',v_existing.age_class,
      'escalation_class',v_existing.escalation_class,
      'blocker_count',v_existing.blocker_count,
      'queued_at',v_existing.queued_at,
      'replay',true,
      'queue_required',true,
      'automatic_notification_authorized',false,
      'outcome_suppresses_blocker',false,
      'provider_write_authorized',false,
      'booking_launch_authorized',false,
      'destructive_cleanup_authorized',false,
      'server_time_authoritative',true
    );
  end if;

  insert into public.lesson_booking_preview_launch_blocker_escalation_queue(
    schema_version,handoff_id,snapshot_id,alert_id,observation_id,delivery_key,
    severity,age_class,escalation_class,blocker_count
  ) values (
    'smart_parrot_booking_preview_launch_blocker_escalation_queue_v1',
    v_handoff.handoff_id,v_handoff.snapshot_id,v_handoff.alert_id,v_observation_id,v_delivery_key,
    v_severity,v_age_class,v_escalation_class,v_blocker_count
  ) returning queue_item_id into v_queue_item_id;

  select * into v_existing
  from public.lesson_booking_preview_launch_blocker_escalation_queue q
  where q.queue_item_id = v_queue_item_id;

  return pg_catalog.jsonb_build_object(
    'schema_version',v_existing.schema_version,
    'queue_item_id',v_existing.queue_item_id,
    'snapshot_id',v_existing.snapshot_id,
    'alert_id',v_existing.alert_id,
    'delivery_key',v_existing.delivery_key,
    'severity',v_existing.severity,
    'age_class',v_existing.age_class,
    'escalation_class',v_existing.escalation_class,
    'blocker_count',v_existing.blocker_count,
    'queued_at',v_existing.queued_at,
    'replay',false,
    'queue_required',true,
    'automatic_notification_authorized',false,
    'outcome_suppresses_blocker',false,
    'provider_write_authorized',false,
    'booking_launch_authorized',false,
    'destructive_cleanup_authorized',false,
    'server_time_authoritative',true
  );
end;
$$;

revoke all on function public.service_record_booking_preview_launch_blocker_trusted_delivery_proof(bigint,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.service_record_booking_preview_launch_blocker_trusted_delivery_proof(bigint,text,text,text)
  to service_role;

revoke all on function public.service_prepare_booking_preview_launch_blocker_escalation_queue(bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.service_prepare_booking_preview_launch_blocker_escalation_queue(bigint)
  to service_role;

comment on table public.lesson_booking_preview_launch_blocker_notifier_proofs is
  'Service-only append-only preview proof adapter evidence. Stores only a SHA-256 hash of a trusted notifier receipt/message id, never the raw provider receipt or message id.';
comment on table public.lesson_booking_preview_launch_blocker_escalation_queue is
  'Service-only append-only minimized preview escalation work queue. Stores only operational correlation, severity/age/escalation classes, and blocker count; it never authorizes notification sending, launch, provider writes, or cleanup.';
comment on function public.service_record_booking_preview_launch_blocker_trusted_delivery_proof(bigint,text,text,text) is
  'Accepts only a pre-hashed trusted notifier receipt/message identifier and binds it to the exact current prepared delivery key before recording delivered. No notifier send or other authority is granted.';
comment on function public.service_prepare_booking_preview_launch_blocker_escalation_queue(bigint) is
  'Prepares minimized service-only escalation work for the exact current unresolved blocker using Phase R server-time observation. No external send is performed.';
