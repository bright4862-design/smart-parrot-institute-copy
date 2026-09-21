#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizePreviewRequeueDeliveryIntent,
  preparePreviewRequeueDeliveryIntent,
  PREVIEW_REQUEUE_DELIVERY_INTENT_RPC,
} from './lesson-booking-preview-requeue-delivery-intent.mjs';
import {
  APPROVED_SMART_PARROT_PREVIEW,
  createApprovedPreviewSupabaseTransport,
} from './lesson-booking-full-preview-supabase-transport.mjs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260921153000_lesson_booking_phase4c5z_requeue_delivery_intent.sql', import.meta.url),
  'utf8',
);
const expect = (value, message) => assert.ok(value, message);
const intentTable = 'lesson_booking_preview_launch_blocker_requeue_delivery_intents';

expect(migration.includes(`create table if not exists public.${intentTable}`), 'missing Phase Z delivery-intent table');
expect(migration.includes(`alter table public.${intentTable} enable row level security`), 'Phase Z intent table must have RLS');
expect(migration.includes(`${intentTable}_append_only`), 'Phase Z intent evidence must be append-only');
expect(migration.includes(`revoke all on table public.${intentTable}`), 'Phase Z intent table must remain RPC-only');
expect(migration.includes(`create or replace function public.${PREVIEW_REQUEUE_DELIVERY_INTENT_RPC}`), 'missing Phase Z preparation RPC');
expect(/security definer\s+set search_path = ''/gi.test(migration), 'Phase Z privileged RPC must pin search_path');
expect(/pg_advisory_xact_lock\(20260921,40520\)/i.test(migration), 'Phase Z must serialize with the requeue family');
expect(/statement_timestamp\(\)/i.test(migration), 'Phase Z must use PostgreSQL server time');
expect(/lease_expires_at <= v_now/i.test(migration), 'Phase Z must reject expired leases');
expect(/lesson_booking_preview_launch_blocker_requeue_lease_expiries[\s\S]*?claim_event_id = v_claim\.event_id/i.test(migration), 'Phase Z must reject Phase Y expiry evidence');
expect(/event_kind in \('released','retry_scheduled','dead_lettered'\)/i.test(migration), 'Phase Z must reject terminal claim evidence');
expect(/v_latest_event_id is distinct from v_claim\.event_id/i.test(migration), 'Phase Z must reject superseded claims');
expect(/intent_key ~ '\^rqi:/i.test(migration), 'Phase Z intent key must be deterministic and constrained');
expect(/transport_scope text not null check \(transport_scope = 'provider_neutral_preview'\)/i.test(migration), 'Phase Z must stay provider-neutral');
expect(/check \(prepared_at < lease_expires_at\)/i.test(migration), 'Phase Z must not persist post-expiry intent evidence');
expect(new RegExp(`grant execute on function public\\.${PREVIEW_REQUEUE_DELIVERY_INTENT_RPC}\\(bigint\\)[\\s\\S]*?to service_role`, 'i').test(migration), 'Phase Z RPC must be service-role only');
expect(!/\bdelete\s+from\b/i.test(migration) && !/\btruncate\b/i.test(migration), 'destructive SQL is forbidden');
expect(!/https?:\/\//i.test(migration), 'external calls are forbidden');
expect(!/\bnet\.http_/i.test(migration), 'database HTTP calls are forbidden');
expect(!/\bcron\b[\s\S]*?schedule\s*\(/i.test(migration), 'Cron sending is forbidden');
expect(!/p_(?:now|current_time|observed_at|lease_expires_at|prepared_at)\b/i.test(migration), 'caller-controlled time is forbidden');

for (const sentinel of [
  'external_notification_http_authorized',
  'delivery_assertion_authorized',
  'requeue_execution_authorized',
  'automatic_notification_authorized',
  'notifier_send_authorized',
  'outcome_suppresses_blocker',
  'provider_write_authorized',
  'booking_launch_authorized',
  'destructive_cleanup_authorized',
]) {
  expect(
    new RegExp(`${sentinel} boolean not null default false check \\(${sentinel} = false\\)`, 'i').test(migration),
    `missing fail-closed ${sentinel}`,
  );
}

const raw = {
  schema_version: 'smart_parrot_booking_preview_launch_blocker_requeue_delivery_intent_v1',
  intent_id: 901,
  claim_event_id: 701,
  activation_id: 601,
  work_generation_id: 501,
  queue_item_id: 92,
  snapshot_id: 51,
  alert_id: 53,
  lineage_ref: 'rqg:51:92:301:1',
  lease_generation_no: 2,
  lease_expires_at: '2026-09-21T14:12:00.000Z',
  intent_key: 'rqi:601:701:2',
  intent_state: 'prepared',
  transport_scope: 'provider_neutral_preview',
  prepared_at: '2026-09-21T14:10:00.000Z',
  replay: false,
  external_notification_http_authorized: false,
  delivery_assertion_authorized: false,
  requeue_execution_authorized: false,
  automatic_notification_authorized: false,
  notifier_send_authorized: false,
  outcome_suppresses_blocker: false,
  provider_write_authorized: false,
  booking_launch_authorized: false,
  destructive_cleanup_authorized: false,
  server_time_authoritative: true,
  claim_key: 'f'.repeat(32),
  stripe_payment_intent_id: 'pi_should_not_leak',
  daily_room_name: 'should-not-leak',
  customer_email: 'should-not-leak@example.test',
  service_secret: 'should-not-leak',
};

const normalized = normalizePreviewRequeueDeliveryIntent(raw);
assert.equal(normalized.intent_state, 'prepared');
assert.equal(normalized.intent_key, 'rqi:601:701:2');
assert.equal('claim_key' in normalized, false);
assert.equal('stripe_payment_intent_id' in normalized, false);
assert.equal('daily_room_name' in normalized, false);
assert.equal('customer_email' in normalized, false);
assert.equal('service_secret' in normalized, false);

let observedCall = null;
const prepared = await preparePreviewRequeueDeliveryIntent({
  transport: {
    async invokeServer(call) {
      observedCall = call;
      return raw;
    },
  },
  claimEventId: 701,
});
assert.equal(observedCall.target, PREVIEW_REQUEUE_DELIVERY_INTENT_RPC);
assert.equal(observedCall.auth, 'service_rpc');
assert.deepEqual(observedCall.payload, { p_claim_event_id: 701 });
assert.equal(prepared.intent_id, 901);

assert.throws(
  () => normalizePreviewRequeueDeliveryIntent({ ...raw, notifier_send_authorized: true }),
  /cannot authorize HTTP delivery/,
);
assert.throws(
  () => normalizePreviewRequeueDeliveryIntent({ ...raw, intent_state: 'delivered' }),
  /must remain prepared/,
);
assert.throws(
  () => normalizePreviewRequeueDeliveryIntent({ ...raw, intent_key: 'rqi:601:702:2' }),
  /intent key mismatch/,
);
assert.throws(
  () => normalizePreviewRequeueDeliveryIntent({ ...raw, prepared_at: raw.lease_expires_at }),
  /must be prepared before lease expiry/,
);
await assert.rejects(
  () => preparePreviewRequeueDeliveryIntent({
    transport: { invokeServer: async () => raw },
    claimEventId: 0,
  }),
  /claim_event_id must be a positive integer/,
);

const requests = [];
const previewTransport = createApprovedPreviewSupabaseTransport({
  previewRef: APPROVED_SMART_PARROT_PREVIEW.projectRef,
  supabaseUrl: APPROVED_SMART_PARROT_PREVIEW.supabaseUrl,
  secretKey: 'sb_secret_phase_z_test_only',
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
  target: PREVIEW_REQUEUE_DELIVERY_INTENT_RPC,
  auth: 'service_rpc',
  payload: { p_claim_event_id: 701 },
});
assert.equal(requests.length, 1);
assert.equal(requests[0].init.headers.apikey, 'sb_secret_phase_z_test_only');
assert.equal('authorization' in requests[0].init.headers, false, 'modern sb_secret key must never be mirrored into Authorization');

console.log('Phase 4C5Z requeue delivery-intent boundary passed.');
