-- pgTAP contract tests for the lesson-booking foundation migration.
-- Run in a local Supabase stack with: supabase test db

begin;

select plan(15);

select ok(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'profiles', 'stripe_links', 'tutors', 'lesson_types',
        'availability_windows', 'policy_versions', 'bookings',
        'attendance_events', 'consents', 'ledger_entries', 'stripe_events'
      )
      and not c.relrowsecurity
  ),
  'RLS is enabled on every exposed lesson-booking table'
);

select ok(
  not has_table_privilege('anon', 'public.bookings', 'insert')
  and not has_table_privilege('authenticated', 'public.bookings', 'insert')
  and not has_table_privilege('authenticated', 'public.bookings', 'update')
  and not has_table_privilege('authenticated', 'public.bookings', 'delete'),
  'browser roles cannot write bookings'
);

select ok(
  not has_table_privilege('anon', 'public.attendance_events', 'insert')
  and not has_table_privilege('authenticated', 'public.attendance_events', 'insert')
  and not has_table_privilege('authenticated', 'public.attendance_events', 'update')
  and not has_table_privilege('authenticated', 'public.attendance_events', 'delete'),
  'browser roles cannot write attendance evidence'
);

select ok(
  not has_table_privilege('anon', 'public.consents', 'insert')
  and not has_table_privilege('authenticated', 'public.consents', 'insert')
  and not has_table_privilege('authenticated', 'public.consents', 'update')
  and not has_table_privilege('authenticated', 'public.consents', 'delete'),
  'browser roles cannot write consent evidence'
);

select ok(
  not has_table_privilege('anon', 'public.ledger_entries', 'insert')
  and not has_table_privilege('authenticated', 'public.ledger_entries', 'insert')
  and not has_table_privilege('authenticated', 'public.ledger_entries', 'update')
  and not has_table_privilege('authenticated', 'public.ledger_entries', 'delete'),
  'browser roles cannot write the money ledger'
);

select ok(
  not has_table_privilege('anon', 'public.stripe_links', 'select')
  and not has_table_privilege('authenticated', 'public.stripe_links', 'select'),
  'Stripe customer/account identifiers are server-only'
);

select ok(
  not has_table_privilege('anon', 'public.stripe_events', 'select')
  and not has_table_privilege('authenticated', 'public.stripe_events', 'select'),
  'raw Stripe webhook records are server-only'
);

select ok(
  has_table_privilege('anon', 'public.lesson_types', 'select')
  and has_table_privilege('authenticated', 'public.lesson_types', 'select'),
  'lesson catalog is publicly readable'
);

select ok(
  has_table_privilege('anon', 'public.availability_windows', 'select')
  and has_table_privilege('authenticated', 'public.availability_windows', 'select'),
  'availability is publicly readable'
);

select ok(
  has_table_privilege('anon', 'public.policy_versions', 'select')
  and has_table_privilege('authenticated', 'public.policy_versions', 'select'),
  'published policy versions are publicly readable'
);

select ok(
  has_column_privilege('authenticated', 'public.profiles', 'full_name', 'update')
  and has_column_privilege('authenticated', 'public.profiles', 'timezone', 'update')
  and not has_column_privilege('authenticated', 'public.profiles', 'role', 'update'),
  'users can update profile presentation fields but cannot self-promote roles'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and conname = 'no_tutor_overlap'
      and contype = 'x'
  ),
  'database rejects overlapping tutor bookings'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and conname = 'no_student_overlap'
      and contype = 'x'
  ),
  'database rejects overlapping student bookings'
);

select ok(
  (
    select count(*)
    from pg_trigger
    where not tgisinternal
      and tgrelid in (
        'public.policy_versions'::regclass,
        'public.attendance_events'::regclass,
        'public.consents'::regclass,
        'public.ledger_entries'::regclass
      )
      and tgname in (
        'policy_versions_append_only',
        'attendance_append_only',
        'consents_append_only',
        'ledger_append_only'
      )
  ) = 4,
  'policy, attendance, consent, and ledger evidence are append-only'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where not tgisinternal
      and tgrelid = 'auth.users'::regclass
      and tgname = 'on_auth_user_created'
  ),
  'new Supabase Auth users receive a public profile'
);

select * from finish();
rollback;
