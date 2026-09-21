-- Phase 4C5T minimized escalation claim/lease + retry/dead-letter evidence.
-- Ephemeral CI only. No external notifier/provider call, Cron sender, launch, cleanup, or caller-authoritative time.
begin;

do $$
declare
  snapshot_one bigint;
  snapshot_two bigint;
  snapshot_three bigint;
  alert_one bigint;
  alert_two bigint;
  alert_three bigint;
  queue_one jsonb;
  queue_two jsonb;
  queue_three jsonb;
  claim_one jsonb;
  claim_one_replay jsonb;
  retry_one jsonb;
  retry_one_replay jsonb;
  claim_five jsonb;
  dead_five jsonb;
  dead_five_replay jsonb;
  claim_release jsonb;
  release_one jsonb;
  release_one_replay jsonb;
  reclaim_after_release jsonb;
  inspection jsonb;
  concurrent_claim_blocked boolean := false;
  retry_not_ready_blocked boolean := false;
  closed_claim_key_blocked boolean := false;
  early_exhaustion_blocked boolean := false;
  dead_letter_reclaim_blocked boolean := false;
  stale_queue_blocked boolean := false;
  event_mutation_blocked boolean := false;
  queue_two_id bigint;
  queue_three_id bigint;
  k1 text := repeat('1',32);
  k2 text := repeat('2',32);
  k3 text := repeat('3',32);
  k4 text := repeat('4',32);
  k5 text := repeat('5',32);
  k6 text := repeat('6',32);
  k7 text := repeat('7',32);
  k8 text := repeat('8',32);
  k9 text := repeat('9',32);
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
    0,0,0,array['provider_secret_bundle_missing']::text[],statement_timestamp()-interval '2 hours'
  ) returning snapshot_id into snapshot_one;

  insert into public.lesson_booking_preview_launch_blocker_alerts(
    schema_version,snapshot_id,previous_snapshot_id,change_kind,previous_status,current_status,blocker_codes,recorded_at
  ) values (
    'smart_parrot_booking_preview_launch_blocker_alert_v1',snapshot_one,null,'initial_state',null,'blocked',
    array['provider_secret_bundle_missing']::text[],statement_timestamp()-interval '2 hours'
  ) returning alert_id into alert_one;
  perform public.service_prepare_booking_preview_launch_blocker_alert_handoff(snapshot_one);
  select public.service_prepare_booking_preview_launch_blocker_escalation_queue(snapshot_one) into queue_one;

  select public.service_claim_booking_preview_launch_blocker_escalation_work(
    (queue_one->>'queue_item_id')::bigint,k1,60
  ) into claim_one;
  select public.service_claim_booking_preview_launch_blocker_escalation_work(
    (queue_one->>'queue_item_id')::bigint,k1,60
  ) into claim_one_replay;

  if claim_one->>'work_state' <> 'leased'
     or not (claim_one->>'lease_active')::boolean
     or (claim_one->>'attempt_no')::integer <> 1
     or (claim_one->>'lease_seconds')::integer <> 60
     or (claim_one->>'replay')::boolean
     or not (claim_one_replay->>'replay')::boolean
     or claim_one_replay->>'event_id' <> claim_one->>'event_id'
     or (claim_one->>'notifier_send_authorized')::boolean
     or (claim_one->>'automatic_notification_authorized')::boolean
     or (claim_one->>'provider_write_authorized')::boolean
     or (claim_one->>'booking_launch_authorized')::boolean
     or (claim_one->>'destructive_cleanup_authorized')::boolean
     or not (claim_one->>'server_time_authoritative')::boolean then
    raise exception 'Phase 4C5T claim replay/authority boundary failed: first %, replay %', claim_one, claim_one_replay;
  end if;

  begin
    perform public.service_claim_booking_preview_launch_blocker_escalation_work(
      (queue_one->>'queue_item_id')::bigint,k2,60
    );
  exception when lock_not_available then
    concurrent_claim_blocked := true;
  end;
  if not concurrent_claim_blocked then
    raise exception 'Phase 4C5T concurrent active lease was not rejected';
  end if;

  select public.service_transition_booking_preview_launch_blocker_escalation_work(
    (queue_one->>'queue_item_id')::bigint,k1,'retry','transient_failure'
  ) into retry_one;
  select public.service_transition_booking_preview_launch_blocker_escalation_work(
    (queue_one->>'queue_item_id')::bigint,k1,'retry','transient_failure'
  ) into retry_one_replay;
  if retry_one->>'work_state' <> 'retry_wait'
     or retry_one->>'reason_code' <> 'transient_failure'
     or retry_one->>'next_eligible_at' is null
     or (retry_one->>'replay')::boolean
     or not (retry_one_replay->>'replay')::boolean
     or retry_one_replay->>'event_id' <> retry_one->>'event_id' then
    raise exception 'Phase 4C5T retry replay/backoff boundary failed: first %, replay %', retry_one, retry_one_replay;
  end if;

  begin
    perform public.service_claim_booking_preview_launch_blocker_escalation_work(
      (queue_one->>'queue_item_id')::bigint,k2,60
    );
  exception when object_not_in_prerequisite_state then
    retry_not_ready_blocked := true;
  end;
  if not retry_not_ready_blocked then
    raise exception 'Phase 4C5T retry backoff was not enforced';
  end if;

  begin
    perform public.service_claim_booking_preview_launch_blocker_escalation_work(
      (queue_one->>'queue_item_id')::bigint,k1,60
    );
  exception when object_not_in_prerequisite_state then
    closed_claim_key_blocked := true;
  end;
  if not closed_claim_key_blocked then
    raise exception 'Phase 4C5T closed claim key was reusable';
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
    false,true,true,true,true,true,true,true,true,true,true,true,
    0,0,0,array['provider_secret_bundle_missing']::text[],statement_timestamp()-interval '2 hours'
  ) returning snapshot_id into snapshot_two;

  insert into public.lesson_booking_preview_launch_blocker_alerts(
    schema_version,snapshot_id,previous_snapshot_id,change_kind,previous_status,current_status,blocker_codes,recorded_at
  ) values (
    'smart_parrot_booking_preview_launch_blocker_alert_v1',snapshot_two,snapshot_one,'blockers_changed','blocked','blocked',
    array['provider_secret_bundle_missing']::text[],statement_timestamp()-interval '2 hours'
  ) returning alert_id into alert_two;
  perform public.service_prepare_booking_preview_launch_blocker_alert_handoff(snapshot_two);
  select public.service_prepare_booking_preview_launch_blocker_escalation_queue(snapshot_two) into queue_two;
  queue_two_id := (queue_two->>'queue_item_id')::bigint;

  insert into public.lesson_booking_preview_launch_blocker_escalation_work_events(
    schema_version,queue_item_id,snapshot_id,alert_id,event_kind,claim_key,attempt_no,lease_seconds,lease_expires_at,recorded_at
  ) values
    ('smart_parrot_booking_preview_launch_blocker_escalation_work_event_v1',queue_two_id,snapshot_two,alert_two,'claimed',k2,1,30,statement_timestamp()-interval '8 minutes',statement_timestamp()-interval '9 minutes'),
    ('smart_parrot_booking_preview_launch_blocker_escalation_work_event_v1',queue_two_id,snapshot_two,alert_two,'claimed',k3,2,30,statement_timestamp()-interval '6 minutes',statement_timestamp()-interval '7 minutes'),
    ('smart_parrot_booking_preview_launch_blocker_escalation_work_event_v1',queue_two_id,snapshot_two,alert_two,'claimed',k4,3,30,statement_timestamp()-interval '4 minutes',statement_timestamp()-interval '5 minutes'),
    ('smart_parrot_booking_preview_launch_blocker_escalation_work_event_v1',queue_two_id,snapshot_two,alert_two,'claimed',k5,4,30,statement_timestamp()-interval '2 minutes',statement_timestamp()-interval '3 minutes');
  insert into public.lesson_booking_preview_launch_blocker_escalation_work_events(
    schema_version,queue_item_id,snapshot_id,alert_id,event_kind,claim_key,attempt_no,next_eligible_at,reason_code,recorded_at
  ) values
    ('smart_parrot_booking_preview_launch_blocker_escalation_work_event_v1',queue_two_id,snapshot_two,alert_two,'retry_scheduled',k2,1,statement_timestamp()-interval '7 minutes','transient_failure',statement_timestamp()-interval '8 minutes'),
    ('smart_parrot_booking_preview_launch_blocker_escalation_work_event_v1',queue_two_id,snapshot_two,alert_two,'retry_scheduled',k3,2,statement_timestamp()-interval '5 minutes','transient_failure',statement_timestamp()-interval '6 minutes'),
    ('smart_parrot_booking_preview_launch_blocker_escalation_work_event_v1',queue_two_id,snapshot_two,alert_two,'retry_scheduled',k4,3,statement_timestamp()-interval '3 minutes','transient_failure',statement_timestamp()-interval '4 minutes'),
    ('smart_parrot_booking_preview_launch_blocker_escalation_work_event_v1',queue_two_id,snapshot_two,alert_two,'retry_scheduled',k5,4,statement_timestamp()-interval '1 minute','transient_failure',statement_timestamp()-interval '2 minutes');

  select public.service_claim_booking_preview_launch_blocker_escalation_work(queue_two_id,k6,45) into claim_five;
  if (claim_five->>'attempt_no')::integer <> 5 then
    raise exception 'Phase 4C5T expected fifth attempt, got %', claim_five;
  end if;

  begin
    perform public.service_transition_booking_preview_launch_blocker_escalation_work(
      queue_two_id,k6,'dead_letter','attempts_exhausted'
    );
  exception when object_not_in_prerequisite_state then
    early_exhaustion_blocked := true;
  end;
  if early_exhaustion_blocked then
    raise exception 'Phase 4C5T rejected valid attempts-exhausted transition at attempt five';
  end if;
  select public.service_transition_booking_preview_launch_blocker_escalation_work(
    queue_two_id,k6,'dead_letter','attempts_exhausted'
  ) into dead_five_replay;
  select jsonb_build_object(
    'event_id',e.event_id,
    'work_state','dead_lettered',
    'reason_code',e.reason_code,
    'attempt_no',e.attempt_no
  ) into dead_five
  from public.lesson_booking_preview_launch_blocker_escalation_work_events e
  where e.queue_item_id=queue_two_id and e.claim_key=k6 and e.event_kind='dead_lettered';
  if dead_five->>'reason_code' <> 'attempts_exhausted'
     or (dead_five->>'attempt_no')::integer <> 5
     or not (dead_five_replay->>'replay')::boolean
     or dead_five_replay->>'work_state' <> 'dead_lettered' then
    raise exception 'Phase 4C5T dead-letter replay boundary failed: row %, replay %', dead_five, dead_five_replay;
  end if;

  begin
    perform public.service_claim_booking_preview_launch_blocker_escalation_work(queue_two_id,k7,60);
  exception when object_not_in_prerequisite_state then
    dead_letter_reclaim_blocked := true;
  end;
  if not dead_letter_reclaim_blocked then
    raise exception 'Phase 4C5T dead-lettered work was reclaimable';
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
    'smart_parrot_booking_preview_launch_blocker_snapshot_v1',repeat('c',32),'blocked',true,
    false,true,true,true,true,true,true,true,true,true,true,true,
    0,0,0,array['provider_secret_bundle_missing']::text[],statement_timestamp()-interval '2 hours'
  ) returning snapshot_id into snapshot_three;

  insert into public.lesson_booking_preview_launch_blocker_alerts(
    schema_version,snapshot_id,previous_snapshot_id,change_kind,previous_status,current_status,blocker_codes,recorded_at
  ) values (
    'smart_parrot_booking_preview_launch_blocker_alert_v1',snapshot_three,snapshot_two,'blockers_changed','blocked','blocked',
    array['provider_secret_bundle_missing']::text[],statement_timestamp()-interval '2 hours'
  ) returning alert_id into alert_three;
  perform public.service_prepare_booking_preview_launch_blocker_alert_handoff(snapshot_three);
  select public.service_prepare_booking_preview_launch_blocker_escalation_queue(snapshot_three) into queue_three;
  queue_three_id := (queue_three->>'queue_item_id')::bigint;

  select public.service_claim_booking_preview_launch_blocker_escalation_work(queue_three_id,k8,60) into claim_release;
  select public.service_transition_booking_preview_launch_blocker_escalation_work(
    queue_three_id,k8,'release','observed_no_send'
  ) into release_one;
  select public.service_transition_booking_preview_launch_blocker_escalation_work(
    queue_three_id,k8,'release','observed_no_send'
  ) into release_one_replay;
  select public.service_claim_booking_preview_launch_blocker_escalation_work(queue_three_id,k9,60) into reclaim_after_release;
  if release_one->>'work_state' <> 'available'
     or (release_one->>'replay')::boolean
     or not (release_one_replay->>'replay')::boolean
     or (reclaim_after_release->>'attempt_no')::integer <> 2 then
    raise exception 'Phase 4C5T release/reclaim boundary failed: release %, replay %, reclaim %', release_one, release_one_replay, reclaim_after_release;
  end if;

  select public.service_list_booking_preview_launch_blocker_escalation_work(25) into inspection;
  if inspection->>'schema_version' <> 'smart_parrot_booking_preview_launch_blocker_escalation_inspection_v1'
     or (inspection->>'item_count')::integer <> 1
     or inspection->'items'->0->>'queue_item_id' <> queue_three_id::text
     or inspection->'items'->0->>'work_state' <> 'leased'
     or (inspection->>'notifier_send_authorized')::boolean
     or (inspection->>'automatic_notification_authorized')::boolean
     or not (inspection->>'server_time_authoritative')::boolean
     or inspection::text like '%' || k9 || '%'
     or inspection::text like '%provider_secret_bundle_missing%' then
    raise exception 'Phase 4C5T minimized inspection boundary failed: %', inspection;
  end if;

  begin
    perform public.service_claim_booking_preview_launch_blocker_escalation_work(
      (queue_one->>'queue_item_id')::bigint,repeat('d',32),60
    );
  exception when serialization_failure then
    stale_queue_blocked := true;
  end;
  if not stale_queue_blocked then
    raise exception 'Phase 4C5T stale snapshot queue work was not rejected';
  end if;

  begin
    update public.lesson_booking_preview_launch_blocker_escalation_work_events set reason_code=reason_code;
  exception when others then
    event_mutation_blocked := true;
  end;
  if not event_mutation_blocked then
    raise exception 'Phase 4C5T work evidence is not append-only';
  end if;
end $$;

do $$
declare
  rpc text;
begin
  for rpc in select unnest(array[
    'public.service_claim_booking_preview_launch_blocker_escalation_work(bigint,text,integer)',
    'public.service_transition_booking_preview_launch_blocker_escalation_work(bigint,text,text,text)',
    'public.service_list_booking_preview_launch_blocker_escalation_work(integer)'
  ]) loop
    if has_function_privilege('authenticated',rpc,'EXECUTE') then
      raise exception 'authenticated must not execute Phase 4C5T service RPC %', rpc;
    end if;
    if not has_function_privilege('service_role',rpc,'EXECUTE') then
      raise exception 'service_role must execute Phase 4C5T service RPC %', rpc;
    end if;
  end loop;

  if has_table_privilege('authenticated','public.lesson_booking_preview_launch_blocker_escalation_work_events','SELECT')
     or has_table_privilege('service_role','public.lesson_booking_preview_launch_blocker_escalation_work_events','SELECT') then
    raise exception 'Phase 4C5T work event table must remain RPC-only';
  end if;
end $$;

rollback;
