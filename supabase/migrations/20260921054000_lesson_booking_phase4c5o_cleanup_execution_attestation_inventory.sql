-- Smart Parrot Institute lesson-booking Phase 4C5O
-- Service-only, append-only cleanup execution attestation + minimized impact inventory.
-- This migration creates no cleanup executor. It never deletes/truncates data, never calls Stripe/Daily,
-- never mutates booking/payment state, and never enables provider or cleanup execution.

create table if not exists public.lesson_booking_full_preview_cleanup_execution_attestations (
  run_id uuid not null references public.lesson_booking_full_preview_terminal_evidence(run_id) on delete restrict,
  manifest_prepared_at timestamptz not null,
  schema_version text not null check (
    schema_version = 'smart_parrot_full_preview_cleanup_execution_attestation_v1'
  ),
  retention_reviewed_at timestamptz not null,
  plan_effective_generated_at timestamptz not null,
  plan_effective_expires_at timestamptz not null,
  attestation_state text not null check (attestation_state = 'non_executable'),
  inventory_full_preview_run_rows integer not null check (inventory_full_preview_run_rows >= 0),
  inventory_terminal_evidence_rows integer not null check (inventory_terminal_evidence_rows >= 0),
  inventory_reconciliation_resolution_rows integer not null check (inventory_reconciliation_resolution_rows >= 0),
  inventory_retention_review_rows integer not null check (inventory_retention_review_rows >= 0),
  inventory_cleanup_review_plan_rows integer not null check (inventory_cleanup_review_plan_rows >= 0),
  inventory_cleanup_plan_lifecycle_rows integer not null check (inventory_cleanup_plan_lifecycle_rows >= 0),
  inventory_cleanup_manifest_preview_rows integer not null check (inventory_cleanup_manifest_preview_rows >= 0),
  attested_at timestamptz not null default statement_timestamp(),
  primary key (run_id, manifest_prepared_at),
  check (plan_effective_expires_at > plan_effective_generated_at)
);

alter table public.lesson_booking_full_preview_cleanup_execution_attestations enable row level security;
revoke all on table public.lesson_booking_full_preview_cleanup_execution_attestations
  from anon, authenticated, service_role;

drop trigger if exists lesson_booking_full_preview_cleanup_execution_attestations_append_only
  on public.lesson_booking_full_preview_cleanup_execution_attestations;
create trigger lesson_booking_full_preview_cleanup_execution_attestations_append_only
before update or delete on public.lesson_booking_full_preview_cleanup_execution_attestations
for each row execute function public.forbid_change();

comment on table public.lesson_booking_full_preview_cleanup_execution_attestations is
  'Service-only append-only attestation bound to an exact current preview manifest. Stores only minimized row counts/classes and can never authorize cleanup execution.';

create or replace function public.service_attest_booking_full_preview_cleanup_execution_manifest(
  p_run_id uuid,
  p_expected_manifest_prepared_at timestamptz,
  p_expected_effective_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.lesson_booking_full_preview_cleanup_execution_manifest_previews%rowtype;
  e public.lesson_booking_full_preview_terminal_evidence%rowtype;
  rr public.lesson_booking_full_preview_reconciliation_resolutions%rowtype;
  rv public.lesson_booking_full_preview_retention_reviews%rowtype;
  base_plan public.lesson_booking_full_preview_cleanup_review_plans%rowtype;
  latest_renewal public.lesson_booking_full_preview_cleanup_plan_lifecycle%rowtype;
  existing_revocation public.lesson_booking_full_preview_cleanup_plan_lifecycle%rowtype;
  existing public.lesson_booking_full_preview_cleanup_execution_attestations%rowtype;
  v_now timestamptz := statement_timestamp();
  v_effective_generated_at timestamptz;
  v_effective_expires_at timestamptz;
  v_run_rows integer;
  v_terminal_rows integer;
  v_reconciliation_rows integer;
  v_retention_rows integer;
  v_plan_rows integer;
  v_lifecycle_rows integer;
  v_manifest_rows integer;
begin
  if p_run_id is null
     or p_expected_manifest_prepared_at is null
     or p_expected_effective_expires_at is null then
    raise exception 'invalid_full_preview_cleanup_execution_attestation_request' using errcode='22023';
  end if;

  select * into m
  from public.lesson_booking_full_preview_cleanup_execution_manifest_previews
  where run_id = p_run_id
    and prepared_at = p_expected_manifest_prepared_at
    and plan_effective_expires_at = p_expected_effective_expires_at;

  if not found then
    raise exception 'full_preview_cleanup_execution_manifest_not_found' using errcode='P0002';
  end if;
  if m.manifest_state <> 'preview_only' then
    raise exception 'full_preview_cleanup_execution_manifest_not_preview_only' using errcode='22023';
  end if;
  if m.plan_effective_expires_at <= v_now then
    raise exception 'full_preview_cleanup_execution_manifest_expired' using errcode='22023';
  end if;

  select * into e
  from public.lesson_booking_full_preview_terminal_evidence
  where run_id = p_run_id;
  if not found then
    raise exception 'full_preview_terminal_evidence_not_found' using errcode='P0002';
  end if;

  select * into rv
  from public.lesson_booking_full_preview_retention_reviews
  where run_id = p_run_id;
  if not found then
    raise exception 'full_preview_retention_review_not_found' using errcode='P0002';
  end if;
  if rv.decision <> 'eligible_for_cleanup_review'
     or rv.basis_status <> 'retention_review_due'
     or rv.reviewed_at <> m.retention_reviewed_at then
    raise exception 'stale_full_preview_cleanup_execution_retention_review' using errcode='22023';
  end if;

  select * into rr
  from public.lesson_booking_full_preview_reconciliation_resolutions
  where run_id = p_run_id;

  if e.reconciliation_required
     and (not found or rr.resolution_kind <> 'cleanup_verified') then
    raise exception 'full_preview_cleanup_execution_reconciliation_hold' using errcode='22023';
  end if;
  if found and rr.resolution_kind = 'preserve' then
    raise exception 'full_preview_cleanup_execution_preserved' using errcode='22023';
  end if;

  select * into base_plan
  from public.lesson_booking_full_preview_cleanup_review_plans
  where run_id = p_run_id;
  if not found then
    raise exception 'full_preview_cleanup_review_plan_not_found' using errcode='P0002';
  end if;

  select * into existing_revocation
  from public.lesson_booking_full_preview_cleanup_plan_lifecycle
  where run_id = p_run_id
    and event_kind = 'revoked'
  order by recorded_at desc
  limit 1;
  if found then
    raise exception 'full_preview_cleanup_plan_revoked' using errcode='22023';
  end if;

  v_effective_generated_at := base_plan.generated_at;
  v_effective_expires_at := base_plan.expires_at;

  select * into latest_renewal
  from public.lesson_booking_full_preview_cleanup_plan_lifecycle
  where run_id = p_run_id
    and event_kind = 'renewed'
  order by effective_expires_at desc, recorded_at desc
  limit 1;
  if found then
    v_effective_generated_at := latest_renewal.effective_generated_at;
    v_effective_expires_at := latest_renewal.effective_expires_at;
  end if;

  if v_effective_generated_at <> m.plan_effective_generated_at
     or v_effective_expires_at <> m.plan_effective_expires_at
     or p_expected_effective_expires_at <> v_effective_expires_at then
    raise exception 'stale_full_preview_cleanup_execution_manifest_generation' using errcode='22023';
  end if;

  if greatest(e.recorded_at, coalesce(rr.resolved_at,e.recorded_at)) + interval '30 days' > v_now then
    raise exception 'full_preview_cleanup_execution_retention_no_longer_due' using errcode='22023';
  end if;

  select * into existing
  from public.lesson_booking_full_preview_cleanup_execution_attestations
  where run_id = p_run_id
    and manifest_prepared_at = p_expected_manifest_prepared_at;

  if found then
    if existing.retention_reviewed_at = m.retention_reviewed_at
       and existing.plan_effective_generated_at = m.plan_effective_generated_at
       and existing.plan_effective_expires_at = m.plan_effective_expires_at then
      return jsonb_build_object(
        'schema_version',existing.schema_version,
        'run_id',existing.run_id,
        'attestation_state',existing.attestation_state,
        'manifest_prepared_at',existing.manifest_prepared_at,
        'retention_reviewed_at',existing.retention_reviewed_at,
        'plan_effective_expires_at',existing.plan_effective_expires_at,
        'attested_at',existing.attested_at,
        'impact_inventory',jsonb_build_array(
          jsonb_build_object('artifact_class','full_preview_run','row_count',existing.inventory_full_preview_run_rows),
          jsonb_build_object('artifact_class','terminal_evidence','row_count',existing.inventory_terminal_evidence_rows),
          jsonb_build_object('artifact_class','reconciliation_resolution','row_count',existing.inventory_reconciliation_resolution_rows),
          jsonb_build_object('artifact_class','retention_review','row_count',existing.inventory_retention_review_rows),
          jsonb_build_object('artifact_class','cleanup_review_plan','row_count',existing.inventory_cleanup_review_plan_rows),
          jsonb_build_object('artifact_class','cleanup_plan_lifecycle','row_count',existing.inventory_cleanup_plan_lifecycle_rows),
          jsonb_build_object('artifact_class','cleanup_manifest_preview','row_count',existing.inventory_cleanup_manifest_preview_rows)
        ),
        'replay',true,
        'service_only',true,
        'destructive_cleanup_authorized',false,
        'cleanup_execution_enabled',false,
        'server_time_authoritative',true
      );
    end if;
    raise exception 'full_preview_cleanup_execution_attestation_conflicting_replay' using errcode='23505';
  end if;

  select count(*)::integer into v_run_rows
  from public.lesson_booking_full_preview_runs
  where run_id = p_run_id;

  select count(*)::integer into v_terminal_rows
  from public.lesson_booking_full_preview_terminal_evidence
  where run_id = p_run_id;

  select count(*)::integer into v_reconciliation_rows
  from public.lesson_booking_full_preview_reconciliation_resolutions
  where run_id = p_run_id;

  select count(*)::integer into v_retention_rows
  from public.lesson_booking_full_preview_retention_reviews
  where run_id = p_run_id;

  select count(*)::integer into v_plan_rows
  from public.lesson_booking_full_preview_cleanup_review_plans
  where run_id = p_run_id;

  select count(*)::integer into v_lifecycle_rows
  from public.lesson_booking_full_preview_cleanup_plan_lifecycle
  where run_id = p_run_id;

  select count(*)::integer into v_manifest_rows
  from public.lesson_booking_full_preview_cleanup_execution_manifest_previews
  where run_id = p_run_id;

  insert into public.lesson_booking_full_preview_cleanup_execution_attestations(
    run_id,manifest_prepared_at,schema_version,retention_reviewed_at,
    plan_effective_generated_at,plan_effective_expires_at,attestation_state,
    inventory_full_preview_run_rows,inventory_terminal_evidence_rows,
    inventory_reconciliation_resolution_rows,inventory_retention_review_rows,
    inventory_cleanup_review_plan_rows,inventory_cleanup_plan_lifecycle_rows,
    inventory_cleanup_manifest_preview_rows,attested_at
  ) values (
    p_run_id,m.prepared_at,'smart_parrot_full_preview_cleanup_execution_attestation_v1',
    m.retention_reviewed_at,m.plan_effective_generated_at,m.plan_effective_expires_at,'non_executable',
    v_run_rows,v_terminal_rows,v_reconciliation_rows,v_retention_rows,
    v_plan_rows,v_lifecycle_rows,v_manifest_rows,v_now
  )
  returning * into existing;

  return jsonb_build_object(
    'schema_version',existing.schema_version,
    'run_id',existing.run_id,
    'attestation_state',existing.attestation_state,
    'manifest_prepared_at',existing.manifest_prepared_at,
    'retention_reviewed_at',existing.retention_reviewed_at,
    'plan_effective_expires_at',existing.plan_effective_expires_at,
    'attested_at',existing.attested_at,
    'impact_inventory',jsonb_build_array(
      jsonb_build_object('artifact_class','full_preview_run','row_count',existing.inventory_full_preview_run_rows),
      jsonb_build_object('artifact_class','terminal_evidence','row_count',existing.inventory_terminal_evidence_rows),
      jsonb_build_object('artifact_class','reconciliation_resolution','row_count',existing.inventory_reconciliation_resolution_rows),
      jsonb_build_object('artifact_class','retention_review','row_count',existing.inventory_retention_review_rows),
      jsonb_build_object('artifact_class','cleanup_review_plan','row_count',existing.inventory_cleanup_review_plan_rows),
      jsonb_build_object('artifact_class','cleanup_plan_lifecycle','row_count',existing.inventory_cleanup_plan_lifecycle_rows),
      jsonb_build_object('artifact_class','cleanup_manifest_preview','row_count',existing.inventory_cleanup_manifest_preview_rows)
    ),
    'replay',false,
    'service_only',true,
    'destructive_cleanup_authorized',false,
    'cleanup_execution_enabled',false,
    'server_time_authoritative',true,
    'boundaries',jsonb_build_array(
      'Attestation is evidence only and is never cleanup authority',
      'Impact inventory contains row counts/classes only',
      'The exact current preview-only manifest is revalidated with PostgreSQL server time',
      'No deletion, provider mutation, fixture mutation, payment transition, or Cron purge is enabled'
    )
  );
end;
$$;

revoke all on function public.service_attest_booking_full_preview_cleanup_execution_manifest(
  uuid,timestamptz,timestamptz
) from public, anon, authenticated;
grant execute on function public.service_attest_booking_full_preview_cleanup_execution_manifest(
  uuid,timestamptz,timestamptz
) to service_role;

comment on function public.service_attest_booking_full_preview_cleanup_execution_manifest(uuid,timestamptz,timestamptz) is
  'Service-role-only non-executable attestation anchored to an exact current preview cleanup manifest. Returns minimized impact counts/classes only and never grants cleanup authority.';
