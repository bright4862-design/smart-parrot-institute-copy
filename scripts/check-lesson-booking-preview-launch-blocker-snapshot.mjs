#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizePreviewLaunchBlockerRuntimeReadiness,
  normalizePreviewLaunchBlockerSnapshot,
  recordPreviewLaunchBlockerSnapshot,
  PREVIEW_LAUNCH_BLOCKER_RPC,
} from './lesson-booking-preview-launch-blocker-snapshot.mjs';
import {
  APPROVED_SMART_PARROT_PREVIEW,
  createApprovedPreviewSupabaseTransport,
} from './lesson-booking-full-preview-supabase-transport.mjs';

const migration = readFileSync(new URL(
  '../supabase/migrations/20260921061000_lesson_booking_phase4c5p_launch_blocker_snapshot_alerts.sql',
  import.meta.url,
), 'utf8');

const expect = (condition, message) => assert.ok(condition, message);

for (const table of [
  'lesson_booking_preview_launch_blocker_snapshots',
  'lesson_booking_preview_launch_blocker_alerts',
]) {
  expect(new RegExp(`create table if not exists public\\.${table}\\b`, 'i').test(migration), `missing ${table}`);
  expect(new RegExp(`alter table public\\.${table} enable row level security`, 'i').test(migration), `${table} must have RLS`);
  expect(new RegExp(`${table}_append_only`, 'i').test(migration), `${table} must be append-only`);
}

expect(/service_record_booking_preview_launch_blocker_snapshot\([\s\S]*?security definer[\s\S]*?set search_path = ''/i.test(migration),
  'Phase P RPC must be SECURITY DEFINER with an empty search_path');
expect(/statement_timestamp\(\)/i.test(migration), 'Phase P must use PostgreSQL server time');
expect(!/\bp_now\b/i.test(migration), 'Phase P must not accept caller/browser time');
expect(/pg_advisory_xact_lock\(/i.test(migration), 'Phase P must serialize state transitions for idempotent alerts');
expect(/grant execute on function public\.service_record_booking_preview_launch_blocker_snapshot\([\s\S]*?to service_role/i.test(migration),
  'Phase P RPC must be service-role-only');
expect(/revoke all on function public\.service_record_booking_preview_launch_blocker_snapshot\([\s\S]*?from public, anon, authenticated, service_role/i.test(migration),
  'Phase P RPC must revoke default/browser execution before granting service_role');
expect(!/\bdelete\s+from\b/i.test(migration), 'Phase P must not introduce destructive DELETE execution');
expect(!/\btruncate\b/i.test(migration), 'Phase P must not introduce TRUNCATE execution');
expect(!/https?:\/\//i.test(migration), 'Phase P database logic must not make provider/network calls');

for (const sentinel of [
  "provider_write_authorized boolean not null default false check (provider_write_authorized = false)",
  "booking_launch_authorized boolean not null default false check (booking_launch_authorized = false)",
  "destructive_cleanup_authorized boolean not null default false check (destructive_cleanup_authorized = false)",
  "'provider_write_authorized',false",
  "'booking_launch_authorized',false",
  "'destructive_cleanup_authorized',false",
]) {
  expect(migration.includes(sentinel), `missing fail-closed sentinel: ${sentinel}`);
}

const runtime = normalizePreviewLaunchBlockerRuntimeReadiness({
  provider_secret_bundle_ready: true,
  preview_project_identity_ready: true,
  stripe_account_identity_ready: true,
  daily_webhook_identity_ready: true,
  daily_signed_endpoint_ready: true,
  fixture_principals_ready: true,
  ephemeral_sessions_ready: true,
  provider_e2e_gate_open: true,
  worker_write_gate_open: true,
  ignored_secret: 'sk_test_should_never_serialize',
});
assert.deepEqual(Object.keys(runtime), [
  'provider_secret_bundle_ready',
  'preview_project_identity_ready',
  'stripe_account_identity_ready',
  'daily_webhook_identity_ready',
  'daily_signed_endpoint_ready',
  'fixture_principals_ready',
  'ephemeral_sessions_ready',
  'provider_e2e_gate_open',
  'worker_write_gate_open',
]);
assert.throws(() => normalizePreviewLaunchBlockerRuntimeReadiness({}), /must be a boolean/);

const rawSnapshot = {
  schema_version: 'smart_parrot_booking_preview_launch_blocker_snapshot_v1',
  snapshot_id: 7,
  status: 'ready',
  blocker_codes: [],
  captured_at: '2026-09-21T06:00:00.000Z',
  checks: {
    schema_function_ready: true,
    provider_secret_bundle_ready: true,
    preview_project_identity_ready: true,
    stripe_account_identity_ready: true,
    daily_webhook_identity_ready: true,
    stripe_checkout_signed_recent: true,
    stripe_dispute_signed_recent: true,
    daily_signed_endpoint_ready: true,
    provider_rehearsal_recent: true,
    fixture_principals_ready: true,
    ephemeral_sessions_ready: true,
    provider_e2e_gate_open: true,
    worker_write_gate_open: true,
    unresolved_provider_cleanup_count: 0,
    unresolved_terminal_reconciliation_count: 0,
    missing_terminal_evidence_count: 0,
    leaked_token: 'student.jwt.secret',
  },
  alert: { change_kind: 'became_ready', replay: false, leaked_webhook_secret: 'whsec_should_not_escape' },
  replay: false,
  provider_write_authorized: false,
  booking_launch_authorized: false,
  destructive_cleanup_authorized: false,
  server_time_authoritative: true,
  stripe_account_id: 'acct_should_not_escape',
  provider_object_id: 'pi_should_not_escape',
  fixture_user_id: 'user_should_not_escape',
  payment_data: 'card_should_not_escape',
};

const normalized = normalizePreviewLaunchBlockerSnapshot(rawSnapshot);
const serialized = JSON.stringify(normalized);
for (const forbidden of ['student.jwt.secret', 'whsec_should_not_escape', 'acct_should_not_escape', 'pi_should_not_escape', 'user_should_not_escape', 'card_should_not_escape']) {
  expect(!serialized.includes(forbidden), `normalized output leaked ${forbidden}`);
}
assert.throws(() => normalizePreviewLaunchBlockerSnapshot({ ...rawSnapshot, provider_write_authorized: true }), /cannot authorize/);
assert.throws(() => normalizePreviewLaunchBlockerSnapshot({ ...rawSnapshot, status: 'blocked' }), /must contain blockers/);

let request = null;
const transport = createApprovedPreviewSupabaseTransport({
  previewRef: APPROVED_SMART_PARROT_PREVIEW.projectRef,
  supabaseUrl: APPROVED_SMART_PARROT_PREVIEW.supabaseUrl,
  secretKey: 'sb_secret_phase_p_contract_only',
  fetchImpl: async (url, init) => {
    request = { url, init };
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => rawSnapshot,
    };
  },
});

const recorded = await recordPreviewLaunchBlockerSnapshot({ transport, runtimeReadiness: runtime });
assert.equal(recorded.status, 'ready');
assert.equal(request.url, `${APPROVED_SMART_PARROT_PREVIEW.supabaseUrl}/rest/v1/rpc/${PREVIEW_LAUNCH_BLOCKER_RPC}`);
assert.equal(request.init.method, 'POST');
assert.equal(request.init.headers.apikey, 'sb_secret_phase_p_contract_only');
expect(!Object.hasOwn(request.init.headers, 'authorization'), 'sb_secret service RPC must not use Authorization: Bearer');
const posted = JSON.parse(request.init.body);
assert.deepEqual(Object.keys(posted).sort(), Object.keys(runtime).map((key) => `p_${key}`).sort());
expect(!Object.hasOwn(posted, 'p_now'), 'service payload must not include caller time');
expect(!JSON.stringify(posted).match(/sk_(?:test|live)_|whsec_|sb_secret_phase_p_contract_only/), 'service payload must contain readiness booleans only');

console.log('Lesson booking Phase 4C5P launch-blocker snapshot/alert contract passed.');