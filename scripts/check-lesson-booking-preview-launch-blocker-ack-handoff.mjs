#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizePreviewLaunchBlockerAcknowledgement,
  normalizePreviewLaunchBlockerAlertHandoff,
  recordPreviewLaunchBlockerAcknowledgement,
  preparePreviewLaunchBlockerAlertHandoff,
  PREVIEW_LAUNCH_BLOCKER_ACK_RPC,
  PREVIEW_LAUNCH_BLOCKER_HANDOFF_RPC,
} from './lesson-booking-preview-launch-blocker-ack-handoff.mjs';
import {
  APPROVED_SMART_PARROT_PREVIEW,
  createApprovedPreviewSupabaseTransport,
} from './lesson-booking-full-preview-supabase-transport.mjs';

const migration = readFileSync(new URL(
  '../supabase/migrations/20260921063500_lesson_booking_phase4c5q_launch_blocker_ack_runbook_handoff.sql',
  import.meta.url,
), 'utf8');

const expect = (condition, message) => assert.ok(condition, message);

for (const table of [
  'lesson_booking_preview_launch_blocker_acknowledgements',
  'lesson_booking_preview_launch_blocker_delivery_handoffs',
]) {
  expect(new RegExp(`create table if not exists public\\.${table}\\b`, 'i').test(migration), `missing ${table}`);
  expect(new RegExp(`alter table public\\.${table} enable row level security`, 'i').test(migration), `${table} must have RLS`);
  expect(new RegExp(`${table}_append_only`, 'i').test(migration), `${table} must be append-only`);
  expect(new RegExp(`revoke all on table public\\.${table}[\\s\\S]*?from public, anon, authenticated, service_role`, 'i').test(migration),
    `${table} must remain RPC-only`);
}

for (const rpc of [
  'service_record_booking_preview_launch_blocker_acknowledgement',
  'service_prepare_booking_preview_launch_blocker_alert_handoff',
]) {
  expect(new RegExp(`create or replace function public\\.${rpc}\\([\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`, 'i').test(migration),
    `${rpc} must be SECURITY DEFINER with empty search_path`);
  expect(new RegExp(`grant execute on function public\\.${rpc}\\([\\s\\S]*?to service_role`, 'i').test(migration),
    `${rpc} must be service-role-only`);
  expect(new RegExp(`revoke all on function public\\.${rpc}\\([\\s\\S]*?from public, anon, authenticated, service_role`, 'i').test(migration),
    `${rpc} must revoke default/browser execution before service_role grant`);
}

expect(/pg_advisory_xact_lock\(20260921,40516\)/i.test(migration),
  'Phase Q must serialize against the authoritative Phase P snapshot transition');
expect(/statement_timestamp\(\)/i.test(migration), 'Phase Q evidence must use PostgreSQL server time');
expect(!/\bp_now\b/i.test(migration), 'Phase Q must not accept caller/browser time');
expect(/stale_preview_launch_blocker_snapshot/i.test(migration), 'Phase Q must reject stale/superseded snapshot claims');
expect(/preview_launch_blocker_acknowledgement_conflict/i.test(migration), 'Phase Q must reject conflicting duplicate acknowledgements');
expect(!/\bdelete\s+from\b/i.test(migration), 'Phase Q must not introduce destructive DELETE execution');
expect(!/\btruncate\b/i.test(migration), 'Phase Q must not introduce TRUNCATE execution');
expect(!/https?:\/\//i.test(migration), 'Phase Q database logic must not make provider/network calls');

for (const sentinel of [
  'acknowledgement_suppresses_blocker boolean not null default false check (acknowledgement_suppresses_blocker = false)',
  'notifier_delivery_authorized boolean not null default false check (notifier_delivery_authorized = false)',
  'provider_write_authorized boolean not null default false check (provider_write_authorized = false)',
  'booking_launch_authorized boolean not null default false check (booking_launch_authorized = false)',
  'destructive_cleanup_authorized boolean not null default false check (destructive_cleanup_authorized = false)',
]) {
  expect(migration.includes(sentinel), `missing fail-closed Phase Q sentinel: ${sentinel}`);
}

const rawAck = {
  schema_version: 'smart_parrot_booking_preview_launch_blocker_ack_v1',
  acknowledgement_id: 41,
  snapshot_id: 31,
  alert_id: 32,
  decision: 'provider_configuration_required',
  blocker_codes: ['provider_secret_bundle_missing'],
  severity: 'warning',
  snapshot_captured_at: '2026-09-21T06:35:00.000Z',
  alert_recorded_at: '2026-09-21T06:35:01.000Z',
  acknowledged_at: '2026-09-21T06:35:02.000Z',
  replay: false,
  acknowledgement_suppresses_blocker: false,
  provider_write_authorized: false,
  booking_launch_authorized: false,
  destructive_cleanup_authorized: false,
  server_time_authoritative: true,
  provider_object_id: 'pi_should_not_escape',
  webhook_secret: 'whsec_should_not_escape',
  fixture_user_id: 'user_should_not_escape',
};

const normalizedAck = normalizePreviewLaunchBlockerAcknowledgement(rawAck);
for (const forbidden of ['pi_should_not_escape', 'whsec_should_not_escape', 'user_should_not_escape']) {
  expect(!JSON.stringify(normalizedAck).includes(forbidden), `acknowledgement leaked ${forbidden}`);
}
assert.throws(
  () => normalizePreviewLaunchBlockerAcknowledgement({ ...rawAck, booking_launch_authorized: true }),
  /cannot bypass blockers or authorize execution/,
);
assert.throws(
  () => normalizePreviewLaunchBlockerAcknowledgement({ ...rawAck, acknowledgement_suppresses_blocker: true }),
  /cannot bypass blockers or authorize execution/,
);

const rawHandoff = {
  snapshot_id: 31,
  alert_id: 32,
  blocker_codes: ['provider_secret_bundle_missing'],
  severity: 'warning',
  snapshot_captured_at: '2026-09-21T06:35:00.000Z',
  alert_recorded_at: '2026-09-21T06:35:01.000Z',
  prepared_at: '2026-09-21T06:35:03.000Z',
  provider_write_authorized: true,
  booking_launch_authorized: true,
  notifier_delivery_authorized: true,
  stripe_account_id: 'acct_should_not_escape',
  token: 'jwt_should_not_escape',
  payment_data: 'card_should_not_escape',
};

const normalizedHandoff = normalizePreviewLaunchBlockerAlertHandoff(rawHandoff);
assert.deepEqual(Object.keys(normalizedHandoff), [
  'snapshot_id',
  'alert_id',
  'blocker_codes',
  'severity',
  'snapshot_captured_at',
  'alert_recorded_at',
  'prepared_at',
]);
for (const forbidden of ['acct_should_not_escape', 'jwt_should_not_escape', 'card_should_not_escape', 'provider_write_authorized', 'booking_launch_authorized']) {
  expect(!JSON.stringify(normalizedHandoff).includes(forbidden), `handoff leaked or accepted authority field ${forbidden}`);
}

const requests = [];
const transport = createApprovedPreviewSupabaseTransport({
  previewRef: APPROVED_SMART_PARROT_PREVIEW.projectRef,
  supabaseUrl: APPROVED_SMART_PARROT_PREVIEW.supabaseUrl,
  secretKey: 'sb_secret_phase_q_contract_only',
  fetchImpl: async (url, init) => {
    requests.push({ url, init });
    const body = url.endsWith(`/${PREVIEW_LAUNCH_BLOCKER_ACK_RPC}`) ? rawAck : rawHandoff;
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => body,
    };
  },
});

const ack = await recordPreviewLaunchBlockerAcknowledgement({
  transport,
  snapshotId: 31,
  decision: 'provider_configuration_required',
});
assert.equal(ack.snapshot_id, 31);
const handoff = await preparePreviewLaunchBlockerAlertHandoff({ transport, snapshotId: 31 });
assert.equal(handoff.alert_id, 32);
assert.equal(requests.length, 2);
assert.equal(requests[0].url, `${APPROVED_SMART_PARROT_PREVIEW.supabaseUrl}/rest/v1/rpc/${PREVIEW_LAUNCH_BLOCKER_ACK_RPC}`);
assert.equal(requests[1].url, `${APPROVED_SMART_PARROT_PREVIEW.supabaseUrl}/rest/v1/rpc/${PREVIEW_LAUNCH_BLOCKER_HANDOFF_RPC}`);
for (const request of requests) {
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.headers.apikey, 'sb_secret_phase_q_contract_only');
  expect(!Object.hasOwn(request.init.headers, 'authorization'), 'Phase Q sb_secret service RPC must not use Authorization: Bearer');
  expect(!JSON.stringify(JSON.parse(request.init.body)).match(/sk_(?:test|live)_|whsec_|sb_secret_phase_q_contract_only/),
    'Phase Q service payload must not contain provider/server secrets');
  expect(!Object.hasOwn(JSON.parse(request.init.body), 'p_now'), 'Phase Q service payload must not include caller time');
}
assert.deepEqual(JSON.parse(requests[0].init.body), {
  p_snapshot_id: 31,
  p_decision: 'provider_configuration_required',
});
assert.deepEqual(JSON.parse(requests[1].init.body), { p_snapshot_id: 31 });
assert.throws(
  () => recordPreviewLaunchBlockerAcknowledgement({ transport, snapshotId: 31, decision: 'launch_now' }),
  /Invalid preview launch-blocker runbook decision/,
);

console.log('Lesson booking Phase 4C5Q acknowledgement/runbook + alert-handoff contract passed.');
