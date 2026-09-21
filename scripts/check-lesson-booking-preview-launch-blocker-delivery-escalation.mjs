#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizePreviewLaunchBlockerDeliveryReceipt,
  normalizePreviewLaunchBlockerEscalation,
  recordPreviewLaunchBlockerDeliveryReceipt,
  observePreviewLaunchBlockerEscalation,
  PREVIEW_LAUNCH_BLOCKER_DELIVERY_RECEIPT_RPC,
  PREVIEW_LAUNCH_BLOCKER_ESCALATION_RPC,
} from './lesson-booking-preview-launch-blocker-delivery-escalation.mjs';
import {
  APPROVED_SMART_PARROT_PREVIEW,
  createApprovedPreviewSupabaseTransport,
} from './lesson-booking-full-preview-supabase-transport.mjs';

const migration = readFileSync(new URL(
  '../supabase/migrations/20260921070500_lesson_booking_phase4c5r_notifier_delivery_escalation.sql',
  import.meta.url,
), 'utf8');

const expect = (condition, message) => assert.ok(condition, message);

for (const table of [
  'lesson_booking_preview_launch_blocker_delivery_receipts',
  'lesson_booking_preview_launch_blocker_escalation_observations',
]) {
  expect(new RegExp(`create table if not exists public\\.${table}\\b`, 'i').test(migration), `missing ${table}`);
  expect(new RegExp(`alter table public\\.${table} enable row level security`, 'i').test(migration), `${table} must have RLS`);
  expect(new RegExp(`${table}_append_only`, 'i').test(migration), `${table} must be append-only`);
  expect(new RegExp(`revoke all on table public\\.${table}[\\s\\S]*?from public, anon, authenticated, service_role`, 'i').test(migration),
    `${table} must remain RPC-only`);
}

for (const rpc of [
  'service_record_booking_preview_launch_blocker_delivery_receipt',
  'service_observe_booking_preview_launch_blocker_escalation',
]) {
  expect(new RegExp(`create or replace function public\\.${rpc}\\([\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`, 'i').test(migration),
    `${rpc} must be SECURITY DEFINER with empty search_path`);
  expect(new RegExp(`grant execute on function public\\.${rpc}\\([\\s\\S]*?to service_role`, 'i').test(migration),
    `${rpc} must be service-role-only`);
  expect(new RegExp(`revoke all on function public\\.${rpc}\\([\\s\\S]*?from public, anon, authenticated, service_role`, 'i').test(migration),
    `${rpc} must revoke browser/default execution before service_role grant`);
}

expect(/pg_advisory_xact_lock\(20260921,40516\)/i.test(migration),
  'Phase R must serialize against the authoritative launch-blocker transition');
expect(/statement_timestamp\(\)/i.test(migration), 'Phase R must use PostgreSQL server time');
expect(!/\bp_now\b/i.test(migration), 'Phase R must not accept caller/browser time');
expect(/trusted_notifier_delivery_proof_required/i.test(migration), 'Phase R must reject forged delivered claims');
expect(/preview_launch_blocker_delivery_terminal_outcome_conflict/i.test(migration), 'Phase R must reject conflicting terminal delivery outcomes');
expect(/stale_preview_launch_blocker_snapshot/i.test(migration), 'Phase R must reject stale/superseded handoffs');
expect(!/\bdelete\s+from\b/i.test(migration), 'Phase R must not introduce destructive DELETE execution');
expect(!/\btruncate\b/i.test(migration), 'Phase R must not introduce TRUNCATE execution');
expect(!/https?:\/\//i.test(migration), 'Phase R database logic must not call a notifier/provider');

for (const sentinel of [
  'notifier_send_authorized boolean not null default false check (notifier_send_authorized = false)',
  'automatic_notification_authorized boolean not null default false check (automatic_notification_authorized = false)',
  'outcome_suppresses_blocker boolean not null default false check (outcome_suppresses_blocker = false)',
  'provider_write_authorized boolean not null default false check (provider_write_authorized = false)',
  'booking_launch_authorized boolean not null default false check (booking_launch_authorized = false)',
  'destructive_cleanup_authorized boolean not null default false check (destructive_cleanup_authorized = false)',
]) {
  expect(migration.includes(sentinel), `missing fail-closed Phase R sentinel: ${sentinel}`);
}

const rawReceipt = {
  schema_version: 'smart_parrot_booking_preview_launch_blocker_delivery_receipt_v1',
  receipt_id: 61,
  snapshot_id: 51,
  alert_id: 52,
  delivery_key: '0123456789abcdef0123456789abcdef',
  outcome: 'prepared',
  blocker_codes: ['provider_secret_bundle_missing'],
  severity: 'warning',
  handoff_prepared_at: '2026-09-21T07:05:00.000Z',
  recorded_at: '2026-09-21T07:05:01.000Z',
  replay: false,
  outcome_suppresses_blocker: false,
  notifier_send_authorized: false,
  provider_write_authorized: false,
  booking_launch_authorized: false,
  destructive_cleanup_authorized: false,
  server_time_authoritative: true,
  provider_object_id: 'pi_should_not_escape',
  webhook_secret: 'whsec_should_not_escape',
  user_email: 'person@example.invalid',
};

const normalizedReceipt = normalizePreviewLaunchBlockerDeliveryReceipt(rawReceipt);
for (const forbidden of ['pi_should_not_escape', 'whsec_should_not_escape', 'person@example.invalid']) {
  expect(!JSON.stringify(normalizedReceipt).includes(forbidden), `receipt leaked ${forbidden}`);
}
assert.throws(
  () => normalizePreviewLaunchBlockerDeliveryReceipt({ ...rawReceipt, notifier_send_authorized: true }),
  /cannot authorize or suppress execution/,
);
assert.throws(
  () => normalizePreviewLaunchBlockerDeliveryReceipt({ ...rawReceipt, outcome_suppresses_blocker: true }),
  /cannot authorize or suppress execution/,
);

const rawEscalation = {
  schema_version: 'smart_parrot_booking_preview_launch_blocker_escalation_v1',
  observation_id: 71,
  snapshot_id: 51,
  alert_id: 52,
  blocker_codes: ['provider_secret_bundle_missing'],
  severity: 'warning',
  age_class: 'aging',
  escalation_class: 'review',
  observed_at: '2026-09-21T07:35:00.000Z',
  replay: false,
  blocker_unresolved: true,
  automatic_notification_authorized: false,
  outcome_suppresses_blocker: false,
  provider_write_authorized: false,
  booking_launch_authorized: false,
  destructive_cleanup_authorized: false,
  server_time_authoritative: true,
  stripe_account_id: 'acct_should_not_escape',
  token: 'jwt_should_not_escape',
  payment_data: 'card_should_not_escape',
};

const normalizedEscalation = normalizePreviewLaunchBlockerEscalation(rawEscalation);
for (const forbidden of ['acct_should_not_escape', 'jwt_should_not_escape', 'card_should_not_escape']) {
  expect(!JSON.stringify(normalizedEscalation).includes(forbidden), `escalation leaked ${forbidden}`);
}
assert.throws(
  () => normalizePreviewLaunchBlockerEscalation({ ...rawEscalation, automatic_notification_authorized: true }),
  /cannot authorize or suppress execution/,
);

const requests = [];
const transport = createApprovedPreviewSupabaseTransport({
  previewRef: APPROVED_SMART_PARROT_PREVIEW.projectRef,
  supabaseUrl: APPROVED_SMART_PARROT_PREVIEW.supabaseUrl,
  secretKey: 'sb_secret_phase_r_contract_only',
  fetchImpl: async (url, init) => {
    requests.push({ url, init });
    const body = url.endsWith(`/${PREVIEW_LAUNCH_BLOCKER_DELIVERY_RECEIPT_RPC}`) ? rawReceipt : rawEscalation;
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => body,
    };
  },
});

const receipt = await recordPreviewLaunchBlockerDeliveryReceipt({
  transport,
  snapshotId: 51,
  outcome: 'prepared',
});
assert.equal(receipt.delivery_key, rawReceipt.delivery_key);
const escalation = await observePreviewLaunchBlockerEscalation({ transport, snapshotId: 51 });
assert.equal(escalation.escalation_class, 'review');
assert.equal(requests.length, 2);
assert.equal(requests[0].url, `${APPROVED_SMART_PARROT_PREVIEW.supabaseUrl}/rest/v1/rpc/${PREVIEW_LAUNCH_BLOCKER_DELIVERY_RECEIPT_RPC}`);
assert.equal(requests[1].url, `${APPROVED_SMART_PARROT_PREVIEW.supabaseUrl}/rest/v1/rpc/${PREVIEW_LAUNCH_BLOCKER_ESCALATION_RPC}`);
for (const request of requests) {
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.headers.apikey, 'sb_secret_phase_r_contract_only');
  expect(!Object.hasOwn(request.init.headers, 'authorization'), 'Phase R sb_secret service RPC must not use Authorization: Bearer');
  const payload = JSON.parse(request.init.body);
  expect(!Object.hasOwn(payload, 'p_now'), 'Phase R service payload must not include caller time');
  expect(!JSON.stringify(payload).match(/sk_(?:test|live)_|whsec_|sb_secret_phase_r_contract_only/),
    'Phase R payload must not contain provider/server secrets');
}
assert.deepEqual(JSON.parse(requests[0].init.body), { p_snapshot_id: 51, p_outcome: 'prepared' });
assert.deepEqual(JSON.parse(requests[1].init.body), { p_snapshot_id: 51 });
await assert.rejects(
  recordPreviewLaunchBlockerDeliveryReceipt({ transport, snapshotId: 51, outcome: 'delivered' }),
  /Trusted notifier delivery proof is required/,
);
expect(requests.length === 2, 'forged delivered claim must stop before transport');

console.log('Lesson booking Phase 4C5R notifier delivery + escalation contract passed.');
