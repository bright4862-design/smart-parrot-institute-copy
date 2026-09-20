-- Smart Parrot Institute lesson-booking Phase 4C5B1
-- Admin-safe provider rehearsal history + server-authoritative launch preflight.
-- No provider object identifiers, raw provider evidence, hashes, secrets, customer data,
-- payment instruments, or automatic provider/payment actions are exposed or performed.

create or replace function public.admin_provider_rehearsal_history(
  p_limit int default 20,
  p_now timestamptz default clock_timestamp()
) returns table(
  run_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  status text,
  cleanup_complete boolean,
  failure_code text,
  identity_verified boolean,
  reconciled boolean,
  reconciled_at timestamptz,
  is_recent boolean
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  uid uuid := auth.uid();
begin
  perform private.smart_parrot_require_admin(uid);
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_now is null then
    raise exception 'invalid_provider_rehearsal_history_request' using errcode='22023';
  end if;

  return query
  select
    r.run_id,
    r.started_at,
    r.completed_at,
    r.status,
    r.cleanup_complete,
    r.failure_code,
    (r.preview_project_verified and r.stripe_account_verified and r.daily_webhook_domain_verified) as identity_verified,
    (x.run_id is not null) as reconciled,
    x.reconciled_at,
    (r.completed_at >= p_now - interval '7 days' and r.completed_at <= p_now + interval '5 minutes') as is_recent
  from public.lesson_booking_provider_rehearsals r
  left join public.lesson_booking_provider_rehearsal_reconciliations x on x.run_id=r.run_id
  where r.completed_at <= p_now + interval '5 minutes'
  order by r.completed_at desc,r.ingested_at desc
  limit p_limit;
end;
$$;

create or replace function public.admin_provider_rehearsal_readiness(
  p_now timestamptz default clock_timestamp()
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  uid uuid := auth.uid();
  latest public.lesson_booking_provider_rehearsals%rowtype;
  has_latest boolean := false;
  latest_is_recent boolean := false;
  latest_passed boolean := false;
  unresolved_cleanup int := 0;
  ready boolean := false;
  blockers jsonb := '[]'::jsonb;
begin
  perform private.smart_parrot_require_admin(uid);
  if p_now is null then
    raise exception 'invalid_provider_rehearsal_readiness_request' using errcode='22023';
  end if;

  select r.* into latest
  from public.lesson_booking_provider_rehearsals r
  where r.completed_at <= p_now + interval '5 minutes'
  order by r.completed_at desc,r.ingested_at desc
  limit 1;
  has_latest := found;

  select count(*)::int into unresolved_cleanup
  from public.lesson_booking_provider_rehearsals r
  where r.status='cleanup_incomplete'
    and not exists (
      select 1 from public.lesson_booking_provider_rehearsal_reconciliations x
      where x.run_id=r.run_id
    );

  if not has_latest then
    blockers := blockers || jsonb_build_array('provider_rehearsal_missing');
  else
    latest_passed := latest.status='passed';
    latest_is_recent := latest.completed_at >= p_now - interval '7 days';
    if not latest_passed then
      blockers := blockers || jsonb_build_array('provider_rehearsal_latest_not_passed');
    end if;
    if not latest_is_recent then
      blockers := blockers || jsonb_build_array('provider_rehearsal_stale');
    end if;
  end if;

  if unresolved_cleanup > 0 then
    blockers := blockers || jsonb_build_array('provider_cleanup_unresolved');
  end if;

  ready := has_latest and latest_passed and latest_is_recent and unresolved_cleanup=0;

  return jsonb_build_object(
    'schema_version','smart_parrot_provider_rehearsal_readiness_v1',
    'generated_at',p_now,
    'status',case when ready then 'ready' else 'blocked' end,
    'ready',ready,
    'latest_status',case when has_latest then latest.status else null end,
    'latest_completed_at',case when has_latest then latest.completed_at else null end,
    'latest_is_recent',latest_is_recent,
    'recent_successful_rehearsal',has_latest and latest_passed and latest_is_recent,
    'unresolved_cleanup_failures',unresolved_cleanup,
    'blockers',blockers,
    'boundaries',jsonb_build_array(
      'Readiness is computed from append-only server evidence, never browser time or browser-supplied provider state',
      'The latest rehearsal must have passed within seven days and unresolved cleanup failures must be zero',
      'No provider object identifiers, evidence hashes, raw provider payloads, secrets, payment data, or customer data are returned',
      'Readiness grants no authority to create bookings, move money, mutate provider state, deploy, publish, or erase evidence'
    )
  );
end;
$$;

revoke all on function public.admin_provider_rehearsal_history(int,timestamptz) from public, anon, authenticated;
revoke all on function public.admin_provider_rehearsal_readiness(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_provider_rehearsal_history(int,timestamptz) to authenticated;
grant execute on function public.admin_provider_rehearsal_readiness(timestamptz) to authenticated;
