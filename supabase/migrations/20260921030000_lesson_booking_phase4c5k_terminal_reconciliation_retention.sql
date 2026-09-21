-- Smart Parrot Institute lesson-booking Phase 4C5K
-- Read-only terminal reconciliation queue + bounded preview-evidence retention status.
-- No function in this migration deletes evidence, cleans fixtures, changes provider state,
-- moves money, or accepts a browser-supplied clock. Server statement time is authoritative.

create index if not exists lesson_booking_full_preview_terminal_evidence_reconciliation_idx
  on public.lesson_booking_full_preview_terminal_evidence(recorded_at, run_id)
  where reconciliation_required;

create or replace function public.admin_booking_full_preview_reconciliation_queue(
  p_limit int default 50
) returns table(
  run_id uuid,
  terminal_state text,
  severity text,
  reason text,
  occurred_at timestamptz,
  retention_status text,
  retention_review_after timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
begin
  perform private.smart_parrot_require_admin(uid);
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid_full_preview_reconciliation_queue_request' using errcode='22023';
  end if;

  return query
  select
    e.run_id,
    e.terminal_state,
    case when e.recorded_at <= v_now - interval '24 hours' then 'urgent' else 'high' end::text,
    case
      when e.session_close_status = 'fixture_session_close_ambiguous'
        then 'Ephemeral preview session closure requires reconciliation'
      when e.fixture_cleanup_status = 'fixture_cleanup_ambiguous'
        then 'Synthetic preview fixture cleanup outcome is ambiguous'
      when e.fixture_cleanup_status = 'fixture_cleanup_deferred_session_close_ambiguous'
        then 'Synthetic preview fixture cleanup deferred because session closure is ambiguous'
      when e.fixture_cleanup_status = 'fixture_cleanup_deferred_missing_transcript'
        then 'Synthetic preview fixture cleanup deferred because the redacted transcript was unavailable'
      when e.fixture_cleanup_status = 'fixture_cleanup_deferred_write_gate_closed'
        then 'Synthetic preview fixture cleanup deferred because the cleanup gate remained closed'
      else 'Terminal preview cleanup requires reconciliation'
    end::text,
    e.recorded_at,
    'reconciliation_hold'::text,
    null::timestamptz
  from public.lesson_booking_full_preview_terminal_evidence e
  where e.reconciliation_required
  order by
    case when e.recorded_at <= v_now - interval '24 hours' then 0 else 1 end,
    e.recorded_at,
    e.run_id
  limit p_limit;
end;
$$;

revoke all on function public.admin_booking_full_preview_reconciliation_queue(int)
  from public, anon;
grant execute on function public.admin_booking_full_preview_reconciliation_queue(int)
  to authenticated;

comment on function public.admin_booking_full_preview_reconciliation_queue(int) is
  'Admin-only minimized queue of terminal preview evidence that requires reconciliation. Uses server statement time; returns no provider IDs, fixture identities, payload bodies, tokens, secrets, or deletion authority.';

create or replace function public.admin_booking_full_preview_terminal_retention_status(
  p_run_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e public.lesson_booking_full_preview_terminal_evidence%rowtype;
  v_now timestamptz := statement_timestamp();
  v_review_after timestamptz;
  v_status text;
  v_review_due boolean := false;
begin
  perform private.smart_parrot_require_admin(uid);
  if p_run_id is null then
    raise exception 'invalid_full_preview_terminal_retention_request' using errcode='22023';
  end if;

  select * into e
  from public.lesson_booking_full_preview_terminal_evidence
  where run_id = p_run_id;

  if not found then
    raise exception 'full_preview_terminal_evidence_not_found' using errcode='P0002';
  end if;

  if e.reconciliation_required then
    v_status := 'reconciliation_hold';
    v_review_after := null;
  else
    -- Purpose-bounded preview troubleshooting window. This is an eligibility signal only;
    -- it never authorizes or performs deletion. Stripe test Events remain retrievable for
    -- up to 30 days, so the same bounded period is used for minimized rehearsal evidence.
    v_review_after := e.recorded_at + interval '30 days';
    v_review_due := v_now >= v_review_after;
    v_status := case when v_review_due then 'retention_review_due' else 'retention_active' end;
  end if;

  return jsonb_build_object(
    'schema_version','smart_parrot_full_preview_terminal_retention_v1',
    'run_id',e.run_id,
    'retention_status',v_status,
    'reconciliation_required',e.reconciliation_required,
    'evidence_recorded_at',e.recorded_at,
    'retention_days',30,
    'retention_review_after',v_review_after,
    'retention_review_due',v_review_due,
    'destructive_cleanup_authorized',false,
    'server_time_authoritative',true,
    'boundaries',jsonb_build_array(
      'No browser-supplied clock is accepted',
      'Retention status never authorizes deletion or provider writes',
      'Reconciliation-required evidence remains held until a later server-verified reconciliation flow exists'
    )
  );
end;
$$;

revoke all on function public.admin_booking_full_preview_terminal_retention_status(uuid)
  from public, anon;
grant execute on function public.admin_booking_full_preview_terminal_retention_status(uuid)
  to authenticated;

comment on function public.admin_booking_full_preview_terminal_retention_status(uuid) is
  'Admin-only server-time retention status for minimized terminal preview evidence. Thirty days is a technical preview troubleshooting window, not a legal retention period; this RPC never deletes data.';
