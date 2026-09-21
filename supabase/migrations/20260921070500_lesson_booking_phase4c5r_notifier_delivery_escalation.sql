-- Smart Parrot Institute lesson-booking Phase 4C5R
-- Trusted-notifier delivery attempt/receipt evidence + server-time escalation observations.
-- Preview-only groundwork: no external notifier call, no automatic sender, no launch/provider/cleanup authority.

create table if not exists public.lesson_booking_preview_launch_blocker_delivery_receipts (
  receipt_id bigint generated always as identity primary key,
  schema_version text not null check (schema_version = 'smart_parrot_booking_preview_launch_blocker_delivery_receipt_v1'),
  handoff_id bigint not null references public.lesson_booking_preview_launch_blocker_delivery_handoffs(handoff_id) on delete restrict,
  snapshot_id bigint not null references public.lesson_booking_preview_launch_blocker_snapshots(snapshot_id) on delete restrict,
  alert_id bigint not null references public.lesson_booking_preview_launch_blocker_alerts(alert_id) on delete restrict,
  delivery_key text not null check (delivery_key ~ '^[0-9a-f]{32}$'),
  outcome text not null check (outcome in ('prepared','delivered','failed','deferred')),
  blocker_codes text[] not null,
  severity text not null check (severity in ('info','warning','critical')),
  handoff_prepared_at timestamptz not null,
  outcome_suppresses_blocker boolean not null default false check (outcome_suppresses_blocker = false),
  notifier_send_authorized boolean not null default false check (notifier_send_authorized = false),
  provider_write_authorized boolean not null default false check (provider_write_authorized = false),
  booking_launch_authorized boolean not null default false check (booking_launch_authorized = false),
  destructive_cleanup_authorized boolean not null default false check (destructive_cleanup_authorized = false),
  server_time_authoritative boolean not null default true check (server_time_authoritative = true),
  recorded_at timestamptz not null default statement_timestamp(),
  unique (handoff_id, outcome),
  unique (delivery_key, outcome)
);

create table if not exists public.lesson_booking_preview_launch_blocker_escalation_observations (
  observation_id bigint generated always as identity primary key,
  schema_version text not null check (schema_version = 'smart_parrot_booking_preview_launch_blocker_escalation_v1'),
  handoff_id bigint not null references public.lesson_booking_preview_launch_blocker_delivery_handoffs(handoff_id) on delete restrict,
  snapshot_id bigint not null references public.lesson_booking_preview_launch_blocker_snapshots(snapshot_id) on delete restrict,
  alert_id bigint not null references public.lesson_booking_preview_launch_blocker_alerts(alert_id) on delete restrict,
  blocker_codes text[] not null,
  severity text not null check (severity in ('info','warning','critical')),
  age_class text not null check (age_class in ('fresh','aging','overdue')),
  escalation_class text not null check (escalation_class in ('none','review','urgent')),
  blocker_unresolved boolean not null default true check (blocker_unresolved = true),
  automatic_notification_authorized boolean not null default false check (automatic_notification_authorized = false),
  outcome_suppresses_blocker boolean not null default false check (outcome_suppresses_blocker = false),
  provider_write_authorized boolean not null default false check (provider_write_authorized = false),
  booking_launch_authorized boolean not null default false check (booking_launch_authorized = false),
  destructive_cleanup_authorized boolean not null default false check (destructive_cleanup_authorized = false),
  server_time_authoritative boolean not null default true check (server_time_authoritative = true),
  observed_at timestamptz not null default statement_timestamp(),
  unique (handoff_id, age_class)
);

alter table public.lesson_booking_preview_launch_blocker_delivery_receipts enable row level security;
alter table public.lesson_booking_preview_launch_blocker_escalation_observations enable row level security;

revoke all on table public.lesson_booking_preview_launch_blocker_delivery_receipts
  from public, anon, authenticated, service_role;
revoke all on table public.lesson_booking_preview_launch_blocker_escalation_observations
  from public, anon, authenticated, service_role;

drop trigger if exists lesson_booking_preview_launch_blocker_delivery_receipts_append_only
  on public.lesson_booking_preview_launch_blocker_delivery_receipts;
create trigger lesson_booking_preview_launch_blocker_delivery_receipts_append_only
before update or delete on public.lesson_booking_preview_launch_blocker_delivery_receipts
for each row execute function public.forbid_change();

drop trigger if exists lesson_booking_preview_launch_blocker_escalation_observations_append_only
  on public.lesson_booking_preview_launch_blocker_escalation_observations;
create trigger lesson_booking_preview_launch_blocker_escalation_observations_append_only
before update or delete on public.lesson_booking_preview_launch_blocker_escalation_observations
for each row execute function public.forbid_change();

create or replace function public.service_record_booking_preview_launch_blocker_delivery_receipt(
  p_snapshot_id bigint,
  p_outcome text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot public.lesson_booking_preview_launch_blocker_snapshots%rowtype;
  v_handoff public.lesson_booking_preview_launch_blocker_delivery_handoffs%rowtype;
  v_existing public.lesson_booking_preview_launch_blocker_delivery_receipts%rowtype;
  v_terminal public.lesson_booking_preview_launch_blocker_delivery_receipts%rowtype;
  v_prepared public.lesson_booking_preview_launch_blocker_delivery_receipts%rowtype;
  v_outcome text := pg_catalog.btrim(coalesce(p_outcome,''::text));
  v_delivery_key text;
  v_receipt_id bigint;
begin
  if p_snapshot_id is null or p_snapshot_id < 1 then
    raise exception 'invalid_preview_launch_blocker_snapshot_id' using errcode='22023';
  end if;
  if v_outcome not in ('prepared','delivered','failed','deferred') then
    raise exception 'invalid_preview_launch_blocker_delivery_outcome' using errcode='22023';
  end if;

  -- Phase R does not have a configured trusted notifier. Never allow a caller to forge successful delivery.
  if v_outcome = 'delivered' then
    raise exception 'trusted_notifier_delivery_proof_required' using errcode='22023';
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

  select * into v_handoff
  from public.lesson_booking_preview_launch_blocker_delivery_handoffs h
  where h.snapshot_id = p_snapshot_id;
  if not found then
    raise exception 'preview_launch_blocker_delivery_handoff_missing' using errcode='P0002';
  end if;

  v_delivery_key := pg_catalog.md5(pg_catalog.concat_ws('|',
    'smart_parrot_booking_preview_launch_blocker_delivery_v1',
    v_handoff.handoff_id::text,
    v_handoff.snapshot_id::text,
    v_handoff.alert_id::text
  ));

  select * into v_existing
  from public.lesson_booking_preview_launch_blocker_delivery_receipts r
  where r.handoff_id = v_handoff.handoff_id and r.outcome = v_outcome;
  if found then
    return pg_catalog.jsonb_build_object(
      'schema_version',v_existing.schema_version,
      'receipt_id',v_existing.receipt_id,
      'snapshot_id',v_existing.snapshot_id,
      'alert_id',v_existing.alert_id,
      'delivery_key',v_existing.delivery_key,
      'outcome',v_existing.outcome,
      'blocker_codes',pg_catalog.to_jsonb(v_existing.blocker_codes),
      'severity',v_existing.severity,
      'handoff_prepared_at',v_existing.handoff_prepared_at,
      'recorded_at',v_existing.recorded_at,
      'replay',true,
      'outcome_suppresses_blocker',false,
      'notifier_send_authorized',false,
      'provider_write_authorized',false,
      'booking_launch_authorized',false,
      'destructive_cleanup_authorized',false,
      'server_time_authoritative',true
    );
  end if;

  if v_outcome <> 'prepared' then
    select * into v_prepared
    from public.lesson_booking_preview_launch_blocker_delivery_receipts r
    where r.handoff_id = v_handoff.handoff_id and r.outcome = 'prepared';
    if not found then
      raise exception 'preview_launch_blocker_delivery_attempt_not_prepared' using errcode='55000';
    end if;

    select * into v_terminal
    from public.lesson_booking_preview_launch_blocker_delivery_receipts r
    where r.handoff_id = v_handoff.handoff_id and r.outcome in ('delivered','failed','deferred')
    order by r.receipt_id desc
    limit 1;
    if found then
      raise exception 'preview_launch_blocker_delivery_terminal_outcome_conflict' using errcode='23505';
    end if;
  end if;

  insert into public.lesson_booking_preview_launch_blocker_delivery_receipts(
    schema_version,handoff_id,snapshot_id,alert_id,delivery_key,outcome,
    blocker_codes,severity,handoff_prepared_at
  ) values (
    'smart_parrot_booking_preview_launch_blocker_delivery_receipt_v1',
    v_handoff.handoff_id,v_handoff.snapshot_id,v_handoff.alert_id,v_delivery_key,v_outcome,
    v_handoff.blocker_codes,v_handoff.severity,v_handoff.prepared_at
  ) returning receipt_id into v_receipt_id;

  select * into v_existing
  from public.lesson_booking_preview_launch_blocker_delivery_receipts r
  where r.receipt_id = v_receipt_id;

  return pg_catalog.jsonb_build_object(
    'schema_version',v_existing.schema_version,
    'receipt_id',v_existing.receipt_id,
    'snapshot_id',v_existing.snapshot_id,
    'alert_id',v_existing.alert_id,
    'delivery_key',v_existing.delivery_key,
    'outcome',v_existing.outcome,
    'blocker_codes',pg_catalog.to_jsonb(v_existing.blocker_codes),
    'severity',v_existing.severity,
    'handoff_prepared_at',v_existing.handoff_prepared_at,
    'recorded_at',v_existing.recorded_at,
    'replay',false,
    'outcome_suppresses_blocker',false,
    'notifier_send_authorized',false,
    'provider_write_authorized',false,
    'booking_launch_authorized',false,
    'destructive_cleanup_authorized',false,
    'server_time_authoritative',true
  );
end;
$$;

create or replace function public.service_observe_booking_preview_launch_blocker_escalation(
  p_snapshot_id bigint
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_snapshot public.lesson_booking_preview_launch_blocker_snapshots%rowtype;
  v_handoff public.lesson_booking_preview_launch_blocker_delivery_handoffs%rowtype;
  v_existing public.lesson_booking_preview_launch_blocker_escalation_observations%rowtype;
  v_age_class text;
  v_escalation_class text;
  v_observation_id bigint;
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

  v_age_class := case
    when v_handoff.alert_recorded_at > v_now + interval '5 minutes' then 'fresh'
    when v_now - v_handoff.alert_recorded_at < interval '15 minutes' then 'fresh'
    when v_now - v_handoff.alert_recorded_at < interval '60 minutes' then 'aging'
    else 'overdue'
  end;

  v_escalation_class := case
    when v_handoff.severity = 'critical' and v_age_class = 'fresh' then 'review'
    when v_handoff.severity = 'critical' then 'urgent'
    when v_handoff.severity = 'warning' and v_age_class = 'fresh' then 'none'
    when v_handoff.severity = 'warning' and v_age_class = 'aging' then 'review'
    when v_handoff.severity = 'warning' then 'urgent'
    else 'none'
  end;

  select * into v_existing
  from public.lesson_booking_preview_launch_blocker_escalation_observations o
  where o.handoff_id = v_handoff.handoff_id and o.age_class = v_age_class;
  if found then
    return pg_catalog.jsonb_build_object(
      'schema_version',v_existing.schema_version,
      'observation_id',v_existing.observation_id,
      'snapshot_id',v_existing.snapshot_id,
      'alert_id',v_existing.alert_id,
      'blocker_codes',pg_catalog.to_jsonb(v_existing.blocker_codes),
      'severity',v_existing.severity,
      'age_class',v_existing.age_class,
      'escalation_class',v_existing.escalation_class,
      'observed_at',v_existing.observed_at,
      'replay',true,
      'blocker_unresolved',true,
      'automatic_notification_authorized',false,
      'outcome_suppresses_blocker',false,
      'provider_write_authorized',false,
      'booking_launch_authorized',false,
      'destructive_cleanup_authorized',false,
      'server_time_authoritative',true
    );
  end if;

  insert into public.lesson_booking_preview_launch_blocker_escalation_observations(
    schema_version,handoff_id,snapshot_id,alert_id,blocker_codes,severity,age_class,escalation_class
  ) values (
    'smart_parrot_booking_preview_launch_blocker_escalation_v1',
    v_handoff.handoff_id,v_handoff.snapshot_id,v_handoff.alert_id,v_handoff.blocker_codes,
    v_handoff.severity,v_age_class,v_escalation_class
  ) returning observation_id into v_observation_id;

  select * into v_existing
  from public.lesson_booking_preview_launch_blocker_escalation_observations o
  where o.observation_id = v_observation_id;

  return pg_catalog.jsonb_build_object(
    'schema_version',v_existing.schema_version,
    'observation_id',v_existing.observation_id,
    'snapshot_id',v_existing.snapshot_id,
    'alert_id',v_existing.alert_id,
    'blocker_codes',pg_catalog.to_jsonb(v_existing.blocker_codes),
    'severity',v_existing.severity,
    'age_class',v_existing.age_class,
    'escalation_class',v_existing.escalation_class,
    'observed_at',v_existing.observed_at,
    'replay',false,
    'blocker_unresolved',true,
    'automatic_notification_authorized',false,
    'outcome_suppresses_blocker',false,
    'provider_write_authorized',false,
    'booking_launch_authorized',false,
    'destructive_cleanup_authorized',false,
    'server_time_authoritative',true
  );
end;
$$;

revoke all on function public.service_record_booking_preview_launch_blocker_delivery_receipt(bigint,text)
  from public, anon, authenticated, service_role;
grant execute on function public.service_record_booking_preview_launch_blocker_delivery_receipt(bigint,text)
  to service_role;

revoke all on function public.service_observe_booking_preview_launch_blocker_escalation(bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.service_observe_booking_preview_launch_blocker_escalation(bigint)
  to service_role;

comment on table public.lesson_booking_preview_launch_blocker_delivery_receipts is
  'Service-only append-only preview notifier attempt/receipt evidence. Phase R cannot claim delivered without future trusted-notifier proof and never authorizes sending, launch, provider writes, or cleanup.';
comment on table public.lesson_booking_preview_launch_blocker_escalation_observations is
  'Service-only append-only server-time escalation observations for the exact current unresolved preview launch blocker. No automatic sender authority is granted.';
comment on function public.service_record_booking_preview_launch_blocker_delivery_receipt(bigint,text) is
  'Service-role-only receipt recorder tied to the exact current Phase Q handoff. Delivered is rejected until a trusted notifier proof contract exists.';
comment on function public.service_observe_booking_preview_launch_blocker_escalation(bigint) is
  'Service-role-only unresolved-blocker escalation observer. Age derives only from PostgreSQL server time; it cannot schedule or authorize notifications.';
