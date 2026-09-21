import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createFullPreviewCleanupExecutionAttestationService,
  normalizeFullPreviewCleanupExecutionAttestation,
} from './lesson-booking-full-preview-cleanup-attestation.mjs';
import { createApprovedPreviewSupabaseTransport } from './lesson-booking-full-preview-supabase-transport.mjs';

const RUN_ID = '8c000000-0000-4000-8000-000000000400';
const MANIFEST_AT = '2026-09-21T05:40:00.000Z';
const REVIEWED_AT = '2026-08-20T10:00:00.000Z';
const EXPIRES_AT = '2026-09-22T05:39:00.000Z';
const ATTESTED_AT = '2026-09-21T05:41:00.000Z';

const calls = [];
const transport = {
  async invokeServer(call) {
    calls.push(structuredClone(call));
    return {
      schema_version: 'smart_parrot_full_preview_cleanup_execution_attestation_v1',
      run_id: RUN_ID,
      attestation_state: 'non_executable',
      manifest_prepared_at: MANIFEST_AT,
      retention_reviewed_at: REVIEWED_AT,
      plan_effective_expires_at: EXPIRES_AT,
      attested_at: ATTESTED_AT,
      impact_inventory: [
        { artifact_class: 'full_preview_run', row_count: 1, stripe_payment_intent_id: 'pi_must_not_escape' },
        { artifact_class: 'terminal_evidence', row_count: 1, fixture_email: 'fixture@example.invalid' },
        { artifact_class: 'reconciliation_resolution', row_count: 0, daily_room_name: 'must-not-escape' },
        { artifact_class: 'retention_review', row_count: 1, access_token: 'must-not-escape' },
        { artifact_class: 'cleanup_review_plan', row_count: 1, provider_object_id: 'must-not-escape' },
        { artifact_class: 'cleanup_plan_lifecycle', row_count: 0, correlation_sha256: 'f'.repeat(64) },
        { artifact_class: 'cleanup_manifest_preview', row_count: 1, webhook_secret: 'must-not-escape' },
      ],
      replay: false,
      service_only: true,
      destructive_cleanup_authorized: false,
      cleanup_execution_enabled: false,
      server_time_authoritative: true,
      stripe_customer_id: 'cus_must_not_escape',
      daily_webhook_secret: 'must-not-escape',
      fixture_user_id: '8c000000-0000-4000-8000-000000000499',
    };
  },
};

const service = createFullPreviewCleanupExecutionAttestationService(transport);
const result = await service.attest(RUN_ID, MANIFEST_AT, EXPIRES_AT);

assert.deepEqual(Object.keys(result).sort(), [
  'attestation_state',
  'attested_at',
  'cleanup_execution_enabled',
  'destructive_cleanup_authorized',
  'impact_inventory',
  'manifest_prepared_at',
  'plan_effective_expires_at',
  'replay',
  'retention_reviewed_at',
  'run_id',
  'schema_version',
  'server_time_authoritative',
  'service_only',
].sort());

assert.equal(result.attestation_state, 'non_executable');
assert.equal(result.service_only, true);
assert.equal(result.cleanup_execution_enabled, false);
assert.equal(result.destructive_cleanup_authorized, false);
assert.equal(result.stripe_customer_id, undefined);
assert.equal(result.daily_webhook_secret, undefined);
assert.equal(result.fixture_user_id, undefined);
assert.equal(result.impact_inventory[0].stripe_payment_intent_id, undefined);
assert.equal(result.impact_inventory[1].fixture_email, undefined);
assert.equal(result.impact_inventory[2].daily_room_name, undefined);
assert.equal(result.impact_inventory[3].access_token, undefined);
assert.equal(result.impact_inventory[4].provider_object_id, undefined);
assert.equal(result.impact_inventory[5].correlation_sha256, undefined);
assert.equal(result.impact_inventory[6].webhook_secret, undefined);

assert.deepEqual(calls, [{
  target: 'service_attest_booking_full_preview_cleanup_execution_manifest',
  auth: 'service_rpc',
  payload: {
    p_run_id: RUN_ID,
    p_expected_manifest_prepared_at: MANIFEST_AT,
    p_expected_effective_expires_at: EXPIRES_AT,
  },
}]);
assert.equal('p_now' in calls[0].payload, false);
assert.equal('current_time' in calls[0].payload, false);
assert.equal('browser_time' in calls[0].payload, false);

// Supabase's current sb_secret_* contract is apikey-header-only for direct Data API requests.
// A secret key is not a JWT and must not be copied into Authorization: Bearer.
const serviceRpcRequests = [];
const directTransport = createApprovedPreviewSupabaseTransport({
  secretKey: 'sb_secret_phase4c5o_regression_only',
  fetchImpl: async (url, options) => {
    serviceRpcRequests.push({ url, options: structuredClone(options) });
    return new Response(JSON.stringify({
      schema_version: 'smart_parrot_full_preview_cleanup_execution_attestation_v1',
      run_id: RUN_ID,
      attestation_state: 'non_executable',
      manifest_prepared_at: MANIFEST_AT,
      retention_reviewed_at: REVIEWED_AT,
      plan_effective_expires_at: EXPIRES_AT,
      attested_at: ATTESTED_AT,
      impact_inventory: result.impact_inventory,
      replay: false,
      service_only: true,
      destructive_cleanup_authorized: false,
      cleanup_execution_enabled: false,
      server_time_authoritative: true,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  },
});
const directService = createFullPreviewCleanupExecutionAttestationService(directTransport);
await directService.attest(RUN_ID, MANIFEST_AT, EXPIRES_AT);
assert.equal(serviceRpcRequests.length, 1);
assert.equal(
  serviceRpcRequests[0].url,
  'https://mrzzbhqzxshtbqvxkcjn.supabase.co/rest/v1/rpc/service_attest_booking_full_preview_cleanup_execution_manifest',
);
assert.equal(serviceRpcRequests[0].options.headers.apikey, 'sb_secret_phase4c5o_regression_only');
assert.equal('authorization' in serviceRpcRequests[0].options.headers, false);
assert.equal('Authorization' in serviceRpcRequests[0].options.headers, false);

const basePayload = {
  schema_version: 'smart_parrot_full_preview_cleanup_execution_attestation_v1',
  run_id: RUN_ID,
  attestation_state: 'non_executable',
  manifest_prepared_at: MANIFEST_AT,
  retention_reviewed_at: REVIEWED_AT,
  plan_effective_expires_at: EXPIRES_AT,
  attested_at: ATTESTED_AT,
  impact_inventory: result.impact_inventory,
  replay: false,
  service_only: true,
  destructive_cleanup_authorized: false,
  cleanup_execution_enabled: false,
  server_time_authoritative: true,
};

assert.throws(
  () => normalizeFullPreviewCleanupExecutionAttestation({ ...basePayload, cleanup_execution_enabled: true }),
  /cleanup_attestation_execution_forbidden/,
);
assert.throws(
  () => normalizeFullPreviewCleanupExecutionAttestation({ ...basePayload, destructive_cleanup_authorized: true }),
  /cleanup_attestation_delete_authority_forbidden/,
);
assert.throws(
  () => normalizeFullPreviewCleanupExecutionAttestation({ ...basePayload, service_only: false }),
  /cleanup_attestation_service_only_required/,
);
assert.throws(
  () => normalizeFullPreviewCleanupExecutionAttestation({
    ...basePayload,
    impact_inventory: result.impact_inventory.slice(0, 6),
  }),
  /cleanup_attestation_inventory_invalid/,
);

const migration = await readFile(
  new URL('../supabase/migrations/20260921054000_lesson_booking_phase4c5o_cleanup_execution_attestation_inventory.sql', import.meta.url),
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

assert.equal(/service_attest_booking_full_preview_cleanup_execution_manifest/i.test(migration), true);
assert.equal(/grant\s+execute[\s\S]+to\s+service_role/i.test(migration), true);
assert.equal(/revoke\s+all[\s\S]+from\s+public,\s*anon,\s*authenticated/i.test(migration), true);
assert.equal(/attestation_state\s+text\s+not\s+null\s+check\s*\(attestation_state\s*=\s*'non_executable'\)/i.test(migration), true);
assert.equal(/statement_timestamp\(\)/i.test(migration), true);
assert.equal(/set\s+search_path\s*=\s*''/i.test(migration), true);

console.log('Phase 4C5O service-only cleanup execution attestation and minimized impact inventory regression passed.');
