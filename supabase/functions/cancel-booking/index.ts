import Stripe from 'npm:stripe@^22';
import { withSupabase } from 'npm:@supabase/server@^1';
import { getStripe } from '../_shared/stripe.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AdminClient = any;
type CancellationClaim = {
  booking_id: string;
  request_id: string;
  status: string;
  kind: 'cancel' | 'withdrawal';
  actor_role: 'student' | 'tutor';
  requested_at: string;
  outcome: string;
  amount_cents: number;
  payment_action: 'none' | 'capture' | 'release';
  payment_intent_id: string | null;
  max_charge_cents: number;
  currency: string;
  cancellation_attempt: number;
  idempotent: boolean;
};

function firstForwardedIp(req: Request) {
  const candidate = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  if (!candidate || candidate.length > 64) return null;
  return candidate;
}

function machineErrorCode(err: any) {
  return String(err?.code ?? err?.raw?.code ?? err?.message ?? 'cancellation_failed')
    .slice(0, 120);
}

function responseError(error: string, status: number) {
  return Response.json({ error }, { status });
}

function mapPrepareError(message: string) {
  switch (message) {
    case 'booking_not_found':
      return { status: 404, error: 'booking_not_found' };
    case 'withdrawal_student_only':
      return { status: 403, error: message };
    case 'invalid_cancellation_request':
    case 'invalid_cancellation_policy':
    case 'invalid_withdrawal_policy':
      return { status: 422, error: message };
    case 'booking_already_cancelled':
    case 'cancellation_already_requested':
    case 'booking_not_cancellable':
    case 'too_late_to_cancel':
    case 'withdrawal_not_enabled_for_policy':
    case 'withdrawal_window_expired':
    case 'cancellation_payment_not_ready':
    case 'cancellation_payment_state_sync_required':
      return { status: 409, error: message };
    case 'booking_policy_not_found':
      return { status: 503, error: 'booking_temporarily_unavailable' };
    default:
      return { status: 500, error: 'cancellation_prepare_failed' };
  }
}

async function synchronizeOpenCheckoutBeforeCancellation(
  admin: AdminClient,
  actorId: string,
  bookingId: string,
) {
  const { data: booking, error } = await admin
    .from('bookings')
    .select('id, student_id, tutor_id, status, stripe_checkout_session_id, hold_recovery_checkout_session_id')
    .eq('id', bookingId)
    .maybeSingle();

  if (error) throw error;
  if (!booking || (booking.student_id !== actorId && booking.tutor_id !== actorId)) {
    throw new Error('booking_not_found');
  }

  const checkoutSessionId = booking.status === 'pending_checkout'
    ? booking.stripe_checkout_session_id
    : booking.status === 'hold_failed'
      ? booking.hold_recovery_checkout_session_id
      : null;

  if (!checkoutSessionId) return;

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
  if (session.livemode) throw new Error('live_stripe_object_disabled');

  if (session.status === 'complete') {
    // The signed Stripe webhook owns the provider -> database transition.
    // Never freeze a cancellation amount against stale payment state.
    throw new Error('checkout_completion_pending');
  }

  if (session.status === 'open') {
    const expired = await stripe.checkout.sessions.expire(session.id);
    if (expired.livemode) throw new Error('live_stripe_object_disabled');
    if (expired.status !== 'expired') throw new Error('checkout_expire_failed');
  }
}

async function markCancellationFailed(
  admin: AdminClient,
  claim: CancellationClaim,
  code: string,
) {
  const { error } = await admin.rpc('mark_booking_cancellation_failed', {
    p_booking_id: claim.booking_id,
    p_cancellation_attempt: claim.cancellation_attempt,
    p_error_code: code,
  });
  if (error) {
    console.error('cancellation_failure_record_failed', claim.booking_id, error.message);
  }
}

function assertIntentIntegrity(intent: Stripe.PaymentIntent, claim: CancellationClaim) {
  if (intent.livemode) throw new Error('live_stripe_object_disabled');
  if (!claim.payment_intent_id || intent.id !== claim.payment_intent_id) {
    throw new Error('cancellation_payment_intent_mismatch');
  }
  if (intent.amount !== claim.max_charge_cents) {
    throw new Error('cancellation_authorized_amount_mismatch');
  }
  if (intent.currency !== String(claim.currency).toLowerCase()) {
    throw new Error('cancellation_currency_mismatch');
  }
  if (intent.metadata?.booking_id !== claim.booking_id) {
    throw new Error('cancellation_booking_metadata_mismatch');
  }
}

async function applyStripeCancellation(
  stripe: Stripe,
  claim: CancellationClaim,
) {
  if (!claim.payment_intent_id) {
    throw new Error('cancellation_payment_intent_missing');
  }

  let intent = await stripe.paymentIntents.retrieve(claim.payment_intent_id);
  assertIntentIntegrity(intent, claim);

  if (claim.payment_action === 'release') {
    if (intent.status === 'canceled') {
      return { capturedCents: 0, releasedCents: claim.max_charge_cents };
    }
    if (intent.status === 'succeeded') {
      throw new Error('cancellation_release_after_capture_forbidden');
    }
    if (intent.status !== 'requires_capture') {
      throw new Error(`cancellation_payment_intent_not_releasable:${intent.status}`);
    }

    intent = await stripe.paymentIntents.cancel(
      intent.id,
      {},
      { idempotencyKey: `smart-parrot-cancellation-release-${claim.booking_id}` },
    );
    assertIntentIntegrity(intent, claim);

    if (intent.status !== 'canceled') {
      throw new Error(`cancellation_release_failed:${intent.status}`);
    }

    return { capturedCents: 0, releasedCents: claim.max_charge_cents };
  }

  const amountCents = Number(claim.amount_cents);
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > claim.max_charge_cents) {
    throw new Error('invalid_cancellation_capture_amount');
  }

  if (intent.status === 'succeeded') {
    if (intent.amount_received !== amountCents) {
      throw new Error('cancellation_captured_amount_mismatch');
    }
    return {
      capturedCents: amountCents,
      releasedCents: claim.max_charge_cents - amountCents,
    };
  }

  if (intent.status !== 'requires_capture') {
    throw new Error(`cancellation_payment_intent_not_capturable:${intent.status}`);
  }
  if (intent.amount_capturable < amountCents) {
    throw new Error('cancellation_amount_capturable_below_policy_amount');
  }

  intent = await stripe.paymentIntents.capture(
    intent.id,
    {
      amount_to_capture: amountCents,
      final_capture: true,
    },
    { idempotencyKey: `smart-parrot-cancellation-capture-${claim.booking_id}` },
  );
  assertIntentIntegrity(intent, claim);

  if (intent.status !== 'succeeded' || intent.amount_received !== amountCents) {
    throw new Error(`cancellation_capture_failed:${intent.status}`);
  }

  return {
    capturedCents: amountCents,
    releasedCents: claim.max_charge_cents - amountCents,
  };
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') {
      return responseError('method_not_allowed', 405);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return responseError('invalid_json', 400);
    }

    const bookingId = String(body.booking_id ?? '').trim();
    const kind = String(body.kind ?? 'cancel').trim();
    if (!UUID_RE.test(bookingId) || !['cancel', 'withdrawal'].includes(kind)) {
      return responseError('invalid_cancellation_request', 422);
    }

    const actorId = ctx.userClaims?.id;
    if (!actorId || !UUID_RE.test(actorId)) {
      return responseError('authenticated_user_required', 401);
    }

    try {
      await synchronizeOpenCheckoutBeforeCancellation(
        ctx.supabaseAdmin,
        actorId,
        bookingId,
      );
    } catch (err) {
      const code = machineErrorCode(err);
      if (code === 'booking_not_found') return responseError('booking_not_found', 404);
      if (code === 'checkout_completion_pending') {
        return responseError('booking_state_changing_retry', 409);
      }
      if (code === 'stripe_test_configuration_required') {
        return responseError('payment_temporarily_unavailable', 503);
      }
      if (code === 'live_stripe_object_disabled') {
        return responseError('payment_safety_check_failed', 503);
      }
      console.error('cancellation_checkout_sync_failed', bookingId, code);
      return responseError('cancellation_checkout_sync_failed', 502);
    }

    const { data: prepared, error: prepareError } = await ctx.supabaseAdmin.rpc(
      'prepare_booking_cancellation',
      {
        p_actor_id: actorId,
        p_booking_id: bookingId,
        p_kind: kind,
        p_ip: firstForwardedIp(req),
        p_user_agent: req.headers.get('user-agent')?.slice(0, 1000) ?? null,
      },
    );

    if (prepareError) {
      const mapped = mapPrepareError(prepareError.message);
      return responseError(mapped.error, mapped.status);
    }

    if (!prepared || typeof prepared !== 'object') {
      return responseError('cancellation_prepare_failed', 500);
    }

    const claim = prepared as CancellationClaim;
    if (claim.status === 'cancelled') {
      return Response.json({ cancellation: claim }, { status: 200 });
    }

    try {
      let stripeResult = { capturedCents: 0, releasedCents: 0 };

      if (claim.payment_action !== 'none') {
        const stripe = getStripe();
        stripeResult = await applyStripeCancellation(stripe, claim);
      }

      const { data: finalized, error: finalizeError } = await ctx.supabaseAdmin.rpc(
        'finalize_booking_cancellation',
        {
          p_booking_id: claim.booking_id,
          p_cancellation_attempt: claim.cancellation_attempt,
          p_captured_cents: stripeResult.capturedCents,
          p_released_cents: stripeResult.releasedCents,
        },
      );

      if (finalizeError) throw finalizeError;

      return Response.json({ cancellation: finalized }, { status: 200 });
    } catch (err) {
      const code = machineErrorCode(err);
      await markCancellationFailed(ctx.supabaseAdmin, claim, code);
      console.error('booking_cancellation_failed', claim.booking_id, code);

      if (code === 'stripe_test_configuration_required') {
        return responseError('payment_temporarily_unavailable', 503);
      }
      if (code === 'live_stripe_object_disabled') {
        return responseError('payment_safety_check_failed', 503);
      }
      return responseError('cancellation_processing_failed', 502);
    }
  }),
};
