-- Phase 4C5E durable full-preview run/checkpoint registry scenarios. Ephemeral CI only.
begin;

insert into auth.users(id,raw_user_meta_data) values
  ('78000000-0000-0000-0000-000000000001','{"full_name":"Phase4C5E Admin"}'),
  ('78000000-0000-0000-0000-000000000002','{"full_name":"Phase4C5E Outsider"}'),
  ('78000000-0000-0000-0000-000000000003','{"full_name":"Phase4C5E Student"}'),
  ('78000000-0000-0000-0000-000000000004','{"full_name":"Phase4C5E Tutor"}');

update public.profiles set role='admin' where id='78000000-0000-0000-0000-000000000001';
update public.profiles set role='tutor' where id='78000000-0000-0000-0000-000000000004';
insert into public.tutors(id,bio,active)
values ('78000000-0000-0000-0000-000000000004','preview run tutor',true);

insert into public.lesson_types(
  id,tutor_id,name,duration_minutes,on_time_price_cents,currency,active
) values (
  '78000000-0000-0000-0000-000000000010',
  '78000000-0000-0000-0000-000000000004',
  'Preview Run English',
  60,4900,'eur',true
);

insert into public.policy_versions(id,config,terms_markdown,terms_sha256,published_at)
values (
  'phase4c5e-policy',
  '{"grace_minutes":5,"no_show_after_minutes":15,"tutor_grace_minutes":5,"capture_delay_minutes":0}',
  'Preview run terms',
  repeat('b',64),
  '2026-09-20 20:00+00'
);

insert into public.bookings(
  id,student_id,tutor_id,lesson_type_id,policy_version_id,
  starts_at,ends_at,status,currency,on_time_price_cents,max_charge_cents,
  hold_strategy,hold_attempts,stripe_checkout_mode,client_request_id,settlement_attempts
) values (
  '78000000-0000-0000-0000-000000000020',
  '78000000-0000-0000-0000-000000000003',
  '78000000-0000-0000-0000-000000000004',
  '78000000-0000-0000-0000-000000000010',
  'phase4c5e-policy',
  '2026-09-22 12:00+00','2026-09-22 13:00+00','pending_checkout','eur',4900,9900,
  'at_checkout',0,'payment','78000000-0000-4000-8000-000000000100',0
),(
  '78000000-0000-0000-0000-000000000021',
  '78000000-0000-0000-0000-000000000003',
  '78000000-0000-0000-0000-000000000004',
  '78000000-0000-0000-0000-000000000010',
  'phase4c5e-policy',
  '2026-09-23 12:00+00','2026-09-23 13:00+00','pending_checkout','eur',4900,9900,
  'at_checkout',0,'payment','78000000-0000-4000-8000-000000000999',0
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select '78000000-0000-0000-0000-000000000001'::uuid
$$;

do $$
declare
  r jsonb;
  replay jsonb;
  conflict_blocked boolean := false;
  mismatch_blocked boolean := false;
  checkpoint_count int;
begin
  select public.admin_begin_booking_full_preview_run(
    '78000000-0000-4000-8000-000000000100',
    'near_term_success',
    '2026-09-20 20:10+00'
  ) into r;

  if r->>'state' <> 'initialized'
     or (r->>'revision')::int <> 0
     or (r->>'terminal')::boolean
     or (r->>'replay')::boolean then
    raise exception 'Unexpected initial preview run: %', r;
  end if;

  select public.admin_begin_booking_full_preview_run(
    '78000000-0000-4000-8000-000000000100',
    'near_term_success',
    '2026-09-20 20:11+00'
  ) into replay;
  if not (replay->>'replay')::boolean or replay->>'state' <> 'initialized' then
    raise exception 'Expected idempotent run replay: %', replay;
  end if;

  begin
    perform public.admin_begin_booking_full_preview_run(
      '78000000-0000-4000-8000-000000000100',
      'near_term_sca',
      '2026-09-20 20:12+00'
    );
  exception when unique_violation then
    conflict_blocked := true;
  end;
  if not conflict_blocked then
    raise exception 'Conflicting run scenario replay unexpectedly succeeded';
  end if;

  begin
    perform public.admin_bind_booking_full_preview_run(
      '78000000-0000-4000-8000-000000000100',
      '78000000-0000-0000-0000-000000000021',
      '2026-09-20 20:13+00'
    );
  exception when invalid_parameter_value then
    mismatch_blocked := true;
  end;
  if not mismatch_blocked then
    raise exception 'Mismatched booking request identity unexpectedly bound';
  end if;

  select public.admin_bind_booking_full_preview_run(
    '78000000-0000-4000-8000-000000000100',
    '78000000-0000-0000-0000-000000000020',
    '2026-09-20 20:14+00'
  ) into r;
  if r->>'booking_id' <> '78000000-0000-0000-0000-000000000020'
     or r->>'state' <> 'awaiting_checkout_completion'
     or r->>'pause_reason' <> 'checkout_completion'
     or (r->>'revision')::int <> 1 then
    raise exception 'Unexpected bound preview run: %', r;
  end if;

  update public.bookings set status='card_saved'
  where id='78000000-0000-0000-0000-000000000020';
  select public.admin_refresh_booking_full_preview_run(
    '78000000-0000-4000-8000-000000000100','2026-09-21 08:00+00'
  ) into r;
  if r->>'state' <> 'awaiting_deferred_hold_worker' or (r->>'revision')::int <> 2 then
    raise exception 'Expected deferred-hold checkpoint: %', r;
  end if;

  update public.bookings set status='hold_failed',hold_last_error_code='authentication_required'
  where id='78000000-0000-0000-0000-000000000020';
  select public.admin_refresh_booking_full_preview_run(
    '78000000-0000-4000-8000-000000000100','2026-09-21 09:00+00'
  ) into r;
  if r->>'state' <> 'awaiting_customer_payment_recovery' or (r->>'revision')::int <> 3 then
    raise exception 'Expected failed-hold recovery checkpoint: %', r;
  end if;

  update public.bookings
  set status='hold_placed',hold_last_error_code=null,hold_attempts=1
  where id='78000000-0000-0000-0000-000000000020';
  select public.admin_refresh_booking_full_preview_run(
    '78000000-0000-4000-8000-000000000100','2026-09-22 11:50+00'
  ) into r;
  if r->>'state' <> 'awaiting_attendance_evidence' or (r->>'revision')::int <> 4 then
    raise exception 'Expected attendance wait checkpoint: %', r;
  end if;

  insert into public.attendance_events(
    booking_id,actor,kind,source,occurred_at,external_id,raw
  ) values
    ('78000000-0000-0000-0000-000000000020','student','joined','daily_webhook',
     '2026-09-22 12:00+00','phase4c5e-student','{}'),
    ('78000000-0000-0000-0000-000000000020','tutor','joined','daily_webhook',
     '2026-09-22 12:00+00','phase4c5e-tutor','{}');

  select public.admin_refresh_booking_full_preview_run(
    '78000000-0000-4000-8000-000000000100','2026-09-22 12:30+00'
  ) into r;
  if r->>'state' <> 'lesson_in_progress' or (r->>'revision')::int <> 5 then
    raise exception 'Expected in-progress checkpoint: %', r;
  end if;

  select public.admin_refresh_booking_full_preview_run(
    '78000000-0000-4000-8000-000000000100','2026-09-22 13:10+00'
  ) into r;
  if r->>'state' <> 'awaiting_settlement_worker' or (r->>'revision')::int <> 6 then
    raise exception 'Expected settlement checkpoint: %', r;
  end if;

  update public.bookings
  set status='settled',outcome='on_time',final_amount_cents=4900,
      settled_at='2026-09-22 13:11+00',settlement_attempts=1
  where id='78000000-0000-0000-0000-000000000020';
  select public.admin_refresh_booking_full_preview_run(
    '78000000-0000-4000-8000-000000000100','2026-09-22 13:11+00'
  ) into r;
  if r->>'state' <> 'complete'
     or not (r->>'terminal')::boolean
     or (r->>'revision')::int <> 7
     or r->>'completed_at' is null then
    raise exception 'Expected terminal checkpoint: %', r;
  end if;

  select public.admin_refresh_booking_full_preview_run(
    '78000000-0000-4000-8000-000000000100','2026-09-22 13:12+00'
  ) into replay;
  if not (replay->>'replay')::boolean or (replay->>'revision')::int <> 7 then
    raise exception 'Expected stable terminal replay: %', replay;
  end if;

  select count(*)::int into checkpoint_count
  from public.lesson_booking_full_preview_run_checkpoints
  where run_id='78000000-0000-4000-8000-000000000100';
  if checkpoint_count <> 8 then
    raise exception 'Expected revisions 0 through 7, got % checkpoints', checkpoint_count;
  end if;
end $$;

-- Advisor hardening is intentional and behavior-preserving for this trigger-only helper.
do $$
declare config text[];
begin
  select p.proconfig into config
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='forbid_change';
  if config is null or not ('search_path=""' = any(config)) then
    raise exception 'forbid_change search_path was not pinned: %', config;
  end if;
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$
  select '78000000-0000-0000-0000-000000000002'::uuid
$$;

do $$
declare blocked boolean := false;
begin
  begin
    perform public.admin_begin_booking_full_preview_run(
      '78000000-0000-4000-8000-000000000200',
      'near_term_success',
      '2026-09-20 20:30+00'
    );
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then
    raise exception 'Non-admin full-preview run creation unexpectedly succeeded';
  end if;
end $$;

rollback;
