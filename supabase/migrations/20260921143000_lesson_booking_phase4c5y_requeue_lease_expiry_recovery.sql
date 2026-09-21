-- Smart Parrot Institute lesson-booking Phase 4C5Y
-- Stale requeue lease watchdog + immutable expiry evidence.
-- Preview-only: no external notifier send, Cron sender, provider/payment write, booking launch,
-- destructive cleanup, Base44 publication, or production mutation.

create table if not exists public.lesson_booking_preview_launch_blocker_requeue_lease_expiries (
  expiry_id bigint generated always as identity primary key,
  schema_version text not null check (schema_version = 'smart_parrot_booking_preview_launch_blocker_requeue_lease_expiry_v1'),
  claim_event_id bigint not null unique references public.lesson_booking_preview_launch_blocker_requeue_lease_events(event_id) on delete restrict,
  activation_id bigint not null references public.lesson_booking_preview_launch_blocker_requeue_work_activations(activation_id) on delete restrict,
  work_generation_id bigint not null references public.lesson_booking_preview_launch_blocker_requeue_work_generations(work_generation_id) on delete restrict,
  queue_item_id bigint not null references public.lesson_booking_preview_launch_blocker_escalation_queue(queue_item_id) on delete restrict,
  snapshot_id bigint not null references public.lesson_booking_preview_launch_blocker_snapshots(snapshot_id) on delete restrict,
  alert_id bigint not null references public.lesson_booking_preview_launch_blocker_alerts(alert_id) on delete restrict,
  lineage_ref text not null check (lineage_ref ~ '^rqg:[0-9]+:[0-9]+:[0-9]+:[0-9]+$'),
  lease_generation_no integer not null check (lease_generation_no between 1 and 3),
  lease_expires_at timestamptz not null,
  expiry_reason text not null check (expiry_reason = 'lease_timeout'),
  requeue_execution_authorized boolean not null default false check (requeue_execution_authorized = false),
  automatic_notification_authorized boolean not null default false check (automatic_notification_authorized = false),
  notifier_send_authorized boolean not null default false check (notifier_send_authorized = false),
  outcome_suppresses_blocker boolean not null default false check (outcome_suppresses_blocker = false),
  provider_write_authorized boolean not null default false check (provider_write_authorized = false),
  booking_launch_authorized boolean not null default false check (booking_launch_authorized = false),
  destructive_cleanup_authorized boolean not null default false check (destructive_cleanup_authorized = false),
  server_time_authoritative boolean not null default true check (server_time_authoritative = true),
  observed_at timestamptz not null default statement_timestamp(),
  check (observed_at >= lease_expires_at)
);

create index if not exists lesson_booking_preview_requeue_lease_expiry_activation_idx
  on public.lesson_booking_preview_launch_blocker_requeue_lease_expiries(activation_id, expiry_id desc);

alter table public.lesson_booking_preview_launch_blocker_requeue_lease_expiries enable row level security;

revoke all on table public.lesson_booking_preview_launch_blocker_requeue_lease_expiries
  from public, anon, authenticated, service_role;

drop trigger if exists lesson_booking_preview_launch_blocker_requeue_lease_expiries_append_only
  on public.lesson_booking_preview_launch_blocker_requeue_lease_expiries;
create trigger lesson_booking_preview_launch_blocker_requeue_lease_expiries_append_only
before update or delete on public.lesson_booking_preview_launch_blocker_requeue_lease_expiries
for each row execute function public.forbid_change();

create or replace function public.service_observe_booking_preview_launch_blocker_requeue_expired_leases(
  p_limit integer default 25
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := coalesce(p_limit,25);
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_latest_snapshot_id bigint;
  v_items jsonb;
begin
  if v_limit < 1 or v_limit > 100 then
    raise exception 'invalid_preview_requeue_expiry_observation_limit' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(20260921,40520);

  select s.snapshot_id into v_latest_snapshot_id
  from public.lesson_booking_preview_launch_blocker_snapshots s
  order by s.snapshot_id desc
  limit 1;

  if v_latest_snapshot_id is not null then
    with latest_activation as (
      select distinct on (a.queue_item_id) a.*
      from public.lesson_booking_preview_launch_blocker_requeue_work_activations a
      where a.snapshot_id = v_latest_snapshot_id
      order by a.queue_item_id, a.activation_id desc
    ),
    candidates as (
      select e.*
      from latest_activation a
      join lateral (
        select le.*
        from public.lesson_booking_preview_launch_blocker_requeue_lease_events le
        where le.activation_id = a.activation_id
        order by le.event_id desc
        limit 1
      ) e on true
      where e.event_kind = 'claimed'
        and e.lease_expires_at <= v_now
        and not exists (
          select 1
          from public.lesson_booking_preview_launch_blocker_requeue_lease_events terminal
          where terminal.claim_key = e.claim_key
            and terminal.event_kind in ('released','retry_scheduled','dead_lettered')
        )
      order by e.event_id
      limit v_limit
    )
    insert into public.lesson_booking_preview_launch_blocker_requeue_lease_expiries(
      schema_version,claim_event_id,activation_id,work_generation_id,queue_item_id,snapshot_id,
      alert_id,lineage_ref,lease_generation_no,lease_expires_at,expiry_reason,observed_at
    )
    select
      'smart_parrot_booking_preview_launch_blocker_requeue_lease_expiry_v1',
      c.event_id,c.activation_id,c.work_generation_id,c.queue_item_id,c.snapshot_id,
      c.alert_id,c.lineage_ref,c.lease_generation_no,c.lease_expires_at,'lease_timeout',v_now
    from candidates c
    on conflict (claim_event_id) do nothing;
  end if;

  if v_latest_snapshot_id is null then
    v_items := '[]'::jsonb;
  else
    with latest_activation as (
      select distinct on (a.queue_item_id) a.activation_id,a.queue_item_id
      from public.lesson_booking_preview_launch_blocker_requeue_work_activations a
      where a.snapshot_id = v_latest_snapshot_id
      order by a.queue_item_id, a.activation_id desc
    ),
    current_expiries as (
      select x.*
      from public.lesson_booking_preview_launch_blocker_requeue_lease_expiries x
      join latest_activation a on a.activation_id = x.activation_id
      order by x.expiry_id desc
      limit v_limit
    )
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'expiry_id',x.expiry_id,
      'claim_event_id',x.claim_event_id,
      'activation_id',x.activation_id,
      'work_generation_id',x.work_generation_id,
      'queue_item_id',x.queue_item_id,
      'snapshot_id',x.snapshot_id,
      'alert_id',x.alert_id,
      'lineage_ref',x.lineage_ref,
      'lease_generation_no',x.lease_generation_no,
      'lease_expires_at',x.lease_expires_at,
      'expiry_reason',x.expiry_reason,
      'observed_at',x.observed_at
    ) order by x.expiry_id), '[]'::jsonb)
    into v_items
    from current_expiries x;
  end if;

  return pg_catalog.jsonb_build_object(
    'schema_version','smart_parrot_booking_preview_launch_blocker_requeue_lease_expiry_observation_v1',
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

create or replace function public.service_claim_booking_preview_launch_blocker_requeue_work_audited(
  p_activation_id bigint,
  p_claim_key text,
  p_lease_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_latest public.lesson_booking_preview_launch_blocker_requeue_lease_events%rowtype;
  v_result jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(20260921,40520);

  select * into v_latest
  from public.lesson_booking_preview_launch_blocker_requeue_lease_events e
  where e.activation_id = p_activation_id
  order by e.event_id desc
  limit 1;

  if found
     and v_latest.event_kind = 'claimed'
     and v_latest.lease_expires_at <= v_now
     and not exists (
       select 1
       from public.lesson_booking_preview_launch_blocker_requeue_lease_events terminal
       where terminal.claim_key = v_latest.claim_key
         and terminal.event_kind in ('released','retry_scheduled','dead_lettered')
     ) then
    insert into public.lesson_booking_preview_launch_blocker_requeue_lease_expiries(
      schema_version,claim_event_id,activation_id,work_generation_id,queue_item_id,snapshot_id,
      alert_id,lineage_ref,lease_generation_no,lease_expires_at,expiry_reason,observed_at
    ) values (
      'smart_parrot_booking_preview_launch_blocker_requeue_lease_expiry_v1',
      v_latest.event_id,v_latest.activation_id,v_latest.work_generation_id,v_latest.queue_item_id,
      v_latest.snapshot_id,v_latest.alert_id,v_latest.lineage_ref,v_latest.lease_generation_no,
      v_latest.lease_expires_at,'lease_timeout',v_now
    ) on conflict (claim_event_id) do nothing;
  end if;

  v_result := public.service_claim_booking_preview_launch_blocker_requeue_work(
    p_activation_id,p_claim_key,p_lease_seconds
  );

  return v_result;
end;
$$;

-- Phase Y makes the audited wrapper the only service-role claim entrypoint.
-- The Phase X function remains callable internally by this SECURITY DEFINER wrapper,
-- but is no longer exposed to service_role through the Data API.
revoke execute on function public.service_claim_booking_preview_launch_blocker_requeue_work(bigint,text,integer)
  from service_role;

revoke all on function public.service_observe_booking_preview_launch_blocker_requeue_expired_leases(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.service_observe_booking_preview_launch_blocker_requeue_expired_leases(integer)
  to service_role;

revoke all on function public.service_claim_booking_preview_launch_blocker_requeue_work_audited(bigint,text,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.service_claim_booking_preview_launch_blocker_requeue_work_audited(bigint,text,integer)
  to service_role;

comment on table public.lesson_booking_preview_launch_blocker_requeue_lease_expiries is
  'Append-only PREVIEW evidence that one activation-scoped requeue lease expired according to PostgreSQL server time. Stores no claim key, provider/customer identifier, token, secret, or payment material.';
comment on function public.service_observe_booking_preview_launch_blocker_requeue_expired_leases(integer) is
  'Records and returns minimized immutable expiry evidence for unclosed current Phase X requeue leases whose server-authoritative lease deadline has elapsed.';
comment on function public.service_claim_booking_preview_launch_blocker_requeue_work_audited(bigint,text,integer) is
  'Service-role claim entrypoint after Phase Y. Any unclosed expired prior claim is durably evidenced before a new Phase X lease generation is issued; external notification/provider/payment authority remains false.';