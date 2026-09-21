-- Phase 4C5N cleanup-plan lifecycle + execution-manifest preview scenarios. Ephemeral CI only.
begin;

insert into auth.users(id,raw_user_meta_data) values
  ('8c000000-0000-0000-0000-000000000031','{"full_name":"Phase4C5N Admin"}'),
  ('8c000000-0000-0000-0000-000000000032','{"full_name":"Phase4C5N Outsider"}');
update public.profiles set role='admin' where id='8c000000-0000-0000-0000-000000000031';

insert into public.lesson_booking_full_preview_runs(
  run_id,scenario,state,pause_reason,terminal,revision,last_booking_status,
  created_by,created_at,updated_at,last_observed_at,completed_at
) values
  ('8c000000-0000-4000-8000-000000000300','near_term_success','complete',null,true,2,'settled',
   '8c000000-0000-0000-0000-000000000031',statement_timestamp()-interval '43 days',statement_timestamp()-interval '42 days',statement_timestamp()-interval '42 days',statement_timestamp()-interval '42 days'),
  ('8c000000-0000-4000-8000-000000000301','near_term_success','complete',null,true,2,'settled',
   '8c000000-0000-0000-0000-000000000031',statement_timestamp()-interval '44 days',statement_timestamp()-interval '43 days',statement_timestamp()-interval '43 days',statement_timestamp()-interval '43 days'),
  ('8c000000-0000-4000-8000-000000000302','near_term_success','cancelled',null,true,2,'cancelled',
   '8c000000-0000-0000-0000-000000000031',statement_timestamp()-interval '45 days',statement_timestamp()-interval '44 days',statement_timestamp()-interval '44 days',statement_timestamp()-interval '44 days');

insert into public.lesson_booking_full_preview_terminal_evidence(
  run_id,schema_version,terminal_state,transcript_sha256,correlation_sha256,
  session_close_status,fixture_cleanup_status,reconciliation_required,recorded_by,recorded_at
) values
  ('8c000000-0000-4000-8000-000000000300','smart_parrot_full_preview_terminal_evidence_v1','complete',repeat('1',64),repeat('2',64),
   'fixture_sessions_closed','fixture_cleanup_complete',false,'8c000000-0000-0000-0000-000000000031',statement_timestamp()-interval '42 days'),
  ('8c000000-0000-4000-8000-000000000301','smart_parrot_full_preview_terminal_evidence_v1','complete',repeat('3',64),repeat('4',64),
   'fixture_sessions_closed','fixture_cleanup_complete',false,'8c000000-0000-0000-0000-000000000031',statement_timestamp()-interval '43 days'),
  ('8c000000-0000-4000-8000-000000000302','smart_parrot_full_preview_terminal_evidence_v1','cancelled',repeat('5',64),repeat('6',64),
   'fixture_sessions_closed','fixture_cleanup_complete',false,'8c000000-0000-0000-0000-000000000031',statement_timestamp()-interval '44 days');

create or replace function auth.uid() returns uuid language sql stable as $$
  select '8c000000-0000-0000-0000-000000000031'::uuid
$$;

do $$
declare
  review_300 jsonb;
  review_301 jsonb;
  review_302 jsonb;
begin
  select public.admin_record_booking_full_preview_retention_review(
    '8c000000-0000-4000-8000-000000000300','eligible_for_cleanup_review'
  ) into review_300;
  select public.admin_record_booking_full_preview_retention_review(
    '8c000000-0000-4000-8000-000000000301','eligible_for_cleanup_review'
  ) into review_301;
  select public.admin_record_booking_full_preview_retention_review(
    '8c000000-0000-4000-8000-000000000302','eligible_for_cleanup_review'
  ) into review_302;

  if review_300->>'basis_status' <> 'retention_review_due'
     or review_301->>'basis_status' <> 'retention_review_due'
     or review_302->>'basis_status' <> 'retention_review_due' then
    raise exception 'Unexpected Phase 4C5N retention review basis';
  end if;
end $$;

insert into public.lesson_booking_full_preview_cleanup_review_plans(
  run_id,schema_version,retention_reviewed_at,retention_review_decision,
  plan_state,generated_by,generated_at,expires_at
)
select
  rv.run_id,'smart_parrot_full_preview_cleanup_review_plan_v1',rv.reviewed_at,
  'eligible_for_cleanup_review','dry_run_only',
  '8c000000-0000-0000-0000-000000000031',
  case rv.run_id
    when '8c000000-0000-4000-8000-000000000300'::uuid then statement_timestamp()-interval '2 days'
    else statement_timestamp()-interval '1 hour'
  end,
  case rv.run_id
    when '8c000000-0000-4000-8000-000000000300'::uuid then statement_timestamp()-interval '1 day'
    else statement_timestamp()+interval '23 hours'
  end
from public.lesson_booking_full_preview_retention_reviews rv
where rv.run_id in (
  '8c000000-0000-4000-8000-000000000300'::uuid,
  '8c000000-0000-4000-8000-000000000301'::uuid,
  '8c000000-0000-4000-8000-000000000302'::uuid
);

do $$
declare
  reviewed_300 timestamptz;
  reviewed_301 timestamptz;
  reviewed_302 timestamptz;
  base_expiry_300 timestamptz;
  base_expiry_301 timestamptz;
  base_expiry_302 timestamptz;
  renewed jsonb;
  renewed_replay jsonb;
  manifest jsonb;
  manifest_replay jsonb;
  base_manifest jsonb;
  revoked jsonb;
  revoked_replay jsonb;
  stale_manifest_blocked boolean := false;
  active_renewal_blocked boolean := false;
  manifest_after_revoke_blocked boolean := false;
  renewal_after_revoke_blocked boolean := false;
  stale_review_blocked boolean := false;
  stale_expiry_blocked boolean := false;
  lifecycle_count integer;
  manifest_count integer;
begin
  select reviewed_at into reviewed_300
  from public.lesson_booking_full_preview_retention_reviews
  where run_id='8c000000-0000-4000-8000-000000000300';
  select reviewed_at into reviewed_301
  from public.lesson_booking_full_preview_retention_reviews
  where run_id='8c000000-0000-4000-8000-000000000301';
  select reviewed_at into reviewed_302
  from public.lesson_booking_full_preview_retention_reviews
  where run_id='8c000000-0000-4000-8000-000000000302';

  select expires_at into base_expiry_300
  from public.lesson_booking_full_preview_cleanup_review_plans
  where run_id='8c000000-0000-4000-8000-000000000300';
  select expires_at into base_expiry_301
  from public.lesson_booking_full_preview_cleanup_review_plans
  where run_id='8c000000-0000-4000-8000-000000000301';
  select expires_at into base_expiry_302
  from public.lesson_booking_full_preview_cleanup_review_plans
  where run_id='8c000000-0000-4000-8000-000000000302';

  select public.admin_renew_booking_full_preview_cleanup_review_plan(
    '8c000000-0000-4000-8000-000000000300',base_expiry_300,reviewed_300
  ) into renewed;

  if renewed->>'event_kind' <> 'renewed'
     or renewed->>'plan_status' <> 'active'
     or (renewed->>'replay')::boolean
     or (renewed->>'destructive_cleanup_authorized')::boolean
     or (renewed->>'cleanup_execution_enabled')::boolean
     or not (renewed->>'server_time_authoritative')::boolean then
    raise exception 'Unexpected Phase 4C5N renewal result: %', renewed;
  end if;

  select count(*) into lifecycle_count
  from public.lesson_booking_full_preview_cleanup_plan_lifecycle
  where run_id='8c000000-0000-4000-8000-000000000300';
  if lifecycle_count <> 2 then
    raise exception 'Expected expiry + renewal lifecycle events, got %', lifecycle_count;
  end if;

  select public.admin_renew_booking_full_preview_cleanup_review_plan(
    '8c000000-0000-4000-8000-000000000300',base_expiry_300,reviewed_300
  ) into renewed_replay;
  if not (renewed_replay->>'replay')::boolean
     or renewed_replay->>'effective_expires_at' <> renewed->>'effective_expires_at' then
    raise exception 'Renewal did not replay idempotently: %', renewed_replay;
  end if;

  begin
    perform public.admin_prepare_booking_full_preview_cleanup_execution_manifest_preview(
      '8c000000-0000-4000-8000-000000000300',base_expiry_300,reviewed_300
    );
  exception when invalid_parameter_value then
    stale_manifest_blocked := true;
  end;
  if not stale_manifest_blocked then
    raise exception 'Stale base-plan manifest was not rejected after renewal';
  end if;

  select public.admin_prepare_booking_full_preview_cleanup_execution_manifest_preview(
    '8c000000-0000-4000-8000-000000000300',
    (renewed->>'effective_expires_at')::timestamptz,
    reviewed_300
  ) into manifest;
  if manifest->>'manifest_state' <> 'preview_only'
     or manifest->>'source_plan_kind' <> 'renewal'
     or manifest->>'manifest_status' <> 'current'
     or (manifest->>'replay')::boolean
     or (manifest->>'destructive_cleanup_authorized')::boolean
     or (manifest->>'cleanup_execution_enabled')::boolean then
    raise exception 'Unexpected renewed manifest preview: %', manifest;
  end if;

  select public.admin_prepare_booking_full_preview_cleanup_execution_manifest_preview(
    '8c000000-0000-4000-8000-000000000300',
    (renewed->>'effective_expires_at')::timestamptz,
    reviewed_300
  ) into manifest_replay;
  if not (manifest_replay->>'replay')::boolean then
    raise exception 'Manifest preview did not replay idempotently: %', manifest_replay;
  end if;

  select count(*) into manifest_count
  from public.lesson_booking_full_preview_cleanup_execution_manifest_previews
  where run_id='8c000000-0000-4000-8000-000000000300';
  if manifest_count <> 1 then
    raise exception 'Expected exactly one immutable manifest preview for current generation, got %', manifest_count;
  end if;

  begin
    perform public.admin_renew_booking_full_preview_cleanup_review_plan(
      '8c000000-0000-4000-8000-000000000300',
      (renewed->>'effective_expires_at')::timestamptz,
      reviewed_300
    );
  exception when invalid_parameter_value then
    active_renewal_blocked := true;
  end;
  if not active_renewal_blocked then
    raise exception 'Active renewal was unexpectedly allowed';
  end if;

  select public.admin_prepare_booking_full_preview_cleanup_execution_manifest_preview(
    '8c000000-0000-4000-8000-000000000301',base_expiry_301,reviewed_301
  ) into base_manifest;
  if base_manifest->>'source_plan_kind' <> 'base_plan'
     or base_manifest->>'manifest_state' <> 'preview_only' then
    raise exception 'Unexpected base-plan manifest preview: %', base_manifest;
  end if;

  select public.admin_revoke_booking_full_preview_cleanup_review_plan(
    '8c000000-0000-4000-8000-000000000301',base_expiry_301,'preserve_override'
  ) into revoked;
  if revoked->>'event_kind' <> 'revoked'
     or revoked->>'reason_code' <> 'preserve_override'
     or (revoked->>'replay')::boolean
     or (revoked->>'cleanup_execution_enabled')::boolean then
    raise exception 'Unexpected revocation: %', revoked;
  end if;

  select public.admin_revoke_booking_full_preview_cleanup_review_plan(
    '8c000000-0000-4000-8000-000000000301',base_expiry_301,'preserve_override'
  ) into revoked_replay;
  if not (revoked_replay->>'replay')::boolean then
    raise exception 'Revocation did not replay idempotently: %', revoked_replay;
  end if;

  begin
    perform public.admin_prepare_booking_full_preview_cleanup_execution_manifest_preview(
      '8c000000-0000-4000-8000-000000000301',base_expiry_301,reviewed_301
    );
  exception when invalid_parameter_value then
    manifest_after_revoke_blocked := true;
  end;
  if not manifest_after_revoke_blocked then
    raise exception 'Revoked plan still produced an execution-manifest preview';
  end if;

  begin
    perform public.admin_renew_booking_full_preview_cleanup_review_plan(
      '8c000000-0000-4000-8000-000000000301',base_expiry_301,reviewed_301
    );
  exception when invalid_parameter_value then
    renewal_after_revoke_blocked := true;
  end;
  if not renewal_after_revoke_blocked then
    raise exception 'Revoked plan was unexpectedly renewable';
  end if;

  begin
    perform public.admin_prepare_booking_full_preview_cleanup_execution_manifest_preview(
      '8c000000-0000-4000-8000-000000000302',base_expiry_302,reviewed_302-interval '1 second'
    );
  exception when invalid_parameter_value then
    stale_review_blocked := true;
  end;
  if not stale_review_blocked then
    raise exception 'Stale retention review was not rejected for manifest preview';
  end if;

  begin
    perform public.admin_revoke_booking_full_preview_cleanup_review_plan(
      '8c000000-0000-4000-8000-000000000302',base_expiry_302+interval '1 hour','review_changed'
    );
  exception when invalid_parameter_value then
    stale_expiry_blocked := true;
  end;
  if not stale_expiry_blocked then
    raise exception 'Stale plan generation was not rejected for revocation';
  end if;

  select public.admin_revoke_booking_full_preview_cleanup_review_plan(
    '8c000000-0000-4000-8000-000000000302',base_expiry_302,'review_changed'
  ) into revoked;
  if revoked->>'reason_code' <> 'review_changed' then
    raise exception 'Review-change revocation reason was not preserved: %', revoked;
  end if;
end $$;

do $$
declare
  lifecycle_update_blocked boolean := false;
  manifest_update_blocked boolean := false;
begin
  if has_table_privilege('authenticated','public.lesson_booking_full_preview_cleanup_plan_lifecycle','SELECT') then
    raise exception 'Authenticated role unexpectedly has direct cleanup lifecycle table access';
  end if;
  if has_table_privilege('authenticated','public.lesson_booking_full_preview_cleanup_execution_manifest_previews','SELECT') then
    raise exception 'Authenticated role unexpectedly has direct cleanup manifest table access';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.admin_renew_booking_full_preview_cleanup_review_plan(uuid,timestamp with time zone,timestamp with time zone)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated role is missing guarded cleanup renewal RPC access';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.admin_revoke_booking_full_preview_cleanup_review_plan(uuid,timestamp with time zone,text)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated role is missing guarded cleanup revocation RPC access';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.admin_prepare_booking_full_preview_cleanup_execution_manifest_preview(uuid,timestamp with time zone,timestamp with time zone)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated role is missing guarded cleanup manifest RPC access';
  end if;

  begin
    update public.lesson_booking_full_preview_cleanup_plan_lifecycle
       set schema_version='smart_parrot_full_preview_cleanup_plan_lifecycle_v1'
     where run_id='8c000000-0000-4000-8000-000000000301';
  exception when others then
    lifecycle_update_blocked := true;
  end;
  if not lifecycle_update_blocked then
    raise exception 'Cleanup lifecycle audit was unexpectedly mutable';
  end if;

  begin
    update public.lesson_booking_full_preview_cleanup_execution_manifest_previews
       set manifest_state='preview_only'
     where run_id='8c000000-0000-4000-8000-000000000300';
  exception when others then
    manifest_update_blocked := true;
  end;
  if not manifest_update_blocked then
    raise exception 'Cleanup execution-manifest preview was unexpectedly mutable';
  end if;
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$
  select '8c000000-0000-0000-0000-000000000032'::uuid
$$;

do $$
declare
  reviewed_at timestamptz;
  expires_at timestamptz;
  renew_blocked boolean := false;
  revoke_blocked boolean := false;
  manifest_blocked boolean := false;
begin
  select rv.reviewed_at,p.expires_at into reviewed_at,expires_at
  from public.lesson_booking_full_preview_retention_reviews rv
  join public.lesson_booking_full_preview_cleanup_review_plans p on p.run_id=rv.run_id
  where rv.run_id='8c000000-0000-4000-8000-000000000302';

  begin
    perform public.admin_renew_booking_full_preview_cleanup_review_plan(
      '8c000000-0000-4000-8000-000000000302',expires_at,reviewed_at
    );
  exception when insufficient_privilege then
    renew_blocked := true;
  end;
  if not renew_blocked then raise exception 'Non-admin unexpectedly renewed cleanup plan'; end if;

  begin
    perform public.admin_revoke_booking_full_preview_cleanup_review_plan(
      '8c000000-0000-4000-8000-000000000302',expires_at,'manual_safety_hold'
    );
  exception when insufficient_privilege then
    revoke_blocked := true;
  end;
  if not revoke_blocked then raise exception 'Non-admin unexpectedly revoked cleanup plan'; end if;

  begin
    perform public.admin_prepare_booking_full_preview_cleanup_execution_manifest_preview(
      '8c000000-0000-4000-8000-000000000302',expires_at,reviewed_at
    );
  exception when insufficient_privilege then
    manifest_blocked := true;
  end;
  if not manifest_blocked then raise exception 'Non-admin unexpectedly prepared cleanup manifest preview'; end if;
end $$;

rollback;
