import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createFullPreviewReconciliationReader,
  normalizeFullPreviewTerminalRetentionStatus,
  summarizeFullPreviewReconciliationQueue,
} from './lesson-booking-full-preview-reconciliation.mjs';

const RUN_ID = '7b000000-0000-4000-8000-000000000100';
const calls = [];
const transport = {
  async invokeServer(request) {
    calls.push(structuredClone(request));
    if (request.target === 'admin_booking_full_preview_reconciliation_queue') {
      return [{
        run_id: RUN_ID,
        terminal_state: 'complete',
        severity: 'urgent',
        reason: 'Synthetic preview fixture cleanup outcome is ambiguous',
        occurred_at: '2026-09-20T00:00:00Z',
        retention_status: 'reconciliation_hold',
        retention_review_after: null,
        transcript_sha256: 'a'.repeat(64),
        correlation_sha256: 'b'.repeat(64),
        fixture_email: 'must-not-survive@example.invalid',
        stripe_object_id: 'pi_must_not_survive',
      }];
    }
    if (request.target === 'admin_booking_full_preview_terminal_retention_status') {
      return {
        schema_version: 'smart_parrot_full_preview_terminal_retention_v1',
        run_id: RUN_ID,
        retention_status: 'retention_active',
        reconciliation_required: false,
        evidence_recorded_at: '2026-09-20T00:00:00Z',
        retention_days: 30,
        retention_review_after: '2026-10-20T00:00:00Z',
        retention_review_due: false,
        destructive_cleanup_authorized: false,
        server_time_authoritative: true,
        transcript_sha256: 'a'.repeat(64),
        secret: 'must-not-survive',
      };
    }
    throw new Error(`unexpected_target:${request.target}`);
  },
};

const reader = createFullPreviewReconciliationReader(transport);
const queue = await reader.listQueue(500);
assert.equal(queue.length, 1);
assert.equal(queue[0].run_id, RUN_ID);
assert.equal(queue[0].severity, 'urgent');
assert.equal(queue[0].retention_status, 'reconciliation_hold');
assert.equal(queue[0].retention_review_after, null);
assert.equal(Object.hasOwn(queue[0], 'transcript_sha256'), false);
assert.equal(Object.hasOwn(queue[0], 'correlation_sha256'), false);
assert.equal(Object.hasOwn(queue[0], 'fixture_email'), false);
assert.equal(Object.hasOwn(queue[0], 'stripe_object_id'), false);

const queueCall = calls[0];
assert.equal(queueCall.auth, 'admin_rpc');
assert.equal(queueCall.target, 'admin_booking_full_preview_reconciliation_queue');
assert.deepEqual(queueCall.payload, { p_limit: 100 });
assert.equal(Object.hasOwn(queueCall.payload, 'p_now'), false);

const retention = await reader.getRetentionStatus(RUN_ID);
assert.equal(retention.retention_status, 'retention_active');
assert.equal(retention.destructive_cleanup_authorized, false);
assert.equal(retention.server_time_authoritative, true);
assert.equal(Object.hasOwn(retention, 'transcript_sha256'), false);
assert.equal(Object.hasOwn(retention, 'secret'), false);
assert.deepEqual(calls[1].payload, { p_run_id: RUN_ID });
assert.equal(Object.hasOwn(calls[1].payload, 'p_now'), false);

const summary = summarizeFullPreviewReconciliationQueue(queue);
assert.deepEqual(summary, {
  schema_version: 1,
  total: 1,
  urgent: 1,
  high: 0,
  destructive_cleanup_authorized: false,
  provider_writes_enabled: false,
  server_time_authoritative: true,
});

assert.throws(() => normalizeFullPreviewTerminalRetentionStatus({
  schema_version: 'smart_parrot_full_preview_terminal_retention_v1',
  run_id: RUN_ID,
  retention_status: 'retention_review_due',
  reconciliation_required: false,
  evidence_recorded_at: '2026-08-01T00:00:00Z',
  retention_days: 30,
  retention_review_after: '2026-08-31T00:00:00Z',
  retention_review_due: true,
  destructive_cleanup_authorized: true,
  server_time_authoritative: true,
}), /delete_authority_forbidden/);

const migration = readFileSync(
  new URL('../supabase/migrations/20260921030000_lesson_booking_phase4c5k_terminal_reconciliation_retention.sql', import.meta.url),
  'utf8',
);
assert.match(migration, /statement_timestamp\(\)/);
assert.match(migration, /set search_path = ''/);
assert.match(migration, /smart_parrot_require_admin/);
assert.match(migration, /destructive_cleanup_authorized',false/);
assert.doesNotMatch(migration, /delete\s+from\s+public\.lesson_booking_full_preview_terminal_evidence/i);
assert.doesNotMatch(migration, /p_now\s+timestamptz/i);
assert.doesNotMatch(migration, /stripe_(payment|customer|charge|checkout)/i);
assert.doesNotMatch(migration, /daily_(room|token)/i);

console.log('Phase 4C5K terminal reconciliation/retention regressions passed.');
