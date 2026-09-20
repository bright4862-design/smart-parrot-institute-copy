import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runFullPreviewOperatorBootstrap } from './lesson-booking-full-preview-operator-bootstrap.mjs';

const nowMs = Date.parse('2026-09-20T22:40:00.000Z');
const runId = '123e4567-e89b-42d3-a456-426614174721';
const bookingId = '123e4567-e89b-42d3-a456-426614174722';
const studentSubject = '00000000-0000-4000-8000-000000000201';
const adminSubject = '00000000-0000-4000-8000-000000000202';

function jwt(sub) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const iat = Math.floor(nowMs / 1000) - 60;
  const exp = Math.floor(nowMs / 1000) + 1800;
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ sub, iat, exp, role: 'authenticated' })}.contract-signature`;
}

const readinessInput = Object.freeze({
  previewRef: 'mrzzbhqzxshtbqvxkcjn',
  supabaseUrl: 'https://mrzzbhqzxshtbqvxkcjn.supabase.co',
  publishableKey: 'sb_publishable_phase4c5g_contract',
  studentAccessToken: jwt(studentSubject),
  adminAccessToken: jwt(adminSubject),
});

const generatedAt = new Date(nowMs - 30_000).toISOString();
const readyResponses = Object.freeze({
  'booking-preview-readiness': {
    schema_version: 'smart_parrot_booking_preview_readiness_v2',
    generated_at: generatedAt,
    status: 'ready',
    checks: {
      preview_project_identity: { ready: true, status: 'ready' },
      daily_webhook_secret: { ready: true, status: 'ready' },
    },
    blockers: [],
  },
  'booking-provider-preview-readiness': {
    schema_version: 'smart_parrot_booking_provider_preview_readiness_v1',
    generated_at: generatedAt,
    status: 'ready',
    checks: {
      preview_project_identity: { ready: true, status: 'ready' },
      stripe_test_account_identity: { ready: true, status: 'ready' },
      daily_preview_webhook_domain_identity: { ready: true, status: 'ready' },
    },
    blockers: [],
  },
  admin_provider_rehearsal_readiness: {
    schema_version: 'smart_parrot_provider_rehearsal_readiness_v1',
    generated_at: generatedAt,
    status: 'ready',
    ready: true,
    blockers: [],
  },
  admin_booking_webhook_readiness_proof: {
    schema_version: 'smart_parrot_booking_webhook_readiness_proof_v1',
    generated_at: generatedAt,
    status: 'ready',
    checks: {
      stripe_checkout_signed_test_delivery: { ready: true, status: 'ready' },
      stripe_dispute_signed_test_delivery: { ready: true, status: 'ready' },
    },
    blockers: [],
  },
  admin_get_booking_full_preview_run: {
    schema_version: 1,
    run_id: runId,
    scenario: 'deferred_success',
    booking_id: bookingId,
    state: 'awaiting_deferred_hold_worker',
    pause_reason: 'deferred_hold_worker',
    terminal: false,
    revision: 4,
    last_booking_status: 'card_saved',
    last_observed_at: '2026-09-20T22:39:00.000Z',
    completed_at: null,
    replay: true,
  },
});

function makeTransport({ studentRole = 'student', adminRole = 'admin', overrides = {} } = {}) {
  const calls = [];
  return {
    calls,
    async probeUserSession(authClass) {
      calls.push({ kind: 'probe', authClass });
      if (authClass === 'student_user') return { subject: studentSubject, role: studentRole };
      if (authClass === 'admin_user') return { subject: adminSubject, role: adminRole };
      throw new Error('unexpected probe');
    },
    async invokeServer(call) {
      calls.push({ kind: 'server', ...call });
      const value = overrides[call.target] ?? readyResponses[call.target];
      if (!value) throw new Error(`unexpected target ${call.target}`);
      return structuredClone(value);
    },
  };
}

const transport = makeTransport();
const result = await runFullPreviewOperatorBootstrap({ transport, readinessInput, runId, nowMs });
assert.equal(result.status, 'ready');
assert.equal(result.provider_ready_for_bounded_rehearsal, true);
assert.equal(result.provider_writes_enabled, false);
assert.equal(result.server_write_performed, false);
assert.equal(result.secrets_exposed, false);
assert.equal(result.run.run_id, runId);
assert.equal('booking_id' in result.run, false, 'operator output must not expose booking/customer linkage');
assert.equal(result.worker_intent.execution, 'dry_run_only');
assert.equal(result.worker_intent.worker_write_gate_open, false);
assert.equal(result.worker_intent.browser_authoritative, false);
assert.equal(result.worker_intent.direct_provider_call, false);

const serialized = JSON.stringify(result);
for (const forbidden of [
  readinessInput.publishableKey,
  readinessInput.studentAccessToken,
  readinessInput.adminAccessToken,
  studentSubject,
  adminSubject,
  bookingId,
]) {
  assert.equal(serialized.includes(forbidden), false, `operator output leaked ${forbidden.slice(0, 12)}`);
}
assert.equal(transport.calls.some((call) => ['place-holds', 'settle-lessons', 'create-booking', 'fix-payment'].includes(call.target)), false);

const repeat = await runFullPreviewOperatorBootstrap({ transport, readinessInput, runId, nowMs });
assert.deepEqual(repeat, result, 'repeated read-only operator bootstrap must be deterministic');
assert.equal(transport.calls.some((call) => call.auth === 'secret_worker'), false);

const wrongAdmin = makeTransport({ adminRole: 'tutor' });
const wrongAdminResult = await runFullPreviewOperatorBootstrap({ transport: wrongAdmin, readinessInput, runId, nowMs });
assert.equal(wrongAdminResult.status, 'blocked');
assert.equal(wrongAdminResult.phase, 'authoritative_session_roles');
assert.equal(wrongAdminResult.checks.server_admin_role.status, 'admin_role_required');
assert.equal(wrongAdmin.calls.some((call) => call.kind === 'server'), false, 'wrong role must stop before privileged reads');

const wrongPublishable = makeTransport();
const wrongPublishableResult = await runFullPreviewOperatorBootstrap({
  transport: wrongPublishable,
  readinessInput: { ...readinessInput, publishableKey: 'sb_secret_wrong_class' },
  runId,
  nowMs,
});
assert.equal(wrongPublishableResult.status, 'blocked');
assert.equal(wrongPublishableResult.phase, 'local_transport_preflight');
assert.equal(wrongPublishableResult.checks.local_supabase_publishable_key.status, 'supabase_publishable_key_class_mismatch');
assert.equal(wrongPublishable.calls.length, 0);

const staleProvider = makeTransport({
  overrides: {
    'booking-provider-preview-readiness': {
      ...readyResponses['booking-provider-preview-readiness'],
      generated_at: new Date(nowMs - 10 * 60_000).toISOString(),
    },
  },
});
const staleProviderResult = await runFullPreviewOperatorBootstrap({ transport: staleProvider, readinessInput, runId, nowMs });
assert.equal(staleProviderResult.status, 'blocked');
assert.equal(staleProviderResult.checks.provider_readiness_fresh.status, 'provider_readiness_stale');

const wrongProject = makeTransport({
  overrides: {
    'booking-preview-readiness': {
      ...readyResponses['booking-preview-readiness'],
      status: 'blocked',
      checks: {
        ...readyResponses['booking-preview-readiness'].checks,
        preview_project_identity: { ready: false, status: 'preview_project_mismatch' },
      },
      blockers: ['preview_project_identity'],
    },
  },
});
const wrongProjectResult = await runFullPreviewOperatorBootstrap({ transport: wrongProject, readinessInput, runId, nowMs });
assert.equal(wrongProjectResult.status, 'blocked');
assert.equal(wrongProjectResult.checks.server_preview_project_identity.status, 'preview_project_identity_not_proven');

const wrongProviders = makeTransport({
  overrides: {
    'booking-provider-preview-readiness': {
      ...readyResponses['booking-provider-preview-readiness'],
      status: 'blocked',
      checks: {
        preview_project_identity: { ready: true, status: 'ready' },
        stripe_test_account_identity: { ready: false, status: 'stripe_account_mismatch' },
        daily_preview_webhook_domain_identity: { ready: false, status: 'daily_webhook_domain_mismatch' },
      },
      blockers: ['stripe_test_account_identity', 'daily_preview_webhook_domain_identity'],
    },
  },
});
const wrongProvidersResult = await runFullPreviewOperatorBootstrap({ transport: wrongProviders, readinessInput, runId, nowMs });
assert.equal(wrongProvidersResult.status, 'blocked');
assert.equal(wrongProvidersResult.checks.provider_identity.status, 'stripe_test_account_identity');
assert.equal(wrongProvidersResult.checks.daily_signed_endpoint_verification.ready, false);

const missingWebhookProof = makeTransport({
  overrides: {
    admin_booking_webhook_readiness_proof: {
      ...readyResponses.admin_booking_webhook_readiness_proof,
      status: 'blocked',
      blockers: ['stripe_dispute_signed_test_delivery'],
    },
  },
});
const missingWebhookResult = await runFullPreviewOperatorBootstrap({ transport: missingWebhookProof, readinessInput, runId, nowMs });
assert.equal(missingWebhookResult.status, 'blocked');
assert.equal(missingWebhookResult.checks.stripe_signed_webhook_proof.status, 'stripe_dispute_signed_test_delivery');
assert.equal(missingWebhookResult.worker_intent.execution, 'dry_run_only');
assert.equal(missingWebhookResult.worker_intent.provider_write_ready, false);

const dailySource = fs.readFileSync('supabase/functions/daily-webhook/index.ts', 'utf8');
assert.ok(dailySource.includes('webhookSecretBytes()'));
assert.ok(dailySource.includes('const decoded = atob(secret)'));
assert.ok(!dailySource.includes("new TextEncoder().encode(webhookSecret())"));
assert.ok(dailySource.indexOf("event.test === 'test'") < dailySource.indexOf("record_daily_attendance_event"));

const transportSource = fs.readFileSync('scripts/lesson-booking-full-preview-supabase-transport.mjs', 'utf8');
assert.ok(transportSource.includes('/auth/v1/user'));
assert.ok(transportSource.includes("profileUrl.searchParams.set('select', 'id,role')"));
assert.ok(transportSource.includes("'booking-provider-preview-readiness': 'admin_user'"));
assert.ok(transportSource.includes("'admin_get_booking_full_preview_run': 'admin_rpc'"));

const operatorSource = fs.readFileSync('scripts/lesson-booking-full-preview-operator-bootstrap.mjs', 'utf8');
assert.ok(!operatorSource.includes('api.stripe.com'));
assert.ok(!operatorSource.includes('api.daily.co'));
assert.ok(!operatorSource.includes('STRIPE_SECRET_KEY'));
assert.ok(!operatorSource.includes('DAILY_API_KEY'));
assert.ok(operatorSource.includes("workerWriteGate: '0'"));

console.log('Phase 4C5G preview operator bootstrap/webhook proof checks passed.');
