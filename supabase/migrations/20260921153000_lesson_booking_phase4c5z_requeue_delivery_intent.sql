-- Smart Parrot Institute lesson-booking Phase 4C5Z
-- Lease-safe provider-neutral notifier delivery-intent preparation.
-- Preview-only: prepares internal correlation evidence only. No external HTTP notifier call,
-- delivered assertion, Cron sender, provider/payment write, booking launch, cleanup, or production mutation.

create table if not exists public.lesson_booking_preview_launch_blocker_requeue_delivery_intents (
  intent_id bigint generated always as identity primary key,
  schema_version text not null check (schema_version = 'smart_parrot_booking_preview_launch_blocker_requeue_delivery_intent_v1'),
  claim_event_id bigint not null unique references public.lesson_booking_preview_launch_blocker_requeue_lease_events(event_id) on delete restrict,
  activation_id bigint not null references public.lesson_booking_preview_launch_blocker_requeue_work_activations(activation_id) on delete restrict,
  work_generation_id bigint not null references public.lesson_booking_preview_launch_blocker_requeue_work_generations(work_generation_id) on delete restrict,
  queue_item_id bigint not null references public.lesson_booking_preview_launch_blocker_escalation_queue(queue_item_id) on delete restrict,
  snapshot_id bigint not null references public.lesson_booking_preview_launch_blocker_snapshots(snapshot_id) on delete restrict,
  alert_id bigint not null references public.lesson_booking_preview_launch_blocker_alerts(alert_id) on delete restrict,
  lineage_ref text not null check (lineage_ref ~ '^rqg:[0-9]+:[0-9]+:[0-9]+:[0-9]+$'),
  lease_generation_no integer not null check (lease_generation_no between 1 and 3),
  lease_expires_at timestamptz not null,
  intent_key text not null unique check (intent_key ~ '^rqi:[0-9]+:[0-9]+:[1-3]$'),
  intent_state text not null check (intent_state = 'prepared'),
  transport_scope text not null check (transport_scope = 'provider_neutral_preview'),
  external_notification_http_authorized boolean not null default false check (external_notification_http_authorized = false),
  delivery_assertion_authorized boolean not null default false check (delivery_assertion_authorized = false),
  requeue_execution_authorized boolean not null default false check (requeue_execution_authorized = false),
  automatic_notification_authorized boolean not null default false check (automatic_notification_authorized = false),
  notifier_send_authorized boolean not null default false check (notifier_send_authorized = false),
  outcome_suppresses_blocker boolean not null default false check (outcome_suppresses_blocker = false),
  provider_write_authorized boolean not null default false check (provider_write_authorized = false),
  booking_launch_authorized boolean not null default false check (booking_launch_authorized = false),
  destructive_cleanup_authorized boolean not null default false check (destructive_cleanup_authorized = false),
  server_time_authoritative boolean not null default true check (server_time_authoritative = true),
  prepared_at timestamptz not null default statement_timestamp(),
  check (prepared_at < lease_expires_at)
);

create index if not exists lesson_booking_preview_requeue_delivery_intent_activation_idx
  on public.lesson_booking_preview_launch_blocker_requeue_delivery_intents(activation_id, intent_id desc);

alter table public.lesson_booking_preview_launch_blocker_requeue_delivery_intents enable row level security;

revoke all on table public.lesson_booking_preview_launch_blocker_requeue_delivery_intents
  from public, anon, authenticated, service_role;

drop trigger if exists lesson_booking_preview_launch_blocker_requeue_delivery_intents_append_only
  on public.lesson_booking_preview_launch_blocker_requeue_delivery_intents;
create trigger lesson_booking_preview_launch_blocker_requeue_delivery_intents_append_only
before update or delete on public.lesson_booking_preview_launch_blocker_requeue_delivery_intents
for each row execute function public.forbid_change();

create or replace function public.service_prepare_booking_preview_launch_blocker_requeue_delivery_intent(
  p_claim_event_id bigint
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.lesson_booking_preview_launch_blocker_requeue_lease_events%rowtype;
  v_activation public.lesson_booking_preview_launch_blocker_requeue_work_activations%rowtype;
  v_existing public.lesson_booking_preview_launch_blocker_requeue_delivery_intents%rowtype;
  v_latest_event_id bigint;
  v_latest_snapshot_id bigint;
  v_latest_activation_id bigint;
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_intent_key text;
  v_intent_id bigint;
begin
  if p_claim_event_id is null or p_claim_event_id < 1 then
    raise exception 'invalid_preview_requeue_claim_event_id' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(20260921,40520);

  select s.snapshot_id into v_latest_snapshot_id
  from public.lesson_booking_preview_launch_blocker_snapshots s
  order by s.snapshot_id desc
  limit 1;
  if v_latest_snapshot_id is null then
    raise exception 'preview_launch_blocker_snapshot_missing' using errcode='P0002';
  end if;

  select * into v_claim
  from public.lesson_booking_preview_launch_blocker_requeue_lease_events e
  where e.event_id = p_claim_event_id
    and e.event_kind = 'claimed';
  if not found then
    raise exception 'preview_requeue_delivery_intent_claim_missing' using errcode='P0002';
  end if;

  if v_claim.snapshot_id <> v_latest_snapshot_id then
    raise exception 'stale_preview_requeue_delivery_intent_snapshot' using errcode='40001';
  end if;
  if v_claim.lease_expires_at is null or v_claim.lease_expires_at <= v_now then
    raise exception 'preview_requeue_delivery_intent_lease_expired' using errcode='55000';
  end if;
  if exists (
    select 1
    from public.lesson_booking_preview_launch_blocker_requeue_lease_expiries x
    where x.claim_event_id = v_claim.event_id
  ) then
    raise exception 'preview_requeue_delivery_intent_expiry_evidenced' using errcode='55000';
  end if;
  if exists (
    select 1
    from public.lesson_booking_preview_launch_blocker_requeue_lease_events t
    where t.claim_key = v_claim.claim_key
      and t.event_kind in ('released','retry_scheduled','dead_lettered')
  ) then
    raise exception 'preview_requeue_delivery_intent_claim_closed' using errcode='55000';
  end if;

  select e.event_id into v_latest_event_id
  from public.lesson_booking_preview_launch_blocker_requeue_lease_events e
  where e.activation_id = v_claim.activation_id
  order by e.event_id desc
  limit 1;
  if v_latest_event_id is distinct from v_claim.event_id then
    raise exception 'stale_preview_requeue_delivery_intent_claim' using errcode='40001';
  end if;

  select * into v_activation
  from public.lesson_booking_preview_launch_blocker_requeue_work_activations a
  where a.activation_id = v_claim.activation_id
    and a.work_generation_id = v_claim.work_generation_id
    and a.queue_item_id = v_claim.queue_item_id
    and a.snapshot_id = v_claim.snapshot_id
    and a.alert_id = v_claim.alert_id
    and a.lineage_ref = v_claim.lineage_ref;
  if not found
     or v_activation.activation_status <> 'activated'
     or v_activation.lease_handoff_state <> 'eligible_for_internal_claim'
     or v_activation.claim_scope <> 'internal_preview_escalation_lease'
     or v_activation.claim_eligible is distinct from true then
    raise exception 'stale_preview_requeue_delivery_intent_activation' using errcode='40001';
  end if;

  select a.activation_id into v_latest_activation_id
  from public.lesson_booking_preview_launch_blocker_requeue_work_activations a
  where a.queue_item_id = v_claim.queue_item_id
  order by a.activation_id desc
  limit 1;
  if v_latest_activation_id is distinct from v_claim.activation_id then
    raise exception 'stale_preview_requeue_delivery_intent_activation' using errcode='40001';
  end if;

  v_intent_key := pg_catalog.concat(
    'rqi:', v_claim.activation_id::text, ':', v_claim.event_id::text, ':', v_claim.lease_generation_no::text
  );

  select * into v_existing
  from public.lesson_booking_preview_launch_blocker_requeue_delivery_intents i
  where i.claim_event_id = v_claim.event_id
     or i.intent_key = v_intent_key
  order by i.intent_id
  limit 1;

  if found then
    if v_existing.claim_event_id <> v_claim.event_id
       or v_existing.activation_id <> v_claim.activation_id
       or v_existing.work_generation_id <> v_claim.work_generation_id
       or v_existing.queue_item_id <> v_claim.queue_item_id
       or v_existing.snapshot_id <> v_claim.snapshot_id
       or v_existing.alert_id <> v_claim.alert_id
       or v_existing.lineage_ref <> v_claim.lineage_ref
       or v_existing.lease_generation_no <> v_claim.lease_generation_no
       or v_existing.lease_expires_at <> v_claim.lease_expires_at
       or v_existing.intent_key <> v_intent_key
       or v_existing.intent_state <> 'prepared'
       or v_existing.transport_scope <> 'provider_neutral_preview' then
      raise exception 'preview_requeue_delivery_intent_conflict' using errcode='23505';
    end if;

    return pg_catalog.jsonb_build_object(
      'schema_version','smart_parrot_booking_preview_launch_blocker_requeue_delivery_intent_v1',
      'intent_id',v_existing.intent_id,
      'claim_event_id',v_existing.claim_event_id,
      'activation_id',v_existing.activation_id,
      'work_generation_id',v_existing.work_generation_id,
      'queue_item_id',v_existing.queue_item_id,
      'snapshot_id',v_existing.snapshot_id,
      'alert_id',v_existing.alert_id,
      'lineage_ref',v_existing.lineage_ref,
      'lease_generation_no',v_existing.lease_generation_no,
      'lease_expires_at',v_existing.lease_expires_at,
      'intent_key',v_existing.intent_key,
      'intent_state','prepared',
      'transport_scope','provider_neutral_preview',
      'prepared_at',v_existing.prepared_at,
      'replay',true,
      'external_notification_http_authorized',false,
      'delivery_assertion_authorized',false,
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

  insert into public.lesson_booking_preview_launch_blocker_requeue_delivery_intents(
    schema_version,claim_event_id,activation_id,work_generation_id,queue_item_id,snapshot_id,alert_id,
    lineage_ref,lease_generation_no,lease_expires_at,intent_key,intent_state,transport_scope,prepared_at
  ) values (
    'smart_parrot_booking_preview_launch_blocker_requeue_delivery_intent_v1',
    v_claim.event_id,v_claim.activation_id,v_claim.work_generation_id,v_claim.queue_item_id,
    v_claim.snapshot_id,v_claim.alert_id,v_claim.lineage_ref,v_claim.lease_generation_no,
    v_claim.lease_expires_at,v_intent_key,'prepared','provider_neutral_preview',v_now
  ) returning intent_id into v_intent_id;

  return pg_catalog.jsonb_build_object(
    'schema_version','smart_parrot_booking_preview_launch_blocker_requeue_delivery_intent_v1',
    'intent_id',v_intent_id,
    'claim_event_id',v_claim.event_id,
    'activation_id',v_claim.activation_id,
    'work_generation_id',v_claim.work_generation_id,
    'queue_item_id',v_claim.queue_item_id,
    'snapshot_id',v_claim.snapshot_id,
    'alert_id',v_claim.alert_id,
    'lineage_ref',v_claim.lineage_ref,
    'lease_generation_no',v_claim.lease_generation_no,
    'lease_expires_at',v_claim.lease_expires_at,
    'intent_key',v_intent_key,
    'intent_state','prepared',
    'transport_scope','provider_neutral_preview',
    'prepared_at',v_now,
    'replay',false,
    'external_notification_http_authorized',false,
    'delivery_assertion_authorized',false,
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

revoke all on function public.service_prepare_booking_preview_launch_blocker_requeue_delivery_intent(bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.service_prepare_booking_preview_launch_blocker_requeue_delivery_intent(bigint)
  to service_role;

comment on table public.lesson_booking_preview_launch_blocker_requeue_delivery_intents is
  'Append-only PREVIEW evidence that one currently active Phase Y-audited requeue lease has a provider-neutral notification delivery intent prepared. No external send, delivery assertion, claim key, customer/provider identifier, token, secret, or payment material is stored.';
comment on function public.service_prepare_booking_preview_launch_blocker_requeue_delivery_intent(bigint) is
  'Service-only PREVIEW preparation boundary for one deterministic delivery intent tied to an exact current unexpired requeue claim. Rejects expired, expiry-evidenced, terminal, stale, or superseded claims; performs no external notification HTTP call.';