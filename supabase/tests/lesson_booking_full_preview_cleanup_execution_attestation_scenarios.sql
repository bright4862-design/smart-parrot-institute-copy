-- Phase 4C5O service-only cleanup execution attestation + minimized impact inventory scenarios.
-- Ephemeral CI only. No provider calls and no destructive cleanup.
begin;

insert into auth.users(id,raw_user_meta_data) values
  ('8c000000-0000-0000-0000-000000000041','{"full_name":"Phase4C5O Admin"}'),
  ('8c000000-0000-0000-0000-000000000042','{"full_name":"Phase4C5O Outsider"}');
update public.profiles set role='admin' where id='8c000000-0000-0000-0000-000000000041';

insert into public.lesson_booking_full_preview_runs(
  run_id,scenario,state,pause_reason,terminal,revision,last_booking_status,
  created_by,created_at,updated_at,last_observed_at,completed_at
) values
  ('8c000000-0000-4000-8000-000000000400','near_term_success','complete',null,true,2,'settled',
   '8c000000-0000-0000-0000-000000000041',statement_timestamp()-interval '43 days',statement_timestamp()-interval '42 days',statement_timestamp()-interval '42 days',statement_timestamp()-interval '42 days'),
  ('8c000000-0000-4000-8000-000000000401','near_term_success','complete',null,true,2,'settled',
   '8c000000-0000-0000-0000-000000000041',statement_timestamp()-interval '44 days',statement_timestamp()-interval '43 days',statement_timestamp()-interval '43 days',statement_timestamp()-interval '43 days');

insert into public.lesson_booking_full_preview_terminal_evidence(
  run_id,schema_version,terminal_state,transcript_sha256,correlation_sha256,
  session_close_status,fixture_cleanup_status,reconciliation_required,recorded_by,recorded_at
) values
  ('8c000000-0000-4000-8000-000000000400','smart_parrot_full_preview_terminal_evidence_v1','complete',repeat('7',64),repeat('8',64),
   'fixture_sessions_closed','fixture_cleanup_complete',false,'8c000000-0000-0000-0000-000000000041',statement_timestamp()-interval '42 days'),
  ('8c000000-0000-4000-8000-000000000401','smart_parrot_full_preview_terminal_evidence_v1','complete',repeat('9',64),repeat('a',64),
   'fixture_sessions_closed','fixture_cleanup_complete',false,'8c000000-0000-0000-0000-000000000041',statement_timestamp()-interval '43 days');

create or replace function auth.uid() returns uuid language sql stable as $$
  select '8c000000-0000-0000-0000-000000000041'::uuid
$$;

do $$
declare
  active_review jsonb;
  expired_review jsonb;
begin
  select public.admin_record_booking_full_preview_retention_review(
    '8c000000-0000-4000-8000-000000000400','eligible_for_cleanup_review'
  ) into active_review;
  select public.admin_record_booking_full_preview_retention_review(
    '8c000000-0000-4000-8000-000000000401','eligible_for_cleanup_review'
  ) into expired_review;

  if active_review->>'basis_status' <> 'retention_review_due'
     or expired_review->>'basis_status' <> 'retention_review_due' then
    raise exception 'Unexpected Phase 4C5O retention review basis';
  end if;
end $$;

insert into public.lesson_booking_full_preview_cleanup_review_plans(
  run_id,schema_version,retention_reviewed_at,retention_review_decision,
  plan_state,generated_by,generated_at,expires_at
)
select
  rv.run_id,'smart_parrot_full_preview_cleanup_review_plan_v1',rv.reviewed_at,
  'eligible_for_cleanup_review','dry_run_only',
  '8c000000-0000-0000-0000-000000000041',
  case rv.run_id
    when '8c000000-0000-4000-8000-000000000400'::uuid then statement_timestamp()-interval '1 hour'
    else statement_timestamp()-interval '2 days'
  end,
  case rv.run_id
    when '8c000000-0000-4000-8000-000000000400'::uuid then statement_timestamp()+interval '23 hours'
    else statement_timestamp()-interval '1 day'
  end
from public.lesson_booking_full_preview_retention_reviews rv
where rv.run_id in (
  '8c000000-0000-4000-8000-000000000400'::uuid,
  '8c000000-0000-4000-8000-000000000401'::uuid
);

do $$
declare
  reviewed_active timestamptz;
  active_expiry timestamptz;
  manifest jsonb;
  first_attestation jsonb;
  replay_attestation jsonb;
  stale_manifest_blocked boolean := false;
  revoked_manifest_blocked boolean := false;
  inventory_length integer;
  inventory_run_count integer;
  inventory_terminal_count integer;
begin
  select reviewed_at into reviewed_active
  from public.lesson_booking_full_preview_retention_reviews
  where run_id='8c000000-0000-4000-8000-000000000400';

  select expires_at into active_expiry
  from public.lesson_booking_full_preview_cleanup_review_plans
  where run_id='8c000000-0000-4000-8000-000000000400';

  select public.admin_prepare_booking_full_preview_cleanup_execution_manifest_preview(
    '8c000000-0000-4000-8000-000000000400',active_expiry,reviewed_active
  ) into manifest;

  select public.service_attest_booking_full_preview_cleanup_execution_manifest(
    '8c000000-0000-4000-8000-000000000400',
    (manifest->>'prepared_at')::timestamptz,
    active_expiry
  ) into first_attestation;

  if first_attestation->>'attestation_state' <> 'non_executable'
     or (first_attestation->>'replay')::boolean
     or not (first_attestation->>'service_only')::boolean
     or (first_attestation->>'destructive_cleanup_authorized')::boolean
     or (first_attestation->>'cleanup_execution_enabled')::boolean
     or not (first_attestation->>'server_time_authoritative')::boolean then
    raise exception 'Unexpected Phase 4C5O service attestation: %', first_attestation;
  end if;

  inventory_length := jsonb_array_length(first_attestation->'impact_inventory');
  if inventory_length <> 7 then
    raise exception 'Expected 7 minimized impact classes, got %', inventory_length;
  end if;

  select (item->>'row_count')::integer into inventory_run_count
  from jsonb_array_elements(first_attestation->'impact_inventory') item
  where item->>'artifact_class'='full_preview_run';
  select (item->>'row_count')::integer into inventory_terminal_count
  from jsonb_array_elements(first_attestation->'impact_inventory') item
  where item->>'artifact_class'='terminal_evidence';

  if inventory_run_count <> 1 or inventory_terminal_count <> 1 then
    raise exception 'Unexpected minimized impact inventory counts: %', first_attestation->'impact_inventory';
  end if;

  select public.service_attest_booking_full_preview_cleanup_execution_manifest(
    '8c000000-0000-4000-8000-000000000400',
    (manifest->>'prepared_at')::timestamptz,
    active_expiry
  ) into replay_attestation;

  if not (replay_attestation->>'replay')::boolean
     or replay_attestation->'impact_inventory' <> first_attestation->'impact_inventory' then
    raise exception 'Service attestation did not replay deterministically: %', replay_attestation;
  end if;

  begin
    perform public.service_attest_booking_full_preview_cleanup_execution_manifest(
      '8c000000-0000-4000-8000-000000000400',
      (manifest->>'prepared_at')::timestamptz + interval '1 second',
      active_expiry
    );
  exception when no_data_found then
    stale_manifest_blocked := true;
  end;
  if not stale_manifest_blocked then
    raise exception 'Stale manifest identity was not rejected';
  end if;

  perform public.admin_revoke_booking_full_preview_cleanup_review_plan(
    '8c000000-0000-4000-8000-000000000400',active_expiry,'manual_safety_hold'
  );

  begin
    perform public.service_attest_booking_full_preview_cleanup_execution_manifest(
      '8c000000-0000-4000-8000-000000000400',
      (manifest->>'prepared_at')::timestamptz,
      active_expiry
    );
  exception when invalid_parameter_value then
    revoked_manifest_blocked := true;
  end;
  if not revoked_manifest_blocked then
    raise exception 'Revoked manifest replay unexpectedly remained attestable';
  end if;
end $$;

-- A legacy/stale preview row cannot be elevated after its server-time plan window is expired.
insert into public.lesson_booking_full_preview_cleanup_execution_manifest_previews(
  run_id,schema_version,retention_reviewed_at,source_plan_kind,
  plan_effective_generated_at,plan_effective_expires_at,manifest_state,
  prepared_by,prepared_at
)
select
  p.run_id,'smart_parrot_full_preview_cleanup_execution_manifest_preview_v1',
  p.retention_reviewed_at,'base_plan',p.generated_at,p.expires_at,'preview_only',
  '8c000000-0000-0000-0000-000000000041',p.generated_at + interval '1 hour'
from public.lesson_booking_full_preview_cleanup_review_plans p
where p.run_id='8c000000-0000-4000-8000-000000000401';

do $$
declare
  expired_manifest public.lesson_booking_full_preview_cleanup_execution_manifest_previews%rowtype;
  expired_blocked boolean := false;
begin
  select * into expired_manifest
  from public.lesson_booking_full_preview_cleanup_execution_manifest_previews
  where run_id='8c000000-0000-4000-8000-000000000401';

  begin
    perform public.service_attest_booking_full_preview_cleanup_execution_manifest(
      expired_manifest.run_id,
      expired_manifest.prepared_at,
      expired_manifest.plan_effective_expires_at
    );
  exception when invalid_parameter_value then
    expired_blocked := true;
  end;

  if not expired_blocked then
    raise exception 'Expired manifest generation unexpectedly received a service attestation';
  end if;
end $$;

do $$
declare
  update_blocked boolean := false;
begin
  if has_table_privilege('authenticated','public.lesson_booking_full_preview_cleanup_execution_attestations','SELECT') then
    raise exception 'Authenticated role unexpectedly has direct attestation table access';
  end if;
  if has_table_privilege('service_role','public.lesson_booking_full_preview_cleanup_execution_attestations','SELECT') then
    raise exception 'Service role unexpectedly has direct attestation table access';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.service_attest_booking_full_preview_cleanup_execution_manifest(uuid,timestamp with time zone,timestamp with time zone)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated role unexpectedly can mint cleanup execution attestations';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.service_attest_booking_full_preview_cleanup_execution_manifest(uuid,timestamp with time zone,timestamp with time zone)',
    'EXECUTE'
  ) then
    raise exception 'Service role is missing cleanup execution attestation RPC access';
  end if;

  begin
    update public.lesson_booking_full_preview_cleanup_execution_attestations
    set attestation_state='non_executable'
    where run_id='8c000000-0000-4000-8000-000000000400';
  exception when raise_exception then
    update_blocked := true;
  end;
  if not update_blocked then
    raise exception 'Append-only attestation row unexpectedly allowed UPDATE';
  end if;
end $$;

rollback;
