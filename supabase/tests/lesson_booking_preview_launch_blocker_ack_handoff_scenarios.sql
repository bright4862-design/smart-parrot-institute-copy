-- Phase 4C5Q launch-blocker acknowledgement/runbook evidence + minimized alert-delivery handoff.
-- Ephemeral CI only. No provider calls, notification delivery, launch, provider writes, browser time, or cleanup.
begin;

do $$
declare
  snapshot_one bigint;
  snapshot_two bigint;
  alert_one bigint;
  alert_two bigint;
  ack_one jsonb;
  ack_replay jsonb;
  ack_two jsonb;
  handoff_one jsonb;
  handoff_replay jsonb;
  handoff_two jsonb;
  ack_count integer;
  handoff_count integer;
  handoff_key_count integer;
  conflict_blocked boolean := false;
  stale_ack_blocked boolean := false;
  stale_handoff_blocked boolean := false;
  semantic_mismatch_blocked boolean := false;
  mutation_blocked boolean := false;
begin
  insert into public.lesson_booking_preview_launch_blocker_snapshots(
    schema_version,state_fingerprint,status,schema_function_ready,
    provider_secret_bundle_ready,preview_project_identity_ready,stripe_account_identity_ready,
    daily_webhook_identity_ready,stripe_checkout_signed_recent,stripe_dispute_signed_recent,
    daily_signed_endpoint_ready,provider_rehearsal_recent,fixture_principals_ready,
    ephemeral_sessions_ready,provider_e2e_gate_open,worker_write_gate_open,
    unresolved_provider_cleanup_count,unresolved_terminal_reconciliation_count,
    missing_terminal_evidence_count,blocker_codes,captured_at
  ) values (
    'smart_parrot_booking_preview_launch_blocker_snapshot_v1',repeat('a',32),'blocked',true,
    false,true,true,true,true,true,true,true,true,true,true,true,
    0,0,0,array['provider_secret_bundle_missing']::text[],statement_timestamp()-interval '2 minutes'
  ) returning snapshot_id into snapshot_one;

  insert into public.lesson_booking_preview_launch_blocker_alerts(
    schema_version,snapshot_id,previous_snapshot_id,change_kind,previous_status,current_status,blocker_codes,recorded_at
  ) values (
    'smart_parrot_booking_preview_launch_blocker_alert_v1',snapshot_one,null,'initial_state',null,'blocked',
    array['provider_secret_bundle_missing']::text[],statement_timestamp()-interval '1 minute'
  ) returning alert_id into alert_one;

  select public.service_record_booking_preview_launch_blocker_acknowledgement(
    snapshot_one,'provider_configuration_required'
  ) into ack_one;

  if (ack_one->>'snapshot_id')::bigint <> snapshot_one
     or (ack_one->>'alert_id')::bigint <> alert_one
     or ack_one->>'decision' <> 'provider_configuration_required'
     or ack_one->>'severity' <> 'warning'
     or (ack_one->>'replay')::boolean
     or (ack_one->>'acknowledgement_suppresses_blocker')::boolean
     or (ack_one->>'provider_write_authorized')::boolean
     or (ack_one->>'booking_launch_authorized')::boolean
     or (ack_one->>'destructive_cleanup_authorized')::boolean
     or not (ack_one->>'server_time_authoritative')::boolean then
    raise exception 'Phase 4C5Q acknowledgement crossed an authority boundary: %', ack_one;
  end if;

  select public.service_record_booking_preview_launch_blocker_acknowledgement(
    snapshot_one,'provider_configuration_required'
  ) into ack_replay;

  if not (ack_replay->>'replay')::boolean
     or (ack_replay->>'acknowledgement_id')::bigint <> (ack_one->>'acknowledgement_id')::bigint
     or ack_replay->>'acknowledged_at' <> ack_one->>'acknowledged_at' then
    raise exception 'Phase 4C5Q duplicate acknowledgement was not idempotent: first %, replay %', ack_one, ack_replay;
  end if;

  begin
    perform public.service_record_booking_preview_launch_blocker_acknowledgement(snapshot_one,'investigate');
  exception when unique_violation then
    conflict_blocked := true;
  end;
  if not conflict_blocked then
    raise exception 'Phase 4C5Q conflicting duplicate acknowledgement was not rejected';
  end if;

  select public.service_prepare_booking_preview_launch_blocker_alert_handoff(snapshot_one)
  into handoff_one;
  select public.service_prepare_booking_preview_launch_blocker_alert_handoff(snapshot_one)
  into handoff_replay;

  if handoff_one <> handoff_replay then
    raise exception 'Phase 4C5Q repeated handoff preparation must replay the exact minimized artifact';
  end if;
  if (handoff_one->>'snapshot_id')::bigint <> snapshot_one
     or (handoff_one->>'alert_id')::bigint <> alert_one
     or handoff_one->>'severity' <> 'warning'
     or handoff_one ? 'provider_write_authorized'
     or handoff_one ? 'booking_launch_authorized'
     or handoff_one ? 'destructive_cleanup_authorized'
     or handoff_one ? 'notifier_delivery_authorized'
     or handoff_one ? 'decision'
     or handoff_one ? 'actor_id'
     or handoff_one ? 'provider_object_id'
     or handoff_one ? 'webhook_secret'
     or handoff_one ? 'token'
     or handoff_one ? 'payment_data' then
    raise exception 'Phase 4C5Q minimized handoff leaked authority or sensitive fields: %', handoff_one;
  end if;
  select count(*)::integer into handoff_key_count from pg_catalog.jsonb_object_keys(handoff_one);
  if handoff_key_count <> 7 then
    raise exception 'Phase 4C5Q handoff must contain exactly seven minimized fields, got %: %', handoff_key_count, handoff_one;
  end if;

  select count(*)::integer into ack_count
  from public.lesson_booking_preview_launch_blocker_acknowledgements;
  select count(*)::integer into handoff_count
  from public.lesson_booking_preview_launch_blocker_delivery_handoffs;
  if ack_count <> 1 or handoff_count <> 1 then
    raise exception 'Phase 4C5Q duplicate replay created durable duplicates: ack %, handoff %', ack_count, handoff_count;
  end if;

  insert into public.lesson_booking_preview_launch_blocker_snapshots(
    schema_version,state_fingerprint,status,schema_function_ready,
    provider_secret_bundle_ready,preview_project_identity_ready,stripe_account_identity_ready,
    daily_webhook_identity_ready,stripe_checkout_signed_recent,stripe_dispute_signed_recent,
    daily_signed_endpoint_ready,provider_rehearsal_recent,fixture_principals_ready,
    ephemeral_sessions_ready,provider_e2e_gate_open,worker_write_gate_open,
    unresolved_provider_cleanup_count,unresolved_terminal_reconciliation_count,
    missing_terminal_evidence_count,blocker_codes,captured_at
  ) values (
    'smart_parrot_booking_preview_launch_blocker_snapshot_v1',repeat('b',32),'blocked',true,
    true,true,true,true,true,true,true,false,true,true,true,true,
    0,0,0,array['provider_rehearsal_stale_or_missing']::text[],statement_timestamp()
  ) returning snapshot_id into snapshot_two;

  insert into public.lesson_booking_preview_launch_blocker_alerts(
    schema_version,snapshot_id,previous_snapshot_id,change_kind,previous_status,current_status,blocker_codes,recorded_at
  ) values (
    'smart_parrot_booking_preview_launch_blocker_alert_v1',snapshot_two,snapshot_one,'blockers_changed','blocked','blocked',
    array['provider_rehearsal_stale_or_missing']::text[],statement_timestamp()
  ) returning alert_id into alert_two;

  begin
    perform public.service_record_booking_preview_launch_blocker_acknowledgement(snapshot_one,'provider_configuration_required');
  exception when serialization_failure then
    stale_ack_blocked := true;
  end;
  if not stale_ack_blocked then
    raise exception 'Phase 4C5Q stale acknowledgement claim was not rejected';
  end if;

  begin
    perform public.service_prepare_booking_preview_launch_blocker_alert_handoff(snapshot_one);
  exception when serialization_failure then
    stale_handoff_blocked := true;
  end;
  if not stale_handoff_blocked then
    raise exception 'Phase 4C5Q stale handoff claim was not rejected';
  end if;

  begin
    perform public.service_record_booking_preview_launch_blocker_acknowledgement(snapshot_two,'provider_configuration_required');
  exception when invalid_parameter_value then
    semantic_mismatch_blocked := true;
  end;
  if not semantic_mismatch_blocked then
    raise exception 'Phase 4C5Q unsupported runbook decision was not rejected for current blockers';
  end if;

  select public.service_record_booking_preview_launch_blocker_acknowledgement(snapshot_two,'rehearsal_required')
  into ack_two;
  select public.service_prepare_booking_preview_launch_blocker_alert_handoff(snapshot_two)
  into handoff_two;
  if (ack_two->>'alert_id')::bigint <> alert_two
     or (handoff_two->>'alert_id')::bigint <> alert_two
     or ack_two->>'decision' <> 'rehearsal_required' then
    raise exception 'Phase 4C5Q latest snapshot/alert correlation failed: ack %, handoff %', ack_two, handoff_two;
  end if;

  begin
    update public.lesson_booking_preview_launch_blocker_acknowledgements
    set severity=severity
    where snapshot_id=snapshot_two;
  exception when others then
    mutation_blocked := true;
  end;
  if not mutation_blocked then
    raise exception 'Phase 4C5Q acknowledgement evidence is not append-only';
  end if;
end $$;

do $$
declare
  mutation_blocked boolean := false;
begin
  begin
    delete from public.lesson_booking_preview_launch_blocker_delivery_handoffs where false;
    update public.lesson_booking_preview_launch_blocker_delivery_handoffs set severity=severity;
  exception when others then
    mutation_blocked := true;
  end;
  if not mutation_blocked then
    raise exception 'Phase 4C5Q handoff evidence is not append-only';
  end if;
end $$;

do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.service_record_booking_preview_launch_blocker_acknowledgement(bigint,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.service_prepare_booking_preview_launch_blocker_alert_handoff(bigint)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must not execute Phase 4C5Q service RPCs';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.service_record_booking_preview_launch_blocker_acknowledgement(bigint,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.service_prepare_booking_preview_launch_blocker_alert_handoff(bigint)',
    'EXECUTE'
  ) then
    raise exception 'service_role must execute both Phase 4C5Q service RPCs';
  end if;

  if has_table_privilege('authenticated','public.lesson_booking_preview_launch_blocker_acknowledgements','SELECT')
     or has_table_privilege('service_role','public.lesson_booking_preview_launch_blocker_acknowledgements','SELECT')
     or has_table_privilege('authenticated','public.lesson_booking_preview_launch_blocker_delivery_handoffs','SELECT')
     or has_table_privilege('service_role','public.lesson_booking_preview_launch_blocker_delivery_handoffs','SELECT') then
    raise exception 'Phase 4C5Q evidence tables must remain RPC-only';
  end if;
end $$;

rollback;
