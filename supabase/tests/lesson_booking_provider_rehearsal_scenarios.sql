-- Phase 4C5A preview rehearsal registry scenarios. Ephemeral CI only.
begin;

insert into auth.users(id,raw_user_meta_data) values
  ('75000000-0000-0000-0000-000000000001','{"full_name":"Phase4C5 Admin"}'),
  ('75000000-0000-0000-0000-000000000002','{"full_name":"Phase4C5 Outsider"}');
update public.profiles set role='admin' where id='75000000-0000-0000-0000-000000000001';

create or replace function auth.uid() returns uuid language sql stable as $$ select '75000000-0000-0000-0000-000000000001'::uuid $$;

do $$ declare r jsonb; begin
  select public.admin_ingest_booking_provider_rehearsal(
    '75000000-0000-0000-0000-000000000101',
    'smart_parrot_provider_preview_e2e_v1',
    '2026-09-20 15:00+00','2026-09-20 15:02+00',
    true,true,true,
    true,true,true,true,
    true,
    repeat('a',64),
    null
  ) into r;
  if r->>'status'<>'passed' or (r->>'cleanup_complete')::boolean is not true or (r->>'replay')::boolean then
    raise exception 'Passed rehearsal ingestion failed: %',r;
  end if;
end $$;

do $$ declare r jsonb; begin
  select public.admin_ingest_booking_provider_rehearsal(
    '75000000-0000-0000-0000-000000000101',
    'smart_parrot_provider_preview_e2e_v1',
    '2026-09-20 15:00+00','2026-09-20 15:02+00',
    true,true,true,
    true,true,true,true,
    true,
    repeat('a',64),
    null
  ) into r;
  if (r->>'replay')::boolean is not true then raise exception 'Identical rehearsal replay was not idempotent: %',r; end if;
end $$;

do $$ declare blocked boolean:=false; begin
  begin
    perform public.admin_ingest_booking_provider_rehearsal(
      '75000000-0000-0000-0000-000000000101',
      'smart_parrot_provider_preview_e2e_v1',
      '2026-09-20 15:00+00','2026-09-20 15:02+00',
      true,true,true,
      true,true,true,true,
      true,
      repeat('b',64),
      null
    );
  exception when unique_violation then blocked:=true; end;
  if not blocked then raise exception 'Conflicting rehearsal replay unexpectedly succeeded'; end if;
end $$;

do $$ declare r jsonb; begin
  select public.admin_ingest_booking_provider_rehearsal(
    '75000000-0000-0000-0000-000000000102',
    'smart_parrot_provider_preview_e2e_v1',
    '2026-09-20 15:10+00','2026-09-20 15:12+00',
    true,true,true,
    true,false,true,true,
    false,
    repeat('c',64),
    'cleanup_incomplete'
  ) into r;
  if r->>'status'<>'cleanup_incomplete' or (r->>'cleanup_complete')::boolean is not false then
    raise exception 'Incomplete cleanup status mismatch: %',r;
  end if;
end $$;

do $$ declare n int; h jsonb; begin
  select count(*) into n from public.admin_review_queue(100,'2026-09-20 15:15+00') q
    where q.source='provider_rehearsal_cleanup' and q.booking_id is null and q.category='launch_rehearsal';
  if n<>1 then raise exception 'Cleanup-incomplete rehearsal missing from admin queue: %',n; end if;
  select public.admin_booking_launch_health('2026-09-20 15:15+00') into h;
  if h->>'schema_version'<>'smart_parrot_booking_launch_health_v3'
     or (h->'counts'->>'provider_rehearsal_missing')::int<>0
     or (h->'counts'->>'provider_rehearsal_latest_failed')::int<>0
     or (h->'counts'->>'unreconciled_provider_cleanup_failures')::int<>1 then
    raise exception 'Phase4C5 launch-health rehearsal counts mismatch: %',h;
  end if;
  if h::text like '%75000000-0000-0000-0000-000000000102%' or h::text like '%aaaaaaaa%' then
    raise exception 'Launch-health leaked rehearsal identifiers/hash: %',h;
  end if;
end $$;

do $$ declare r jsonb; begin
  select public.admin_reconcile_booking_provider_rehearsal_cleanup(
    '75000000-0000-0000-0000-000000000102',
    'manual_cleanup_verified',
    'ops-review-2026-09-20-001'
  ) into r;
  if r->>'status'<>'reconciled' or (r->>'replay')::boolean then raise exception 'Cleanup reconciliation failed: %',r; end if;
  select public.admin_reconcile_booking_provider_rehearsal_cleanup(
    '75000000-0000-0000-0000-000000000102',
    'manual_cleanup_verified',
    'ops-review-2026-09-20-001'
  ) into r;
  if (r->>'replay')::boolean is not true then raise exception 'Cleanup reconciliation replay was not idempotent: %',r; end if;
end $$;

do $$ declare n int; h jsonb; begin
  select count(*) into n from public.admin_review_queue(100,'2026-09-20 15:20+00') q where q.source='provider_rehearsal_cleanup';
  if n<>0 then raise exception 'Reconciled cleanup remained in admin queue: %',n; end if;
  select public.admin_booking_launch_health('2026-09-20 15:20+00') into h;
  if (h->'counts'->>'unreconciled_provider_cleanup_failures')::int<>0 then
    raise exception 'Reconciled cleanup remained in launch health: %',h;
  end if;
end $$;

do $$ declare blocked boolean:=false; begin
  begin
    update public.lesson_booking_provider_rehearsals set status='passed'
      where run_id='75000000-0000-0000-0000-000000000102';
  exception when others then blocked:=true; end;
  if not blocked then raise exception 'Provider rehearsal evidence was mutable'; end if;
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$ select '75000000-0000-0000-0000-000000000002'::uuid $$;

do $$ declare blocked boolean:=false; begin
  begin
    perform public.admin_ingest_booking_provider_rehearsal(
      '75000000-0000-0000-0000-000000000103',
      'smart_parrot_provider_preview_e2e_v1',
      '2026-09-20 16:00+00','2026-09-20 16:01+00',
      true,true,true,false,false,false,false,true,repeat('d',64),null
    );
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Non-admin rehearsal ingest unexpectedly succeeded'; end if;
end $$;

rollback;
