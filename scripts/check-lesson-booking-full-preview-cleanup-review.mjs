import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createFullPreviewCleanupReviewReader,
  normalizeFullPreviewCleanupReviewPlan,
  normalizeFullPreviewCleanupReviewQueue,
} from './lesson-booking-full-preview-cleanup-review.mjs';

const RUN_ID = '8c000000-0000-4000-8000-000000000201';
const REVIEWED_AT = '2026-08-20T10:00:00.000Z';
const GENERATED_AT = '2026-09-21T03:30:00.000Z';
const EXPIRES_AT = '2026-09-22T03:30:00.000Z';

const calls = [];
const transport = {
  async invokeServer(call) {
    calls.push(structuredClone(call));
    if (call.target === 'admin_booking_full_preview_cleanup_review_queue') {
      return [{
        run_id: RUN_ID,
        terminal_state: 'complete',
        retention_reviewed_at: REVIEWED_AT,
        plan_status: 'not_prepared',
        plan_generated_at: null,
        plan_expires_at: null,
        destructive_cleanup_authorized: false,
        cleanup_execution_enabled: false,
        stripe_payment_intent_id: 'pi_must_not_escape',
        daily_room_name: 'must-not-escape',
        fixture_email: 'fixture@example.invalid',
        correlation_sha256: 'f'.repeat(64),
      }];
    }
    if (call.target === 'admin_prepare_booking_full_preview_cleanup_review_plan') {
      return {
        schema_version: 'smart_parrot_full_preview_cleanup_review_plan_v1',
        run_id: RUN_ID,
        plan_state: 'dry_run_only',
        retention_reviewed_at: REVIEWED_AT,
        generated_at: GENERATED_AT,
        expires_at: EXPIRES_AT,
        plan_status: 'active',
        replay: false,
        destructive_cleanup_authorized: false,
        cleanup_execution_enabled: false,
        server_time_authoritative: true,
        access_token: 'must-not-escape',
        provider_object_id: 'must-not-escape',
      };
    }
    throw new Error(`unexpected_target:${call.target}`);
  },
};

const reader = createFullPreviewCleanupReviewReader(transport);
const queue = await reader.listQueue(999);
assert.equal(queue.length, 1);
assert.deepEqual(Object.keys(queue[0]).sort(), [
  'cleanup_execution_enabled',
  'destructive_cleanup_authorized',
  'plan_expires_at',
  'plan_generated_at',
  'plan_status',
  'retention_reviewed_at',
  'run_id',
  'terminal_state',
].sort());
assert.equal(queue[0].plan_status, 'not_prepared');
assert.equal(queue[0].stripe_payment_intent_id, undefined);
assert.equal(queue[0].daily_room_name, undefined);
assert.equal(queue[0].fixture_email, undefined);
assert.equal(queue[0].correlation_sha256, undefined);

const plan = await reader.preparePlan(RUN_ID, REVIEWED_AT);
assert.equal(plan.plan_state, 'dry_run_only');
assert.equal(plan.plan_status, 'active');
assert.equal(plan.cleanup_execution_enabled, false);
assert.equal(plan.destructive_cleanup_authorized, false);
assert.equal(plan.access_token, undefined);
assert.equal(plan.provider_object_id, undefined);

assert.deepEqual(calls[0], {
  target: 'admin_booking_full_preview_cleanup_review_queue',
  auth: 'admin_rpc',
  payload: { p_limit: 100 },
});
assert.deepEqual(calls[1], {
  target: 'admin_prepare_booking_full_preview_cleanup_review_plan',
  auth: 'admin_rpc',
  payload: {
    p_run_id: RUN_ID,
    p_expected_reviewed_at: REVIEWED_AT,
  },
});
assert.equal('p_now' in calls[0].payload, false);
assert.equal('p_now' in calls[1].payload, false);
assert.equal('current_time' in calls[1].payload, false);

assert.throws(() => normalizeFullPreviewCleanupReviewQueue([{
  run_id: RUN_ID,
  terminal_state: 'complete',
  retention_reviewed_at: REVIEWED_AT,
  plan_status: 'active',
  plan_generated_at: GENERATED_AT,
  plan_expires_at: EXPIRES_AT,
  destructive_cleanup_authorized: true,
  cleanup_execution_enabled: false,
}]), /delete_authority_forbidden/);

assert.throws(() => normalizeFullPreviewCleanupReviewPlan({
  schema_version: 'smart_parrot_full_preview_cleanup_review_plan_v1',
  run_id: RUN_ID,
  plan_state: 'dry_run_only',
  retention_reviewed_at: REVIEWED_AT,
  generated_at: GENERATED_AT,
  expires_at: EXPIRES_AT,
  plan_status: 'active',
  replay: false,
  destructive_cleanup_authorized: false,
  cleanup_execution_enabled: true,
  server_time_authoritative: true,
}), /cleanup_execution_forbidden/);

const migration = await readFile(new URL('../supabase/migrations/20260921033000_lesson_booking_phase4c5m_cleanup_review_plan.sql', import.meta.url), 'utf8');
for (const forbidden of [
  /delete\s+from\s+public\.lesson_booking_full_preview_/i,
  /truncate\s+table/i,
  /drop\s+table\s+public\.lesson_booking_full_preview_/i,
  /functions\/v1\/(?:place-holds|settle-lessons|create-video-token)/i,
  /stripe\.com\/v1/i,
  /api\.daily\.co/i,
]) {
  assert.equal(forbidden.test(migration), false, `Forbidden mutation/provider path matched ${forbidden}`);
}
assert.equal(/statement_timestamp\(\)/i.test(migration), true);
assert.equal(/set\s+search_path\s*=\s*''/i.test(migration), true);
assert.equal(/destructive_cleanup_authorized',false/i.test(migration.replace(/\s+/g, '')), true);
assert.equal(/cleanup_execution_enabled',false/i.test(migration.replace(/\s+/g, '')), true);

console.log('Phase 4C5M cleanup-review dry-run boundary regression passed.');
