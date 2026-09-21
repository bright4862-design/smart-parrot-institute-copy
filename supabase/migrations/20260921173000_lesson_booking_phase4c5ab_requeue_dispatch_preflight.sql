-- Smart Parrot Institute lesson-booking Phase 4C5AB
-- Service-only notifier dispatch preflight + exact stale-intent exclusion evidence.
-- Preview-only: records internal no-send evidence. No external notifier HTTP call, delivered assertion,
-- Cron sender, provider/payment write, booking launch, destructive cleanup, Base44 publication, or production mutation.

create table if not exists public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflights (
  preflight_id bigint generated always as identity primary key,
  schema_version text not null check (schema_version = 'smart_parrot_booking_preview_launch_blocker_requeue_dispatch_preflight_v1'),
  intent_id bigint not null unique references public.lesson_booking_preview_launch_blocker_requeue_delivery_intents(intent_id) on delete restrict,
  claim_event_id bigint not null references public.lesson_booking_preview_launch_blocker_requeue_lease_events(event_id) on delete restrict,
  activation_id bigint not null references public.lesson_booking_preview_launch_blocker_requeue_work_activations(activation_id) on delete restrict,
  work_generation_id bigint not null references public.lesson_booking_preview_launch_blocker_requeue_work_generations(work_generation_id) on delete restrict,
  queue_item_id bigint not null references public.lesson_booking_preview_launch_blocker_escalation_queue(queue_item_id) on delete restrict,
  snapshot_id bigint not null references public.lesson_booking_preview_launch_blocker_snapshots(snapshot_id) on delete restrict,
  alert_id bigint not null references public.lesson_booking_preview_launch_blocker_alerts(alert_id) on delete restrict,
  lineage_ref text not null check (lineage_ref ~ '^rqg:[0-9]+:[0-9]+:[0-9]+:[0-9]+$'),
  lease_generation_no integer not null check (lease_generation_no between 1 and 3),
  lease_expires_at timestamptz not null,
  intent_key text not null check (intent_key ~ '^rqi:[0-9]+:[0-9]+:[1-3]$'),
  preflight_key text not null unique check (preflight_key ~ '^[0-9a-f]{32}$' and preflight_key <> repeat('0',32)),
  preflight_state text not null check (preflight_state = 'ready_no_send'),
  preflight_scope text not null check (preflight_scope = 'provider_neutral_preview'),
  dispatch_authorized boolean not null default false check (dispatch_authorized = false),
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
  observed_at timestamptz not null default statement_timestamp(),
  check (observed_at < lease_expires_at)
);

create index if not exists lesson_booking_preview_requeue_dispatch_preflight_queue_idx
  on public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflights(queue_item_id, preflight_id desc);

alter table public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflights enable row level security;

revoke all on table public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflights
  from public, anon, authenticated, service_role;

drop trigger if exists lesson_booking_preview_launch_blocker_requeue_dispatch_preflights_append_only
  on public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflights;
create trigger lesson_booking_preview_launch_blocker_requeue_dispatch_preflights_append_only
before update or delete on public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflights
for each row execute function public.forbid_change();

create table if not exists public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflight_exclusions (
  exclusion_id bigint generated always as identity primary key,
  schema_version text not null check (schema_version = 'smart_parrot_booking_preview_launch_blocker_requeue_dispatch_preflight_exclusion_v1'),
  intent_id bigint not null unique references public.lesson_booking_preview_launch_blocker_requeue_delivery_intents(intent_id) on delete restrict,
  preflight_id bigint references public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflights(preflight_id) on delete restrict,
  terminal_id bigint references public.lesson_booking_preview_launch_blocker_requeue_delivery_intent_terminals(terminal_id) on delete restrict,
  claim_event_id bigint not null references public.lesson_booking_preview_launch_blocker_requeue_lease_events(event_id) on delete restrict,
  snapshot_id bigint not null references public.lesson_booking_preview_launch_blocker_snapshots(snapshot_id) on delete restrict,
  lease_expires_at timestamptz not null,
  exclusion_reason text not null check (exclusion_reason in ('claim_closed','lease_expired','snapshot_superseded')),
  evidence_scope text not null check (evidence_scope = 'preview_audit_only'),
  dispatch_authorized boolean not null default false check (dispatch_authorized = false),
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
  excluded_at timestamptz not null default statement_timestamp(),
  check (exclusion_reason <> 'lease_expired' or excluded_at >= lease_expires_at)
);

create index if not exists lesson_booking_preview_requeue_dispatch_preflight_exclusion_snapshot_idx
  on public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflight_exclusions(snapshot_id, exclusion_id desc);

alter table public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflight_exclusions enable row level security;

revoke all on table public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflight_exclusions
  from public, anon, authenticated, service_role;

drop trigger if exists lesson_booking_preview_launch_blocker_requeue_dispatch_preflight_exclusions_append_only
  on public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflight_exclusions;
create trigger lesson_booking_preview_launch_blocker_requeue_dispatch_preflight_exclusions_append_only
before update or delete on public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflight_exclusions
for each row execute function public.forbid_change();

create or replace function public.service_prepare_booking_preview_launch_blocker_requeue_dispatch_preflight(
  p_intent_id bigint,
  p_preflight_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent public.lesson_booking_preview_launch_blocker_requeue_delivery_intents%rowtype;
  v_claim public.lesson_booking_preview_launch_blocker_requeue_lease_events%rowtype;
  v_existing public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflights%rowtype;
  v_exclusion public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflight_exclusions%rowtype;
  v_terminal public.lesson_booking_preview_launch_blocker_requeue_delivery_intent_terminals%rowtype;
  v_latest_snapshot_id bigint;
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_preflight_key text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_preflight_key,''::text)));
  v_exclusion_reason text;
  v_preflight_id bigint;
  v_exclusion_id bigint;
  v_terminal_id bigint;
begin
  if p_intent_id is null or p_intent_id < 1 then
    raise exception 'invalid_preview_requeue_dispatch_preflight_intent_id' using errcode='22023';
  end if;
  if v_preflight_key !~ '^[0-9a-f]{32}$' or v_preflight_key = pg_catalog.repeat('0',32) then
    raise exception 'invalid_preview_requeue_dispatch_preflight_key' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(20260921,40520);

  select s.snapshot_id into v_latest_snapshot_id
  from public.lesson_booking_preview_launch_blocker_snapshots s
  order by s.snapshot_id desc
  limit 1;
  if v_latest_snapshot_id is null then
    raise exception 'preview_launch_blocker_snapshot_missing' using errcode='P0002';
  end if;

  select * into v_intent
  from public.lesson_booking_preview_launch_blocker_requeue_delivery_intents i
  where i.intent_id = p_intent_id
    and i.intent_state = 'prepared'
    and i.transport_scope = 'provider_neutral_preview';
  if not found then
    raise exception 'preview_requeue_dispatch_preflight_intent_missing' using errcode='P0002';
  end if;

  select * into v_claim
  from public.lesson_booking_preview_launch_blocker_requeue_lease_events e
  where e.event_id = v_intent.claim_event_id
    and e.event_kind = 'claimed'
    and e.activation_id = v_intent.activation_id
    and e.work_generation_id = v_intent.work_generation_id
    and e.queue_item_id = v_intent.queue_item_id
    and e.snapshot_id = v_intent.snapshot_id
    and e.alert_id = v_intent.alert_id
    and e.lineage_ref = v_intent.lineage_ref
    and e.lease_generation_no = v_intent.lease_generation_no
    and e.lease_expires_at = v_intent.lease_expires_at;
  if not found then
    raise exception 'stale_preview_requeue_dispatch_preflight_claim' using errcode='40001';
  end if;

  select * into v_existing
  from public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflights p
  where p.intent_id = v_intent.intent_id;

  select * into v_exclusion
  from public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflight_exclusions x
  where x.intent_id = v_intent.intent_id;
  if found then
    return pg_catalog.jsonb_build_object(
      'schema_version','smart_parrot_booking_preview_launch_blocker_requeue_dispatch_preflight_v1',
      'decision','excluded',
      'preflight_id',v_exclusion.preflight_id,
      'exclusion_id',v_exclusion.exclusion_id,
      'intent_id',v_intent.intent_id,
      'claim_event_id',v_intent.claim_event_id,
      'activation_id',v_intent.activation_id,
      'work_generation_id',v_intent.work_generation_id,
      'queue_item_id',v_intent.queue_item_id,
      'snapshot_id',v_intent.snapshot_id,
      'alert_id',v_intent.alert_id,
      'lineage_ref',v_intent.lineage_ref,
      'lease_generation_no',v_intent.lease_generation_no,
      'lease_expires_at',v_intent.lease_expires_at,
      'intent_key',v_intent.intent_key,
      'exclusion_reason',v_exclusion.exclusion_reason,
      'observed_at',v_exclusion.excluded_at,
      'preflight_scope','provider_neutral_preview',
      'replay',true,
      'dispatch_authorized',false,
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

  select * into v_terminal
  from public.lesson_booking_preview_launch_blocker_requeue_delivery_intent_terminals t
  where t.intent_id = v_intent.intent_id;
  if found then
    v_terminal_id := v_terminal.terminal_id;
    v_exclusion_reason := v_terminal.terminal_reason;
  elsif exists (
    select 1
    from public.lesson_booking_preview_launch_blocker_requeue_lease_events t
    where t.claim_key = v_claim.claim_key
      and t.event_id > v_claim.event_id
      and t.event_kind in ('released','retry_scheduled','dead_lettered')
  ) then
    v_exclusion_reason := 'claim_closed';
  elsif v_intent.lease_expires_at <= v_now then
    v_exclusion_reason := 'lease_expired';
  elsif v_intent.snapshot_id <> v_latest_snapshot_id then
    v_exclusion_reason := 'snapshot_superseded';
  end if;

  if v_exclusion_reason is not null then
    insert into public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflight_exclusions(
      schema_version,intent_id,preflight_id,terminal_id,claim_event_id,snapshot_id,lease_expires_at,
      exclusion_reason,evidence_scope,excluded_at
    ) values (
      'smart_parrot_booking_preview_launch_blocker_requeue_dispatch_preflight_exclusion_v1',
      v_intent.intent_id,v_existing.preflight_id,v_terminal_id,v_intent.claim_event_id,v_intent.snapshot_id,
      v_intent.lease_expires_at,v_exclusion_reason,'preview_audit_only',v_now
    )
    on conflict (intent_id) do nothing
    returning exclusion_id into v_exclusion_id;

    if v_exclusion_id is null then
      select * into v_exclusion
      from public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflight_exclusions x
      where x.intent_id = v_intent.intent_id;
      v_exclusion_id := v_exclusion.exclusion_id;
      v_exclusion_reason := v_exclusion.exclusion_reason;
      v_now := v_exclusion.excluded_at;
    end if;

    return pg_catalog.jsonb_build_object(
      'schema_version','smart_parrot_booking_preview_launch_blocker_requeue_dispatch_preflight_v1',
      'decision','excluded',
      'preflight_id',v_existing.preflight_id,
      'exclusion_id',v_exclusion_id,
      'intent_id',v_intent.intent_id,
      'claim_event_id',v_intent.claim_event_id,
      'activation_id',v_intent.activation_id,
      'work_generation_id',v_intent.work_generation_id,
      'queue_item_id',v_intent.queue_item_id,
      'snapshot_id',v_intent.snapshot_id,
      'alert_id',v_intent.alert_id,
      'lineage_ref',v_intent.lineage_ref,
      'lease_generation_no',v_intent.lease_generation_no,
      'lease_expires_at',v_intent.lease_expires_at,
      'intent_key',v_intent.intent_key,
      'exclusion_reason',v_exclusion_reason,
      'observed_at',v_now,
      'preflight_scope','provider_neutral_preview',
      'replay',false,
      'dispatch_authorized',false,
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

  if v_existing.preflight_id is not null then
    if v_existing.preflight_key <> v_preflight_key then
      raise exception 'preview_requeue_dispatch_preflight_key_conflict' using errcode='23505';
    end if;
    return pg_catalog.jsonb_build_object(
      'schema_version','smart_parrot_booking_preview_launch_blocker_requeue_dispatch_preflight_v1',
      'decision','ready_no_send',
      'preflight_id',v_existing.preflight_id,
      'exclusion_id',null,
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
      'exclusion_reason',null,
      'observed_at',v_existing.observed_at,
      'preflight_scope','provider_neutral_preview',
      'replay',true,
      'dispatch_authorized',false,
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

  insert into public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflights(
    schema_version,intent_id,claim_event_id,activation_id,work_generation_id,queue_item_id,
    snapshot_id,alert_id,lineage_ref,lease_generation_no,lease_expires_at,intent_key,preflight_key,
    preflight_state,preflight_scope,observed_at
  ) values (
    'smart_parrot_booking_preview_launch_blocker_requeue_dispatch_preflight_v1',
    v_intent.intent_id,v_intent.claim_event_id,v_intent.activation_id,v_intent.work_generation_id,
    v_intent.queue_item_id,v_intent.snapshot_id,v_intent.alert_id,v_intent.lineage_ref,
    v_intent.lease_generation_no,v_intent.lease_expires_at,v_intent.intent_key,v_preflight_key,
    'ready_no_send','provider_neutral_preview',v_now
  ) returning preflight_id into v_preflight_id;

  return pg_catalog.jsonb_build_object(
    'schema_version','smart_parrot_booking_preview_launch_blocker_requeue_dispatch_preflight_v1',
    'decision','ready_no_send',
    'preflight_id',v_preflight_id,
    'exclusion_id',null,
    'intent_id',v_intent.intent_id,
    'claim_event_id',v_intent.claim_event_id,
    'activation_id',v_intent.activation_id,
    'work_generation_id',v_intent.work_generation_id,
    'queue_item_id',v_intent.queue_item_id,
    'snapshot_id',v_intent.snapshot_id,
    'alert_id',v_intent.alert_id,
    'lineage_ref',v_intent.lineage_ref,
    'lease_generation_no',v_intent.lease_generation_no,
    'lease_expires_at',v_intent.lease_expires_at,
    'intent_key',v_intent.intent_key,
    'exclusion_reason',null,
    'observed_at',v_now,
    'preflight_scope','provider_neutral_preview',
    'replay',false,
    'dispatch_authorized',false,
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

revoke all on function public.service_prepare_booking_preview_launch_blocker_requeue_dispatch_preflight(bigint,text)
  from public, anon, authenticated, service_role;
grant execute on function public.service_prepare_booking_preview_launch_blocker_requeue_dispatch_preflight(bigint,text)
  to service_role;

comment on table public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflights is
  'Append-only PREVIEW no-send preflight evidence for one exact current Phase Z delivery intent. This table never authorizes dispatch and stores no claim key, customer/provider identifier, notifier receipt, token, secret, or payment material.';
comment on table public.lesson_booking_preview_launch_blocker_requeue_dispatch_preflight_exclusions is
  'Append-only PREVIEW evidence that an exact delivery intent is stale because its claim closed, server-time lease expired, or blocker snapshot was superseded. May supersede an earlier ready_no_send preflight and never authorizes dispatch.';
comment on function public.service_prepare_booking_preview_launch_blocker_requeue_dispatch_preflight(bigint,text) is
  'Service-only PREVIEW dispatch preflight. Revalidates exact intent/claim, Phase AA terminal evidence, current blocker snapshot and PostgreSQL lease time; stale evidence always wins over replay. Performs no external notifier HTTP call or delivered assertion.';
