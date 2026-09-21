-- Phase 4C5J terminal cleanup/transcript evidence scenarios. Ephemeral CI only.
begin;

insert into auth.users(id,raw_user_meta_data) values
  ('7a000000-0000-0000-0000-000000000001','{"full_name":"Phase4C5J Admin"}'),
  ('7a000000-0000-0000-0000-000000000002','{"full_name":"Phase4C5J Outsider"}');
update public.profiles set role='admin' where id='7a000000-0000-0000-0000-000000000001';

insert into public.lesson_booking_full_preview_runs(
  run_id,scenario,state,pause_reason,terminal,revision,last_booking_status,
  created_by,created_at,updated_at,last_observed_at,completed_at
) values
  ('7a000000-0000-4000-8000-000000000100','near_term_success','complete',null,true,2,'settled',
   '7a000000-0000-0000-0000-000000000001','2026-09-21 01:00+00','2026-09-21 01:10+00','2026-09-21 01:10+00','2026-09-21 01:10+00'),
  ('7a000000-0000-4000-8000-000000000101','near_term_success','awaiting_settlement_worker','settlement_worker',false,1,'awaiting_settlement',
   '7a000000-0000-0000-0000-000000000001','2026-09-21 01:00+00','2026-09-21 01:05+00','2026-09-21 01:05+00',null);

create or replace function auth.uid() returns uuid language sql stable as $$
  select '7a000000-0000-0000-0000-000000000001'::uuid
$$;

do $$
declare
  first_payload jsonb;
  replay_payload jsonb;
  blocked boolean := false;
  conflict boolean := false;
begin
  select public.admin_record_booking_full_preview_terminal_evidence(
    '7a000000-0000-4000-8000-000000000100','complete',
    repeat('a',64),repeat('b',64),
    'fixture_sessions_closed','fixture_cleanup_complete',false
  ) into first_payload;

  if (first_payload->>'replay')::boolean
     or first_payload->>'run_id' <> '7a000000-0000-4000-8000-000000000100'
     or first_payload->>'correlation_sha256' <> repeat('b',64) then
    raise exception 'Unexpected first terminal evidence payload: %', first_payload;
  end if;

  select public.admin_record_booking_full_preview_terminal_evidence(
    '7a000000-0000-4000-8000-000000000100','complete',
    repeat('a',64),repeat('b',64),
    'fixture_sessions_closed','fixture_cleanup_complete',false
  ) into replay_payload;
  if not (replay_payload->>'replay')::boolean then
    raise exception 'Identical terminal evidence replay was not idempotent: %', replay_payload;
  end if;
  if (select count(*) from public.lesson_booking_full_preview_terminal_evidence
      where run_id='7a000000-0000-4000-8000-000000000100') <> 1 then
    raise exception 'Terminal evidence replay duplicated append-only evidence';
  end if;

  begin
    perform public.admin_record_booking_full_preview_terminal_evidence(
      '7a000000-0000-4000-8000-000000000100','complete',
      repeat('c',64),repeat('d',64),
      'fixture_sessions_closed','fixture_cleanup_complete',false
    );
  exception when unique_violation then
    conflict := true;
  end;
  if not conflict then raise exception 'Conflicting terminal evidence replay unexpectedly succeeded'; end if;

  begin
    perform public.admin_record_booking_full_preview_terminal_evidence(
      '7a000000-0000-4000-8000-000000000101','complete',
      repeat('a',64),repeat('b',64),
      'fixture_sessions_closed','fixture_cleanup_complete',false
    );
  exception when invalid_parameter_value then
    blocked := true;
  end;
  if not blocked then raise exception 'Non-terminal run unexpectedly accepted terminal evidence'; end if;
end $$;

do $$
declare blocked boolean := false;
begin
  begin
    update public.lesson_booking_full_preview_terminal_evidence
    set transcript_sha256=repeat('e',64)
    where run_id='7a000000-0000-4000-8000-000000000100';
  exception when others then
    blocked := true;
  end;
  if not blocked then raise exception 'Append-only terminal evidence unexpectedly allowed update'; end if;
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$
  select '7a000000-0000-0000-0000-000000000002'::uuid
$$;

do $$
declare blocked boolean := false;
begin
  begin
    perform public.admin_record_booking_full_preview_terminal_evidence(
      '7a000000-0000-4000-8000-000000000100','complete',
      repeat('a',64),repeat('b',64),
      'fixture_sessions_closed','fixture_cleanup_complete',false
    );
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then raise exception 'Non-admin unexpectedly recorded terminal preview evidence'; end if;
end $$;

rollback;
