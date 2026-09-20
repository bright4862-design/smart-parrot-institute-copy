-- Phase 3A: exact cancellation finalization + settlement exclusion.
create or replace function public.finalize_booking_cancellation(
  p_booking_id uuid,p_cancellation_attempt int,p_captured_cents int,p_released_cents int
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  b public.bookings%rowtype; r public.booking_cancellation_requests%rowtype;
  want_capture int; want_release int; notice_kind text; cancelled_by text;
begin
  if p_booking_id is null or p_cancellation_attempt is null or p_cancellation_attempt<1
     or p_captured_cents is null or p_captured_cents<0 or p_released_cents is null or p_released_cents<0 then
    raise exception 'invalid_cancellation_finalization' using errcode='22023';
  end if;
  select * into b from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'booking_not_found' using errcode='P0002'; end if;
  select * into r from public.booking_cancellation_requests where booking_id=b.id;
  if not found then raise exception 'cancellation_request_not_found' using errcode='P0002'; end if;

  if r.payment_action='capture' then want_capture:=r.amount_cents; want_release:=b.max_charge_cents-r.amount_cents;
  elsif r.payment_action='release' then want_capture:=0; want_release:=b.max_charge_cents;
  else want_capture:=0; want_release:=0; end if;

  if b.status='cancelled' then
    if b.final_amount_cents=want_capture and p_captured_cents=want_capture and p_released_cents=want_release then
      return jsonb_build_object('booking_id',b.id,'request_id',r.id,'status',b.status,'outcome',b.outcome,
        'amount_cents',b.final_amount_cents,'released_cents',want_release,'idempotent',true);
    end if;
    raise exception 'cancellation_already_finalized_with_different_amount' using errcode='23505';
  end if;
  if b.cancellation_requested_at is null or b.cancellation_attempts<>p_cancellation_attempt then raise exception 'stale_cancellation_attempt' using errcode='40001'; end if;
  if p_captured_cents<>want_capture or p_released_cents<>want_release then raise exception 'cancellation_amount_mismatch' using errcode='22023'; end if;
  if r.payment_action<>'none' and b.stripe_payment_intent_id is null then raise exception 'cancellation_payment_intent_missing' using errcode='55000'; end if;

  if p_captured_cents>0 then insert into public.ledger_entries(booking_id,kind,amount_cents,currency,stripe_object_id,note)
    values(b.id,'captured',p_captured_cents,b.currency,b.stripe_payment_intent_id,'Phase 3A policy cancellation settlement') on conflict do nothing; end if;
  if p_released_cents>0 then insert into public.ledger_entries(booking_id,kind,amount_cents,currency,stripe_object_id,note)
    values(b.id,'hold_released',p_released_cents,b.currency,b.stripe_payment_intent_id,'Authorization remainder released after cancellation') on conflict do nothing; end if;

  cancelled_by:=case when r.actor_role='tutor' then 'tutor' else 'student' end;
  notice_kind:=case when r.kind='withdrawal' then 'withdrawal_acknowledgement' else 'cancellation_confirmation' end;
  update public.bookings set status='cancelled',cancelled_at=r.requested_at,cancelled_by=cancelled_by,cancel_kind=r.kind,
    outcome=r.outcome,final_amount_cents=r.amount_cents,settled_at=clock_timestamp(),cancellation_last_error_code=null,cancellation_last_error_at=null
  where id=b.id returning * into b;

  insert into public.compliance_notice_outbox(booking_id,user_id,kind,payload)
  values(b.id,b.student_id,notice_kind,jsonb_build_object('booking_id',b.id,'cancellation_request_id',r.id,'kind',r.kind,
    'requested_at',r.requested_at,'outcome',r.outcome,'amount_cents',r.amount_cents,'currency',b.currency,
    'policy_version_id',r.policy_version_id,'terms_sha256',r.terms_sha256))
  on conflict(booking_id,kind) do nothing;
  return jsonb_build_object('booking_id',b.id,'request_id',r.id,'status',b.status,'outcome',b.outcome,
    'amount_cents',b.final_amount_cents,'released_cents',p_released_cents,'notice_kind',notice_kind,'idempotent',false);
end; $$;

-- Cancellation and end-of-lesson settlement must never race for ownership.
create or replace function public.claim_lesson_settlements(p_now timestamptz default clock_timestamp(),p_limit int default 25)
returns table(booking_id uuid,stripe_payment_intent_id text,max_charge_cents int,currency text,capture_before timestamptz,settlement_attempt int)
language plpgsql security definer set search_path='' as $$
begin
  if p_now is null or p_limit is null or p_limit<1 or p_limit>50 then raise exception 'invalid_settlement_claim_request' using errcode='22023'; end if;
  return query with candidates as (
    select b.id from public.bookings b join public.policy_versions p on p.id=b.policy_version_id
    where b.cancellation_requested_at is null and (
      (b.status='hold_placed' and b.ends_at<=p_now-make_interval(mins=>greatest(0,least(1440,coalesce((p.config->>'capture_delay_minutes')::int,60)))))
      or (b.status='awaiting_settlement' and (b.settlement_claimed_at is null or b.settlement_claimed_at<=p_now-interval '10 minutes')))
    order by b.ends_at,b.id for update of b skip locked limit p_limit
  ), moved as (
    update public.bookings b set status='awaiting_settlement',settlement_claimed_at=p_now,
      settlement_attempts=b.settlement_attempts+1,settlement_last_error_code=null,settlement_last_error_at=null
    from candidates c where b.id=c.id and b.cancellation_requested_at is null
    returning b.id,b.stripe_payment_intent_id,b.max_charge_cents,b.currency,b.capture_before,b.settlement_attempts
  ) select m.id,m.stripe_payment_intent_id,m.max_charge_cents,m.currency,m.capture_before,m.settlement_attempts from moved m order by m.id;
end; $$;

revoke all on function public.finalize_booking_cancellation(uuid,int,int,int) from public,anon,authenticated;
revoke all on function public.claim_lesson_settlements(timestamptz,int) from public,anon,authenticated;
grant execute on function public.finalize_booking_cancellation(uuid,int,int,int) to service_role;
grant execute on function public.claim_lesson_settlements(timestamptz,int) to service_role;
