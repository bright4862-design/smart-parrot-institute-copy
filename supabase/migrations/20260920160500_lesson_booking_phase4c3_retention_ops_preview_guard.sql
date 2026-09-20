-- Smart Parrot Institute lesson-booking Phase 4C3
-- Retention operations + preview hardening. This migration adds operator signals
-- and audited metadata controls only. It does not erase, archive, anonymize, move,
-- deploy, charge, capture, refund, or write to any external provider.

create or replace function public.admin_booking_retention_options()
returns table(
  code text,
  purpose text,
  period_status text,
  active_retention_days int,
  archive_retention_days int
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
  return query
  select c.code,
         c.purpose,
         case
           when c.approved_at is null or c.source_authority is null or c.active_retention_days is null
             then 'approved_duration_required'::text
           else 'approved'::text
         end,
         c.active_retention_days,
         c.archive_retention_days
  from public.lesson_booking_retention_classes c
  order by c.code;
end;
$$;

revoke all on function public.admin_booking_retention_options() from public, anon, authenticated;
grant execute on function public.admin_booking_retention_options() to authenticated;

create or replace function public.admin_review_queue(
  p_limit int default 50,p_now timestamptz default clock_timestamp()
) returns table(source text,review_case_id uuid,booking_id uuid,category text,severity text,summary text,occurred_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare uid uuid := auth.uid();
begin
  perform private.smart_parrot_require_admin(uid);
  if p_limit is null or p_limit<1 or p_limit>100 or p_now is null then raise exception 'invalid_admin_review_queue_request' using errcode='22023'; end if;
  return query with items as (
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
    select 'retention_unclassified',null::uuid,b.id,'retention','normal',
      'Booking evidence has no retention classification',b.created_at
    from public.bookings b
    where not exists (select 1 from public.booking_retention_controls rc where rc.booking_id=b.id)
      and (
        exists (select 1 from public.consents x where x.booking_id=b.id)
        or exists (select 1 from public.attendance_events x where x.booking_id=b.id)
        or exists (select 1 from public.ledger_entries x where x.booking_id=b.id)
      )
    union all
    select 'retention_review_overdue',null::uuid,rc.booking_id,'retention',case when rc.legal_hold then 'high' else 'normal' end,
      case when rc.legal_hold then 'Legal-hold retention review is overdue' else 'Retention review is overdue' end,
      rc.updated_at
    from public.booking_retention_controls rc
    where rc.review_after is not null and rc.review_after < p_now::date
    union all
    select 'retention_policy_unapproved',null::uuid,null::uuid,'retention','high',
      left('Retention classes still require approved duration/source authority: '||g.missing_count::text,500),p_now
    from (
      select count(*)::int missing_count
      from public.lesson_booking_retention_classes c
      where c.approved_at is null or c.source_authority is null or c.active_retention_days is null
    ) g where g.missing_count>0
  )
  select i.s,i.cid,i.bid,i.cat,i.sev,i.summary,i.happened from items i
  where i.s='manual_case' or i.bid is null or not exists (select 1 from public.admin_operational_alert_acknowledgements a
    where a.source=i.s and a.booking_id=i.bid and a.snoozed_until>p_now)
  order by case i.sev when 'urgent' then 0 when 'high' then 1 else 2 end,i.happened nulls first,i.bid limit p_limit;
end;
$$;

create or replace function public.admin_booking_launch_health(p_now timestamptz default clock_timestamp()) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  uid uuid := auth.uid(); hold_failed_near_term int; stale_settlement_claims int; settlement_errors int;
  cancellation_errors int; overdue_compliance int; dead_lettered_compliance int; unmatched_disputes int;
  dispute_reconciliation int; open_review_cases int; active_claimed_cases int; stale_claimed_cases int;
  unclassified_evidence_bookings int; overdue_legal_hold_reviews int; unapproved_retention_classes int;
  attention_count int;
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
  select count(*) into unclassified_evidence_bookings
    from public.bookings b
    where not exists (select 1 from public.booking_retention_controls rc where rc.booking_id=b.id)
      and (
        exists (select 1 from public.consents x where x.booking_id=b.id)
        or exists (select 1 from public.attendance_events x where x.booking_id=b.id)
        or exists (select 1 from public.ledger_entries x where x.booking_id=b.id)
      );
  select count(*) into overdue_legal_hold_reviews from public.booking_retention_controls rc
    where rc.legal_hold and rc.review_after is not null and rc.review_after < p_now::date;
  select count(*) into unapproved_retention_classes from public.lesson_booking_retention_classes c
    where c.approved_at is null or c.source_authority is null or c.active_retention_days is null;
  attention_count := hold_failed_near_term+stale_settlement_claims+settlement_errors+cancellation_errors+
    overdue_compliance+dead_lettered_compliance+unmatched_disputes+dispute_reconciliation+stale_claimed_cases+
    unclassified_evidence_bookings+overdue_legal_hold_reviews+unapproved_retention_classes;
  return jsonb_build_object('schema_version','smart_parrot_booking_launch_health_v2','generated_at',p_now,
    'status',case when attention_count=0 then 'healthy' else 'attention' end,'attention_count',attention_count,
    'counts',jsonb_build_object('hold_failed_near_term',hold_failed_near_term,'stale_settlement_claims',stale_settlement_claims,
      'settlement_errors',settlement_errors,'cancellation_errors',cancellation_errors,'overdue_compliance_notices',overdue_compliance,
      'dead_lettered_compliance_notices',dead_lettered_compliance,'unmatched_disputes',unmatched_disputes,
      'disputes_needing_reconciliation',dispute_reconciliation,'open_review_cases',open_review_cases,
      'active_claimed_cases',active_claimed_cases,'stale_claimed_cases',stale_claimed_cases,
      'unclassified_evidence_bookings',unclassified_evidence_bookings,'overdue_legal_hold_reviews',overdue_legal_hold_reviews,
      'unapproved_retention_classes',unapproved_retention_classes),
    'boundaries',jsonb_build_array('Counts only: no secret values, provider payloads, customer identifiers, evidence bodies, or legal-hold reasons are returned',
      'A nonzero count is an operator signal, not authority to move money, erase evidence, or change provider dispute state',
      'Retention alerts never perform automatic erasure; period approval remains a separate documented governance action'));
end;
$$;

revoke all on function public.admin_review_queue(int,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_review_queue(int,timestamptz) to authenticated;
revoke all on function public.admin_booking_launch_health(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_booking_launch_health(timestamptz) to authenticated;

comment on function public.admin_booking_retention_options() is 'Admin-only safe retention class metadata. Returns no customer data, secret values, or legal-hold reasons.';
comment on function public.admin_booking_launch_health(timestamptz) is 'Admin-only count summary including retention governance gaps. Signals only; never erases evidence or changes provider/payment state.';
