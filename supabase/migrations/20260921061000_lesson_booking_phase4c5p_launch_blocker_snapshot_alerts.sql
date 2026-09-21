-- Smart Parrot Institute lesson-booking Phase 4C5P
-- Immutable preview launch-blocker snapshots + append-only blocker-transition evidence.
-- Runtime facts enter only as minimized booleans from a trusted service process. PostgreSQL owns
-- freshness/time decisions. This migration never authorizes provider writes, launch, cleanup, or Cron.

create table if not exists public.lesson_booking_preview_launch_blocker_snapshots (
  snapshot_id bigint generated always as identity primary key,
  schema_version text not null check (schema_version = 'smart_parrot_booking_preview_launch_blocker_snapshot_v1'),
  state_fingerprint text not null check (state_fingerprint ~ '^[0-9a-f]{32}$'),
  status text not null check (status in ('blocked','ready')),
  schema_function_ready boolean not null,
  provider_secret_bundle_ready boolean not null,
  preview_project_identity_ready boolean not null,
  stripe_account_identity_ready boolean not null,
  daily_webhook_identity_ready boolean not null,
  stripe_checkout_signed_recent boolean not null,
  stripe_dispute_signed_recent boolean not null,
  daily_signed_endpoint_ready boolean not null,
  provider_rehearsal_recent boolean not null,
  fixture_principals_ready boolean not null,
  ephemeral_sessions_ready boolean not null,
  provider_e2e_gate_open boolean not null,
  worker_write_gate_open boolean not null,
  unresolved_provider_cleanup_count integer not null check (unresolved_provider_cleanup_count >= 0),
  unresolved_terminal_reconciliation_count integer not null check (unresolved_terminal_reconciliation_count >= 0),
  missing_terminal_evidence_count integer not null check (missing_terminal_evidence_count >= 0),
  blocker_codes text[] not null,
  provider_write_authorized boolean not null default false check (provider_write_authorized = false),
  booking_launch_authorized boolean not null default false check (booking_launch_authorized = false),
  destructive_cleanup_authorized boolean not null default false check (destructive_cleanup_authorized = false),
  server_time_authoritative boolean not null default true check (server_time_authoritative = true),
  captured_at timestamptz not null default statement_timestamp(),
  check ((status = 'ready') = (cardinality(blocker_codes) = 0))
);

create table if not exists public.lesson_booking_preview_launch_blocker_alerts (
  alert_id bigint generated always as identity primary key,
  schema_version text not null check (schema_version = 'smart_parrot_booking_preview_launch_blocker_alert_v1'),
  snapshot_id bigint not null unique references public.lesson_booking_preview_launch_blocker_snapshots(snapshot_id) on delete restrict,
  previous_snapshot_id bigint references public.lesson_booking_preview_launch_blocker_snapshots(snapshot_id) on delete restrict,
  change_kind text not null check (change_kind in ('initial_state','became_blocked','became_ready','blockers_changed')),
  previous_status text check (previous_status is null or previous_status in ('blocked','ready')),
  current_status text not null check (current_status in ('blocked','ready')),
  blocker_codes text[] not null,
  provider_write_authorized boolean not null default false check (provider_write_authorized = false),
  booking_launch_authorized boolean not null default false check (booking_launch_authorized = false),
  destructive_cleanup_authorized boolean not null default false check (destructive_cleanup_authorized = false),
  recorded_at timestamptz not null default statement_timestamp()
);

create index if not exists lesson_booking_preview_launch_blocker_alerts_previous_snapshot_idx
  on public.lesson_booking_preview_launch_blocker_alerts(previous_snapshot_id)
  where previous_snapshot_id is not null;

alter table public.lesson_booking_preview_launch_blocker_snapshots enable row level security;
alter table public.lesson_booking_preview_launch_blocker_alerts enable row level security;
revoke all on table public.lesson_booking_preview_launch_blocker_snapshots
  from public, anon, authenticated, service_role;
revoke all on table public.lesson_booking_preview_launch_blocker_alerts
  from public, anon, authenticated, service_role;

drop trigger if exists lesson_booking_preview_launch_blocker_snapshots_append_only
  on public.lesson_booking_preview_launch_blocker_snapshots;
create trigger lesson_booking_preview_launch_blocker_snapshots_append_only
before update or delete on public.lesson_booking_preview_launch_blocker_snapshots
for each row execute function public.forbid_change();

drop trigger if exists lesson_booking_preview_launch_blocker_alerts_append_only
  on public.lesson_booking_preview_launch_blocker_alerts;
create trigger lesson_booking_preview_launch_blocker_alerts_append_only
before update or delete on public.lesson_booking_preview_launch_blocker_alerts
for each row execute function public.forbid_change();

create or replace function public.service_record_booking_preview_launch_blocker_snapshot(
  p_provider_secret_bundle_ready boolean,
  p_preview_project_identity_ready boolean,
  p_stripe_account_identity_ready boolean,
  p_daily_webhook_identity_ready boolean,
  p_daily_signed_endpoint_ready boolean,
  p_fixture_principals_ready boolean,
  p_ephemeral_sessions_ready boolean,
  p_provider_e2e_gate_open boolean,
  p_worker_write_gate_open boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_schema_function_ready boolean := false;
  v_stripe_checkout_at timestamptz;
  v_stripe_dispute_at timestamptz;
  v_stripe_checkout_recent boolean := false;
  v_stripe_dispute_recent boolean := false;
  v_rehearsal public.lesson_booking_provider_rehearsals%rowtype;
  v_rehearsal_found boolean := false;
  v_provider_rehearsal_recent boolean := false;
  v_unresolved_provider_cleanup integer := 0;
  v_unresolved_terminal_reconciliation integer := 0;
  v_missing_terminal_evidence integer := 0;
  v_blockers text[] := array[]::text[];
  v_status text;
  v_fingerprint text;
  v_previous public.lesson_booking_preview_launch_blocker_snapshots%rowtype;
  v_existing public.lesson_booking_preview_launch_blocker_snapshots%rowtype;
  v_alert_kind text;
  v_snapshot_id bigint;
begin
  if p_provider_secret_bundle_ready is null
     or p_preview_project_identity_ready is null
     or p_stripe_account_identity_ready is null
     or p_daily_webhook_identity_ready is null
     or p_daily_signed_endpoint_ready is null
     or p_fixture_principals_ready is null
     or p_ephemeral_sessions_ready is null
     or p_provider_e2e_gate_open is null
     or p_worker_write_gate_open is null then
    raise exception 'invalid_preview_launch_blocker_runtime_readiness' using errcode='22023';
  end if;

  select (
    to_regclass('public.bookings') is not null
    and to_regclass('public.stripe_events') is not null
    and to_regclass('public.stripe_dispute_events') is not null
    and to_regclass('public.attendance_events') is not null
    and to_regclass('public.lesson_booking_provider_rehearsals') is not null
    and to_regclass('public.lesson_booking_full_preview_runs') is not null
    and to_regclass('public.lesson_booking_full_preview_terminal_evidence') is not null
    and to_regclass('public.lesson_booking_full_preview_reconciliation_resolutions') is not null
    and exists (
      select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and p.proname='create_booking_reservation'
    )
    and exists (
      select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and p.proname='record_daily_attendance_event'
    )
    and exists (
      select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and p.proname='admin_record_booking_full_preview_terminal_evidence'
    )
    and exists (
      select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and p.proname='service_attest_booking_full_preview_cleanup_execution_manifest'
    )
  ) into v_schema_function_ready;

  select max(received_at) into v_stripe_checkout_at from public.stripe_events;
  select max(received_at) into v_stripe_dispute_at from public.stripe_dispute_events;
  v_stripe_checkout_recent := v_stripe_checkout_at is not null
    and v_stripe_checkout_at >= v_now - interval '7 days'
    and v_stripe_checkout_at <= v_now + interval '5 minutes';
  v_stripe_dispute_recent := v_stripe_dispute_at is not null
    and v_stripe_dispute_at >= v_now - interval '7 days'
    and v_stripe_dispute_at <= v_now + interval '5 minutes';

  select * into v_rehearsal
  from public.lesson_booking_provider_rehearsals r
  order by r.completed_at desc, r.run_id desc
  limit 1;
  v_rehearsal_found := found;
  v_provider_rehearsal_recent := v_rehearsal_found
    and v_rehearsal.status = 'passed'
    and v_rehearsal.cleanup_complete
    and v_rehearsal.preview_project_verified
    and v_rehearsal.stripe_account_verified
    and v_rehearsal.daily_webhook_domain_verified
    and v_rehearsal.completed_at >= v_now - interval '7 days'
    and v_rehearsal.completed_at <= v_now + interval '5 minutes';

  select count(*)::integer into v_unresolved_provider_cleanup
  from public.lesson_booking_provider_rehearsals r
  left join public.lesson_booking_provider_rehearsal_reconciliations rr on rr.run_id = r.run_id
  where r.status='cleanup_incomplete' and rr.run_id is null;

  select count(*)::integer into v_unresolved_terminal_reconciliation
  from public.lesson_booking_full_preview_terminal_evidence e
  left join public.lesson_booking_full_preview_reconciliation_resolutions rr on rr.run_id = e.run_id
  where e.reconciliation_required and rr.run_id is null;

  select count(*)::integer into v_missing_terminal_evidence
  from public.lesson_booking_full_preview_runs r
  left join public.lesson_booking_full_preview_terminal_evidence e on e.run_id = r.run_id
  where r.terminal
    and r.completed_at is not null
    and r.completed_at <= v_now - interval '15 minutes'
    and e.run_id is null;

  if not v_schema_function_ready then v_blockers := array_append(v_blockers,'schema_or_function_not_ready'); end if;
  if not p_provider_secret_bundle_ready then v_blockers := array_append(v_blockers,'provider_secret_bundle_missing'); end if;
  if not p_preview_project_identity_ready then v_blockers := array_append(v_blockers,'preview_project_identity_not_ready'); end if;
  if not p_stripe_account_identity_ready then v_blockers := array_append(v_blockers,'stripe_account_identity_not_ready'); end if;
  if not p_daily_webhook_identity_ready then v_blockers := array_append(v_blockers,'daily_webhook_identity_not_ready'); end if;
  if not v_stripe_checkout_recent then v_blockers := array_append(v_blockers,'stripe_checkout_signed_proof_stale_or_missing'); end if;
  if not v_stripe_dispute_recent then v_blockers := array_append(v_blockers,'stripe_dispute_signed_proof_stale_or_missing'); end if;
  if not p_daily_signed_endpoint_ready then v_blockers := array_append(v_blockers,'daily_signed_endpoint_proof_missing'); end if;
  if not v_provider_rehearsal_recent then v_blockers := array_append(v_blockers,'provider_rehearsal_stale_or_missing'); end if;
  if not p_fixture_principals_ready then v_blockers := array_append(v_blockers,'fixture_principals_unavailable'); end if;
  if not p_ephemeral_sessions_ready then v_blockers := array_append(v_blockers,'ephemeral_sessions_unavailable'); end if;
  if v_unresolved_provider_cleanup > 0 then v_blockers := array_append(v_blockers,'unresolved_provider_cleanup'); end if;
  if v_unresolved_terminal_reconciliation > 0 then v_blockers := array_append(v_blockers,'unresolved_terminal_reconciliation'); end if;
  if v_missing_terminal_evidence > 0 then v_blockers := array_append(v_blockers,'terminal_evidence_missing'); end if;
  if not p_provider_e2e_gate_open then v_blockers := array_append(v_blockers,'provider_e2e_gate_closed'); end if;
  if not p_worker_write_gate_open then v_blockers := array_append(v_blockers,'worker_write_gate_closed'); end if;

  v_status := case when cardinality(v_blockers)=0 then 'ready' else 'blocked' end;
  v_fingerprint := pg_catalog.md5(pg_catalog.concat_ws('|',
    'smart_parrot_booking_preview_launch_blocker_snapshot_v1',
    v_status,
    v_schema_function_ready::text,
    p_provider_secret_bundle_ready::text,
    p_preview_project_identity_ready::text,
    p_stripe_account_identity_ready::text,
    p_daily_webhook_identity_ready::text,
    v_stripe_checkout_recent::text,
    v_stripe_dispute_recent::text,
    p_daily_signed_endpoint_ready::text,
    v_provider_rehearsal_recent::text,
    p_fixture_principals_ready::text,
    p_ephemeral_sessions_ready::text,
    p_provider_e2e_gate_open::text,
    p_worker_write_gate_open::text,
    v_unresolved_provider_cleanup::text,
    v_unresolved_terminal_reconciliation::text,
    v_missing_terminal_evidence::text,
    pg_catalog.array_to_string(v_blockers,',')
  ));

  -- One authoritative latest-state transition at a time. Identical concurrent/retry calls
  -- converge on the same snapshot instead of producing alert spam.
  perform pg_catalog.pg_advisory_xact_lock(20260921,40516);
  select * into v_previous
  from public.lesson_booking_preview_launch_blocker_snapshots s
  order by s.snapshot_id desc
  limit 1;

  if found and v_previous.state_fingerprint = v_fingerprint then
    return jsonb_build_object(
      'schema_version','smart_parrot_booking_preview_launch_blocker_snapshot_v1',
      'snapshot_id',v_previous.snapshot_id,
      'status',v_previous.status,
      'blocker_codes',to_jsonb(v_previous.blocker_codes),
      'captured_at',v_previous.captured_at,
      'checks',jsonb_build_object(
        'schema_function_ready',v_previous.schema_function_ready,
        'provider_secret_bundle_ready',v_previous.provider_secret_bundle_ready,
        'preview_project_identity_ready',v_previous.preview_project_identity_ready,
        'stripe_account_identity_ready',v_previous.stripe_account_identity_ready,
        'daily_webhook_identity_ready',v_previous.daily_webhook_identity_ready,
        'stripe_checkout_signed_recent',v_previous.stripe_checkout_signed_recent,
        'stripe_dispute_signed_recent',v_previous.stripe_dispute_signed_recent,
        'daily_signed_endpoint_ready',v_previous.daily_signed_endpoint_ready,
        'provider_rehearsal_recent',v_previous.provider_rehearsal_recent,
        'fixture_principals_ready',v_previous.fixture_principals_ready,
        'ephemeral_sessions_ready',v_previous.ephemeral_sessions_ready,
        'provider_e2e_gate_open',v_previous.provider_e2e_gate_open,
        'worker_write_gate_open',v_previous.worker_write_gate_open,
        'unresolved_provider_cleanup_count',v_previous.unresolved_provider_cleanup_count,
        'unresolved_terminal_reconciliation_count',v_previous.unresolved_terminal_reconciliation_count,
        'missing_terminal_evidence_count',v_previous.missing_terminal_evidence_count
      ),
      'alert',jsonb_build_object('change_kind','unchanged','replay',true),
      'replay',true,
      'provider_write_authorized',false,
      'booking_launch_authorized',false,
      'destructive_cleanup_authorized',false,
      'server_time_authoritative',true
    );
  end if;

  insert into public.lesson_booking_preview_launch_blocker_snapshots(
    schema_version,state_fingerprint,status,schema_function_ready,
    provider_secret_bundle_ready,preview_project_identity_ready,stripe_account_identity_ready,
    daily_webhook_identity_ready,stripe_checkout_signed_recent,stripe_dispute_signed_recent,
    daily_signed_endpoint_ready,provider_rehearsal_recent,fixture_principals_ready,
    ephemeral_sessions_ready,provider_e2e_gate_open,worker_write_gate_open,
    unresolved_provider_cleanup_count,unresolved_terminal_reconciliation_count,
    missing_terminal_evidence_count,blocker_codes
  ) values (
    'smart_parrot_booking_preview_launch_blocker_snapshot_v1',v_fingerprint,v_status,v_schema_function_ready,
    p_provider_secret_bundle_ready,p_preview_project_identity_ready,p_stripe_account_identity_ready,
    p_daily_webhook_identity_ready,v_stripe_checkout_recent,v_stripe_dispute_recent,
    p_daily_signed_endpoint_ready,v_provider_rehearsal_recent,p_fixture_principals_ready,
    p_ephemeral_sessions_ready,p_provider_e2e_gate_open,p_worker_write_gate_open,
    v_unresolved_provider_cleanup,v_unresolved_terminal_reconciliation,
    v_missing_terminal_evidence,v_blockers
  ) returning snapshot_id into v_snapshot_id;

  v_alert_kind := case
    when v_previous.snapshot_id is null then 'initial_state'
    when v_previous.status='ready' and v_status='blocked' then 'became_blocked'
    when v_previous.status='blocked' and v_status='ready' then 'became_ready'
    else 'blockers_changed'
  end;

  insert into public.lesson_booking_preview_launch_blocker_alerts(
    schema_version,snapshot_id,previous_snapshot_id,change_kind,previous_status,current_status,blocker_codes
  ) values (
    'smart_parrot_booking_preview_launch_blocker_alert_v1',v_snapshot_id,v_previous.snapshot_id,
    v_alert_kind,v_previous.status,v_status,v_blockers
  );

  select * into v_existing
  from public.lesson_booking_preview_launch_blocker_snapshots
  where snapshot_id=v_snapshot_id;

  return jsonb_build_object(
    'schema_version','smart_parrot_booking_preview_launch_blocker_snapshot_v1',
    'snapshot_id',v_existing.snapshot_id,
    'status',v_existing.status,
    'blocker_codes',to_jsonb(v_existing.blocker_codes),
    'captured_at',v_existing.captured_at,
    'checks',jsonb_build_object(
      'schema_function_ready',v_existing.schema_function_ready,
      'provider_secret_bundle_ready',v_existing.provider_secret_bundle_ready,
      'preview_project_identity_ready',v_existing.preview_project_identity_ready,
      'stripe_account_identity_ready',v_existing.stripe_account_identity_ready,
      'daily_webhook_identity_ready',v_existing.daily_webhook_identity_ready,
      'stripe_checkout_signed_recent',v_existing.stripe_checkout_signed_recent,
      'stripe_dispute_signed_recent',v_existing.stripe_dispute_signed_recent,
      'daily_signed_endpoint_ready',v_existing.daily_signed_endpoint_ready,
      'provider_rehearsal_recent',v_existing.provider_rehearsal_recent,
      'fixture_principals_ready',v_existing.fixture_principals_ready,
      'ephemeral_sessions_ready',v_existing.ephemeral_sessions_ready,
      'provider_e2e_gate_open',v_existing.provider_e2e_gate_open,
      'worker_write_gate_open',v_existing.worker_write_gate_open,
      'unresolved_provider_cleanup_count',v_existing.unresolved_provider_cleanup_count,
      'unresolved_terminal_reconciliation_count',v_existing.unresolved_terminal_reconciliation_count,
      'missing_terminal_evidence_count',v_existing.missing_terminal_evidence_count
    ),
    'alert',jsonb_build_object('change_kind',v_alert_kind,'replay',false),
    'replay',false,
    'provider_write_authorized',false,
    'booking_launch_authorized',false,
    'destructive_cleanup_authorized',false,
    'server_time_authoritative',true
  );
end;
$$;

revoke all on function public.service_record_booking_preview_launch_blocker_snapshot(
  boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean
) from public, anon, authenticated, service_role;
grant execute on function public.service_record_booking_preview_launch_blocker_snapshot(
  boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean
) to service_role;

comment on table public.lesson_booking_preview_launch_blocker_snapshots is
  'Service-only append-only minimized preview launch-blocker snapshots. Contains booleans/counts/codes only; never provider identifiers, fixture identity, customer data, payment data, tokens, or secrets.';
comment on table public.lesson_booking_preview_launch_blocker_alerts is
  'Service-only append-only evidence of launch-blocker state transitions. Identical retries do not create duplicate alerts.';
comment on function public.service_record_booking_preview_launch_blocker_snapshot(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) is
  'Service-role-only preview readiness evidence recorder. PostgreSQL derives time-sensitive facts and always returns provider_write_authorized=false, booking_launch_authorized=false, destructive_cleanup_authorized=false.';