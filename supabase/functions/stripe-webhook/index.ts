import Stripe from 'npm:stripe@^22';
import { withSupabase } from 'npm:@supabase/server@^1';
import {
  getStripe,
  getStripeWebhookSecret,
  stripeObjectId,
} from '../_shared/stripe.ts';

const cryptoProvider = Stripe.createSubtleCryptoProvider();

type AdminClient = any;

type AttachedBooking = {
  kind: 'initial' | 'recovery';
  booking: any;
};

function response(error: string, status: number) {
  return Response.json({ error }, { status });
}

async function recordStripeConsent(admin: AdminClient, booking: any, session: Stripe.Checkout.Session) {
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

async function insertLedgerOnce(admin: AdminClient, entry: Record<string, unknown>) {
  const { error } = await admin.from('ledger_entries').insert(entry);
  if (error?.code !== '23505' && error) throw error;
}

const bookingSelection = [
  'id',
  'student_id',
  'policy_version_id',
  'status',
  'hold_strategy',
  'max_charge_cents',
  'currency',
  'stripe_checkout_session_id',
  'stripe_checkout_mode',
  'hold_recovery_checkout_session_id',
].join(', ');

async function bookingForSession(admin: AdminClient, sessionId: string): Promise<AttachedBooking | null> {
  const { data: initial, error: initialError } = await admin
    .from('bookings')
    .select(bookingSelection)
    .eq('stripe_checkout_session_id', sessionId)
    .maybeSingle();
  if (initialError) throw initialError;
  if (initial) return { kind: 'initial', booking: initial };

  const { data: recovery, error: recoveryError } = await admin
    .from('bookings')
    .select(bookingSelection)
    .eq('hold_recovery_checkout_session_id', sessionId)
    .maybeSingle();
  if (recoveryError) throw recoveryError;
  if (recovery) return { kind: 'recovery', booking: recovery };

  return null;
}

async function verifyCheckoutCustomer(admin: AdminClient, booking: any, session: Stripe.Checkout.Session) {
  const sessionCustomerId = stripeObjectId(session.customer as any);
  const { data: link, error } = await admin
    .from('stripe_links')
    .select('stripe_customer_id')
    .eq('user_id', booking.student_id)
    .single();
  if (error || !link?.stripe_customer_id) throw error ?? new Error('stripe_customer_not_found');
  if (!sessionCustomerId || sessionCustomerId !== link.stripe_customer_id) {
    throw new Error('checkout_customer_mismatch');
  }
}

async function applyManualAuthorization(
  admin: AdminClient,
  stripe: Stripe,
  booking: any,
  session: Stripe.Checkout.Session,
  attachmentKind: 'initial' | 'recovery',
) {
  const paymentIntentId = stripeObjectId(session.payment_intent as any);
  if (!paymentIntentId) throw new Error('payment_intent_missing');

  const paymentIntent = await stripe.paymentIntents.retrieve(
    paymentIntentId,
    { expand: ['latest_charge'] },
  );
  if (paymentIntent.livemode || paymentIntent.status !== 'requires_capture') {
    throw new Error('payment_intent_not_authorized');
  }
  if (paymentIntent.amount !== booking.max_charge_cents
    || paymentIntent.currency !== String(booking.currency).toLowerCase()) {
    throw new Error('payment_intent_amount_mismatch');
  }

  const paymentMethodId = stripeObjectId(paymentIntent.payment_method as any);
  const latestCharge = typeof paymentIntent.latest_charge === 'object'
    ? paymentIntent.latest_charge as Stripe.Charge
    : null;
  const captureBefore = latestCharge?.payment_method_details?.card?.capture_before ?? null;
  if (!captureBefore) throw new Error('capture_deadline_missing');

  let query = admin
    .from('bookings')
    .update({
      status: 'hold_placed',
      stripe_payment_intent_id: paymentIntent.id,
      stripe_payment_method_id: paymentMethodId,
      capture_before: new Date(captureBefore * 1000).toISOString(),
      hold_last_error_code: null,
      hold_last_error_at: null,
    })
    .eq('id', booking.id);

  if (attachmentKind === 'initial') {
    query = query
      .eq('status', 'pending_checkout')
      .eq('stripe_checkout_session_id', session.id);
  } else {
    query = query
      .eq('status', 'hold_failed')
      .eq('hold_recovery_checkout_session_id', session.id);
  }

  const { data: moved, error: moveError } = await query.select('id');
  if (moveError) throw moveError;

  if (moved?.length) {
    await insertLedgerOnce(admin, {
      booking_id: booking.id,
      kind: 'hold_placed',
      amount_cents: paymentIntent.amount,
      currency: booking.currency,
      stripe_object_id: paymentIntent.id,
      note: attachmentKind === 'recovery'
        ? 'Customer-present recovery Checkout manual authorization confirmed'
        : 'Stripe Checkout manual-capture authorization confirmed',
    });
  }
}

async function handleCompleted(
  admin: AdminClient,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
) {
  const bookingId = session.client_reference_id ?? session.metadata?.booking_id ?? null;
  if (!bookingId || session.metadata?.booking_id !== bookingId) {
    throw new Error('checkout_booking_identity_mismatch');
  }

  const attached = await bookingForSession(admin, session.id);
  if (!attached || attached.booking.id !== bookingId) {
    throw new Error('checkout_session_not_attached');
  }
  const booking = attached.booking;

  if (session.metadata?.policy_version !== booking.policy_version_id) {
    throw new Error('checkout_policy_mismatch');
  }
  await verifyCheckoutCustomer(admin, booking, session);
  await recordStripeConsent(admin, booking, session);

  if (attached.kind === 'recovery') {
    if (session.mode !== 'payment'
      || booking.hold_strategy !== 'deferred'
      || session.metadata?.hold_recovery !== 'true') {
      throw new Error('hold_recovery_checkout_mismatch');
    }
    await applyManualAuthorization(admin, stripe, booking, session, 'recovery');
    return;
  }

  if (booking.stripe_checkout_mode !== session.mode) {
    throw new Error('checkout_mode_mismatch');
  }

  if (session.mode === 'payment') {
    if (booking.hold_strategy !== 'at_checkout') throw new Error('checkout_mode_mismatch');
    await applyManualAuthorization(admin, stripe, booking, session, 'initial');
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

async function handleExpired(admin: AdminClient, session: Stripe.Checkout.Session) {
  const attached = await bookingForSession(admin, session.id);
  if (!attached) return;

  const booking = attached.booking;
  if (attached.kind === 'recovery') {
    const { error } = await admin
      .from('bookings')
      .update({
        hold_recovery_checkout_session_id: null,
        hold_recovery_checkout_expires_at: null,
      })
      .eq('id', booking.id)
      .eq('status', 'hold_failed')
      .eq('hold_recovery_checkout_session_id', session.id);
    if (error) throw error;
    return;
  }

  const { error } = await admin
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: 'system',
      cancel_kind: 'expired',
    })
    .eq('id', booking.id)
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
