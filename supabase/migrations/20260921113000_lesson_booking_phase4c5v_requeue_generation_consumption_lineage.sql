-- Smart Parrot Institute lesson-booking Phase 4C5V
-- Service-only single-use requeue eligibility consumption + deterministic lineage evidence.
-- Preview-only: no outbound notifier send, Cron sender, provider/payment write, booking launch, claim activation, or destructive cleanup.

create table if not exists public.lesson_booking_preview_launch_blocker_requeue_consumptions (
  consumption_id bigint generated always as identity primary key,
  schema_version text not null check (schema_version = 'smart_parrot_booking_preview_launch_blocker_requeue_consumption_v1'),
  eligibility_generation_id bigint not null unique references public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations(generation_id) on delete restrict,
  review_id bigint not null references public.lesson_booking_preview_launch_blocker_dead_letter_reviews(review_id) on delete restrict,
  queue_item_id bigint not null references public.lesson_booking_preview_launch_blocker_escalation_queue(queue_item_id) on delete restrict,
  snapshot_id bigint not null references public.lesson_booking_preview_launch_blocker_snapshots(snapshot_id) on delete restrict,
  alert_id bigint not null references public.lesson_booking_preview_launch_blocker_alerts(alert_id) on delete restrict,
  dead_letter_event_id bigint not null references public.lesson_booking_preview_launch_blocker_escalation_work_events(event_id) on delete restrict,
  source_generation_no integer not null check (source_generation_no > 0),
  consumption_key text not null unique check (consumption_key ~ '^[0-9a-f]{32}$'),
  consumption_status text not null default 'consumed' check (consumption_status = 'consumed'),
  requeue_execution_authorized boolean not null default false check (requeue_execution_authorized = false),
  automatic_notification_authorized boolean not null default false check (automatic_notification_authorized = false),
  notifier_send_authorized boolean not null default false check (notifier_send_authorized = false),
  outcome_suppresses_blocker boolean not null default false check (outcome_suppresses_blocker = false),
  provider_write_authorized boolean not null default false check (provider_write_authorized = false),
  booking_launch_authorized boolean not null default false check (booking_launch_authorized = false),
  destructive_cleanup_authorized boolean not null default false check (destructive_cleanup_authorized = false),
  server_time_authoritative boolean not null default true check (server_time_authoritative = true),
  consumed_at timestamptz not null default statement_timestamp()
);

create index if not exists lesson_booking_preview_requeue_consumptions_queue_idx
  on public.lesson_booking_preview_launch_blocker_requeue_consumptions(queue_item_id, consumption_id desc);

create table if not exists public.lesson_booking_preview_launch_blocker_requeue_work_generations (
  work_generation_id bigint generated always as identity primary key,
  schema_version text not null check (schema_version = 'smart_parrot_booking_preview_launch_blocker_requeue_work_generation_v1'),
  consumption_id bigint not null unique references public.lesson_booking_preview_launch_blocker_requeue_consumptions(consumption_id) on delete restrict,
  eligibility_generation_id bigint not null unique references public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations(generation_id) on delete restrict,
  review_id bigint not null references public.lesson_booking_preview_launch_blocker_dead_letter_reviews(review_id) on delete restrict,
  queue_item_id bigint not null references public.lesson_booking_preview_launch_blocker_escalation_queue(queue_item_id) on delete restrict,
  snapshot_id bigint not null references public.lesson_booking_preview_launch_blocker_snapshots(snapshot_id) on delete restrict,
  alert_id bigint not null references public.lesson_booking_preview_launch_blocker_alerts(alert_id) on delete restrict,
  dead_letter_event_id bigint not null references public.lesson_booking_preview_launch_blocker_escalation_work_events(event_id) on delete restrict,
  source_generation_no integer not null check (source_generation_no > 0),
  work_generation_no integer not null check (work_generation_no > 0),
  lineage_ref text generated always as (
    'rqg:' || snapshot_id::text || ':' || queue_item_id::text || ':' || eligibility_generation_id::text || ':' || work_generation_no::text
  ) stored unique,
  work_state text not null default 'prepared' check (work_state = 'prepared'),
  claim_eligible boolean not null default false check (claim_eligible = false),
  requeue_execution_authorized boolean not null default false check (requeue_execution_authorized = false),
  automatic_notification_authorized boolean not null default false check (automatic_notification_authorized = false),
  notifier_send_authorized boolean not null default false check (notifier_send_authorized = false),
  outcome_suppresses_blocker boolean not null default false check (outcome_suppresses_blocker = false),
  provider_write_authorized boolean not null default false check (provider_write_authorized = false),
  booking_launch_authorized boolean not null default false check (booking_launch_authorized = false),
  destructive_cleanup_authorized boolean not null default false check (destructive_cleanup_authorized = false),
  server_time_authoritative boolean not null default true check (server_time_authoritative = true),
  generated_at timestamptz not null default statement_timestamp(),
  unique (queue_item_id, work_generation_no)
);

alter table public.lesson_booking_preview_launch_blocker_requeue_consumptions enable row level security;
alter table public.lesson_booking_preview_launch_blocker_requeue_work_generations enable row level security;

revoke all on table public.lesson_booking_preview_launch_blocker_requeue_consumptions
  from public, anon, authenticated, service_role;
revoke all on table public.lesson_booking_preview_launch_blocker_requeue_work_generations
  from public, anon, authenticated, service_role;

drop trigger if exists lesson_booking_preview_launch_blocker_requeue_consumptions_append_only
  on public.lesson_booking_preview_launch_blocker_requeue_consumptions;
create trigger lesson_booking_preview_launch_blocker_requeue_consumptions_append_only
before update or delete on public.lesson_booking_preview_launch_blocker_requeue_consumptions
for each row execute function public.forbid_change();

drop trigger if exists lesson_booking_preview_launch_blocker_requeue_work_generations_append_only
  on public.lesson_booking_preview_launch_blocker_requeue_work_generations;
create trigger lesson_booking_preview_launch_blocker_requeue_work_generations_append_only
before update or delete on public.lesson_booking_preview_launch_blocker_requeue_work_generations
for each row execute function public.forbid_change();

create or replace function public.service_consume_booking_preview_launch_blocker_requeue_eligibility(
  p_generation_id bigint,
  p_consumption_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_generation public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations%rowtype;
  v_review public.lesson_booking_preview_launch_blocker_dead_letter_reviews%rowtype;
  v_latest_event public.lesson_booking_preview_launch_blocker_escalation_work_events%rowtype;
  v_existing public.lesson_booking_preview_launch_blocker_requeue_consumptions%rowtype;
  v_key_owner public.lesson_booking_preview_launch_blocker_requeue_consumptions%rowtype;
  v_work public.lesson_booking_preview_launch_blocker_requeue_work_generations%rowtype;
  v_latest_snapshot_id bigint;
  v_latest_generation_no integer;
  v_work_generation_no integer;
  v_consumption_id bigint;
  v_work_generation_id bigint;
  v_consumption_key text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_consumption_key,''::text)));
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  if p_generation_id is null or p_generation_id < 1 then
    raise exception 'invalid_preview_requeue_eligibility_generation_id' using errcode='22023';
  end if;
  if v_consumption_key !~ '^[0-9a-f]{32}$' or v_consumption_key = repeat('0',32) then
    raise exception 'invalid_preview_requeue_consumption_key' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(20260921,40520);

  select * into v_generation
  from public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations g
  where g.generation_id = p_generation_id;
  if not found then
    raise exception 'preview_requeue_eligibility_generation_missing' using errcode='P0002';
  end if;

  select * into v_existing
  from public.lesson_booking_preview_launch_blocker_requeue_consumptions c
  where c.eligibility_generation_id = p_generation_id;
  if found then
    if v_existing.consumption_key <> v_consumption_key then
      raise exception 'preview_requeue_eligibility_generation_already_consumed' using errcode='23505';
    end if;
    select * into v_work
    from public.lesson_booking_preview_launch_blocker_requeue_work_generations w
    where w.consumption_id = v_existing.consumption_id;
    if not found then
      raise exception 'preview_requeue_lineage_incomplete' using errcode='XX000';
    end if;
    return pg_catalog.jsonb_build_object(
      'schema_version','smart_parrot_booking_preview_launch_blocker_requeue_consumption_result_v1',
      'consumption_id',v_existing.consumption_id,
      'eligibility_generation_id',v_existing.eligibility_generation_id,
      'review_id',v_existing.review_id,
      'queue_item_id',v_existing.queue_item_id,
      'snapshot_id',v_existing.snapshot_id,
      'alert_id',v_existing.alert_id,
      'dead_letter_event_id',v_existing.dead_letter_event_id,
      'source_generation_no',v_existing.source_generation_no,
      'work_generation_id',v_work.work_generation_id,
      'work_generation_no',v_work.work_generation_no,
      'lineage_ref',v_work.lineage_ref,
      'work_state',v_work.work_state,
      'claim_eligible',false,
      'consumed_at',v_existing.consumed_at,
      'generated_at',v_work.generated_at,
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

  select * into v_key_owner
  from public.lesson_booking_preview_launch_blocker_requeue_consumptions c
  where c.consumption_key = v_consumption_key;
  if found then
    raise exception 'preview_requeue_consumption_key_conflict' using errcode='23505';
  end if;

  if v_generation.requeue_eligible is distinct from true
     or v_generation.review_decision <> 'retry_after_review' then
    raise exception 'preview_requeue_eligibility_generation_not_eligible' using errcode='55000';
  end if;
  if v_generation.expires_at <= v_now then
    raise exception 'preview_requeue_eligibility_generation_expired' using errcode='55000';
  end if;

  select s.snapshot_id into v_latest_snapshot_id
  from public.lesson_booking_preview_launch_blocker_snapshots s
  order by s.snapshot_id desc
  limit 1;
  if v_latest_snapshot_id is null then
    raise exception 'preview_launch_blocker_snapshot_missing' using errcode='P0002';
  end if;
  if v_generation.snapshot_id <> v_latest_snapshot_id then
    raise exception 'stale_preview_requeue_eligibility_snapshot' using errcode='40001';
  end if;

  select * into v_review
  from public.lesson_booking_preview_launch_blocker_dead_letter_reviews r
  where r.review_id = v_generation.review_id;
  if not found
     or v_review.decision <> 'retry_after_review'
     or v_review.queue_item_id <> v_generation.queue_item_id
     or v_review.snapshot_id <> v_generation.snapshot_id
     or v_review.dead_letter_event_id <> v_generation.dead_letter_event_id then
    raise exception 'stale_preview_requeue_review_lineage' using errcode='40001';
  end if;

  select * into v_latest_event
  from public.lesson_booking_preview_launch_blocker_escalation_work_events e
  where e.queue_item_id = v_generation.queue_item_id
  order by e.event_id desc
  limit 1;
  if not found
     or v_latest_event.event_kind <> 'dead_lettered'
     or v_latest_event.event_id <> v_generation.dead_letter_event_id
     or v_latest_event.reason_code <> 'attempts_exhausted' then
    raise exception 'stale_preview_requeue_dead_letter_lineage' using errcode='40001';
  end if;

  select max(g.generation_no) into v_latest_generation_no
  from public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations g
  where g.review_id = v_generation.review_id;
  if v_latest_generation_no is null or v_generation.generation_no <> v_latest_generation_no then
    raise exception 'stale_preview_requeue_eligibility_generation' using errcode='40001';
  end if;

  select coalesce(max(w.work_generation_no),0) + 1 into v_work_generation_no
  from public.lesson_booking_preview_launch_blocker_requeue_work_generations w
  where w.queue_item_id = v_generation.queue_item_id;

  insert into public.lesson_booking_preview_launch_blocker_requeue_consumptions(
    schema_version,eligibility_generation_id,review_id,queue_item_id,snapshot_id,alert_id,
    dead_letter_event_id,source_generation_no,consumption_key,consumed_at
  ) values (
    'smart_parrot_booking_preview_launch_blocker_requeue_consumption_v1',
    v_generation.generation_id,v_generation.review_id,v_generation.queue_item_id,v_generation.snapshot_id,v_generation.alert_id,
    v_generation.dead_letter_event_id,v_generation.generation_no,v_consumption_key,v_now
  ) returning consumption_id into v_consumption_id;

  insert into public.lesson_booking_preview_launch_blocker_requeue_work_generations(
    schema_version,consumption_id,eligibility_generation_id,review_id,queue_item_id,snapshot_id,alert_id,
    dead_letter_event_id,source_generation_no,work_generation_no,generated_at
  ) values (
    'smart_parrot_booking_preview_launch_blocker_requeue_work_generation_v1',
    v_consumption_id,v_generation.generation_id,v_generation.review_id,v_generation.queue_item_id,v_generation.snapshot_id,v_generation.alert_id,
    v_generation.dead_letter_event_id,v_generation.generation_no,v_work_generation_no,v_now
  ) returning work_generation_id into v_work_generation_id;

  select * into v_work
  from public.lesson_booking_preview_launch_blocker_requeue_work_generations w
  where w.work_generation_id = v_work_generation_id;

  return pg_catalog.jsonb_build_object(
    'schema_version','smart_parrot_booking_preview_launch_blocker_requeue_consumption_result_v1',
    'consumption_id',v_consumption_id,
    'eligibility_generation_id',v_generation.generation_id,
    'review_id',v_generation.review_id,
    'queue_item_id',v_generation.queue_item_id,
    'snapshot_id',v_generation.snapshot_id,
    'alert_id',v_generation.alert_id,
    'dead_letter_event_id',v_generation.dead_letter_event_id,
    'source_generation_no',v_generation.generation_no,
    'work_generation_id',v_work.work_generation_id,
    'work_generation_no',v_work.work_generation_no,
    'lineage_ref',v_work.lineage_ref,
    'work_state',v_work.work_state,
    'claim_eligible',false,
    'consumed_at',v_now,
    'generated_at',v_work.generated_at,
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

revoke all on function public.service_consume_booking_preview_launch_blocker_requeue_eligibility(bigint,text)
  from public, anon, authenticated, service_role;
grant execute on function public.service_consume_booking_preview_launch_blocker_requeue_eligibility(bigint,text)
  to service_role;

comment on table public.lesson_booking_preview_launch_blocker_requeue_consumptions is
  'Append-only single-use service evidence that an active admin-reviewed preview requeue eligibility generation was consumed. Exact consumption-key replay is idempotent; any different key is rejected.';
comment on table public.lesson_booking_preview_launch_blocker_requeue_work_generations is
  'Append-only deterministic lineage produced by Phase 4C5V consumption. Work remains prepared and claim-ineligible; no notifier/provider/payment/launch authority is created.';