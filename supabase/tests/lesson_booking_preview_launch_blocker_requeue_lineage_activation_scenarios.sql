-- Phase 4C5W bounded requeue lineage activation + lease-safe eligibility handoff. Ephemeral CI only.
begin;

insert into auth.users(id,raw_user_meta_data) values
 ('7e000000-0000-0000-0000-000000000011','{"full_name":"Phase4C5W Admin"}');
update public.profiles set role='admin' where id='7e000000-0000-0000-0000-000000000011';
create or replace function auth.uid() returns uuid language sql stable as $$ select '7e000000-0000-0000-0000-000000000011'::uuid $$;

do $$
declare
  s1 bigint; a1 bigint; q1 jsonb; q1id bigint; d1 bigint;
  r1 jsonb; g1 jsonb; c1 jsonb; act1 jsonb; act1r jsonb;
  conflict boolean:=false; mutate boolean:=false;
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
    'claimed',repeat('9',32),5,30,statement_timestamp()-interval '1 minute',statement_timestamp()-interval '2 minutes'
  );

  insert into public.lesson_booking_preview_launch_blocker_escalation_work_events(
    schema_version,queue_item_id,snapshot_id,alert_id,event_kind,claim_key,attempt_no,reason_code,recorded_at
  ) values(
    'smart_parrot_booking_preview_launch_blocker_escalation_work_event_v1',q1id,s1,a1,
    'dead_lettered',repeat('9',32),5,'attempts_exhausted',statement_timestamp()-interval '1 minute'
  ) returning event_id into d1;

  select public.admin_record_booking_preview_launch_blocker_dead_letter_review(q1id,'retry_after_review') into r1;
  select public.admin_generate_booking_preview_launch_blocker_requeue_eligibility((r1->>'review_id')::bigint) into g1;
  select public.service_consume_booking_preview_launch_blocker_requeue_eligibility(
    (g1->>'generation_id')::bigint,repeat('a',32)
  ) into c1;

  select public.service_activate_booking_preview_launch_blocker_requeue_lineage(
    (c1->>'work_generation_id')::bigint,repeat('b',32)
  ) into act1;
  select public.service_activate_booking_preview_launch_blocker_requeue_lineage(
    (c1->>'work_generation_id')::bigint,repeat('b',32)
  ) into act1r;

  if (act1->>'replay')::boolean
     or not (act1r->>'replay')::boolean
     or act1->>'activation_status' <> 'activated'
     or act1->>'lease_handoff_state' <> 'eligible_for_internal_claim'
     or act1->>'claim_scope' <> 'internal_preview_escalation_lease'
     or not (act1->>'claim_eligible')::boolean
     or (act1->>'requeue_execution_authorized')::boolean
     or (act1->>'automatic_notification_authorized')::boolean
     or (act1->>'notifier_send_authorized')::boolean
     or (act1->>'provider_write_authorized')::boolean
     or (act1->>'booking_launch_authorized')::boolean
     or (act1->>'destructive_cleanup_authorized')::boolean
     or not (act1->>'server_time_authoritative')::boolean then
    raise exception 'Phase W activation gate failed: %, %',act1,act1r;
  end if;

  if act1->>'lineage_ref' <> c1->>'lineage_ref'
     or (act1->>'dead_letter_event_id')::bigint <> d1 then
    raise exception 'Phase W lineage binding mismatch: %, %',act1,c1;
  end if;

  if (select count(*) from public.lesson_booking_preview_launch_blocker_requeue_work_activations
      where work_generation_id=(c1->>'work_generation_id')::bigint) <> 1 then
    raise exception 'Phase W activation must remain single-use';
  end if;

  begin
    perform public.service_activate_booking_preview_launch_blocker_requeue_lineage(
      (c1->>'work_generation_id')::bigint,repeat('c',32)
    );
  exception when unique_violation then
    conflict:=true;
  end;
  if not conflict then
    raise exception 'Phase W accepted a conflicting activation key';
  end if;

  begin
    update public.lesson_booking_preview_launch_blocker_requeue_work_activations
    set activation_status=activation_status;
  exception when others then
    mutate:=true;
  end;
  if not mutate then
    raise exception 'Phase W activation evidence was mutable';
  end if;
end $$;

do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.service_activate_booking_preview_launch_blocker_requeue_lineage(bigint,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated unexpectedly has Phase W service RPC';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.service_activate_booking_preview_launch_blocker_requeue_lineage(bigint,text)',
    'EXECUTE'
  ) then
    raise exception 'service_role missing Phase W service RPC';
  end if;

  if has_table_privilege(
      'authenticated',
      'public.lesson_booking_preview_launch_blocker_requeue_work_activations',
      'SELECT'
    ) or has_table_privilege(
      'service_role',
      'public.lesson_booking_preview_launch_blocker_requeue_work_activations',
      'SELECT'
    ) then
    raise exception 'Phase W activation evidence must remain RPC-only';
  end if;
end $$;

rollback;
