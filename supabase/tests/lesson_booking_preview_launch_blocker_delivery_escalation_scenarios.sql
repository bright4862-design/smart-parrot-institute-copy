-- Phase 4C5R trusted-notifier delivery attempt/receipt + escalation observations.
-- Ephemeral CI only. No external notifier, provider call, Cron sender, launch, cleanup, or caller time.
begin;

do $$
declare
  snapshot_one bigint;
  snapshot_two bigint;
  alert_one bigint;
  alert_two bigint;
  handoff_one_id bigint;
  receipt_prepared jsonb;
  receipt_prepared_replay jsonb;
  receipt_deferred jsonb;
  receipt_deferred_replay jsonb;
  escalation_overdue jsonb;
  escalation_overdue_replay jsonb;
  escalation_fresh jsonb;
  prepared_two jsonb;
  receipt_count integer;
  observation_count integer;
  delivered_blocked boolean := false;
  terminal_conflict_blocked boolean := false;
  stale_receipt_blocked boolean := false;
  stale_escalation_blocked boolean := false;
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
    'smart_parrot_booking_preview_launch_blocker_snapshot_v1',repeat('c',32),'blocked',true,
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
  select handoff_id into handoff_one_id
  from public.lesson_booking_preview_launch_blocker_delivery_handoffs
  where snapshot_id=snapshot_one;

  select public.service_record_booking_preview_launch_blocker_delivery_receipt(snapshot_one,'prepared')
  into receipt_prepared;
  select public.service_record_booking_preview_launch_blocker_delivery_receipt(snapshot_one,'prepared')
  into receipt_prepared_replay;

  if receipt_prepared->>'outcome' <> 'prepared'
     or (receipt_prepared->>'replay')::boolean
     or not (receipt_prepared_replay->>'replay')::boolean
     or receipt_prepared_replay->>'receipt_id' <> receipt_prepared->>'receipt_id'
     or receipt_prepared_replay->>'recorded_at' <> receipt_prepared->>'recorded_at'
     or length(receipt_prepared->>'delivery_key') <> 32
     or (receipt_prepared->>'outcome_suppresses_blocker')::boolean
     or (receipt_prepared->>'notifier_send_authorized')::boolean
     or (receipt_prepared->>'provider_write_authorized')::boolean
     or (receipt_prepared->>'booking_launch_authorized')::boolean
     or (receipt_prepared->>'destructive_cleanup_authorized')::boolean
     or not (receipt_prepared->>'server_time_authoritative')::boolean then
    raise exception 'Phase 4C5R prepared receipt crossed an authority/idempotency boundary: first %, replay %', receipt_prepared, receipt_prepared_replay;
  end if;

  begin
    perform public.service_record_booking_preview_launch_blocker_delivery_receipt(snapshot_one,'delivered');
  exception when invalid_parameter_value then
    delivered_blocked := true;
  end;
  if not delivered_blocked then
    raise exception 'Phase 4C5R forged delivered claim was not rejected';
  end if;

  select public.service_record_booking_preview_launch_blocker_delivery_receipt(snapshot_one,'deferred')
  into receipt_deferred;
  select public.service_record_booking_preview_launch_blocker_delivery_receipt(snapshot_one,'deferred')
  into receipt_deferred_replay;
  if receipt_deferred->>'outcome' <> 'deferred'
     or not (receipt_deferred_replay->>'replay')::boolean
     or receipt_deferred_replay->>'receipt_id' <> receipt_deferred->>'receipt_id'
     or receipt_deferred->>'delivery_key' <> receipt_prepared->>'delivery_key' then
    raise exception 'Phase 4C5R deferred receipt retry did not converge: first %, replay %', receipt_deferred, receipt_deferred_replay;
  end if;

  begin
    perform public.service_record_booking_preview_launch_blocker_delivery_receipt(snapshot_one,'failed');
  exception when unique_violation then
    terminal_conflict_blocked := true;
  end;
  if not terminal_conflict_blocked then
    raise exception 'Phase 4C5R conflicting terminal delivery outcome was not rejected';
  end if;

  select public.service_observe_booking_preview_launch_blocker_escalation(snapshot_one)
  into escalation_overdue;
  select public.service_observe_booking_preview_launch_blocker_escalation(snapshot_one)
  into escalation_overdue_replay;
  if escalation_overdue->>'age_class' <> 'overdue'
     or escalation_overdue->>'escalation_class' <> 'urgent'
     or escalation_overdue->>'severity' <> 'warning'
     or (escalation_overdue->>'replay')::boolean
     or not (escalation_overdue_replay->>'replay')::boolean
     or escalation_overdue_replay->>'observation_id' <> escalation_overdue->>'observation_id'
     or not (escalation_overdue->>'blocker_unresolved')::boolean
     or (escalation_overdue->>'automatic_notification_authorized')::boolean
     or (escalation_overdue->>'outcome_suppresses_blocker')::boolean
     or (escalation_overdue->>'provider_write_authorized')::boolean
     or (escalation_overdue->>'booking_launch_authorized')::boolean
     or (escalation_overdue->>'destructive_cleanup_authorized')::boolean
     or not (escalation_overdue->>'server_time_authoritative')::boolean then
    raise exception 'Phase 4C5R overdue escalation crossed a boundary: first %, replay %', escalation_overdue, escalation_overdue_replay;
  end if;

  select count(*)::integer into receipt_count
  from public.lesson_booking_preview_launch_blocker_delivery_receipts
  where handoff_id=handoff_one_id;
  select count(*)::integer into observation_count
  from public.lesson_booking_preview_launch_blocker_escalation_observations
  where handoff_id=handoff_one_id;
  if receipt_count <> 2 or observation_count <> 1 then
    raise exception 'Phase 4C5R retries created durable duplicates: receipts %, observations %', receipt_count, observation_count;
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
    'smart_parrot_booking_preview_launch_blocker_snapshot_v1',repeat('d',32),'blocked',true,
    true,true,true,true,true,true,true,true,true,true,true,true,
    0,0,1,array['terminal_evidence_missing']::text[],statement_timestamp()
  ) returning snapshot_id into snapshot_two;

  insert into public.lesson_booking_preview_launch_blocker_alerts(
    schema_version,snapshot_id,previous_snapshot_id,change_kind,previous_status,current_status,blocker_codes,recorded_at
  ) values (
    'smart_parrot_booking_preview_launch_blocker_alert_v1',snapshot_two,snapshot_one,'blockers_changed','blocked','blocked',
    array['terminal_evidence_missing']::text[],statement_timestamp()
  ) returning alert_id into alert_two;

  perform public.service_prepare_booking_preview_launch_blocker_alert_handoff(snapshot_two);
  select public.service_record_booking_preview_launch_blocker_delivery_receipt(snapshot_two,'prepared')
  into prepared_two;
  select public.service_observe_booking_preview_launch_blocker_escalation(snapshot_two)
  into escalation_fresh;

  if (prepared_two->>'alert_id')::bigint <> alert_two
     or escalation_fresh->>'severity' <> 'critical'
     or escalation_fresh->>'age_class' <> 'fresh'
     or escalation_fresh->>'escalation_class' <> 'review' then
    raise exception 'Phase 4C5R latest critical blocker correlation/escalation failed: receipt %, escalation %', prepared_two, escalation_fresh;
  end if;

  begin
    perform public.service_record_booking_preview_launch_blocker_delivery_receipt(snapshot_one,'prepared');
  exception when serialization_failure then
    stale_receipt_blocked := true;
  end;
  if not stale_receipt_blocked then
    raise exception 'Phase 4C5R stale receipt claim was not rejected';
  end if;

  begin
    perform public.service_observe_booking_preview_launch_blocker_escalation(snapshot_one);
  exception when serialization_failure then
    stale_escalation_blocked := true;
  end;
  if not stale_escalation_blocked then
    raise exception 'Phase 4C5R stale escalation observation was not rejected';
  end if;

  begin
    update public.lesson_booking_preview_launch_blocker_delivery_receipts
    set severity=severity
    where snapshot_id=snapshot_two;
  exception when others then
    mutation_blocked := true;
  end;
  if not mutation_blocked then
    raise exception 'Phase 4C5R delivery receipts are not append-only';
  end if;
end $$;

do $$
declare
  mutation_blocked boolean := false;
begin
  begin
    update public.lesson_booking_preview_launch_blocker_escalation_observations set severity=severity;
  exception when others then
    mutation_blocked := true;
  end;
  if not mutation_blocked then
    raise exception 'Phase 4C5R escalation observations are not append-only';
  end if;
end $$;

do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.service_record_booking_preview_launch_blocker_delivery_receipt(bigint,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.service_observe_booking_preview_launch_blocker_escalation(bigint)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must not execute Phase 4C5R service RPCs';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.service_record_booking_preview_launch_blocker_delivery_receipt(bigint,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.service_observe_booking_preview_launch_blocker_escalation(bigint)',
    'EXECUTE'
  ) then
    raise exception 'service_role must execute both Phase 4C5R service RPCs';
  end if;

  if has_table_privilege('authenticated','public.lesson_booking_preview_launch_blocker_delivery_receipts','SELECT')
     or has_table_privilege('service_role','public.lesson_booking_preview_launch_blocker_delivery_receipts','SELECT')
     or has_table_privilege('authenticated','public.lesson_booking_preview_launch_blocker_escalation_observations','SELECT')
     or has_table_privilege('service_role','public.lesson_booking_preview_launch_blocker_escalation_observations','SELECT') then
    raise exception 'Phase 4C5R evidence tables must remain RPC-only';
  end if;
end $$;

rollback;
