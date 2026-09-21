import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createFullPreviewReconciliationReader,
  normalizeFullPreviewRetentionReview,
  normalizeFullPreviewTerminalRetentionStatus,
} from './lesson-booking-full-preview-reconciliation.mjs';

const RUN_ID = '7b000000-0000-4000-8000-000000000200';
const calls = [];
const transport = {
  async invokeServer(request) {
    calls.push(structuredClone(request));
    if (request.target === 'admin_booking_full_preview_reconciliation_queue') return [];
    if (request.target === 'admin_booking_full_preview_terminal_retention_status') {
      return {
        schema_version: 'smart_parrot_full_preview_terminal_retention_v2',
        run_id: RUN_ID,
        retention_status: 'retention_review_due',
        reconciliation_required: true,
        reconciliation_resolved: true,
        reconciliation_resolution_kind: 'cleanup_verified',
        evidence_recorded_at: '2026-08-01T00:00:00Z',
        retention_days: 30,
        retention_review_after: '2026-09-01T00:00:00Z',
        retention_review_due: true,
        retention_review_decision: 'eligible_for_cleanup_review',
        retention_review_recorded_at: '2026-09-21T03:00:00Z',
        destructive_cleanup_authorized: false,
        cleanup_execution_enabled: false,
        server_time_authoritative: true,
        verification_sha256: 'a'.repeat(64),
        secret: 'must-not-survive',
      };
    }
    if (request.target === 'admin_record_booking_full_preview_retention_review') {
      return {
        schema_version: 'smart_parrot_full_preview_retention_review_v1',
        run_id: RUN_ID,
        decision: request.payload.p_decision,
        basis_status: request.payload.p_decision === 'preserve' ? 'reconciliation_hold' : 'retention_review_due',
        reviewed_at: '2026-09-21T03:00:00Z',
        replay: false,
        destructive_cleanup_authorized: false,
        cleanup_execution_enabled: false,
        server_time_authoritative: true,
        transcript_sha256: 'b'.repeat(64),
        stripe_object_id: 'pi_must_not_survive',
      };
    }
    throw new Error(`unexpected_target:${request.target}`);
  },
};

const reader = createFullPreviewReconciliationReader(transport);

const retention = await reader.getRetentionStatus(RUN_ID);
assert.equal(retention.schema_version, 'smart_parrot_full_preview_terminal_retention_v2');
assert.equal(retention.retention_status, 'retention_review_due');
assert.equal(retention.reconciliation_resolved, true);
assert.equal(retention.reconciliation_resolution_kind, 'cleanup_verified');
assert.equal(retention.retention_review_decision, 'eligible_for_cleanup_review');
assert.equal(retention.destructive_cleanup_authorized, false);
assert.equal(retention.cleanup_execution_enabled, false);
assert.equal(Object.hasOwn(retention, 'verification_sha256'), false);
assert.equal(Object.hasOwn(retention, 'secret'), false);

const preserve = await reader.recordRetentionReview(RUN_ID, 'preserve');
assert.equal(preserve.decision, 'preserve');
assert.equal(preserve.basis_status, 'reconciliation_hold');
assert.equal(preserve.destructive_cleanup_authorized, false);
assert.equal(preserve.cleanup_execution_enabled, false);
assert.equal(Object.hasOwn(preserve, 'transcript_sha256'), false);
assert.equal(Object.hasOwn(preserve, 'stripe_object_id'), false);
assert.deepEqual(calls[1].payload, { p_run_id: RUN_ID, p_decision: 'preserve' });
assert.equal(Object.hasOwn(calls[1].payload, 'p_now'), false);
assert.equal(Object.hasOwn(calls[1].payload, 'delete'), false);

const eligible = await reader.recordRetentionReview(RUN_ID, 'eligible_for_cleanup_review');
assert.equal(eligible.decision, 'eligible_for_cleanup_review');
assert.deepEqual(calls[2].payload, {
  p_run_id: RUN_ID,
  p_decision: 'eligible_for_cleanup_review',
});
assert.equal(Object.hasOwn(calls[2].payload, 'p_now'), false);

await assert.rejects(
  () => reader.recordRetentionReview(RUN_ID, 'delete_now'),
  /retention_review_decision_invalid/,
);

const reconciledPreserveAudit = normalizeFullPreviewRetentionReview({
  schema_version: 'smart_parrot_full_preview_retention_review_v1',
  run_id: RUN_ID,
  decision: 'preserve',
  basis_status: 'reconciliation_preserved',
  reviewed_at: '2026-09-21T03:00:00Z',
  replay: false,
  destructive_cleanup_authorized: false,
  cleanup_execution_enabled: false,
  server_time_authoritative: true,
});
assert.equal(reconciledPreserveAudit.basis_status, 'reconciliation_preserved');

assert.throws(() => normalizeFullPreviewRetentionReview({
  schema_version: 'smart_parrot_full_preview_retention_review_v1',
  run_id: RUN_ID,
  decision: 'eligible_for_cleanup_review',
  basis_status: 'retention_review_due',
  reviewed_at: '2026-09-21T03:00:00Z',
  replay: false,
  destructive_cleanup_authorized: true,
  cleanup_execution_enabled: false,
  server_time_authoritative: true,
}), /cleanup_authority_forbidden/);

assert.throws(() => normalizeFullPreviewTerminalRetentionStatus({
  schema_version: 'smart_parrot_full_preview_terminal_retention_v2',
  run_id: RUN_ID,
  retention_status: 'retention_preserved',
  reconciliation_required: true,
  reconciliation_resolved: true,
  reconciliation_resolution_kind: 'preserve',
  evidence_recorded_at: '2026-08-01T00:00:00Z',
  retention_days: 30,
  retention_review_after: null,
  retention_review_due: false,
  retention_review_decision: 'preserve',
  retention_review_recorded_at: '2026-09-21T03:00:00Z',
  destructive_cleanup_authorized: false,
  cleanup_execution_enabled: true,
  server_time_authoritative: true,
}), /cleanup_execution_forbidden/);

const migration = readFileSync(
  new URL('../supabase/migrations/20260921031500_lesson_booking_phase4c5l_reconciliation_resolution_retention_audit.sql', import.meta.url),
  'utf8',
);
assert.match(migration, /grant execute on function public\.service_record_booking_full_preview_reconciliation_resolution\([\s\S]*?\) to service_role;/);
assert.match(migration, /revoke all on function public\.service_record_booking_full_preview_reconciliation_resolution\([\s\S]*?\) from public, anon, authenticated;/);
assert.match(migration, /p_expected_correlation_sha256/);
assert.match(migration, /stale_full_preview_reconciliation_evidence/);
assert.match(migration, /statement_timestamp\(\)/);
assert.match(migration, /eligible_for_cleanup_review/);
assert.match(migration, /destructive_cleanup_authorized',false/);
assert.match(migration, /cleanup_execution_enabled',false/);
assert.doesNotMatch(migration, /delete\s+from\s+public\.lesson_booking_full_preview/i);
assert.doesNotMatch(migration, /truncate\s+/i);
assert.doesNotMatch(migration, /p_now\s+timestamptz/i);
assert.doesNotMatch(migration, /stripe_(payment|customer|charge|checkout)/i);
assert.doesNotMatch(migration, /daily_(room|token)/i);

const transportSource = readFileSync(
  new URL('./lesson-booking-full-preview-supabase-transport.mjs', import.meta.url),
  'utf8',
);
assert.match(transportSource, /'admin_record_booking_full_preview_retention_review': 'admin_rpc'/);
assert.doesNotMatch(
  transportSource,
  /'service_record_booking_full_preview_reconciliation_resolution'\s*:/,
  'Service-only reconciliation resolution must not be exposed through the browser/admin transport map.',
);

console.log('Phase 4C5L reconciliation resolution/retention audit regressions passed.');
