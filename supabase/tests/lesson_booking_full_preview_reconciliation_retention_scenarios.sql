-- Phase 4C5K terminal reconciliation queue + retention scenarios. Ephemeral CI only.
begin;

insert into auth.users(id,raw_user_meta_data) values
  ('7b000000-0000-0000-0000-000000000001','{"full_name":"Phase4C5K Admin"}'),
  ('7b000000-0000-0000-0000-000000000002','{"full_name":"Phase4C5K Outsider"}');
update public.profiles set role='admin' where id='7b000000-0000-0000-0000-000000000001';

insert into public.lesson_booking_full_preview_runs(
  run_id,scenario,state,pause_reason,terminal,revision,last_booking_status,
  created_by,created_at,updated_at,last_observed_at,completed_at
) values
  ('7b000000-0000-4000-8000-000000000100','near_term_success','complete',null,true,2,'settled',
   '7b000000-0000-0000-0000-000000000001',statement_timestamp()-interval '3 days',statement_timestamp()-interval '2 days',statement_timestamp()-interval '2 days',statement_timestamp()-interval '2 days'),
  ('7b000000-0000-4000-8000-000000000101','near_term_success','complete',null,true,2,'settled',
   '7b000000-0000-0000-0000-000000000001',statement_timestamp()-interval '11 days',statement_timestamp()-interval '10 days',statement_timestamp()-interval '10 days',statement_timestamp()-interval '10 days'),
  ('7b000000-0000-4000-8000-000000000102','near_term_success','cancelled',null,true,2,'cancelled',
   '7b000000-0000-0000-0000-000000000001',statement_timestamp()-interval '32 days',statement_timestamp()-interval '31 days',statement_timestamp()-interval '31 days',statement_timestamp()-interval '31 days'),
  ('7b000000-0000-4000-8000-000000000103','near_term_success','complete',null,true,2,'settled',
   '7b000000-0000-0000-0000-000000000001',statement_timestamp()-interval '3 hours',statement_timestamp()-interval '2 hours',statement_timestamp()-interval '2 hours',statement_timestamp()-interval '2 hours');

insert into public.lesson_booking_full_preview_terminal_evidence(
  run_id,schema_version,terminal_state,transcript_sha256,correlation_sha256,
  session_close_status,fixture_cleanup_status,reconciliation_required,recorded_by,recorded_at
) values
  ('7b000000-0000-4000-8000-000000000100','smart_parrot_full_preview_terminal_evidence_v1','complete',repeat('a',64),repeat('b',64),
   'fixture_session_close_ambiguous','fixture_cleanup_deferred_session_close_ambiguous',true,'7b000000-0000-0000-0000-000000000001',statement_timestamp()-interval '2 days'),
  ('7b000000-0000-4000-8000-000000000101','smart_parrot_full_preview_terminal_evidence_v1','complete',repeat('c',64),repeat('d',64),
   'fixture_sessions_closed','fixture_cleanup_complete',false,'7b000000-0000-0000-0000-000000000001',statement_timestamp()-interval '10 days'),
  ('7b000000-0000-4000-8000-000000000102','smart_parrot_full_preview_terminal_evidence_v1','cancelled',repeat('e',64),repeat('f',64),
   'fixture_sessions_closed','fixture_cleanup_preserved_by_evidence',false,'7b000000-0000-0000-0000-000000000001',statement_timestamp()-interval '31 days');

create or replace function auth.uid() returns uuid language sql stable as $$
  select '7b000000-0000-0000-0000-000000000001'::uuid
$$;

do $$
declare
  q jsonb;
  active_status jsonb;
  due_status jsonb;
  hold_status jsonb;
  missing_blocked boolean := false;
begin
  select jsonb_agg(to_jsonb(x)) into q
  from public.admin_booking_full_preview_reconciliation_queue(50) x;

  if jsonb_array_length(coalesce(q,'[]'::jsonb)) <> 2 then
    raise exception 'Unexpected reconciliation queue payload: %', q;
  end if;
  if not q @> '[{"run_id":"7b000000-0000-4000-8000-000000000100","severity":"urgent","retention_status":"reconciliation_hold"}]'::jsonb then
    raise exception 'Ambiguous cleanup evidence is missing from reconciliation queue: %', q;
  end if;
  if not q @> '[{"run_id":"7b000000-0000-4000-8000-000000000103","severity":"urgent","reason":"Terminal preview evidence is missing after the server grace window","retention_status":"reconciliation_hold"}]'::jsonb then
    raise exception 'Missing terminal evidence is not surfaced by the reconciliation queue: %', q;
  end if;
  if exists (
    select 1 from jsonb_array_elements(q) item
    where item->'retention_review_after' <> 'null'::jsonb
  ) then
    raise exception 'Reconciliation queue exposed a retention deadline while evidence is held: %', q;
  end if;
  if q::text like '%sha256%' or q::text like '%transcript%' or q::text like '%correlation%' then
    raise exception 'Reconciliation queue leaked terminal evidence hashes: %', q;
  end if;

  select public.admin_booking_full_preview_terminal_retention_status(
    '7b000000-0000-4000-8000-000000000100'
  ) into hold_status;
  if hold_status->>'retention_status' <> 'reconciliation_hold'
     or (hold_status->>'retention_review_due')::boolean
     or (hold_status->>'destructive_cleanup_authorized')::boolean
     or not (hold_status->>'server_time_authoritative')::boolean
     or hold_status->'retention_review_after' <> 'null'::jsonb then
    raise exception 'Reconciliation evidence was not held safely: %', hold_status;
  end if;

  select public.admin_booking_full_preview_terminal_retention_status(
    '7b000000-0000-4000-8000-000000000101'
  ) into active_status;
  if active_status->>'retention_status' <> 'retention_active'
     or (active_status->>'retention_review_due')::boolean
     or (active_status->>'destructive_cleanup_authorized')::boolean
     or (active_status->>'retention_days')::int <> 30 then
    raise exception 'Fresh minimized evidence did not remain in active retention: %', active_status;
  end if;

  select public.admin_booking_full_preview_terminal_retention_status(
    '7b000000-0000-4000-8000-000000000102'
  ) into due_status;
  if due_status->>'retention_status' <> 'retention_review_due'
     or not (due_status->>'retention_review_due')::boolean
     or (due_status->>'destructive_cleanup_authorized')::boolean
     or due_status->'retention_review_after' = 'null'::jsonb then
    raise exception 'Expired preview evidence did not become review-due without deletion authority: %', due_status;
  end if;

  begin
    perform public.admin_booking_full_preview_terminal_retention_status(
      '7b000000-0000-4000-8000-000000000103'
    );
  exception when no_data_found then
    missing_blocked := true;
  end;
  if not missing_blocked then
    raise exception 'Missing terminal evidence unexpectedly received a retention status';
  end if;
end $$;

do $$
begin
  if has_table_privilege('authenticated','public.lesson_booking_full_preview_terminal_evidence','SELECT') then
    raise exception 'Authenticated role unexpectedly has direct terminal evidence SELECT privilege';
  end if;
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$
  select '7b000000-0000-0000-0000-000000000002'::uuid
$$;

do $$
declare
  queue_blocked boolean := false;
  retention_blocked boolean := false;
begin
  begin
    perform * from public.admin_booking_full_preview_reconciliation_queue(50);
  exception when insufficient_privilege then
    queue_blocked := true;
  end;
  if not queue_blocked then raise exception 'Non-admin unexpectedly read the reconciliation queue'; end if;

  begin
    perform public.admin_booking_full_preview_terminal_retention_status(
      '7b000000-0000-4000-8000-000000000101'
    );
  exception when insufficient_privilege then
    retention_blocked := true;
  end;
  if not retention_blocked then raise exception 'Non-admin unexpectedly read terminal retention status'; end if;
end $$;

rollback;
