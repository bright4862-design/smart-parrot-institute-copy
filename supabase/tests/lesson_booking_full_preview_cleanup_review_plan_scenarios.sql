-- Phase 4C5M cleanup-review candidate + dry-run plan scenarios. Ephemeral CI only.
begin;

insert into auth.users(id,raw_user_meta_data) values
  ('8c000000-0000-0000-0000-000000000011','{"full_name":"Phase4C5M Admin"}'),
  ('8c000000-0000-0000-0000-000000000012','{"full_name":"Phase4C5M Outsider"}');
update public.profiles set role='admin' where id='8c000000-0000-0000-0000-000000000011';

insert into public.lesson_booking_full_preview_runs(
  run_id,scenario,state,pause_reason,terminal,revision,last_booking_status,
  created_by,created_at,updated_at,last_observed_at,completed_at
) values
  ('8c000000-0000-4000-8000-000000000200','near_term_success','complete',null,true,2,'settled',
   '8c000000-0000-0000-0000-000000000011',statement_timestamp()-interval '42 days',statement_timestamp()-interval '41 days',statement_timestamp()-interval '41 days',statement_timestamp()-interval '41 days'),
  ('8c000000-0000-4000-8000-000000000201','near_term_success','complete',null,true,2,'settled',
   '8c000000-0000-0000-0000-000000000011',statement_timestamp()-interval '43 days',statement_timestamp()-interval '42 days',statement_timestamp()-interval '42 days',statement_timestamp()-interval '42 days'),
  ('8c000000-0000-4000-8000-000000000202','near_term_success','cancelled',null,true,2,'cancelled',
   '8c000000-0000-0000-0000-000000000011',statement_timestamp()-interval '44 days',statement_timestamp()-interval '43 days',statement_timestamp()-interval '43 days',statement_timestamp()-interval '43 days'),
  ('8c000000-0000-4000-8000-000000000203','near_term_success','complete',null,true,2,'settled',
   '8c000000-0000-0000-0000-000000000011',statement_timestamp()-interval '45 days',statement_timestamp()-interval '44 days',statement_timestamp()-interval '44 days',statement_timestamp()-interval '44 days');

insert into public.lesson_booking_full_preview_terminal_evidence(
  run_id,schema_version,terminal_state,transcript_sha256,correlation_sha256,
  session_close_status,fixture_cleanup_status,reconciliation_required,recorded_by,recorded_at
) values
  ('8c000000-0000-4000-8000-000000000200','smart_parrot_full_preview_terminal_evidence_v1','complete',repeat('1',64),repeat('2',64),
   'fixture_sessions_closed','fixture_cleanup_complete',false,'8c000000-0000-0000-0000-000000000011',statement_timestamp()-interval '41 days'),
  ('8c000000-0000-4000-8000-000000000201','smart_parrot_full_preview_terminal_evidence_v1','complete',repeat('3',64),repeat('4',64),
   'fixture_session_close_ambiguous','fixture_cleanup_ambiguous',true,'8c000000-0000-0000-0000-000000000011',statement_timestamp()-interval '42 days'),
  ('8c000000-0000-4000-8000-000000000202','smart_parrot_full_preview_terminal_evidence_v1','cancelled',repeat('5',64),repeat('6',64),
   'fixture_session_close_ambiguous','fixture_cleanup_ambiguous',true,'8c000000-0000-0000-0000-000000000011',statement_timestamp()-interval '43 days'),
  ('8c000000-0000-4000-8000-000000000203','smart_parrot_full_preview_terminal_evidence_v1','complete',repeat('7',64),repeat('8',64),
   'fixture_sessions_closed','fixture_cleanup_complete',false,'8c000000-0000-0000-0000-000000000011',statement_timestamp()-interval '44 days');

select public.service_record_booking_full_preview_reconciliation_resolution(
  '8c000000-0000-4000-8000-000000000201','cleanup_verified',repeat('4',64),repeat('9',64)
);
select public.service_record_booking_full_preview_reconciliation_resolution(
  '8c000000-0000-4000-8000-000000000202','preserve',repeat('6',64),repeat('a',64)
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select '8c000000-0000-0000-0000-000000000011'::uuid
$$;

do $$
declare
  review_a jsonb;
  review_b jsonb;
  review_preserve jsonb;
  review_expired jsonb;
  plan_a jsonb;
  replay_a jsonb;
  stale_blocked boolean := false;
  preserve_blocked boolean := false;
  q jsonb;
begin
  select public.admin_record_booking_full_preview_retention_review(
    '8c000000-0000-4000-8000-000000000200','eligible_for_cleanup_review'
  ) into review_a;
  select public.admin_record_booking_full_preview_retention_review(
    '8c000000-0000-4000-8000-000000000201','eligible_for_cleanup_review'
  ) into review_b;
  select public.admin_record_booking_full_preview_retention_review(
    '8c000000-0000-4000-8000-000000000202','preserve'
  ) into review_preserve;
  select public.admin_record_booking_full_preview_retention_review(
    '8c000000-0000-4000-8000-000000000203','eligible_for_cleanup_review'
  ) into review_expired;

  if review_a->>'basis_status' <> 'retention_review_due'
     or review_b->>'basis_status' <> 'retention_review_due'
     or review_preserve->>'basis_status' <> 'reconciliation_preserved'
     or review_expired->>'basis_status' <> 'retention_review_due' then
    raise exception 'Unexpected Phase 4C5M retention review basis';
  end if;

  select public.admin_prepare_booking_full_preview_cleanup_review_plan(
    '8c000000-0000-4000-8000-000000000200',
    (review_a->>'reviewed_at')::timestamptz
  ) into plan_a;

  if plan_a->>'plan_state' <> 'dry_run_only'
     or plan_a->>'plan_status' <> 'active'
     or (plan_a->>'destructive_cleanup_authorized')::boolean
     or (plan_a->>'cleanup_execution_enabled')::boolean
     or not (plan_a->>'server_time_authoritative')::boolean
     or (plan_a->>'replay')::boolean then
    raise exception 'Unexpected first cleanup-review plan: %', plan_a;
  end if;

  select public.admin_prepare_booking_full_preview_cleanup_review_plan(
    '8c000000-0000-4000-8000-000000000200',
    (review_a->>'reviewed_at')::timestamptz
  ) into replay_a;
  if not (replay_a->>'replay')::boolean then
    raise exception 'Cleanup-review plan did not replay idempotently: %', replay_a;
  end if;

  begin
    perform public.admin_prepare_booking_full_preview_cleanup_review_plan(
      '8c000000-0000-4000-8000-000000000201',
      (review_b->>'reviewed_at')::timestamptz - interval '1 second'
    );
  exception when invalid_parameter_value then
    stale_blocked := true;
  end;
  if not stale_blocked then raise exception 'Stale retention review timestamp was not rejected'; end if;

  begin
    perform public.admin_prepare_booking_full_preview_cleanup_review_plan(
      '8c000000-0000-4000-8000-000000000202',
      (review_preserve->>'reviewed_at')::timestamptz
    );
  exception when invalid_parameter_value then
    preserve_blocked := true;
  end;
  if not preserve_blocked then raise exception 'Preserved reconciliation unexpectedly produced cleanup-review plan'; end if;

  insert into public.lesson_booking_full_preview_cleanup_review_plans(
    run_id,schema_version,retention_reviewed_at,retention_review_decision,
    plan_state,generated_by,generated_at,expires_at
  ) values (
    '8c000000-0000-4000-8000-000000000203',
    'smart_parrot_full_preview_cleanup_review_plan_v1',
    (review_expired->>'reviewed_at')::timestamptz,
    'eligible_for_cleanup_review',
    'dry_run_only',
    '8c000000-0000-0000-0000-000000000011',
    statement_timestamp()-interval '2 days',
    statement_timestamp()-interval '1 day'
  );

  select jsonb_agg(to_jsonb(x) order by x.run_id) into q
  from public.admin_booking_full_preview_cleanup_review_queue(50) x;

  if jsonb_array_length(coalesce(q,'[]'::jsonb)) <> 3 then
    raise exception 'Unexpected cleanup-review queue size: %', q;
  end if;
  if not q @> '[{"run_id":"8c000000-0000-4000-8000-000000000200","plan_status":"active","destructive_cleanup_authorized":false,"cleanup_execution_enabled":false}]'::jsonb
     or not q @> '[{"run_id":"8c000000-0000-4000-8000-000000000201","plan_status":"not_prepared"}]'::jsonb
     or not q @> '[{"run_id":"8c000000-0000-4000-8000-000000000203","plan_status":"expired"}]'::jsonb then
    raise exception 'Cleanup-review queue did not preserve expected dry-run states: %', q;
  end if;
  if q @> '[{"run_id":"8c000000-0000-4000-8000-000000000202"}]'::jsonb then
    raise exception 'Preserved evidence appeared in cleanup-review queue: %', q;
  end if;
end $$;

do $$
begin
  if has_table_privilege('authenticated','public.lesson_booking_full_preview_cleanup_review_plans','SELECT') then
    raise exception 'Authenticated role unexpectedly has direct cleanup-review plan table access';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.admin_booking_full_preview_cleanup_review_queue(integer)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated role is missing guarded cleanup-review queue RPC access';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.admin_prepare_booking_full_preview_cleanup_review_plan(uuid,timestamp with time zone)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated role is missing guarded cleanup-review plan RPC access';
  end if;
end $$;

do $$
declare
  update_blocked boolean := false;
begin
  begin
    update public.lesson_booking_full_preview_cleanup_review_plans
       set plan_state='dry_run_only'
     where run_id='8c000000-0000-4000-8000-000000000200';
  exception when others then
    update_blocked := true;
  end;
  if not update_blocked then raise exception 'Cleanup-review plan was unexpectedly mutable'; end if;
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$
  select '8c000000-0000-0000-0000-000000000012'::uuid
$$;

do $$
declare
  queue_blocked boolean := false;
  plan_blocked boolean := false;
begin
  begin
    perform * from public.admin_booking_full_preview_cleanup_review_queue(10);
  exception when insufficient_privilege then
    queue_blocked := true;
  end;
  if not queue_blocked then raise exception 'Non-admin unexpectedly read cleanup-review queue'; end if;

  begin
    perform public.admin_prepare_booking_full_preview_cleanup_review_plan(
      '8c000000-0000-4000-8000-000000000200',
      statement_timestamp()
    );
  exception when insufficient_privilege then
    plan_blocked := true;
  end;
  if not plan_blocked then raise exception 'Non-admin unexpectedly prepared cleanup-review plan'; end if;
end $$;

rollback;
