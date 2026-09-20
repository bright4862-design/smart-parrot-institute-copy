import { withSupabase } from 'npm:@supabase/server@^1';
import {
  checkoutAuthorizationText,
  formatMoney,
  getAppUrl,
  getOrCreateStripeCustomer,
  getStripe,
} from '../_shared/stripe.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(error: string, status: number) {
  return Response.json({ error }, { status });
}

function paymentSetupError(message: string) {
  if (['stripe_test_configuration_required', 'app_url_configuration_required'].includes(message)) {
    return { status: 503, error: 'payment_temporarily_unavailable' };
  }
  if (['live_stripe_object_disabled', 'live_checkout_disabled'].includes(message)) {
    return { status: 503, error: 'payment_safety_check_failed' };
  }
  if ([
    'booking_not_found',
    'hold_recovery_not_available',
    'hold_recovery_checkout_already_attached',
  ].includes(message)) {
    return { status: 409, error: 'booking_state_changed' };
  }
  return { status: 502, error: 'payment_setup_failed' };
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse('invalid_json', 400);
    }

    const bookingId = String(body.booking_id ?? '').trim();
    if (!UUID_RE.test(bookingId)) return errorResponse('invalid_booking_id', 422);

    const studentId = ctx.userClaims?.id;
    if (!studentId || !UUID_RE.test(studentId)) {
      return errorResponse('authenticated_user_required', 401);
    }

    let stripe;
    let appUrl;
    try {
      stripe = getStripe();
      appUrl = getAppUrl();
    } catch (err) {
      const mapped = paymentSetupError((err as Error).message);
      return errorResponse(mapped.error, mapped.status);
    }

    const { data: booking, error: bookingError } = await ctx.supabaseAdmin
      .from('bookings')
      .select(
        'id, student_id, lesson_type_id, policy_version_id, status, starts_at, currency, on_time_price_cents, max_charge_cents, hold_strategy, hold_recovery_checkout_session_id, hold_recovery_checkout_expires_at, hold_recovery_attempts',
      )
      .eq('id', bookingId)
      .eq('student_id', studentId)
      .single();

    if (bookingError || !booking) return errorResponse('booking_not_found', 404);
    if (booking.status !== 'hold_failed' || booking.hold_strategy !== 'deferred') {
      return errorResponse('hold_recovery_not_available', 409);
    }

    if (booking.hold_recovery_checkout_session_id) {
      try {
        const existing = await stripe.checkout.sessions.retrieve(
          booking.hold_recovery_checkout_session_id,
        );
        if (existing.livemode) throw new Error('live_stripe_object_disabled');

        if (existing.status === 'open' && existing.url) {
          return Response.json({
            booking_id: booking.id,
            checkout: {
              id: existing.id,
              mode: existing.mode,
              url: existing.url,
              status: existing.status,
              expires_at: existing.expires_at,
            },
          });
        }

        if (existing.status === 'complete') {
          return Response.json({
            booking_id: booking.id,
            checkout: { id: existing.id, mode: existing.mode, url: null, status: existing.status },
          }, { status: 202 });
        }

        const { error: clearError } = await ctx.supabaseAdmin.rpc(
          'clear_expired_hold_recovery_checkout',
          {
            p_booking_id: booking.id,
            p_checkout_session_id: existing.id,
          },
        );
        if (clearError) throw clearError;
      } catch (err) {
        const mapped = paymentSetupError((err as Error).message);
        return errorResponse(mapped.error, mapped.status);
      }
    }

    const { data: lesson, error: lessonError } = await ctx.supabaseAdmin
      .from('lesson_types')
      .select('name')
      .eq('id', booking.lesson_type_id)
      .single();
    if (lessonError || !lesson) return errorResponse('booking_state_unavailable', 500);

    try {
      const customer = await getOrCreateStripeCustomer(
        ctx.supabaseAdmin,
        studentId,
        ctx.userClaims?.email ?? null,
      );
      const tosText = checkoutAuthorizationText(booking);
      const expiresAt = Math.floor(Date.now() / 1000) + 30 * 60;
      const generation = Number(booking.hold_recovery_attempts ?? 0);

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer,
        client_reference_id: booking.id,
        payment_method_types: ['card'],
        line_items: [{
          quantity: 1,
          price_data: {
            currency: booking.currency,
            unit_amount: booking.max_charge_cents,
            product_data: {
              name: `${lesson.name} — card confirmation for ${new Date(booking.starts_at).toISOString()}`,
            },
          },
        }],
        payment_intent_data: {
          capture_method: 'manual',
          setup_future_usage: 'off_session',
          metadata: {
            booking_id: booking.id,
            hold_strategy: 'deferred',
            hold_recovery: 'true',
          },
        },
        success_url: `${appUrl}/book-lessons?booking=${booking.id}&payment_fix=success`,
        cancel_url: `${appUrl}/book-lessons?booking=${booking.id}&payment_fix=cancelled`,
        expires_at: expiresAt,
        consent_collection: { terms_of_service: 'required' },
        metadata: {
          booking_id: booking.id,
          policy_version: booking.policy_version_id,
          hold_strategy: 'deferred',
          hold_recovery: 'true',
          tos_text: tosText,
        },
        custom_text: {
          terms_of_service_acceptance: { message: tosText },
          submit: {
            message: `Confirm your card for the lesson. This places a hold up to ${formatMoney(booking.max_charge_cents, booking.currency)}; the amount due is captured only after the lesson under the accepted policy.`,
          },
        },
      }, {
        idempotencyKey: `smart-parrot-hold-recovery-${booking.id}-${generation}`,
      });

      if (session.livemode || !session.id.startsWith('cs_test_') || !session.url) {
        throw new Error('live_stripe_object_disabled');
      }
      if (session.mode !== 'payment') throw new Error('hold_recovery_checkout_mode_invalid');

      const { data: attached, error: attachError } = await ctx.supabaseAdmin.rpc(
        'attach_hold_recovery_checkout',
        {
          p_student_id: studentId,
          p_booking_id: booking.id,
          p_checkout_session_id: session.id,
          p_expires_at: new Date(session.expires_at * 1000).toISOString(),
        },
      );
      if (attachError) throw new Error(attachError.message);

      return Response.json({
        booking_id: booking.id,
        checkout: {
          id: session.id,
          mode: session.mode,
          url: session.url,
          status: session.status,
          expires_at: session.expires_at,
        },
        checkout_attachment: attached,
      });
    } catch (err) {
      const mapped = paymentSetupError((err as Error).message);
      return errorResponse(mapped.error, mapped.status);
    }
  }),
};
