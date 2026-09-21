#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260921163000_lesson_booking_phase4c5aa_requeue_delivery_intent_terminal_evidence.sql', import.meta.url),
  'utf8',
);
const expect = (value, message) => assert.ok(value, message);
const table = 'lesson_booking_preview_launch_blocker_requeue_delivery_intent_terminals';
const rpc = 'service_observe_booking_preview_launch_blocker_requeue_delivery_intent_terminals';

expect(migration.includes(`create table if not exists public.${table}`), 'missing Phase AA terminal-evidence table');
expect(migration.includes(`alter table public.${table} enable row level security`), 'Phase AA table must have RLS');
expect(migration.includes(`${table}_append_only`), 'Phase AA evidence must be append-only');
expect(migration.includes(`revoke all on table public.${table}`), 'Phase AA evidence table must remain RPC-only');
expect(migration.includes(`create or replace function public.${rpc}`), 'missing Phase AA observer RPC');
expect(/security definer\s+set search_path = ''/gi.test(migration), 'Phase AA privileged RPC must pin search_path');
expect(/pg_advisory_xact_lock\(20260921,40520\)/i.test(migration), 'Phase AA must serialize with the requeue family');
expect(/statement_timestamp\(\)/i.test(migration), 'Phase AA must use PostgreSQL server time');
expect(/terminal_reason in \('claim_closed','lease_expired','snapshot_superseded'\)/i.test(migration), 'Phase AA terminal reasons must be bounded');
expect(/t\.event_id > c\.event_id[\s\S]*?event_kind in \('released','retry_scheduled','dead_lettered'\)/i.test(migration), 'Phase AA must require terminal evidence after the exact claim');
expect(/i\.lease_expires_at <= v_now/i.test(migration), 'Phase AA must observe server-time lease expiry');
expect(/i\.snapshot_id <> v_latest_snapshot_id/i.test(migration), 'Phase AA must observe superseded blocker snapshots');
expect(/on conflict \(intent_id\) do nothing/i.test(migration), 'Phase AA observer must be idempotent per intent');
expect(new RegExp(`grant execute on function public\\.${rpc}\\(integer\\)[\\s\\S]*?to service_role`, 'i').test(migration), 'Phase AA RPC must be service-role only');
expect(!/\bdelete\s+from\b/i.test(migration) && !/\btruncate\b/i.test(migration), 'destructive SQL is forbidden');
expect(!/https?:\/\//i.test(migration), 'external calls are forbidden');
expect(!/\bnet\.http_/i.test(migration), 'database HTTP calls are forbidden');
expect(!/\bcron\b[\s\S]*?schedule\s*\(/i.test(migration), 'Cron sending is forbidden');
expect(!/p_(?:now|current_time|observed_at|lease_expires_at|prepared_at)\b/i.test(migration), 'caller-controlled time is forbidden');

const tableBlock = migration.match(new RegExp(`create table if not exists public\\.${table} \\([\\s\\S]*?\\n\\);`, 'i'))?.[0] ?? '';
expect(tableBlock.length > 0, 'could not isolate Phase AA table definition');
for (const forbidden of ['claim_key', 'stripe_', 'daily_', 'customer_email', 'provider_payload', 'notifier_receipt', 'access_token', 'secret']) {
  expect(!tableBlock.toLowerCase().includes(forbidden), `Phase AA persisted evidence must not store ${forbidden}`);
}

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
  expect(new RegExp(`'${sentinel}',false`, 'i').test(migration), `observer must return fail-closed ${sentinel}`);
}

for (const requiredField of [
  "'observed_count',v_observed_count",
  "'claim_closed_count',v_claim_closed_count",
  "'lease_expired_count',v_lease_expired_count",
  "'snapshot_superseded_count',v_snapshot_superseded_count",
  "'evidence_scope','preview_audit_only'",
  "'server_time_authoritative',true",
]) {
  expect(migration.includes(requiredField), `Phase AA minimized observation is missing ${requiredField}`);
}

console.log('Phase 4C5AA requeue delivery-intent terminal-evidence boundary passed.');
