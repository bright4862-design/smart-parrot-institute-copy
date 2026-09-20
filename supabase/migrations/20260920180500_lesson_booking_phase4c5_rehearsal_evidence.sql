-- Smart Parrot Institute lesson-booking Phase 4C5A
-- Append-only preview-rehearsal evidence + operator launch signals.
-- Stores no Stripe/Daily object identifiers, raw provider payloads, secrets, customer data,
-- payment instruments, room names, webhook URLs, HMACs, or raw failure messages.
-- This migration performs no provider write, payment transition, erasure, deploy, or publish.

create table if not exists public.lesson_booking_provider_rehearsals (
  run_id uuid primary key,
  schema_version text not null check (schema_version='smart_parrot_provider_preview_e2e_v1'),
  started_at timestamptz not null,
  completed_at timestamptz not null,
  preview_project_verified boolean not null,
  stripe_account_verified boolean not null,
  daily_webhook_domain_verified boolean not null,
  stripe_customer_created boolean not null,
  stripe_customer_deleted boolean not null,
  daily_room_created boolean not null,
  daily_room_deleted boolean not null,
  cleanup_complete boolean not null,
  status text not null check (status in ('passed','failed','cleanup_incomplete')),
  failure_code text check (failure_code is null or failure_code ~ '^[a-z0-9][a-z0-9_.-]{2,79}$'),
  evidence_sha256 text not null check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  ingested_by uuid not null references public.profiles(id) on delete restrict,
  ingested_at timestamptz not null default clock_timestamp(),
  check (completed_at >= started_at),
  check (not stripe_customer_deleted or stripe_customer_created),
  check (not daily_room_deleted or daily_room_created),
  check (
    cleanup_complete = (
      (not stripe_customer_created or stripe_customer_deleted)
      and (not daily_room_created or daily_room_deleted)
    )
  ),
  check (
    (status='cleanup_incomplete' and cleanup_complete is false)
    or (status='passed' and cleanup_complete is true and failure_code is null
      and preview_project_verified and stripe_account_verified and daily_webhook_domain_verified)
    or (status='failed' and cleanup_complete is true
      and (failure_code is not null or not preview_project_verified or not stripe_account_verified or not daily_webhook_domain_verified))
  )
);

create table if not exists public.lesson_booking_provider_rehearsal_reconciliations (
  run_id uuid primary key references public.lesson_booking_provider_rehearsals(run_id) on delete restrict,
  admin_id uuid not null references public.profiles(id) on delete restrict,
  reason_code text not null check (reason_code ~ '^[a-z0-9][a-z0-9_.-]{2,79}$'),
  evidence_reference text not null check (length(trim(evidence_reference)) between 3 and 200),
  reconciled_at timestamptz not null default clock_timestamp()
);

alter table public.lesson_booking_provider_rehearsals enable row level security;
alter table public.lesson_booking_provider_rehearsal_reconciliations enable row level security;
revoke all on table public.lesson_booking_provider_rehearsals from anon, authenticated;
revoke all on table public.lesson_booking_provider_rehearsal_reconciliations from anon, authenticated;

drop trigger if exists lesson_booking_provider_rehearsals_append_only on public.lesson_booking_provider_rehearsals;
create trigger lesson_booking_provider_rehearsals_append_only
before update or delete on public.lesson_booking_provider_rehearsals
for each row execute function public.forbid_change();

drop trigger if exists lesson_booking_provider_rehearsal_reconciliations_append_only on public.lesson_booking_provider_rehearsal_reconciliations;
create trigger lesson_booking_provider_rehearsal_reconciliations_append_only
before update or delete on public.lesson_booking_provider_rehearsal_reconciliations
for each row execute function public.forbid_change();

create or replace function public.admin_ingest_booking_provider_rehearsal(
  p_run_id uuid,
  p_schema_version text,
  p_started_at timestamptz,
  p_completed_at timestamptz,
  p_preview_project_verified boolean,
  p_stripe_account_verified boolean,
  p_daily_webhook_domain_verified boolean,
  p_stripe_customer_created boolean,
  p_stripe_customer_deleted boolean,
  p_daily_room_created boolean,
  p_daily_room_deleted boolean,
  p_cleanup_complete boolean,
  p_evidence_sha256 text,
  p_failure_code text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid := auth.uid();
  v_status text;
  v_failure_code text := nullif(lower(trim(coalesce(p_failure_code,''))), '');
  existing public.lesson_booking_provider_rehearsals%rowtype;
  expected_cleanup boolean;
begin
  perform private.smart_parrot_require_admin(uid);
  expected_cleanup := (not p_stripe_customer_created or p_stripe_customer_deleted)
    and (not p_daily_room_created or p_daily_room_deleted);

  if p_run_id is null
     or p_schema_version <> 'smart_parrot_provider_preview_e2e_v1'
     or p_started_at is null or p_completed_at is null or p_completed_at < p_started_at
     or p_preview_project_verified is null or p_stripe_account_verified is null
     or p_daily_webhook_domain_verified is null
     or p_stripe_customer_created is null or p_stripe_customer_deleted is null
     or p_daily_room_created is null or p_daily_room_deleted is null
     or p_cleanup_complete is null or p_cleanup_complete <> expected_cleanup
     or (p_stripe_customer_deleted and not p_stripe_customer_created)
     or (p_daily_room_deleted and not p_daily_room_created)
     or p_evidence_sha256 is null or lower(p_evidence_sha256) !~ '^[0-9a-f]{64}$'
     or (v_failure_code is not null and v_failure_code !~ '^[a-z0-9][a-z0-9_.-]{2,79}$') then
    raise exception 'invalid_provider_rehearsal_evidence' using errcode='22023';
  end if;

  if not p_cleanup_complete then
    v_status := 'cleanup_incomplete';
    v_failure_code := coalesce(v_failure_code,'cleanup_incomplete');
  elsif v_failure_code is not null
     or not p_preview_project_verified
     or not p_stripe_account_verified
     or not p_daily_webhook_domain_verified then
    v_status := 'failed';
  else
    v_status := 'passed';
  end if;

  select * into existing
  from public.lesson_booking_provider_rehearsals r
  where r.run_id=p_run_id;
  if found then
    if existing.schema_version=p_schema_version
       and existing.started_at=p_started_at
       and existing.completed_at=p_completed_at
       and existing.preview_project_verified=p_preview_project_verified
       and existing.stripe_account_verified=p_stripe_account_verified
       and existing.daily_webhook_domain_verified=p_daily_webhook_domain_verified
       and existing.stripe_customer_created=p_stripe_customer_created
       and existing.stripe_customer_deleted=p_stripe_customer_deleted
       and existing.daily_room_created=p_daily_room_created
       and existing.daily_room_deleted=p_daily_room_deleted
       and existing.cleanup_complete=p_cleanup_complete
       and existing.status=v_status
       and existing.failure_code is not distinct from v_failure_code
       and existing.evidence_sha256=lower(p_evidence_sha256) then
      return jsonb_build_object(
        'schema_version','smart_parrot_provider_rehearsal_registry_v1',
        'run_id',existing.run_id,
        'status',existing.status,
        'cleanup_complete',existing.cleanup_complete,
        'replay',true
      );
    end if;
    raise exception 'provider_rehearsal_conflicting_replay' using errcode='23505';
  end if;

  insert into public.lesson_booking_provider_rehearsals(
    run_id,schema_version,started_at,completed_at,
    preview_project_verified,stripe_account_verified,daily_webhook_domain_verified,
    stripe_customer_created,stripe_customer_deleted,daily_room_created,daily_room_deleted,
    cleanup_complete,status,failure_code,evidence_sha256,ingested_by
  ) values (
    p_run_id,p_schema_version,p_started_at,p_completed_at,
    p_preview_project_verified,p_stripe_account_verified,p_daily_webhook_domain_verified,
    p_stripe_customer_created,p_stripe_customer_deleted,p_daily_room_created,p_daily_room_deleted,
    p_cleanup_complete,v_status,v_failure_code,lower(p_evidence_sha256),uid
  );

  return jsonb_build_object(
    'schema_version','smart_parrot_provider_rehearsal_registry_v1',
    'run_id',p_run_id,
    'status',v_status,
    'cleanup_complete',p_cleanup_complete,
    'replay',false
  );
end;
$$;

create or replace function public.admin_reconcile_booking_provider_rehearsal_cleanup(
  p_run_id uuid,
  p_reason_code text,
  p_evidence_reference text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid := auth.uid();
  r public.lesson_booking_provider_rehearsals%rowtype;
  existing public.lesson_booking_provider_rehearsal_reconciliations%rowtype;
  v_reason_code text := lower(trim(coalesce(p_reason_code,'')));
  v_reference text := trim(coalesce(p_evidence_reference,''));
begin
  perform private.smart_parrot_require_admin(uid);
  if p_run_id is null
     or v_reason_code !~ '^[a-z0-9][a-z0-9_.-]{2,79}$'
     or length(v_reference) not between 3 and 200 then
    raise exception 'invalid_provider_rehearsal_reconciliation' using errcode='22023';
  end if;

  select * into r from public.lesson_booking_provider_rehearsals where run_id=p_run_id;
  if not found then raise exception 'provider_rehearsal_not_found' using errcode='P0002'; end if;
  if r.status <> 'cleanup_incomplete' then
    raise exception 'provider_rehearsal_cleanup_not_reconcilable' using errcode='22023';
  end if;

  select * into existing from public.lesson_booking_provider_rehearsal_reconciliations where run_id=p_run_id;
  if found then
    if existing.reason_code=v_reason_code and existing.evidence_reference=v_reference then
      return jsonb_build_object('run_id',p_run_id,'status','reconciled','replay',true);
    end if;
    raise exception 'provider_rehearsal_reconciliation_conflict' using errcode='23505';
  end if;

  insert into public.lesson_booking_provider_rehearsal_reconciliations(run_id,admin_id,reason_code,evidence_reference)
  values (p_run_id,uid,v_reason_code,v_reference);

  return jsonb_build_object('run_id',p_run_id,'status','reconciled','replay',false);
end;
$$;

create or replace function public.admin_review_queue(
  p_limit int default 50,
  p_now timestamptz default clock_timestamp()
) returns table(
  source text,
  review_case_id uuid,
  booking_id uuid,
  category text,
  severity text,
  summary text,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare uid uuid := auth.uid();
begin
  perform private.smart_parrot_require_admin(uid);
  if p_limit is null or p_limit<1 or p_limit>100 or p_now is null then
    raise exception 'invalid_admin_review_queue_request' using errcode='22023';
  end if;

  return query
  with items as (
    select 'manual_case'::text s,c.id cid,c.booking_id bid,c.kind cat,c.priority sev,left(c.reason,500) summary,c.opened_at happened
    from public.admin_review_cases c where c.status in ('open','in_review')
    union all
    select 'payment_hold',null::uuid,b.id,'payment',case when b.starts_at<=p_now+interval '12 hours' then 'urgent' else 'high' end,
      'Payment hold failed before lesson',coalesce(b.hold_due_at,b.created_at) from public.bookings b
    where b.status='hold_failed' and b.starts_at>=p_now-interval '1 day' and b.starts_at<=p_now+interval '48 hours'
    union all
    select 'settlement_error',null::uuid,b.id,'payment',case when b.settlement_attempts>=6 or b.settlement_last_error_at<=p_now-interval '6 hours' then 'urgent' else 'high' end,
      'Settlement requires operator review',b.settlement_last_error_at from public.bookings b
    where b.settlement_last_error_at is not null and b.status='awaiting_settlement'
    union all
    select 'cancellation_error',null::uuid,b.id,'cancellation',case when b.cancellation_attempts>=6 or b.cancellation_last_error_at<=p_now-interval '6 hours' then 'urgent' else 'high' end,
      'Cancellation payment/finalization requires operator review',b.cancellation_last_error_at from public.bookings b
    where b.cancellation_last_error_at is not null and b.cancellation_requested_at is not null and b.status<>'cancelled'
    union all
    select 'compliance_delivery',null::uuid,o.booking_id,'compliance',case when o.dead_lettered_at is not null or o.queued_at<=p_now-interval '48 hours' then 'urgent' else 'high' end,
      case when o.dead_lettered_at is not null then 'Compliance acknowledgement delivery dead-lettered' else 'Compliance acknowledgement delivery overdue' end,
      coalesce(o.dead_lettered_at,o.last_attempt_at,o.queued_at) from public.compliance_notice_outbox o
    where o.delivered_at is null and (o.dead_lettered_at is not null or o.queued_at<=p_now-interval '24 hours')
    union all
    select 'stripe_dispute_unmatched',null::uuid,null::uuid,'dispute',case when s.needs_reconciliation then 'urgent' else 'high' end,
      left('Unmatched Stripe test dispute '||s.dispute_id||' current status '||s.current_status||case when s.needs_reconciliation then ' (provider state needs reconciliation)' else '' end,500),s.updated_at
    from public.stripe_dispute_current_state s where s.booking_id is null
    union all
    select 'stripe_dispute_unmatched',null::uuid,null::uuid,'dispute','urgent',
      left('Legacy unmatched Stripe test dispute '||d.dispute_id||' status '||d.dispute_status||' (provider refresh required)',500),d.received_at
    from public.stripe_dispute_events d
    where d.booking_id is null
      and not exists (select 1 from public.stripe_dispute_current_state s where s.dispute_id=d.dispute_id)
      and not exists (select 1 from public.stripe_dispute_events newer where newer.dispute_id=d.dispute_id and newer.received_at>d.received_at)
    union all
    select 'retention_unclassified',null::uuid,b.id,'retention','normal','Booking evidence has no retention classification',b.created_at
    from public.bookings b
    where not exists (select 1 from public.booking_retention_controls rc where rc.booking_id=b.id)
      and (exists (select 1 from public.consents x where x.booking_id=b.id)
        or exists (select 1 from public.attendance_events x where x.booking_id=b.id)
        or exists (select 1 from public.ledger_entries x where x.booking_id=b.id))
    union all
    select 'retention_review_overdue',null::uuid,rc.booking_id,'retention',case when rc.legal_hold then 'high' else 'normal' end,
      case when rc.legal_hold then 'Legal-hold retention review is overdue' else 'Retention review is overdue' end,rc.updated_at
    from public.booking_retention_controls rc where rc.review_after is not null and rc.review_after<p_now::date
    union all
    select 'retention_policy_unapproved',null::uuid,null::uuid,'retention','high',
      left('Retention classes still require reviewed duration/source authority: '||g.missing_count::text,500),p_now
    from (
      select count(*)::int missing_count from public.lesson_booking_retention_classes c
      where c.approved_at is null or c.approved_by is null or c.approval_reference is null
        or c.source_authority is null or c.active_retention_days is null
    ) g where g.missing_count>0
    union all
    select 'provider_rehearsal_cleanup',null::uuid,null::uuid,'launch_rehearsal','urgent',
      'Provider preview rehearsal cleanup requires reconciliation',r.completed_at
    from public.lesson_booking_provider_rehearsals r
    where r.status='cleanup_incomplete'
      and not exists (select 1 from public.lesson_booking_provider_rehearsal_reconciliations x where x.run_id=r.run_id)
  )
  select i.s,i.cid,i.bid,i.cat,i.sev,i.summary,i.happened
  from items i
  where i.s='manual_case' or i.bid is null or not exists (
    select 1 from public.admin_operational_alert_acknowledgements a
    where a.source=i.s and a.booking_id=i.bid and a.snoozed_until>p_now
  )
  order by case i.sev when 'urgent' then 0 when 'high' then 1 else 2 end,i.happened nulls first,i.bid
  limit p_limit;
end;
$$;

create or replace function public.admin_booking_launch_health(p_now timestamptz default clock_timestamp()) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  uid uuid := auth.uid(); hold_failed_near_term int; stale_settlement_claims int; settlement_errors int;
  cancellation_errors int; overdue_compliance int; dead_lettered_compliance int; unmatched_disputes int;
  dispute_reconciliation int; open_review_cases int; active_claimed_cases int; stale_claimed_cases int;
  unclassified_evidence_bookings int; overdue_legal_hold_reviews int; unapproved_retention_classes int;
  retention_reviews_due_next_30d int; provider_rehearsal_missing int; provider_rehearsal_latest_failed int;
  unreconciled_provider_cleanup_failures int; attention_count int;
begin
  perform private.smart_parrot_require_admin(uid);
  if p_now is null then raise exception 'invalid_admin_launch_health_request' using errcode='22023'; end if;
  select count(*) into hold_failed_near_term from public.bookings b where b.status='hold_failed' and b.starts_at>=p_now-interval '1 day' and b.starts_at<=p_now+interval '48 hours';
  select count(*) into stale_settlement_claims from public.bookings b where b.status='awaiting_settlement' and b.settlement_claimed_at is not null and b.settlement_claimed_at<=p_now-interval '10 minutes';
  select count(*) into settlement_errors from public.bookings b where b.status='awaiting_settlement' and b.settlement_last_error_at is not null;
  select count(*) into cancellation_errors from public.bookings b where b.status<>'cancelled' and b.cancellation_requested_at is not null and b.cancellation_last_error_at is not null;
  select count(*) into overdue_compliance from public.compliance_notice_outbox o where o.delivered_at is null and o.dead_lettered_at is null and o.queued_at<=p_now-interval '24 hours';
  select count(*) into dead_lettered_compliance from public.compliance_notice_outbox o where o.delivered_at is null and o.dead_lettered_at is not null;
  select count(*) into unmatched_disputes from public.stripe_dispute_current_state s where s.booking_id is null;
  select count(*) into dispute_reconciliation from public.stripe_dispute_current_state s where s.needs_reconciliation;
  select count(*) into open_review_cases from public.admin_review_cases c where c.status in ('open','in_review');
  select count(*) into active_claimed_cases from public.admin_review_cases c where c.status='in_review' and c.claimed_by is not null and c.claim_expires_at>p_now;
  select count(*) into stale_claimed_cases from public.admin_review_cases c where c.status='in_review' and c.claimed_by is not null and c.claim_expires_at<=p_now;
  select count(*) into unclassified_evidence_bookings from public.bookings b
    where not exists (select 1 from public.booking_retention_controls rc where rc.booking_id=b.id)
      and (exists (select 1 from public.consents x where x.booking_id=b.id)
        or exists (select 1 from public.attendance_events x where x.booking_id=b.id)
        or exists (select 1 from public.ledger_entries x where x.booking_id=b.id));
  select count(*) into overdue_legal_hold_reviews from public.booking_retention_controls rc
    where rc.legal_hold and rc.review_after is not null and rc.review_after<p_now::date;
  select count(*) into retention_reviews_due_next_30d from public.booking_retention_controls rc
    where rc.review_after is not null and rc.review_after>=p_now::date and rc.review_after<=p_now::date+30;
  select count(*) into unapproved_retention_classes from public.lesson_booking_retention_classes c
    where c.approved_at is null or c.approved_by is null or c.approval_reference is null
      or c.source_authority is null or c.active_retention_days is null;
  select case when exists (select 1 from public.lesson_booking_provider_rehearsals r where r.status='passed') then 0 else 1 end
    into provider_rehearsal_missing;
  select case when coalesce((select r.status from public.lesson_booking_provider_rehearsals r order by r.completed_at desc,r.ingested_at desc limit 1),'')='failed' then 1 else 0 end
    into provider_rehearsal_latest_failed;
  select count(*) into unreconciled_provider_cleanup_failures
    from public.lesson_booking_provider_rehearsals r
    where r.status='cleanup_incomplete'
      and not exists (select 1 from public.lesson_booking_provider_rehearsal_reconciliations x where x.run_id=r.run_id);

  attention_count := hold_failed_near_term+stale_settlement_claims+settlement_errors+cancellation_errors+
    overdue_compliance+dead_lettered_compliance+unmatched_disputes+dispute_reconciliation+stale_claimed_cases+
    unclassified_evidence_bookings+overdue_legal_hold_reviews+unapproved_retention_classes+
    provider_rehearsal_missing+provider_rehearsal_latest_failed+unreconciled_provider_cleanup_failures;

  return jsonb_build_object('schema_version','smart_parrot_booking_launch_health_v3','generated_at',p_now,
    'status',case when attention_count=0 then 'healthy' else 'attention' end,'attention_count',attention_count,
    'counts',jsonb_build_object(
      'hold_failed_near_term',hold_failed_near_term,'stale_settlement_claims',stale_settlement_claims,
      'settlement_errors',settlement_errors,'cancellation_errors',cancellation_errors,
      'overdue_compliance_notices',overdue_compliance,'dead_lettered_compliance_notices',dead_lettered_compliance,
      'unmatched_disputes',unmatched_disputes,'disputes_needing_reconciliation',dispute_reconciliation,
      'open_review_cases',open_review_cases,'active_claimed_cases',active_claimed_cases,'stale_claimed_cases',stale_claimed_cases,
      'unclassified_evidence_bookings',unclassified_evidence_bookings,'overdue_legal_hold_reviews',overdue_legal_hold_reviews,
      'retention_reviews_due_next_30d',retention_reviews_due_next_30d,'unapproved_retention_classes',unapproved_retention_classes,
      'provider_rehearsal_missing',provider_rehearsal_missing,'provider_rehearsal_latest_failed',provider_rehearsal_latest_failed,
      'unreconciled_provider_cleanup_failures',unreconciled_provider_cleanup_failures),
    'boundaries',jsonb_build_array(
      'Counts only: no secret values, provider object identifiers, provider payloads, customer identifiers, evidence bodies, or legal-hold reasons are returned',
      'A nonzero count is an operator signal, not authority to move money, erase evidence, or change provider state',
      'Provider rehearsal evidence is append-only and contains only booleans, timestamps, a machine-readable failure code, and a SHA-256 evidence hash',
      'Retention alerts never perform automatic erasure; reviewed duration approval remains separate governance'));
end;
$$;

revoke all on function public.admin_ingest_booking_provider_rehearsal(uuid,text,timestamptz,timestamptz,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text) from public, anon, authenticated;
revoke all on function public.admin_reconcile_booking_provider_rehearsal_cleanup(uuid,text,text) from public, anon, authenticated;
grant execute on function public.admin_ingest_booking_provider_rehearsal(uuid,text,timestamptz,timestamptz,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text) to authenticated;
grant execute on function public.admin_reconcile_booking_provider_rehearsal_cleanup(uuid,text,text) to authenticated;
revoke all on function public.admin_review_queue(int,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_review_queue(int,timestamptz) to authenticated;
revoke all on function public.admin_booking_launch_health(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_booking_launch_health(timestamptz) to authenticated;

comment on table public.lesson_booking_provider_rehearsals is 'Append-only minimized preview rehearsal evidence. No provider object IDs, raw payloads, secrets, or customer data.';
comment on table public.lesson_booking_provider_rehearsal_reconciliations is 'Append-only operator evidence that an incomplete preview cleanup was independently reconciled; no provider write authority.';
comment on function public.admin_ingest_booking_provider_rehearsal(uuid,text,timestamptz,timestamptz,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text) is 'Admin-only idempotent ingestion of minimized preview-rehearsal evidence/hash. No payment/provider authority.';
comment on function public.admin_reconcile_booking_provider_rehearsal_cleanup(uuid,text,text) is 'Admin-only append-only reconciliation marker for a cleanup-incomplete preview rehearsal; does not call providers.';
