-- Smart Parrot Institute lesson-booking Phase 4C3 compatibility fix.
-- Keep Phase 4C's pre-projection unmatched Stripe dispute evidence visible while
-- retaining the Phase 4C3 retention-governance queue signals. This is an
-- operator-visibility repair only; it performs no payment/provider writes.

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
    select 'manual_case'::text s,c.id cid,c.booking_id bid,c.kind cat,c.priority sev,
      left(c.reason,500) summary,c.opened_at happened
    from public.admin_review_cases c
    where c.status in ('open','in_review')

    union all
    select 'payment_hold',null::uuid,b.id,'payment',
      case when b.starts_at<=p_now+interval '12 hours' then 'urgent' else 'high' end,
      'Payment hold failed before lesson',coalesce(b.hold_due_at,b.created_at)
    from public.bookings b
    where b.status='hold_failed'
      and b.starts_at>=p_now-interval '1 day'
      and b.starts_at<=p_now+interval '48 hours'

    union all
    select 'settlement_error',null::uuid,b.id,'payment',
      case when b.settlement_attempts>=6 or b.settlement_last_error_at<=p_now-interval '6 hours' then 'urgent' else 'high' end,
      'Settlement requires operator review',b.settlement_last_error_at
    from public.bookings b
    where b.settlement_last_error_at is not null
      and b.status='awaiting_settlement'

    union all
    select 'cancellation_error',null::uuid,b.id,'cancellation',
      case when b.cancellation_attempts>=6 or b.cancellation_last_error_at<=p_now-interval '6 hours' then 'urgent' else 'high' end,
      'Cancellation payment/finalization requires operator review',b.cancellation_last_error_at
    from public.bookings b
    where b.cancellation_last_error_at is not null
      and b.cancellation_requested_at is not null
      and b.status<>'cancelled'

    union all
    select 'compliance_delivery',null::uuid,o.booking_id,'compliance',
      case when o.dead_lettered_at is not null or o.queued_at<=p_now-interval '48 hours' then 'urgent' else 'high' end,
      case when o.dead_lettered_at is not null
        then 'Compliance acknowledgement delivery dead-lettered'
        else 'Compliance acknowledgement delivery overdue' end,
      coalesce(o.dead_lettered_at,o.last_attempt_at,o.queued_at)
    from public.compliance_notice_outbox o
    where o.delivered_at is null
      and (o.dead_lettered_at is not null or o.queued_at<=p_now-interval '24 hours')

    union all
    select 'stripe_dispute_unmatched',null::uuid,null::uuid,'dispute',
      case when s.needs_reconciliation then 'urgent' else 'high' end,
      left(
        'Unmatched Stripe test dispute '||s.dispute_id||
        ' current status '||s.current_status||
        case when s.needs_reconciliation then ' (provider state needs reconciliation)' else '' end,
        500
      ),
      s.updated_at
    from public.stripe_dispute_current_state s
    where s.booking_id is null

    union all
    select 'stripe_dispute_unmatched',null::uuid,null::uuid,'dispute','urgent',
      left(
        'Legacy unmatched Stripe test dispute '||d.dispute_id||
        ' status '||d.dispute_status||' (provider refresh required)',
        500
      ),
      d.received_at
    from public.stripe_dispute_events d
    where d.booking_id is null
      and not exists (
        select 1
        from public.stripe_dispute_current_state s
        where s.dispute_id=d.dispute_id
      )
      and not exists (
        select 1
        from public.stripe_dispute_events newer
        where newer.dispute_id=d.dispute_id
          and newer.received_at>d.received_at
      )

    union all
    select 'retention_unclassified',null::uuid,b.id,'retention','normal',
      'Booking evidence has no retention classification',b.created_at
    from public.bookings b
    where not exists (
      select 1 from public.booking_retention_controls rc where rc.booking_id=b.id
    )
      and (
        exists (select 1 from public.consents x where x.booking_id=b.id)
        or exists (select 1 from public.attendance_events x where x.booking_id=b.id)
        or exists (select 1 from public.ledger_entries x where x.booking_id=b.id)
      )

    union all
    select 'retention_review_overdue',null::uuid,rc.booking_id,'retention',
      case when rc.legal_hold then 'high' else 'normal' end,
      case when rc.legal_hold
        then 'Legal-hold retention review is overdue'
        else 'Retention review is overdue' end,
      rc.updated_at
    from public.booking_retention_controls rc
    where rc.review_after is not null
      and rc.review_after < p_now::date

    union all
    select 'retention_policy_unapproved',null::uuid,null::uuid,'retention','high',
      left(
        'Retention classes still require approved duration/source authority: '||g.missing_count::text,
        500
      ),
      p_now
    from (
      select count(*)::int missing_count
      from public.lesson_booking_retention_classes c
      where c.approved_at is null
        or c.source_authority is null
        or c.active_retention_days is null
    ) g
    where g.missing_count>0
  )
  select i.s,i.cid,i.bid,i.cat,i.sev,i.summary,i.happened
  from items i
  where i.s='manual_case'
     or i.bid is null
     or not exists (
       select 1
       from public.admin_operational_alert_acknowledgements a
       where a.source=i.s
         and a.booking_id=i.bid
         and a.snoozed_until>p_now
     )
  order by case i.sev when 'urgent' then 0 when 'high' then 1 else 2 end,
    i.happened nulls first,i.bid
  limit p_limit;
end;
$$;

revoke all on function public.admin_review_queue(int,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_review_queue(int,timestamptz) to authenticated;

comment on function public.admin_review_queue(int,timestamptz) is
  'Admin-only operational queue. Preserves provider-refreshed and legacy unmatched Stripe test dispute visibility alongside Phase 4C3 retention-governance signals; no provider/payment write authority.';
