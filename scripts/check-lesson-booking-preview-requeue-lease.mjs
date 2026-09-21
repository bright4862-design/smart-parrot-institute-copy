#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizePreviewRequeueClaim,
  normalizePreviewRequeueTransition,
  normalizePreviewRequeueInspection,
  claimPreviewRequeueWork,
  transitionPreviewRequeueWork,
  listPreviewRequeueWork,
  PREVIEW_REQUEUE_CLAIM_RPC,
  PREVIEW_REQUEUE_TRANSITION_RPC,
  PREVIEW_REQUEUE_INSPECTION_RPC,
} from './lesson-booking-preview-requeue-lease.mjs';
import {
  APPROVED_SMART_PARROT_PREVIEW,
  createApprovedPreviewSupabaseTransport,
} from './lesson-booking-full-preview-supabase-transport.mjs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260921133000_lesson_booking_phase4c5x_requeue_claim_lease_terminal.sql', import.meta.url),
  'utf8',
);
const expect = (value, message) => assert.ok(value, message);
const table = 'lesson_booking_preview_launch_blocker_requeue_lease_events';

expect(new RegExp(`create table if not exists public\\.${table}\\b`, 'i').test(migration), 'missing Phase X lease event table');
expect(new RegExp(`alter table public\\.${table} enable row level security`, 'i').test(migration), 'Phase X table must have RLS');
expect(new RegExp(`${table}_append_only`, 'i').test(migration), 'Phase X table must be append-only');
expect(new RegExp(`revoke all on table public\\.${table}[\\s\\S]*?from public, anon, authenticated, service_role`, 'i').test(migration), 'Phase X table must remain RPC-only');
for (const rpc of [
  'service_claim_booking_preview_launch_blocker_requeue_work',
  'service_transition_booking_preview_launch_blocker_requeue_work',
  'service_list_booking_preview_launch_blocker_requeue_work',
]) {
  expect(new RegExp(`create or replace function public\\.${rpc}\\([\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`, 'i').test(migration), `${rpc} must pin search_path`);
  expect(new RegExp(`grant execute on function public\\.${rpc}\\([\\s\\S]*?to service_role`, 'i').test(migration), `${rpc} must be service-role only`);
}
expect(/pg_advisory_xact_lock\(20260921,40520\)/i.test(migration), 'Phase X must serialize with the T/U/V/W family');
expect(/statement_timestamp\(\)/i.test(migration), 'Phase X must use PostgreSQL server time');
expect(/lease_generation_no integer not null check \(lease_generation_no between 1 and 3\)/i.test(migration), 'Phase X requeue lease generations must be bounded');
expect(/p_lease_seconds < 30 or p_lease_seconds > 300/i.test(migration), 'Phase X lease duration must be bounded 30-300 seconds');
expect(/stale_preview_requeue_claim_snapshot/i.test(migration), 'stale snapshot guard missing');
expect(/stale_preview_requeue_claim_activation/i.test(migration), 'superseded activation guard missing');
expect(/preview_requeue_claim_eligibility_expired/i.test(migration), 'expired eligibility guard missing');
expect(/stale_preview_requeue_claim_dead_letter_lineage/i.test(migration), 'dead-letter lineage guard missing');
expect(/preview_requeue_claim_generations_exhausted/i.test(migration), 'bounded generation exhaustion guard missing');
expect(/preview_requeue_transition_conflict/i.test(migration), 'terminal transition conflict guard missing');
expect(/preview_requeue_retry_generations_exhausted/i.test(migration), 'retry exhaustion guard missing');
expect(/preview_requeue_attempts_not_exhausted/i.test(migration), 'premature dead-letter guard missing');
expect(/transient_worker_failure/i.test(migration) && /requeue_attempts_exhausted/i.test(migration), 'Phase X terminal reason evidence missing');
expect(!/\bdelete\s+from\b/i.test(migration) && !/\btruncate\b/i.test(migration), 'destructive SQL is forbidden');
expect(!/https?:\/\//i.test(migration), 'external calls are forbidden');
expect(!/\bcron\b[\s\S]*?schedule\s*\(/i.test(migration), 'Cron sending is forbidden');
expect(!/p_(?:now|current_time|recorded_at|lease_expires_at|next_eligible_at)\b/i.test(migration), 'caller-controlled time is forbidden');
for (const sentinel of [
  'requeue_execution_authorized','automatic_notification_authorized','notifier_send_authorized',
  'outcome_suppresses_blocker','provider_write_authorized','booking_launch_authorized','destructive_cleanup_authorized',
]) {
  expect(new RegExp(`${sentinel} boolean not null default false check \\(${sentinel} = false\\)`, 'i').test(migration), `missing fail-closed ${sentinel}`);
}

const claimRaw = {
  schema_version:'smart_parrot_booking_preview_launch_blocker_requeue_claim_v1',
  event_id:701,activation_id:601,work_generation_id:501,queue_item_id:92,snapshot_id:51,alert_id:53,
  lineage_ref:'rqg:51:92:301:1',claim_key:'a'.repeat(32),lease_generation_no:1,lease_seconds:120,
  lease_expires_at:'2026-09-21T12:12:00.000Z',recorded_at:'2026-09-21T12:10:00.000Z',
  work_state:'leased',lease_active:true,replay:false,requeue_execution_authorized:false,
  automatic_notification_authorized:false,notifier_send_authorized:false,outcome_suppresses_blocker:false,
  provider_write_authorized:false,booking_launch_authorized:false,destructive_cleanup_authorized:false,
  server_time_authoritative:true,stripe_payment_intent:'pi_private',daily_room:'private-room',
  recipient_email:'person@example.invalid',
};
const claim = normalizePreviewRequeueClaim(claimRaw);
assert.equal(claim.lease_generation_no,1);
for (const secret of ['a'.repeat(32),'pi_private','private-room','person@example.invalid']) {
  expect(!JSON.stringify(claim).includes(secret), `normalized claim leaked ${secret}`);
}
assert.throws(()=>normalizePreviewRequeueClaim({...claimRaw,notifier_send_authorized:true}),/cannot authorize execution/);
assert.throws(()=>normalizePreviewRequeueClaim({...claimRaw,lease_generation_no:4}),/bounded requeue limit/);
assert.throws(()=>normalizePreviewRequeueClaim({...claimRaw,lease_expires_at:claimRaw.recorded_at}),/expiry must follow/);

const transitionRaw = {
  schema_version:'smart_parrot_booking_preview_launch_blocker_requeue_transition_v1',
  event_id:702,activation_id:601,work_generation_id:501,queue_item_id:92,snapshot_id:51,alert_id:53,
  lineage_ref:'rqg:51:92:301:1',lease_generation_no:1,outcome:'retry',reason_code:'transient_worker_failure',
  work_state:'retry_wait',next_eligible_at:'2026-09-21T12:11:00.000Z',recorded_at:'2026-09-21T12:10:00.000Z',
  replay:false,requeue_execution_authorized:false,automatic_notification_authorized:false,
  notifier_send_authorized:false,outcome_suppresses_blocker:false,provider_write_authorized:false,
  booking_launch_authorized:false,destructive_cleanup_authorized:false,server_time_authoritative:true,
  claim_key:'a'.repeat(32),provider_message_id:'provider-private',
};
const transition = normalizePreviewRequeueTransition(transitionRaw);
assert.equal(transition.work_state,'retry_wait');
for (const secret of ['a'.repeat(32),'provider-private']) expect(!JSON.stringify(transition).includes(secret),`normalized transition leaked ${secret}`);
assert.throws(()=>normalizePreviewRequeueTransition({...transitionRaw,next_eligible_at:null}),/retry eligibility mismatch/);
assert.throws(()=>normalizePreviewRequeueTransition({...transitionRaw,lease_generation_no:3}),/cannot schedule another retry/);

const inspectionRaw = {
  schema_version:'smart_parrot_booking_preview_launch_blocker_requeue_inspection_v1',
  captured_at:'2026-09-21T12:10:00.000Z',item_count:1,
  items:[{activation_id:601,work_generation_id:501,queue_item_id:92,snapshot_id:51,alert_id:53,
    lineage_ref:'rqg:51:92:301:1',lease_generation_no:1,work_state:'leased',
    lease_expires_at:'2026-09-21T12:12:00.000Z',next_eligible_at:null,last_event_at:'2026-09-21T12:10:00.000Z',
    claim_key:'a'.repeat(32),blocker_codes:['private'],stripe_customer:'cus_private'}],
  requeue_execution_authorized:false,automatic_notification_authorized:false,notifier_send_authorized:false,
  outcome_suppresses_blocker:false,provider_write_authorized:false,booking_launch_authorized:false,
  destructive_cleanup_authorized:false,server_time_authoritative:true,
};
const inspection = normalizePreviewRequeueInspection(inspectionRaw);
assert.equal(inspection.item_count,1);
for (const secret of ['a'.repeat(32),'private','cus_private']) expect(!JSON.stringify(inspection).includes(secret),`normalized inspection leaked ${secret}`);

const requests=[];
const responseFor = (url) => {
  if (url.endsWith(`/rpc/${PREVIEW_REQUEUE_CLAIM_RPC}`)) return claimRaw;
  if (url.endsWith(`/rpc/${PREVIEW_REQUEUE_TRANSITION_RPC}`)) return {...transitionRaw,outcome:'release',reason_code:'observed_no_send',work_state:'available',next_eligible_at:null};
  if (url.endsWith(`/rpc/${PREVIEW_REQUEUE_INSPECTION_RPC}`)) return inspectionRaw;
  throw new Error(`unexpected mock URL ${url}`);
};
const transport=createApprovedPreviewSupabaseTransport({
  previewRef:APPROVED_SMART_PARROT_PREVIEW.projectRef,
  supabaseUrl:APPROVED_SMART_PARROT_PREVIEW.supabaseUrl,
  secretKey:'sb_secret_phase_x_contract_only',
  fetchImpl:async(url,init)=>{
    requests.push({url,init});
    return {ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>responseFor(url)};
  },
});
await claimPreviewRequeueWork({transport,activationId:601,claimKey:'b'.repeat(32),leaseSeconds:120});
await transitionPreviewRequeueWork({transport,activationId:601,claimKey:'b'.repeat(32),outcome:'release'});
await listPreviewRequeueWork({transport,limit:25});
assert.equal(requests.length,3);
for (const request of requests) {
  assert.equal(request.init.method,'POST');
  assert.equal(request.init.headers.apikey,'sb_secret_phase_x_contract_only');
  assert.equal(request.init.headers.authorization,undefined);
  const payload=JSON.parse(request.init.body);
  expect(!Object.keys(payload).some((key)=>/^p_(?:now|current_time|recorded_at|lease_expires_at|next_eligible_at)$/i.test(key)),'Phase X payload contained caller time');
}
assert.deepEqual(JSON.parse(requests[0].init.body),{p_activation_id:601,p_claim_key:'b'.repeat(32),p_lease_seconds:120});
assert.deepEqual(JSON.parse(requests[1].init.body),{p_activation_id:601,p_claim_key:'b'.repeat(32),p_outcome:'release',p_reason_code:'observed_no_send'});
assert.deepEqual(JSON.parse(requests[2].init.body),{p_limit:25});
await assert.rejects(()=>claimPreviewRequeueWork({transport,activationId:601,claimKey:'0'.repeat(32)}),/non-zero 32-hex/);
await assert.rejects(()=>claimPreviewRequeueWork({transport,activationId:601,claimKey:'b'.repeat(32),leaseSeconds:301}),/between 30 and 300/);
await assert.rejects(()=>transitionPreviewRequeueWork({transport,activationId:601,claimKey:'b'.repeat(32),outcome:'retry',reasonCode:'observed_no_send'}),/does not match outcome/);
console.log('Lesson booking Phase 4C5X requeue-specific claim/lease + terminal transition contract passed.');
