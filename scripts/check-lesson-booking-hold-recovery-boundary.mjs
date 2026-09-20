#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260920070500_lesson_booking_phase1c_deferred_holds.sql', import.meta.url),
  'utf8',
);
const placeHolds = readFileSync(
  new URL('../supabase/functions/place-holds/index.ts', import.meta.url),
  'utf8',
);
const fixPayment = readFileSync(
  new URL('../supabase/functions/fix-payment/index.ts', import.meta.url),
  'utf8',
);
const webhook = readFileSync(
  new URL('../supabase/functions/stripe-webhook/index.ts', import.meta.url),
  'utf8',
);
const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
const cronExample = readFileSync(
  new URL('../supabase/cron/lesson_booking_phase1c.sql.example', import.meta.url),
  'utf8',
);

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

for (const required of [
  'hold_recovery_checkout_session_id',
  'hold_recovery_checkout_expires_at',
  'hold_recovery_attempts',
  'hold_last_error_code',
  'hold_last_error_at',
  'bookings_hold_recovery_checkout_test_only',
  'public.attach_hold_recovery_checkout',
  'public.clear_expired_hold_recovery_checkout',
  "p_checkout_session_id not like 'cs_test_%'",
]) {
  expect(migration.includes(required), `Phase 1C migration missing: ${required}`);
}

for (const signature of [
  'public.attach_hold_recovery_checkout(uuid, uuid, text, timestamptz)',
  'public.clear_expired_hold_recovery_checkout(uuid, text)',
]) {
  const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  expect(
    new RegExp(`revoke all on function ${escaped}[\\s\\S]*?from public, anon, authenticated;[\\s\\S]*?grant execute[\\s\\S]*?to service_role;`, 'i').test(migration),
    `${signature} must be service-role-only`,
  );
}

for (const required of [
  "withSupabase({ auth: 'secret' }",
  "off_session: true",
  "confirm: true",
  "capture_method: 'manual'",
  "idempotencyKey: `smart-parrot-deferred-hold-${booking.id}-${attempt}`",
  ".eq('status', 'card_saved')",
  "status: 'hold_failed'",
  "status: 'hold_placed'",
  "kind: 'hold_failed'",
  "kind: 'hold_placed'",
  'capture_before',
  "cancel_kind: 'hold_failed'",
  "session.status === 'complete'",
  'complete_waiting_webhook',
]) {
  expect(placeHolds.includes(required), `place-holds missing invariant: ${required}`);
}
expect(
  placeHolds.includes("if (paymentIntent.livemode) throw new Error('live_stripe_object_disabled')"),
  'Deferred hold worker must independently reject live PaymentIntents',
);
expect(
  placeHolds.includes("paymentIntent.status !== 'requires_capture'"),
  'Deferred hold worker must accept only authorized PaymentIntents awaiting capture',
);
expect(
  placeHolds.includes("paymentIntent.amount !== booking.max_charge_cents"),
  'Deferred hold worker must verify Stripe amount against the server-owned booking',
);

for (const required of [
  "withSupabase({ auth: 'user' }",
  ".eq('student_id', studentId)",
  "booking.status !== 'hold_failed'",
  "booking.hold_strategy !== 'deferred'",
  "mode: 'payment'",
  "capture_method: 'manual'",
  "setup_future_usage: 'off_session'",
  "hold_recovery: 'true'",
  "idempotencyKey: `smart-parrot-hold-recovery-${booking.id}-${generation}`",
  "'attach_hold_recovery_checkout'",
  "'clear_expired_hold_recovery_checkout'",
  "!session.id.startsWith('cs_test_')",
]) {
  expect(fixPayment.includes(required), `fix-payment missing recovery invariant: ${required}`);
}

for (const required of [
  "kind: 'initial' | 'recovery'",
  "hold_recovery_checkout_session_id",
  "session.metadata?.hold_recovery !== 'true'",
  "applyManualAuthorization(admin, stripe, booking, session, 'recovery')",
  "paymentIntent.status !== 'requires_capture'",
  "paymentIntent.amount !== booking.max_charge_cents",
  "hold_last_error_code: null",
  "hold_recovery_checkout_session_id: null",
]) {
  expect(webhook.includes(required), `Stripe webhook missing recovery invariant: ${required}`);
}

for (const source of [placeHolds, fixPayment, webhook]) {
  expect(!/paymentIntents\.capture\s*\(/.test(source), 'Phase 1C must not capture funds; settlement is a later phase');
  expect(!/sk_(?:live|test)_[A-Za-z0-9]{12,}/.test(source), 'Phase 1C code must not contain literal Stripe secrets');
}

expect(
  /\[functions\.place-holds\][\s\S]*?verify_jwt = false/i.test(config),
  'place-holds must disable platform JWT verification for secret-key service auth',
);
expect(
  /\[functions\.fix-payment\][\s\S]*?verify_jwt = true/i.test(config),
  'fix-payment must keep authenticated-user JWT verification enabled',
);
expect(
  /withSupabase\(\{ auth: 'secret' \}/.test(placeHolds),
  'place-holds must validate a Supabase secret key at the application layer',
);

for (const required of [
  'vault.decrypted_secrets',
  "name = 'lesson_booking_project_url'",
  "name = 'lesson_booking_cron_secret_key'",
  "'apikey'",
  "'/functions/v1/place-holds'",
  "'* * * * *'",
]) {
  expect(cronExample.includes(required), `Cron activation example missing: ${required}`);
}
expect(!/sb_secret_[A-Za-z0-9_-]{12,}/.test(cronExample), 'Cron activation example must not contain a literal Supabase secret key');

if (failures.length) {
  console.error('Lesson booking deferred-hold recovery boundary failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Lesson booking deferred-hold recovery boundary passed (test-only off-session holds, customer-present repair, secret cron auth, no capture).');
