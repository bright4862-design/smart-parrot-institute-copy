-- Smart Parrot Institute lesson-booking Phase 4C5AA
-- Append-only terminal evidence for prepared requeue delivery intents that become unusable.
-- Preview-only: observes server-side lifecycle state. No external notifier HTTP call, delivered assertion,
-- Cron sender, provider/payment write, booking launch, destructive cleanup, Base44 publication, or production mutation.

create table if not exists public.lesson_booking_preview_launch_blocker_requeue_delivery_intent_terminals (
  terminal_id bigint generated always as identity primary key,
  schema_version text not null check (schema_version = 'smart_parrot_booking_preview_launch_blocker_requeue_delivery_intent_terminal_v1'),
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
  terminal_reason text not null check (terminal_reason in ('claim_closed','lease_expired','snapshot_superseded')),
  evidence_scope text not null check (evidence_scope = 'preview_audit_only'),
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
  check (terminal_reason <> 'lease_expired' or observed_at >= lease_expires_at)
);

create index if not exists lesson_booking_preview_requeue_delivery_intent_terminal_queue_idx
  on public.lesson_booking_preview_launch_blocker_requeue_delivery_intent_terminals(queue_item_id, terminal_id desc);

alter table public.lesson_booking_preview_launch_blocker_requeue_delivery_intent_terminals enable row level security;

revoke all on table public.lesson_booking_preview_launch_blocker_requeue_delivery_intent_terminals
  from public, anon, authenticated, service_role;

drop trigger if exists lesson_booking_preview_launch_blocker_requeue_delivery_intent_terminals_append_only
  on public.lesson_booking_preview_launch_blocker_requeue_delivery_intent_terminals;
create trigger lesson_booking_preview_launch_blocker_requeue_delivery_intent_terminals_append_only
before update or delete on public.lesson_booking_preview_launch_blocker_requeue_delivery_intent_terminals
for each row execute function public.forbid_change();

create or replace function public.service_observe_booking_preview_launch_blocker_requeue_delivery_intent_terminals(
  p_limit integer default 100
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_latest_snapshot_id bigint;
  v_observed_count bigint := 0;
  v_claim_closed_count bigint := 0;
  v_lease_expired_count bigint := 0;
  v_snapshot_superseded_count bigint := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'invalid_preview_requeue_delivery_intent_terminal_limit' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(20260921,40520);

  select s.snapshot_id into v_latest_snapshot_id
  from public.lesson_booking_preview_launch_blocker_snapshots s
  order by s.snapshot_id desc
  limit 1;
  if v_latest_snapshot_id is null then
    raise exception 'preview_launch_blocker_snapshot_missing' using errcode='P0002';
  end if;

  with candidates as (
    select
      i.intent_id,
      i.claim_event_id,
      i.activation_id,
      i.work_generation_id,
      i.queue_item_id,
      i.snapshot_id,
      i.alert_id,
      i.lineage_ref,
      i.lease_generation_no,
      i.lease_expires_at,
      i.intent_key,
      case
        when exists (
          select 1
          from public.lesson_booking_preview_launch_blocker_requeue_lease_events t
          where t.claim_key = c.claim_key
            and t.event_id > c.event_id
            and t.event_kind in ('released','retry_scheduled','dead_lettered')
        ) then 'claim_closed'::text
        when i.lease_expires_at <= v_now then 'lease_expired'::text
        when i.snapshot_id <> v_latest_snapshot_id then 'snapshot_superseded'::text
        else null::text
      end as terminal_reason
    from public.lesson_booking_preview_launch_blocker_requeue_delivery_intents i
    join public.lesson_booking_preview_launch_blocker_requeue_lease_events c
      on c.event_id = i.claim_event_id
     and c.event_kind = 'claimed'
    where not exists (
      select 1
      from public.lesson_booking_preview_launch_blocker_requeue_delivery_intent_terminals x
      where x.intent_id = i.intent_id
    )
      and (
        exists (
          select 1
          from public.lesson_booking_preview_launch_blocker_requeue_lease_events t
          where t.claim_key = c.claim_key
            and t.event_id > c.event_id
            and t.event_kind in ('released','retry_scheduled','dead_lettered')
        )
        or i.lease_expires_at <= v_now
        or i.snapshot_id <> v_latest_snapshot_id
      )
    order by i.intent_id
    limit p_limit
  ), inserted as (
    insert into public.lesson_booking_preview_launch_blocker_requeue_delivery_intent_terminals(
      schema_version,intent_id,claim_event_id,activation_id,work_generation_id,queue_item_id,
      snapshot_id,alert_id,lineage_ref,lease_generation_no,lease_expires_at,intent_key,
      terminal_reason,evidence_scope,observed_at
    )
    select
      'smart_parrot_booking_preview_launch_blocker_requeue_delivery_intent_terminal_v1',
      c.intent_id,c.claim_event_id,c.activation_id,c.work_generation_id,c.queue_item_id,
      c.snapshot_id,c.alert_id,c.lineage_ref,c.lease_generation_no,c.lease_expires_at,c.intent_key,
      c.terminal_reason,'preview_audit_only',v_now
    from candidates c
    where c.terminal_reason is not null
    on conflict (intent_id) do nothing
    returning terminal_reason
  )
  select
    pg_catalog.count(*),
    pg_catalog.count(*) filter (where terminal_reason='claim_closed'),
    pg_catalog.count(*) filter (where terminal_reason='lease_expired'),
    pg_catalog.count(*) filter (where terminal_reason='snapshot_superseded')
  into v_observed_count,v_claim_closed_count,v_lease_expired_count,v_snapshot_superseded_count
  from inserted;

  return pg_catalog.jsonb_build_object(
    'schema_version','smart_parrot_booking_preview_launch_blocker_requeue_delivery_intent_terminal_observation_v1',
    'observed_count',v_observed_count,
    'claim_closed_count',v_claim_closed_count,
    'lease_expired_count',v_lease_expired_count,
    'snapshot_superseded_count',v_snapshot_superseded_count,
    'observed_at',v_now,
    'evidence_scope','preview_audit_only',
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

revoke all on function public.service_observe_booking_preview_launch_blocker_requeue_delivery_intent_terminals(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.service_observe_booking_preview_launch_blocker_requeue_delivery_intent_terminals(integer)
  to service_role;

comment on table public.lesson_booking_preview_launch_blocker_requeue_delivery_intent_terminals is
  'Append-only PREVIEW audit evidence that a previously prepared Phase Z intent became unusable because its exact claim closed, its server-time lease expired, or its blocker snapshot was superseded. Stores no claim key, customer/provider identifier, token, secret, payment material, or notifier receipt.';
comment on function public.service_observe_booking_preview_launch_blocker_requeue_delivery_intent_terminals(integer) is
  'Service-only PREVIEW observer. Uses PostgreSQL time and the shared requeue advisory lock to terminalize stale prepared intents without sending notifications, asserting delivery, mutating providers/payments, launching bookings, or authorizing cleanup.';