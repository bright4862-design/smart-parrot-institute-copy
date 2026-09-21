-- Smart Parrot Institute lesson-booking Phase 4C5W
-- Bounded requeue lineage activation evidence + lease-safe internal eligibility handoff.
-- Preview-only: activation never authorizes external notification sending, provider/payment writes,
-- booking launch, destructive cleanup, Cron delivery, or production publication.

create table if not exists public.lesson_booking_preview_launch_blocker_requeue_work_activations (
  activation_id bigint generated always as identity primary key,
  schema_version text not null check (schema_version = 'smart_parrot_booking_preview_launch_blocker_requeue_activation_v1'),
  work_generation_id bigint not null unique references public.lesson_booking_preview_launch_blocker_requeue_work_generations(work_generation_id) on delete restrict,
  consumption_id bigint not null references public.lesson_booking_preview_launch_blocker_requeue_consumptions(consumption_id) on delete restrict,
  eligibility_generation_id bigint not null references public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations(generation_id) on delete restrict,
  review_id bigint not null references public.lesson_booking_preview_launch_blocker_dead_letter_reviews(review_id) on delete restrict,
  queue_item_id bigint not null references public.lesson_booking_preview_launch_blocker_escalation_queue(queue_item_id) on delete restrict,
  snapshot_id bigint not null references public.lesson_booking_preview_launch_blocker_snapshots(snapshot_id) on delete restrict,
  alert_id bigint not null references public.lesson_booking_preview_launch_blocker_alerts(alert_id) on delete restrict,
  dead_letter_event_id bigint not null references public.lesson_booking_preview_launch_blocker_escalation_work_events(event_id) on delete restrict,
  work_generation_no integer not null check (work_generation_no > 0),
  lineage_ref text not null unique check (lineage_ref ~ '^rqg:[0-9]+:[0-9]+:[0-9]+:[0-9]+$'),
  activation_key text not null unique check (activation_key ~ '^[0-9a-f]{32}$' and activation_key <> repeat('0',32)),
  activation_status text not null default 'activated' check (activation_status = 'activated'),
  lease_handoff_state text not null default 'eligible_for_internal_claim' check (lease_handoff_state = 'eligible_for_internal_claim'),
  claim_scope text not null default 'internal_preview_escalation_lease' check (claim_scope = 'internal_preview_escalation_lease'),
  claim_eligible boolean not null default true check (claim_eligible = true),
  requeue_execution_authorized boolean not null default false check (requeue_execution_authorized = false),
  automatic_notification_authorized boolean not null default false check (automatic_notification_authorized = false),
  notifier_send_authorized boolean not null default false check (notifier_send_authorized = false),
  outcome_suppresses_blocker boolean not null default false check (outcome_suppresses_blocker = false),
  provider_write_authorized boolean not null default false check (provider_write_authorized = false),
  booking_launch_authorized boolean not null default false check (booking_launch_authorized = false),
  destructive_cleanup_authorized boolean not null default false check (destructive_cleanup_authorized = false),
  server_time_authoritative boolean not null default true check (server_time_authoritative = true),
  activated_at timestamptz not null default statement_timestamp()
);

create index if not exists lesson_booking_preview_requeue_work_activations_queue_idx
  on public.lesson_booking_preview_launch_blocker_requeue_work_activations(queue_item_id, activation_id desc);

alter table public.lesson_booking_preview_launch_blocker_requeue_work_activations enable row level security;

revoke all on table public.lesson_booking_preview_launch_blocker_requeue_work_activations
  from public, anon, authenticated, service_role;

drop trigger if exists lesson_booking_preview_launch_blocker_requeue_work_activations_append_only
  on public.lesson_booking_preview_launch_blocker_requeue_work_activations;
create trigger lesson_booking_preview_launch_blocker_requeue_work_activations_append_only
before update or delete on public.lesson_booking_preview_launch_blocker_requeue_work_activations
for each row execute function public.forbid_change();

create or replace function public.service_activate_booking_preview_launch_blocker_requeue_lineage(
  p_work_generation_id bigint,
  p_activation_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_work public.lesson_booking_preview_launch_blocker_requeue_work_generations%rowtype;
  v_consumption public.lesson_booking_preview_launch_blocker_requeue_consumptions%rowtype;
  v_generation public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations%rowtype;
  v_review public.lesson_booking_preview_launch_blocker_dead_letter_reviews%rowtype;
  v_dead public.lesson_booking_preview_launch_blocker_escalation_work_events%rowtype;
  v_existing public.lesson_booking_preview_launch_blocker_requeue_work_activations%rowtype;
  v_key_conflict public.lesson_booking_preview_launch_blocker_requeue_work_activations%rowtype;
  v_latest_snapshot_id bigint;
  v_latest_generation_id bigint;
  v_latest_work_generation_id bigint;
  v_latest_dead_event_id bigint;
  v_activation_key text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_activation_key,''::text)));
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_activation_id bigint;
begin
  if p_work_generation_id is null or p_work_generation_id < 1 then
    raise exception 'invalid_preview_requeue_work_generation_id' using errcode='22023';
  end if;
  if v_activation_key !~ '^[0-9a-f]{32}$' or v_activation_key = pg_catalog.repeat('0',32) then
    raise exception 'invalid_preview_requeue_activation_key' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(20260921,40520);

  select * into v_existing
  from public.lesson_booking_preview_launch_blocker_requeue_work_activations a
  where a.work_generation_id = p_work_generation_id;
  if found then
    if v_existing.activation_key <> v_activation_key then
      raise exception 'preview_requeue_work_generation_already_activated' using errcode='23505';
    end if;
    return pg_catalog.jsonb_build_object(
      'schema_version','smart_parrot_booking_preview_launch_blocker_requeue_activation_result_v1',
      'activation_id',v_existing.activation_id,
      'work_generation_id',v_existing.work_generation_id,
      'consumption_id',v_existing.consumption_id,
      'eligibility_generation_id',v_existing.eligibility_generation_id,
      'review_id',v_existing.review_id,
      'queue_item_id',v_existing.queue_item_id,
      'snapshot_id',v_existing.snapshot_id,
      'alert_id',v_existing.alert_id,
      'dead_letter_event_id',v_existing.dead_letter_event_id,
      'work_generation_no',v_existing.work_generation_no,
      'lineage_ref',v_existing.lineage_ref,
      'activation_status',v_existing.activation_status,
      'lease_handoff_state',v_existing.lease_handoff_state,
      'claim_scope',v_existing.claim_scope,
      'claim_eligible',v_existing.claim_eligible,
      'activated_at',v_existing.activated_at,
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

  select * into v_key_conflict
  from public.lesson_booking_preview_launch_blocker_requeue_work_activations a
  where a.activation_key = v_activation_key;
  if found then
    raise exception 'preview_requeue_activation_key_conflict' using errcode='23505';
  end if;

  select * into v_work
  from public.lesson_booking_preview_launch_blocker_requeue_work_generations w
  where w.work_generation_id = p_work_generation_id;
  if not found then
    raise exception 'preview_requeue_work_generation_missing' using errcode='P0002';
  end if;
  if v_work.work_state <> 'prepared' or v_work.claim_eligible then
    raise exception 'preview_requeue_work_generation_not_prepared' using errcode='55000';
  end if;

  select s.snapshot_id into v_latest_snapshot_id
  from public.lesson_booking_preview_launch_blocker_snapshots s
  order by s.snapshot_id desc
  limit 1;
  if v_latest_snapshot_id is null then
    raise exception 'preview_launch_blocker_snapshot_missing' using errcode='P0002';
  end if;
  if v_work.snapshot_id <> v_latest_snapshot_id then
    raise exception 'stale_preview_requeue_activation_snapshot' using errcode='40001';
  end if;

  select * into v_consumption
  from public.lesson_booking_preview_launch_blocker_requeue_consumptions c
  where c.consumption_id = v_work.consumption_id
    and c.eligibility_generation_id = v_work.eligibility_generation_id
    and c.review_id = v_work.review_id
    and c.queue_item_id = v_work.queue_item_id
    and c.snapshot_id = v_work.snapshot_id
    and c.alert_id = v_work.alert_id
    and c.dead_letter_event_id = v_work.dead_letter_event_id;
  if not found or v_consumption.consumption_status <> 'consumed' then
    raise exception 'stale_preview_requeue_activation_consumption' using errcode='40001';
  end if;

  select * into v_generation
  from public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations g
  where g.generation_id = v_work.eligibility_generation_id;
  if not found
     or v_generation.requeue_eligible is distinct from true
     or v_generation.review_decision <> 'retry_after_review'
     or v_generation.review_id <> v_work.review_id
     or v_generation.queue_item_id <> v_work.queue_item_id
     or v_generation.snapshot_id <> v_work.snapshot_id
     or v_generation.alert_id <> v_work.alert_id
     or v_generation.dead_letter_event_id <> v_work.dead_letter_event_id then
    raise exception 'stale_preview_requeue_activation_eligibility' using errcode='40001';
  end if;
  if v_generation.expires_at <= v_now then
    raise exception 'preview_requeue_activation_eligibility_expired' using errcode='55000';
  end if;

  select g.generation_id into v_latest_generation_id
  from public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations g
  where g.review_id = v_generation.review_id
  order by g.generation_no desc, g.generation_id desc
  limit 1;
  if v_latest_generation_id is distinct from v_generation.generation_id then
    raise exception 'stale_preview_requeue_activation_eligibility_generation' using errcode='40001';
  end if;

  select * into v_review
  from public.lesson_booking_preview_launch_blocker_dead_letter_reviews r
  where r.review_id = v_work.review_id
    and r.queue_item_id = v_work.queue_item_id
    and r.snapshot_id = v_work.snapshot_id
    and r.alert_id = v_work.alert_id
    and r.dead_letter_event_id = v_work.dead_letter_event_id;
  if not found or v_review.decision <> 'retry_after_review' or v_review.dead_letter_reason <> 'attempts_exhausted' then
    raise exception 'stale_preview_requeue_activation_review' using errcode='40001';
  end if;

  select * into v_dead
  from public.lesson_booking_preview_launch_blocker_escalation_work_events e
  where e.event_id = v_work.dead_letter_event_id
    and e.queue_item_id = v_work.queue_item_id
    and e.snapshot_id = v_work.snapshot_id
    and e.alert_id = v_work.alert_id;
  if not found or v_dead.event_kind <> 'dead_lettered' or v_dead.reason_code <> 'attempts_exhausted' then
    raise exception 'stale_preview_requeue_activation_dead_letter' using errcode='40001';
  end if;

  select e.event_id into v_latest_dead_event_id
  from public.lesson_booking_preview_launch_blocker_escalation_work_events e
  where e.queue_item_id = v_work.queue_item_id
  order by e.event_id desc
  limit 1;
  if v_latest_dead_event_id is distinct from v_work.dead_letter_event_id then
    raise exception 'stale_preview_requeue_activation_dead_letter_lineage' using errcode='40001';
  end if;

  select w.work_generation_id into v_latest_work_generation_id
  from public.lesson_booking_preview_launch_blocker_requeue_work_generations w
  where w.queue_item_id = v_work.queue_item_id
  order by w.work_generation_no desc, w.work_generation_id desc
  limit 1;
  if v_latest_work_generation_id is distinct from v_work.work_generation_id then
    raise exception 'stale_preview_requeue_activation_work_generation' using errcode='40001';
  end if;

  if v_work.lineage_ref <> (
    'rqg:' || v_work.snapshot_id::text || ':' || v_work.queue_item_id::text || ':' ||
    v_work.eligibility_generation_id::text || ':' || v_work.work_generation_no::text
  ) then
    raise exception 'stale_preview_requeue_activation_lineage_ref' using errcode='40001';
  end if;

  insert into public.lesson_booking_preview_launch_blocker_requeue_work_activations(
    schema_version,work_generation_id,consumption_id,eligibility_generation_id,review_id,
    queue_item_id,snapshot_id,alert_id,dead_letter_event_id,work_generation_no,lineage_ref,activation_key
  ) values (
    'smart_parrot_booking_preview_launch_blocker_requeue_activation_v1',
    v_work.work_generation_id,v_work.consumption_id,v_work.eligibility_generation_id,v_work.review_id,
    v_work.queue_item_id,v_work.snapshot_id,v_work.alert_id,v_work.dead_letter_event_id,
    v_work.work_generation_no,v_work.lineage_ref,v_activation_key
  ) returning activation_id into v_activation_id;

  return pg_catalog.jsonb_build_object(
    'schema_version','smart_parrot_booking_preview_launch_blocker_requeue_activation_result_v1',
    'activation_id',v_activation_id,
    'work_generation_id',v_work.work_generation_id,
    'consumption_id',v_work.consumption_id,
    'eligibility_generation_id',v_work.eligibility_generation_id,
    'review_id',v_work.review_id,
    'queue_item_id',v_work.queue_item_id,
    'snapshot_id',v_work.snapshot_id,
    'alert_id',v_work.alert_id,
    'dead_letter_event_id',v_work.dead_letter_event_id,
    'work_generation_no',v_work.work_generation_no,
    'lineage_ref',v_work.lineage_ref,
    'activation_status','activated',
    'lease_handoff_state','eligible_for_internal_claim',
    'claim_scope','internal_preview_escalation_lease',
    'claim_eligible',true,
    'activated_at',v_now,
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

revoke all on function public.service_activate_booking_preview_launch_blocker_requeue_lineage(bigint,text)
  from public, anon, authenticated, service_role;
grant execute on function public.service_activate_booking_preview_launch_blocker_requeue_lineage(bigint,text)
  to service_role;

comment on table public.lesson_booking_preview_launch_blocker_requeue_work_activations is
  'Append-only PREVIEW evidence that one exact prepared requeue lineage passed the internal claim-eligibility activation boundary. No notifier/provider/payment/launch/cleanup authority.';
