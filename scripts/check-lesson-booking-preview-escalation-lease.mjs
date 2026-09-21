#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizePreviewEscalationClaim,
  normalizePreviewEscalationTransition,
  normalizePreviewEscalationInspection,
  claimPreviewEscalationWork,
  transitionPreviewEscalationWork,
  inspectPreviewEscalationWork,
  PREVIEW_ESCALATION_CLAIM_RPC,
  PREVIEW_ESCALATION_TRANSITION_RPC,
  PREVIEW_ESCALATION_INSPECTION_RPC,
} from './lesson-booking-preview-escalation-lease.mjs';
import {
  APPROVED_SMART_PARROT_PREVIEW,
  createApprovedPreviewSupabaseTransport,
} from './lesson-booking-full-preview-supabase-transport.mjs';

const migration = readFileSync(new URL(
  '../supabase/migrations/20260921090000_lesson_booking_phase4c5t_escalation_claim_lease_retry_dead_letter.sql',
  import.meta.url,
), 'utf8');
const expect = (condition, message) => assert.ok(condition, message);
const table = 'lesson_booking_preview_launch_blocker_escalation_work_events';

expect(new RegExp(`create table if not exists public\\.${table}\\b`, 'i').test(migration), 'missing Phase T work event table');
expect(new RegExp(`alter table public\\.${table} enable row level security`, 'i').test(migration), 'Phase T work event table must have RLS');
expect(new RegExp(`${table}_append_only`, 'i').test(migration), 'Phase T work events must be append-only');
expect(new RegExp(`revoke all on table public\\.${table}[\\s\\S]*?from public, anon, authenticated, service_role`, 'i').test(migration),
  'Phase T work event table must remain RPC-only');

for (const rpc of [
  'service_claim_booking_preview_launch_blocker_escalation_work',
  'service_transition_booking_preview_launch_blocker_escalation_work',
  'service_list_booking_preview_launch_blocker_escalation_work',
]) {
  expect(new RegExp(`create or replace function public\\.${rpc}\\([\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`, 'i').test(migration),
    `${rpc} must be SECURITY DEFINER with empty search_path`);
  expect(new RegExp(`revoke all on function public\\.${rpc}\\([\\s\\S]*?from public, anon, authenticated, service_role`, 'i').test(migration),
    `${rpc} must revoke browser/default execution`);
  expect(new RegExp(`grant execute on function public\\.${rpc}\\([\\s\\S]*?to service_role`, 'i').test(migration),
    `${rpc} must be service-role-only`);
}

expect(/pg_advisory_xact_lock\(20260921,40520\)/i.test(migration), 'Phase T must serialize claim/lease transitions');
expect(/statement_timestamp\(\)/i.test(migration), 'Phase T must use PostgreSQL server time');
expect(/p_lease_seconds[\s\S]*?< 30[\s\S]*?> 300/i.test(migration), 'Phase T lease must be bounded to 30-300 seconds');
expect(/stale_preview_escalation_lease/i.test(migration), 'Phase T must reject stale leases');
expect(/preview_escalation_work_already_leased/i.test(migration), 'Phase T must reject concurrent active leases');
expect(/preview_escalation_retry_not_ready/i.test(migration), 'Phase T must enforce server-derived retry eligibility');
expect(/attempts_exhausted/i.test(migration) && /attempt_no < 5/i.test(migration), 'Phase T must guard attempts-exhausted dead-lettering');
expect(/when v_claim\.attempt_no <= 1 then 30[\s\S]*when v_claim\.attempt_no = 5 then 480[\s\S]*else 900/i.test(migration),
  'Phase T retry backoff must be deterministic and server-derived');
expect(!/\bdelete\s+from\b/i.test(migration), 'Phase T must not introduce DELETE execution');
expect(!/\btruncate\b/i.test(migration), 'Phase T must not introduce TRUNCATE execution');
expect(!/https?:\/\//i.test(migration), 'Phase T database logic must not call an external notifier/provider');
expect(!/\bcron\b[\s\S]*?schedule\s*\(/i.test(migration), 'Phase T must not activate Cron sending');
expect(!/p_(?:now|current_time|recorded_at|lease_expires_at|next_eligible_at)\b/i.test(migration),
  'Phase T must not accept caller-authoritative time');

for (const sentinel of [
  'automatic_notification_authorized boolean not null default false check (automatic_notification_authorized = false)',
  'notifier_send_authorized boolean not null default false check (notifier_send_authorized = false)',
  'outcome_suppresses_blocker boolean not null default false check (outcome_suppresses_blocker = false)',
  'provider_write_authorized boolean not null default false check (provider_write_authorized = false)',
  'booking_launch_authorized boolean not null default false check (booking_launch_authorized = false)',
  'destructive_cleanup_authorized boolean not null default false check (destructive_cleanup_authorized = false)',
]) {
  expect(migration.includes(sentinel), `missing fail-closed Phase T sentinel: ${sentinel}`);
}

const failClosed = {
  automatic_notification_authorized: false,
  notifier_send_authorized: false,
  outcome_suppresses_blocker: false,
  provider_write_authorized: false,
  booking_launch_authorized: false,
  destructive_cleanup_authorized: false,
  server_time_authoritative: true,
};
const claimKey = '1234567890abcdef1234567890abcdef';
const rawClaim = {
  schema_version: 'smart_parrot_booking_preview_launch_blocker_escalation_claim_v1',
  event_id: 101,
  queue_item_id: 91,
  snapshot_id: 51,
  alert_id: 52,
  claim_key: claimKey,
  attempt_no: 2,
  lease_seconds: 60,
  lease_expires_at: '2026-09-21T09:01:00.000Z',
  recorded_at: '2026-09-21T09:00:00.000Z',
  work_state: 'leased',
  lease_active: true,
  replay: false,
  ...failClosed,
  blocker_codes: ['provider_secret_bundle_missing'],
  recipient_email: 'person@example.invalid',
  stripe_account_id: 'acct_should_not_escape',
};
const normalizedClaim = normalizePreviewEscalationClaim(rawClaim);
assert.equal(normalizedClaim.claim_key, claimKey);
for (const forbidden of ['provider_secret_bundle_missing', 'person@example.invalid', 'acct_should_not_escape']) {
  expect(!JSON.stringify(normalizedClaim).includes(forbidden), `claim leaked ${forbidden}`);
}
assert.throws(() => normalizePreviewEscalationClaim({ ...rawClaim, notifier_send_authorized: true }), /cannot authorize or suppress execution/);
assert.throws(() => normalizePreviewEscalationClaim({ ...rawClaim, lease_seconds: 301 }), /between 30 and 300/);

const rawTransition = {
  schema_version: 'smart_parrot_booking_preview_launch_blocker_escalation_transition_v1',
  event_id: 102,
  queue_item_id: 91,
  snapshot_id: 51,
  alert_id: 52,
  claim_key: claimKey,
  attempt_no: 2,
  outcome: 'retry',
  reason_code: 'transient_failure',
  work_state: 'retry_wait',
  next_eligible_at: '2026-09-21T09:01:00.000Z',
  recorded_at: '2026-09-21T09:00:00.000Z',
  replay: false,
  ...failClosed,
  notifier_message_id: 'msg_should_not_escape',
};
const normalizedTransition = normalizePreviewEscalationTransition(rawTransition);
assert.equal(normalizedTransition.work_state, 'retry_wait');
expect(!JSON.stringify(normalizedTransition).includes('msg_should_not_escape'), 'transition leaked raw notifier identifier');
assert.throws(() => normalizePreviewEscalationTransition({ ...rawTransition, outcome: 'release' }), /outcome\/reason/);
assert.throws(() => normalizePreviewEscalationTransition({ ...rawTransition, next_eligible_at: null }), /must include next_eligible_at/);

const rawInspection = {
  schema_version: 'smart_parrot_booking_preview_launch_blocker_escalation_inspection_v1',
  captured_at: '2026-09-21T09:00:00.000Z',
  item_count: 1,
  items: [{
    queue_item_id: 91,
    snapshot_id: 51,
    alert_id: 52,
    delivery_key: '0123456789abcdef0123456789abcdef',
    severity: 'warning',
    escalation_class: 'urgent',
    blocker_count: 2,
    attempt_no: 2,
    work_state: 'leased',
    lease_expires_at: '2026-09-21T09:01:00.000Z',
    next_eligible_at: null,
    last_event_at: '2026-09-21T09:00:00.000Z',
    claim_key: 'ffffffffffffffffffffffffffffffff',
    blocker_codes: ['must_not_escape'],
    user_id: 'user_should_not_escape',
  }],
  ...failClosed,
};
const normalizedInspection = normalizePreviewEscalationInspection(rawInspection);
for (const forbidden of ['ffffffffffffffffffffffffffffffff', 'must_not_escape', 'user_should_not_escape']) {
  expect(!JSON.stringify(normalizedInspection).includes(forbidden), `inspection leaked ${forbidden}`);
}
assert.throws(() => normalizePreviewEscalationInspection({ ...rawInspection, item_count: 2 }), /item count mismatch/);

const requests = [];
const transport = createApprovedPreviewSupabaseTransport({
  previewRef: APPROVED_SMART_PARROT_PREVIEW.projectRef,
  supabaseUrl: APPROVED_SMART_PARROT_PREVIEW.supabaseUrl,
  secretKey: 'sb_secret_phase_t_contract_only',
  fetchImpl: async (url, init) => {
    requests.push({ url, init });
    let body;
    if (url.endsWith(`/${PREVIEW_ESCALATION_CLAIM_RPC}`)) body = rawClaim;
    else if (url.endsWith(`/${PREVIEW_ESCALATION_TRANSITION_RPC}`)) body = rawTransition;
    else body = rawInspection;
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => body,
    };
  },
});

await claimPreviewEscalationWork({ transport, queueItemId: 91, claimKey, leaseSeconds: 60 });
await transitionPreviewEscalationWork({ transport, queueItemId: 91, claimKey, outcome: 'retry', reasonCode: 'transient_failure' });
await inspectPreviewEscalationWork({ transport, limit: 25 });
assert.equal(requests.length, 3);
assert.equal(requests[0].url, `${APPROVED_SMART_PARROT_PREVIEW.supabaseUrl}/rest/v1/rpc/${PREVIEW_ESCALATION_CLAIM_RPC}`);
assert.equal(requests[1].url, `${APPROVED_SMART_PARROT_PREVIEW.supabaseUrl}/rest/v1/rpc/${PREVIEW_ESCALATION_TRANSITION_RPC}`);
assert.equal(requests[2].url, `${APPROVED_SMART_PARROT_PREVIEW.supabaseUrl}/rest/v1/rpc/${PREVIEW_ESCALATION_INSPECTION_RPC}`);
for (const request of requests) {
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.headers.apikey, 'sb_secret_phase_t_contract_only');
  expect(!Object.hasOwn(request.init.headers, 'authorization'), 'Phase T sb_secret service RPC must not use Authorization: Bearer');
  const payload = JSON.parse(request.init.body);
  expect(!Object.keys(payload).some((key) => /^p_(?:now|current_time|recorded_at|lease_expires_at|next_eligible_at)$/i.test(key)),
    'Phase T service payload must not include caller-authoritative time');
  expect(!JSON.stringify(payload).match(/sk_(?:test|live)_|whsec_|sb_secret_phase_t_contract_only|person@example.invalid/),
    'Phase T payload must not contain provider/server/customer secrets');
}
assert.deepEqual(JSON.parse(requests[0].init.body), {
  p_queue_item_id: 91,
  p_claim_key: claimKey,
  p_lease_seconds: 60,
});
assert.deepEqual(JSON.parse(requests[1].init.body), {
  p_queue_item_id: 91,
  p_claim_key: claimKey,
  p_outcome: 'retry',
  p_reason_code: 'transient_failure',
});
assert.deepEqual(JSON.parse(requests[2].init.body), { p_limit: 25 });

await assert.rejects(
  () => claimPreviewEscalationWork({ transport, queueItemId: 91, claimKey, leaseSeconds: 301 }),
  /between 30 and 300/,
);
await assert.rejects(
  () => transitionPreviewEscalationWork({ transport, queueItemId: 91, claimKey, outcome: 'retry', reasonCode: 'invalid_work_item' }),
  /outcome\/reason/,
);

console.log('Lesson booking Phase 4C5T escalation claim/lease + retry/dead-letter contract passed.');
