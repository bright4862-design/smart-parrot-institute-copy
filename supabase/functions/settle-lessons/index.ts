import Stripe from 'npm:stripe@^22';
import { withSupabase } from 'npm:@supabase/server@^1';
import { getStripe } from '../_shared/stripe.ts';

const MAX_BATCH = 25;

type AdminClient = any;
type SettlementClaim = {
  booking_id: string;
  stripe_payment_intent_id: string | null;
  max_charge_cents: number;
  currency: string;
  capture_before: string | null;
  settlement_attempt: number;
};

type SettlementComputation = {
  outcome: string;
  amount_cents: number;
  student_joined_at: string | null;
  tutor_joined_at: string | null;
};

function machineErrorCode(err: any) {
  return String(err?.code ?? err?.raw?.code ?? err?.message ?? 'settlement_failed')
    .slice(0, 120);
}

async function markAttemptFailed(
  admin: AdminClient,
  claim: SettlementClaim,
  code: string,
) {
  const { error } = await admin.rpc('mark_lesson_settlement_failed', {
    p_booking_id: claim.booking_id,
    p_settlement_attempt: claim.settlement_attempt,
    p_error_code: code,
  });
  if (error) {
    console.error('settlement_failure_record_failed', claim.booking_id, error.message);
  }
}

function assertIntentIntegrity(intent: Stripe.PaymentIntent, claim: SettlementClaim) {
  if (intent.livemode) throw new Error('live_stripe_object_disabled');
  if (intent.id !== claim.stripe_payment_intent_id) {
    throw new Error('settlement_payment_intent_mismatch');
  }
  if (intent.amount !== claim.max_charge_cents) {
    throw new Error('settlement_authorized_amount_mismatch');
  }
  if (intent.currency !== String(claim.currency).toLowerCase()) {
    throw new Error('settlement_currency_mismatch');
  }
  if (intent.metadata?.booking_id !== claim.booking_id) {
    throw new Error('settlement_booking_metadata_mismatch');
  }
}

async function captureExactAmount(
  stripe: Stripe,
  claim: SettlementClaim,
  amountCents: number,
) {
  if (!claim.stripe_payment_intent_id) {
    throw new Error('settlement_payment_intent_missing');
  }

  let intent = await stripe.paymentIntents.retrieve(claim.stripe_payment_intent_id);
  assertIntentIntegrity(intent, claim);

  if (amountCents === 0) {
    if (intent.status === 'canceled') {
      return { capturedCents: 0, releasedCents: claim.max_charge_cents };
    }
    if (intent.status === 'succeeded') {
      throw new Error('zero_due_but_payment_already_captured');
    }
    if (intent.status !== 'requires_capture') {
      throw new Error(`payment_intent_not_releasable:${intent.status}`);
    }

    intent = await stripe.paymentIntents.cancel(
      intent.id,
      {},
      { idempotencyKey: `smart-parrot-settlement-release-${claim.booking_id}` },
    );
    assertIntentIntegrity(intent, claim);

    if (intent.status !== 'canceled') {
      throw new Error(`payment_intent_release_failed:${intent.status}`);
    }

    return { capturedCents: 0, releasedCents: claim.max_charge_cents };
  }

  if (intent.status === 'succeeded') {
    if (intent.amount_received !== amountCents) {
      throw new Error('captured_amount_mismatch');
    }
    return {
      capturedCents: amountCents,
      releasedCents: claim.max_charge_cents - amountCents,
    };
  }

  if (intent.status !== 'requires_capture') {
    throw new Error(`payment_intent_not_capturable:${intent.status}`);
  }

  if (intent.amount_capturable < amountCents) {
    throw new Error('amount_capturable_below_settlement');
  }

  intent = await stripe.paymentIntents.capture(
    intent.id,
    {
      amount_to_capture: amountCents,
      final_capture: true,
    },
    { idempotencyKey: `smart-parrot-settlement-capture-${claim.booking_id}` },
  );
  assertIntentIntegrity(intent, claim);

  if (intent.status !== 'succeeded' || intent.amount_received !== amountCents) {
    throw new Error(`payment_intent_capture_failed:${intent.status}`);
  }

  return {
    capturedCents: amountCents,
    releasedCents: claim.max_charge_cents - amountCents,
  };
}

async function settleOne(
  admin: AdminClient,
  stripe: Stripe,
  claim: SettlementClaim,
) {
  try {
    if (!claim.stripe_payment_intent_id) {
      throw new Error('settlement_payment_intent_missing');
    }

    const { data: computation, error: computeError } = await admin
      .rpc('compute_lesson_settlement', { p_booking_id: claim.booking_id })
      .single();

    if (computeError || !computation) {
      throw computeError ?? new Error('settlement_computation_missing');
    }

    const settlement = computation as SettlementComputation;
    const amountCents = Number(settlement.amount_cents);
    if (!Number.isInteger(amountCents)
      || amountCents < 0
      || amountCents > claim.max_charge_cents) {
      throw new Error('invalid_computed_settlement_amount');
    }

    const stripeResult = await captureExactAmount(stripe, claim, amountCents);

    const { data: finalized, error: finalizeError } = await admin.rpc(
      'finalize_lesson_settlement',
      {
        p_booking_id: claim.booking_id,
        p_settlement_attempt: claim.settlement_attempt,
        p_captured_cents: stripeResult.capturedCents,
        p_released_cents: stripeResult.releasedCents,
      },
    );

    if (finalizeError) throw finalizeError;

    return {
      id: claim.booking_id,
      status: 'settled',
      outcome: settlement.outcome,
      amount_cents: amountCents,
      released_cents: stripeResult.releasedCents,
      finalized,
    };
  } catch (err) {
    const code = machineErrorCode(err);
    await markAttemptFailed(admin, claim, code);
    console.error('lesson_settlement_failed', claim.booking_id, code);
    return { id: claim.booking_id, status: 'error', error: code };
  }
}

export default {
  fetch: withSupabase({ auth: 'secret' }, async (req, ctx) => {
    if (req.method !== 'POST') {
      return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    }

    let stripe: Stripe;
    try {
      stripe = getStripe();
    } catch {
      return Response.json({ error: 'payment_temporarily_unavailable' }, { status: 503 });
    }

    const admin = ctx.supabaseAdmin;
    const now = new Date().toISOString();
    const { data: claims, error: claimError } = await admin.rpc(
      'claim_lesson_settlements',
      {
        p_now: now,
        p_limit: MAX_BATCH,
      },
    );

    if (claimError) {
      console.error('settlement_claim_failed', claimError.message);
      return Response.json({ error: 'settlement_worker_query_failed' }, { status: 500 });
    }

    const results = [];
    for (const claim of (claims ?? []) as SettlementClaim[]) {
      results.push(await settleOne(admin, stripe, claim));
    }

    return Response.json({ settlements: results });
  }),
};
