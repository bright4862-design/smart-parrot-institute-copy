-- Consolidate profiles SELECT RLS policies without changing row visibility.
-- Supabase's performance advisor reports multiple permissive SELECT policies for
-- authenticated users on public.profiles. PostgreSQL ORs permissive policies,
-- so keep the same union of access rules in one authenticated policy while
-- retaining a separate anon-only public-tutor policy.

begin;

drop policy if exists "read own profile" on public.profiles;
drop policy if exists "read tutor profiles" on public.profiles;
drop policy if exists "tutors read their students" on public.profiles;
drop policy if exists "anon read tutor profiles" on public.profiles;
drop policy if exists "authenticated read permitted profiles" on public.profiles;

create policy "anon read tutor profiles"
on public.profiles
for select
to anon
using (role = 'tutor');

create policy "authenticated read permitted profiles"
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or role = 'tutor'
  or exists (
    select 1
    from public.bookings b
    where b.student_id = profiles.id
      and b.tutor_id = (select auth.uid())
  )
);

-- Migration-time invariant checks: keep one SELECT policy per browser role and
-- preserve the existing least-privilege update policy separately.
do $$
declare
  authenticated_select_policies integer;
  anon_select_policies integer;
  update_policies integer;
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

  select count(*)
    into update_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'profiles'
    and cmd = 'UPDATE'
    and 'authenticated' = any(roles);

  if authenticated_select_policies <> 1 then
    raise exception 'profiles authenticated SELECT policy count must be 1, got %', authenticated_select_policies;
  end if;

  if anon_select_policies <> 1 then
    raise exception 'profiles anon SELECT policy count must be 1, got %', anon_select_policies;
  end if;

  if update_policies <> 1 then
    raise exception 'profiles authenticated UPDATE policy count changed unexpectedly: %', update_policies;
  end if;
end $$;

commit;
