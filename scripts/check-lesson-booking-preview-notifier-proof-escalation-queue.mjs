#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizePreviewLaunchBlockerTrustedDeliveryProof,
  normalizePreviewLaunchBlockerEscalationQueue,
  recordPreviewLaunchBlockerTrustedDeliveryProof,
  preparePreviewLaunchBlockerEscalationQueue,
  PREVIEW_LAUNCH_BLOCKER_NOTIFIER_PROOF_RPC,
  PREVIEW_LAUNCH_BLOCKER_ESCALATION_QUEUE_RPC,
} from './lesson-booking-preview-notifier-proof-escalation-queue.mjs';
import {
  APPROVED_SMART_PARROT_PREVIEW,
  createApprovedPreviewSupabaseTransport,
} from './lesson-booking-full-preview-supabase-transport.mjs';

const migration = readFileSync(new URL(
  '../supabase/migrations/20260921081000_lesson_booking_phase4c5s_notifier_proof_escalation_queue.sql',
  import.meta.url,
), 'utf8');

const expect = (condition, message) => assert.ok(condition, message);

for (const table of [
  'lesson_booking_preview_launch_blocker_notifier_proofs',
  'lesson_booking_preview_launch_blocker_escalation_queue',
]) {
  expect(new RegExp(`create table if not exists public\\.${table}\\b`, 'i').test(migration), `missing ${table}`);
  expect(new RegExp(`alter table public\\.${table} enable row level security`, 'i').test(migration), `${table} must have RLS`);
  expect(new RegExp(`${table}_append_only`, 'i').test(migration), `${table} must be append-only`);
  expect(new RegExp(`revoke all on table public\\.${table}[\\s\\S]*?from public, anon, authenticated, service_role`, 'i').test(migration),
    `${table} must remain RPC-only`);
}

for (const rpc of [
  'service_record_booking_preview_launch_blocker_trusted_delivery_proof',
  'service_prepare_booking_preview_launch_blocker_escalation_queue',
]) {
  expect(new RegExp(`create or replace function public\\.${rpc}\\([\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`, 'i').test(migration),
    `${rpc} must be SECURITY DEFINER with empty search_path`);
  expect(new RegExp(`grant execute on function public\\.${rpc}\\([\\s\\S]*?to service_role`, 'i').test(migration),
    `${rpc} must be service-role-only`);
  expect(new RegExp(`revoke all on function public\\.${rpc}\\([\\s\\S]*?from public, anon, authenticated, service_role`, 'i').test(migration),
    `${rpc} must revoke browser/default execution before service_role grant`);
}

expect(/pg_advisory_xact_lock\(20260921,40516\)/i.test(migration),
  'Phase S must serialize against authoritative launch-blocker transitions');
expect(/proof_hash ~ '\^\[0-9a-f\]\{64\}\$'/i.test(migration), 'Phase S must persist only a SHA-256-shaped notifier proof hash');
expect(/p_proof_hash/i.test(migration), 'Phase S must require a proof hash');
expect(!/p_(?:raw_)?(?:message|receipt)_id\b/i.test(migration), 'Phase S must never accept raw notifier receipt/message ids');
expect(/outcome in \('delivered','failed','deferred'\)/i.test(migration), 'Phase S must reject terminal delivery conflicts');
expect(/v_delivery_key !~ '\^\[0-9a-f\]\{32\}\$'/i.test(migration), 'Phase S must bind proof to the exact deterministic delivery key');
expect(/service_observe_booking_preview_launch_blocker_escalation\(p_snapshot_id\)/i.test(migration),
  'Phase S queue must reuse the Phase R server-time escalation observer');
expect(!/\bdelete\s+from\b/i.test(migration), 'Phase S must not introduce destructive DELETE execution');
expect(!/\btruncate\b/i.test(migration), 'Phase S must not introduce TRUNCATE execution');
expect(!/https?:\/\//i.test(migration), 'Phase S database logic must not call a notifier/provider');

for (const sentinel of [
  'notifier_send_authorized boolean not null default false check (notifier_send_authorized = false)',
  'automatic_notification_authorized boolean not null default false check (automatic_notification_authorized = false)',
  'outcome_suppresses_blocker boolean not null default false check (outcome_suppresses_blocker = false)',
  'provider_write_authorized boolean not null default false check (provider_write_authorized = false)',
  'booking_launch_authorized boolean not null default false check (booking_launch_authorized = false)',
  'destructive_cleanup_authorized boolean not null default false check (destructive_cleanup_authorized = false)',
]) {
  expect(migration.includes(sentinel), `missing fail-closed Phase S sentinel: ${sentinel}`);
}

const rawProof = {
  schema_version: 'smart_parrot_booking_preview_launch_blocker_notifier_proof_v1',
  proof_id: 81,
  delivered_receipt_id: 82,
  snapshot_id: 51,
  alert_id: 52,
  delivery_key: '0123456789abcdef0123456789abcdef',
  proof_kind: 'message_id_hash',
  proof_hash: 'a'.repeat(64),
  recorded_at: '2026-09-21T08:10:00.000Z',
  replay: false,
  trusted_notifier_proof_accepted: true,
  outcome_suppresses_blocker: false,
  notifier_send_authorized: false,
  provider_write_authorized: false,
  booking_launch_authorized: false,
  destructive_cleanup_authorized: false,
  server_time_authoritative: true,
  raw_message_id: 'msg_should_not_escape',
  provider_name: 'provider_should_not_escape',
  recipient_email: 'person@example.invalid',
};

const normalizedProof = normalizePreviewLaunchBlockerTrustedDeliveryProof(rawProof);
for (const forbidden of ['msg_should_not_escape', 'provider_should_not_escape', 'person@example.invalid']) {
  expect(!JSON.stringify(normalizedProof).includes(forbidden), `notifier proof leaked ${forbidden}`);
}
assert.throws(
  () => normalizePreviewLaunchBlockerTrustedDeliveryProof({ ...rawProof, notifier_send_authorized: true }),
  /cannot authorize or suppress execution/,
);
assert.throws(
  () => normalizePreviewLaunchBlockerTrustedDeliveryProof({ ...rawProof, proof_hash: 'raw-provider-message-id' }),
  /proof_hash must be 64 lowercase hex characters/,
);

const rawQueue = {
  schema_version: 'smart_parrot_booking_preview_launch_blocker_escalation_queue_v1',
  queue_item_id: 91,
  snapshot_id: 51,
  alert_id: 52,
  delivery_key: '0123456789abcdef0123456789abcdef',
  severity: 'warning',
  age_class: 'overdue',
  escalation_class: 'urgent',
  blocker_count: 2,
  queued_at: '2026-09-21T08:10:01.000Z',
  replay: false,
  queue_required: true,
  automatic_notification_authorized: false,
  outcome_suppresses_blocker: false,
  provider_write_authorized: false,
  booking_launch_authorized: false,
  destructive_cleanup_authorized: false,
  server_time_authoritative: true,
  blocker_codes: ['provider_secret_bundle_missing'],
  user_id: 'user_should_not_escape',
  stripe_account_id: 'acct_should_not_escape',
};
const normalizedQueue = normalizePreviewLaunchBlockerEscalationQueue(rawQueue);
for (const forbidden of ['provider_secret_bundle_missing', 'user_should_not_escape', 'acct_should_not_escape']) {
  expect(!JSON.stringify(normalizedQueue).includes(forbidden), `escalation queue leaked ${forbidden}`);
}
assert.throws(
  () => normalizePreviewLaunchBlockerEscalationQueue({ ...rawQueue, automatic_notification_authorized: true }),
  /cannot authorize or suppress execution/,
);

const requests = [];
const transport = createApprovedPreviewSupabaseTransport({
  previewRef: APPROVED_SMART_PARROT_PREVIEW.projectRef,
  supabaseUrl: APPROVED_SMART_PARROT_PREVIEW.supabaseUrl,
  secretKey: 'sb_secret_phase_s_contract_only',
  fetchImpl: async (url, init) => {
    requests.push({ url, init });
    const body = url.endsWith(`/${PREVIEW_LAUNCH_BLOCKER_NOTIFIER_PROOF_RPC}`) ? rawProof : rawQueue;
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => body,
    };
  },
});

const proof = await recordPreviewLaunchBlockerTrustedDeliveryProof({
  transport,
  snapshotId: 51,
  deliveryKey: rawProof.delivery_key,
  proofKind: 'message_id_hash',
  proofHash: rawProof.proof_hash,
});
assert.equal(proof.proof_hash, rawProof.proof_hash);
const queue = await preparePreviewLaunchBlockerEscalationQueue({ transport, snapshotId: 51 });
assert.equal(queue.escalation_class, 'urgent');
assert.equal(requests.length, 2);
assert.equal(requests[0].url, `${APPROVED_SMART_PARROT_PREVIEW.supabaseUrl}/rest/v1/rpc/${PREVIEW_LAUNCH_BLOCKER_NOTIFIER_PROOF_RPC}`);
assert.equal(requests[1].url, `${APPROVED_SMART_PARROT_PREVIEW.supabaseUrl}/rest/v1/rpc/${PREVIEW_LAUNCH_BLOCKER_ESCALATION_QUEUE_RPC}`);
for (const request of requests) {
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.headers.apikey, 'sb_secret_phase_s_contract_only');
  expect(!Object.hasOwn(request.init.headers, 'authorization'), 'Phase S sb_secret service RPC must not use Authorization: Bearer');
  const payload = JSON.parse(request.init.body);
  expect(!Object.hasOwn(payload, 'p_now'), 'Phase S service payload must not include caller time');
  expect(!Object.keys(payload).some((key) => /raw|message_id$|receipt_id$/i.test(key)), 'Phase S payload must not accept raw notifier ids');
  expect(!JSON.stringify(payload).match(/sk_(?:test|live)_|whsec_|sb_secret_phase_s_contract_only|person@example.invalid/),
    'Phase S payload must not contain provider/server/customer secrets');
}
assert.deepEqual(JSON.parse(requests[0].init.body), {
  p_snapshot_id: 51,
  p_delivery_key: rawProof.delivery_key,
  p_proof_kind: 'message_id_hash',
  p_proof_hash: rawProof.proof_hash,
});
assert.deepEqual(JSON.parse(requests[1].init.body), { p_snapshot_id: 51 });

console.log('Lesson booking Phase 4C5S trusted notifier proof + escalation queue contract passed.');
