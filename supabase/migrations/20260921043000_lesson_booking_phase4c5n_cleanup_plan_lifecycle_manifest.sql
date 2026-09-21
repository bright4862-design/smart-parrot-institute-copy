-- Smart Parrot Institute lesson-booking Phase 4C5N
-- Append-only cleanup-plan lifecycle audit + immutable execution-manifest preview.
-- This migration never deletes evidence/fixtures, never calls Stripe/Daily, and never enables cleanup execution.

create table if not exists public.lesson_booking_full_preview_cleanup_plan_lifecycle (
  run_id uuid not null references public.lesson_booking_full_preview_terminal_evidence(run_id) on delete restrict,
  schema_version text not null check (schema_version = 'smart_parrot_full_preview_cleanup_plan_lifecycle_v1'),
  event_kind text not null check (event_kind in ('expiry_observed','renewed','revoked')),
  prior_effective_expires_at timestamptz not null,
  effective_generated_at timestamptz,
  effective_expires_at timestamptz,
  reason_code text,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  recorded_at timestamptz not null default statement_timestamp(),
  primary key (run_id,event_kind,prior_effective_expires_at),
  check (
    (event_kind = 'expiry_observed'
      and effective_generated_at is null
      and effective_expires_at is null
      and reason_code is null)
    or
    (event_kind = 'renewed'
      and effective_generated_at is not null
      and effective_expires_at is not null
      and effective_expires_at > effective_generated_at
      and reason_code is null)
    or
    (event_kind = 'revoked'
      and effective_generated_at is null
      and effective_expires_at is null
      and reason_code in ('preserve_override','review_changed','manual_safety_hold'))
  )
);

create index if not exists lesson_booking_full_preview_cleanup_plan_lifecycle_recorded_by_idx
  on public.lesson_booking_full_preview_cleanup_plan_lifecycle(recorded_by, recorded_at);
create index if not exists lesson_booking_full_preview_cleanup_plan_lifecycle_run_recorded_idx
  on public.lesson_booking_full_preview_cleanup_plan_lifecycle(run_id, recorded_at desc);

alter table public.lesson_booking_full_preview_cleanup_plan_lifecycle enable row level security;
revoke all on table public.lesson_booking_full_preview_cleanup_plan_lifecycle
  from anon, authenticated, service_role;

drop trigger if exists lesson_booking_full_preview_cleanup_plan_lifecycle_append_only
  on public.lesson_booking_full_preview_cleanup_plan_lifecycle;
create trigger lesson_booking_full_preview_cleanup_plan_lifecycle_append_only
before update or delete on public.lesson_booking_full_preview_cleanup_plan_lifecycle
for each row execute function public.forbid_change();

comment on table public.lesson_booking_full_preview_cleanup_plan_lifecycle is
  'Append-only audit of dry-run cleanup-plan expiry observations, bounded renewals, and terminal revocations. Never grants destructive authority.';

create table if not exists public.lesson_booking_full_preview_cleanup_execution_manifest_previews (
  run_id uuid not null references public.lesson_booking_full_preview_terminal_evidence(run_id) on delete restrict,
  schema_version text not null check (schema_version = 'smart_parrot_full_preview_cleanup_execution_manifest_preview_v1'),
  retention_reviewed_at timestamptz not null,
  source_plan_kind text not null check (source_plan_kind in ('base_plan','renewal')),
  plan_effective_generated_at timestamptz not null,
  plan_effective_expires_at timestamptz not null,
  manifest_state text not null check (manifest_state = 'preview_only'),
  prepared_by uuid not null references public.profiles(id) on delete restrict,
  prepared_at timestamptz not null default statement_timestamp(),
  primary key (run_id,plan_effective_expires_at),
  check (plan_effective_expires_at > plan_effective_generated_at)
);

create index if not exists lesson_booking_full_preview_cleanup_manifest_previews_prepared_by_idx
  on public.lesson_booking_full_preview_cleanup_execution_manifest_previews(prepared_by, prepared_at);

alter table public.lesson_booking_full_preview_cleanup_execution_manifest_previews enable row level security;
revoke all on table public.lesson_booking_full_preview_cleanup_execution_manifest_previews
  from anon, authenticated, service_role;

drop trigger if exists lesson_booking_full_preview_cleanup_execution_manifest_previews_append_only
  on public.lesson_booking_full_preview_cleanup_execution_manifest_previews;
create trigger lesson_booking_full_preview_cleanup_execution_manifest_previews_append_only
before update or delete on public.lesson_booking_full_preview_cleanup_execution_manifest_previews
for each row execute function public.forbid_change();

comment on table public.lesson_booking_full_preview_cleanup_execution_manifest_previews is
  'Immutable minimized preview of a possible future cleanup execution manifest. It is not executable and never grants deletion/provider authority.';

create or replace function public.admin_renew_booking_full_preview_cleanup_review_plan(
  p_run_id uuid,
  p_expected_effective_expires_at timestamptz,
  p_expected_reviewed_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e public.lesson_booking_full_preview_terminal_evidence%rowtype;
  rr public.lesson_booking_full_preview_reconciliation_resolutions%rowtype;
  rv public.lesson_booking_full_preview_retention_reviews%rowtype;
  base_plan public.lesson_booking_full_preview_cleanup_review_plans%rowtype;
  latest_renewal public.lesson_booking_full_preview_cleanup_plan_lifecycle%rowtype;
  matching_renewal public.lesson_booking_full_preview_cleanup_plan_lifecycle%rowtype;
  existing_revocation public.lesson_booking_full_preview_cleanup_plan_lifecycle%rowtype;
  v_now timestamptz := statement_timestamp();
  v_review_after timestamptz;
  v_effective_generated_at timestamptz;
  v_effective_expires_at timestamptz;
  v_source_plan_kind text := 'base_plan';
begin
  perform private.smart_parrot_require_admin(uid);

  if p_run_id is null
     or p_expected_effective_expires_at is null
     or p_expected_reviewed_at is null then
    raise exception 'invalid_full_preview_cleanup_plan_renewal_request' using errcode='22023';
  end if;

  select * into base_plan
  from public.lesson_booking_full_preview_cleanup_review_plans
  where run_id = p_run_id
  for update;
  if not found then
    raise exception 'full_preview_cleanup_review_plan_not_found' using errcode='P0002';
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
     or rv.reviewed_at <> p_expected_reviewed_at
     or base_plan.retention_reviewed_at <> rv.reviewed_at then
    raise exception 'stale_full_preview_cleanup_plan_retention_review' using errcode='22023';
  end if;

  select * into rr
  from public.lesson_booking_full_preview_reconciliation_resolutions
  where run_id = p_run_id;

  if e.reconciliation_required
     and (not found or rr.resolution_kind <> 'cleanup_verified') then
    raise exception 'full_preview_cleanup_plan_reconciliation_hold' using errcode='22023';
  end if;
  if found and rr.resolution_kind = 'preserve' then
    raise exception 'full_preview_cleanup_plan_preserved' using errcode='22023';
  end if;

  v_review_after := greatest(e.recorded_at, coalesce(rr.resolved_at,e.recorded_at)) + interval '30 days';
  if v_now < v_review_after then
    raise exception 'full_preview_cleanup_plan_retention_no_longer_due' using errcode='22023';
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
    v_source_plan_kind := 'renewal';
  end if;

  select * into matching_renewal
  from public.lesson_booking_full_preview_cleanup_plan_lifecycle
  where run_id = p_run_id
    and event_kind = 'renewed'
    and prior_effective_expires_at = p_expected_effective_expires_at
  limit 1;
  if found then
    if matching_renewal.effective_expires_at = v_effective_expires_at then
      return jsonb_build_object(
        'schema_version','smart_parrot_full_preview_cleanup_plan_lifecycle_v1',
        'run_id',p_run_id,
        'event_kind','renewed',
        'prior_effective_expires_at',matching_renewal.prior_effective_expires_at,
        'effective_generated_at',matching_renewal.effective_generated_at,
        'effective_expires_at',matching_renewal.effective_expires_at,
        'plan_status',case when matching_renewal.effective_expires_at <= v_now then 'expired' else 'active' end,
        'replay',true,
        'destructive_cleanup_authorized',false,
        'cleanup_execution_enabled',false,
        'server_time_authoritative',true
      );
    end if;
    raise exception 'stale_full_preview_cleanup_plan_renewal_replay' using errcode='22023';
  end if;

  if p_expected_effective_expires_at <> v_effective_expires_at then
    raise exception 'stale_full_preview_cleanup_plan_generation' using errcode='22023';
  end if;
  if v_effective_expires_at > v_now then
    raise exception 'full_preview_cleanup_plan_still_active' using errcode='22023';
  end if;

  insert into public.lesson_booking_full_preview_cleanup_plan_lifecycle(
    run_id,schema_version,event_kind,prior_effective_expires_at,recorded_by,recorded_at
  ) values (
    p_run_id,'smart_parrot_full_preview_cleanup_plan_lifecycle_v1','expiry_observed',
    v_effective_expires_at,uid,v_now
  )
  on conflict (run_id,event_kind,prior_effective_expires_at) do nothing;

  insert into public.lesson_booking_full_preview_cleanup_plan_lifecycle(
    run_id,schema_version,event_kind,prior_effective_expires_at,
    effective_generated_at,effective_expires_at,recorded_by,recorded_at
  ) values (
    p_run_id,'smart_parrot_full_preview_cleanup_plan_lifecycle_v1','renewed',
    v_effective_expires_at,v_now,v_now + interval '24 hours',uid,v_now
  )
  returning * into matching_renewal;

  return jsonb_build_object(
    'schema_version','smart_parrot_full_preview_cleanup_plan_lifecycle_v1',
    'run_id',p_run_id,
    'event_kind','renewed',
    'prior_effective_expires_at',matching_renewal.prior_effective_expires_at,
    'effective_generated_at',matching_renewal.effective_generated_at,
    'effective_expires_at',matching_renewal.effective_expires_at,
    'plan_status','active',
    'replay',false,
    'destructive_cleanup_authorized',false,
    'cleanup_execution_enabled',false,
    'server_time_authoritative',true,
    'boundaries',jsonb_build_array(
      'Renewal only replaces an expired dry-run review window',
      'PostgreSQL server time defines expiry and renewal',
      'A revocation is terminal for this run',
      'No deletion, provider mutation, fixture mutation, or payment transition is authorized'
    )
  );
end;
$$;

revoke all on function public.admin_renew_booking_full_preview_cleanup_review_plan(
  uuid,timestamptz,timestamptz
) from public, anon;
grant execute on function public.admin_renew_booking_full_preview_cleanup_review_plan(
  uuid,timestamptz,timestamptz
) to authenticated;

comment on function public.admin_renew_booking_full_preview_cleanup_review_plan(uuid,timestamptz,timestamptz) is
  'Admin-only bounded renewal of an expired dry-run cleanup review plan. Every generation remains non-executable and server-time authoritative.';

create or replace function public.admin_revoke_booking_full_preview_cleanup_review_plan(
  p_run_id uuid,
  p_expected_effective_expires_at timestamptz,
  p_reason_code text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  base_plan public.lesson_booking_full_preview_cleanup_review_plans%rowtype;
  latest_renewal public.lesson_booking_full_preview_cleanup_plan_lifecycle%rowtype;
  existing_revocation public.lesson_booking_full_preview_cleanup_plan_lifecycle%rowtype;
  v_now timestamptz := statement_timestamp();
  v_effective_expires_at timestamptz;
  v_reason text := lower(trim(coalesce(p_reason_code,'')));
begin
  perform private.smart_parrot_require_admin(uid);

  if p_run_id is null
     or p_expected_effective_expires_at is null
     or v_reason not in ('preserve_override','review_changed','manual_safety_hold') then
    raise exception 'invalid_full_preview_cleanup_plan_revocation_request' using errcode='22023';
  end if;

  select * into base_plan
  from public.lesson_booking_full_preview_cleanup_review_plans
  where run_id = p_run_id
  for update;
  if not found then
    raise exception 'full_preview_cleanup_review_plan_not_found' using errcode='P0002';
  end if;

  v_effective_expires_at := base_plan.expires_at;
  select * into latest_renewal
  from public.lesson_booking_full_preview_cleanup_plan_lifecycle
  where run_id = p_run_id
    and event_kind = 'renewed'
  order by effective_expires_at desc, recorded_at desc
  limit 1;
  if found then
    v_effective_expires_at := latest_renewal.effective_expires_at;
  end if;

  select * into existing_revocation
  from public.lesson_booking_full_preview_cleanup_plan_lifecycle
  where run_id = p_run_id
    and event_kind = 'revoked'
  order by recorded_at desc
  limit 1;
  if found then
    if existing_revocation.prior_effective_expires_at = p_expected_effective_expires_at
       and existing_revocation.reason_code = v_reason then
      return jsonb_build_object(
        'schema_version','smart_parrot_full_preview_cleanup_plan_lifecycle_v1',
        'run_id',p_run_id,
        'event_kind','revoked',
        'prior_effective_expires_at',existing_revocation.prior_effective_expires_at,
        'reason_code',existing_revocation.reason_code,
        'recorded_at',existing_revocation.recorded_at,
        'replay',true,
        'destructive_cleanup_authorized',false,
        'cleanup_execution_enabled',false,
        'server_time_authoritative',true
      );
    end if;
    raise exception 'full_preview_cleanup_plan_revocation_conflicting_replay' using errcode='23505';
  end if;

  if p_expected_effective_expires_at <> v_effective_expires_at then
    raise exception 'stale_full_preview_cleanup_plan_generation' using errcode='22023';
  end if;

  if v_effective_expires_at <= v_now then
    insert into public.lesson_booking_full_preview_cleanup_plan_lifecycle(
      run_id,schema_version,event_kind,prior_effective_expires_at,recorded_by,recorded_at
    ) values (
      p_run_id,'smart_parrot_full_preview_cleanup_plan_lifecycle_v1','expiry_observed',
      v_effective_expires_at,uid,v_now
    )
    on conflict (run_id,event_kind,prior_effective_expires_at) do nothing;
  end if;

  insert into public.lesson_booking_full_preview_cleanup_plan_lifecycle(
    run_id,schema_version,event_kind,prior_effective_expires_at,reason_code,recorded_by,recorded_at
  ) values (
    p_run_id,'smart_parrot_full_preview_cleanup_plan_lifecycle_v1','revoked',
    v_effective_expires_at,v_reason,uid,v_now
  )
  returning * into existing_revocation;

  return jsonb_build_object(
    'schema_version','smart_parrot_full_preview_cleanup_plan_lifecycle_v1',
    'run_id',p_run_id,
    'event_kind','revoked',
    'prior_effective_expires_at',existing_revocation.prior_effective_expires_at,
    'reason_code',existing_revocation.reason_code,
    'recorded_at',existing_revocation.recorded_at,
    'replay',false,
    'destructive_cleanup_authorized',false,
    'cleanup_execution_enabled',false,
    'server_time_authoritative',true,
    'boundaries',jsonb_build_array(
      'Revocation is append-only and terminal for this run',
      'No browser-supplied current time is accepted',
      'No deletion or provider mutation is authorized'
    )
  );
end;
$$;

revoke all on function public.admin_revoke_booking_full_preview_cleanup_review_plan(
  uuid,timestamptz,text
) from public, anon;
grant execute on function public.admin_revoke_booking_full_preview_cleanup_review_plan(
  uuid,timestamptz,text
) to authenticated;

comment on function public.admin_revoke_booking_full_preview_cleanup_review_plan(uuid,timestamptz,text) is
  'Admin-only terminal revocation of a dry-run cleanup review plan generation. Revocation never deletes data and cannot be renewed away.';

create or replace function public.admin_prepare_booking_full_preview_cleanup_execution_manifest_preview(
  p_run_id uuid,
  p_expected_effective_expires_at timestamptz,
  p_expected_reviewed_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e public.lesson_booking_full_preview_terminal_evidence%rowtype;
  rr public.lesson_booking_full_preview_reconciliation_resolutions%rowtype;
  rv public.lesson_booking_full_preview_retention_reviews%rowtype;
  base_plan public.lesson_booking_full_preview_cleanup_review_plans%rowtype;
  latest_renewal public.lesson_booking_full_preview_cleanup_plan_lifecycle%rowtype;
  existing_revocation public.lesson_booking_full_preview_cleanup_plan_lifecycle%rowtype;
  existing_manifest public.lesson_booking_full_preview_cleanup_execution_manifest_previews%rowtype;
  v_now timestamptz := statement_timestamp();
  v_review_after timestamptz;
  v_effective_generated_at timestamptz;
  v_effective_expires_at timestamptz;
  v_source_plan_kind text := 'base_plan';
begin
  perform private.smart_parrot_require_admin(uid);

  if p_run_id is null
     or p_expected_effective_expires_at is null
     or p_expected_reviewed_at is null then
    raise exception 'invalid_full_preview_cleanup_manifest_preview_request' using errcode='22023';
  end if;

  select * into base_plan
  from public.lesson_booking_full_preview_cleanup_review_plans
  where run_id = p_run_id
  for update;
  if not found then
    raise exception 'full_preview_cleanup_review_plan_not_found' using errcode='P0002';
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
     or rv.reviewed_at <> p_expected_reviewed_at
     or base_plan.retention_reviewed_at <> rv.reviewed_at then
    raise exception 'stale_full_preview_cleanup_manifest_retention_review' using errcode='22023';
  end if;

  select * into rr
  from public.lesson_booking_full_preview_reconciliation_resolutions
  where run_id = p_run_id;
  if e.reconciliation_required
     and (not found or rr.resolution_kind <> 'cleanup_verified') then
    raise exception 'full_preview_cleanup_manifest_reconciliation_hold' using errcode='22023';
  end if;
  if found and rr.resolution_kind = 'preserve' then
    raise exception 'full_preview_cleanup_manifest_preserved' using errcode='22023';
  end if;

  v_review_after := greatest(e.recorded_at, coalesce(rr.resolved_at,e.recorded_at)) + interval '30 days';
  if v_now < v_review_after then
    raise exception 'full_preview_cleanup_manifest_retention_no_longer_due' using errcode='22023';
  end if;

  select * into existing_revocation
  from public.lesson_booking_full_preview_cleanup_plan_lifecycle
  where run_id = p_run_id
    and event_kind = 'revoked'
  order by recorded_at desc
  limit 1;
  if found then
    raise exception 'full_preview_cleanup_manifest_plan_revoked' using errcode='22023';
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
    v_source_plan_kind := 'renewal';
  end if;

  if p_expected_effective_expires_at <> v_effective_expires_at then
    raise exception 'stale_full_preview_cleanup_manifest_plan_generation' using errcode='22023';
  end if;
  if v_effective_expires_at <= v_now then
    raise exception 'full_preview_cleanup_manifest_plan_expired' using errcode='22023';
  end if;

  select * into existing_manifest
  from public.lesson_booking_full_preview_cleanup_execution_manifest_previews
  where run_id = p_run_id
    and plan_effective_expires_at = v_effective_expires_at;
  if found then
    if existing_manifest.retention_reviewed_at = rv.reviewed_at
       and existing_manifest.plan_effective_generated_at = v_effective_generated_at
       and existing_manifest.source_plan_kind = v_source_plan_kind
       and existing_manifest.manifest_state = 'preview_only' then
      return jsonb_build_object(
        'schema_version','smart_parrot_full_preview_cleanup_execution_manifest_preview_v1',
        'run_id',p_run_id,
        'manifest_state','preview_only',
        'source_plan_kind',existing_manifest.source_plan_kind,
        'retention_reviewed_at',existing_manifest.retention_reviewed_at,
        'plan_effective_generated_at',existing_manifest.plan_effective_generated_at,
        'plan_effective_expires_at',existing_manifest.plan_effective_expires_at,
        'prepared_at',existing_manifest.prepared_at,
        'manifest_status','current',
        'replay',true,
        'destructive_cleanup_authorized',false,
        'cleanup_execution_enabled',false,
        'server_time_authoritative',true
      );
    end if;
    raise exception 'full_preview_cleanup_manifest_conflicting_replay' using errcode='23505';
  end if;

  insert into public.lesson_booking_full_preview_cleanup_execution_manifest_previews(
    run_id,schema_version,retention_reviewed_at,source_plan_kind,
    plan_effective_generated_at,plan_effective_expires_at,manifest_state,prepared_by,prepared_at
  ) values (
    p_run_id,'smart_parrot_full_preview_cleanup_execution_manifest_preview_v1',
    rv.reviewed_at,v_source_plan_kind,v_effective_generated_at,v_effective_expires_at,
    'preview_only',uid,v_now
  )
  returning * into existing_manifest;

  return jsonb_build_object(
    'schema_version','smart_parrot_full_preview_cleanup_execution_manifest_preview_v1',
    'run_id',p_run_id,
    'manifest_state','preview_only',
    'source_plan_kind',existing_manifest.source_plan_kind,
    'retention_reviewed_at',existing_manifest.retention_reviewed_at,
    'plan_effective_generated_at',existing_manifest.plan_effective_generated_at,
    'plan_effective_expires_at',existing_manifest.plan_effective_expires_at,
    'prepared_at',existing_manifest.prepared_at,
    'manifest_status','current',
    'replay',false,
    'destructive_cleanup_authorized',false,
    'cleanup_execution_enabled',false,
    'server_time_authoritative',true,
    'boundaries',jsonb_build_array(
      'Execution manifest is a preview-only audit artifact',
      'All retention, reconciliation, and plan state is revalidated server-side',
      'PostgreSQL server time defines plan freshness',
      'No deletion, provider write, fixture mutation, or payment transition is enabled'
    )
  );
end;
$$;

revoke all on function public.admin_prepare_booking_full_preview_cleanup_execution_manifest_preview(
  uuid,timestamptz,timestamptz
) from public, anon;
grant execute on function public.admin_prepare_booking_full_preview_cleanup_execution_manifest_preview(
  uuid,timestamptz,timestamptz
) to authenticated;

comment on function public.admin_prepare_booking_full_preview_cleanup_execution_manifest_preview(uuid,timestamptz,timestamptz) is
  'Admin-only minimized immutable preview of a possible future cleanup execution manifest. It is never executable and grants no destructive/provider authority.';