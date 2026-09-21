#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizePreviewRequeueLeaseExpiryObservation,
  observeExpiredPreviewRequeueLeases,
  PREVIEW_REQUEUE_LEASE_EXPIRY_OBSERVER_RPC,
} from './lesson-booking-preview-requeue-lease-recovery.mjs';
import { PREVIEW_REQUEUE_CLAIM_RPC } from './lesson-booking-preview-requeue-lease.mjs';
import {
  APPROVED_SMART_PARROT_PREVIEW,
  createApprovedPreviewSupabaseTransport,
} from './lesson-booking-full-preview-supabase-transport.mjs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260921143000_lesson_booking_phase4c5y_requeue_lease_expiry_recovery.sql', import.meta.url),
  'utf8',
);
const expect = (value, message) => assert.ok(value, message);
const expiryTable = 'lesson_booking_preview_launch_blocker_requeue_lease_expiries';
const auditedClaimRpc = 'service_claim_booking_preview_launch_blocker_requeue_work_audited';
const legacyClaimRpc = 'service_claim_booking_preview_launch_blocker_requeue_work';

expect(migration.includes(`create table if not exists public.${expiryTable}`), 'missing Phase Y expiry evidence table');
expect(migration.includes(`alter table public.${expiryTable} enable row level security`), 'Phase Y expiry table must have RLS');
expect(migration.includes(`${expiryTable}_append_only`), 'Phase Y expiry evidence must be append-only');
expect(migration.includes(`revoke all on table public.${expiryTable}`), 'Phase Y expiry table must remain RPC-only');
expect(migration.includes(`create or replace function public.${PREVIEW_REQUEUE_LEASE_EXPIRY_OBSERVER_RPC}`), 'missing Phase Y expiry observer RPC');
expect(migration.includes(`create or replace function public.${auditedClaimRpc}`), 'missing Phase Y audited claim RPC');
expect(/security definer\s+set search_path = ''/gi.test(migration), 'Phase Y privileged RPCs must pin search_path');
expect(/pg_advisory_xact_lock\(20260921,40520\)/i.test(migration), 'Phase Y must serialize with the requeue family');
expect(/statement_timestamp\(\)/i.test(migration), 'Phase Y must use PostgreSQL server time');
expect(/expiry_reason text not null check \(expiry_reason = 'lease_timeout'\)/i.test(migration), 'Phase Y must use a fixed lease timeout reason');
expect(/check \(observed_at >= lease_expires_at\)/i.test(migration), 'Phase Y must reject pre-expiry observations');
expect(new RegExp(`revoke execute on function public\\.${legacyClaimRpc}\\(bigint,text,integer\\)[\\s\\S]*?from service_role`, 'i').test(migration), 'legacy Phase X claim RPC must be revoked from service_role');
expect(new RegExp(`grant execute on function public\\.${auditedClaimRpc}\\(bigint,text,integer\\)[\\s\\S]*?to service_role`, 'i').test(migration), 'audited Phase Y claim RPC must be service-role only');
expect(new RegExp(`grant execute on function public\\.${PREVIEW_REQUEUE_LEASE_EXPIRY_OBSERVER_RPC}\\(integer\\)[\\s\\S]*?to service_role`, 'i').test(migration), 'Phase Y expiry observer must be service-role only');
expect(PREVIEW_REQUEUE_CLAIM_RPC === auditedClaimRpc, 'Phase X client claim path must route through the Phase Y audited RPC');
expect(!/\bdelete\s+from\b/i.test(migration) && !/\btruncate\b/i.test(migration), 'destructive SQL is forbidden');
expect(!/https?:\/\//i.test(migration), 'external calls are forbidden');
expect(!/\bcron\b[\s\S]*?schedule\s*\(/i.test(migration), 'Cron sending is forbidden');
expect(!/p_(?:now|current_time|observed_at|lease_expires_at)\b/i.test(migration), 'caller-controlled time is forbidden');
for (const sentinel of [
  'requeue_execution_authorized','automatic_notification_authorized','notifier_send_authorized',
  'outcome_suppresses_blocker','provider_write_authorized','booking_launch_authorized','destructive_cleanup_authorized',
]) {
  expect(new RegExp(`${sentinel} boolean not null default false check \\(${sentinel} = false\\)`, 'i').test(migration), `missing fail-closed ${sentinel}`);
}

const raw = {
  schema_version: 'smart_parrot_booking_preview_launch_blocker_requeue_lease_expiry_observation_v1',
  captured_at: '2026-09-21T12:30:00.000Z',
  item_count: 1,
  items: [{
    expiry_id: 801,
    claim_event_id: 701,
    activation_id: 601,
    work_generation_id: 501,
    queue_item_id: 92,
    snapshot_id: 51,
    alert_id: 53,
    lineage_ref: 'rqg:51:92:301:1',
    lease_generation_no: 1,
    lease_expires_at: '2026-09-21T12:29:00.000Z',
    expiry_reason: 'lease_timeout',
    observed_at: '2026-09-21T12:30:00.000Z',
    claim_key: 'f'.repeat(32),
    stripe_payment_intent_id: 'pi_should_not_leak',
    customer_email: 'should-not-leak@example.test',
  }],
  requeue_execution_authorized: false,
  automatic_notification_authorized: false,
  notifier_send_authorized: false,
  outcome_suppresses_blocker: false,
  provider_write_authorized: false,
  booking_launch_authorized: false,
  destructive_cleanup_authorized: false,
  server_time_authoritative: true,
  service_secret: 'should-not-leak',
};
const normalized = normalizePreviewRequeueLeaseExpiryObservation(raw);
assert.equal(normalized.item_count, 1);
assert.equal(normalized.items[0].expiry_reason, 'lease_timeout');
assert.equal(normalized.items[0].lineage_ref, 'rqg:51:92:301:1');
assert.equal('claim_key' in normalized.items[0], false);
assert.equal('stripe_payment_intent_id' in normalized.items[0], false);
assert.equal('customer_email' in normalized.items[0], false);
assert.equal('service_secret' in normalized, false);

let observedCall = null;
const mocked = await observeExpiredPreviewRequeueLeases({
  transport: {
    async invokeServer(call) {
      observedCall = call;
      return raw;
    },
  },
  limit: 10,
});
assert.equal(observedCall.target, PREVIEW_REQUEUE_LEASE_EXPIRY_OBSERVER_RPC);
assert.equal(observedCall.auth, 'service_rpc');
assert.deepEqual(observedCall.payload, { p_limit: 10 });
assert.equal(observed.item_count, 1);

await assert.rejects(
  () => observeExpiredPreviewRequeueLeases({ transport: { invokeServer: async () => raw }, limit: 0 }),
  /limit must be between 1 and 100/,
);
assert.throws(
  () => normalizePreviewRequeueLeaseExpiryObservation({ ...raw, items: [{ ...raw.items[0], observed_at: '2026-09-21T12:28:00.000Z' }] }),
  /cannot be observed before server lease expiry/,
);
assert.throws(
  () => normalizePreviewRequeueLeaseExpiryObservation({ ...raw, notifier_send_authorized: true }),
  /cannot authorize execution/,
);

const requests = [];
const previewTransport = createApprovedPreviewSupabaseTransport({
  previewRef: APPROVED_SMART_PARROT_PREVIEW.projectRef,
  supabaseUrl: APPROVED_SMART_PARROT_PREVIEW.supabaseUrl,
  secretKey: 'sb_secret_phase_y_test_only',
  fetchImpl: async (url, init) => {
    requests.push({ url, init });
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      async json() { return raw; },
    };
  },
});
await previewTransport.invokeServer({
  target: PREVIEW_REQUEUE_LEASE_EXPIRY_OBSERVER_RPC,
  auth: 'service_rpc',
  payload: { p_limit: 1 },
});
assert.equal(requests.length, 1);
assert.equal(requests[0].init.headers.apikey, 'sb_secret_phase_y_test_only');
assert.equal('authorization' in requests[0].init.headers, false, 'modern sb_secret key must never be mirrored into Authorization');

console.log('Phase 4C5Y requeue lease expiry recovery boundary passed.');
