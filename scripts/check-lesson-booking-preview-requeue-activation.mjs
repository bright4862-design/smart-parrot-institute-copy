#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizePreviewRequeueActivation,
  activatePreviewRequeueLineage,
  PREVIEW_REQUEUE_ACTIVATION_RPC,
} from './lesson-booking-preview-requeue-activation.mjs';
import {
  APPROVED_SMART_PARROT_PREVIEW,
  createApprovedPreviewSupabaseTransport,
} from './lesson-booking-full-preview-supabase-transport.mjs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260921123000_lesson_booking_phase4c5w_requeue_lineage_activation.sql', import.meta.url),
  'utf8',
);
const expect = (value, message) => assert.ok(value, message);

const table = 'lesson_booking_preview_launch_blocker_requeue_work_activations';
expect(new RegExp(`create table if not exists public\\.${table}\\b`, 'i').test(migration), 'missing Phase W activation table');
expect(new RegExp(`alter table public\\.${table} enable row level security`, 'i').test(migration), 'Phase W activation table must have RLS');
expect(new RegExp(`${table}_append_only`, 'i').test(migration), 'Phase W activation table must be append-only');
expect(new RegExp(`revoke all on table public\\.${table}[\\s\\S]*?from public, anon, authenticated, service_role`, 'i').test(migration), 'Phase W table must remain RPC-only');
expect(/create or replace function public\.service_activate_booking_preview_launch_blocker_requeue_lineage\([\s\S]*?security definer[\s\S]*?set search_path = ''/i.test(migration), 'Phase W service RPC must pin search_path');
expect(/revoke all on function public\.service_activate_booking_preview_launch_blocker_requeue_lineage\(bigint,text\)[\s\S]*?from public, anon, authenticated, service_role/i.test(migration), 'Phase W RPC must revoke defaults');
expect(/grant execute on function public\.service_activate_booking_preview_launch_blocker_requeue_lineage\(bigint,text\)[\s\S]*?to service_role/i.test(migration), 'Phase W RPC must be service-role only');
expect(/pg_advisory_xact_lock\(20260921,40520\)/i.test(migration), 'Phase W must serialize with Phase T/U/V');
expect(/statement_timestamp\(\)/i.test(migration), 'Phase W must use PostgreSQL server time');
expect(/stale_preview_requeue_activation_snapshot/i.test(migration), 'stale snapshot guard missing');
expect(/preview_requeue_activation_eligibility_expired/i.test(migration), 'expired eligibility guard missing');
expect(/stale_preview_requeue_activation_eligibility_generation/i.test(migration), 'superseded eligibility guard missing');
expect(/stale_preview_requeue_activation_dead_letter_lineage/i.test(migration), 'dead-letter lineage guard missing');
expect(/stale_preview_requeue_activation_work_generation/i.test(migration), 'latest work-generation guard missing');
expect(/preview_requeue_work_generation_already_activated/i.test(migration), 'single-use activation guard missing');
expect(/preview_requeue_activation_key_conflict/i.test(migration), 'activation-key conflict guard missing');
expect(/lease_handoff_state text not null default 'eligible_for_internal_claim'/i.test(migration), 'internal lease handoff state missing');
expect(/claim_scope text not null default 'internal_preview_escalation_lease'/i.test(migration), 'internal claim scope missing');
expect(/claim_eligible boolean not null default true check \(claim_eligible = true\)/i.test(migration), 'internal claim eligibility evidence missing');
expect(!/\bdelete\s+from\b/i.test(migration) && !/\btruncate\b/i.test(migration), 'destructive SQL is forbidden');
expect(!/https?:\/\//i.test(migration), 'external calls are forbidden');
expect(!/\bcron\b[\s\S]*?schedule\s*\(/i.test(migration), 'Cron sending is forbidden');
expect(!/p_(?:now|current_time|activated_at|expires_at)\b/i.test(migration), 'caller-controlled time is forbidden');
for (const sentinel of [
  'requeue_execution_authorized','automatic_notification_authorized','notifier_send_authorized',
  'outcome_suppresses_blocker','provider_write_authorized','booking_launch_authorized','destructive_cleanup_authorized',
]) {
  expect(new RegExp(`${sentinel} boolean not null default false check \\(${sentinel} = false\\)`, 'i').test(migration), `missing fail-closed ${sentinel}`);
}

const raw = {
  schema_version:'smart_parrot_booking_preview_launch_blocker_requeue_activation_result_v1',activation_id:601,
  work_generation_id:501,consumption_id:401,eligibility_generation_id:301,review_id:201,queue_item_id:92,
  snapshot_id:51,alert_id:53,dead_letter_event_id:112,work_generation_no:1,lineage_ref:'rqg:51:92:301:1',
  activation_status:'activated',lease_handoff_state:'eligible_for_internal_claim',claim_scope:'internal_preview_escalation_lease',
  claim_eligible:true,activated_at:'2026-09-21T11:55:00.000Z',replay:false,requeue_execution_authorized:false,
  automatic_notification_authorized:false,notifier_send_authorized:false,outcome_suppresses_blocker:false,
  provider_write_authorized:false,booking_launch_authorized:false,destructive_cleanup_authorized:false,
  server_time_authoritative:true,activation_key:'a'.repeat(32),stripe_payment_intent:'pi_private',daily_room:'private-room',recipient_email:'person@example.invalid',
};
const normalized = normalizePreviewRequeueActivation(raw);
for (const secret of ['a'.repeat(32),'pi_private','private-room','person@example.invalid']) expect(!JSON.stringify(normalized).includes(secret),`normalized activation leaked ${secret}`);
assert.equal(normalized.lineage_ref,'rqg:51:92:301:1');
assert.equal(normalized.claim_eligible,true);
assert.throws(()=>normalizePreviewRequeueActivation({...raw,notifier_send_authorized:true}),/cannot authorize execution/);
assert.throws(()=>normalizePreviewRequeueActivation({...raw,claim_eligible:false}),/must explicitly establish internal claim eligibility/);
assert.throws(()=>normalizePreviewRequeueActivation({...raw,lease_handoff_state:'leased'}),/lease handoff state mismatch/);
assert.throws(()=>normalizePreviewRequeueActivation({...raw,lineage_ref:'rqg:51:92:301:2'}),/lineage reference mismatch/);

const requests=[];
const transport=createApprovedPreviewSupabaseTransport({
  previewRef:APPROVED_SMART_PARROT_PREVIEW.projectRef,supabaseUrl:APPROVED_SMART_PARROT_PREVIEW.supabaseUrl,
  secretKey:'sb_secret_phase_w_contract_only',fetchImpl:async(url,init)=>{requests.push({url,init});return{ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>raw};},
});
await activatePreviewRequeueLineage({transport,workGenerationId:501,activationKey:'b'.repeat(32)});
assert.equal(requests.length,1);
assert.equal(requests[0].url,`${APPROVED_SMART_PARROT_PREVIEW.supabaseUrl}/rest/v1/rpc/${PREVIEW_REQUEUE_ACTIVATION_RPC}`);
assert.equal(requests[0].init.method,'POST');
assert.equal(requests[0].init.headers.apikey,'sb_secret_phase_w_contract_only');
assert.equal(requests[0].init.headers.authorization,undefined);
assert.deepEqual(JSON.parse(requests[0].init.body),{p_work_generation_id:501,p_activation_key:'b'.repeat(32)});
expect(!Object.keys(JSON.parse(requests[0].init.body)).some((key)=>/^p_(?:now|current_time|activated_at|expires_at)$/i.test(key)),'Phase W payload contained caller time');
await assert.rejects(()=>activatePreviewRequeueLineage({transport,workGenerationId:501,activationKey:'0'.repeat(32)}),/non-zero 32-hex/);
await assert.rejects(()=>activatePreviewRequeueLineage({transport,workGenerationId:501,activationKey:'not-a-key'}),/non-zero 32-hex/);
console.log('Lesson booking Phase 4C5W requeue activation + lease handoff contract passed.');
