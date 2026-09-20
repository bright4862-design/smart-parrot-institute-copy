import Stripe from 'npm:stripe@^22';
import { withSupabase } from 'npm:@supabase/server@^1';
import {
  getStripe,
  getStripeWebhookSecret,
  stripeObjectId,
} from '../_shared/stripe.ts';

const cryptoProvider = Stripe.createSubtleCryptoProvider();

function response(error: string, status: number) {
  return Response.json({ error }, { status });
}

async function recordStripeConsent(admin: any, booking: any, session: Stripe.Checkout.Session) {
  if (session.consent?.terms_of_service !== 'accepted') {
    throw new Error('stripe_terms_not_accepted');
  }

  const { data: existing, error: existingError } = await admin
    .from('consents')
    .select('id')
    .eq('stripe_checkout_session_id', session.id)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return;

  const { data: policy, error: policyError } = await admin
    .from('policy_versions')
    .select('terms_sha256')
    .eq('id', booking.policy_version_id)
    .single();

  if (policyError || !policy) throw policyError ?? new Error('booking_policy_not_found');

  const { error: consentError } = await admin.from('consents').insert({
    user_id: booking.student_id,
    booking_id: booking.id,
    policy_version_id: booking.policy_version_id,
    terms_sha256: policy.terms_sha256,
    checkbox_text: session.metadata?.tos_text ?? 'Stripe terms of service accepted',
    express_start_request: false,
    stripe_checkout_session_id: session.id,
  });

  if (consentError?.code !== '23505' && consentError) throw consentError;
}

async function insertLedgerOnce(admin: any, entry: Record<string, unknown>) {
  const { error } = await admin.from('ledger_entries').insert(entry);
  if (error?.code !== '23505' && error) throw error;
}

async function handleCompleted(
  admin: any,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
) {
  const bookingId = session.client_reference_id ?? session.metadata?.booking_id ?? null;
  if (!bookingId || session.metadata?.booking_id !== bookingId) {
    throw new Error('checkout_booking_identity_mismatch');
  }

  const { data: booking, error: bookingError } = await admin
    .from('bookings')
    .select(
      'id, student_id, policy_version_id, status, hold_strategy, max_charge_cents, currency, stripe_checkout_session_id, stripe_checkout_mode',
    )
    .eq('id', bookingId)
    .single();

  if (bookingError || !booking) throw bookingError ?? new Error('booking_not_found');
  if (booking.stripe_checkout_session_id !== session.id) {
    throw new Error('checkout_session_not_attached');
  }
  if (booking.stripe_checkout_mode !== session.mode) {
    throw new Error('checkout_mode_mismatch');
  }
  if (session.metadata?.policy_version !== booking.policy_version_id) {
    throw new Error('checkout_policy_mismatch');
  }

  await recordStripeConsent(admin, booking, session);

  if (session.mode === 'payment') {
    if (booking.hold_strategy !== 'at_checkout') throw new Error('checkout_mode_mismatch');

    const paymentIntentId = stripeObjectId(session.payment_intent as any);
    if (!paymentIntentId) throw new Error('payment_intent_missing');

    const paymentIntent = await stripe.paymentIntents.retrieve(
      paymentIntentId,
      { expand: ['latest_charge'] },
    );
    if (paymentIntent.livemode || paymentIntent.status !== 'requires_capture') {
      throw new Error('payment_intent_not_authorized');
    }

    const paymentMethodId = stripeObjectId(paymentIntent.payment_method as any);
    const latestCharge = typeof paymentIntent.latest_charge === 'object'
      ? paymentIntent.latest_charge as Stripe.Charge
      : null;
    const captureBefore = latestCharge?.payment_method_details?.card?.capture_before ?? null;

    const { data: moved, error: moveError } = await admin
      .from('bookings')
      .update({
        status: 'hold_placed',
        stripe_payment_intent_id: paymentIntent.id,
        stripe_payment_method_id: paymentMethodId,
        capture_before: captureBefore ? new Date(captureBefore * 1000).toISOString() : null,
      })
      .eq('id', booking.id)
      .eq('status', 'pending_checkout')
      .eq('stripe_checkout_session_id', session.id)
      .select('id');

    if (moveError) throw moveError;

    if (moved?.length) {
      await insertLedgerOnce(admin, {
        booking_id: booking.id,
        kind: 'hold_placed',
        amount_cents: paymentIntent.amount,
        currency: booking.currency,
        stripe_object_id: paymentIntent.id,
        note: 'Stripe Checkout manual-capture authorization confirmed',
      });
    }

    return;
  }

  if (session.mode === 'setup') {
    if (booking.hold_strategy !== 'deferred') throw new Error('checkout_mode_mismatch');

    const setupIntentId = stripeObjectId(session.setup_intent as any);
    if (!setupIntentId) throw new Error('setup_intent_missing');

    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    if (setupIntent.livemode || setupIntent.status !== 'succeeded') {
      throw new Error('setup_intent_not_ready');
    }

    const paymentMethodId = stripeObjectId(setupIntent.payment_method as any);
    if (!paymentMethodId) throw new Error('setup_payment_method_missing');

    const { error: moveError } = await admin
      .from('bookings')
      .update({
        status: 'card_saved',
        stripe_setup_intent_id: setupIntent.id,
        stripe_payment_method_id: paymentMethodId,
      })
      .eq('id', booking.id)
      .eq('status', 'pending_checkout')
      .eq('stripe_checkout_session_id', session.id);

    if (moveError) throw moveError;
    return;
  }

  throw new Error('unsupported_checkout_mode');
}

async function handleExpired(admin: any, session: Stripe.Checkout.Session) {
  const bookingId = session.client_reference_id ?? session.metadata?.booking_id ?? null;
  if (!bookingId) return;

  const { error } = await admin
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: 'system',
      cancel_kind: 'expired',
    })
    .eq('id', bookingId)
    .eq('status', 'pending_checkout')
    .eq('stripe_checkout_session_id', session.id);

  if (error) throw error;
}

export default {
  fetch: withSupabase({ auth: 'none' }, async (req, ctx) => {
    if (req.method !== 'POST') return response('method_not_allowed', 405);

    const signature = req.headers.get('stripe-signature') ?? '';
    const rawBody = await req.text();

    let event: Stripe.Event;
    let stripe: Stripe;

    try {
      stripe = getStripe();
      event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        getStripeWebhookSecret(),
        undefined,
        cryptoProvider,
      );
    } catch {
      return response('invalid_signature', 400);
    }

    // Test-mode safety is enforced independently of the configured secret key.
    if (event.livemode) return response('live_events_disabled', 400);

    const admin = ctx.supabaseAdmin;
    const { error: insertError } = await admin.from('stripe_events').insert({
      id: event.id,
      type: event.type,
      payload: event,
    });

    if (insertError?.code !== '23505' && insertError) {
      console.error('stripe_event_store_failed', insertError.message);
      return response('webhook_storage_failed', 500);
    }

    const { data: stored, error: storedError } = await admin
      .from('stripe_events')
      .select('processed_at')
      .eq('id', event.id)
      .single();

    if (storedError) return response('webhook_storage_failed', 500);
    if (stored?.processed_at) return Response.json({ received: true, replay: true });

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCompleted(
            admin,
            stripe,
            event.data.object as Stripe.Checkout.Session,
          );
          break;
        case 'checkout.session.expired':
          await handleExpired(
            admin,
            event.data.object as Stripe.Checkout.Session,
          );
          break;
        default:
          break;
      }

      const { error: processedError } = await admin
        .from('stripe_events')
        .update({ processed_at: new Date().toISOString() })
        .eq('id', event.id);

      if (processedError) throw processedError;
      return Response.json({ received: true });
    } catch (err) {
      console.error('stripe_webhook_processing_failed', event.id, (err as Error).message);
      // Keep processed_at null so Stripe's retry can safely replay the event.
      return response('webhook_processing_failed', 500);
    }
  }),
};
