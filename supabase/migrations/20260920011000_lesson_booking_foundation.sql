-- Smart Parrot Institute lesson-booking foundation
-- Phase 0: schema, immutable evidence, overlap protection, and least-privilege RLS.
-- No live credentials belong in this migration.

create extension if not exists btree_gist;

do $$
begin
  create type public.booking_status as enum (
    'pending_checkout',
    'card_saved',
    'hold_placed',
    'hold_failed',
    'awaiting_settlement',
    'settled',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.lesson_outcome as enum (
    'on_time',
    'late',
    'no_show',
    'tutor_late',
    'tutor_no_show',
    'cancelled_free',
    'cancelled_late',
    'cancelled_very_late',
    'cancelled_by_tutor'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'student'
    check (role in ('student', 'tutor', 'admin')),
  full_name text,
  timezone text not null default 'Europe/Paris',
  created_at timestamptz not null default now()
);

create table if not exists public.stripe_links (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_account_id text unique
);

create table if not exists public.tutors (
  id uuid primary key references public.profiles (id) on delete cascade,
  bio text,
  active boolean not null default true
);

create table if not exists public.lesson_types (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutors (id),
  name text not null,
  duration_minutes int not null check (duration_minutes between 15 and 180),
  on_time_price_cents int not null check (on_time_price_cents > 0),
  currency text not null default 'eur',
  active boolean not null default true
);

create table if not exists public.availability_windows (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutors (id) on delete cascade,
  period tstzrange not null,
  constraint no_overlapping_windows
    exclude using gist (tutor_id with =, period with &&)
);

create table if not exists public.policy_versions (
  id text primary key,
  config jsonb not null,
  terms_markdown text not null,
  terms_sha256 text not null,
  published_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id),
  tutor_id uuid not null references public.tutors (id),
  lesson_type_id uuid not null references public.lesson_types (id),
  policy_version_id text not null references public.policy_versions (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  slot tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  status public.booking_status not null default 'pending_checkout',
  currency text not null default 'eur',
  on_time_price_cents int not null check (on_time_price_cents > 0),
  max_charge_cents int not null,
  hold_strategy text not null check (hold_strategy in ('at_checkout', 'deferred')),
  hold_due_at timestamptz,
  hold_attempts int not null default 0 check (hold_attempts >= 0),
  stripe_checkout_session_id text unique,
  stripe_payment_method_id text,
  stripe_payment_intent_id text unique,
  capture_before timestamptz,
  cancelled_at timestamptz,
  cancelled_by text check (cancelled_by in ('student', 'tutor', 'system')),
  cancel_kind text check (cancel_kind in ('cancel', 'withdrawal', 'expired', 'hold_failed')),
  outcome public.lesson_outcome,
  final_amount_cents int check (final_amount_cents >= 0),
  settled_at timestamptz,
  video_room_name text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (max_charge_cents >= on_time_price_cents),
  check (final_amount_cents is null or final_amount_cents <= max_charge_cents),
  constraint no_tutor_overlap
    exclude using gist (tutor_id with =, slot with &&)
    where (status <> 'cancelled'),
  constraint no_student_overlap
    exclude using gist (student_id with =, slot with &&)
    where (status <> 'cancelled')
);

create index if not exists bookings_hold_due_idx
  on public.bookings (status, hold_due_at);

create index if not exists bookings_settle_idx
  on public.bookings (status, ends_at);

create table if not exists public.attendance_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  actor text not null check (actor in ('student', 'tutor')),
  kind text not null check (kind in ('joined', 'left', 'checked_in', 'reported_absent')),
  source text not null check (source in ('daily_webhook', 'qr_scan', 'app_button', 'tutor_attest', 'admin')),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  external_id text,
  ip inet,
  user_agent text,
  raw jsonb,
  unique (source, external_id)
);

create table if not exists public.consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id),
  booking_id uuid references public.bookings (id) on delete cascade,
  policy_version_id text not null references public.policy_versions (id),
  terms_sha256 text not null,
  checkbox_text text not null,
  express_start_request boolean not null default false,
  stripe_checkout_session_id text,
  accepted_at timestamptz not null default now(),
  ip inet,
  user_agent text
);

create table if not exists public.ledger_entries (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  kind text not null check (kind in (
    'hold_placed',
    'hold_failed',
    'hold_released',
    'captured',
    'refunded',
    'credit_issued',
    'credit_applied',
    'dispute_opened',
    'dispute_closed'
  )),
  amount_cents int not null default 0 check (amount_cents >= 0),
  currency text not null default 'eur',
  stripe_object_id text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create or replace function public.forbid_change()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

drop trigger if exists policy_versions_append_only on public.policy_versions;
create trigger policy_versions_append_only
before update or delete on public.policy_versions
for each row execute function public.forbid_change();

drop trigger if exists attendance_append_only on public.attendance_events;
create trigger attendance_append_only
before update or delete on public.attendance_events
for each row execute function public.forbid_change();

drop trigger if exists consents_append_only on public.consents;
create trigger consents_append_only
before update or delete on public.consents
for each row execute function public.forbid_change();

drop trigger if exists ledger_append_only on public.ledger_entries;
create trigger ledger_append_only
before update or delete on public.ledger_entries
for each row execute function public.forbid_change();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

revoke execute on function public.forbid_change() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.stripe_links enable row level security;
alter table public.tutors enable row level security;
alter table public.lesson_types enable row level security;
alter table public.availability_windows enable row level security;
alter table public.policy_versions enable row level security;
alter table public.bookings enable row level security;
alter table public.attendance_events enable row level security;
alter table public.consents enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.stripe_events enable row level security;

-- Existing Supabase projects can carry permissive default grants. Revoke first,
-- then grant back only the browser operations required by this phase.
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.stripe_links from anon, authenticated;
revoke all on table public.tutors from anon, authenticated;
revoke all on table public.lesson_types from anon, authenticated;
revoke all on table public.availability_windows from anon, authenticated;
revoke all on table public.policy_versions from anon, authenticated;
revoke all on table public.bookings from anon, authenticated;
revoke all on table public.attendance_events from anon, authenticated;
revoke all on table public.consents from anon, authenticated;
revoke all on table public.ledger_entries from anon, authenticated;
revoke all on table public.stripe_events from anon, authenticated;

grant select on table public.profiles to anon, authenticated;
grant update (full_name, timezone) on table public.profiles to authenticated;

grant select on table public.tutors to anon, authenticated;
grant select on table public.lesson_types to anon, authenticated;

grant select on table public.availability_windows to anon, authenticated;
grant insert, update, delete on table public.availability_windows to authenticated;

grant select on table public.policy_versions to anon, authenticated;

grant select on table public.bookings to authenticated;
grant select on table public.attendance_events to authenticated;
grant select on table public.consents to authenticated;
grant select on table public.ledger_entries to authenticated;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile"
on public.profiles for select
to authenticated
using (id = (select auth.uid()));

drop policy if exists "read tutor profiles" on public.profiles;
create policy "read tutor profiles"
on public.profiles for select
to anon, authenticated
using (role = 'tutor');

drop policy if exists "tutors read their students" on public.profiles;
create policy "tutors read their students"
on public.profiles for select
to authenticated
using (
  exists (
    select 1
    from public.bookings b
    where b.student_id = profiles.id
      and b.tutor_id = (select auth.uid())
  )
);

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile"
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "tutors are public" on public.tutors;
create policy "tutors are public"
on public.tutors for select
to anon, authenticated
using (active);

drop policy if exists "lesson types are public" on public.lesson_types;
create policy "lesson types are public"
on public.lesson_types for select
to anon, authenticated
using (active);

drop policy if exists "availability is public" on public.availability_windows;
create policy "availability is public"
on public.availability_windows for select
to anon, authenticated
using (true);

drop policy if exists "tutors insert own availability" on public.availability_windows;
create policy "tutors insert own availability"
on public.availability_windows for insert
to authenticated
with check (tutor_id = (select auth.uid()));

drop policy if exists "tutors update own availability" on public.availability_windows;
create policy "tutors update own availability"
on public.availability_windows for update
to authenticated
using (tutor_id = (select auth.uid()))
with check (tutor_id = (select auth.uid()));

drop policy if exists "tutors delete own availability" on public.availability_windows;
create policy "tutors delete own availability"
on public.availability_windows for delete
to authenticated
using (tutor_id = (select auth.uid()));

drop policy if exists "policies are public" on public.policy_versions;
create policy "policies are public"
on public.policy_versions for select
to anon, authenticated
using (true);

drop policy if exists "participants read bookings" on public.bookings;
create policy "participants read bookings"
on public.bookings for select
to authenticated
using (
  student_id = (select auth.uid())
  or tutor_id = (select auth.uid())
);

drop policy if exists "participants read attendance" on public.attendance_events;
create policy "participants read attendance"
on public.attendance_events for select
to authenticated
using (
  exists (
    select 1
    from public.bookings b
    where b.id = booking_id
      and (
        b.student_id = (select auth.uid())
        or b.tutor_id = (select auth.uid())
      )
  )
);

drop policy if exists "read own consents" on public.consents;
create policy "read own consents"
on public.consents for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "participants read ledger" on public.ledger_entries;
create policy "participants read ledger"
on public.ledger_entries for select
to authenticated
using (
  exists (
    select 1
    from public.bookings b
    where b.id = booking_id
      and (
        b.student_id = (select auth.uid())
        or b.tutor_id = (select auth.uid())
      )
  )
);

-- stripe_links and stripe_events intentionally have no client grants or policies.
-- bookings, attendance_events, consents, and ledger_entries intentionally have
-- no client write grants or write policies. Money/evidence writes are server-only.
