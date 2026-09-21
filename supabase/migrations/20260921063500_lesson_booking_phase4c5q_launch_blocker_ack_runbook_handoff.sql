-- Smart Parrot Institute lesson-booking Phase 4C5Q
-- Append-only launch-blocker acknowledgement/runbook evidence + minimized alert-delivery handoff.
-- This slice is preview-only. It cannot suppress an authoritative blocker, authorize launch/provider writes,
-- perform destructive cleanup, deliver notifications, call providers, or accept browser/caller time.

create table if not exists public.lesson_booking_preview_launch_blocker_acknowledgements (
  acknowledgement_id bigint generated always as identity primary key,
  schema_version text not null check (schema_version = 'smart_parrot_booking_preview_launch_blocker_ack_v1'),
  snapshot_id bigint not null unique references public.lesson_booking_preview_launch_blocker_snapshots(snapshot_id) on delete restrict,
  alert_id bigint not null unique references public.lesson_booking_preview_launch_blocker_alerts(alert_id) on delete restrict,
  decision text not null check (decision in ('investigate','provider_configuration_required','rehearsal_required','hold_launch')),
  blocker_codes text[] not null,
  severity text not null check (severity in ('info','warning','critical')),
  snapshot_captured_at timestamptz not null,
  alert_recorded_at timestamptz not null,
  acknowledgement_suppresses_blocker boolean not null default false check (acknowledgement_suppresses_blocker = false),
  provider_write_authorized boolean not null default false check (provider_write_authorized = false),
  booking_launch_authorized boolean not null default false check (booking_launch_authorized = false),
  destructive_cleanup_authorized boolean not null default false check (destructive_cleanup_authorized = false),
  server_time_authoritative boolean not null default true check (server_time_authoritative = true),
  acknowledged_at timestamptz not null default statement_timestamp()
);

create table if not exists public.lesson_booking_preview_launch_blocker_delivery_handoffs (
  handoff_id bigint generated always as identity primary key,
  schema_version text not null check (schema_version = 'smart_parrot_booking_preview_launch_blocker_handoff_v1'),
  snapshot_id bigint not null unique references public.lesson_booking_preview_launch_blocker_snapshots(snapshot_id) on delete restrict,
  alert_id bigint not null unique references public.lesson_booking_preview_launch_blocker_alerts(alert_id) on delete restrict,
  blocker_codes text[] not null,
  severity text not null check (severity in ('info','warning','critical')),
  snapshot_captured_at timestamptz not null,
  alert_recorded_at timestamptz not null,
  notifier_delivery_authorized boolean not null default false check (notifier_delivery_authorized = false),
  provider_write_authorized boolean not null default false check (provider_write_authorized = false),
  booking_launch_authorized boolean not null default false check (booking_launch_authorized = false),
  destructive_cleanup_authorized boolean not null default false check (destructive_cleanup_authorized = false),
  prepared_at timestamptz not null default statement_timestamp()
);

alter table public.lesson_booking_preview_launch_blocker_acknowledgements enable row level security;
alter table public.lesson_booking_preview_launch_blocker_delivery_handoffs enable row level security;

revoke all on table public.lesson_booking_preview_launch_blocker_acknowledgements
  from public, anon, authenticated, service_role;
revoke all on table public.lesson_booking_preview_launch_blocker_delivery_handoffs
  from public, anon, authenticated, service_role;

drop trigger if exists lesson_booking_preview_launch_blocker_acknowledgements_append_only
  on public.lesson_booking_preview_launch_blocker_acknowledgements;
create trigger lesson_booking_preview_launch_blocker_acknowledgements_append_only
before update or delete on public.lesson_booking_preview_launch_blocker_acknowledgements
for each row execute function public.forbid_change();

drop trigger if exists lesson_booking_preview_launch_blocker_delivery_handoffs_append_only
  on public.lesson_booking_preview_launch_blocker_delivery_handoffs;
create trigger lesson_booking_preview_launch_blocker_delivery_handoffs_append_only
before update or delete on public.lesson_booking_preview_launch_blocker_delivery_handoffs
for each row execute function public.forbid_change();

create or replace function public.service_record_booking_preview_launch_blocker_acknowledgement(
  p_snapshot_id bigint,
  p_decision text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot public.lesson_booking_preview_launch_blocker_snapshots%rowtype;
  v_alert public.lesson_booking_preview_launch_blocker_alerts%rowtype;
  v_existing public.lesson_booking_preview_launch_blocker_acknowledgements%rowtype;
  v_severity text;
  v_acknowledgement_id bigint;
  v_decision text := pg_catalog.btrim(pg_catalog.coalesce(p_decision,''));
begin
  if p_snapshot_id is null or p_snapshot_id < 1 then
    raise exception 'invalid_preview_launch_blocker_snapshot_id' using errcode='22023';
  end if;
  if v_decision not in ('investigate','provider_configuration_required','rehearsal_required','hold_launch') then
    raise exception 'invalid_preview_launch_blocker_runbook_decision' using errcode='22023';
  end if;

  -- Serialize against Phase P snapshot creation as well as concurrent Phase Q callers.
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

  select * into v_alert
  from public.lesson_booking_preview_launch_blocker_alerts a
  where a.snapshot_id = p_snapshot_id;
  if not found then
    raise exception 'preview_launch_blocker_alert_missing' using errcode='P0002';
  end if;

  v_severity := case
    when v_snapshot.status = 'ready' then 'info'
    when v_snapshot.blocker_codes && array[
      'schema_or_function_not_ready',
      'unresolved_provider_cleanup',
      'unresolved_terminal_reconciliation',
      'terminal_evidence_missing'
    ]::text[] then 'critical'
    else 'warning'
  end;

  if v_decision = 'provider_configuration_required'
     and not (v_snapshot.blocker_codes && array[
       'provider_secret_bundle_missing',
       'preview_project_identity_not_ready',
       'stripe_account_identity_not_ready',
       'daily_webhook_identity_not_ready',
       'stripe_checkout_signed_proof_stale_or_missing',
       'stripe_dispute_signed_proof_stale_or_missing',
       'daily_signed_endpoint_proof_missing'
     ]::text[]) then
    raise exception 'provider_configuration_decision_not_supported_by_blockers' using errcode='22023';
  end if;

  if v_decision = 'rehearsal_required'
     and not (v_snapshot.blocker_codes && array[
       'provider_rehearsal_stale_or_missing',
       'fixture_principals_unavailable',
       'ephemeral_sessions_unavailable',
       'provider_e2e_gate_closed',
       'worker_write_gate_closed'
     ]::text[]) then
    raise exception 'rehearsal_decision_not_supported_by_blockers' using errcode='22023';
  end if;

  select * into v_existing
  from public.lesson_booking_preview_launch_blocker_acknowledgements a
  where a.snapshot_id = p_snapshot_id;
  if found then
    if v_existing.alert_id <> v_alert.alert_id or v_existing.decision <> v_decision then
      raise exception 'preview_launch_blocker_acknowledgement_conflict' using errcode='23505';
    end if;
    return pg_catalog.jsonb_build_object(
      'schema_version',v_existing.schema_version,
      'acknowledgement_id',v_existing.acknowledgement_id,
      'snapshot_id',v_existing.snapshot_id,
      'alert_id',v_existing.alert_id,
      'decision',v_existing.decision,
      'blocker_codes',pg_catalog.to_jsonb(v_existing.blocker_codes),
      'severity',v_existing.severity,
      'snapshot_captured_at',v_existing.snapshot_captured_at,
      'alert_recorded_at',v_existing.alert_recorded_at,
      'acknowledged_at',v_existing.acknowledged_at,
      'replay',true,
      'acknowledgement_suppresses_blocker',false,
      'provider_write_authorized',false,
      'booking_launch_authorized',false,
      'destructive_cleanup_authorized',false,
      'server_time_authoritative',true
    );
  end if;

  insert into public.lesson_booking_preview_launch_blocker_acknowledgements(
    schema_version,snapshot_id,alert_id,decision,blocker_codes,severity,
    snapshot_captured_at,alert_recorded_at
  ) values (
    'smart_parrot_booking_preview_launch_blocker_ack_v1',
    v_snapshot.snapshot_id,v_alert.alert_id,v_decision,v_snapshot.blocker_codes,v_severity,
    v_snapshot.captured_at,v_alert.recorded_at
  ) returning acknowledgement_id into v_acknowledgement_id;

  select * into v_existing
  from public.lesson_booking_preview_launch_blocker_acknowledgements a
  where a.acknowledgement_id = v_acknowledgement_id;

  return pg_catalog.jsonb_build_object(
    'schema_version',v_existing.schema_version,
    'acknowledgement_id',v_existing.acknowledgement_id,
    'snapshot_id',v_existing.snapshot_id,
    'alert_id',v_existing.alert_id,
    'decision',v_existing.decision,
    'blocker_codes',pg_catalog.to_jsonb(v_existing.blocker_codes),
    'severity',v_existing.severity,
    'snapshot_captured_at',v_existing.snapshot_captured_at,
    'alert_recorded_at',v_existing.alert_recorded_at,
    'acknowledged_at',v_existing.acknowledged_at,
    'replay',false,
    'acknowledgement_suppresses_blocker',false,
    'provider_write_authorized',false,
    'booking_launch_authorized',false,
    'destructive_cleanup_authorized',false,
    'server_time_authoritative',true
  );
end;
$$;

create or replace function public.service_prepare_booking_preview_launch_blocker_alert_handoff(
  p_snapshot_id bigint
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot public.lesson_booking_preview_launch_blocker_snapshots%rowtype;
  v_alert public.lesson_booking_preview_launch_blocker_alerts%rowtype;
  v_existing public.lesson_booking_preview_launch_blocker_delivery_handoffs%rowtype;
  v_severity text;
begin
  if p_snapshot_id is null or p_snapshot_id < 1 then
    raise exception 'invalid_preview_launch_blocker_snapshot_id' using errcode='22023';
  end if;

  -- Use the same lock as Phase P so a handoff can never race a superseding snapshot transition.
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

  select * into v_alert
  from public.lesson_booking_preview_launch_blocker_alerts a
  where a.snapshot_id = p_snapshot_id;
  if not found then
    raise exception 'preview_launch_blocker_alert_missing' using errcode='P0002';
  end if;

  v_severity := case
    when v_snapshot.status = 'ready' then 'info'
    when v_snapshot.blocker_codes && array[
      'schema_or_function_not_ready',
      'unresolved_provider_cleanup',
      'unresolved_terminal_reconciliation',
      'terminal_evidence_missing'
    ]::text[] then 'critical'
    else 'warning'
  end;

  select * into v_existing
  from public.lesson_booking_preview_launch_blocker_delivery_handoffs h
  where h.snapshot_id = p_snapshot_id;
  if not found then
    insert into public.lesson_booking_preview_launch_blocker_delivery_handoffs(
      schema_version,snapshot_id,alert_id,blocker_codes,severity,
      snapshot_captured_at,alert_recorded_at
    ) values (
      'smart_parrot_booking_preview_launch_blocker_handoff_v1',
      v_snapshot.snapshot_id,v_alert.alert_id,v_snapshot.blocker_codes,v_severity,
      v_snapshot.captured_at,v_alert.recorded_at
    ) returning * into v_existing;
  end if;

  -- Intentionally minimized notifier handoff. No authority flags, actor identity, provider/customer
  -- identifiers, payloads, secrets, tokens, free text, or caller-supplied timestamps leave this RPC.
  return pg_catalog.jsonb_build_object(
    'snapshot_id',v_existing.snapshot_id,
    'alert_id',v_existing.alert_id,
    'blocker_codes',pg_catalog.to_jsonb(v_existing.blocker_codes),
    'severity',v_existing.severity,
    'snapshot_captured_at',v_existing.snapshot_captured_at,
    'alert_recorded_at',v_existing.alert_recorded_at,
    'prepared_at',v_existing.prepared_at
  );
end;
$$;

revoke all on function public.service_record_booking_preview_launch_blocker_acknowledgement(bigint,text)
  from public, anon, authenticated, service_role;
grant execute on function public.service_record_booking_preview_launch_blocker_acknowledgement(bigint,text)
  to service_role;

revoke all on function public.service_prepare_booking_preview_launch_blocker_alert_handoff(bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.service_prepare_booking_preview_launch_blocker_alert_handoff(bigint)
  to service_role;

comment on table public.lesson_booking_preview_launch_blocker_acknowledgements is
  'Service-only append-only preview acknowledgement/runbook evidence. Acknowledgement never suppresses the authoritative blocker or authorizes launch/provider writes/cleanup.';
comment on table public.lesson_booking_preview_launch_blocker_delivery_handoffs is
  'Service-only append-only minimized handoff prepared for a future trusted notifier. The handoff itself never authorizes notification delivery, launch, provider writes, or cleanup.';
comment on function public.service_record_booking_preview_launch_blocker_acknowledgement(bigint,text) is
  'Service-role-only acknowledgement/runbook recorder for the exact latest launch-blocker snapshot. Uses PostgreSQL time and cannot change authoritative blocker state or authorize launch/provider writes/cleanup.';
comment on function public.service_prepare_booking_preview_launch_blocker_alert_handoff(bigint) is
  'Service-role-only minimized alert handoff for the exact latest launch-blocker snapshot. Returns only snapshot/alert ids, canonical blocker codes, severity, and server timestamps.';
