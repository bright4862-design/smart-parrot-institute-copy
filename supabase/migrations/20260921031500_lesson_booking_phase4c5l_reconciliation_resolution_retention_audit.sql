-- Smart Parrot Institute lesson-booking Phase 4C5L
-- Trusted reconciliation resolution + immutable retention-review audit.
-- Resolution writes are service-role only. Admin retention review records an audit decision,
-- never deletion authority. No function accepts browser time or changes Stripe/Daily state.

create table if not exists public.lesson_booking_full_preview_reconciliation_resolutions (
  run_id uuid primary key references public.lesson_booking_full_preview_terminal_evidence(run_id) on delete restrict,
  schema_version text not null check (schema_version = 'smart_parrot_full_preview_reconciliation_resolution_v1'),
  terminal_state text not null check (terminal_state in ('complete','cancelled')),
  terminal_correlation_sha256 text not null check (terminal_correlation_sha256 ~ '^[0-9a-f]{64}$'),
  verification_sha256 text not null check (verification_sha256 ~ '^[0-9a-f]{64}$'),
  resolution_kind text not null check (resolution_kind in ('cleanup_verified','preserve')),
  resolution_source text not null check (resolution_source = 'trusted_preview_reconciliation_worker_v1'),
  resolved_at timestamptz not null default statement_timestamp()
);

alter table public.lesson_booking_full_preview_reconciliation_resolutions enable row level security;
revoke all on table public.lesson_booking_full_preview_reconciliation_resolutions
  from anon, authenticated, service_role;

drop trigger if exists lesson_booking_full_preview_reconciliation_resolutions_append_only
  on public.lesson_booking_full_preview_reconciliation_resolutions;
create trigger lesson_booking_full_preview_reconciliation_resolutions_append_only
before update or delete on public.lesson_booking_full_preview_reconciliation_resolutions
for each row execute function public.forbid_change();

comment on table public.lesson_booking_full_preview_reconciliation_resolutions is
  'Service-only append-only proof that a previously ambiguous terminal preview cleanup was reconciled by a trusted backend worker. Contains hashes/status only and never authorizes evidence deletion.';

create table if not exists public.lesson_booking_full_preview_retention_reviews (
  run_id uuid primary key references public.lesson_booking_full_preview_terminal_evidence(run_id) on delete restrict,
  schema_version text not null check (schema_version = 'smart_parrot_full_preview_retention_review_v1'),
  decision text not null check (decision in ('preserve','eligible_for_cleanup_review')),
  basis_status text not null check (basis_status in (
    'reconciliation_hold',
    'reconciliation_preserved',
    'retention_active',
    'retention_review_due'
  )),
  reconciliation_resolution_kind text check (
    reconciliation_resolution_kind is null
    or reconciliation_resolution_kind in ('cleanup_verified','preserve')
  ),
  reviewed_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_at timestamptz not null default statement_timestamp()
);

create index if not exists lesson_booking_full_preview_retention_reviews_reviewed_by_idx
  on public.lesson_booking_full_preview_retention_reviews(reviewed_by, reviewed_at);

alter table public.lesson_booking_full_preview_retention_reviews enable row level security;
revoke all on table public.lesson_booking_full_preview_retention_reviews
  from anon, authenticated, service_role;

drop trigger if exists lesson_booking_full_preview_retention_reviews_append_only
  on public.lesson_booking_full_preview_retention_reviews;
create trigger lesson_booking_full_preview_retention_reviews_append_only
before update or delete on public.lesson_booking_full_preview_retention_reviews
for each row execute function public.forbid_change();

comment on table public.lesson_booking_full_preview_retention_reviews is
  'Admin-reviewed append-only retention audit. eligible_for_cleanup_review is only a review outcome; it never authorizes or executes destructive cleanup.';

create or replace function public.service_record_booking_full_preview_reconciliation_resolution(
  p_run_id uuid,
  p_resolution_kind text,
  p_expected_correlation_sha256 text,
  p_verification_sha256 text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.lesson_booking_full_preview_terminal_evidence%rowtype;
  existing public.lesson_booking_full_preview_reconciliation_resolutions%rowtype;
  v_kind text := lower(trim(coalesce(p_resolution_kind,'')));
  v_expected text := lower(trim(coalesce(p_expected_correlation_sha256,'')));
  v_verification text := lower(trim(coalesce(p_verification_sha256,'')));
begin
  if p_run_id is null
     or v_kind not in ('cleanup_verified','preserve')
     or v_expected !~ '^[0-9a-f]{64}$'
     or v_verification !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_full_preview_reconciliation_resolution' using errcode='22023';
  end if;

  select * into e
  from public.lesson_booking_full_preview_terminal_evidence
  where run_id = p_run_id;

  if not found then
    raise exception 'full_preview_terminal_evidence_not_found' using errcode='P0002';
  end if;
  if not e.reconciliation_required then
    raise exception 'full_preview_reconciliation_not_required' using errcode='22023';
  end if;
  if e.correlation_sha256 <> v_expected then
    raise exception 'stale_full_preview_reconciliation_evidence' using errcode='22023';
  end if;

  select * into existing
  from public.lesson_booking_full_preview_reconciliation_resolutions
  where run_id = p_run_id;

  if found then
    if existing.resolution_kind = v_kind
       and existing.terminal_correlation_sha256 = v_expected
       and existing.verification_sha256 = v_verification then
      return jsonb_build_object(
        'schema_version','smart_parrot_full_preview_reconciliation_resolution_v1',
        'run_id',existing.run_id,
        'resolution_kind',existing.resolution_kind,
        'resolved_at',existing.resolved_at,
        'replay',true,
        'destructive_cleanup_authorized',false,
        'server_verified',true
      );
    end if;
    raise exception 'full_preview_reconciliation_resolution_conflicting_replay' using errcode='23505';
  end if;

  insert into public.lesson_booking_full_preview_reconciliation_resolutions(
    run_id,schema_version,terminal_state,terminal_correlation_sha256,
    verification_sha256,resolution_kind,resolution_source
  ) values (
    p_run_id,'smart_parrot_full_preview_reconciliation_resolution_v1',e.terminal_state,
    v_expected,v_verification,v_kind,'trusted_preview_reconciliation_worker_v1'
  )
  returning * into existing;

  return jsonb_build_object(
    'schema_version','smart_parrot_full_preview_reconciliation_resolution_v1',
    'run_id',existing.run_id,
    'resolution_kind',existing.resolution_kind,
    'resolved_at',existing.resolved_at,
    'replay',false,
    'destructive_cleanup_authorized',false,
    'server_verified',true
  );
end;
$$;

revoke all on function public.service_record_booking_full_preview_reconciliation_resolution(
  uuid,text,text,text
) from public, anon, authenticated;
grant execute on function public.service_record_booking_full_preview_reconciliation_resolution(
  uuid,text,text,text
) to service_role;

comment on function public.service_record_booking_full_preview_reconciliation_resolution(uuid,text,text,text) is
  'Service-role-only append-only reconciliation resolution anchored to the immutable terminal-evidence correlation hash. Browser/authenticated callers cannot execute it.';

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
  with items as (
    select
      e.run_id,
      e.terminal_state,
      case when e.recorded_at <= v_now - interval '24 hours' then 'urgent' else 'high' end::text as severity,
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
      end::text as reason,
      e.recorded_at as occurred_at,
      'reconciliation_hold'::text as retention_status,
      null::timestamptz as retention_review_after
    from public.lesson_booking_full_preview_terminal_evidence e
    left join public.lesson_booking_full_preview_reconciliation_resolutions rr on rr.run_id = e.run_id
    where e.reconciliation_required
      and rr.run_id is null

    union all

    select
      r.run_id,
      r.state::text as terminal_state,
      case when r.completed_at <= v_now - interval '1 hour' then 'urgent' else 'high' end::text as severity,
      'Terminal preview evidence is missing after the server grace window'::text as reason,
      r.completed_at as occurred_at,
      'reconciliation_hold'::text as retention_status,
      null::timestamptz as retention_review_after
    from public.lesson_booking_full_preview_runs r
    left join public.lesson_booking_full_preview_terminal_evidence e on e.run_id = r.run_id
    where r.terminal
      and r.completed_at is not null
      and r.completed_at <= v_now - interval '15 minutes'
      and e.run_id is null
  )
  select i.run_id,i.terminal_state,i.severity,i.reason,i.occurred_at,i.retention_status,i.retention_review_after
  from items i
  order by case i.severity when 'urgent' then 0 else 1 end, i.occurred_at, i.run_id
  limit p_limit;
end;
$$;

revoke all on function public.admin_booking_full_preview_reconciliation_queue(int)
  from public, anon;
grant execute on function public.admin_booking_full_preview_reconciliation_queue(int)
  to authenticated;

create or replace function public.admin_record_booking_full_preview_retention_review(
  p_run_id uuid,
  p_decision text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e public.lesson_booking_full_preview_terminal_evidence%rowtype;
  rr public.lesson_booking_full_preview_reconciliation_resolutions%rowtype;
  existing public.lesson_booking_full_preview_retention_reviews%rowtype;
  v_now timestamptz := statement_timestamp();
  v_decision text := lower(trim(coalesce(p_decision,'')));
  v_has_resolution boolean := false;
  v_basis text;
  v_review_after timestamptz;
begin
  perform private.smart_parrot_require_admin(uid);

  if p_run_id is null or v_decision not in ('preserve','eligible_for_cleanup_review') then
    raise exception 'invalid_full_preview_retention_review' using errcode='22023';
  end if;

  select * into e
  from public.lesson_booking_full_preview_terminal_evidence
  where run_id = p_run_id;
  if not found then
    raise exception 'full_preview_terminal_evidence_not_found' using errcode='P0002';
  end if;

  select * into existing
  from public.lesson_booking_full_preview_retention_reviews
  where run_id = p_run_id;
  if found then
    if existing.decision = v_decision then
      return jsonb_build_object(
        'schema_version','smart_parrot_full_preview_retention_review_v1',
        'run_id',existing.run_id,
        'decision',existing.decision,
        'basis_status',existing.basis_status,
        'reviewed_at',existing.reviewed_at,
        'replay',true,
        'destructive_cleanup_authorized',false,
        'cleanup_execution_enabled',false,
        'server_time_authoritative',true
      );
    end if;
    raise exception 'full_preview_retention_review_conflicting_replay' using errcode='23505';
  end if;

  select * into rr
  from public.lesson_booking_full_preview_reconciliation_resolutions
  where run_id = p_run_id;
  v_has_resolution := found;

  if e.reconciliation_required and not v_has_resolution then
    v_basis := 'reconciliation_hold';
    v_review_after := null;
  elsif v_has_resolution and rr.resolution_kind = 'preserve' then
    v_basis := 'reconciliation_preserved';
    v_review_after := null;
  else
    v_review_after := greatest(e.recorded_at, coalesce(rr.resolved_at,e.recorded_at)) + interval '30 days';
    v_basis := case when v_now >= v_review_after then 'retention_review_due' else 'retention_active' end;
  end if;

  if v_decision = 'eligible_for_cleanup_review' and v_basis <> 'retention_review_due' then
    raise exception 'full_preview_retention_cleanup_review_not_eligible' using errcode='22023';
  end if;

  insert into public.lesson_booking_full_preview_retention_reviews(
    run_id,schema_version,decision,basis_status,reconciliation_resolution_kind,reviewed_by
  ) values (
    p_run_id,'smart_parrot_full_preview_retention_review_v1',v_decision,v_basis,
    case when v_has_resolution then rr.resolution_kind else null end,uid
  )
  returning * into existing;

  return jsonb_build_object(
    'schema_version','smart_parrot_full_preview_retention_review_v1',
    'run_id',existing.run_id,
    'decision',existing.decision,
    'basis_status',existing.basis_status,
    'reviewed_at',existing.reviewed_at,
    'replay',false,
    'destructive_cleanup_authorized',false,
    'cleanup_execution_enabled',false,
    'server_time_authoritative',true
  );
end;
$$;

revoke all on function public.admin_record_booking_full_preview_retention_review(uuid,text)
  from public, anon;
grant execute on function public.admin_record_booking_full_preview_retention_review(uuid,text)
  to authenticated;

comment on function public.admin_record_booking_full_preview_retention_review(uuid,text) is
  'Admin-only append-only retention review audit. eligible_for_cleanup_review requires a server-derived due state and no unresolved reconciliation hold. No decision authorizes or executes deletion.';

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
  rr public.lesson_booking_full_preview_reconciliation_resolutions%rowtype;
  rv public.lesson_booking_full_preview_retention_reviews%rowtype;
  v_now timestamptz := statement_timestamp();
  v_has_resolution boolean := false;
  v_has_review boolean := false;
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

  select * into rr
  from public.lesson_booking_full_preview_reconciliation_resolutions
  where run_id = p_run_id;
  v_has_resolution := found;

  select * into rv
  from public.lesson_booking_full_preview_retention_reviews
  where run_id = p_run_id;
  v_has_review := found;

  if e.reconciliation_required and not v_has_resolution then
    v_status := 'reconciliation_hold';
    v_review_after := null;
  elsif v_has_resolution and rr.resolution_kind = 'preserve' then
    v_status := 'retention_preserved';
    v_review_after := null;
  elsif v_has_review and rv.decision = 'preserve' then
    v_status := 'retention_preserved';
    v_review_after := null;
  else
    v_review_after := greatest(e.recorded_at, coalesce(rr.resolved_at,e.recorded_at)) + interval '30 days';
    v_review_due := v_now >= v_review_after;
    v_status := case when v_review_due then 'retention_review_due' else 'retention_active' end;
  end if;

  return jsonb_build_object(
    'schema_version','smart_parrot_full_preview_terminal_retention_v2',
    'run_id',e.run_id,
    'retention_status',v_status,
    'reconciliation_required',e.reconciliation_required,
    'reconciliation_resolved',v_has_resolution,
    'reconciliation_resolution_kind',case when v_has_resolution then rr.resolution_kind else null end,
    'evidence_recorded_at',e.recorded_at,
    'retention_days',30,
    'retention_review_after',v_review_after,
    'retention_review_due',v_review_due,
    'retention_review_decision',case when v_has_review then rv.decision else null end,
    'retention_review_recorded_at',case when v_has_review then rv.reviewed_at else null end,
    'destructive_cleanup_authorized',false,
    'cleanup_execution_enabled',false,
    'server_time_authoritative',true,
    'boundaries',jsonb_build_array(
      'No browser-supplied clock is accepted',
      'Unresolved reconciliation holds take precedence over cleanup-review eligibility',
      'Reconciliation resolution is service-role only and anchored to immutable terminal evidence',
      'Retention review never authorizes or executes deletion or provider writes'
    )
  );
end;
$$;

revoke all on function public.admin_booking_full_preview_terminal_retention_status(uuid)
  from public, anon;
grant execute on function public.admin_booking_full_preview_terminal_retention_status(uuid)
  to authenticated;
