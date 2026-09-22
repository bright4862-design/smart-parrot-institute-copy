-- Profiles SELECT RLS consolidation regression.
-- This is intended for ephemeral/local CI or an explicit transaction-wrapped preview check.
-- It proves the linter hardening preserves the exact browser-visible row semantics.

begin;

insert into public.policy_versions (
  id,
  config,
  terms_markdown,
  terms_sha256,
  published_at
) values (
  'ci-profiles-policy-2026-09-22',
  '{}'::jsonb,
  'CI profiles policy terms',
  'ci-profiles-policy-sha',
  '2026-09-22 00:00+00'
);

insert into auth.users (id, raw_user_meta_data) values
  ('7c000000-0000-0000-0000-000000000001', '{"full_name":"Profiles Student"}'),
  ('7c000000-0000-0000-0000-000000000002', '{"full_name":"Profiles Tutor"}'),
  ('7c000000-0000-0000-0000-000000000003', '{"full_name":"Profiles Admin"}'),
  ('7c000000-0000-0000-0000-000000000004', '{"full_name":"Profiles Outsider"}');

update public.profiles
set role = 'tutor'
where id = '7c000000-0000-0000-0000-000000000002';

update public.profiles
set role = 'admin'
where id = '7c000000-0000-0000-0000-000000000003';

insert into public.tutors (id, bio)
values ('7c000000-0000-0000-0000-000000000002', 'Profiles policy tutor');

insert into public.lesson_types (
  id,
  tutor_id,
  name,
  duration_minutes,
  on_time_price_cents,
  currency
) values (
  '7c000000-0000-0000-0000-000000000010',
  '7c000000-0000-0000-0000-000000000002',
  'Profiles policy lesson',
  45,
  3000,
  'eur'
);

insert into public.bookings (
  id,
  student_id,
  tutor_id,
  lesson_type_id,
  policy_version_id,
  starts_at,
  ends_at,
  status,
  currency,
  on_time_price_cents,
  max_charge_cents,
  hold_strategy,
  created_at
) values (
  '7c100000-0000-0000-0000-000000000001',
  '7c000000-0000-0000-0000-000000000001',
  '7c000000-0000-0000-0000-000000000002',
  '7c000000-0000-0000-0000-000000000010',
  'ci-profiles-policy-2026-09-22',
  '2026-10-01 10:00+00',
  '2026-10-01 10:45+00',
  'pending_checkout',
  'eur',
  3000,
  3600,
  'at_checkout',
  '2026-09-22 12:00+00'
);

do $$
declare
  authenticated_select_policies integer;
  anon_select_policies integer;
begin
  select count(*)
    into authenticated_select_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'profiles'
    and cmd = 'SELECT'
    and 'authenticated' = any(roles);

  select count(*)
    into anon_select_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'profiles'
    and cmd = 'SELECT'
    and 'anon' = any(roles);

  if authenticated_select_policies <> 1 then
    raise exception 'Expected exactly one authenticated profiles SELECT policy, got %', authenticated_select_policies;
  end if;

  if anon_select_policies <> 1 then
    raise exception 'Expected exactly one anon profiles SELECT policy, got %', anon_select_policies;
  end if;
end $$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select '7c000000-0000-0000-0000-000000000001'::uuid;
$$;

set local role authenticated;
do $$
declare
  visible_count integer;
  hidden_count integer;
begin
  select count(*) into visible_count
  from public.profiles
  where id in (
    '7c000000-0000-0000-0000-000000000001'::uuid,
    '7c000000-0000-0000-0000-000000000002'::uuid,
    '7c000000-0000-0000-0000-000000000003'::uuid,
    '7c000000-0000-0000-0000-000000000004'::uuid
  );

  select count(*) into hidden_count
  from public.profiles
  where id in (
    '7c000000-0000-0000-0000-000000000003'::uuid,
    '7c000000-0000-0000-0000-000000000004'::uuid
  );

  if visible_count <> 2 or hidden_count <> 0 then
    raise exception 'Student visibility changed: visible=% hidden=%', visible_count, hidden_count;
  end if;
end $$;
reset role;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select '7c000000-0000-0000-0000-000000000002'::uuid;
$$;

set local role authenticated;
do $$
declare
  visible_count integer;
  student_visible integer;
  admin_or_outsider_visible integer;
begin
  select count(*) into visible_count
  from public.profiles
  where id in (
    '7c000000-0000-0000-0000-000000000001'::uuid,
    '7c000000-0000-0000-0000-000000000002'::uuid,
    '7c000000-0000-0000-0000-000000000003'::uuid,
    '7c000000-0000-0000-0000-000000000004'::uuid
  );

  select count(*) into student_visible
  from public.profiles
  where id = '7c000000-0000-0000-0000-000000000001'::uuid;

  select count(*) into admin_or_outsider_visible
  from public.profiles
  where id in (
    '7c000000-0000-0000-0000-000000000003'::uuid,
    '7c000000-0000-0000-0000-000000000004'::uuid
  );

  if visible_count <> 2 or student_visible <> 1 or admin_or_outsider_visible <> 0 then
    raise exception 'Tutor visibility changed: visible=% student=% hidden=%', visible_count, student_visible, admin_or_outsider_visible;
  end if;
end $$;
reset role;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select '7c000000-0000-0000-0000-000000000004'::uuid;
$$;

set local role authenticated;
do $$
declare
  visible_count integer;
  student_or_admin_visible integer;
begin
  select count(*) into visible_count
  from public.profiles
  where id in (
    '7c000000-0000-0000-0000-000000000001'::uuid,
    '7c000000-0000-0000-0000-000000000002'::uuid,
    '7c000000-0000-0000-0000-000000000003'::uuid,
    '7c000000-0000-0000-0000-000000000004'::uuid
  );

  select count(*) into student_or_admin_visible
  from public.profiles
  where id in (
    '7c000000-0000-0000-0000-000000000001'::uuid,
    '7c000000-0000-0000-0000-000000000003'::uuid
  );

  if visible_count <> 2 or student_or_admin_visible <> 0 then
    raise exception 'Unrelated authenticated visibility changed: visible=% hidden=%', visible_count, student_or_admin_visible;
  end if;
end $$;
reset role;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select null::uuid;
$$;

set local role anon;
do $$
declare
  visible_count integer;
  non_tutor_visible integer;
begin
  select count(*) into visible_count
  from public.profiles
  where id in (
    '7c000000-0000-0000-0000-000000000001'::uuid,
    '7c000000-0000-0000-0000-000000000002'::uuid,
    '7c000000-0000-0000-0000-000000000003'::uuid,
    '7c000000-0000-0000-0000-000000000004'::uuid
  );

  select count(*) into non_tutor_visible
  from public.profiles
  where id in (
    '7c000000-0000-0000-0000-000000000001'::uuid,
    '7c000000-0000-0000-0000-000000000003'::uuid,
    '7c000000-0000-0000-0000-000000000004'::uuid
  );

  if visible_count <> 1 or non_tutor_visible <> 0 then
    raise exception 'Anonymous tutor-only visibility changed: visible=% non_tutor=%', visible_count, non_tutor_visible;
  end if;
end $$;
reset role;

rollback;
