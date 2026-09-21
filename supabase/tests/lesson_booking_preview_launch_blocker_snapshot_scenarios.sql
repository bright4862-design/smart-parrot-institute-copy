-- Phase 4C5P immutable preview launch-blocker snapshot + operational alert evidence scenarios.
-- Ephemeral CI only. No provider calls, browser time, provider writes, launch, or destructive cleanup.
begin;

insert into auth.users(id,raw_user_meta_data) values
  ('8d000000-0000-0000-0000-000000000051','{"full_name":"Phase4C5P Operator"}');
update public.profiles set role='admin' where id='8d000000-0000-0000-0000-000000000051';

-- Start with validly shaped but stale signed-provider/rehearsal evidence.
insert into public.stripe_events(id,type,payload,received_at)
values ('evt_phase4c5p_stale_main','checkout.session.completed','{}'::jsonb,statement_timestamp()-interval '8 days');

insert into public.stripe_dispute_events(
  provider_event_id,dispute_id,event_type,dispute_status,reason,amount_cents,currency,event_created_at,received_at
) values (
  'evt_phase4c5p_stale_dispute','du_phase4c5p_stale','charge.dispute.created','needs_response','general',1000,'eur',
  statement_timestamp()-interval '8 days',statement_timestamp()-interval '8 days'
);

insert into public.lesson_booking_provider_rehearsals(
  run_id,schema_version,started_at,completed_at,preview_project_verified,stripe_account_verified,
  daily_webhook_domain_verified,stripe_customer_created,stripe_customer_deleted,daily_room_created,daily_room_deleted,
  cleanup_complete,status,failure_code,evidence_sha256,ingested_by
) values (
  '8d000000-0000-4000-8000-000000000500','smart_parrot_provider_preview_e2e_v1',
  statement_timestamp()-interval '8 days 5 minutes',statement_timestamp()-interval '8 days',
  true,true,true,false,false,false,false,true,'passed',null,repeat('b',64),
  '8d000000-0000-0000-0000-000000000051'
);

do $$
declare
  stale_snapshot jsonb;
  ready_snapshot jsonb;
  replay_snapshot jsonb;
  gate_blocked_snapshot jsonb;
  secret_blocked_snapshot jsonb;
  ready_snapshot_id bigint;
  snapshot_count integer;
  alert_count integer;
  mutation_blocked boolean := false;
begin
  select public.service_record_booking_preview_launch_blocker_snapshot(
    true,true,true,true,true,true,true,true,true
  ) into stale_snapshot;

  if stale_snapshot->>'status' <> 'blocked'
     or not ((stale_snapshot->'blocker_codes') ? 'stripe_checkout_signed_proof_stale_or_missing')
     or not ((stale_snapshot->'blocker_codes') ? 'stripe_dispute_signed_proof_stale_or_missing')
     or not ((stale_snapshot->'blocker_codes') ? 'provider_rehearsal_stale_or_missing')
     or stale_snapshot->'alert'->>'change_kind' <> 'initial_state' then
    raise exception 'Phase 4C5P stale signed-provider proof was not blocked deterministically: %', stale_snapshot;
  end if;

  insert into public.stripe_events(id,type,payload,received_at)
  values ('evt_phase4c5p_fresh_main','checkout.session.completed','{}'::jsonb,statement_timestamp());

  insert into public.stripe_dispute_events(
    provider_event_id,dispute_id,event_type,dispute_status,reason,amount_cents,currency,event_created_at,received_at
  ) values (
    'evt_phase4c5p_fresh_dispute','du_phase4c5p_fresh','charge.dispute.closed','won','general',1000,'eur',
    statement_timestamp(),statement_timestamp()
  );

  insert into public.lesson_booking_provider_rehearsals(
    run_id,schema_version,started_at,completed_at,preview_project_verified,stripe_account_verified,
    daily_webhook_domain_verified,stripe_customer_created,stripe_customer_deleted,daily_room_created,daily_room_deleted,
    cleanup_complete,status,failure_code,evidence_sha256,ingested_by
  ) values (
    '8d000000-0000-4000-8000-000000000501','smart_parrot_provider_preview_e2e_v1',
    statement_timestamp()-interval '1 minute',statement_timestamp(),
    true,true,true,false,false,false,false,true,'passed',null,repeat('c',64),
    '8d000000-0000-0000-0000-000000000051'
  );

  select public.service_record_booking_preview_launch_blocker_snapshot(
    true,true,true,true,true,true,true,true,true
  ) into ready_snapshot;

  if ready_snapshot->>'status' <> 'ready'
     or jsonb_array_length(ready_snapshot->'blocker_codes') <> 0
     or ready_snapshot->'alert'->>'change_kind' <> 'became_ready'
     or (ready_snapshot->>'provider_write_authorized')::boolean
     or (ready_snapshot->>'booking_launch_authorized')::boolean
     or (ready_snapshot->>'destructive_cleanup_authorized')::boolean
     or not (ready_snapshot->>'server_time_authoritative')::boolean then
    raise exception 'Phase 4C5P ready advisory snapshot crossed an authority boundary: %', ready_snapshot;
  end if;
  ready_snapshot_id := (ready_snapshot->>'snapshot_id')::bigint;

  select public.service_record_booking_preview_launch_blocker_snapshot(
    true,true,true,true,true,true,true,true,true
  ) into replay_snapshot;

  if not (replay_snapshot->>'replay')::boolean
     or not (replay_snapshot->'alert'->>'replay')::boolean
     or replay_snapshot->'alert'->>'change_kind' <> 'unchanged'
     or (replay_snapshot->>'snapshot_id')::bigint <> ready_snapshot_id then
    raise exception 'Phase 4C5P identical snapshot/alert replay was not idempotent: %', replay_snapshot;
  end if;

  select count(*)::integer into snapshot_count from public.lesson_booking_preview_launch_blocker_snapshots;
  select count(*)::integer into alert_count from public.lesson_booking_preview_launch_blocker_alerts;
  if snapshot_count <> 2 or alert_count <> 2 then
    raise exception 'Phase 4C5P identical replay created duplicate durable evidence: snapshots %, alerts %', snapshot_count, alert_count;
  end if;

  select public.service_record_booking_preview_launch_blocker_snapshot(
    true,true,true,true,true,true,true,true,false
  ) into gate_blocked_snapshot;
  if gate_blocked_snapshot->>'status' <> 'blocked'
     or not ((gate_blocked_snapshot->'blocker_codes') ? 'worker_write_gate_closed')
     or gate_blocked_snapshot->'alert'->>'change_kind' <> 'became_blocked' then
    raise exception 'Phase 4C5P closed worker gate was not surfaced as a blocker transition: %', gate_blocked_snapshot;
  end if;

  select public.service_record_booking_preview_launch_blocker_snapshot(
    false,true,true,true,true,true,true,true,false
  ) into secret_blocked_snapshot;
  if secret_blocked_snapshot->>'status' <> 'blocked'
     or not ((secret_blocked_snapshot->'blocker_codes') ? 'provider_secret_bundle_missing')
     or secret_blocked_snapshot->'alert'->>'change_kind' <> 'blockers_changed' then
    raise exception 'Phase 4C5P missing provider secret readiness was not surfaced: %', secret_blocked_snapshot;
  end if;

  if secret_blocked_snapshot ? 'stripe_account_id'
     or secret_blocked_snapshot ? 'provider_object_id'
     or secret_blocked_snapshot ? 'fixture_user_id'
     or secret_blocked_snapshot ? 'payment_data'
     or secret_blocked_snapshot ? 'webhook_secret'
     or secret_blocked_snapshot ? 'token' then
    raise exception 'Phase 4C5P snapshot exposed prohibited provider/identity/payment material';
  end if;

  begin
    update public.lesson_booking_preview_launch_blocker_snapshots
    set status=status
    where snapshot_id=ready_snapshot_id;
  exception when others then
    mutation_blocked := true;
  end;
  if not mutation_blocked then
    raise exception 'Phase 4C5P snapshot table is not append-only';
  end if;
end $$;

do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.service_record_booking_preview_launch_blocker_snapshot(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must not execute Phase 4C5P service snapshot RPC';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.service_record_booking_preview_launch_blocker_snapshot(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean)',
    'EXECUTE'
  ) then
    raise exception 'service_role must execute Phase 4C5P service snapshot RPC';
  end if;
  if has_table_privilege('authenticated','public.lesson_booking_preview_launch_blocker_snapshots','SELECT')
     or has_table_privilege('service_role','public.lesson_booking_preview_launch_blocker_snapshots','SELECT')
     or has_table_privilege('authenticated','public.lesson_booking_preview_launch_blocker_alerts','SELECT')
     or has_table_privilege('service_role','public.lesson_booking_preview_launch_blocker_alerts','SELECT') then
    raise exception 'Phase 4C5P evidence tables must remain RPC-only';
  end if;
end $$;

rollback;
