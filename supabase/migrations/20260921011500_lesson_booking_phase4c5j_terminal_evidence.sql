-- Smart Parrot Institute lesson-booking Phase 4C5J
-- Append-only terminal full-preview cleanup/transcript evidence.
-- Stores only deterministic hashes and minimized lifecycle states: no provider IDs,
-- raw webhook payloads, tokens, fixture identities, secrets, payment instruments, or room names.

create table if not exists public.lesson_booking_full_preview_terminal_evidence (
  run_id uuid primary key references public.lesson_booking_full_preview_runs(run_id) on delete restrict,
  schema_version text not null check (schema_version = 'smart_parrot_full_preview_terminal_evidence_v1'),
  terminal_state text not null check (terminal_state in ('complete','cancelled')),
  transcript_sha256 text not null check (transcript_sha256 ~ '^[0-9a-f]{64}$'),
  correlation_sha256 text not null check (correlation_sha256 ~ '^[0-9a-f]{64}$'),
  session_close_status text not null check (session_close_status in (
    'fixture_sessions_closed',
    'fixture_session_close_ambiguous'
  )),
  fixture_cleanup_status text not null check (fixture_cleanup_status in (
    'fixture_cleanup_complete',
    'fixture_cleanup_preserved_by_evidence',
    'fixture_cleanup_ambiguous',
    'fixture_cleanup_deferred_session_close_ambiguous',
    'fixture_cleanup_deferred_missing_transcript',
    'fixture_cleanup_deferred_write_gate_closed'
  )),
  reconciliation_required boolean not null,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  recorded_at timestamptz not null default clock_timestamp(),
  check (
    reconciliation_required
    or (
      session_close_status = 'fixture_sessions_closed'
      and fixture_cleanup_status in ('fixture_cleanup_complete','fixture_cleanup_preserved_by_evidence')
    )
  )
);

alter table public.lesson_booking_full_preview_terminal_evidence enable row level security;
revoke all on table public.lesson_booking_full_preview_terminal_evidence from anon, authenticated;

drop trigger if exists lesson_booking_full_preview_terminal_evidence_append_only
  on public.lesson_booking_full_preview_terminal_evidence;
create trigger lesson_booking_full_preview_terminal_evidence_append_only
before update or delete on public.lesson_booking_full_preview_terminal_evidence
for each row execute function public.forbid_change();

comment on table public.lesson_booking_full_preview_terminal_evidence is
  'Admin-only append-only terminal preview evidence. Hashes a redacted provider-readiness transcript and binds it to session-close/fixture-cleanup outcomes without retaining provider or fixture identifiers.';

create or replace function public.admin_record_booking_full_preview_terminal_evidence(
  p_run_id uuid,
  p_terminal_state text,
  p_transcript_sha256 text,
  p_correlation_sha256 text,
  p_session_close_status text,
  p_fixture_cleanup_status text,
  p_reconciliation_required boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.lesson_booking_full_preview_runs%rowtype;
  existing public.lesson_booking_full_preview_terminal_evidence%rowtype;
  v_terminal_state text := lower(trim(coalesce(p_terminal_state,'')));
  v_session_status text := lower(trim(coalesce(p_session_close_status,'')));
  v_cleanup_status text := lower(trim(coalesce(p_fixture_cleanup_status,'')));
  v_transcript_sha text := lower(trim(coalesce(p_transcript_sha256,'')));
  v_correlation_sha text := lower(trim(coalesce(p_correlation_sha256,'')));
begin
  perform private.smart_parrot_require_admin(uid);

  if p_run_id is null
     or v_terminal_state not in ('complete','cancelled')
     or v_transcript_sha !~ '^[0-9a-f]{64}$'
     or v_correlation_sha !~ '^[0-9a-f]{64}$'
     or v_session_status not in ('fixture_sessions_closed','fixture_session_close_ambiguous')
     or v_cleanup_status not in (
       'fixture_cleanup_complete',
       'fixture_cleanup_preserved_by_evidence',
       'fixture_cleanup_ambiguous',
       'fixture_cleanup_deferred_session_close_ambiguous',
       'fixture_cleanup_deferred_missing_transcript',
       'fixture_cleanup_deferred_write_gate_closed'
     )
     or p_reconciliation_required is null
     or (
       not p_reconciliation_required
       and (
         v_session_status <> 'fixture_sessions_closed'
         or v_cleanup_status not in ('fixture_cleanup_complete','fixture_cleanup_preserved_by_evidence')
       )
     ) then
    raise exception 'invalid_full_preview_terminal_evidence' using errcode='22023';
  end if;

  select * into r
  from public.lesson_booking_full_preview_runs
  where run_id = p_run_id;

  if not found then
    raise exception 'full_preview_run_not_found' using errcode='P0002';
  end if;
  if not r.terminal or r.state <> v_terminal_state or r.completed_at is null then
    raise exception 'full_preview_terminal_state_required' using errcode='22023';
  end if;

  select * into existing
  from public.lesson_booking_full_preview_terminal_evidence
  where run_id = p_run_id;

  if found then
    if existing.terminal_state = v_terminal_state
       and existing.transcript_sha256 = v_transcript_sha
       and existing.correlation_sha256 = v_correlation_sha
       and existing.session_close_status = v_session_status
       and existing.fixture_cleanup_status = v_cleanup_status
       and existing.reconciliation_required = p_reconciliation_required then
      return jsonb_build_object(
        'schema_version','smart_parrot_full_preview_terminal_evidence_v1',
        'run_id',existing.run_id,
        'terminal_state',existing.terminal_state,
        'transcript_sha256',existing.transcript_sha256,
        'correlation_sha256',existing.correlation_sha256,
        'reconciliation_required',existing.reconciliation_required,
        'replay',true
      );
    end if;
    raise exception 'full_preview_terminal_evidence_conflicting_replay' using errcode='23505';
  end if;

  insert into public.lesson_booking_full_preview_terminal_evidence(
    run_id, schema_version, terminal_state, transcript_sha256, correlation_sha256,
    session_close_status, fixture_cleanup_status, reconciliation_required, recorded_by
  ) values (
    p_run_id, 'smart_parrot_full_preview_terminal_evidence_v1', v_terminal_state,
    v_transcript_sha, v_correlation_sha, v_session_status, v_cleanup_status,
    p_reconciliation_required, uid
  );

  return jsonb_build_object(
    'schema_version','smart_parrot_full_preview_terminal_evidence_v1',
    'run_id',p_run_id,
    'terminal_state',v_terminal_state,
    'transcript_sha256',v_transcript_sha,
    'correlation_sha256',v_correlation_sha,
    'reconciliation_required',p_reconciliation_required,
    'replay',false
  );
end;
$$;

revoke all on function public.admin_record_booking_full_preview_terminal_evidence(
  uuid,text,text,text,text,text,boolean
) from public, anon;
grant execute on function public.admin_record_booking_full_preview_terminal_evidence(
  uuid,text,text,text,text,text,boolean
) to authenticated;
