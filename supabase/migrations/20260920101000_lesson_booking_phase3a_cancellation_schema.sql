-- Phase 3A: cancellation/withdrawal evidence + compliance outbox.
alter table public.bookings
  add column if not exists cancellation_requested_at timestamptz,
  add column if not exists cancellation_request_kind text,
  add column if not exists cancellation_requested_by uuid,
  add column if not exists cancellation_attempts int not null default 0,
  add column if not exists cancellation_last_error_code text,
  add column if not exists cancellation_last_error_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='bookings_cancellation_request_kind_check' and conrelid='public.bookings'::regclass) then
    alter table public.bookings add constraint bookings_cancellation_request_kind_check
      check (cancellation_request_kind is null or cancellation_request_kind in ('cancel','withdrawal'));
  end if;
  if not exists (select 1 from pg_constraint where conname='bookings_cancellation_attempts_nonnegative' and conrelid='public.bookings'::regclass) then
    alter table public.bookings add constraint bookings_cancellation_attempts_nonnegative check (cancellation_attempts >= 0);
  end if;
end $$;

create table if not exists public.booking_cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  actor_role text not null check (actor_role in ('student','tutor')),
  kind text not null check (kind in ('cancel','withdrawal')),
  requested_at timestamptz not null,
  policy_version_id text not null references public.policy_versions(id),
  terms_sha256 text not null,
  outcome public.lesson_outcome not null,
  amount_cents int not null check (amount_cents >= 0),
  payment_action text not null check (payment_action in ('none','capture','release')),
  request_ip inet,
  user_agent text,
  created_at timestamptz not null default clock_timestamp()
);

create table if not exists public.compliance_notice_outbox (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  kind text not null check (kind in ('cancellation_confirmation','withdrawal_acknowledgement')),
  payload jsonb not null,
  queued_at timestamptz not null default clock_timestamp(),
  delivery_attempts int not null default 0 check (delivery_attempts >= 0),
  delivered_at timestamptz,
  provider_message_id text,
  last_error_code text,
  unique (booking_id, kind)
);

alter table public.booking_cancellation_requests enable row level security;
alter table public.compliance_notice_outbox enable row level security;
revoke all on table public.booking_cancellation_requests from anon, authenticated;
revoke all on table public.compliance_notice_outbox from anon, authenticated;

drop trigger if exists booking_cancellation_requests_append_only on public.booking_cancellation_requests;
create trigger booking_cancellation_requests_append_only
before update or delete on public.booking_cancellation_requests
for each row execute function public.forbid_change();

create unique index if not exists ledger_terminal_money_kind_once
  on public.ledger_entries(booking_id, kind) where kind in ('captured','hold_released');
create index if not exists bookings_cancellation_pending_idx
  on public.bookings(cancellation_requested_at)
  where cancellation_requested_at is not null and status <> 'cancelled';

comment on table public.booking_cancellation_requests is
  'Append-only server evidence for cancellation/withdrawal: actor, time, accepted policy and computed amount.';
comment on table public.compliance_notice_outbox is
  'Server-only acknowledgement queue; rows are evidence to deliver, not proof of durable-medium delivery.';
