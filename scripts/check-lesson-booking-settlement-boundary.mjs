#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260920090500_lesson_booking_phase2b_settlement.sql', import.meta.url),
  'utf8',
);
const worker = readFileSync(
  new URL('../supabase/functions/settle-lessons/index.ts', import.meta.url),
  'utf8',
);
const scenarios = readFileSync(
  new URL('../supabase/tests/lesson_booking_settlement_scenarios.sql', import.meta.url),
  'utf8',
);
const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

for (const required of [
  'public.compute_lesson_settlement',
  'public.claim_lesson_settlements',
  'public.mark_lesson_settlement_failed',
  'public.finalize_lesson_settlement',
  "b.status not in ('hold_placed', 'awaiting_settlement', 'settled')",
  "e.actor = 'student'",
  "e.actor = 'tutor'",
  "e.kind in ('joined', 'checked_in')",
  "v_last_tutor_kind = 'left'",
  "'tutor_no_show'::public.lesson_outcome",
  "'no_show'::public.lesson_outcome",
  "'tutor_late'::public.lesson_outcome",
  "'late'::public.lesson_outcome",
  "'on_time'::public.lesson_outcome",
  'for update of b skip locked',
  "status = 'awaiting_settlement'",
  "settlement_claimed_at <= p_now - interval '10 minutes'",
  'settlement_attempts = b.settlement_attempts + 1',
  'stale_settlement_attempt',
  'settlement_amount_mismatch',
  "kind = 'credit_issued'",
  "'captured',",
  "'hold_released',",
]) {
  expect(migration.includes(required), `Phase 2B migration missing invariant: ${required}`);
}

for (const signature of [
  'public.compute_lesson_settlement(uuid)',
  'public.claim_lesson_settlements(timestamptz, int)',
  'public.mark_lesson_settlement_failed(uuid, int, text)',
  'public.finalize_lesson_settlement(uuid, int, int, int)',
]) {
  const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  expect(
    new RegExp(`revoke all on function ${escaped}[\\s\\S]*?from public, anon, authenticated;[\\s\\S]*?grant execute on function ${escaped} to service_role;`, 'i').test(migration),
    `${signature} must remain service-role-only`,
  );
}

for (const required of [
  "withSupabase({ auth: 'secret' }",
  'getStripe()',
  "'claim_lesson_settlements'",
  "'compute_lesson_settlement'",
  "'finalize_lesson_settlement'",
  "'mark_lesson_settlement_failed'",
  'intent.livemode',
  "intent.status === 'succeeded'",
  "intent.status !== 'requires_capture'",
  'intent.amount_capturable < amountCents',
  'amount_to_capture: amountCents',
  'final_capture: true',
  'smart-parrot-settlement-capture-${claim.booking_id}',
  'smart-parrot-settlement-release-${claim.booking_id}',
  'stripe.paymentIntents.cancel(',
  'stripe.paymentIntents.capture(',
  'intent.amount_received !== amountCents',
]) {
  expect(worker.includes(required), `settle-lessons missing invariant: ${required}`);
}

expect(
  worker.indexOf("rpc('compute_lesson_settlement'") < worker.indexOf('captureExactAmount(stripe, claim, amountCents)'),
  'Settlement amount must be computed before Stripe capture/release',
);
expect(
  worker.indexOf('captureExactAmount(stripe, claim, amountCents)') < worker.indexOf("'finalize_lesson_settlement'"),
  'Stripe result must be verified before database finalization',
);
expect(!/sk_(?:live|test)_[A-Za-z0-9]{12,}/.test(worker), 'Settlement worker must not contain a literal Stripe secret');
expect(!worker.includes('getStripeWebhookSecret'), 'Settlement worker must not depend on webhook credentials');

for (const scenario of [
  "'on_time'::public.lesson_outcome, 3000",
  "'late'::public.lesson_outcome, 3600",
  "'no_show'::public.lesson_outcome, 3600",
  "'tutor_late'::public.lesson_outcome, 2600",
  "'tutor_no_show'::public.lesson_outcome, 0",
  "'tutor_late'::public.lesson_outcome, 2000",
  'public.claim_lesson_settlements',
  'public.finalize_lesson_settlement',
  "kind = 'hold_released'",
  "kind = 'credit_issued'",
  "f ->> 'idempotent'",
]) {
  expect(scenarios.includes(scenario), `Settlement behavior scenarios missing: ${scenario}`);
}

expect(
  /\[functions\.settle-lessons\][\s\S]*?verify_jwt = false/i.test(config),
  'settle-lessons must disable platform JWT verification and authenticate service calls in the handler',
);

if (failures.length) {
  console.error('Lesson booking settlement boundary failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Lesson booking settlement boundary passed (deterministic policy outcomes, lease/attempt claim, test-only exact capture/release, atomic ledger finalization).');
