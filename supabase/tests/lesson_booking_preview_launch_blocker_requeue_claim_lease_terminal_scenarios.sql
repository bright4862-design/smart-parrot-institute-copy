-- Phase 4C5X requeue-specific activation-scoped claim/lease + terminal transition evidence. Ephemeral CI only.
begin;

insert into auth.users(id,raw_user_meta_data) values
 ('7e000000-0000-0000-0000-000000000012','{"full_name":"Phase4C5X Admin"}');
update public.profiles set role='admin' where id='7e000000-0000-0000-0000-000000000012';
create or replace function auth.uid() returns uuid language sql stable as $$ select '7e000000-0000-0000-0000-000000000012'::uuid $$;

do $$
declare
  s1 bigint; a1 bigint; q1 jsonb; q1id bigint; d1 bigint;
  r1 jsonb; g1 jsonb; c1 jsonb; act1 jsonb;
  cl1 jsonb; cl1r jsonb; tr1 jsonb; tr1r jsonb;
  cl2 jsonb; tr2 jsonb; cl3 jsonb; tr3 jsonb; tr3r jsonb;
  inspect jsonb; t_before bigint; t_after bigint;
  blocked boolean:=false; mutate boolean:=false;
begin
  insert into public.lesson_booking_preview_launch_blocker_snapshots(
    schema_version,state_fingerprint,status,schema_function_ready,provider_secret_bundle_ready,
    preview_project_identity_ready,stripe_account_identity_ready,daily_webhook_identity_ready,
    stripe_checkout_signed_recent,stripe_dispute_signed_recent,daily_signed_endpoint_ready,
    provider_rehearsal_recent,fixture_principals_ready,ephemeral_sessions_ready,
    provider_e2e_gate_open,worker_write_gate_open,unresolved_provider_cleanup_count,
    unresolved_terminal_reconciliation_count,missing_terminal_evidence_count,blocker_codes,captured_at
  ) values(
    'smart_parrot_booking_preview_launch_blocker_snapshot_v1',repeat('8',32),'blocked',true,false,
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

  select count(*) into t_before
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

  select public.service_claim_booking_preview_launch_blocker_requeue_work(
    (act1->>'activation_id')::bigint,repeat('c',32),120
  ) into cl1;
  select public.service_claim_booking_preview_launch_blocker_requeue_work(
    (act1->>'activation_id')::bigint,repeat('c',32),120
  ) into cl1r;

  if (cl1->>'replay')::boolean
     or not (cl1r->>'replay')::boolean
     or (cl1->>'lease_generation_no')::integer <> 1
     or cl1->>'work_state' <> 'leased'
     or not (cl1->>'lease_active')::boolean
     or (cl1->>'requeue_execution_authorized')::boolean
     or (cl1->>'automatic_notification_authorized')::boolean
     or (cl1->>'notifier_send_authorized')::boolean
     or (cl1->>'provider_write_authorized')::boolean
     or (cl1->>'booking_launch_authorized')::boolean
     or (cl1->>'destructive_cleanup_authorized')::boolean
     or not (cl1->>'server_time_authoritative')::boolean then
    raise exception 'Phase X first claim failed: %, %',cl1,cl1r;
  end if;

  blocked:=false;
  begin
    perform public.service_claim_booking_preview_launch_blocker_requeue_work(
      (act1->>'activation_id')::bigint,repeat('d',32),120
    );
  exception when others then
    if SQLSTATE <> '55P03' then raise; end if;
    blocked:=true;
  end;
  if not blocked then
    raise exception 'Phase X accepted a concurrent active claim';
  end if;

  select public.service_transition_booking_preview_launch_blocker_requeue_work(
    (act1->>'activation_id')::bigint,repeat('c',32),'release','observed_no_send'
  ) into tr1;
  select public.service_transition_booking_preview_launch_blocker_requeue_work(
    (act1->>'activation_id')::bigint,repeat('c',32),'release','observed_no_send'
  ) into tr1r;
  if (tr1->>'replay')::boolean
     or not (tr1r->>'replay')::boolean
     or tr1->>'work_state' <> 'available'
     or tr1->>'reason_code' <> 'observed_no_send' then
    raise exception 'Phase X release replay failed: %, %',tr1,tr1r;
  end if;

  select public.service_claim_booking_preview_launch_blocker_requeue_work(
    (act1->>'activation_id')::bigint,repeat('d',32),90
  ) into cl2;
  if (cl2->>'lease_generation_no')::integer <> 2 then
    raise exception 'Phase X second lease generation mismatch: %',cl2;
  end if;
  select public.service_transition_booking_preview_launch_blocker_requeue_work(
    (act1->>'activation_id')::bigint,repeat('d',32),'release','observed_no_send'
  ) into tr2;

  select public.service_claim_booking_preview_launch_blocker_requeue_work(
    (act1->>'activation_id')::bigint,repeat('e',32),60
  ) into cl3;
  if (cl3->>'lease_generation_no')::integer <> 3 then
    raise exception 'Phase X third lease generation mismatch: %',cl3;
  end if;

  blocked:=false;
  begin
    perform public.service_transition_booking_preview_launch_blocker_requeue_work(
      (act1->>'activation_id')::bigint,repeat('e',32),'retry','transient_worker_failure'
    );
  exception when others then
    if SQLSTATE <> '55000' then raise; end if;
    blocked:=true;
  end;
  if not blocked then
    raise exception 'Phase X scheduled retry after generation exhaustion';
  end if;

  select public.service_transition_booking_preview_launch_blocker_requeue_work(
    (act1->>'activation_id')::bigint,repeat('e',32),'dead_letter','requeue_attempts_exhausted'
  ) into tr3;
  select public.service_transition_booking_preview_launch_blocker_requeue_work(
    (act1->>'activation_id')::bigint,repeat('e',32),'dead_letter','requeue_attempts_exhausted'
  ) into tr3r;

  if (tr3->>'replay')::boolean
     or not (tr3r->>'replay')::boolean
     or tr3->>'work_state' <> 'dead_lettered'
     or tr3->>'reason_code' <> 'requeue_attempts_exhausted'
     or (tr3->>'lease_generation_no')::integer <> 3 then
    raise exception 'Phase X terminal dead-letter replay failed: %, %',tr3,tr3r;
  end if;

  blocked:=false;
  begin
    perform public.service_claim_booking_preview_launch_blocker_requeue_work(
      (act1->>'activation_id')::bigint,repeat('f',32),60
    );
  exception when others then
    if SQLSTATE <> '55000' then raise; end if;
    blocked:=true;
  end;
  if not blocked then
    raise exception 'Phase X reopened a dead-lettered requeue activation';
  end if;

  select count(*) into t_after
  from public.lesson_booking_preview_launch_blocker_escalation_work_events
  where queue_item_id=q1id;
  if t_after <> t_before then
    raise exception 'Phase X mutated exhausted Phase T attempt history: before %, after %',t_before,t_after;
  end if;

  if (select count(*) from public.lesson_booking_preview_launch_blocker_requeue_lease_events
      where activation_id=(act1->>'activation_id')::bigint and event_kind='claimed') <> 3 then
    raise exception 'Phase X expected exactly three activation-scoped claim generations';
  end if;
  if (select count(*) from public.lesson_booking_preview_launch_blocker_requeue_lease_events
      where activation_id=(act1->>'activation_id')::bigint and event_kind in ('released','retry_scheduled','dead_lettered')) <> 3 then
    raise exception 'Phase X expected one terminal event per claim';
  end if;

  select public.service_list_booking_preview_launch_blocker_requeue_work(25) into inspect;
  if (inspect->>'item_count')::integer <> 1
     or inspect#>>'{items,0,work_state}' <> 'dead_lettered'
     or (inspect#>>'{items,0,lease_generation_no}')::integer <> 3
     or (inspect->>'requeue_execution_authorized')::boolean
     or (inspect->>'notifier_send_authorized')::boolean
     or not (inspect->>'server_time_authoritative')::boolean then
    raise exception 'Phase X minimized inspection mismatch: %',inspect;
  end if;

  begin
    update public.lesson_booking_preview_launch_blocker_requeue_lease_events
    set reason_code=reason_code;
  exception when others then
    mutate:=true;
  end;
  if not mutate then
    raise exception 'Phase X requeue lease evidence was mutable';
  end if;
end $$;

do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.service_claim_booking_preview_launch_blocker_requeue_work(bigint,text,integer)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.service_transition_booking_preview_launch_blocker_requeue_work(bigint,text,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.service_list_booking_preview_launch_blocker_requeue_work(integer)',
    'EXECUTE'
  ) then
    raise exception 'authenticated unexpectedly has Phase X service RPC access';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.service_claim_booking_preview_launch_blocker_requeue_work(bigint,text,integer)',
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
    raise exception 'service_role missing Phase X service RPC access';
  end if;

  if has_table_privilege(
      'authenticated',
      'public.lesson_booking_preview_launch_blocker_requeue_lease_events',
      'SELECT'
    ) or has_table_privilege(
      'service_role',
      'public.lesson_booking_preview_launch_blocker_requeue_lease_events',
      'SELECT'
    ) then
    raise exception 'Phase X lease evidence must remain RPC-only';
  end if;
end $$;

rollback;
