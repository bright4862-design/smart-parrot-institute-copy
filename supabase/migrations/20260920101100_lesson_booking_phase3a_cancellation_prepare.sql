-- Phase 3A: server-authoritative cancellation claim.
create or replace function private.smart_parrot_cancellation_payload(
  b public.bookings, r public.booking_cancellation_requests, idem boolean
) returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'booking_id',(b).id,'request_id',(r).id,'status',(b).status,'kind',(r).kind,
    'actor_role',(r).actor_role,'requested_at',(r).requested_at,'outcome',(r).outcome,
    'amount_cents',(r).amount_cents,'payment_action',(r).payment_action,
    'payment_intent_id',(b).stripe_payment_intent_id,'max_charge_cents',(b).max_charge_cents,
    'currency',(b).currency,'cancellation_attempt',(b).cancellation_attempts,'idempotent',idem
  );
$$;
revoke all on function private.smart_parrot_cancellation_payload(public.bookings,public.booking_cancellation_requests,boolean) from public,anon,authenticated;

create or replace function public.prepare_booking_cancellation(
  p_actor_id uuid, p_booking_id uuid, p_kind text,
  p_now timestamptz default clock_timestamp(), p_ip text default null, p_user_agent text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  b public.bookings%rowtype; p public.policy_versions%rowtype; r public.booking_cancellation_requests%rowtype;
  actor text; free_h int; late_h int; late_pct numeric; withdrawal_mode text; withdrawal_days int;
  result_outcome public.lesson_outcome; amount int; action text; parsed_ip inet;
  now_at timestamptz := coalesce(p_now,clock_timestamp());
begin
  if p_actor_id is null or p_booking_id is null or p_kind is null or p_kind not in ('cancel','withdrawal') then
    raise exception 'invalid_cancellation_request' using errcode='22023';
  end if;

  select * into b from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'booking_not_found' using errcode='P0002'; end if;
  if p_actor_id=b.student_id then actor:='student';
  elsif p_actor_id=b.tutor_id then actor:='tutor';
  else raise exception 'booking_not_found' using errcode='P0002'; end if;

  select * into r from public.booking_cancellation_requests where booking_id=b.id;
  if b.status='cancelled' then
    if found and r.requested_by=p_actor_id and r.kind=p_kind then return private.smart_parrot_cancellation_payload(b,r,true); end if;
    raise exception 'booking_already_cancelled' using errcode='55000';
  end if;
  if b.cancellation_requested_at is not null then
    if found and r.requested_by=p_actor_id and r.kind=p_kind then return private.smart_parrot_cancellation_payload(b,r,true); end if;
    raise exception 'cancellation_already_requested' using errcode='55000';
  end if;
  if b.status in ('awaiting_settlement','settled') then raise exception 'booking_not_cancellable' using errcode='55000'; end if;
  if now_at>=b.starts_at then raise exception 'too_late_to_cancel' using errcode='55000'; end if;
  if p_kind='withdrawal' and actor<>'student' then raise exception 'withdrawal_student_only' using errcode='42501'; end if;

  select * into p from public.policy_versions where id=b.policy_version_id;
  if not found then raise exception 'booking_policy_not_found' using errcode='P0002'; end if;

  if p_kind='withdrawal' then
    withdrawal_mode:=coalesce(p.config->>'withdrawal_mode','review_required');
    if withdrawal_mode<>'service_14d' then raise exception 'withdrawal_not_enabled_for_policy' using errcode='55000'; end if;
    begin withdrawal_days:=coalesce((p.config->>'withdrawal_window_days')::int,14);
    exception when others then raise exception 'invalid_withdrawal_policy' using errcode='22023'; end;
    if withdrawal_days<1 or withdrawal_days>30 then raise exception 'invalid_withdrawal_policy' using errcode='22023'; end if;
    if now_at>=b.created_at+make_interval(days=>withdrawal_days) then raise exception 'withdrawal_window_expired' using errcode='55000'; end if;
    result_outcome:='cancelled_free'; amount:=0;
  elsif actor='tutor' then result_outcome:='cancelled_by_tutor'; amount:=0;
  elsif b.status='pending_checkout' then result_outcome:='cancelled_free'; amount:=0;
  else
    begin
      free_h:=(p.config->>'free_cancel_hours')::int;
      late_h:=(p.config->>'late_cancel_hours')::int;
      late_pct:=(p.config->>'late_cancel_pct')::numeric;
    exception when others then raise exception 'invalid_cancellation_policy' using errcode='22023'; end;
    if free_h is null or late_h is null or late_pct is null or free_h<=late_h or late_h<0 or free_h>720 or late_pct<0 or late_pct>100 then
      raise exception 'invalid_cancellation_policy' using errcode='22023';
    end if;
    if b.starts_at-now_at>=make_interval(hours=>free_h) then result_outcome:='cancelled_free'; amount:=0;
    elsif b.starts_at-now_at>=make_interval(hours=>late_h) then result_outcome:='cancelled_late'; amount:=round(b.max_charge_cents*late_pct/100.0)::int;
    else result_outcome:='cancelled_very_late'; amount:=b.max_charge_cents; end if;
  end if;

  if amount>0 then
    if b.status<>'hold_placed' or b.stripe_payment_intent_id is null then raise exception 'cancellation_payment_not_ready' using errcode='55000'; end if;
    action:='capture';
  elsif b.status='hold_placed' and b.stripe_payment_intent_id is not null then action:='release';
  else
    if b.status='card_saved' and b.hold_due_at is not null and b.hold_due_at<=now_at then raise exception 'cancellation_payment_state_sync_required' using errcode='55000'; end if;
    action:='none';
  end if;

  if p_ip is not null and length(p_ip)<=64 and p_ip~'^[0-9A-Fa-f:.]+$' then
    begin parsed_ip:=p_ip::inet; exception when invalid_text_representation then parsed_ip:=null; end;
  end if;

  insert into public.booking_cancellation_requests(
    booking_id,requested_by,actor_role,kind,requested_at,policy_version_id,terms_sha256,outcome,amount_cents,payment_action,request_ip,user_agent
  ) values (b.id,p_actor_id,actor,p_kind,now_at,p.id,p.terms_sha256,result_outcome,amount,action,parsed_ip,left(nullif(p_user_agent,''),1000)) returning * into r;

  update public.bookings set cancellation_requested_at=now_at,cancellation_request_kind=p_kind,
    cancellation_requested_by=p_actor_id,cancellation_attempts=cancellation_attempts+1,
    cancellation_last_error_code=null,cancellation_last_error_at=null
  where id=b.id returning * into b;
  return private.smart_parrot_cancellation_payload(b,r,false);
end; $$;

create or replace function public.mark_booking_cancellation_failed(p_booking_id uuid,p_cancellation_attempt int,p_error_code text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_booking_id is null or p_cancellation_attempt is null or p_cancellation_attempt<1 or nullif(trim(p_error_code),'') is null then
    raise exception 'invalid_cancellation_failure' using errcode='22023';
  end if;
  update public.bookings set cancellation_last_error_code=left(p_error_code,120),cancellation_last_error_at=clock_timestamp()
  where id=p_booking_id and status<>'cancelled' and cancellation_requested_at is not null and cancellation_attempts=p_cancellation_attempt;
  return found;
end; $$;

revoke all on function public.prepare_booking_cancellation(uuid,uuid,text,timestamptz,text,text) from public,anon,authenticated;
revoke all on function public.mark_booking_cancellation_failed(uuid,int,text) from public,anon,authenticated;
grant execute on function public.prepare_booking_cancellation(uuid,uuid,text,timestamptz,text,text) to service_role;
grant execute on function public.mark_booking_cancellation_failed(uuid,int,text) to service_role;
