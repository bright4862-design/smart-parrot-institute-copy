-- Phase 4C5Y stale requeue lease watchdog + immutable expiry evidence. Ephemeral CI only.
begin;

insert into auth.users(id,raw_user_meta_data) values
 ('7f000000-0000-0000-0000-000000000013','{"full_name":"Phase4C5Y Admin"}');
update public.profiles set role='admin' where id='7f000000-0000-0000-0000-000000000013';
create or replace function auth.uid() returns uuid language sql stable as $$ select '7f000000-0000-0000-0000-000000000013'::uuid $$;

do $$
declare
  s1 bigint; a1 bigint; q1 jsonb; q1id bigint; d1 bigint;
  r1 jsonb; g1 jsonb; c1 jsonb; act1 jsonb;
  expired_claim_event_id bigint; audited_claim jsonb; observation1 jsonb; observation2 jsonb;
  v_expiry_id bigint; expiry_count integer; phase_t_before bigint; phase_t_after bigint;
  transition2 jsonb; mutate boolean:=false;
begin
  insert into public.lesson_booking_preview_launch_blocker_snapshots(
    schema_version,state_fingerprint,status,schema_function_ready,provider_secret_bundle_ready,
    preview_project_identity_ready,stripe_account_identity_ready,daily_webhook_identity_ready,
    stripe_checkout_signed_recent,stripe_dispute_signed_recent,daily_signed_endpoint_ready,
    provider_rehearsal_recent,fixture_principals_ready,ephemeral_sessions_ready,
    provider_e2e_gate_open,worker_write_gate_open,unresolved_provider_cleanup_count,
    unresolved_terminal_reconciliation_count,missing_terminal_evidence_count,blocker_codes,captured_at
  ) values(
    'smart_parrot_booking_preview_launch_blocker_snapshot_v1',repeat('9',32),'blocked',true,false,
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
    (g1->>'generation_id')::bigint,repeat('a',32)
  ) into c1;
  select public.service_activate_booking_preview_launch_blocker_requeue_lineage(
    (c1->>'work_generation_id')::bigint,repeat('b',32)
  ) into act1;

  insert into public.lesson_booking_preview_launch_blocker_requeue_lease_events(
    schema_version,activation_id,work_generation_id,queue_item_id,snapshot_id,alert_id,lineage_ref,
    event_kind,claim_key,lease_generation_no,lease_seconds,lease_expires_at,recorded_at
  ) values (
    'smart_parrot_booking_preview_launch_blocker_requeue_lease_event_v1',
    (act1->>'activation_id')::bigint,(act1->>'work_generation_id')::bigint,q1id,s1,a1,act1->>'lineage_ref',
    'claimed',repeat('c',32),1,30,statement_timestamp()-interval '1 minute',statement_timestamp()-interval '2 minutes'
  ) returning event_id into expired_claim_event_id;

  if (select count(*) from public.lesson_booking_preview_launch_blocker_requeue_lease_expiries) <> 0 then
    raise exception 'Phase Y started with unexpected expiry evidence';
  end if;

  -- The public service claim path is the audited wrapper. It must persist immutable expiry
  -- evidence for the abandoned generation before it creates generation two.
  select public.service_claim_booking_preview_launch_blocker_requeue_work_audited(
    (act1->>'activation_id')::bigint,repeat('d',32),60
  ) into audited_claim;

  if (audited_claim->>'lease_generation_no')::integer <> 2
     or audited_claim->>'work_state' <> 'leased'
     or not (audited_claim->>'lease_active')::boolean
     or (audited_claim->>'requeue_execution_authorized')::boolean
     or (audited_claim->>'notifier_send_authorized')::boolean
     or (audited_claim->>'provider_write_authorized')::boolean
     or (audited_claim->>'booking_launch_authorized')::boolean
     or (audited_claim->>'destructive_cleanup_authorized')::boolean
     or not (audited_claim->>'server_time_authoritative')::boolean then
    raise exception 'Phase Y audited follow-on claim failed: %',audited_claim;
  end if;

  select count(*),min(x.expiry_id) into expiry_count,v_expiry_id
  from public.lesson_booking_preview_launch_blocker_requeue_lease_expiries x
  where x.claim_event_id=expired_claim_event_id;
  if expiry_count <> 1 or v_expiry_id is null then
    raise exception 'Phase Y audited claim failed to persist exactly one expiry row';
  end if;

  if exists (
    select 1 from public.lesson_booking_preview_launch_blocker_requeue_lease_expiries x
    where x.expiry_id=v_expiry_id
      and (x.expiry_reason <> 'lease_timeout'
        or x.observed_at < x.lease_expires_at
        or x.lease_generation_no <> 1
        or x.requeue_execution_authorized
        or x.automatic_notification_authorized
        or x.notifier_send_authorized
        or x.provider_write_authorized
        or x.booking_launch_authorized
        or x.destructive_cleanup_authorized
        or not x.server_time_authoritative)
  ) then
    raise exception 'Phase Y persisted invalid expiry evidence';
  end if;

  select public.service_observe_booking_preview_launch_blocker_requeue_expired_leases(25) into observation1;
  select public.service_observe_booking_preview_launch_blocker_requeue_expired_leases(25) into observation2;

  if (observation1->>'item_count')::integer <> 1
     or (observation2->>'item_count')::integer <> 1
     or (observation1#>>'{items,0,expiry_id}')::bigint <> v_expiry_id
     or (observation2#>>'{items,0,expiry_id}')::bigint <> v_expiry_id
     or observation1#>>'{items,0,expiry_reason}' <> 'lease_timeout'
     or observation1#>>'{items,0,claim_key}' is not null
     or (observation1->>'requeue_execution_authorized')::boolean
     or (observation1->>'automatic_notification_authorized')::boolean
     or (observation1->>'notifier_send_authorized')::boolean
     or (observation1->>'provider_write_authorized')::boolean
     or (observation1->>'booking_launch_authorized')::boolean
     or (observation1->>'destructive_cleanup_authorized')::boolean
     or not (observation1->>'server_time_authoritative')::boolean then
    raise exception 'Phase Y minimized observer mismatch: %, %',observation1,observation2;
  end if;

  if (select count(*) from public.lesson_booking_preview_launch_blocker_requeue_lease_expiries x
      where x.claim_event_id=expired_claim_event_id) <> 1 then
    raise exception 'Phase Y observer duplicated expiry evidence';
  end if;

  select public.service_transition_booking_preview_launch_blocker_requeue_work(
    (act1->>'activation_id')::bigint,repeat('d',32),'release','observed_no_send'
  ) into transition2;
  if transition2->>'work_state' <> 'available' then
    raise exception 'Phase Y could not safely close the audited second lease: %',transition2;
  end if;

  select count(*) into phase_t_after
  from public.lesson_booking_preview_launch_blocker_escalation_work_events
  where queue_item_id=q1id;
  if phase_t_after <> phase_t_before then
    raise exception 'Phase Y mutated exhausted Phase T history: before %, after %',phase_t_before,phase_t_after;
  end if;

  begin
    update public.lesson_booking_preview_launch_blocker_requeue_lease_expiries
    set expiry_reason=expiry_reason;
  exception when others then
    mutate:=true;
  end;
  if not mutate then
    raise exception 'Phase Y expiry evidence was mutable';
  end if;
end $$;

do $$
begin
  if has_function_privilege(
    'service_role',
    'public.service_claim_booking_preview_launch_blocker_requeue_work(bigint,text,integer)',
    'EXECUTE'
  ) then
    raise exception 'service_role can still bypass Phase Y through the legacy claim RPC';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.service_claim_booking_preview_launch_blocker_requeue_work_audited(bigint,text,integer)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.service_observe_booking_preview_launch_blocker_requeue_expired_leases(integer)',
    'EXECUTE'
  ) then
    raise exception 'authenticated unexpectedly has Phase Y service RPC access';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.service_claim_booking_preview_launch_blocker_requeue_work_audited(bigint,text,integer)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.service_observe_booking_preview_launch_blocker_requeue_expired_leases(integer)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.service_transition_booking_preview_launch_blocker_requeue_work(bigint,text,text,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.service_list_booking_preview_launch_blocker_requeue_work(integer)',
    'EXECUTE'
  ) then
    raise exception 'service_role missing Phase Y requeue lifecycle RPC access';
  end if;

  if has_table_privilege(
      'authenticated',
      'public.lesson_booking_preview_launch_blocker_requeue_lease_expiries',
      'SELECT'
    ) or has_table_privilege(
      'service_role',
      'public.lesson_booking_preview_launch_blocker_requeue_lease_expiries',
      'SELECT'
    ) then
    raise exception 'Phase Y expiry evidence must remain RPC-only';
  end if;
end $$;

rollback;
