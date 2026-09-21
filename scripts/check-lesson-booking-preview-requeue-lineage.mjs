#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePreviewRequeueConsumption,consumePreviewRequeueEligibility,PREVIEW_REQUEUE_CONSUMPTION_RPC } from './lesson-booking-preview-requeue-lineage.mjs';
import { APPROVED_SMART_PARROT_PREVIEW,createApprovedPreviewSupabaseTransport } from './lesson-booking-full-preview-supabase-transport.mjs';

const migration=readFileSync(new URL('../supabase/migrations/20260921113000_lesson_booking_phase4c5v_requeue_generation_consumption_lineage.sql',import.meta.url),'utf8');
const expect=(v,m)=>assert.ok(v,m);
for(const table of ['lesson_booking_preview_launch_blocker_requeue_consumptions','lesson_booking_preview_launch_blocker_requeue_work_generations']){
  expect(new RegExp(`create table if not exists public\\.${table}\\b`,'i').test(migration),`missing ${table}`);
  expect(new RegExp(`alter table public\\.${table} enable row level security`,'i').test(migration),`${table} must have RLS`);
  expect(new RegExp(`${table}_append_only`,'i').test(migration),`${table} must be append-only`);
  expect(new RegExp(`revoke all on table public\\.${table}[\\s\\S]*?from public, anon, authenticated, service_role`,'i').test(migration),`${table} must remain RPC-only`);
}
expect(/create or replace function public\.service_consume_booking_preview_launch_blocker_requeue_eligibility\([\s\S]*?security definer[\s\S]*?set search_path = ''/i.test(migration),'service consumption RPC must pin search_path');
expect(/revoke all on function public\.service_consume_booking_preview_launch_blocker_requeue_eligibility\(bigint,text\)[\s\S]*?from public, anon, authenticated, service_role/i.test(migration),'service consumption RPC must revoke defaults');
expect(/grant execute on function public\.service_consume_booking_preview_launch_blocker_requeue_eligibility\(bigint,text\)[\s\S]*?to service_role/i.test(migration),'service consumption RPC must be service-role only');
expect(/pg_advisory_xact_lock\(20260921,40520\)/i.test(migration),'Phase V must serialize with Phase T/U');
expect(/statement_timestamp\(\)/i.test(migration),'server time missing');
expect(/preview_requeue_eligibility_generation_expired/i.test(migration),'expired generation guard missing');
expect(/stale_preview_requeue_eligibility_snapshot/i.test(migration)&&/stale_preview_requeue_dead_letter_lineage/i.test(migration)&&/stale_preview_requeue_eligibility_generation/i.test(migration),'stale lineage guards missing');
expect(/preview_requeue_eligibility_generation_already_consumed/i.test(migration)&&/preview_requeue_consumption_key_conflict/i.test(migration),'single-use/conflict guards missing');
expect(/lineage_ref text generated always as/i.test(migration)&&/'rqg:'/i.test(migration),'deterministic lineage generation missing');
expect(/work_state text not null default 'prepared' check \(work_state = 'prepared'\)/i.test(migration),'prepared-only work state missing');
expect(/claim_eligible boolean not null default false check \(claim_eligible = false\)/i.test(migration),'claim gate must remain closed');
expect(!/\bdelete\s+from\b/i.test(migration)&&!/\btruncate\b/i.test(migration),'destructive SQL is forbidden');
expect(!/https?:\/\//i.test(migration),'external calls are forbidden');
expect(!/\bcron\b[\s\S]*?schedule\s*\(/i.test(migration),'Cron sending is forbidden');
expect(!/p_(?:now|current_time|consumed_at|generated_at|expires_at)\b/i.test(migration),'caller time is forbidden');
for(const sentinel of ['requeue_execution_authorized','automatic_notification_authorized','notifier_send_authorized','outcome_suppresses_blocker','provider_write_authorized','booking_launch_authorized','destructive_cleanup_authorized']) expect(new RegExp(`${sentinel} boolean not null default false check \\(${sentinel} = false\\)`,'i').test(migration),`missing fail-closed ${sentinel}`);

const raw={schema_version:'smart_parrot_booking_preview_launch_blocker_requeue_consumption_result_v1',consumption_id:401,eligibility_generation_id:301,review_id:201,queue_item_id:92,snapshot_id:51,alert_id:53,dead_letter_event_id:112,source_generation_no:2,work_generation_id:501,work_generation_no:1,lineage_ref:'rqg:51:92:301:1',work_state:'prepared',claim_eligible:false,consumed_at:'2026-09-21T10:35:00.000Z',generated_at:'2026-09-21T10:35:00.000Z',replay:false,requeue_execution_authorized:false,automatic_notification_authorized:false,notifier_send_authorized:false,outcome_suppresses_blocker:false,provider_write_authorized:false,booking_launch_authorized:false,destructive_cleanup_authorized:false,server_time_authoritative:true,consumption_key:'a'.repeat(32),stripe_payment_intent:'pi_private',daily_room:'private-room',recipient_email:'person@example.invalid'};
const normalized=normalizePreviewRequeueConsumption(raw);
for(const secret of ['a'.repeat(32),'pi_private','private-room','person@example.invalid']) expect(!JSON.stringify(normalized).includes(secret),`normalized lineage leaked ${secret}`);
assert.equal(normalized.lineage_ref,'rqg:51:92:301:1');
assert.throws(()=>normalizePreviewRequeueConsumption({...raw,claim_eligible:true}),/claim-ineligible/);
assert.throws(()=>normalizePreviewRequeueConsumption({...raw,requeue_execution_authorized:true}),/cannot authorize execution/);
assert.throws(()=>normalizePreviewRequeueConsumption({...raw,lineage_ref:'rqg:51:92:301:2'}),/lineage reference mismatch/);
assert.throws(()=>normalizePreviewRequeueConsumption({...raw,work_state:'available'}),/must remain prepared/);

const requests=[];
const transport=createApprovedPreviewSupabaseTransport({previewRef:APPROVED_SMART_PARROT_PREVIEW.projectRef,supabaseUrl:APPROVED_SMART_PARROT_PREVIEW.supabaseUrl,secretKey:'sb_secret_phase_v_contract_only',fetchImpl:async(url,init)=>{requests.push({url,init});return{ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>raw};}});
await consumePreviewRequeueEligibility({transport,generationId:301,consumptionKey:'b'.repeat(32)});
assert.equal(requests.length,1);
assert.equal(requests[0].url,`${APPROVED_SMART_PARROT_PREVIEW.supabaseUrl}/rest/v1/rpc/${PREVIEW_REQUEUE_CONSUMPTION_RPC}`);
assert.equal(requests[0].init.method,'POST');
assert.equal(requests[0].init.headers.apikey,'sb_secret_phase_v_contract_only');
assert.equal(requests[0].init.headers.authorization,undefined);
assert.deepEqual(JSON.parse(requests[0].init.body),{p_generation_id:301,p_consumption_key:'b'.repeat(32)});
expect(!Object.keys(JSON.parse(requests[0].init.body)).some(k=>/^p_(?:now|current_time|consumed_at|generated_at|expires_at)$/i.test(k)),'payload contained caller time');
await assert.rejects(()=>consumePreviewRequeueEligibility({transport,generationId:301,consumptionKey:'0'.repeat(32)}),/non-zero 32-hex/);
await assert.rejects(()=>consumePreviewRequeueEligibility({transport,generationId:301,consumptionKey:'not-a-key'}),/non-zero 32-hex/);
console.log('Lesson booking Phase 4C5V requeue generation consumption + lineage contract passed.');