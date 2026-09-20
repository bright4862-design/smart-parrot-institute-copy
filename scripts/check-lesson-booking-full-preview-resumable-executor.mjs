import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  assertFullPreviewProviderWritesReady,
  buildFullPreviewReadinessManifest,
} from './lesson-booking-full-preview-readiness-manifest.mjs';
import {
  buildPreviewWorkerIntent,
  createResumableFullPreviewExecutor,
} from './lesson-booking-full-preview-resumable-executor.mjs';

const runId = '123e4567-e89b-42d3-a456-426614174611';
const bookingId = '123e4567-e89b-42d3-a456-426614174612';
const nowMs = Date.parse('2026-09-20T21:00:00.000Z');

function jwt(sub, { issuedOffsetSeconds = -60, expiresOffsetSeconds = 1800 } = {}) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const iat = Math.floor(nowMs / 1000) + issuedOffsetSeconds;
  const exp = Math.floor(nowMs / 1000) + expiresOffsetSeconds;
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ sub, iat, exp, role: 'authenticated' })}.contract-signature`;
}

const secrets = Object.freeze({
  publishableKey: 'sb_publishable_contract_preview_key',
  secretKey: 'sb_secret_contract_preview_worker_key',
  studentAccessToken: jwt('00000000-0000-4000-8000-000000000101'),
  adminAccessToken: jwt('00000000-0000-4000-8000-000000000102'),
  stripeSecretKey: 'sk_test_contract_preview_only',
  stripeTestAccountId: 'acct_123456789ABC',
  stripeWebhookSecret: 'whsec_checkout_contract_12345',
  stripeDisputeWebhookSecret: 'whsec_dispute_contract_12345',
  dailyApiKey: 'daily-preview-contract-api-key',
  dailyWebhookId: 'daily-webhook-contract',
  dailyDomainId: 'daily-domain-contract',
  dailyDomainName: 'smart-parrot-preview',
  dailyRoomPrefix: 'sp-preview-booking',
  dailyWebhookHmac: Buffer.from('daily-webhook-hmac-contract-secret').toString('base64'),
  appUrl: 'https://asmartparrot.com',
  termsUrl: 'https://asmartparrot.com/terms',
  providerE2eEnabled: '1',
  rehearsalReady: true,
  providerCleanupState: 'clear',
});

const readyManifest = buildFullPreviewReadinessManifest(secrets, { nowMs });
assert.equal(readyManifest.status, 'ready');
assert.equal(readyManifest.transport_ready, true);
assert.equal(readyManifest.provider_write_ready, true);
assert.equal(readyManifest.secrets_exposed, false);
assert.equal(assertFullPreviewProviderWritesReady(readyManifest), readyManifest);

const serializedManifest = JSON.stringify(readyManifest);
for (const secret of [
  secrets.publishableKey,
  secrets.secretKey,
  secrets.studentAccessToken,
  secrets.adminAccessToken,
  secrets.stripeSecretKey,
  secrets.stripeWebhookSecret,
  secrets.stripeDisputeWebhookSecret,
  secrets.dailyApiKey,
  secrets.dailyWebhookHmac,
]) {
  assert.equal(serializedManifest.includes(secret), false, `readiness manifest leaked credential ${secret.slice(0, 8)}`);
}

assert.throws(
  () => buildFullPreviewReadinessManifest({ ...secrets, stripeSecretKey: 'sk_live_forbidden_contract' }, { nowMs }),
  /live_stripe_key_refused/,
);

const wrongKeyClasses = buildFullPreviewReadinessManifest({
  ...secrets,
  publishableKey: secrets.secretKey,
  secretKey: secrets.publishableKey,
}, { nowMs });
assert.equal(wrongKeyClasses.transport_ready, false);
assert.equal(wrongKeyClasses.checks.supabase_publishable_key.status, 'supabase_publishable_key_class_mismatch');
assert.equal(wrongKeyClasses.checks.supabase_backend_secret_key.status, 'supabase_secret_key_class_mismatch');

const expiredStudent = buildFullPreviewReadinessManifest({
  ...secrets,
  studentAccessToken: jwt('00000000-0000-4000-8000-000000000101', { expiresOffsetSeconds: -1 }),
}, { nowMs });
assert.equal(expiredStudent.transport_ready, false);
assert.equal(expiredStudent.checks.student_session.status, 'student_session_expired_or_expiring');

const missingAdmin = buildFullPreviewReadinessManifest({ ...secrets, adminAccessToken: '' }, { nowMs });
assert.equal(missingAdmin.transport_ready, false);
assert.equal(missingAdmin.checks.admin_session.status, 'admin_session_missing');

const samePrincipal = buildFullPreviewReadinessManifest({
  ...secrets,
  adminAccessToken: jwt('00000000-0000-4000-8000-000000000101'),
}, { nowMs });
assert.equal(samePrincipal.transport_ready, false);
assert.equal(samePrincipal.checks.distinct_student_admin_sessions.status, 'student_admin_sessions_must_be_distinct');

const cleanupAmbiguous = buildFullPreviewReadinessManifest({ ...secrets, providerCleanupState: 'ambiguous' }, { nowMs });
assert.equal(cleanupAmbiguous.provider_write_ready, false);
assert.equal(cleanupAmbiguous.checks.provider_cleanup_state.status, 'provider_cleanup_ambiguous');

function runSnapshot(overrides = {}) {
  return {
    schema_version: 1,
    run_id: runId,
    scenario: 'near_term_success',
    booking_id: bookingId,
    state: 'awaiting_checkout_completion',
    pause_reason: 'checkout_completion',
    terminal: false,
    revision: 5,
    last_booking_status: 'pending_checkout',
    last_observed_at: '2026-09-20T21:00:00.000Z',
    completed_at: null,
    replay: false,
    ...overrides,
  };
}

const customerCalls = [];
const customerShell = {
  refreshRun: async () => {
    customerCalls.push('refresh');
    return runSnapshot();
  },
  runServerStep: async (call) => customerCalls.push(call),
};
const customerExecutor = createResumableFullPreviewExecutor({
  shell: customerShell,
  readinessManifest: readyManifest,
  workerWriteGate: '1',
});
const paused1 = await customerExecutor.resume({ runId, expectedRevision: 5 });
const paused2 = await customerExecutor.resume({ runId, expectedRevision: 5 });
assert.equal(paused1.status, 'paused');
assert.equal(paused1.reason, 'checkout_completion');
assert.equal(paused1.customer_action.requires_customer_present_session, true);
assert.equal(paused1.customer_action.automation_may_execute, false);
assert.equal(paused2.status, 'paused');
assert.equal(customerCalls.filter((call) => typeof call === 'object').length, 0);

const staleCalls = [];
const staleExecutor = createResumableFullPreviewExecutor({
  shell: {
    refreshRun: async () => {
      staleCalls.push('refresh');
      return runSnapshot({ state: 'awaiting_deferred_hold_worker', pause_reason: 'deferred_hold_worker', revision: 8, last_booking_status: 'card_saved' });
    },
    runServerStep: async (call) => staleCalls.push(call),
  },
  readinessManifest: readyManifest,
  workerWriteGate: '1',
});
const stale = await staleExecutor.resume({ runId, expectedRevision: 7 });
assert.equal(stale.status, 'stale_revision');
assert.equal(stale.authoritative_revision, 8);
assert.equal(stale.server_write_performed, false);
assert.equal(staleCalls.filter((call) => typeof call === 'object').length, 0);

const terminalCalls = [];
const terminalExecutor = createResumableFullPreviewExecutor({
  shell: {
    refreshRun: async () => {
      terminalCalls.push('refresh');
      return runSnapshot({
        state: 'complete',
        pause_reason: null,
        terminal: true,
        revision: 11,
        last_booking_status: 'settled',
        completed_at: '2026-09-20T21:05:00.000Z',
        replay: true,
      });
    },
    runServerStep: async (call) => terminalCalls.push(call),
  },
  readinessManifest: readyManifest,
  workerWriteGate: '1',
});
const terminal = await terminalExecutor.resume({ runId, expectedRevision: 11 });
assert.equal(terminal.status, 'terminal');
assert.equal(terminal.replay, true);
assert.equal(terminal.server_write_performed, false);
assert.equal(terminalCalls.filter((call) => typeof call === 'object').length, 0);

const dueSnapshot = runSnapshot({
  scenario: 'deferred_success',
  state: 'awaiting_deferred_hold_worker',
  pause_reason: 'deferred_hold_worker',
  revision: 6,
  last_booking_status: 'card_saved',
});
const dryIntent = buildPreviewWorkerIntent(dueSnapshot, cleanupAmbiguous, { workerWriteGate: '1' });
assert.equal(dryIntent.execution, 'dry_run_only');
assert.equal(dryIntent.provider_write_ready, false);

const gateClosedCalls = [];
const gateClosedExecutor = createResumableFullPreviewExecutor({
  shell: {
    refreshRun: async () => dueSnapshot,
    runServerStep: async (call) => gateClosedCalls.push(call),
  },
  readinessManifest: readyManifest,
  workerWriteGate: '0',
});
const gateClosed = await gateClosedExecutor.resume({ runId, expectedRevision: 6 });
assert.equal(gateClosed.status, 'paused');
assert.equal(gateClosed.reason, 'worker_write_gate_closed');
assert.equal(gateClosed.worker_intent.execution, 'dry_run_only');
assert.equal(gateClosedCalls.length, 0);

const blockedProviderCalls = [];
const blockedProviderExecutor = createResumableFullPreviewExecutor({
  shell: {
    refreshRun: async () => dueSnapshot,
    runServerStep: async (call) => blockedProviderCalls.push(call),
  },
  readinessManifest: cleanupAmbiguous,
  workerWriteGate: '1',
});
const blockedProvider = await blockedProviderExecutor.resume({ runId, expectedRevision: 6 });
assert.equal(blockedProvider.status, 'paused');
assert.equal(blockedProvider.reason, 'provider_configuration_required');
assert.equal(blockedProviderCalls.length, 0);

const workerCalls = [];
let refreshCount = 0;
const workerExecutor = createResumableFullPreviewExecutor({
  shell: {
    refreshRun: async () => {
      refreshCount += 1;
      if (refreshCount === 1) return dueSnapshot;
      return runSnapshot({
        scenario: 'deferred_success',
        state: 'awaiting_attendance_evidence',
        pause_reason: 'attendance_evidence',
        revision: 7,
        last_booking_status: 'hold_placed',
        last_observed_at: '2026-09-20T21:01:00.000Z',
      });
    },
    runServerStep: async (call) => {
      workerCalls.push(call);
      return { holds: [{ id: bookingId, status: 'hold_placed' }] };
    },
  },
  readinessManifest: readyManifest,
  workerWriteGate: '1',
});
const workerResult = await workerExecutor.resume({ runId, expectedRevision: 6 });
assert.equal(workerResult.status, 'server_step_complete');
assert.equal(workerResult.server_write_performed, true);
assert.equal(workerResult.worker_operation, 'place_deferred_holds');
assert.equal(workerResult.previous_revision, 6);
assert.equal(workerResult.revision, 7);
assert.equal(workerCalls.length, 1);
assert.deepEqual(workerCalls[0], { operation: 'place_deferred_holds', payload: {} });
assert.equal(refreshCount, 2);

// A retry carrying the old revision must refresh first and stop before a second write.
const duplicateRetryCalls = [];
const duplicateRetryExecutor = createResumableFullPreviewExecutor({
  shell: {
    refreshRun: async () => runSnapshot({
      scenario: 'deferred_success',
      state: 'awaiting_attendance_evidence',
      pause_reason: 'attendance_evidence',
      revision: 7,
      last_booking_status: 'hold_placed',
    }),
    runServerStep: async (call) => duplicateRetryCalls.push(call),
  },
  readinessManifest: readyManifest,
  workerWriteGate: '1',
});
const duplicateRetry = await duplicateRetryExecutor.resume({ runId, expectedRevision: 6 });
assert.equal(duplicateRetry.status, 'stale_revision');
assert.equal(duplicateRetryCalls.length, 0);

const readinessSource = fs.readFileSync('scripts/lesson-booking-full-preview-readiness-manifest.mjs', 'utf8');
const executorSource = fs.readFileSync('scripts/lesson-booking-full-preview-resumable-executor.mjs', 'utf8');
for (const source of [readinessSource, executorSource]) {
  assert.ok(!source.includes('api.stripe.com'));
  assert.ok(!source.includes('api.daily.co'));
  assert.ok(!source.includes('paymentIntents.create('));
  assert.ok(!source.includes('paymentIntents.capture('));
}
assert.ok(!executorSource.includes('Date.now('), 'resumable executor must not make time-authoritative decisions');
assert.ok(executorSource.includes('refreshRun'), 'executor must refresh server-authoritative state before decisions');
assert.ok(readinessSource.includes('live_stripe_key_refused'));
assert.ok(readinessSource.includes('secrets_exposed: false'));

console.log('Phase 4C5F resumable preview executor/credential readiness checks passed.');
