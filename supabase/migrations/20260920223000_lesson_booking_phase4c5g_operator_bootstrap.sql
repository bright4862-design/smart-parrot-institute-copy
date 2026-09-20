-- Smart Parrot Institute lesson-booking Phase 4C5G
-- Read-only operator bootstrap primitives for durable preview-run lookup and
-- minimized proof that both Stripe webhook signing boundaries have accepted a
-- recent TEST-mode delivery. These functions never move money or mutate provider state.

create or replace function public.admin_get_booking_full_preview_run(
  p_run_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.lesson_booking_full_preview_runs%rowtype;
begin
  perform private.smart_parrot_require_admin(uid);
  if p_run_id is null then
    raise exception 'invalid_full_preview_run_lookup' using errcode = '22023';
  end if;

  select * into r
  from public.lesson_booking_full_preview_runs
  where run_id = p_run_id;

  if not found then
    raise exception 'full_preview_run_not_found' using errcode = 'P0002';
  end if;

  return private.smart_parrot_full_preview_run_payload(r, true);
end;
$$;

revoke all on function public.admin_get_booking_full_preview_run(uuid) from public, anon;
grant execute on function public.admin_get_booking_full_preview_run(uuid) to authenticated;

comment on function public.admin_get_booking_full_preview_run(uuid) is
  'Admin-only read-only minimized full-preview run lookup. Does not refresh state, advance time, or create checkpoints.';

create or replace function public.admin_booking_webhook_readiness_proof(
  p_now timestamptz default clock_timestamp()
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  checkout_received_at timestamptz;
  dispute_received_at timestamptz;
  checkout_ready boolean := false;
  dispute_ready boolean := false;
begin
  perform private.smart_parrot_require_admin(uid);
  if p_now is null then
    raise exception 'invalid_webhook_readiness_proof_request' using errcode = '22023';
  end if;

  select max(e.received_at) into checkout_received_at
  from public.stripe_events e
  where e.received_at <= p_now + interval '5 minutes';

  select max(e.received_at) into dispute_received_at
  from public.stripe_dispute_events e
  where e.received_at <= p_now + interval '5 minutes';

  checkout_ready := checkout_received_at is not null
    and checkout_received_at >= p_now - interval '7 days';
  dispute_ready := dispute_received_at is not null
    and dispute_received_at >= p_now - interval '7 days';

  return jsonb_build_object(
    'schema_version', 'smart_parrot_booking_webhook_readiness_proof_v1',
    'generated_at', p_now,
    'status', case when checkout_ready and dispute_ready then 'ready' else 'blocked' end,
    'checks', jsonb_build_object(
      'stripe_checkout_signed_test_delivery', jsonb_build_object(
        'ready', checkout_ready,
        'status', case
          when checkout_received_at is null then 'verified_test_delivery_missing'
          when not checkout_ready then 'verified_test_delivery_stale'
          else 'ready'
        end,
        'last_verified_at', checkout_received_at
      ),
      'stripe_dispute_signed_test_delivery', jsonb_build_object(
        'ready', dispute_ready,
        'status', case
          when dispute_received_at is null then 'verified_test_delivery_missing'
          when not dispute_ready then 'verified_test_delivery_stale'
          else 'ready'
        end,
        'last_verified_at', dispute_received_at
      )
    ),
    'blockers', to_jsonb(array_remove(array[
      case when not checkout_ready then 'stripe_checkout_signed_test_delivery' end,
      case when not dispute_ready then 'stripe_dispute_signed_test_delivery' end
    ], null)),
    'boundaries', jsonb_build_array(
      'The Stripe checkout event table is populated only after Stripe-Signature verification and TEST-mode rejection checks in the checkout webhook.',
      'The Stripe dispute event table is populated only after separate dispute-endpoint signature verification, TEST-mode rejection checks, and supported dispute validation.',
      'Only recent verification timestamps are returned; provider event IDs, dispute IDs, payloads, customer data, and webhook secrets are never returned.',
      'Daily signed endpoint verification is proven separately by an ACTIVE preview webhook identity plus the server-side HMAC verifier; this RPC performs no Daily provider call.',
      'This RPC is read-only and grants no authority to create bookings, move money, mutate providers, deploy, publish, or erase evidence.'
    )
  );
end;
$$;

revoke all on function public.admin_booking_webhook_readiness_proof(timestamptz) from public, anon;
grant execute on function public.admin_booking_webhook_readiness_proof(timestamptz) to authenticated;

comment on function public.admin_booking_webhook_readiness_proof(timestamptz) is
  'Admin-only minimized recent Stripe webhook signature-evidence proof for preview operator readiness.';
