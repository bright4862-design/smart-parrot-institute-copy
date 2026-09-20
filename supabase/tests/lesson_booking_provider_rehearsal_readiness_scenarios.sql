-- Phase 4C5B1 provider rehearsal history/readiness scenarios. Ephemeral CI only.
begin;

insert into auth.users(id,raw_user_meta_data) values
  ('76000000-0000-0000-0000-000000000001','{"full_name":"Phase4C5B Admin"}'),
  ('76000000-0000-0000-0000-000000000002','{"full_name":"Phase4C5B Outsider"}');
update public.profiles set role='admin' where id='76000000-0000-0000-0000-000000000001';

create or replace function auth.uid() returns uuid language sql stable as $$ select '76000000-0000-0000-0000-000000000001'::uuid $$;

do $$ declare r jsonb; begin
  select public.admin_provider_rehearsal_readiness('2026-09-20 18:00+00') into r;
  if (r->>'ready')::boolean or not (r->'blockers' ? 'provider_rehearsal_missing') then
    raise exception 'Missing rehearsal did not fail closed: %',r;
  end if;
end $$;

-- A successful rehearsal older than seven days is not launch-ready.
select public.admin_ingest_booking_provider_rehearsal(
  '76000000-0000-0000-0000-000000000101','smart_parrot_provider_preview_e2e_v1',
  '2026-09-12 17:00+00','2026-09-12 17:02+00',true,true,true,
  true,true,true,true,true,repeat('a',64),null
);

do $$ declare r jsonb; begin
  select public.admin_provider_rehearsal_readiness('2026-09-20 18:00+00') into r;
  if (r->>'ready')::boolean or not (r->'blockers' ? 'provider_rehearsal_stale') then
    raise exception 'Stale rehearsal unexpectedly ready: %',r;
  end if;
end $$;

-- A newer failed rehearsal blocks even when an older success exists.
select public.admin_ingest_booking_provider_rehearsal(
  '76000000-0000-0000-0000-000000000102','smart_parrot_provider_preview_e2e_v1',
  '2026-09-20 17:00+00','2026-09-20 17:02+00',true,false,true,
  false,false,false,false,true,repeat('b',64),'stripe_account_mismatch'
);

do $$ declare r jsonb; begin
  select public.admin_provider_rehearsal_readiness('2026-09-20 18:00+00') into r;
  if (r->>'ready')::boolean or not (r->'blockers' ? 'provider_rehearsal_latest_not_passed') then
    raise exception 'Latest failed rehearsal unexpectedly ready: %',r;
  end if;
end $$;

-- A fresh latest pass clears the stale/failed gate.
select public.admin_ingest_booking_provider_rehearsal(
  '76000000-0000-0000-0000-000000000103','smart_parrot_provider_preview_e2e_v1',
  '2026-09-20 17:20+00','2026-09-20 17:22+00',true,true,true,
  true,true,true,true,true,repeat('c',64),null
);

do $$ declare r jsonb; begin
  select public.admin_provider_rehearsal_readiness('2026-09-20 18:00+00') into r;
  if not (r->>'ready')::boolean or r->>'status'<>'ready' or jsonb_array_length(r->'blockers')<>0 then
    raise exception 'Fresh successful rehearsal was not ready: %',r;
  end if;
end $$;

-- An incomplete cleanup blocks readiness until reconciled AND a later pass proves providers clean again.
select public.admin_ingest_booking_provider_rehearsal(
  '76000000-0000-0000-0000-000000000104','smart_parrot_provider_preview_e2e_v1',
  '2026-09-20 17:30+00','2026-09-20 17:32+00',true,true,true,
  true,false,true,true,false,repeat('d',64),'cleanup_incomplete'
);

do $$ declare r jsonb; begin
  select public.admin_provider_rehearsal_readiness('2026-09-20 18:00+00') into r;
  if (r->>'ready')::boolean
     or not (r->'blockers' ? 'provider_rehearsal_latest_not_passed')
     or not (r->'blockers' ? 'provider_cleanup_unresolved')
     or (r->>'unresolved_cleanup_failures')::int<>1 then
    raise exception 'Unresolved cleanup did not block readiness: %',r;
  end if;
end $$;

select public.admin_reconcile_booking_provider_rehearsal_cleanup(
  '76000000-0000-0000-0000-000000000104','manual_cleanup_verified','ops-review-2026-09-20-4c5b'
);

do $$ declare r jsonb; begin
  select public.admin_provider_rehearsal_readiness('2026-09-20 18:00+00') into r;
  if (r->>'ready')::boolean
     or (r->>'unresolved_cleanup_failures')::int<>0
     or not (r->'blockers' ? 'provider_rehearsal_latest_not_passed') then
    raise exception 'Reconciliation should clear cleanup count but still require a later pass: %',r;
  end if;
end $$;

select public.admin_ingest_booking_provider_rehearsal(
  '76000000-0000-0000-0000-000000000105','smart_parrot_provider_preview_e2e_v1',
  '2026-09-20 17:40+00','2026-09-20 17:42+00',true,true,true,
  true,true,true,true,true,repeat('e',64),null
);

do $$ declare r jsonb; h jsonb; n int; begin
  select public.admin_provider_rehearsal_readiness('2026-09-20 18:00+00') into r;
  if not (r->>'ready')::boolean or (r->>'unresolved_cleanup_failures')::int<>0 then
    raise exception 'Post-reconciliation passing rehearsal was not ready: %',r;
  end if;

  select count(*) into n from public.admin_provider_rehearsal_history(20,'2026-09-20 18:00+00');
  if n<>5 then raise exception 'Unexpected rehearsal history count: %',n; end if;

  select jsonb_agg(to_jsonb(x)) into h from public.admin_provider_rehearsal_history(20,'2026-09-20 18:00+00') x;
  if h::text like '%evidence_sha256%'
     or h::text like '%'||repeat('e',64)||'%'
     or h::text like '%stripe_customer%'
     or h::text like '%daily_room%'
     or h::text like '%webhook%' then
    raise exception 'Admin rehearsal history leaked forbidden provider/evidence data: %',h;
  end if;
  if not exists (
    select 1 from public.admin_provider_rehearsal_history(20,'2026-09-20 18:00+00') x
    where x.run_id='76000000-0000-0000-0000-000000000104' and x.reconciled
  ) then raise exception 'Reconciled cleanup not visible as minimized operator state'; end if;
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$ select '76000000-0000-0000-0000-000000000002'::uuid $$;

do $$ declare blocked boolean:=false; begin
  begin perform public.admin_provider_rehearsal_readiness('2026-09-20 18:00+00');
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Non-admin rehearsal readiness unexpectedly succeeded'; end if;
end $$;

do $$ declare blocked boolean:=false; begin
  begin perform * from public.admin_provider_rehearsal_history(20,'2026-09-20 18:00+00');
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Non-admin rehearsal history unexpectedly succeeded'; end if;
end $$;

rollback;
