-- Smart Parrot Institute lesson-booking Phase 4C5U
-- Dead-letter operator review + bounded requeue-eligibility evidence.
-- Preview-only: no external notifier send, Cron sender, provider/payment write, booking launch, requeue execution, or destructive cleanup.

create table if not exists public.lesson_booking_preview_launch_blocker_dead_letter_reviews (
  review_id bigint generated always as identity primary key,
  schema_version text not null check (schema_version = 'smart_parrot_booking_preview_launch_blocker_dead_letter_review_v1'),
  queue_item_id bigint not null references public.lesson_booking_preview_launch_blocker_escalation_queue(queue_item_id) on delete restrict,
  snapshot_id bigint not null references public.lesson_booking_preview_launch_blocker_snapshots(snapshot_id) on delete restrict,
  alert_id bigint not null references public.lesson_booking_preview_launch_blocker_alerts(alert_id) on delete restrict,
  dead_letter_event_id bigint not null unique references public.lesson_booking_preview_launch_blocker_escalation_work_events(event_id) on delete restrict,
  dead_letter_reason text not null check (dead_letter_reason in ('attempts_exhausted','invalid_work_item')),
  dead_letter_attempt_no integer not null check (dead_letter_attempt_no > 0),
  decision text not null check (decision in ('preserve','retry_after_review','invalid_work_item_confirmed')),
  reviewed_by uuid not null references public.profiles(id) on delete restrict,
  requeue_execution_authorized boolean not null default false check (requeue_execution_authorized = false),
  automatic_notification_authorized boolean not null default false check (automatic_notification_authorized = false),
  notifier_send_authorized boolean not null default false check (notifier_send_authorized = false),
  outcome_suppresses_blocker boolean not null default false check (outcome_suppresses_blocker = false),
  provider_write_authorized boolean not null default false check (provider_write_authorized = false),
  booking_launch_authorized boolean not null default false check (booking_launch_authorized = false),
  destructive_cleanup_authorized boolean not null default false check (destructive_cleanup_authorized = false),
  server_time_authoritative boolean not null default true check (server_time_authoritative = true),
  reviewed_at timestamptz not null default statement_timestamp(),
  check (
    decision = 'preserve'
    or (decision = 'retry_after_review' and dead_letter_reason = 'attempts_exhausted')
    or (decision = 'invalid_work_item_confirmed' and dead_letter_reason = 'invalid_work_item')
  )
);

create index if not exists lesson_booking_preview_dead_letter_reviews_queue_idx
  on public.lesson_booking_preview_launch_blocker_dead_letter_reviews(queue_item_id, review_id desc);
create index if not exists lesson_booking_preview_dead_letter_reviews_reviewer_idx
  on public.lesson_booking_preview_launch_blocker_dead_letter_reviews(reviewed_by, reviewed_at desc);

create table if not exists public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations (
  generation_id bigint generated always as identity primary key,
  schema_version text not null check (schema_version = 'smart_parrot_booking_preview_launch_blocker_requeue_eligibility_v1'),
  review_id bigint not null references public.lesson_booking_preview_launch_blocker_dead_letter_reviews(review_id) on delete restrict,
  queue_item_id bigint not null references public.lesson_booking_preview_launch_blocker_escalation_queue(queue_item_id) on delete restrict,
  snapshot_id bigint not null references public.lesson_booking_preview_launch_blocker_snapshots(snapshot_id) on delete restrict,
  alert_id bigint not null references public.lesson_booking_preview_launch_blocker_alerts(alert_id) on delete restrict,
  dead_letter_event_id bigint not null references public.lesson_booking_preview_launch_blocker_escalation_work_events(event_id) on delete restrict,
  generation_no integer not null check (generation_no > 0),
  review_decision text not null default 'retry_after_review' check (review_decision = 'retry_after_review'),
  validity_seconds integer not null default 900 check (validity_seconds = 900),
  expires_at timestamptz not null,
  requeue_eligible boolean not null default true check (requeue_eligible = true),
  requeue_execution_authorized boolean not null default false check (requeue_execution_authorized = false),
  automatic_notification_authorized boolean not null default false check (automatic_notification_authorized = false),
  notifier_send_authorized boolean not null default false check (notifier_send_authorized = false),
  outcome_suppresses_blocker boolean not null default false check (outcome_suppresses_blocker = false),
  provider_write_authorized boolean not null default false check (provider_write_authorized = false),
  booking_launch_authorized boolean not null default false check (booking_launch_authorized = false),
  destructive_cleanup_authorized boolean not null default false check (destructive_cleanup_authorized = false),
  generated_by uuid not null references public.profiles(id) on delete restrict,
  server_time_authoritative boolean not null default true check (server_time_authoritative = true),
  generated_at timestamptz not null default statement_timestamp(),
  unique (review_id, generation_no),
  check (expires_at = generated_at + interval '15 minutes')
);

create index if not exists lesson_booking_preview_requeue_eligibility_queue_idx
  on public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations(queue_item_id, generation_id desc);

alter table public.lesson_booking_preview_launch_blocker_dead_letter_reviews enable row level security;
alter table public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations enable row level security;

revoke all on table public.lesson_booking_preview_launch_blocker_dead_letter_reviews
  from public, anon, authenticated, service_role;
revoke all on table public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations
  from public, anon, authenticated, service_role;

drop trigger if exists lesson_booking_preview_launch_blocker_dead_letter_reviews_append_only
  on public.lesson_booking_preview_launch_blocker_dead_letter_reviews;
create trigger lesson_booking_preview_launch_blocker_dead_letter_reviews_append_only
before update or delete on public.lesson_booking_preview_launch_blocker_dead_letter_reviews
for each row execute function public.forbid_change();

drop trigger if exists lesson_booking_preview_launch_blocker_requeue_eligibility_generations_append_only
  on public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations;
create trigger lesson_booking_preview_launch_blocker_requeue_eligibility_generations_append_only
before update or delete on public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations
for each row execute function public.forbid_change();

create or replace function public.admin_list_booking_preview_launch_blocker_dead_letter_review_queue(
  p_limit integer default 25
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_latest_snapshot_id bigint;
  v_items jsonb;
begin
  perform private.smart_parrot_require_admin(uid);
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid_preview_dead_letter_review_limit' using errcode='22023';
  end if;

  select s.snapshot_id into v_latest_snapshot_id
  from public.lesson_booking_preview_launch_blocker_snapshots s
  order by s.snapshot_id desc
  limit 1;
  if v_latest_snapshot_id is null then
    raise exception 'preview_launch_blocker_snapshot_missing' using errcode='P0002';
  end if;

  with latest_dead as (
    select distinct on (e.queue_item_id)
      e.queue_item_id,e.snapshot_id,e.alert_id,e.event_id,e.reason_code,e.attempt_no,e.recorded_at
    from public.lesson_booking_preview_launch_blocker_escalation_work_events e
    where e.snapshot_id = v_latest_snapshot_id
    order by e.queue_item_id,e.event_id desc
  ), selected as (
    select
      d.queue_item_id,d.snapshot_id,d.alert_id,d.event_id,d.reason_code,d.attempt_no,d.recorded_at,
      r.review_id,r.decision,r.reviewed_at,
      g.generation_id,g.expires_at
    from latest_dead d
    left join public.lesson_booking_preview_launch_blocker_dead_letter_reviews r
      on r.dead_letter_event_id = d.event_id
    left join lateral (
      select x.generation_id,x.expires_at
      from public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations x
      where x.review_id = r.review_id and x.expires_at > v_now
      order by x.generation_no desc
      limit 1
    ) g on true
    where d.reason_code in ('attempts_exhausted','invalid_work_item')
      and exists (
        select 1
        from public.lesson_booking_preview_launch_blocker_escalation_work_events terminal
        where terminal.event_id = d.event_id and terminal.event_kind = 'dead_lettered'
      )
    order by d.recorded_at,d.queue_item_id
    limit p_limit
  )
  select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'queue_item_id',s.queue_item_id,
      'snapshot_id',s.snapshot_id,
      'alert_id',s.alert_id,
      'dead_letter_event_id',s.event_id,
      'dead_letter_reason',s.reason_code,
      'attempt_no',s.attempt_no,
      'dead_lettered_at',s.recorded_at,
      'review_status',case when s.review_id is null then 'pending' else 'reviewed' end,
      'review_id',s.review_id,
      'decision',s.decision,
      'reviewed_at',s.reviewed_at,
      'requeue_eligible',s.generation_id is not null,
      'generation_id',s.generation_id,
      'generation_expires_at',s.expires_at
    ) order by s.recorded_at,s.queue_item_id),
    '[]'::jsonb
  ) into v_items
  from selected s;

  return pg_catalog.jsonb_build_object(
    'schema_version','smart_parrot_booking_preview_launch_blocker_dead_letter_review_queue_v1',
    'captured_at',v_now,
    'item_count',pg_catalog.jsonb_array_length(v_items),
    'items',v_items,
    'requeue_execution_authorized',false,
    'automatic_notification_authorized',false,
    'notifier_send_authorized',false,
    'outcome_suppresses_blocker',false,
    'provider_write_authorized',false,
    'booking_launch_authorized',false,
    'destructive_cleanup_authorized',false,
    'server_time_authoritative',true
  );
end;
$$;

create or replace function public.admin_record_booking_preview_launch_blocker_dead_letter_review(
  p_queue_item_id bigint,
  p_decision text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_queue public.lesson_booking_preview_launch_blocker_escalation_queue%rowtype;
  v_latest_snapshot_id bigint;
  v_dead public.lesson_booking_preview_launch_blocker_escalation_work_events%rowtype;
  v_existing public.lesson_booking_preview_launch_blocker_dead_letter_reviews%rowtype;
  v_decision text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_decision,''::text)));
  v_review_id bigint;
begin
  perform private.smart_parrot_require_admin(uid);
  if p_queue_item_id is null or p_queue_item_id < 1 then
    raise exception 'invalid_preview_escalation_queue_item_id' using errcode='22023';
  end if;
  if v_decision not in ('preserve','retry_after_review','invalid_work_item_confirmed') then
    raise exception 'invalid_preview_dead_letter_review_decision' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(20260921,40520);

  select s.snapshot_id into v_latest_snapshot_id
  from public.lesson_booking_preview_launch_blocker_snapshots s
  order by s.snapshot_id desc
  limit 1;
  if v_latest_snapshot_id is null then
    raise exception 'preview_launch_blocker_snapshot_missing' using errcode='P0002';
  end if;

  select * into v_queue
  from public.lesson_booking_preview_launch_blocker_escalation_queue q
  where q.queue_item_id = p_queue_item_id;
  if not found then
    raise exception 'preview_escalation_queue_item_missing' using errcode='P0002';
  end if;
  if v_queue.snapshot_id <> v_latest_snapshot_id then
    raise exception 'stale_preview_escalation_queue_item' using errcode='40001';
  end if;

  select * into v_dead
  from public.lesson_booking_preview_launch_blocker_escalation_work_events e
  where e.queue_item_id = p_queue_item_id
  order by e.event_id desc
  limit 1;
  if not found or v_dead.event_kind <> 'dead_lettered' then
    raise exception 'preview_escalation_work_not_dead_lettered' using errcode='55000';
  end if;

  if v_decision = 'retry_after_review' and v_dead.reason_code <> 'attempts_exhausted' then
    raise exception 'preview_dead_letter_retry_requires_attempts_exhausted' using errcode='22023';
  end if;
  if v_decision = 'invalid_work_item_confirmed' and v_dead.reason_code <> 'invalid_work_item' then
    raise exception 'preview_dead_letter_invalid_confirmation_reason_mismatch' using errcode='22023';
  end if;

  select * into v_existing
  from public.lesson_booking_preview_launch_blocker_dead_letter_reviews r
  where r.dead_letter_event_id = v_dead.event_id;
  if found then
    if v_existing.decision <> v_decision then
      raise exception 'preview_dead_letter_review_conflict' using errcode='23505';
    end if;
    return pg_catalog.jsonb_build_object(
      'schema_version',v_existing.schema_version,
      'review_id',v_existing.review_id,
      'queue_item_id',v_existing.queue_item_id,
      'snapshot_id',v_existing.snapshot_id,
      'alert_id',v_existing.alert_id,
      'dead_letter_event_id',v_existing.dead_letter_event_id,
      'dead_letter_reason',v_existing.dead_letter_reason,
      'attempt_no',v_existing.dead_letter_attempt_no,
      'decision',v_existing.decision,
      'reviewed_at',v_existing.reviewed_at,
      'replay',true,
      'requeue_execution_authorized',false,
      'automatic_notification_authorized',false,
      'notifier_send_authorized',false,
      'outcome_suppresses_blocker',false,
      'provider_write_authorized',false,
      'booking_launch_authorized',false,
      'destructive_cleanup_authorized',false,
      'server_time_authoritative',true
    );
  end if;

  insert into public.lesson_booking_preview_launch_blocker_dead_letter_reviews(
    schema_version,queue_item_id,snapshot_id,alert_id,dead_letter_event_id,
    dead_letter_reason,dead_letter_attempt_no,decision,reviewed_by
  ) values (
    'smart_parrot_booking_preview_launch_blocker_dead_letter_review_v1',
    v_queue.queue_item_id,v_queue.snapshot_id,v_queue.alert_id,v_dead.event_id,
    v_dead.reason_code,v_dead.attempt_no,v_decision,uid
  ) returning review_id into v_review_id;

  select * into v_existing
  from public.lesson_booking_preview_launch_blocker_dead_letter_reviews r
  where r.review_id = v_review_id;

  return pg_catalog.jsonb_build_object(
    'schema_version',v_existing.schema_version,
    'review_id',v_existing.review_id,
    'queue_item_id',v_existing.queue_item_id,
    'snapshot_id',v_existing.snapshot_id,
    'alert_id',v_existing.alert_id,
    'dead_letter_event_id',v_existing.dead_letter_event_id,
    'dead_letter_reason',v_existing.dead_letter_reason,
    'attempt_no',v_existing.dead_letter_attempt_no,
    'decision',v_existing.decision,
    'reviewed_at',v_existing.reviewed_at,
    'replay',false,
    'requeue_execution_authorized',false,
    'automatic_notification_authorized',false,
    'notifier_send_authorized',false,
    'outcome_suppresses_blocker',false,
    'provider_write_authorized',false,
    'booking_launch_authorized',false,
    'destructive_cleanup_authorized',false,
    'server_time_authoritative',true
  );
end;
$$;

create or replace function public.admin_generate_booking_preview_launch_blocker_requeue_eligibility(
  p_review_id bigint
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_review public.lesson_booking_preview_launch_blocker_dead_letter_reviews%rowtype;
  v_latest_snapshot_id bigint;
  v_latest_event public.lesson_booking_preview_launch_blocker_escalation_work_events%rowtype;
  v_existing public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations%rowtype;
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_generation_no integer;
  v_generation_id bigint;
  v_expires_at timestamptz := v_now + interval '15 minutes';
begin
  perform private.smart_parrot_require_admin(uid);
  if p_review_id is null or p_review_id < 1 then
    raise exception 'invalid_preview_dead_letter_review_id' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(20260921,40520);

  select * into v_review
  from public.lesson_booking_preview_launch_blocker_dead_letter_reviews r
  where r.review_id = p_review_id;
  if not found then
    raise exception 'preview_dead_letter_review_missing' using errcode='P0002';
  end if;
  if v_review.decision <> 'retry_after_review' then
    raise exception 'preview_dead_letter_review_not_retry_eligible' using errcode='55000';
  end if;

  select s.snapshot_id into v_latest_snapshot_id
  from public.lesson_booking_preview_launch_blocker_snapshots s
  order by s.snapshot_id desc
  limit 1;
  if v_latest_snapshot_id is null then
    raise exception 'preview_launch_blocker_snapshot_missing' using errcode='P0002';
  end if;
  if v_review.snapshot_id <> v_latest_snapshot_id then
    raise exception 'stale_preview_dead_letter_review' using errcode='40001';
  end if;

  select * into v_latest_event
  from public.lesson_booking_preview_launch_blocker_escalation_work_events e
  where e.queue_item_id = v_review.queue_item_id
  order by e.event_id desc
  limit 1;
  if not found
     or v_latest_event.event_kind <> 'dead_lettered'
     or v_latest_event.event_id <> v_review.dead_letter_event_id then
    raise exception 'stale_preview_dead_letter_work_state' using errcode='40001';
  end if;

  select * into v_existing
  from public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations g
  where g.review_id = p_review_id and g.expires_at > v_now
  order by g.generation_no desc
  limit 1;
  if found then
    return pg_catalog.jsonb_build_object(
      'schema_version',v_existing.schema_version,
      'generation_id',v_existing.generation_id,
      'generation_no',v_existing.generation_no,
      'review_id',v_existing.review_id,
      'queue_item_id',v_existing.queue_item_id,
      'snapshot_id',v_existing.snapshot_id,
      'alert_id',v_existing.alert_id,
      'dead_letter_event_id',v_existing.dead_letter_event_id,
      'validity_seconds',v_existing.validity_seconds,
      'generated_at',v_existing.generated_at,
      'expires_at',v_existing.expires_at,
      'requeue_eligible',true,
      'replay',true,
      'requeue_execution_authorized',false,
      'automatic_notification_authorized',false,
      'notifier_send_authorized',false,
      'outcome_suppresses_blocker',false,
      'provider_write_authorized',false,
      'booking_launch_authorized',false,
      'destructive_cleanup_authorized',false,
      'server_time_authoritative',true
    );
  end if;

  select coalesce(max(g.generation_no),0) + 1 into v_generation_no
  from public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations g
  where g.review_id = p_review_id;

  insert into public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations(
    schema_version,review_id,queue_item_id,snapshot_id,alert_id,dead_letter_event_id,
    generation_no,review_decision,validity_seconds,expires_at,generated_by,generated_at
  ) values (
    'smart_parrot_booking_preview_launch_blocker_requeue_eligibility_v1',
    v_review.review_id,v_review.queue_item_id,v_review.snapshot_id,v_review.alert_id,v_review.dead_letter_event_id,
    v_generation_no,'retry_after_review',900,v_expires_at,uid,v_now
  ) returning generation_id into v_generation_id;

  select * into v_existing
  from public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations g
  where g.generation_id = v_generation_id;

  return pg_catalog.jsonb_build_object(
    'schema_version',v_existing.schema_version,
    'generation_id',v_existing.generation_id,
    'generation_no',v_existing.generation_no,
    'review_id',v_existing.review_id,
    'queue_item_id',v_existing.queue_item_id,
    'snapshot_id',v_existing.snapshot_id,
    'alert_id',v_existing.alert_id,
    'dead_letter_event_id',v_existing.dead_letter_event_id,
    'validity_seconds',v_existing.validity_seconds,
    'generated_at',v_existing.generated_at,
    'expires_at',v_existing.expires_at,
    'requeue_eligible',true,
    'replay',false,
    'requeue_execution_authorized',false,
    'automatic_notification_authorized',false,
    'notifier_send_authorized',false,
    'outcome_suppresses_blocker',false,
    'provider_write_authorized',false,
    'booking_launch_authorized',false,
    'destructive_cleanup_authorized',false,
    'server_time_authoritative',true
  );
end;
$$;

revoke all on function public.admin_list_booking_preview_launch_blocker_dead_letter_review_queue(integer)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_record_booking_preview_launch_blocker_dead_letter_review(bigint,text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_generate_booking_preview_launch_blocker_requeue_eligibility(bigint)
  from public, anon, authenticated, service_role;

grant execute on function public.admin_list_booking_preview_launch_blocker_dead_letter_review_queue(integer)
  to authenticated;
grant execute on function public.admin_record_booking_preview_launch_blocker_dead_letter_review(bigint,text)
  to authenticated;
grant execute on function public.admin_generate_booking_preview_launch_blocker_requeue_eligibility(bigint)
  to authenticated;

comment on table public.lesson_booking_preview_launch_blocker_dead_letter_reviews is
  'Append-only admin review evidence for the exact latest preview escalation dead-letter event. Review never sends notifications or authorizes launch/provider/cleanup/requeue execution.';
comment on table public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations is
  'Append-only 15-minute admin-reviewed requeue-eligibility generations. Eligibility is review evidence only; requeue_execution_authorized is permanently false.';
