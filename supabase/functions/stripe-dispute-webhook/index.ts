import Stripe from 'npm:stripe@^22';
import { withSupabase } from 'npm:@supabase/server@^1';
import { getStripe, stripeObjectId } from '../_shared/stripe.ts';

const cryptoProvider = Stripe.createSubtleCryptoProvider();
const supportedTypes = new Set([
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
]);

function response(error: string, status: number) {
  return Response.json({ error }, { status });
}

function webhookSecret() {
  const secret = Deno.env.get('STRIPE_DISPUTE_WEBHOOK_SECRET')?.trim() ?? '';
  if (!secret.startsWith('whsec_')) throw new Error('stripe_dispute_webhook_configuration_required');
  return secret;
}

export default {
  fetch: withSupabase({ auth: 'none' }, async (req, ctx) => {
    if (req.method !== 'POST') return response('method_not_allowed', 405);

    const signature = req.headers.get('stripe-signature') ?? '';
    const rawBody = await req.text();
    let event: Stripe.Event;

    try {
      const stripe = getStripe();
      event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        webhookSecret(),
        undefined,
        cryptoProvider,
      );
    } catch {
      return response('invalid_signature', 400);
    }

    if (event.livemode) return response('live_events_disabled', 400);
    if (!supportedTypes.has(event.type)) return Response.json({ received: true, ignored: true });

    const dispute = event.data.object as Stripe.Dispute;
    if (dispute.object !== 'dispute' || dispute.livemode) return response('live_or_invalid_dispute_disabled', 400);
    if (!dispute.id?.startsWith('du_') || !Number.isInteger(dispute.amount) || dispute.amount < 0) {
      return response('invalid_dispute_payload', 400);
    }

    const paymentIntentId = stripeObjectId(dispute.payment_intent as any);
    const chargeId = stripeObjectId(dispute.charge as any);
    const dueAt = dispute.evidence_details?.due_by
      ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
      : null;
    const eventCreatedAt = new Date(event.created * 1000).toISOString();

    const { data, error } = await ctx.supabaseAdmin.rpc('record_stripe_dispute_event', {
      p_provider_event_id: event.id,
      p_dispute_id: dispute.id,
      p_event_type: event.type,
      p_dispute_status: dispute.status,
      p_reason: dispute.reason,
      p_amount_cents: dispute.amount,
      p_currency: dispute.currency,
      p_payment_intent_id: paymentIntentId,
      p_charge_id: chargeId,
      p_evidence_due_at: dueAt,
      p_event_created_at: eventCreatedAt,
    });

    if (error) {
      console.error('stripe_dispute_intake_failed', event.id, error.message);
      return response('webhook_processing_failed', 500);
    }

    return Response.json({ received: true, ...data });
  }),
};
