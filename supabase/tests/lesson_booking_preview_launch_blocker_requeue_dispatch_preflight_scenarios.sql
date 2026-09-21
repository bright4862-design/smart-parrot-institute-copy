-- Phase 4C5AB service-only no-send dispatch preflight + exact stale-intent exclusion. Ephemeral CI only.
begin;

insert into auth.users(id,raw_user_meta_data) values
 ('7f000000-0000-0000-0000-000000000016','{"full_name":"Phase4C5AB Admin"}');
update public.profiles set role='admin' where id='7f000000-0000-0000-0000-000000000016';
create or replace function auth.uid() returns uuid language sql stable as $$ select '7f000000-0000-0000-0000-000000000016'::uuid $$;

do $$
declare
  s1 bigint; s2 bigint; a1 bigint; q1 jsonb; q1id bigint; d1 bigint;
  r1 jsonb; g1 jsonb; c1 jsonb; act1 jsonb; claim1 jsonb; intent1 jsonb;
  ready1 jsonb; replay1 jsonb; excluded1 jsonb; excluded1_replay jsonb;
  expired_result jsonb; superseded_result jsonb; terminal_obs jsonb;
  v_claim_event_id bigint; v_expired_claim_event_id bigint; v_superseded_claim_event_id bigint;
  v_expired_intent_id bigint; v_superseded_intent_id bigint;
  v_preflight_count integer; v_exclusion_count integer; conflict_raised boolean:=false;
  mutate_preflight boolean:=false; mutate_exclusion boolean:=false;
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
    (act1->>'activation_id')::bigint,repeat('d',32),300
  ) into claim1;
  v_claim_event_id := (claim1->>'event_id')::bigint;
  select public.service_prepare_booking_preview_launch_blocker_requeue_delivery_intent(v_claim_event_id) into intent1;

  select public.service_prepare_booking_preview_launch_blocker_requeue_dispatch_preflight(
    (intent1->>'intent_id')::bigint,repeat('1',32)
  ) into ready1;
  if ready1->>'decision' <> 'ready_no_send'
     or (ready1->>'preflight_id') is null
     or (ready1->>'exclusion_id') is not null
     or (ready1->>'exclusion_reason') is not null
     or (ready1->>'replay')::boolean
     or (ready1->>'dispatch_authorized')::boolean
     or (ready1->>'external_notification_http_authorized')::boolean
     or (ready1->>'delivery_assertion_authorized')::boolean
     or (ready1->>'notifier_send_authorized')::boolean
     or (ready1->>'provider_write_authorized')::boolean
     or (ready1->>'booking_launch_authorized')::boolean
     or (ready1->>'destructive_cleanup_authorized')::boolean
     or not (ready1->>'server_time_authoritative')::boolean then
    raise exception 'Phase AB current no-send preflight mismatch: %',ready1;
  end if;

  select public.service_prepare_booking_preview_launch_blocker_requeue_dispatch_preflight(
    (intent1->>'intent_id')::bigint,repeat('1',32)
  ) into replay1;
  if replay1->>'decision' <> 'ready_no_send'
     or not (replay1->>'replay')::boolean
     or replay1->>'preflight_id' <> ready1->>'preflight_id' then
    raise exception 'Phase AB exact ready replay mismatch: %',replay1;
  end if;

  begin
    perform public.service_prepare_booking_preview_launch_blocker_requeue_dispatch_preflight(
      (intent1->>'intent_id')::bigint,repeat('9',32)
    );
  exception when unique_violation then
    conflict_raised:=true;
  end;
  if not conflict_raised then
    raise exception 'Phase AB accepted a conflicting current preflight key';
  end if;

  perform public.service_transition_booking_preview_launch_blocker_requeue_work(
    (act1->>'activation_id')::bigint,repeat('d',32),'release','observed_no_send'
  );
  select public.service_observe_booking_preview_launch_blocker_requeue_delivery_intent_terminals(100) into terminal_obs;
  if (terminal_obs->>'claim_closed_count')::integer <> 1 then
    raise exception 'Phase AB setup failed to create Phase AA claim-closed evidence: %',terminal_obs;
  end if;

  select public.service_prepare_booking_preview_launch_blocker_requeue_dispatch_preflight(
    (intent1->>'intent_id')::bigint,repeat('1',32)
  ) into excluded1;
  if excluded1->>'decision' <> 'excluded'
     or excluded1->>'exclusion_reason' <> 'claim_closed'
     or excluded1->>'preflight_id' <> ready1->>'preflight_id'
     or (excluded1->>'exclusion_id') is null
     or (excluded1->>'dispatch_authorized')::boolean
     or (excluded1->>'notifier_send_authorized')::boolean then
    raise exception 'Phase AB did not supersede ready evidence after claim closure: %',excluded1;
  end if;

  if not exists (
    select 1
    from public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflight_exclusions x
    join public.lesson_booking_preview_launch_blocker_requeue_delivery_intent_terminals t
      on t.terminal_id=x.terminal_id
    where x.intent_id=(intent1->>'intent_id')::bigint
      and x.preflight_id=(ready1->>'preflight_id')::bigint
      and x.exclusion_reason='claim_closed'
      and t.terminal_reason='claim_closed'
  ) then
    raise exception 'Phase AB did not bind claim-closed exclusion to Phase AA terminal evidence';
  end if;

  select public.service_prepare_booking_preview_launch_blocker_requeue_dispatch_preflight(
    (intent1->>'intent_id')::bigint,repeat('f',32)
  ) into excluded1_replay;
  if excluded1_replay->>'decision' <> 'excluded'
     or not (excluded1_replay->>'replay')::boolean
     or excluded1_replay->>'exclusion_id' <> excluded1->>'exclusion_id' then
    raise exception 'Phase AB stale replay did not converge on immutable exclusion: %',excluded1_replay;
  end if;

  -- Generation 2 is already expired: stale intent must never create a ready preflight.
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

  select public.service_prepare_booking_preview_launch_blocker_requeue_dispatch_preflight(
    v_expired_intent_id,repeat('2',32)
  ) into expired_result;
  if expired_result->>'decision' <> 'excluded'
     or expired_result->>'exclusion_reason' <> 'lease_expired'
     or (expired_result->>'preflight_id') is not null
     or (expired_result->>'exclusion_id') is null then
    raise exception 'Phase AB lease-expired exclusion mismatch: %',expired_result;
  end if;
  if exists (
    select 1 from public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflights p
    where p.intent_id=v_expired_intent_id
  ) then
    raise exception 'Phase AB created ready evidence for an expired intent';
  end if;

  -- Generation 3 remains unexpired; a newer blocker snapshot alone makes its intent stale.
  insert into public.lesson_booking_preview_launch_blocker_requeue_lease_events(
    schema_version,activation_id,work_generation_id,queue_item_id,snapshot_id,alert_id,lineage_ref,
    event_kind,claim_key,lease_generation_no,lease_seconds,lease_expires_at,recorded_at
  ) values (
    'smart_parrot_booking_preview_launch_blocker_requeue_lease_event_v1',
    (act1->>'activation_id')::bigint,(act1->>'work_generation_id')::bigint,q1id,s1,a1,act1->>'lineage_ref',
    'claimed',repeat('7',32),3,300,statement_timestamp()+interval '5 minutes',statement_timestamp()
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
    raise exception 'Phase AB test did not create a newer blocker snapshot';
  end if;

  select public.service_prepare_booking_preview_launch_blocker_requeue_dispatch_preflight(
    v_superseded_intent_id,repeat('3',32)
  ) into superseded_result;
  if superseded_result->>'decision' <> 'excluded'
     or superseded_result->>'exclusion_reason' <> 'snapshot_superseded'
     or (superseded_result->>'preflight_id') is not null
     or (superseded_result->>'exclusion_id') is null then
    raise exception 'Phase AB snapshot-superseded exclusion mismatch: %',superseded_result;
  end if;

  select count(*) into v_preflight_count
  from public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflights;
  select count(*) into v_exclusion_count
  from public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflight_exclusions;
  if v_preflight_count <> 1 or v_exclusion_count <> 3 then
    raise exception 'Phase AB expected 1 ready preflight + 3 exclusions, got % + %',v_preflight_count,v_exclusion_count;
  end if;

  begin
    update public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflights
    set preflight_state=preflight_state;
  exception when others then
    mutate_preflight:=true;
  end;
  if not mutate_preflight then
    raise exception 'Phase AB preflight evidence was mutable';
  end if;

  begin
    update public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflight_exclusions
    set exclusion_reason=exclusion_reason;
  exception when others then
    mutate_exclusion:=true;
  end;
  if not mutate_exclusion then
    raise exception 'Phase AB exclusion evidence was mutable';
  end if;
end $$;

do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.service_prepare_booking_preview_launch_blocker_requeue_dispatch_preflight(bigint,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated unexpectedly has Phase AB service RPC access';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.service_prepare_booking_preview_launch_blocker_requeue_dispatch_preflight(bigint,text)',
    'EXECUTE'
  ) then
    raise exception 'service_role missing Phase AB service RPC access';
  end if;

  if has_table_privilege('authenticated','public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflights','SELECT')
     or has_table_privilege('service_role','public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflights','SELECT')
     or has_table_privilege('authenticated','public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflight_exclusions','SELECT')
     or has_table_privilege('service_role','public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflight_exclusions','SELECT') then
    raise exception 'Phase AB evidence tables must remain RPC-only';
  end if;
end $$;

rollback;
