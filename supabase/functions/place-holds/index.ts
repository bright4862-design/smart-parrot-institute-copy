import Stripe from 'npm:stripe@^22';
import { withSupabase } from 'npm:@supabase/server@^1';
import { getStripe, stripeObjectId } from '../_shared/stripe.ts';

const HOUR_MS = 3_600_000;
const CHECKOUT_GRACE_MS = 5 * 60_000;
const MAX_BATCH = 50;

type AdminClient = any;
type Booking = Record<string, any>;

function machineErrorCode(err: any) {
  return String(err?.code ?? err?.raw?.code ?? err?.message ?? 'deferred_hold_failed')
    .slice(0, 120);
}

function paymentIntentCandidate(err: any) {
  return err?.payment_intent ?? err?.raw?.payment_intent ?? null;
}

async function insertLedgerOnce(admin: AdminClient, entry: Record<string, unknown>) {
  const { error } = await admin.from('ledger_entries').insert(entry);
  if (error?.code !== '23505' && error) throw error;
}

async function cancelTestIntentIfPresent(stripe: Stripe, candidate: any) {
  const id = stripeObjectId(candidate);
  if (!id) return null;

  let intent: Stripe.PaymentIntent;
  if (typeof candidate === 'object' && candidate?.id) {
    intent = candidate as Stripe.PaymentIntent;
  } else {
    intent = await stripe.paymentIntents.retrieve(id);
  }

  if (intent.livemode) throw new Error('live_stripe_object_disabled');

  if (!['canceled', 'succeeded'].includes(intent.status)) {
    try {
      await stripe.paymentIntents.cancel(intent.id, {}, {
        idempotencyKey: `smart-parrot-cancel-failed-hold-${intent.id}`,
      });
    } catch (cancelError) {
      console.error('deferred_hold_cancel_failed', intent.id, machineErrorCode(cancelError));
    }
  }

  return intent.id;
}

async function markHoldFailed(
  admin: AdminClient,
  booking: Booking,
  attempt: number,
  code: string,
  stripeObjectIdValue: string | null,
) {
  const now = new Date().toISOString();
  const { data: moved, error } = await admin
    .from('bookings')
    .update({
      status: 'hold_failed',
      hold_attempts: attempt + 1,
      hold_last_error_code: code,
      hold_last_error_at: now,
    })
    .eq('id', booking.id)
    .eq('status', 'card_saved')
    .eq('hold_attempts', attempt)
    .select('id');

  if (error) throw error;
  if (!moved?.length) return false;

  await insertLedgerOnce(admin, {
    booking_id: booking.id,
    kind: 'hold_failed',
    amount_cents: 0,
    currency: booking.currency,
    stripe_object_id: stripeObjectIdValue,
    note: `Deferred hold attempt ${attempt + 1}: ${code}`,
  });

  return true;
}

async function placeDeferredHold(admin: AdminClient, stripe: Stripe, booking: Booking) {
  const attempt = Number(booking.hold_attempts ?? 0);
  const { data: link, error: linkError } = await admin
    .from('stripe_links')
    .select('stripe_customer_id')
    .eq('user_id', booking.student_id)
    .single();

  if (linkError || !link?.stripe_customer_id || !booking.stripe_payment_method_id) {
    const code = 'saved_payment_method_unavailable';
    await markHoldFailed(admin, booking, attempt, code, null);
    return { id: booking.id, status: 'hold_failed', error: code };
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: booking.max_charge_cents,
      currency: booking.currency,
      customer: link.stripe_customer_id,
      payment_method: booking.stripe_payment_method_id,
      payment_method_types: ['card'],
      off_session: true,
      confirm: true,
      capture_method: 'manual',
      metadata: {
        booking_id: booking.id,
        hold_strategy: 'deferred',
        smart_parrot_hold_attempt: String(attempt + 1),
      },
      expand: ['latest_charge'],
    }, {
      idempotencyKey: `smart-parrot-deferred-hold-${booking.id}-${attempt}`,
    });

    if (paymentIntent.livemode) throw new Error('live_stripe_object_disabled');
    if (paymentIntent.status !== 'requires_capture') {
      const unexpected: any = new Error(`payment_intent_not_authorized:${paymentIntent.status}`);
      unexpected.payment_intent = paymentIntent;
      throw unexpected;
    }
    if (paymentIntent.amount !== booking.max_charge_cents
      || paymentIntent.currency !== String(booking.currency).toLowerCase()
      || stripeObjectId(paymentIntent.customer as any) !== link.stripe_customer_id) {
      const integrity: any = new Error('deferred_hold_integrity_failed');
      integrity.payment_intent = paymentIntent;
      throw integrity;
    }

    const latestCharge = typeof paymentIntent.latest_charge === 'object'
      ? paymentIntent.latest_charge as Stripe.Charge
      : null;
    const captureBefore = latestCharge?.payment_method_details?.card?.capture_before ?? null;
    if (!captureBefore) {
      const missingDeadline: any = new Error('capture_deadline_missing');
      missingDeadline.payment_intent = paymentIntent;
      throw missingDeadline;
    }

    const paymentMethodId = stripeObjectId(paymentIntent.payment_method as any);
    const { data: moved, error: moveError } = await admin
      .from('bookings')
      .update({
        status: 'hold_placed',
        hold_attempts: attempt + 1,
        stripe_payment_intent_id: paymentIntent.id,
        stripe_payment_method_id: paymentMethodId ?? booking.stripe_payment_method_id,
        capture_before: new Date(captureBefore * 1000).toISOString(),
        hold_last_error_code: null,
        hold_last_error_at: null,
      })
      .eq('id', booking.id)
      .eq('status', 'card_saved')
      .eq('hold_attempts', attempt)
      .select('id');

    if (moveError) throw moveError;
    if (!moved?.length) {
      return { id: booking.id, status: 'superseded' };
    }

    await insertLedgerOnce(admin, {
      booking_id: booking.id,
      kind: 'hold_placed',
      amount_cents: paymentIntent.amount,
      currency: booking.currency,
      stripe_object_id: paymentIntent.id,
      note: `Deferred off-session manual authorization, attempt ${attempt + 1}`,
    });

    return { id: booking.id, status: 'hold_placed', payment_intent_id: paymentIntent.id };
  } catch (err) {
    const code = machineErrorCode(err);
    if (code === 'live_stripe_object_disabled') throw err;

    const failedIntentId = await cancelTestIntentIfPresent(stripe, paymentIntentCandidate(err));
    const changed = await markHoldFailed(admin, booking, attempt, code, failedIntentId);
    return {
      id: booking.id,
      status: changed ? 'hold_failed' : 'superseded',
      error: code,
    };
  }
}

async function policyFixDeadlineHours(admin: AdminClient, policyVersionId: string) {
  const { data: policy, error } = await admin
    .from('policy_versions')
    .select('config')
    .eq('id', policyVersionId)
    .single();
  if (error || !policy?.config) throw error ?? new Error('booking_policy_not_found');

  const value = Number(policy.config.hold_fix_deadline_hours);
  if (!Number.isInteger(value) || value < 1 || value > 168) {
    throw new Error('invalid_hold_fix_deadline');
  }
  return value;
}

async function cancelUnresolvedHoldFailures(admin: AdminClient, stripe: Stripe, now: Date) {
  const horizon = new Date(now.getTime() + 7 * 24 * HOUR_MS).toISOString();
  const { data: candidates, error } = await admin
    .from('bookings')
    .select('id, policy_version_id, starts_at, status, hold_recovery_checkout_session_id')
    .eq('status', 'hold_failed')
    .lte('starts_at', horizon)
    .order('starts_at', { ascending: true })
    .limit(MAX_BATCH);
  if (error) throw error;

  const results = [];
  for (const booking of candidates ?? []) {
    try {
      const deadlineHours = await policyFixDeadlineHours(admin, booking.policy_version_id);
      const deadline = new Date(new Date(booking.starts_at).getTime() - deadlineHours * HOUR_MS);
      if (now < deadline) continue;

      if (booking.hold_recovery_checkout_session_id) {
        const session = await stripe.checkout.sessions.retrieve(booking.hold_recovery_checkout_session_id);
        if (session.livemode) throw new Error('live_stripe_object_disabled');
        if (session.status === 'complete') {
          // Never cancel behind a completed customer-present authorization.
          // The signed webhook owns the transition to hold_placed and can retry.
          results.push({ id: booking.id, status: 'recovery_complete_waiting_webhook' });
          continue;
        }
        if (session.status === 'open') {
          await stripe.checkout.sessions.expire(session.id);
        }
      }

      const { data: moved, error: moveError } = await admin
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_at: now.toISOString(),
          cancelled_by: 'system',
          cancel_kind: 'hold_failed',
        })
        .eq('id', booking.id)
        .eq('status', 'hold_failed')
        .select('id');
      if (moveError) throw moveError;
      if (moved?.length) results.push({ id: booking.id, status: 'cancelled_hold_failed' });
    } catch (err) {
      results.push({ id: booking.id, status: 'error', error: machineErrorCode(err) });
    }
  }

  return results;
}

async function cleanupAbandonedCheckouts(admin: AdminClient, stripe: Stripe, now: Date) {
  const cutoff = new Date(now.getTime() - CHECKOUT_GRACE_MS).toISOString();
  const { data: stale, error } = await admin
    .from('bookings')
    .select('id, stripe_checkout_session_id, checkout_expires_at')
    .eq('status', 'pending_checkout')
    .not('stripe_checkout_session_id', 'is', null)
    .lte('checkout_expires_at', cutoff)
    .order('checkout_expires_at', { ascending: true })
    .limit(MAX_BATCH);
  if (error) throw error;

  const results = [];
  for (const booking of stale ?? []) {
    try {
      const session = await stripe.checkout.sessions.retrieve(booking.stripe_checkout_session_id);
      if (session.livemode) throw new Error('live_stripe_object_disabled');

      if (session.status === 'complete') {
        results.push({ id: booking.id, status: 'complete_waiting_webhook' });
        continue;
      }
      if (session.status === 'open') {
        await stripe.checkout.sessions.expire(session.id);
      }

      const { data: moved, error: moveError } = await admin
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_at: now.toISOString(),
          cancelled_by: 'system',
          cancel_kind: 'expired',
        })
        .eq('id', booking.id)
        .eq('status', 'pending_checkout')
        .eq('stripe_checkout_session_id', session.id)
        .select('id');
      if (moveError) throw moveError;
      if (moved?.length) results.push({ id: booking.id, status: 'cancelled_expired_checkout' });
    } catch (err) {
      results.push({ id: booking.id, status: 'error', error: machineErrorCode(err) });
    }
  }

  return results;
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
    const now = new Date();
    const { data: due, error: dueError } = await admin
      .from('bookings')
      .select('id, student_id, status, currency, max_charge_cents, hold_due_at, hold_attempts, stripe_payment_method_id')
      .eq('status', 'card_saved')
      .lte('hold_due_at', now.toISOString())
      .order('hold_due_at', { ascending: true })
      .limit(MAX_BATCH);

    if (dueError) {
      console.error('deferred_hold_query_failed', dueError.message);
      return Response.json({ error: 'hold_worker_query_failed' }, { status: 500 });
    }

    const holds = [];
    for (const booking of due ?? []) {
      try {
        holds.push(await placeDeferredHold(admin, stripe, booking));
      } catch (err) {
        console.error('deferred_hold_worker_failed', booking.id, machineErrorCode(err));
        holds.push({ id: booking.id, status: 'error', error: machineErrorCode(err) });
      }
    }

    const deadlineCancellations = await cancelUnresolvedHoldFailures(admin, stripe, now);
    const checkoutCleanup = await cleanupAbandonedCheckouts(admin, stripe, now);

    return Response.json({
      holds,
      deadline_cancellations: deadlineCancellations,
      checkout_cleanup: checkoutCleanup,
    });
  }),
};
