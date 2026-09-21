-- Phase 4C5AA append-only terminal evidence for unusable Phase Z intents. Ephemeral CI only.
begin;

insert into auth.users(id,raw_user_meta_data) values
 ('7f000000-0000-0000-0000-000000000015','{"full_name":"Phase4C5AA Admin"}');
update public.profiles set role='admin' where id='7f000000-0000-0000-0000-000000000015';
create or replace function auth.uid() returns uuid language sql stable as $$ select '7f000000-0000-0000-0000-000000000015'::uuid $$;

do $$
declare
  s1 bigint; s2 bigint; a1 bigint; q1 jsonb; q1id bigint; d1 bigint;
  r1 jsonb; g1 jsonb; c1 jsonb; act1 jsonb; claim1 jsonb; intent1 jsonb; terminal1 jsonb;
  obs0 jsonb; obs1 jsonb; obs2 jsonb; obs3 jsonb; obs4 jsonb;
  v_claim_event_id bigint; v_expired_claim_event_id bigint; v_superseded_claim_event_id bigint;
  v_expired_intent_id bigint; v_superseded_intent_id bigint;
  v_terminal_count integer; mutate boolean:=false;
begin
  insert into public.lesson_booking_preview_launch_blocker_snapshots(
    schema_version,state_fingerprint,status,schema_function_ready,provider_secret_bundle_ready,
    preview_project_identity_ready,stripe_account_identity_ready,daily_webhook_identity_ready,
    stripe_checkout_signed_recent,stripe_dispute_signed_recent,daily_signed_endpoint_ready,
    provider_rehearsal_recent,fixture_principals_ready,ephemeral_sessions_ready,
    provider_e2e_gate_open,worker_write_gate_open,unresolved_provider_cleanup_count,
    unresolved_terminal_reconciliation_count,missing_terminal_evidence_count,blocker_codes,captured_at
  ) values(
    'smart_parrot_booking_preview_launch_blocker_snapshot_v1',repeat('a',32),'blocked',true,false,
    true,true,true,true,true,true,true,true,true,true,true,0,0,0,
    array['provider_secret_bundle_missing']::text[],statement_timestamp()-interval '2 hours'
  ) returning snapshot_id into s1;

  insert into public.lesson_booking_preview_launch_blocker_alerts(
    schema_version,snapshot_id,previous_snapshot_id,change_kind,previous_status,current_status,blocker_codes,recorded_at
  ) values(
    'smart_parrot_booking_preview_launch_blocker_alert_v1',s1,null,'initial_state',null,'blocked',
    array['provider_secret_bundle_missing']::text[],statement_timestamp()-interval '2 hours'
  ) returning alert_id into a1;

  perform public.service_prepare_booking_preview_launch_blocker_alert_handoff(s1);
  select public.service_prepare_booking_preview_launch_blocker_escalation_queue(s1) into q1;
  q1id := (q1->>'queue_item_id')::bigint;

  insert into public.lesson_booking_preview_launch_blocker_escalation_work_events(
    schema_version,queue_item_id,snapshot_id,alert_id,event_kind,claim_key,attempt_no,
    lease_seconds,lease_expires_at,recorded_at
  ) values(
    'smart_parrot_booking_preview_launch_blocker_escalation_work_event_v1',q1id,s1,a1,
    'claimed',repeat('8',32),5,30,statement_timestamp()-interval '1 minute',statement_timestamp()-interval '2 minutes'
  );

  insert into public.lesson_booking_preview_launch_blocker_escalation_work_events(
    schema_version,queue_item_id,snapshot_id,alert_id,event_kind,claim_key,attempt_no,reason_code,recorded_at
  ) values(
    'smart_parrot_booking_preview_launch_blocker_escalation_work_event_v1',q1id,s1,a1,
    'dead_lettered',repeat('8',32),5,'attempts_exhausted',statement_timestamp()-interval '1 minute'
  ) returning event_id into d1;

  select public.admin_record_booking_preview_launch_blocker_dead_letter_review(q1id,'retry_after_review') into r1;
  select public.admin_generate_booking_preview_launch_blocker_requeue_eligibility((r1->>'review_id')::bigint) into g1;
  select public.service_consume_booking_preview_launch_blocker_requeue_eligibility(
    (g1->>'generation_id')::bigint,repeat('b',32)
  ) into c1;
  select public.service_activate_booking_preview_launch_blocker_requeue_lineage(
    (c1->>'work_generation_id')::bigint,repeat('c',32)
  ) into act1;

  select public.service_claim_booking_preview_launch_blocker_requeue_work_audited(
    (act1->>'activation_id')::bigint,repeat('d',32),120
  ) into claim1;
  v_claim_event_id := (claim1->>'event_id')::bigint;
  select public.service_prepare_booking_preview_launch_blocker_requeue_delivery_intent(v_claim_event_id) into intent1;

  select public.service_observe_booking_preview_launch_blocker_requeue_delivery_intent_terminals(100) into obs0;
  if (obs0->>'observed_count')::integer <> 0 then
    raise exception 'Phase AA terminalized a current active intent: %',obs0;
  end if;

  select public.service_transition_booking_preview_launch_blocker_requeue_work(
    (act1->>'activation_id')::bigint,repeat('d',32),'release','observed_no_send'
  ) into terminal1;
  if terminal1->>'work_state' <> 'available' then
    raise exception 'Phase AA could not close the exact claim: %',terminal1;
  end if;

  select public.service_observe_booking_preview_launch_blocker_requeue_delivery_intent_terminals(100) into obs1;
  if (obs1->>'observed_count')::integer <> 1
     or (obs1->>'claim_closed_count')::integer <> 1
     or (obs1->>'lease_expired_count')::integer <> 0
     or (obs1->>'snapshot_superseded_count')::integer <> 0
     or (obs1->>'external_notification_http_authorized')::boolean
     or (obs1->>'delivery_assertion_authorized')::boolean
     or (obs1->>'notifier_send_authorized')::boolean
     or (obs1->>'provider_write_authorized')::boolean
     or (obs1->>'booking_launch_authorized')::boolean
     or (obs1->>'destructive_cleanup_authorized')::boolean
     or not (obs1->>'server_time_authoritative')::boolean then
    raise exception 'Phase AA explicit claim-closure observation mismatch: %',obs1;
  end if;

  if not exists (
    select 1 from public.lesson_booking_preview_launch_blocker_requeue_delivery_intent_terminals x
    where x.intent_id=(intent1->>'intent_id')::bigint
      and x.claim_event_id=v_claim_event_id
      and x.terminal_reason='claim_closed'
      and x.evidence_scope='preview_audit_only'
  ) then
    raise exception 'Phase AA did not persist exact claim-closed evidence';
  end if;

  -- Synthetic generation 2 represents an intent prepared while its lease was active but observed later.
  insert into public.lesson_booking_preview_launch_blocker_requeue_lease_events(
    schema_version,activation_id,work_generation_id,queue_item_id,snapshot_id,alert_id,lineage_ref,
    event_kind,claim_key,lease_generation_no,lease_seconds,lease_expires_at,recorded_at
  ) values (
    'smart_parrot_booking_preview_launch_blocker_requeue_lease_event_v1',
    (act1->>'activation_id')::bigint,(act1->>'work_generation_id')::bigint,q1id,s1,a1,act1->>'lineage_ref',
    'claimed',repeat('e',32),2,30,statement_timestamp()-interval '1 minute',statement_timestamp()-interval '2 minutes'
  ) returning event_id into v_expired_claim_event_id;

  insert into public.lesson_booking_preview_launch_blocker_requeue_delivery_intents(
    schema_version,claim_event_id,activation_id,work_generation_id,queue_item_id,snapshot_id,alert_id,
    lineage_ref,lease_generation_no,lease_expires_at,intent_key,intent_state,transport_scope,prepared_at
  )
  select
    'smart_parrot_booking_preview_launch_blocker_requeue_delivery_intent_v1',
    e.event_id,e.activation_id,e.work_generation_id,e.queue_item_id,e.snapshot_id,e.alert_id,
    e.lineage_ref,e.lease_generation_no,e.lease_expires_at,
    pg_catalog.concat('rqi:',e.activation_id::text,':',e.event_id::text,':',e.lease_generation_no::text),
    'prepared','provider_neutral_preview',e.recorded_at + interval '10 seconds'
  from public.lesson_booking_preview_launch_blocker_requeue_lease_events e
  where e.event_id=v_expired_claim_event_id
  returning intent_id into v_expired_intent_id;

  select public.service_observe_booking_preview_launch_blocker_requeue_delivery_intent_terminals(100) into obs2;
  if (obs2->>'observed_count')::integer <> 1
     or (obs2->>'lease_expired_count')::integer <> 1 then
    raise exception 'Phase AA lease-expiry observation mismatch: %',obs2;
  end if;
  if not exists (
    select 1 from public.lesson_booking_preview_launch_blocker_requeue_delivery_intent_terminals x
    where x.intent_id=v_expired_intent_id and x.terminal_reason='lease_expired' and x.observed_at >= x.lease_expires_at
  ) then
    raise exception 'Phase AA did not persist server-time lease-expiry evidence';
  end if;

  -- Synthetic generation 3 remains unexpired; only a newer authoritative snapshot makes it stale.
  insert into public.lesson_booking_preview_launch_blocker_requeue_lease_events(
    schema_version,activation_id,work_generation_id,queue_item_id,snapshot_id,alert_id,lineage_ref,
    event_kind,claim_key,lease_generation_no,lease_seconds,lease_expires_at,recorded_at
  ) values (
    'smart_parrot_booking_preview_launch_blocker_requeue_lease_event_v1',
    (act1->>'activation_id')::bigint,(act1->>'work_generation_id')::bigint,q1id,s1,a1,act1->>'lineage_ref',
    'claimed',repeat('f',32),3,300,statement_timestamp()+interval '5 minutes',statement_timestamp()
  ) returning event_id into v_superseded_claim_event_id;

  insert into public.lesson_booking_preview_launch_blocker_requeue_delivery_intents(
    schema_version,claim_event_id,activation_id,work_generation_id,queue_item_id,snapshot_id,alert_id,
    lineage_ref,lease_generation_no,lease_expires_at,intent_key,intent_state,transport_scope,prepared_at
  )
  select
    'smart_parrot_booking_preview_launch_blocker_requeue_delivery_intent_v1',
    e.event_id,e.activation_id,e.work_generation_id,e.queue_item_id,e.snapshot_id,e.alert_id,
    e.lineage_ref,e.lease_generation_no,e.lease_expires_at,
    pg_catalog.concat('rqi:',e.activation_id::text,':',e.event_id::text,':',e.lease_generation_no::text),
    'prepared','provider_neutral_preview',statement_timestamp()
  from public.lesson_booking_preview_launch_blocker_requeue_lease_events e
  where e.event_id=v_superseded_claim_event_id
  returning intent_id into v_superseded_intent_id;

  insert into public.lesson_booking_preview_launch_blocker_snapshots(
    schema_version,state_fingerprint,status,schema_function_ready,provider_secret_bundle_ready,
    preview_project_identity_ready,stripe_account_identity_ready,daily_webhook_identity_ready,
    stripe_checkout_signed_recent,stripe_dispute_signed_recent,daily_signed_endpoint_ready,
    provider_rehearsal_recent,fixture_principals_ready,ephemeral_sessions_ready,
    provider_e2e_gate_open,worker_write_gate_open,unresolved_provider_cleanup_count,
    unresolved_terminal_reconciliation_count,missing_terminal_evidence_count,blocker_codes,captured_at
  ) values(
    'smart_parrot_booking_preview_launch_blocker_snapshot_v1',repeat('b',32),'blocked',true,false,
    true,true,true,true,true,true,true,true,true,true,true,0,0,0,
    array['provider_secret_bundle_missing']::text[],statement_timestamp()
  ) returning snapshot_id into s2;

  if s2 <= s1 then
    raise exception 'Phase AA test did not create a newer blocker snapshot';
  end if;

  select public.service_observe_booking_preview_launch_blocker_requeue_delivery_intent_terminals(100) into obs3;
  if (obs3->>'observed_count')::integer <> 1
     or (obs3->>'snapshot_superseded_count')::integer <> 1 then
    raise exception 'Phase AA snapshot-supersession observation mismatch: %',obs3;
  end if;
  if not exists (
    select 1 from public.lesson_booking_preview_launch_blocker_requeue_delivery_intent_terminals x
    where x.intent_id=v_superseded_intent_id and x.terminal_reason='snapshot_superseded'
  ) then
    raise exception 'Phase AA did not persist snapshot-superseded evidence';
  end if;

  select public.service_observe_booking_preview_launch_blocker_requeue_delivery_intent_terminals(100) into obs4;
  if (obs4->>'observed_count')::integer <> 0 then
    raise exception 'Phase AA exact observer replay was not idempotent: %',obs4;
  end if;

  select count(*) into v_terminal_count
  from public.lesson_booking_preview_launch_blocker_requeue_delivery_intent_terminals;
  if v_terminal_count <> 3 then
    raise exception 'Phase AA expected exactly three terminal evidence rows, got %',v_terminal_count;
  end if;

  begin
    update public.lesson_booking_preview_launch_blocker_requeue_delivery_intent_terminals
    set terminal_reason=terminal_reason;
  exception when others then
    mutate:=true;
  end;
  if not mutate then
    raise exception 'Phase AA terminal evidence was mutable';
  end if;
end $$;

do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.service_observe_booking_preview_launch_blocker_requeue_delivery_intent_terminals(integer)',
    'EXECUTE'
  ) then
    raise exception 'authenticated unexpectedly has Phase AA service RPC access';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.service_observe_booking_preview_launch_blocker_requeue_delivery_intent_terminals(integer)',
    'EXECUTE'
  ) then
    raise exception 'service_role missing Phase AA observer RPC access';
  end if;

  if has_table_privilege(
      'authenticated',
      'public.lesson_booking_preview_launch_blocker_requeue_delivery_intent_terminals',
      'SELECT'
    ) or has_table_privilege(
      'service_role',
      'public.lesson_booking_preview_launch_blocker_requeue_delivery_intent_terminals',
      'SELECT'
    ) then
    raise exception 'Phase AA terminal evidence must remain RPC-only';
  end if;
end $$;

rollback;
