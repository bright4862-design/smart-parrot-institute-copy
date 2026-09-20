#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260920061500_lesson_booking_phase1b_checkout_webhook.sql', import.meta.url),
  'utf8',
);
const createBooking = readFileSync(
  new URL('../supabase/functions/create-booking/index.ts', import.meta.url),
  'utf8',
);
const sharedStripe = readFileSync(
  new URL('../supabase/functions/_shared/stripe.ts', import.meta.url),
  'utf8',
);
const webhook = readFileSync(
  new URL('../supabase/functions/stripe-webhook/index.ts', import.meta.url),
  'utf8',
);
const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

for (const required of [
  'stripe_setup_intent_id',
  'stripe_checkout_mode',
  'checkout_expires_at',
  'consents_stripe_checkout_session_unique',
  'ledger_kind_stripe_object_unique',
  'public.attach_booking_checkout',
  "p_checkout_session_id not like 'cs_test_%'",
  "v_booking.hold_strategy = 'at_checkout'",
  "v_booking.hold_strategy = 'deferred'",
]) {
  expect(migration.includes(required), `Phase 1B migration missing: ${required}`);
}

expect(
  /revoke all on function public\.attach_booking_checkout[\s\S]*?from public, anon, authenticated;[\s\S]*?grant execute[\s\S]*?to service_role;/i.test(migration),
  'Checkout attachment RPC must be service-role-only',
);

for (const required of [
  "key.startsWith('sk_test_')",
  'smart-parrot-customer-${userId}',
  "from('stripe_links')",
  'checkoutAuthorizationText',
]) {
  expect(sharedStripe.includes(required), `Stripe helper missing safety/idempotency primitive: ${required}`);
}
expect(!/sk_(?:live|test)_[A-Za-z0-9]{12,}/.test(sharedStripe), 'Stripe helper must not contain a literal API secret');

for (const required of [
  "mode: 'payment'",
  "mode: 'setup'",
  "capture_method: 'manual'",
  "setup_future_usage: 'off_session'",
  "consent_collection: { terms_of_service: 'required'",
  "payment_method_types: ['card']",
  "idempotencyKey: `smart-parrot-checkout-${booking.id}`",
  "ctx.supabaseAdmin.rpc(\n        'attach_booking_checkout'",
]) {
  expect(createBooking.includes(required), `create-booking missing Checkout boundary: ${required}`);
}
expect(
  createBooking.indexOf("create_booking_reservation") < createBooking.indexOf("stripe.checkout.sessions.create"),
  'Stripe Checkout must be created only after the atomic reservation boundary',
);
expect(
  !/body\.(?:student_id|tutor_id|on_time_price_cents|max_charge_cents|currency|policy_version_id|duration_minutes)/.test(createBooking),
  'Checkout setup must not trust browser-owned identity, price, policy, currency, tutor, or duration',
);

for (const required of [
  "withSupabase({ auth: 'none' }",
  "req.headers.get('stripe-signature')",
  'const rawBody = await req.text()',
  'constructEventAsync(',
  'if (event.livemode)',
  "from('stripe_events')",
  "case 'checkout.session.completed'",
  "case 'checkout.session.expired'",
  "paymentIntent.status !== 'requires_capture'",
  "setupIntent.status !== 'succeeded'",
  "status: 'hold_placed'",
  "status: 'card_saved'",
  "consent?.terms_of_service !== 'accepted'",
  "processed_at: new Date().toISOString()",
]) {
  expect(webhook.includes(required), `Stripe webhook missing invariant: ${required}`);
}

expect(!/paymentIntents\.capture\(/.test(webhook), 'Phase 1B webhook must not capture funds; settlement is a later phase');
expect(
  /webhooks\.constructEventAsync\([\s\S]*?switch \(event\.type\)/.test(webhook),
  'Webhook signature must be verified before event dispatch',
);
expect(
  /\[functions\.stripe-webhook\][\s\S]*?verify_jwt = false/i.test(config),
  'Stripe webhook must disable Supabase JWT verification and authenticate with Stripe signature',
);
expect(
  /\[functions\.create-booking\][\s\S]*?verify_jwt = true/i.test(config),
  'Authenticated create-booking must keep Supabase JWT verification enabled',
);

if (failures.length) {
  console.error('Lesson booking Stripe boundary failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Lesson booking Stripe boundary passed (test-only Checkout, manual authorization, signed idempotent webhook, no capture).');
