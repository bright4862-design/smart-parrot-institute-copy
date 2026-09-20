#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const migration = [
  '20260920101000_lesson_booking_phase3a_cancellation_schema.sql',
  '20260920101100_lesson_booking_phase3a_cancellation_prepare.sql',
  '20260920101200_lesson_booking_phase3a_cancellation_finalize.sql',
].map((name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')).join('\n');
const handler = readFileSync(new URL('../supabase/functions/cancel-booking/index.ts', import.meta.url), 'utf8');
const scenarios = readFileSync(new URL('../supabase/tests/lesson_booking_cancellation_scenarios.sql', import.meta.url), 'utf8');
const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
const legalNotes = readFileSync(new URL('../docs/lesson-booking-france-withdrawal-notes-2026-09-20.md', import.meta.url), 'utf8');

const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

for (const required of [
  'public.booking_cancellation_requests', 'public.compliance_notice_outbox',
  'public.prepare_booking_cancellation', 'public.mark_booking_cancellation_failed',
  'public.finalize_booking_cancellation', "p_kind not in ('cancel','withdrawal')",
  "withdrawal_mode<>'service_14d'", "raise exception 'withdrawal_not_enabled_for_policy'",
  "raise exception 'withdrawal_window_expired'", "p.config->>'free_cancel_hours'",
  "p.config->>'late_cancel_hours'", "p.config->>'late_cancel_pct'", "action:='capture'",
  "action:='release'", 'b.cancellation_requested_at is null', 'for update of b skip locked',
  "kind in ('captured','hold_released')", "'withdrawal_acknowledgement'", "'cancellation_confirmation'",
]) expect(migration.includes(required), `Phase 3A migration missing invariant: ${required}`);

for (const signature of [
  'public.prepare_booking_cancellation(uuid,uuid,text,timestamptz,text,text)',
  'public.mark_booking_cancellation_failed(uuid,int,text)',
  'public.finalize_booking_cancellation(uuid,int,int,int)',
]) {
  expect(
    migration.includes(`revoke all on function ${signature}`) && migration.includes(`grant execute on function ${signature}`),
    `${signature} must remain service-role-only`,
  );
}

for (const required of [
  "withSupabase({ auth: 'user' }", "'prepare_booking_cancellation'", "'finalize_booking_cancellation'",
  "'mark_booking_cancellation_failed'", 'ctx.userClaims?.id', 'synchronizeOpenCheckoutBeforeCancellation',
  'stripe.checkout.sessions.expire(session.id)', "session.status === 'complete'", 'intent.livemode',
  "intent.status !== 'requires_capture'", 'intent.amount_capturable < amountCents',
  'amount_to_capture: amountCents', 'final_capture: true', 'stripe.paymentIntents.cancel(',
  'stripe.paymentIntents.capture(', 'smart-parrot-cancellation-capture-${claim.booking_id}',
  'smart-parrot-cancellation-release-${claim.booking_id}',
]) expect(handler.includes(required), `cancel-booking missing invariant: ${required}`);

expect(
  handler.indexOf('synchronizeOpenCheckoutBeforeCancellation(') < handler.indexOf("'prepare_booking_cancellation'"),
  'Checkout state must be synchronized before cancellation amount is frozen',
);
expect(
  handler.indexOf("'prepare_booking_cancellation'") < handler.indexOf('applyStripeCancellation(stripe, claim)'),
  'Database must compute cancellation amount before Stripe capture/release',
);
expect(
  handler.indexOf('applyStripeCancellation(stripe, claim)') < handler.indexOf("'finalize_booking_cancellation'"),
  'Stripe result must be verified before database finalization',
);
expect(!/sk_(?:live|test)_[A-Za-z0-9]{12,}/.test(handler), 'Cancellation handler must not contain a literal Stripe secret');
expect(!handler.includes('Date.now()'), 'Cancellation fee timing must not use handler clock arithmetic');

for (const scenario of [
  "'cancelled_free'", "'cancelled_late'", "'cancelled_very_late'", "'cancelled_by_tutor'",
  "'withdrawal',", 'withdrawal_window_expired', 'withdrawal_not_enabled_for_policy',
  "payment_action'<>'release'", "payment_action'<>'capture'", 'public.finalize_booking_cancellation',
  "kind='withdrawal_acknowledgement'",
]) expect(scenarios.includes(scenario), `Cancellation behavior scenarios missing: ${scenario}`);

expect(/\[functions\.cancel-booking\][\s\S]*?verify_jwt = true/i.test(config), 'cancel-booking must keep platform JWT verification enabled');
for (const article of ['L221-18','L221-21','L221-25','L221-28','D221-5','2023/2673']) {
  expect(legalNotes.includes(article), `France/EU research note missing ${article}`);
}
expect(
  legalNotes.includes('not legal advice') && legalNotes.includes('French consumer-law review'),
  'Legal notes must preserve the counsel-review release gate',
);

if (failures.length) {
  console.error('Lesson booking cancellation/compliance boundary failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Lesson booking cancellation/compliance boundary passed (server policy/time, exact test-only capture/release, provider-session synchronization, withdrawal fail-closed switch, immutable acknowledgement outbox).');
