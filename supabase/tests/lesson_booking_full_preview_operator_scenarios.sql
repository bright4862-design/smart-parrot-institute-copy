-- Phase 4C5G read-only operator bootstrap/readiness proof scenarios. Ephemeral CI only.
begin;

insert into auth.users(id,raw_user_meta_data) values
  ('79000000-0000-0000-0000-000000000001','{"full_name":"Phase4C5G Admin"}'),
  ('79000000-0000-0000-0000-000000000002','{"full_name":"Phase4C5G Outsider"}');
update public.profiles set role='admin' where id='79000000-0000-0000-0000-000000000001';

create or replace function auth.uid() returns uuid language sql stable as $$
  select '79000000-0000-0000-0000-000000000001'::uuid
$$;

do $$
declare
  run_payload jsonb;
  read_payload jsonb;
  proof jsonb;
  stale_proof jsonb;
  updated_before timestamptz;
  updated_after timestamptz;
  checkpoints_before int;
  checkpoints_after int;
begin
  select public.admin_begin_booking_full_preview_run(
    '79000000-0000-4000-8000-000000000100',
    'near_term_success',
    '2026-09-20 22:20+00'
  ) into run_payload;

  select updated_at into updated_before
  from public.lesson_booking_full_preview_runs
  where run_id='79000000-0000-4000-8000-000000000100';
  select count(*)::int into checkpoints_before
  from public.lesson_booking_full_preview_run_checkpoints
  where run_id='79000000-0000-4000-8000-000000000100';

  select public.admin_get_booking_full_preview_run(
    '79000000-0000-4000-8000-000000000100'
  ) into read_payload;

  select updated_at into updated_after
  from public.lesson_booking_full_preview_runs
  where run_id='79000000-0000-4000-8000-000000000100';
  select count(*)::int into checkpoints_after
  from public.lesson_booking_full_preview_run_checkpoints
  where run_id='79000000-0000-4000-8000-000000000100';

  if read_payload->>'run_id' <> '79000000-0000-4000-8000-000000000100'
     or read_payload->>'state' <> 'initialized'
     or not (read_payload->>'replay')::boolean then
    raise exception 'Unexpected read-only run lookup payload: %', read_payload;
  end if;
  if updated_after is distinct from updated_before or checkpoints_after <> checkpoints_before then
    raise exception 'Read-only run lookup mutated durable orchestration state';
  end if;

  select public.admin_booking_webhook_readiness_proof('2026-09-20 22:30+00') into proof;
  if proof->>'status' <> 'blocked'
     or (proof#>>'{checks,stripe_checkout_signed_test_delivery,ready}')::boolean
     or (proof#>>'{checks,stripe_dispute_signed_test_delivery,ready}')::boolean then
    raise exception 'Missing webhook evidence unexpectedly reported ready: %', proof;
  end if;

  insert into public.stripe_events(id,type,payload,received_at,processed_at)
  values ('evt_phase4c5g_checkout','checkout.session.completed','{}','2026-09-20 22:25+00','2026-09-20 22:25+00');

  insert into public.stripe_dispute_events(
    provider_event_id,dispute_id,event_type,dispute_status,reason,
    amount_cents,currency,event_created_at,received_at
  ) values (
    'evt_phase4c5g_dispute','du_phase4c5g','charge.dispute.created','needs_response','general',
    4900,'eur','2026-09-20 22:26+00','2026-09-20 22:26+00'
  );

  select public.admin_booking_webhook_readiness_proof('2026-09-20 22:30+00') into proof;
  if proof->>'status' <> 'ready'
     or not (proof#>>'{checks,stripe_checkout_signed_test_delivery,ready}')::boolean
     or not (proof#>>'{checks,stripe_dispute_signed_test_delivery,ready}')::boolean then
    raise exception 'Recent webhook evidence did not report ready: %', proof;
  end if;

  select public.admin_booking_webhook_readiness_proof('2026-09-28 22:30+00') into stale_proof;
  if stale_proof->>'status' <> 'blocked'
     or stale_proof#>>'{checks,stripe_checkout_signed_test_delivery,status}' <> 'verified_test_delivery_stale'
     or stale_proof#>>'{checks,stripe_dispute_signed_test_delivery,status}' <> 'verified_test_delivery_stale' then
    raise exception 'Stale webhook evidence was not rejected: %', stale_proof;
  end if;
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$
  select '79000000-0000-0000-0000-000000000002'::uuid
$$;

do $$
declare
  lookup_blocked boolean := false;
  proof_blocked boolean := false;
begin
  begin
    perform public.admin_get_booking_full_preview_run('79000000-0000-4000-8000-000000000100');
  exception when insufficient_privilege then
    lookup_blocked := true;
  end;
  begin
    perform public.admin_booking_webhook_readiness_proof('2026-09-20 22:30+00');
  exception when insufficient_privilege then
    proof_blocked := true;
  end;
  if not lookup_blocked or not proof_blocked then
    raise exception 'Non-admin operator proof/lookup unexpectedly succeeded';
  end if;
end $$;

rollback;
