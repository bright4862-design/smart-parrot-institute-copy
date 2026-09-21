-- Phase 4C5S trusted notifier proof adapter + minimized escalation queue.
-- Ephemeral CI only. No external notifier/provider call, Cron sender, launch, cleanup, or caller time.
begin;

do $$
declare
  snapshot_one bigint;
  snapshot_two bigint;
  alert_one bigint;
  alert_two bigint;
  prepared_one jsonb;
  proof_one jsonb;
  proof_one_replay jsonb;
  queue_one jsonb;
  queue_one_replay jsonb;
  queue_two jsonb;
  proof_count integer;
  queue_count integer;
  proof_conflict_blocked boolean := false;
  terminal_conflict_blocked boolean := false;
  stale_proof_blocked boolean := false;
  stale_queue_blocked boolean := false;
  proof_mutation_blocked boolean := false;
  queue_mutation_blocked boolean := false;
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
    'smart_parrot_booking_preview_launch_blocker_snapshot_v1',repeat('e',32),'blocked',true,
    false,true,true,true,true,true,true,true,true,true,true,true,
    0,0,0,array['provider_secret_bundle_missing']::text[],statement_timestamp()-interval '2 hours'
  ) returning snapshot_id into snapshot_one;

  insert into public.lesson_booking_preview_launch_blocker_alerts(
    schema_version,snapshot_id,previous_snapshot_id,change_kind,previous_status,current_status,blocker_codes,recorded_at
  ) values (
    'smart_parrot_booking_preview_launch_blocker_alert_v1',snapshot_one,null,'initial_state',null,'blocked',
    array['provider_secret_bundle_missing']::text[],statement_timestamp()-interval '2 hours'
  ) returning alert_id into alert_one;

  perform public.service_prepare_booking_preview_launch_blocker_alert_handoff(snapshot_one);
  select public.service_record_booking_preview_launch_blocker_delivery_receipt(snapshot_one,'prepared')
  into prepared_one;

  select public.service_record_booking_preview_launch_blocker_trusted_delivery_proof(
    snapshot_one,
    prepared_one->>'delivery_key',
    'message_id_hash',
    repeat('a',64)
  ) into proof_one;
  select public.service_record_booking_preview_launch_blocker_trusted_delivery_proof(
    snapshot_one,
    prepared_one->>'delivery_key',
    'message_id_hash',
    repeat('a',64)
  ) into proof_one_replay;

  if (proof_one->>'trusted_notifier_proof_accepted')::boolean is not true
     or (proof_one->>'replay')::boolean
     or not (proof_one_replay->>'replay')::boolean
     or proof_one_replay->>'proof_id' <> proof_one->>'proof_id'
     or proof_one_replay->>'delivered_receipt_id' <> proof_one->>'delivered_receipt_id'
     or proof_one->>'delivery_key' <> prepared_one->>'delivery_key'
     or proof_one->>'proof_hash' <> repeat('a',64)
     or (proof_one->>'outcome_suppresses_blocker')::boolean
     or (proof_one->>'notifier_send_authorized')::boolean
     or (proof_one->>'provider_write_authorized')::boolean
     or (proof_one->>'booking_launch_authorized')::boolean
     or (proof_one->>'destructive_cleanup_authorized')::boolean
     or not (proof_one->>'server_time_authoritative')::boolean then
    raise exception 'Phase 4C5S proof replay/authority boundary failed: first %, replay %', proof_one, proof_one_replay;
  end if;

  if not exists (
    select 1 from public.lesson_booking_preview_launch_blocker_delivery_receipts r
    where r.receipt_id=(proof_one->>'delivered_receipt_id')::bigint
      and r.outcome='delivered'
      and r.delivery_key=prepared_one->>'delivery_key'
  ) then
    raise exception 'Phase 4C5S accepted proof did not create exact delivered receipt';
  end if;

  begin
    perform public.service_record_booking_preview_launch_blocker_trusted_delivery_proof(
      snapshot_one,prepared_one->>'delivery_key','message_id_hash',repeat('b',64)
    );
  exception when unique_violation then
    proof_conflict_blocked := true;
  end;
  if not proof_conflict_blocked then
    raise exception 'Phase 4C5S conflicting proof hash was not rejected';
  end if;

  begin
    perform public.service_record_booking_preview_launch_blocker_delivery_receipt(snapshot_one,'failed');
  exception when unique_violation then
    terminal_conflict_blocked := true;
  end;
  if not terminal_conflict_blocked then
    raise exception 'Phase 4C5S delivered proof did not close the terminal receipt boundary';
  end if;

  select public.service_prepare_booking_preview_launch_blocker_escalation_queue(snapshot_one)
  into queue_one;
  select public.service_prepare_booking_preview_launch_blocker_escalation_queue(snapshot_one)
  into queue_one_replay;
  if not (queue_one->>'queue_required')::boolean
     or queue_one->>'age_class' <> 'overdue'
     or queue_one->>'escalation_class' <> 'urgent'
     or queue_one->>'severity' <> 'warning'
     or (queue_one->>'blocker_count')::integer <> 1
     or queue_one->>'delivery_key' <> prepared_one->>'delivery_key'
     or (queue_one->>'replay')::boolean
     or not (queue_one_replay->>'replay')::boolean
     or queue_one_replay->>'queue_item_id' <> queue_one->>'queue_item_id'
     or (queue_one->>'automatic_notification_authorized')::boolean
     or (queue_one->>'outcome_suppresses_blocker')::boolean
     or (queue_one->>'provider_write_authorized')::boolean
     or (queue_one->>'booking_launch_authorized')::boolean
     or (queue_one->>'destructive_cleanup_authorized')::boolean
     or not (queue_one->>'server_time_authoritative')::boolean then
    raise exception 'Phase 4C5S queue replay/minimization boundary failed: first %, replay %', queue_one, queue_one_replay;
  end if;

  select count(*)::integer into proof_count
  from public.lesson_booking_preview_launch_blocker_notifier_proofs
  where snapshot_id=snapshot_one;
  select count(*)::integer into queue_count
  from public.lesson_booking_preview_launch_blocker_escalation_queue
  where snapshot_id=snapshot_one;
  if proof_count <> 1 or queue_count <> 1 then
    raise exception 'Phase 4C5S retries created durable duplicates: proofs %, queue %', proof_count, queue_count;
  end if;

  begin
    update public.lesson_booking_preview_launch_blocker_notifier_proofs set proof_kind=proof_kind;
  exception when others then
    proof_mutation_blocked := true;
  end;
  if not proof_mutation_blocked then
    raise exception 'Phase 4C5S notifier proofs are not append-only';
  end if;

  begin
    update public.lesson_booking_preview_launch_blocker_escalation_queue set severity=severity;
  exception when others then
    queue_mutation_blocked := true;
  end;
  if not queue_mutation_blocked then
    raise exception 'Phase 4C5S escalation queue is not append-only';
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
    'smart_parrot_booking_preview_launch_blocker_snapshot_v1',repeat('f',32),'blocked',true,
    false,true,true,true,true,true,true,true,true,true,true,true,
    0,0,0,array['provider_secret_bundle_missing']::text[],statement_timestamp()
  ) returning snapshot_id into snapshot_two;

  insert into public.lesson_booking_preview_launch_blocker_alerts(
    schema_version,snapshot_id,previous_snapshot_id,change_kind,previous_status,current_status,blocker_codes,recorded_at
  ) values (
    'smart_parrot_booking_preview_launch_blocker_alert_v1',snapshot_two,snapshot_one,'blockers_changed','blocked','blocked',
    array['provider_secret_bundle_missing']::text[],statement_timestamp()
  ) returning alert_id into alert_two;
  perform public.service_prepare_booking_preview_launch_blocker_alert_handoff(snapshot_two);

  select public.service_prepare_booking_preview_launch_blocker_escalation_queue(snapshot_two)
  into queue_two;
  if (queue_two->>'queue_required')::boolean
     or queue_two->>'queue_item_id' is not null
     or queue_two->>'queued_at' is not null
     or queue_two->>'age_class' <> 'fresh'
     or queue_two->>'escalation_class' <> 'none' then
    raise exception 'Phase 4C5S fresh warning should not create queue work: %', queue_two;
  end if;

  begin
    perform public.service_record_booking_preview_launch_blocker_trusted_delivery_proof(
      snapshot_one,prepared_one->>'delivery_key','message_id_hash',repeat('a',64)
    );
  exception when serialization_failure then
    stale_proof_blocked := true;
  end;
  if not stale_proof_blocked then
    raise exception 'Phase 4C5S stale trusted proof was not rejected';
  end if;

  begin
    perform public.service_prepare_booking_preview_launch_blocker_escalation_queue(snapshot_one);
  exception when serialization_failure then
    stale_queue_blocked := true;
  end;
  if not stale_queue_blocked then
    raise exception 'Phase 4C5S stale escalation queue request was not rejected';
  end if;
end $$;

do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.service_record_booking_preview_launch_blocker_trusted_delivery_proof(bigint,text,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.service_prepare_booking_preview_launch_blocker_escalation_queue(bigint)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must not execute Phase 4C5S service RPCs';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.service_record_booking_preview_launch_blocker_trusted_delivery_proof(bigint,text,text,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.service_prepare_booking_preview_launch_blocker_escalation_queue(bigint)',
    'EXECUTE'
  ) then
    raise exception 'service_role must execute both Phase 4C5S service RPCs';
  end if;

  if has_table_privilege('authenticated','public.lesson_booking_preview_launch_blocker_notifier_proofs','SELECT')
     or has_table_privilege('service_role','public.lesson_booking_preview_launch_blocker_notifier_proofs','SELECT')
     or has_table_privilege('authenticated','public.lesson_booking_preview_launch_blocker_escalation_queue','SELECT')
     or has_table_privilege('service_role','public.lesson_booking_preview_launch_blocker_escalation_queue','SELECT') then
    raise exception 'Phase 4C5S evidence tables must remain RPC-only';
  end if;
end $$;

rollback;
