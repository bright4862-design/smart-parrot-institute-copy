-- Phase 4C5AB1 stable Data API RPC identifier boundary. Ephemeral CI only.
-- PostgreSQL truncates identifiers longer than 63 bytes. Keep the externally invoked
-- service RPC intentionally short and prevent service_role from calling the legacy
-- truncated Phase AB identifier directly.
begin;

do $$
declare
  stable_rpc constant text := 'service_prepare_booking_preview_requeue_dispatch';
  forwarded_invalid_intent boolean := false;
begin
  if pg_catalog.octet_length(stable_rpc) > 63 then
    raise exception 'stable Phase AB dispatch RPC exceeds PostgreSQL identifier limit';
  end if;

  if pg_catalog.to_regprocedure('public.service_prepare_booking_preview_requeue_dispatch(bigint,text)') is null then
    raise exception 'stable Phase AB dispatch RPC is missing';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.service_prepare_booking_preview_requeue_dispatch(bigint,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated unexpectedly has stable Phase AB dispatch RPC access';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.service_prepare_booking_preview_requeue_dispatch(bigint,text)',
    'EXECUTE'
  ) then
    raise exception 'service_role is missing stable Phase AB dispatch RPC access';
  end if;

  if has_function_privilege(
    'service_role',
    'public.service_prepare_booking_preview_launch_blocker_requeue_dispatch_preflight(bigint,text)',
    'EXECUTE'
  ) then
    raise exception 'service_role can still execute the legacy overlong Phase AB dispatch RPC';
  end if;

  if coalesce((
    select p.prosecdef
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = stable_rpc
      and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_intent_id bigint, p_preflight_key text'
  ), false) is distinct from true then
    raise exception 'stable Phase AB dispatch RPC must remain SECURITY DEFINER';
  end if;

  if coalesce((
    select p.proconfig @> array['search_path=']::text[]
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = stable_rpc
      and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_intent_id bigint, p_preflight_key text'
  ), false) is distinct from true then
    raise exception 'stable Phase AB dispatch RPC must pin search_path empty';
  end if;

  begin
    perform public.service_prepare_booking_preview_requeue_dispatch(0, pg_catalog.repeat('a', 32));
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'invalid_preview_requeue_dispatch_preflight_intent_id' then
        raise;
      end if;
      forwarded_invalid_intent := true;
  end;

  if not forwarded_invalid_intent then
    raise exception 'stable Phase AB dispatch RPC did not forward to authoritative Phase AB validation';
  end if;
end $$;

rollback;
