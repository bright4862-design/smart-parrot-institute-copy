-- Phase 4C5Z lease-safe provider-neutral notifier delivery-intent preparation. Ephemeral CI only.
begin;

insert into auth.users(id,raw_user_meta_data) values
 ('7f000000-0000-0000-0000-000000000014','{"full_name":"Phase4C5Z Admin"}');
update public.profiles set role='admin' where id='7f000000-0000-0000-0000-000000000014';
create or replace function auth.uid() returns uuid language sql stable as $$ select '7f000000-0000-0000-0000-000000000014'::uuid $$;

do $$
declare
  s1 bigint; a1 bigint; q1 jsonb; q1id bigint; d1 bigint;
  r1 jsonb; g1 jsonb; c1 jsonb; act1 jsonb; claim1 jsonb;
  intent1 jsonb; intent2 jsonb; terminal1 jsonb;
  claim_event_id bigint; expired_claim_event_id bigint; v_expiry_id bigint;
  intent_count integer; phase_t_before bigint; phase_t_after bigint;
  closed_rejected boolean:=false; expired_rejected boolean:=false; mutate boolean:=false;
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

  select count(*) into phase_t_before
  from public.lesson_booking_preview_launch_blocker_escalation_work_events
  where queue_item_id=q1id;

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
  claim_event_id := (claim1->>'event_id')::bigint;

  select public.service_prepare_booking_preview_launch_blocker_requeue_delivery_intent(claim_event_id) into intent1;
  select public.service_prepare_booking_preview_launch_blocker_requeue_delivery_intent(claim_event_id) into intent2;

  if (intent1->>'intent_id')::bigint <> (intent2->>'intent_id')::bigint
     or (intent1->>'replay')::boolean
     or not (intent2->>'replay')::boolean
     or intent1->>'intent_key' <> pg_catalog.concat(
          'rqi:',(act1->>'activation_id'),':',claim_event_id::text,':',(claim1->>'lease_generation_no')
        )
     or intent1->>'intent_state' <> 'prepared'
     or intent1->>'transport_scope' <> 'provider_neutral_preview'
     or (intent1->>'external_notification_http_authorized')::boolean
     or (intent1->>'delivery_assertion_authorized')::boolean
     or (intent1->>'requeue_execution_authorized')::boolean
     or (intent1->>'automatic_notification_authorized')::boolean
     or (intent1->>'notifier_send_authorized')::boolean
     or (intent1->>'outcome_suppresses_blocker')::boolean
     or (intent1->>'provider_write_authorized')::boolean
     or (intent1->>'booking_launch_authorized')::boolean
     or (intent1->>'destructive_cleanup_authorized')::boolean
     or not (intent1->>'server_time_authoritative')::boolean
     or intent1->>'claim_key' is not null then
    raise exception 'Phase Z prepared/replay intent mismatch: %, %',intent1,intent2;
  end if;

  select count(*) into intent_count
  from public.lesson_booking_preview_launch_blocker_requeue_delivery_intents i
  where i.claim_event_id=claim_event_id;
  if intent_count <> 1 then
    raise exception 'Phase Z exact replay did not converge on one intent row';
  end if;

  if exists (
    select 1
    from public.lesson_booking_preview_launch_blocker_requeue_delivery_intents i
    where i.claim_event_id=claim_event_id
      and (i.prepared_at >= i.lease_expires_at
        or i.intent_state <> 'prepared'
        or i.transport_scope <> 'provider_neutral_preview'
        or i.external_notification_http_authorized
        or i.delivery_assertion_authorized
        or i.requeue_execution_authorized
        or i.automatic_notification_authorized
        or i.notifier_send_authorized
        or i.outcome_suppresses_blocker
        or i.provider_write_authorized
        or i.booking_launch_authorized
        or i.destructive_cleanup_authorized
        or not i.server_time_authoritative)
  ) then
    raise exception 'Phase Z persisted invalid delivery-intent evidence';
  end if;

  select public.service_transition_booking_preview_launch_blocker_requeue_work(
    (act1->>'activation_id')::bigint,repeat('d',32),'release','observed_no_send'
  ) into terminal1;
  if terminal1->>'work_state' <> 'available' then
    raise exception 'Phase Z could not close initial claim: %',terminal1;
  end if;

  begin
    perform public.service_prepare_booking_preview_launch_blocker_requeue_delivery_intent(claim_event_id);
  exception when others then
    closed_rejected:=true;
  end;
  if not closed_rejected then
    raise exception 'Phase Z accepted delivery-intent preparation after terminal claim closure';
  end if;

  -- Synthetic expired generation proves Phase Y expiry evidence and server-time expiry both exclude preparation.
  insert into public.lesson_booking_preview_launch_blocker_requeue_lease_events(
    schema_version,activation_id,work_generation_id,queue_item_id,snapshot_id,alert_id,lineage_ref,
    event_kind,claim_key,lease_generation_no,lease_seconds,lease_expires_at,recorded_at
  ) values (
    'smart_parrot_booking_preview_launch_blocker_requeue_lease_event_v1',
    (act1->>'activation_id')::bigint,(act1->>'work_generation_id')::bigint,q1id,s1,a1,act1->>'lineage_ref',
    'claimed',repeat('e',32),2,30,statement_timestamp()-interval '1 minute',statement_timestamp()-interval '2 minutes'
  ) returning event_id into expired_claim_event_id;

  insert into public.lesson_booking_preview_launch_blocker_requeue_lease_expiries(
    schema_version,claim_event_id,activation_id,work_generation_id,queue_item_id,snapshot_id,
    alert_id,lineage_ref,lease_generation_no,lease_expires_at,expiry_reason,observed_at
  )
  select
    'smart_parrot_booking_preview_launch_blocker_requeue_lease_expiry_v1',
    e.event_id,e.activation_id,e.work_generation_id,e.queue_item_id,e.snapshot_id,
    e.alert_id,e.lineage_ref,e.lease_generation_no,e.lease_expires_at,'lease_timeout',statement_timestamp()
  from public.lesson_booking_preview_launch_blocker_requeue_lease_events e
  where e.event_id=expired_claim_event_id
  returning expiry_id into v_expiry_id;

  begin
    perform public.service_prepare_booking_preview_launch_blocker_requeue_delivery_intent(expired_claim_event_id);
  exception when others then
    expired_rejected:=true;
  end;
  if not expired_rejected then
    raise exception 'Phase Z accepted an expired/expiry-evidenced claim';
  end if;

  select count(*) into phase_t_after
  from public.lesson_booking_preview_launch_blocker_escalation_work_events
  where queue_item_id=q1id;
  if phase_t_after <> phase_t_before then
    raise exception 'Phase Z mutated exhausted Phase T history: before %, after %',phase_t_before,phase_t_after;
  end if;

  begin
    update public.lesson_booking_preview_launch_blocker_requeue_delivery_intents
    set intent_state=intent_state;
  exception when others then
    mutate:=true;
  end;
  if not mutate then
    raise exception 'Phase Z delivery-intent evidence was mutable';
  end if;
end $$;

do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.service_prepare_booking_preview_launch_blocker_requeue_delivery_intent(bigint)',
    'EXECUTE'
  ) then
    raise exception 'authenticated unexpectedly has Phase Z service RPC access';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.service_prepare_booking_preview_launch_blocker_requeue_delivery_intent(bigint)',
    'EXECUTE'
  ) then
    raise exception 'service_role missing Phase Z delivery-intent RPC access';
  end if;

  if has_table_privilege(
      'authenticated',
      'public.lesson_booking_preview_launch_blocker_requeue_delivery_intents',
      'SELECT'
    ) or has_table_privilege(
      'service_role',
      'public.lesson_booking_preview_launch_blocker_requeue_delivery_intents',
      'SELECT'
    ) then
    raise exception 'Phase Z delivery-intent evidence must remain RPC-only';
  end if;
end $$;

rollback;
