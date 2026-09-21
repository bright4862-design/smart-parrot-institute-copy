-- Phase 4C5L trusted reconciliation resolution + retention-review audit scenarios. Ephemeral CI only.
begin;

insert into auth.users(id,raw_user_meta_data) values
  ('7b000000-0000-0000-0000-000000000011','{"full_name":"Phase4C5L Admin"}'),
  ('7b000000-0000-0000-0000-000000000012','{"full_name":"Phase4C5L Outsider"}');
update public.profiles set role='admin' where id='7b000000-0000-0000-0000-000000000011';

insert into public.lesson_booking_full_preview_runs(
  run_id,scenario,state,pause_reason,terminal,revision,last_booking_status,
  created_by,created_at,updated_at,last_observed_at,completed_at
) values
  ('7b000000-0000-4000-8000-000000000200','near_term_success','complete',null,true,2,'settled',
   '7b000000-0000-0000-0000-000000000011',statement_timestamp()-interval '41 days',statement_timestamp()-interval '40 days',statement_timestamp()-interval '40 days',statement_timestamp()-interval '40 days'),
  ('7b000000-0000-4000-8000-000000000201','near_term_success','complete',null,true,2,'settled',
   '7b000000-0000-0000-0000-000000000011',statement_timestamp()-interval '36 days',statement_timestamp()-interval '35 days',statement_timestamp()-interval '35 days',statement_timestamp()-interval '35 days'),
  ('7b000000-0000-4000-8000-000000000202','near_term_success','cancelled',null,true,2,'cancelled',
   '7b000000-0000-0000-0000-000000000011',statement_timestamp()-interval '5 days',statement_timestamp()-interval '4 days',statement_timestamp()-interval '4 days',statement_timestamp()-interval '4 days'),
  ('7b000000-0000-4000-8000-000000000203','near_term_success','complete',null,true,2,'settled',
   '7b000000-0000-0000-0000-000000000011',statement_timestamp()-interval '3 hours',statement_timestamp()-interval '2 hours',statement_timestamp()-interval '2 hours',statement_timestamp()-interval '2 hours'),
  ('7b000000-0000-4000-8000-000000000204','near_term_success','complete',null,true,2,'settled',
   '7b000000-0000-0000-0000-000000000011',statement_timestamp()-interval '5 days',statement_timestamp()-interval '4 days',statement_timestamp()-interval '4 days',statement_timestamp()-interval '4 days');

insert into public.lesson_booking_full_preview_terminal_evidence(
  run_id,schema_version,terminal_state,transcript_sha256,correlation_sha256,
  session_close_status,fixture_cleanup_status,reconciliation_required,recorded_by,recorded_at
) values
  ('7b000000-0000-4000-8000-000000000200','smart_parrot_full_preview_terminal_evidence_v1','complete',repeat('a',64),repeat('b',64),
   'fixture_session_close_ambiguous','fixture_cleanup_deferred_session_close_ambiguous',true,'7b000000-0000-0000-0000-000000000011',statement_timestamp()-interval '40 days'),
  ('7b000000-0000-4000-8000-000000000201','smart_parrot_full_preview_terminal_evidence_v1','complete',repeat('c',64),repeat('d',64),
   'fixture_sessions_closed','fixture_cleanup_complete',false,'7b000000-0000-0000-0000-000000000011',statement_timestamp()-interval '35 days'),
  ('7b000000-0000-4000-8000-000000000202','smart_parrot_full_preview_terminal_evidence_v1','cancelled',repeat('e',64),repeat('f',64),
   'fixture_session_close_ambiguous','fixture_cleanup_ambiguous',true,'7b000000-0000-0000-0000-000000000011',statement_timestamp()-interval '4 days'),
  ('7b000000-0000-4000-8000-000000000204','smart_parrot_full_preview_terminal_evidence_v1','complete',repeat('1',64),repeat('2',64),
   'fixture_session_close_ambiguous','fixture_cleanup_deferred_write_gate_closed',true,'7b000000-0000-0000-0000-000000000011',statement_timestamp()-interval '4 days');

do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.service_record_booking_full_preview_reconciliation_resolution(uuid,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated role unexpectedly has service-only reconciliation resolution access';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.service_record_booking_full_preview_reconciliation_resolution(uuid,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'Service role is missing trusted reconciliation resolution access';
  end if;
  if has_table_privilege('authenticated','public.lesson_booking_full_preview_reconciliation_resolutions','SELECT')
     or has_table_privilege('authenticated','public.lesson_booking_full_preview_retention_reviews','SELECT') then
    raise exception 'Authenticated role unexpectedly has direct reconciliation/retention audit table access';
  end if;
end $$;

do $$
declare
  first_result jsonb;
  replay_result jsonb;
  preserve_result jsonb;
  stale_blocked boolean := false;
  conflict_blocked boolean := false;
  missing_blocked boolean := false;
begin
  select public.service_record_booking_full_preview_reconciliation_resolution(
    '7b000000-0000-4000-8000-000000000200',
    'cleanup_verified',
    repeat('b',64),
    repeat('9',64)
  ) into first_result;
  if (first_result->>'replay')::boolean
     or first_result->>'resolution_kind' <> 'cleanup_verified'
     or (first_result->>'destructive_cleanup_authorized')::boolean
     or not (first_result->>'server_verified')::boolean then
    raise exception 'Unexpected first reconciliation resolution result: %', first_result;
  end if;

  select public.service_record_booking_full_preview_reconciliation_resolution(
    '7b000000-0000-4000-8000-000000000200',
    'cleanup_verified',
    repeat('b',64),
    repeat('9',64)
  ) into replay_result;
  if not (replay_result->>'replay')::boolean then
    raise exception 'Identical reconciliation resolution did not replay idempotently: %', replay_result;
  end if;

  begin
    perform public.service_record_booking_full_preview_reconciliation_resolution(
      '7b000000-0000-4000-8000-000000000200',
      'cleanup_verified',
      repeat('a',64),
      repeat('9',64)
    );
  exception when invalid_parameter_value then
    stale_blocked := true;
  end;
  if not stale_blocked then raise exception 'Stale correlation hash was not rejected'; end if;

  begin
    perform public.service_record_booking_full_preview_reconciliation_resolution(
      '7b000000-0000-4000-8000-000000000200',
      'cleanup_verified',
      repeat('b',64),
      repeat('8',64)
    );
  exception when unique_violation then
    conflict_blocked := true;
  end;
  if not conflict_blocked then raise exception 'Conflicting reconciliation replay was not rejected'; end if;

  select public.service_record_booking_full_preview_reconciliation_resolution(
    '7b000000-0000-4000-8000-000000000202',
    'preserve',
    repeat('f',64),
    repeat('7',64)
  ) into preserve_result;
  if preserve_result->>'resolution_kind' <> 'preserve' then
    raise exception 'Preserve reconciliation resolution was not recorded: %', preserve_result;
  end if;

  begin
    perform public.service_record_booking_full_preview_reconciliation_resolution(
      '7b000000-0000-4000-8000-000000000203',
      'cleanup_verified',
      repeat('3',64),
      repeat('4',64)
    );
  exception when no_data_found then
    missing_blocked := true;
  end;
  if not missing_blocked then
    raise exception 'Missing terminal evidence unexpectedly accepted a trusted reconciliation resolution';
  end if;
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$
  select '7b000000-0000-0000-0000-000000000011'::uuid
$$;

do $$
declare
  q jsonb;
  status_cleanup jsonb;
  status_due jsonb;
  status_preserve jsonb;
  status_unresolved jsonb;
  review_due jsonb;
  review_due_replay jsonb;
  review_preserve jsonb;
  review_hold_preserve jsonb;
  ineligible_blocked boolean := false;
  conflicting_review_blocked boolean := false;
begin
  select jsonb_agg(to_jsonb(x)) into q
  from public.admin_booking_full_preview_reconciliation_queue(50) x;

  if jsonb_array_length(coalesce(q,'[]'::jsonb)) <> 2 then
    raise exception 'Unexpected Phase 4C5L reconciliation queue payload: %', q;
  end if;
  if q @> '[{"run_id":"7b000000-0000-4000-8000-000000000200"}]'::jsonb
     or q @> '[{"run_id":"7b000000-0000-4000-8000-000000000202"}]'::jsonb then
    raise exception 'Trusted resolved items remained in reconciliation queue: %', q;
  end if;
  if not q @> '[{"run_id":"7b000000-0000-4000-8000-000000000203","reason":"Terminal preview evidence is missing after the server grace window"}]'::jsonb
     or not q @> '[{"run_id":"7b000000-0000-4000-8000-000000000204","retention_status":"reconciliation_hold"}]'::jsonb then
    raise exception 'Unresolved/missing evidence was not retained in queue: %', q;
  end if;

  select public.admin_booking_full_preview_terminal_retention_status(
    '7b000000-0000-4000-8000-000000000200'
  ) into status_cleanup;
  if status_cleanup->>'retention_status' <> 'retention_active'
     or not (status_cleanup->>'reconciliation_resolved')::boolean
     or status_cleanup->>'reconciliation_resolution_kind' <> 'cleanup_verified'
     or (status_cleanup->>'retention_review_due')::boolean
     or (status_cleanup->>'destructive_cleanup_authorized')::boolean
     or (status_cleanup->>'cleanup_execution_enabled')::boolean then
    raise exception 'Cleanup-verified evidence did not restart bounded retention safely: %', status_cleanup;
  end if;

  select public.admin_booking_full_preview_terminal_retention_status(
    '7b000000-0000-4000-8000-000000000201'
  ) into status_due;
  if status_due->>'retention_status' <> 'retention_review_due'
     or not (status_due->>'retention_review_due')::boolean then
    raise exception 'Old non-reconciliation evidence was not review-due: %', status_due;
  end if;

  select public.admin_booking_full_preview_terminal_retention_status(
    '7b000000-0000-4000-8000-000000000202'
  ) into status_preserve;
  if status_preserve->>'retention_status' <> 'retention_preserved'
     or status_preserve->>'reconciliation_resolution_kind' <> 'preserve'
     or status_preserve->'retention_review_after' <> 'null'::jsonb then
    raise exception 'Preserve reconciliation did not block cleanup-review eligibility: %', status_preserve;
  end if;

  select public.admin_booking_full_preview_terminal_retention_status(
    '7b000000-0000-4000-8000-000000000204'
  ) into status_unresolved;
  if status_unresolved->>'retention_status' <> 'reconciliation_hold'
     or (status_unresolved->>'reconciliation_resolved')::boolean then
    raise exception 'Unresolved reconciliation hold lost precedence: %', status_unresolved;
  end if;

  select public.admin_record_booking_full_preview_retention_review(
    '7b000000-0000-4000-8000-000000000201',
    'eligible_for_cleanup_review'
  ) into review_due;
  if review_due->>'decision' <> 'eligible_for_cleanup_review'
     or review_due->>'basis_status' <> 'retention_review_due'
     or (review_due->>'destructive_cleanup_authorized')::boolean
     or (review_due->>'cleanup_execution_enabled')::boolean
     or not (review_due->>'server_time_authoritative')::boolean then
    raise exception 'Review-due evidence did not record minimized cleanup-review eligibility: %', review_due;
  end if;

  select public.admin_record_booking_full_preview_retention_review(
    '7b000000-0000-4000-8000-000000000201',
    'eligible_for_cleanup_review'
  ) into review_due_replay;
  if not (review_due_replay->>'replay')::boolean then
    raise exception 'Identical retention review did not replay idempotently: %', review_due_replay;
  end if;

  begin
    perform public.admin_record_booking_full_preview_retention_review(
      '7b000000-0000-4000-8000-000000000201',
      'preserve'
    );
  exception when unique_violation then
    conflicting_review_blocked := true;
  end;
  if not conflicting_review_blocked then
    raise exception 'Conflicting immutable retention review was not rejected';
  end if;

  begin
    perform public.admin_record_booking_full_preview_retention_review(
      '7b000000-0000-4000-8000-000000000200',
      'eligible_for_cleanup_review'
    );
  exception when invalid_parameter_value then
    ineligible_blocked := true;
  end;
  if not ineligible_blocked then
    raise exception 'Fresh post-reconciliation evidence became cleanup-review eligible too early';
  end if;

  select public.admin_record_booking_full_preview_retention_review(
    '7b000000-0000-4000-8000-000000000202',
    'preserve'
  ) into review_preserve;
  if review_preserve->>'basis_status' <> 'reconciliation_preserved' then
    raise exception 'Preserve reconciliation review did not retain preservation basis: %', review_preserve;
  end if;

  select public.admin_record_booking_full_preview_retention_review(
    '7b000000-0000-4000-8000-000000000204',
    'preserve'
  ) into review_hold_preserve;
  if review_hold_preserve->>'basis_status' <> 'reconciliation_hold' then
    raise exception 'Unresolved reconciliation hold did not take precedence over preserve audit: %', review_hold_preserve;
  end if;

  select public.admin_booking_full_preview_terminal_retention_status(
    '7b000000-0000-4000-8000-000000000204'
  ) into status_unresolved;
  if status_unresolved->>'retention_status' <> 'reconciliation_hold'
     or status_unresolved->>'retention_review_decision' <> 'preserve' then
    raise exception 'Retention status failed to expose preserve audit without clearing hold: %', status_unresolved;
  end if;
end $$;

do $$
declare
  update_blocked boolean := false;
begin
  begin
    update public.lesson_booking_full_preview_retention_reviews
       set decision='preserve'
     where run_id='7b000000-0000-4000-8000-000000000201';
  exception when others then
    update_blocked := true;
  end;
  if not update_blocked then raise exception 'Retention review audit was unexpectedly mutable'; end if;
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$
  select '7b000000-0000-0000-0000-000000000012'::uuid
$$;

do $$
declare
  review_blocked boolean := false;
begin
  begin
    perform public.admin_record_booking_full_preview_retention_review(
      '7b000000-0000-4000-8000-000000000201',
      'eligible_for_cleanup_review'
    );
  exception when insufficient_privilege then
    review_blocked := true;
  end;
  if not review_blocked then
    raise exception 'Non-admin unexpectedly recorded a retention review';
  end if;
end $$;

rollback;
