-- Phase 4C5AB1: stable <=63-byte Data API identifier for the service-only Phase AB dispatch preflight.
-- PostgreSQL truncates identifiers beyond NAMEDATALEN-1 (63 bytes in the managed project).
-- Keep the long historical Phase AB function as the implementation detail, but remove direct
-- service_role execution so external callers have exactly one deliberate stable RPC surface.

create or replace function public.service_prepare_booking_preview_requeue_dispatch(
  p_intent_id bigint,
  p_preflight_key text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.service_prepare_booking_preview_launch_blocker_requeue_dispatch_preflight(
    p_intent_id,
    p_preflight_key
  );
$$;

revoke all on function public.service_prepare_booking_preview_requeue_dispatch(bigint,text)
  from public, anon, authenticated, service_role;
grant execute on function public.service_prepare_booking_preview_requeue_dispatch(bigint,text)
  to service_role;

-- The legacy source identifier is 73 bytes and is stored by PostgreSQL under a truncated
-- catalog name. Keep it callable only by its owner so SQL already inside the database can
-- continue delegating safely while Data API/service callers use the stable alias above.
revoke execute on function public.service_prepare_booking_preview_launch_blocker_requeue_dispatch_preflight(bigint,text)
  from public, anon, authenticated, service_role;

comment on function public.service_prepare_booking_preview_requeue_dispatch(bigint,text) is
  'Stable service-only PREVIEW RPC alias for Phase AB no-send dispatch preflight. Delegates to the authoritative Phase AB implementation, pins search_path empty, and grants no dispatch/provider/payment/launch authority.';
