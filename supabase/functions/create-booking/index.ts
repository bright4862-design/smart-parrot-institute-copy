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

function firstForwardedIp(req: Request) {
  const candidate = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  if (!candidate || candidate.length > 64) return null;
  return candidate;
}

function mapReservationError(message: string) {
  switch (message) {
    case 'slot_taken':
    case 'slot_unavailable':
      return { status: 409, error: 'slot_unavailable' };
    case 'express_start_request_required':
      return { status: 422, error: message };
    case 'lesson_type_not_found':
      return { status: 404, error: message };
    case 'booking_policy_not_configured':
    case 'invalid_booking_policy_config':
      return { status: 503, error: 'booking_temporarily_unavailable' };
    case 'idempotency_key_reused':
    case 'invalid_booking_request':
      return { status: 422, error: message };
    default:
      return { status: 500, error: 'booking_reservation_failed' };
  }
}

function mapCheckoutError(message: string) {
  if ([
    'stripe_test_configuration_required',
    'app_url_configuration_required',
  ].includes(message)) {
    return { status: 503, error: 'payment_temporarily_unavailable' };
  }

  if ([
    'live_stripe_object_disabled',
    'live_checkout_disabled',
    'checkout_mode_mismatch',
  ].includes(message)) {
    return { status: 503, error: 'payment_safety_check_failed' };
  }

  if ([
    'booking_not_found',
    'booking_not_pending_checkout',
    'checkout_already_attached',
  ].includes(message)) {
    return { status: 409, error: 'booking_state_changed' };
  }

  return { status: 502, error: 'payment_setup_failed' };
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') {
      return errorResponse('method_not_allowed', 405);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse('invalid_json', 400);
    }

    const lessonTypeId = String(body.lesson_type_id ?? '').trim();
    const requestId = String(body.request_id ?? '').trim();
    const startsAtRaw = String(body.starts_at ?? '').trim();
    const expressStartRequest = body.express_start_request === true;

    if (!UUID_RE.test(lessonTypeId)) {
      return errorResponse('invalid_lesson_type_id', 422);
    }
    if (!UUID_RE.test(requestId)) {
      return errorResponse('invalid_request_id', 422);
    }

    const startsAt = new Date(startsAtRaw);
    if (!startsAtRaw || Number.isNaN(startsAt.getTime())) {
      return errorResponse('invalid_starts_at', 422);
    }

    const studentId = ctx.userClaims?.id;
    if (!studentId || !UUID_RE.test(studentId)) {
      return errorResponse('authenticated_user_required', 401);
    }

    // Fail closed before reserving a slot if this preview/test environment is
    // not configured for Stripe test mode.
    let stripe;
    let appUrl;
    try {
      stripe = getStripe();
      appUrl = getAppUrl();
    } catch (err) {
      const mapped = mapCheckoutError((err as Error).message);
      return errorResponse(mapped.error, mapped.status);
    }

    const { data: reservation, error: reservationError } = await ctx.supabaseAdmin.rpc(
      'create_booking_reservation',
      {
        p_student_id: studentId,
        p_lesson_type_id: lessonTypeId,
        p_starts_at: startsAt.toISOString(),
        p_request_id: requestId,
        p_express_start_request: expressStartRequest,
        p_ip: firstForwardedIp(req),
        p_user_agent: req.headers.get('user-agent')?.slice(0, 1000) ?? null,
      },
    );

    if (reservationError) {
      const mapped = mapReservationError(reservationError.message);
      return errorResponse(mapped.error, mapped.status);
    }

    if (!reservation || typeof reservation !== 'object' || !reservation.booking_id) {
      return errorResponse('booking_reservation_failed', 500);
    }

    const { data: booking, error: bookingError } = await ctx.supabaseAdmin
      .from('bookings')
      .select(
        'id, student_id, lesson_type_id, policy_version_id, status, starts_at, currency, on_time_price_cents, max_charge_cents, hold_strategy, stripe_checkout_session_id, stripe_checkout_mode, checkout_expires_at',
      )
      .eq('id', reservation.booking_id)
      .eq('student_id', studentId)
      .single();

    if (bookingError || !booking) {
      return errorResponse('booking_state_unavailable', 500);
    }

    if (booking.stripe_checkout_session_id) {
      try {
        const existing = await stripe.checkout.sessions.retrieve(booking.stripe_checkout_session_id);
        if (existing.livemode) throw new Error('live_stripe_object_disabled');

        if (existing.status === 'open' && existing.url) {
          return Response.json({
            booking: reservation,
            checkout: { id: existing.id, mode: existing.mode, url: existing.url, status: existing.status },
          });
        }

        if (existing.status === 'complete') {
          return Response.json({
            booking: reservation,
            checkout: { id: existing.id, mode: existing.mode, url: null, status: existing.status },
          }, { status: 202 });
        }

        return errorResponse('checkout_expired', 409);
      } catch (err) {
        const mapped = mapCheckoutError((err as Error).message);
        return errorResponse(mapped.error, mapped.status);
      }
    }

    if (booking.status !== 'pending_checkout') {
      return errorResponse('booking_state_changed', 409);
    }

    const { data: lesson, error: lessonError } = await ctx.supabaseAdmin
      .from('lesson_types')
      .select('name')
      .eq('id', booking.lesson_type_id)
      .single();

    if (lessonError || !lesson) {
      return errorResponse('booking_state_unavailable', 500);
    }

    const checkoutMode = booking.hold_strategy === 'at_checkout' ? 'payment' : 'setup';
    const tosText = checkoutAuthorizationText(booking);
    const customer = await getOrCreateStripeCustomer(
      ctx.supabaseAdmin,
      studentId,
      ctx.userClaims?.email ?? null,
    );

    const expiresAt = Math.floor(Date.now() / 1000) + 30 * 60;
    const common = {
      customer,
      client_reference_id: booking.id,
      payment_method_types: ['card'] as const,
      success_url: `${appUrl}/book-lessons?booking=${booking.id}&checkout=success`,
      cancel_url: `${appUrl}/book-lessons?booking=${booking.id}&checkout=cancelled`,
      expires_at: expiresAt,
      consent_collection: { terms_of_service: 'required' as const },
      metadata: {
        booking_id: booking.id,
        policy_version: booking.policy_version_id,
        hold_strategy: booking.hold_strategy,
        tos_text: tosText,
      },
      custom_text: {
        terms_of_service_acceptance: { message: tosText },
      },
    };

    try {
      const session = checkoutMode === 'payment'
        ? await stripe.checkout.sessions.create({
            ...common,
            mode: 'payment',
            line_items: [{
              quantity: 1,
              price_data: {
                currency: booking.currency,
                unit_amount: booking.max_charge_cents,
                product_data: {
                  name: `${lesson.name} — ${new Date(booking.starts_at).toISOString()}`,
                },
              },
            }],
            payment_intent_data: {
              capture_method: 'manual',
              setup_future_usage: 'off_session',
              metadata: { booking_id: booking.id },
            },
            custom_text: {
              ...common.custom_text,
              submit: {
                message: `This is an authorization hold. You pay ${formatMoney(booking.on_time_price_cents, booking.currency)} when on time, up to ${formatMoney(booking.max_charge_cents, booking.currency)} when the policy requires it. Any uncaptured amount is released.`,
              },
            },
          }, { idempotencyKey: `smart-parrot-checkout-${booking.id}` })
        : await stripe.checkout.sessions.create({
            ...common,
            mode: 'setup',
            currency: booking.currency,
            setup_intent_data: {
              metadata: { booking_id: booking.id },
            },
            custom_text: {
              ...common.custom_text,
              submit: {
                message: `No charge today. A hold of up to ${formatMoney(booking.max_charge_cents, booking.currency)} is scheduled before the lesson under the accepted policy.`,
              },
            },
          }, { idempotencyKey: `smart-parrot-checkout-${booking.id}` });

      if (session.livemode || !session.id.startsWith('cs_test_') || !session.url) {
        throw new Error('live_stripe_object_disabled');
      }

      const { data: attached, error: attachError } = await ctx.supabaseAdmin.rpc(
        'attach_booking_checkout',
        {
          p_student_id: studentId,
          p_booking_id: booking.id,
          p_checkout_session_id: session.id,
          p_checkout_mode: session.mode,
          p_expires_at: new Date(session.expires_at * 1000).toISOString(),
        },
      );

      if (attachError) throw new Error(attachError.message);

      return Response.json({
        booking: reservation,
        checkout: {
          id: session.id,
          mode: session.mode,
          url: session.url,
          status: session.status,
          expires_at: session.expires_at,
        },
        checkout_attachment: attached,
      }, { status: reservation.created === true ? 201 : 200 });
    } catch (err) {
      const mapped = mapCheckoutError((err as Error).message);
      return errorResponse(mapped.error, mapped.status);
    }
  }),
};
