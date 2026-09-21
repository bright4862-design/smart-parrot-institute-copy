import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createFullPreviewCleanupLifecycleReader,
  normalizeFullPreviewCleanupExecutionManifestPreview,
  normalizeFullPreviewCleanupPlanLifecycle,
} from './lesson-booking-full-preview-cleanup-lifecycle.mjs';

const RUN_ID = '8c000000-0000-4000-8000-000000000300';
const REVIEWED_AT = '2026-08-20T10:00:00.000Z';
const PRIOR_EXPIRES_AT = '2026-09-20T03:30:00.000Z';
const RENEWED_AT = '2026-09-21T04:30:00.000Z';
const RENEWED_EXPIRES_AT = '2026-09-22T04:30:00.000Z';
const MANIFEST_AT = '2026-09-21T04:31:00.000Z';

const calls = [];
const transport = {
  async invokeServer(call) {
    calls.push(structuredClone(call));

    if (call.target === 'admin_renew_booking_full_preview_cleanup_review_plan') {
      return {
        schema_version: 'smart_parrot_full_preview_cleanup_plan_lifecycle_v1',
        run_id: RUN_ID,
        event_kind: 'renewed',
        prior_effective_expires_at: PRIOR_EXPIRES_AT,
        effective_generated_at: RENEWED_AT,
        effective_expires_at: RENEWED_EXPIRES_AT,
        plan_status: 'active',
        replay: false,
        destructive_cleanup_authorized: false,
        cleanup_execution_enabled: false,
        server_time_authoritative: true,
        stripe_payment_intent_id: 'pi_must_not_escape',
        daily_room_name: 'must-not-escape',
        fixture_email: 'fixture@example.invalid',
        access_token: 'must-not-escape',
      };
    }

    if (call.target === 'admin_revoke_booking_full_preview_cleanup_review_plan') {
      return {
        schema_version: 'smart_parrot_full_preview_cleanup_plan_lifecycle_v1',
        run_id: RUN_ID,
        event_kind: 'revoked',
        prior_effective_expires_at: RENEWED_EXPIRES_AT,
        reason_code: 'manual_safety_hold',
        recorded_at: MANIFEST_AT,
        replay: false,
        destructive_cleanup_authorized: false,
        cleanup_execution_enabled: false,
        server_time_authoritative: true,
        provider_object_id: 'must-not-escape',
        correlation_sha256: 'f'.repeat(64),
      };
    }

    if (call.target === 'admin_prepare_booking_full_preview_cleanup_execution_manifest_preview') {
      return {
        schema_version: 'smart_parrot_full_preview_cleanup_execution_manifest_preview_v1',
        run_id: RUN_ID,
        manifest_state: 'preview_only',
        source_plan_kind: 'renewal',
        retention_reviewed_at: REVIEWED_AT,
        plan_effective_generated_at: RENEWED_AT,
        plan_effective_expires_at: RENEWED_EXPIRES_AT,
        prepared_at: MANIFEST_AT,
        manifest_status: 'current',
        replay: false,
        destructive_cleanup_authorized: false,
        cleanup_execution_enabled: false,
        server_time_authoritative: true,
        stripe_customer_id: 'cus_must_not_escape',
        daily_webhook_secret: 'must-not-escape',
        fixture_user_id: '8c000000-0000-4000-8000-000000000399',
      };
    }

    throw new Error(`unexpected_target:${call.target}`);
  },
};

const reader = createFullPreviewCleanupLifecycleReader(transport);

const renewal = await reader.renewPlan(RUN_ID, PRIOR_EXPIRES_AT, REVIEWED_AT);
assert.deepEqual(Object.keys(renewal).sort(), [
  'cleanup_execution_enabled',
  'destructive_cleanup_authorized',
  'effective_expires_at',
  'effective_generated_at',
  'event_kind',
  'plan_status',
  'prior_effective_expires_at',
  'replay',
  'run_id',
  'schema_version',
  'server_time_authoritative',
].sort());
assert.equal(renewal.event_kind, 'renewed');
assert.equal(renewal.plan_status, 'active');
assert.equal(renewal.stripe_payment_intent_id, undefined);
assert.equal(renewal.daily_room_name, undefined);
assert.equal(renewal.fixture_email, undefined);
assert.equal(renewal.access_token, undefined);

const revocation = await reader.revokePlan(RUN_ID, RENEWED_EXPIRES_AT, 'manual_safety_hold');
assert.deepEqual(Object.keys(revocation).sort(), [
  'cleanup_execution_enabled',
  'destructive_cleanup_authorized',
  'event_kind',
  'prior_effective_expires_at',
  'reason_code',
  'recorded_at',
  'replay',
  'run_id',
  'schema_version',
  'server_time_authoritative',
].sort());
assert.equal(revocation.event_kind, 'revoked');
assert.equal(revocation.reason_code, 'manual_safety_hold');
assert.equal(revocation.provider_object_id, undefined);
assert.equal(revocation.correlation_sha256, undefined);

const manifest = await reader.prepareExecutionManifestPreview(RUN_ID, RENEWED_EXPIRES_AT, REVIEWED_AT);
assert.deepEqual(Object.keys(manifest).sort(), [
  'cleanup_execution_enabled',
  'destructive_cleanup_authorized',
  'manifest_state',
  'manifest_status',
  'plan_effective_expires_at',
  'plan_effective_generated_at',
  'prepared_at',
  'replay',
  'retention_reviewed_at',
  'run_id',
  'schema_version',
  'server_time_authoritative',
  'source_plan_kind',
].sort());
assert.equal(manifest.manifest_state, 'preview_only');
assert.equal(manifest.cleanup_execution_enabled, false);
assert.equal(manifest.destructive_cleanup_authorized, false);
assert.equal(manifest.stripe_customer_id, undefined);
assert.equal(manifest.daily_webhook_secret, undefined);
assert.equal(manifest.fixture_user_id, undefined);

assert.deepEqual(calls[0], {
  target: 'admin_renew_booking_full_preview_cleanup_review_plan',
  auth: 'admin_rpc',
  payload: {
    p_run_id: RUN_ID,
    p_expected_effective_expires_at: PRIOR_EXPIRES_AT,
    p_expected_reviewed_at: REVIEWED_AT,
  },
});
assert.deepEqual(calls[1], {
  target: 'admin_revoke_booking_full_preview_cleanup_review_plan',
  auth: 'admin_rpc',
  payload: {
    p_run_id: RUN_ID,
    p_expected_effective_expires_at: RENEWED_EXPIRES_AT,
    p_reason_code: 'manual_safety_hold',
  },
});
assert.deepEqual(calls[2], {
  target: 'admin_prepare_booking_full_preview_cleanup_execution_manifest_preview',
  auth: 'admin_rpc',
  payload: {
    p_run_id: RUN_ID,
    p_expected_effective_expires_at: RENEWED_EXPIRES_AT,
    p_expected_reviewed_at: REVIEWED_AT,
  },
});
for (const call of calls) {
  assert.equal('p_now' in call.payload, false);
  assert.equal('current_time' in call.payload, false);
  assert.equal('browser_time' in call.payload, false);
}

assert.throws(() => normalizeFullPreviewCleanupPlanLifecycle({
  schema_version: 'smart_parrot_full_preview_cleanup_plan_lifecycle_v1',
  run_id: RUN_ID,
  event_kind: 'renewed',
  prior_effective_expires_at: PRIOR_EXPIRES_AT,
  effective_generated_at: RENEWED_AT,
  effective_expires_at: RENEWED_EXPIRES_AT,
  plan_status: 'active',
  replay: false,
  destructive_cleanup_authorized: true,
  cleanup_execution_enabled: false,
  server_time_authoritative: true,
}), /delete_authority_forbidden/);

assert.throws(() => normalizeFullPreviewCleanupExecutionManifestPreview({
  schema_version: 'smart_parrot_full_preview_cleanup_execution_manifest_preview_v1',
  run_id: RUN_ID,
  manifest_state: 'preview_only',
  source_plan_kind: 'renewal',
  retention_reviewed_at: REVIEWED_AT,
  plan_effective_generated_at: RENEWED_AT,
  plan_effective_expires_at: RENEWED_EXPIRES_AT,
  prepared_at: MANIFEST_AT,
  manifest_status: 'current',
  replay: false,
  destructive_cleanup_authorized: false,
  cleanup_execution_enabled: true,
  server_time_authoritative: true,
}), /cleanup_execution_forbidden/);

await assert.rejects(
  () => reader.revokePlan(RUN_ID, RENEWED_EXPIRES_AT, 'delete_everything'),
  /cleanup_plan_revocation_reason_invalid/,
);

const migration = await readFile(
  new URL('../supabase/migrations/20260921043000_lesson_booking_phase4c5n_cleanup_plan_lifecycle_manifest.sql', import.meta.url),
  'utf8',
);

for (const forbidden of [
  /delete\s+from\s+public\.lesson_booking_full_preview_/i,
  /truncate\s+table/i,
  /drop\s+table\s+public\.lesson_booking_full_preview_/i,
  /functions\/v1\/(?:place-holds|settle-lessons|create-video-token)/i,
  /stripe\.com\/v1/i,
  /api\.daily\.co/i,
  /destructive_cleanup_authorized'\s*,\s*true/i,
  /cleanup_execution_enabled'\s*,\s*true/i,
]) {
  assert.equal(forbidden.test(migration), false, `Forbidden cleanup/provider path matched ${forbidden}`);
}

assert.equal(/statement_timestamp\(\)/i.test(migration), true);
assert.equal(/set\s+search_path\s*=\s*''/i.test(migration), true);
assert.equal(/event_kind\s+in\s+\('expiry_observed','renewed','revoked'\)/i.test(migration.replace(/\s+/g, ' ')), true);
assert.equal(/manifest_state\s*=\s*'preview_only'/i.test(migration), true);
assert.equal(/admin_renew_booking_full_preview_cleanup_review_plan/i.test(migration), true);
assert.equal(/admin_revoke_booking_full_preview_cleanup_review_plan/i.test(migration), true);
assert.equal(/admin_prepare_booking_full_preview_cleanup_execution_manifest_preview/i.test(migration), true);

console.log('Phase 4C5N cleanup-plan lifecycle and execution-manifest preview regression passed.');
