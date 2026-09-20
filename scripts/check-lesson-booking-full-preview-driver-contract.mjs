import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  FULL_PREVIEW_EVIDENCE_POLICY,
  FULL_PREVIEW_SCENARIOS,
  FULL_PREVIEW_STAGES,
  assertFullPreviewExecutionAllowed,
  buildFullPreviewRunContract,
  classifyAuthorizationObservation,
  classifyProviderCleanup,
} from './lesson-booking-full-preview-driver-contract.mjs';

const baseGate = {
  writeGate: '1',
  preflightStatus: 'preflight_ready',
  rehearsalReady: true,
  unresolvedCleanupFailures: 0,
  providerIdentityReady: true,
  dailyIdentityReady: true,
  previewRef: 'abcdefghijklmnopqr',
  productionRef: 'zyxwvutsrqponmlkji',
  supabaseUrl: 'https://abcdefghijklmnopqr.supabase.co',
  stripeKey: 'sk_test_contract_only',
};

assert.equal(assertFullPreviewExecutionAllowed(baseGate).allowed, true);
for (const [patch, expected] of [
  [{ writeGate: '0' }, 'full_preview_write_gate_closed'],
  [{ preflightStatus: 'blocked' }, 'full_preview_preflight_not_ready'],
  [{ unresolvedCleanupFailures: 1 }, 'provider_cleanup_unresolved'],
  [{ providerIdentityReady: false }, 'provider_identity_not_ready'],
  [{ dailyIdentityReady: false }, 'daily_identity_not_ready'],
  [{ productionRef: baseGate.previewRef }, 'production_project_refused'],
  [{ supabaseUrl: 'https://wrongref.supabase.co' }, 'preview_project_url_mismatch'],
  [{ stripeKey: 'sk_live_forbidden' }, 'stripe_test_key_required'],
]) {
  assert.throws(() => assertFullPreviewExecutionAllowed({ ...baseGate, ...patch }), new RegExp(expected));
}

const contract = buildFullPreviewRunContract({
  runId: '123e4567-e89b-42d3-a456-426614174000',
  scenario: 'near_term_success',
});
assert.equal(contract.browser_authoritative_transitions, false);
assert.equal(contract.direct_stripe_api_calls_from_driver, false);
assert.equal(contract.direct_daily_api_calls_from_driver, false);
assert.equal(contract.time_authority, 'server_and_provider_only');
assert.equal(contract.money_authority, 'existing_supabase_edge_functions_only');

assert.deepEqual(
  FULL_PREVIEW_STAGES.map((stage) => stage.stage),
  [
    'booking_reservation',
    'stripe_test_authorization',
    'daily_attendance',
    'deterministic_settlement',
    'terminal_evidence_reconciliation',
  ],
);
assert.ok(FULL_PREVIEW_STAGES.every((stage) => stage.direct_provider_write === false));
assert.equal(FULL_PREVIEW_SCENARIOS.near_term_success.stripe_test_payment_method, 'pm_card_visa');
assert.equal(FULL_PREVIEW_SCENARIOS.near_term_success.hold_strategy, 'at_checkout');
assert.equal(FULL_PREVIEW_SCENARIOS.deferred_success.checkout_mode, 'setup');
assert.equal(FULL_PREVIEW_SCENARIOS.near_term_sca.automated, false);
assert.equal(FULL_PREVIEW_SCENARIOS.deferred_hold_failure_recovery.recovery_path, 'fix-payment');
assert.ok(FULL_PREVIEW_EVIDENCE_POLICY.preserve.includes('payment_ledger'));
assert.ok(FULL_PREVIEW_EVIDENCE_POLICY.never_auto_delete.includes('append_only_financial_or_consent_or_attendance_rows'));

assert.equal(classifyAuthorizationObservation({ scenario: 'near_term_success', livemode: false, status: 'requires_capture' }).state, 'authorized_for_manual_capture');
assert.equal(classifyAuthorizationObservation({ scenario: 'near_term_sca', livemode: false, status: 'requires_action' }).state, 'customer_action_required');
assert.equal(classifyAuthorizationObservation({ scenario: 'deferred_hold_failure_recovery', livemode: false, status: 'requires_payment_method' }).state, 'hold_failed_recovery_required');
assert.throws(() => classifyAuthorizationObservation({ scenario: 'near_term_success', livemode: true, status: 'requires_capture' }), /live_stripe_object_disabled/);

assert.deepEqual(classifyProviderCleanup({ dailyRoomDeleted: true, appendOnlyEvidencePreserved: true }), {
  status: 'cleanup_complete', reconciliation_required: false,
});
assert.equal(classifyProviderCleanup({ dailyRoomDeleted: false, appendOnlyEvidencePreserved: true }).reconciliation_required, true);
assert.equal(classifyProviderCleanup({ dailyRoomDeleted: undefined, appendOnlyEvidencePreserved: true }).reason, 'daily_room_delete_ambiguous');
assert.throws(() => classifyProviderCleanup({ dailyRoomDeleted: true, appendOnlyEvidencePreserved: false }), /append_only_evidence_must_be_preserved/);

const createBooking = fs.readFileSync('supabase/functions/create-booking/index.ts', 'utf8');
const placeHolds = fs.readFileSync('supabase/functions/place-holds/index.ts', 'utf8');
const fixPayment = fs.readFileSync('supabase/functions/fix-payment/index.ts', 'utf8');
const checkIn = fs.readFileSync('supabase/functions/check-in/index.ts', 'utf8');
const dailyWebhook = fs.readFileSync('supabase/functions/daily-webhook/index.ts', 'utf8');
const settleLessons = fs.readFileSync('supabase/functions/settle-lessons/index.ts', 'utf8');

function requireAll(text, needles, label) {
  for (const needle of needles) {
    if (!text.includes(needle)) throw new Error(`${label} missing required contract: ${needle}`);
  }
}

requireAll(createBooking, [
  "booking.hold_strategy === 'at_checkout' ? 'payment' : 'setup'",
  "capture_method: 'manual'",
  "setup_future_usage: 'off_session'",
  "mode: 'setup'",
], 'create-booking hold-before/capture-after');
requireAll(placeHolds, [
  'off_session: true',
  "capture_method: 'manual'",
  "paymentIntent.status !== 'requires_capture'",
  "status: 'hold_failed'",
], 'deferred hold worker');
requireAll(fixPayment, [
  'hold_failed',
  "capture_method: 'manual'",
  'smart-parrot-hold-recovery-',
], 'failed-hold recovery');
requireAll(checkIn, [
  "booking.status !== 'hold_placed'",
  'record_server_check_in',
  'Date.now()',
], 'server check-in authority');
requireAll(dailyWebhook, [
  'x-webhook-signature',
  'record_daily_attendance_event',
  'attendance_replay_conflict',
], 'signed Daily attendance');
requireAll(settleLessons, [
  'claim_lesson_settlements',
  'compute_lesson_settlement',
  'finalize_lesson_settlement',
  'smart-parrot-settlement-capture-',
  'smart-parrot-settlement-release-',
  'live_stripe_object_disabled',
], 'deterministic idempotent settlement');

for (const source of [
  fs.readFileSync('scripts/lesson-booking-full-preview-driver-contract.mjs', 'utf8'),
  fs.readFileSync('scripts/lesson-booking-full-preview-preflight.mjs', 'utf8'),
]) {
  if (/\b(?:4[0-9]{15}|5[1-5][0-9]{14}|3[47][0-9]{13})\b/.test(source)) {
    throw new Error('Full preview contract contains a raw card number.');
  }
}

console.log('Phase 4C5C full-preview driver contract/test-evidence lifecycle checks passed.');
