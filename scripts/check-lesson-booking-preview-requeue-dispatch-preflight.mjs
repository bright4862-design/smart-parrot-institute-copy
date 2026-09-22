#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizePreviewRequeueDispatchPreflight,
  preparePreviewRequeueDispatchPreflight,
} from './lesson-booking-preview-requeue-dispatch-preflight.mjs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260921173000_lesson_booking_phase4c5ab_requeue_dispatch_preflight.sql', import.meta.url),
  'utf8',
);
const stableRpcMigration = readFileSync(
  new URL('../supabase/migrations/20260922112000_lesson_booking_phase4c5ab1_stable_dispatch_rpc.sql', import.meta.url),
  'utf8',
);
const client = readFileSync(new URL('./lesson-booking-preview-requeue-dispatch-preflight.mjs', import.meta.url), 'utf8');
const expect = (value, message) => assert.ok(value, message);
const preflightTable = 'lesson_booking_preview_requeue_dispatch_preflights';
const exclusionTable = 'lesson_booking_preview_requeue_dispatch_exclusions';
const legacyRpc = 'service_prepare_booking_preview_launch_blocker_requeue_dispatch_preflight';
const rpc = 'service_prepare_booking_preview_requeue_dispatch';

for (const table of [preflightTable, exclusionTable]) {
  expect(migration.includes(`create table if not exists public.${table}`), `missing ${table}`);
  expect(migration.includes(`alter table public.${table} enable row level security`), `${table} must have RLS`);
  expect(migration.includes(`revoke all on table public.${table}`), `${table} must remain RPC-only`);
}
expect(migration.includes('booking_preview_requeue_dispatch_preflight_append_only'), 'preflight evidence must be append-only');
expect(migration.includes('booking_preview_requeue_dispatch_exclusion_append_only'), 'exclusion evidence must be append-only');

expect(migration.includes(`create or replace function public.${legacyRpc}`), 'missing authoritative Phase AB dispatch-preflight implementation');
expect(/security definer\s+set search_path = ''/gi.test(migration), 'Phase AB privileged implementation must pin search_path');
expect(/pg_advisory_xact_lock\(20260921,40520\)/i.test(migration), 'Phase AB must serialize with the requeue family');
expect(/statement_timestamp\(\)/i.test(migration), 'Phase AB must use PostgreSQL server time');
expect(/lesson_booking_preview_launch_blocker_requeue_delivery_intent_terminals/i.test(migration), 'Phase AB must honor Phase AA terminal evidence');
expect(/t\.event_id > v_claim\.event_id[\s\S]*?event_kind in \('released','retry_scheduled','dead_lettered'\)/i.test(migration), 'Phase AB must revalidate exact claim closure');
expect(/v_intent\.lease_expires_at <= v_now/i.test(migration), 'Phase AB must reject server-time-expired intents');
expect(/v_intent\.snapshot_id <> v_latest_snapshot_id/i.test(migration), 'Phase AB must reject superseded snapshots');
expect(/if v_exclusion_reason is not null[\s\S]*?insert into public\.lesson_booking_preview_requeue_dispatch_exclusions/i.test(migration), 'Phase AB must persist stale-intent exclusion before ready replay');
expect(/if v_existing\.preflight_id is not null[\s\S]*?preflight_key <> v_preflight_key[\s\S]*?preflight_key_conflict/i.test(migration), 'Phase AB must reject conflicting current preflight keys');
expect(/preflight_state text not null check \(preflight_state = 'ready_no_send'\)/i.test(migration), 'Phase AB preflight must remain no-send');
expect(/exclusion_reason text not null check \(exclusion_reason in \('claim_closed','lease_expired','snapshot_superseded'\)\)/i.test(migration), 'Phase AB exclusion reasons must be bounded');
expect(!/\bdelete\s+from\b/i.test(migration) && !/\btruncate\b/i.test(migration), 'destructive SQL is forbidden');
expect(!/https?:\/\//i.test(migration), 'external HTTP endpoints are forbidden');
expect(!/\bnet\.http_/i.test(migration), 'database HTTP calls are forbidden');
expect(!/\bcron\b[\s\S]*?schedule\s*\(/i.test(migration), 'Cron sending is forbidden');
expect(!/p_(?:now|current_time|observed_at|lease_expires_at|prepared_at)\b/i.test(migration), 'caller-controlled time is forbidden');

expect(stableRpcMigration.includes(`create or replace function public.${rpc}`), 'missing stable Phase AB dispatch RPC alias');
expect(new RegExp(`security definer[\\s\\S]*?set search_path = ''`, 'i').test(stableRpcMigration), 'stable Phase AB RPC alias must pin search_path');
expect(new RegExp(`grant execute on function public\\.${rpc}\\(bigint,text\\)[\\s\\S]*?to service_role`, 'i').test(stableRpcMigration), 'stable Phase AB RPC alias must be service-role only');
expect(new RegExp(`revoke execute on function public\\.${legacyRpc}\\(bigint,text\\)[\\s\\S]*?from public, anon, authenticated, service_role`, 'i').test(stableRpcMigration), 'legacy overlong RPC must not remain service-callable');
expect(stableRpcMigration.includes(`select public.${legacyRpc}(`), 'stable RPC alias must delegate to authoritative Phase AB implementation');
expect(Buffer.byteLength(rpc, 'utf8') <= 63, 'stable Phase AB RPC alias must fit PostgreSQL identifier limit');

for (const table of [preflightTable, exclusionTable]) {
  const tableBlock = migration.match(new RegExp(`create table if not exists public\\.${table} \\([\\s\\S]*?\\n\\);`, 'i'))?.[0] ?? '';
  expect(tableBlock.length > 0, `could not isolate ${table}`);
  for (const forbidden of ['claim_key', 'stripe_', 'daily_', 'customer_email', 'provider_payload', 'notifier_receipt', 'access_token', 'secret']) {
    expect(!tableBlock.toLowerCase().includes(forbidden), `${table} must not store ${forbidden}`);
  }
}

for (const sentinel of [
  'dispatch_authorized',
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
    migration.match(new RegExp(`${sentinel} boolean not null default false check \\(${sentinel} = false\\)`, 'gi'))?.length === 2,
    `both Phase AB evidence tables must constrain ${sentinel}=false`,
  );
  expect(new RegExp(`'${sentinel}',false`, 'i').test(migration), `RPC must return fail-closed ${sentinel}`);
  expect(client.includes(`${sentinel}: false`), `client must allowlist fail-closed ${sentinel}`);
}

expect(client.includes(`const DISPATCH_PREFLIGHT_RPC = '${rpc}'`), 'Phase AB client must target the stable RPC alias');
expect(!client.includes(`const DISPATCH_PREFLIGHT_RPC = '${legacyRpc}'`), 'Phase AB client must not target the overlong legacy RPC');
expect(!/fetch\s*\(/.test(client), 'Phase AB client must not perform external HTTP');
expect(!/Date\.now\s*\(/.test(client), 'Phase AB client must not authoritatively decide time');
expect(!/p_(?:now|current_time|observed_at|lease_expires_at|prepared_at)\s*:/.test(client), 'Phase AB client must not send caller time');
expect(client.includes("auth: 'service_rpc'"), 'Phase AB client must use approved service RPC transport');
expect(client.includes('p_intent_id') && client.includes('p_preflight_key'), 'Phase AB client must send only exact intent + idempotency key');

const readyRaw = {
  schema_version: 'smart_parrot_booking_preview_launch_blocker_requeue_dispatch_preflight_v1',
  decision: 'ready_no_send', preflight_id: 21, exclusion_id: null, intent_id: 11, claim_event_id: 12,
  activation_id: 13, work_generation_id: 14, queue_item_id: 15, snapshot_id: 16, alert_id: 17,
  lineage_ref: 'rqg:16:15:18:1', lease_generation_no: 1,
  lease_expires_at: '2026-09-21T16:05:00.000Z', intent_key: 'rqi:13:12:1', exclusion_reason: null,
  observed_at: '2026-09-21T16:00:00.000Z', preflight_scope: 'provider_neutral_preview', replay: false,
  dispatch_authorized: false, external_notification_http_authorized: false, delivery_assertion_authorized: false,
  requeue_execution_authorized: false, automatic_notification_authorized: false, notifier_send_authorized: false,
  outcome_suppresses_blocker: false, provider_write_authorized: false, booking_launch_authorized: false,
  destructive_cleanup_authorized: false, server_time_authoritative: true,
  claim_key: 'must-not-leak', provider_payload: { nope: true },
};
const normalizedReady = normalizePreviewRequeueDispatchPreflight(readyRaw);
expect(!('claim_key' in normalizedReady) && !('provider_payload' in normalizedReady), 'normalizer must strip unexpected sensitive fields');
expect(normalizedReady.decision === 'ready_no_send' && normalizedReady.preflight_id === 21, 'ready normalizer mismatch');

const excluded = normalizePreviewRequeueDispatchPreflight({
  ...readyRaw,
  decision: 'excluded',
  preflight_id: 21,
  exclusion_id: 22,
  exclusion_reason: 'claim_closed',
  observed_at: '2026-09-21T16:01:00.000Z',
});
expect(excluded.decision === 'excluded' && excluded.exclusion_reason === 'claim_closed', 'excluded normalizer mismatch');

assert.throws(
  () => normalizePreviewRequeueDispatchPreflight({ ...readyRaw, dispatch_authorized: true }),
  /fail closed/,
  'client must reject any dispatch authority',
);
assert.throws(
  () => normalizePreviewRequeueDispatchPreflight({ ...readyRaw, observed_at: readyRaw.lease_expires_at }),
  /after lease expiry/,
  'client must reject ready evidence at/after lease expiry',
);
assert.throws(
  () => normalizePreviewRequeueDispatchPreflight({ ...readyRaw, decision: 'excluded', exclusion_id: 23, exclusion_reason: 'lease_expired' }),
  /precedes authoritative expiry/,
  'client must reject premature lease-expiry exclusion',
);

const calls = [];
const transport = { invokeServer: async (request) => { calls.push(request); return readyRaw; } };
await preparePreviewRequeueDispatchPreflight({
  transport,
  intentId: 11,
  preflightKey: 'abcdefabcdefabcdefabcdefabcdefab',
});
assert.deepEqual(calls[0], {
  target: rpc,
  auth: 'service_rpc',
  payload: { p_intent_id: 11, p_preflight_key: 'abcdefabcdefabcdefabcdefabcdefab' },
});
await assert.rejects(
  () => preparePreviewRequeueDispatchPreflight({ transport, intentId: 11, preflightKey: '0'.repeat(32) }),
  /non-zero/,
  'zero preflight key must be rejected before transport',
);

console.log('Phase 4C5AB requeue dispatch-preflight boundary passed with stable service RPC alias.');
