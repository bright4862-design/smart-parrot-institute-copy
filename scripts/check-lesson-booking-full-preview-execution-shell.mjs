import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  AUTHORITATIVE_SERVER_OPERATIONS,
  buildCleanupDisposition,
  buildPreviewFixtureNamespace,
  classifyPreviewProgress,
  createFullPreviewExecutionShell,
} from './lesson-booking-full-preview-execution-shell.mjs';
import { assertMinimizedPreviewObservation } from './lesson-booking-full-preview-observer.mjs';

const runId = '123e4567-e89b-42d3-a456-426614174111';
const lessonTypeId = '123e4567-e89b-42d3-a456-426614174222';
const bookingId = '123e4567-e89b-42d3-a456-426614174333';

const fixture = buildPreviewFixtureNamespace(runId);
assert.equal(fixture.run_id, runId);
assert.equal(fixture.contains_customer_pii, false);
assert.ok(fixture.prefix.startsWith('sp-preview-'));
assert.ok(fixture.daily_room_prefix.startsWith(fixture.prefix));

const baseObservation = {
  schema_version: 1,
  booking_id: bookingId,
  booking_status: 'pending_checkout',
  hold_strategy: 'at_checkout',
  checkout_mode: 'payment',
  authorization_state: 'pending_checkout',
  has_payment_intent: false,
  has_capture_deadline: false,
  consent_evidence_count: 1,
  payment_ledger_count: 0,
  attendance_evidence_count: 0,
  student_attendance_count: 0,
  tutor_attendance_count: 0,
  settlement_evidence_count: 0,
  hold_attempts: 0,
  hold_error_present: false,
  settlement_attempts: 0,
  settlement_error_present: false,
  lesson_end_passed: false,
  settled: false,
  outcome: null,
  observed_at: '2026-09-20T19:00:00.000Z',
};
assert.equal(assertMinimizedPreviewObservation(baseObservation).booking_status, 'pending_checkout');
assert.throws(
  () => assertMinimizedPreviewObservation({ ...baseObservation, stripe_payment_intent_id: 'pi_secret' }),
  /forbidden_preview_observer_field/,
);
assert.throws(
  () => assertMinimizedPreviewObservation({ ...baseObservation, raw: { any: 'payload' } }),
  /forbidden_preview_observer_field/,
);

assert.equal(classifyPreviewProgress(baseObservation, 'near_term_success').state, 'awaiting_checkout_completion');
assert.equal(classifyPreviewProgress(baseObservation, 'near_term_sca').state, 'awaiting_customer_authentication');
assert.equal(
  classifyPreviewProgress({ ...baseObservation, booking_status: 'card_saved', hold_strategy: 'deferred', checkout_mode: 'setup' }, 'deferred_success').next_operation,
  'place_deferred_holds',
);
assert.equal(
  classifyPreviewProgress({ ...baseObservation, booking_status: 'hold_failed', authorization_state: 'hold_failed', hold_error_present: true }, 'deferred_hold_failure_recovery').state,
  'awaiting_customer_payment_recovery',
);
assert.equal(
  classifyPreviewProgress({
    ...baseObservation,
    booking_status: 'hold_placed',
    authorization_state: 'authorized_manual_capture',
    has_payment_intent: true,
    has_capture_deadline: true,
  }, 'near_term_success').state,
  'awaiting_attendance_evidence',
);
assert.equal(
  classifyPreviewProgress({
    ...baseObservation,
    booking_status: 'awaiting_settlement',
    authorization_state: 'authorized_manual_capture',
    has_payment_intent: true,
    has_capture_deadline: true,
    attendance_evidence_count: 2,
    student_attendance_count: 1,
    tutor_attendance_count: 1,
    lesson_end_passed: true,
  }, 'near_term_success').next_operation,
  'settle_due_lessons',
);
assert.equal(
  classifyPreviewProgress({
    ...baseObservation,
    booking_status: 'settled',
    authorization_state: 'settled',
    has_payment_intent: true,
    has_capture_deadline: true,
    attendance_evidence_count: 2,
    student_attendance_count: 1,
    tutor_attendance_count: 1,
    settlement_evidence_count: 1,
    lesson_end_passed: true,
    settled: true,
    outcome: 'on_time',
    settlement_attempts: 1,
  }, 'near_term_success').terminal,
  true,
);

const calls = [];
const fakeTransport = async (call) => {
  calls.push(call);
  if (call.operation === 'reserve_booking') {
    return { booking: { booking_id: bookingId }, checkout: { status: 'open' } };
  }
  if (call.operation === 'observe_run') return baseObservation;
  if (call.operation === 'settle_due_lessons') return { settlements: [] };
  throw new Error(`unexpected fake operation ${call.operation}`);
};

const shell = createFullPreviewExecutionShell({ invokeServer: fakeTransport });
const gate = {
  writeGate: '1',
  shellGate: '1',
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

await shell.reserve({
  gate,
  runId,
  scenario: 'near_term_success',
  lessonTypeId,
  startsAt: '2026-09-22T12:00:00.000Z',
});
await shell.reserve({
  gate,
  runId,
  scenario: 'near_term_success',
  lessonTypeId,
  startsAt: '2026-09-22T12:00:00.000Z',
});
const reservationCalls = calls.filter((call) => call.operation === 'reserve_booking');
assert.equal(reservationCalls.length, 2);
assert.ok(reservationCalls.every((call) => call.payload.request_id === runId));
assert.ok(reservationCalls.every((call) => call.target === 'create-booking'));
assert.ok(reservationCalls.every((call) => call.auth === 'student_user'));

await assert.rejects(
  () => shell.reserve({
    gate: { ...gate, shellGate: '0' },
    runId,
    scenario: 'near_term_success',
    lessonTypeId,
    startsAt: '2026-09-22T12:00:00.000Z',
  }),
  /full_preview_shell_gate_closed/,
);
await assert.rejects(
  () => shell.reserve({
    gate: { ...gate, productionRef: gate.previewRef },
    runId,
    scenario: 'near_term_success',
    lessonTypeId,
    startsAt: '2026-09-22T12:00:00.000Z',
  }),
  /production_project_refused/,
);

const observed = await shell.observe({ bookingId, scenario: 'near_term_success' });
assert.equal(observed.progress.state, 'awaiting_checkout_completion');

await shell.runServerStep({ operation: 'settle_due_lessons' });
assert.equal(calls.at(-1).target, 'settle-lessons');
await assert.rejects(
  () => shell.runServerStep({ operation: 'stripe_capture', payload: {} }),
  /unsupported_preview_server_step/,
);

const ambiguousCleanup = buildCleanupDisposition({
  dailyRoomDeleted: undefined,
  appendOnlyEvidencePreserved: true,
  runId,
});
assert.equal(ambiguousCleanup.status, 'cleanup_incomplete');
assert.equal(ambiguousCleanup.reconciliation_intent.operation, 'reconcile_cleanup');
assert.equal(ambiguousCleanup.reconciliation_intent.automatic_provider_retry, false);

assert.equal(AUTHORITATIVE_SERVER_OPERATIONS.reserve_booking.target, 'create-booking');
assert.equal(AUTHORITATIVE_SERVER_OPERATIONS.observe_run.target, 'admin_observe_booking_preview_run');

const shellSource = fs.readFileSync('scripts/lesson-booking-full-preview-execution-shell.mjs', 'utf8');
assert.ok(!shellSource.includes('api.stripe.com'));
assert.ok(!shellSource.includes('api.daily.co'));
assert.ok(!shellSource.includes('paymentIntents.capture('));
assert.ok(!shellSource.includes('paymentIntents.create('));
assert.ok(!shellSource.includes('/rooms'));

const migration = fs.readFileSync(
  'supabase/migrations/20260920210500_lesson_booking_phase4c5d_preview_observer.sql',
  'utf8',
);
for (const forbiddenOutputKey of [
  "'stripe_payment_intent_id'",
  "'stripe_checkout_session_id'",
  "'stripe_payment_method_id'",
  "'video_room_name'",
  "'raw'",
  "'ip'",
  "'user_agent'",
]) {
  assert.ok(!migration.includes(forbiddenOutputKey), `Observer output contract leaked ${forbiddenOutputKey}`);
}
assert.ok(migration.includes("'has_payment_intent'"));
assert.ok(migration.includes("'attendance_evidence_count'"));
assert.ok(migration.includes("'settlement_evidence_count'"));
assert.ok(migration.includes('private.smart_parrot_require_admin'));

console.log('Phase 4C5D disabled execution shell/minimized observer checks passed.');
