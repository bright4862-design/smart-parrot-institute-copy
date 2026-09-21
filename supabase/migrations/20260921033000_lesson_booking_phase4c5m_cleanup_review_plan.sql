-- Smart Parrot Institute lesson-booking Phase 4C5M
-- Server-derived cleanup-review candidate queue + bounded dry-run cleanup plans.
-- No function in this migration deletes evidence, fixtures, provider objects, or booking/payment data.

create table if not exists public.lesson_booking_full_preview_cleanup_review_plans (
  run_id uuid primary key references public.lesson_booking_full_preview_terminal_evidence(run_id) on delete restrict,
  schema_version text not null check (schema_version = 'smart_parrot_full_preview_cleanup_review_plan_v1'),
  retention_reviewed_at timestamptz not null,
  retention_review_decision text not null check (retention_review_decision = 'eligible_for_cleanup_review'),
  plan_state text not null check (plan_state = 'dry_run_only'),
  generated_by uuid not null references public.profiles(id) on delete restrict,
  generated_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null
);

create index if not exists lesson_booking_full_preview_cleanup_review_plans_generated_by_idx
  on public.lesson_booking_full_preview_cleanup_review_plans(generated_by, generated_at);

alter table public.lesson_booking_full_preview_cleanup_review_plans enable row level security;
revoke all on table public.lesson_booking_full_preview_cleanup_review_plans
  from anon, authenticated, service_role;

drop trigger if exists lesson_booking_full_preview_cleanup_review_plans_append_only
  on public.lesson_booking_full_preview_cleanup_review_plans;
create trigger lesson_booking_full_preview_cleanup_review_plans_append_only
before update or delete on public.lesson_booking_full_preview_cleanup_review_plans
for each row execute function public.forbid_change();

comment on table public.lesson_booking_full_preview_cleanup_review_plans is
  'Admin-requested, server-validated preview cleanup review plans. Records only dry-run eligibility; never grants or performs destructive cleanup.';

create or replace function public.admin_booking_full_preview_cleanup_review_queue(
  p_limit int default 50
) returns table(
  run_id uuid,
  terminal_state text,
  retention_reviewed_at timestamptz,
  plan_status text,
  plan_generated_at timestamptz,
  plan_expires_at timestamptz,
  destructive_cleanup_authorized boolean,
  cleanup_execution_enabled boolean
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
    raise exception 'invalid_full_preview_cleanup_review_queue_request' using errcode='22023';
  end if;

  return query
  select
    e.run_id,
    e.terminal_state,
    rv.reviewed_at as retention_reviewed_at,
    case
      when p.run_id is null then 'not_prepared'
      when p.expires_at <= v_now then 'expired'
      else 'active'
    end::text as plan_status,
    p.generated_at as plan_generated_at,
    p.expires_at as plan_expires_at,
    false as destructive_cleanup_authorized,
    false as cleanup_execution_enabled
  from public.lesson_booking_full_preview_retention_reviews rv
  join public.lesson_booking_full_preview_terminal_evidence e on e.run_id = rv.run_id
  left join public.lesson_booking_full_preview_reconciliation_resolutions rr on rr.run_id = e.run_id
  left join public.lesson_booking_full_preview_cleanup_review_plans p on p.run_id = e.run_id
  where rv.decision = 'eligible_for_cleanup_review'
    and rv.basis_status = 'retention_review_due'
    and (
      not e.reconciliation_required
      or (rr.run_id is not null and rr.resolution_kind = 'cleanup_verified')
    )
    and not exists (
      select 1
      from public.lesson_booking_full_preview_reconciliation_resolutions keep_rr
      where keep_rr.run_id = e.run_id
        and keep_rr.resolution_kind = 'preserve'
    )
  order by rv.reviewed_at, e.run_id
  limit p_limit;
end;
$$;

revoke all on function public.admin_booking_full_preview_cleanup_review_queue(int)
  from public, anon;
grant execute on function public.admin_booking_full_preview_cleanup_review_queue(int)
  to authenticated;

comment on function public.admin_booking_full_preview_cleanup_review_queue(int) is
  'Admin-only minimized queue of server-verified cleanup-review candidates. No row authorizes deletion or provider mutation.';

create or replace function public.admin_prepare_booking_full_preview_cleanup_review_plan(
  p_run_id uuid,
  p_expected_reviewed_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e public.lesson_booking_full_preview_terminal_evidence%rowtype;
  rr public.lesson_booking_full_preview_reconciliation_resolutions%rowtype;
  rv public.lesson_booking_full_preview_retention_reviews%rowtype;
  existing public.lesson_booking_full_preview_cleanup_review_plans%rowtype;
  v_has_resolution boolean := false;
  v_now timestamptz := statement_timestamp();
  v_review_after timestamptz;
begin
  perform private.smart_parrot_require_admin(uid);

  if p_run_id is null or p_expected_reviewed_at is null then
    raise exception 'invalid_full_preview_cleanup_review_plan_request' using errcode='22023';
  end if;

  select * into e
  from public.lesson_booking_full_preview_terminal_evidence
  where run_id = p_run_id;
  if not found then
    raise exception 'full_preview_terminal_evidence_not_found' using errcode='P0002';
  end if;

  select * into rv
  from public.lesson_booking_full_preview_retention_reviews
  where run_id = p_run_id;
  if not found then
    raise exception 'full_preview_retention_review_not_found' using errcode='P0002';
  end if;

  if rv.decision <> 'eligible_for_cleanup_review'
     or rv.basis_status <> 'retention_review_due' then
    raise exception 'full_preview_cleanup_review_plan_not_eligible' using errcode='22023';
  end if;

  if rv.reviewed_at <> p_expected_reviewed_at then
    raise exception 'stale_full_preview_cleanup_review' using errcode='22023';
  end if;

  select * into rr
  from public.lesson_booking_full_preview_reconciliation_resolutions
  where run_id = p_run_id;
  v_has_resolution := found;

  if e.reconciliation_required
     and (not v_has_resolution or rr.resolution_kind <> 'cleanup_verified') then
    raise exception 'full_preview_cleanup_review_reconciliation_hold' using errcode='22023';
  end if;

  if v_has_resolution and rr.resolution_kind = 'preserve' then
    raise exception 'full_preview_cleanup_review_preserved' using errcode='22023';
  end if;

  v_review_after := greatest(e.recorded_at, coalesce(rr.resolved_at,e.recorded_at)) + interval '30 days';
  if v_now < v_review_after then
    raise exception 'full_preview_cleanup_review_no_longer_due' using errcode='22023';
  end if;

  select * into existing
  from public.lesson_booking_full_preview_cleanup_review_plans
  where run_id = p_run_id;

  if found then
    if existing.retention_reviewed_at = rv.reviewed_at
       and existing.retention_review_decision = rv.decision
       and existing.plan_state = 'dry_run_only' then
      return jsonb_build_object(
        'schema_version','smart_parrot_full_preview_cleanup_review_plan_v1',
        'run_id',existing.run_id,
        'plan_state',existing.plan_state,
        'retention_reviewed_at',existing.retention_reviewed_at,
        'generated_at',existing.generated_at,
        'expires_at',existing.expires_at,
        'plan_status',case when existing.expires_at <= v_now then 'expired' else 'active' end,
        'replay',true,
        'destructive_cleanup_authorized',false,
        'cleanup_execution_enabled',false,
        'server_time_authoritative',true
      );
    end if;
    raise exception 'full_preview_cleanup_review_plan_conflicting_replay' using errcode='23505';
  end if;

  insert into public.lesson_booking_full_preview_cleanup_review_plans(
    run_id,schema_version,retention_reviewed_at,retention_review_decision,
    plan_state,generated_by,generated_at,expires_at
  ) values (
    p_run_id,'smart_parrot_full_preview_cleanup_review_plan_v1',rv.reviewed_at,rv.decision,
    'dry_run_only',uid,v_now,v_now + interval '24 hours'
  )
  returning * into existing;

  return jsonb_build_object(
    'schema_version','smart_parrot_full_preview_cleanup_review_plan_v1',
    'run_id',existing.run_id,
    'plan_state',existing.plan_state,
    'retention_reviewed_at',existing.retention_reviewed_at,
    'generated_at',existing.generated_at,
    'expires_at',existing.expires_at,
    'plan_status','active',
    'replay',false,
    'destructive_cleanup_authorized',false,
    'cleanup_execution_enabled',false,
    'server_time_authoritative',true,
    'boundaries',jsonb_build_array(
      'Plan preparation is a dry-run review artifact only',
      'Plan timing is derived from PostgreSQL server time',
      'No browser-supplied current time is accepted',
      'No deletion, provider write, fixture mutation, or payment transition is authorized'
    )
  );
end;
$$;

revoke all on function public.admin_prepare_booking_full_preview_cleanup_review_plan(uuid,timestamptz)
  from public, anon;
grant execute on function public.admin_prepare_booking_full_preview_cleanup_review_plan(uuid,timestamptz)
  to authenticated;

comment on function public.admin_prepare_booking_full_preview_cleanup_review_plan(uuid,timestamptz) is
  'Admin-only server-validated dry-run cleanup review plan. Requires immutable eligible retention review and safe reconciliation state. Never authorizes or executes deletion.';
