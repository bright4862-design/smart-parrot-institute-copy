import Stripe from 'npm:stripe@^22';
import { withSupabase } from 'npm:@supabase/server@^1';
import { getStripe, stripeObjectId } from '../_shared/stripe.ts';

const cryptoProvider = Stripe.createSubtleCryptoProvider();
const supportedTypes = new Set(['charge.dispute.created','charge.dispute.updated','charge.dispute.closed']);
function response(error: string, status: number) { return Response.json({ error }, { status }); }
function webhookSecret() { const secret=Deno.env.get('STRIPE_DISPUTE_WEBHOOK_SECRET')?.trim()??''; if(!secret.startsWith('whsec_')) throw new Error('stripe_dispute_webhook_configuration_required'); return secret; }
function evidenceDueAt(dispute: Stripe.Dispute) { return dispute.evidence_details?.due_by ? new Date(dispute.evidence_details.due_by*1000).toISOString() : null; }
function validDispute(dispute: Stripe.Dispute) { return dispute.object==='dispute' && !dispute.livemode && dispute.id?.startsWith('du_') && Number.isInteger(dispute.amount) && dispute.amount>=0; }

export default { fetch: withSupabase({ auth:'none' }, async (req,ctx) => {
  if(req.method!=='POST') return response('method_not_allowed',405);
  const signature=req.headers.get('stripe-signature')??''; const rawBody=await req.text(); let event: Stripe.Event; let stripe: Stripe;
  try { stripe=getStripe(); event=await stripe.webhooks.constructEventAsync(rawBody,signature,webhookSecret(),undefined,cryptoProvider); }
  catch { return response('invalid_signature',400); }
  if(event.livemode) return response('live_events_disabled',400);
  if(!supportedTypes.has(event.type)) return Response.json({received:true,ignored:true});
  const eventDispute=event.data.object as Stripe.Dispute;
  if(!validDispute(eventDispute)) return response('live_or_invalid_dispute_disabled',400);
  let currentDispute: Stripe.Dispute;
  try { currentDispute=await stripe.disputes.retrieve(eventDispute.id); }
  catch(error) { console.error('stripe_dispute_refresh_failed',event.id,error instanceof Error?error.message:'unknown_error'); return response('dispute_refresh_failed',503); }
  if(!validDispute(currentDispute)||currentDispute.id!==eventDispute.id) return response('invalid_current_dispute',502);
  const {data,error}=await ctx.supabaseAdmin.rpc('record_stripe_dispute_event_v2',{
    p_provider_event_id:event.id,p_dispute_id:eventDispute.id,p_event_type:event.type,p_event_dispute_status:eventDispute.status,
    p_event_reason:eventDispute.reason,p_event_amount_cents:eventDispute.amount,p_event_currency:eventDispute.currency,
    p_event_payment_intent_id:stripeObjectId(eventDispute.payment_intent as any),p_event_charge_id:stripeObjectId(eventDispute.charge as any),
    p_event_evidence_due_at:evidenceDueAt(eventDispute),p_event_created_at:new Date(event.created*1000).toISOString(),
    p_current_dispute_status:currentDispute.status,p_current_reason:currentDispute.reason,p_current_amount_cents:currentDispute.amount,
    p_current_currency:currentDispute.currency,p_current_payment_intent_id:stripeObjectId(currentDispute.payment_intent as any),
    p_current_charge_id:stripeObjectId(currentDispute.charge as any),p_current_evidence_due_at:evidenceDueAt(currentDispute),
    p_provider_snapshot_fetched_at:new Date().toISOString(),
  });
  if(error) { console.error('stripe_dispute_intake_failed',event.id,error.message); return response('webhook_processing_failed',500); }
  return Response.json({received:true,...data});
}) };
