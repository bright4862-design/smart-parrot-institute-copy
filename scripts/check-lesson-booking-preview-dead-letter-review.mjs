#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizePreviewDeadLetterReviewQueue,normalizePreviewDeadLetterReview,normalizePreviewRequeueEligibilityGeneration,
  listPreviewDeadLetterReviewQueue,recordPreviewDeadLetterReview,generatePreviewDeadLetterRequeueEligibility,
  PREVIEW_DEAD_LETTER_REVIEW_QUEUE_RPC,PREVIEW_DEAD_LETTER_REVIEW_RPC,PREVIEW_REQUEUE_ELIGIBILITY_RPC,
} from './lesson-booking-preview-dead-letter-review.mjs';
import { APPROVED_SMART_PARROT_PREVIEW,createApprovedPreviewSupabaseTransport } from './lesson-booking-full-preview-supabase-transport.mjs';

const migration=readFileSync(new URL('../supabase/migrations/20260921101500_lesson_booking_phase4c5u_dead_letter_review_requeue.sql',import.meta.url),'utf8');
const expect=(v,m)=>assert.ok(v,m);
for(const table of ['lesson_booking_preview_launch_blocker_dead_letter_reviews','lesson_booking_preview_launch_blocker_requeue_eligibility_generations']){
  expect(new RegExp(`create table if not exists public\\.${table}\\b`,'i').test(migration),`missing ${table}`);
  expect(new RegExp(`alter table public\\.${table} enable row level security`,'i').test(migration),`${table} must have RLS`);
  expect(new RegExp(`${table}_append_only`,'i').test(migration),`${table} must be append-only`);
  expect(new RegExp(`revoke all on table public\\.${table}[\\s\\S]*?from public, anon, authenticated, service_role`,'i').test(migration),`${table} must be RPC-only`);
}
for(const rpc of ['admin_list_booking_preview_launch_blocker_dead_letter_review_queue','admin_record_booking_preview_launch_blocker_dead_letter_review','admin_generate_booking_preview_launch_blocker_requeue_eligibility']){
  expect(new RegExp(`create or replace function public\\.${rpc}\\([\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`,'i').test(migration),`${rpc} must pin search_path`);
  expect(new RegExp(`revoke all on function public\\.${rpc}\\([\\s\\S]*?from public, anon, authenticated, service_role`,'i').test(migration),`${rpc} must revoke default/service execution`);
  expect(new RegExp(`grant execute on function public\\.${rpc}\\([\\s\\S]*?to authenticated`,'i').test(migration),`${rpc} must use authenticated admin guard`);
}
expect(/private\.smart_parrot_require_admin\(uid\)/i.test(migration),'admin role guard missing');
expect(/pg_advisory_xact_lock\(20260921,40520\)/i.test(migration),'Phase U must serialize with Phase T');
expect(/statement_timestamp\(\)/i.test(migration),'server time missing');
expect(/retry_after_review/i.test(migration)&&/attempts_exhausted/i.test(migration),'review retry reason binding missing');
expect(/invalid_work_item_confirmed/i.test(migration)&&/invalid_work_item/i.test(migration),'invalid work confirmation missing');
expect(/preview_dead_letter_review_conflict/i.test(migration),'conflicting replay guard missing');
expect(/stale_preview_dead_letter_review/i.test(migration)&&/stale_preview_dead_letter_work_state/i.test(migration),'stale guards missing');
expect(/validity_seconds integer not null default 900 check \(validity_seconds = 900\)/i.test(migration)&&/interval '15 minutes'/i.test(migration),'bounded eligibility missing');
expect(!/\bdelete\s+from\b/i.test(migration)&&!/\btruncate\b/i.test(migration),'destructive SQL is forbidden');
expect(!/https?:\/\//i.test(migration),'external provider calls are forbidden');
expect(!/\bcron\b[\s\S]*?schedule\s*\(/i.test(migration),'Cron sending is forbidden');
expect(!/p_(?:now|current_time|reviewed_at|generated_at|expires_at)\b/i.test(migration),'caller time is forbidden');
for(const sentinel of ['requeue_execution_authorized','automatic_notification_authorized','notifier_send_authorized','outcome_suppresses_blocker','provider_write_authorized','booking_launch_authorized','destructive_cleanup_authorized']) expect(new RegExp(`${sentinel} boolean not null default false check \\(${sentinel} = false\\)`,'i').test(migration),`missing fail-closed ${sentinel}`);

const closed={requeue_execution_authorized:false,automatic_notification_authorized:false,notifier_send_authorized:false,outcome_suppresses_blocker:false,provider_write_authorized:false,booking_launch_authorized:false,destructive_cleanup_authorized:false,server_time_authoritative:true};
const item={queue_item_id:92,snapshot_id:51,alert_id:53,dead_letter_event_id:112,dead_letter_reason:'attempts_exhausted',attempt_no:5,dead_lettered_at:'2026-09-21T10:01:00.000Z',review_status:'reviewed',review_id:201,decision:'retry_after_review',reviewed_at:'2026-09-21T10:02:00.000Z',requeue_eligible:true,generation_id:301,generation_expires_at:'2026-09-21T10:17:00.000Z',claim_key:'f'.repeat(32),blocker_codes:['provider_secret_bundle_missing'],recipient_email:'person@example.invalid'};
const rawQueue={schema_version:'smart_parrot_booking_preview_launch_blocker_dead_letter_review_queue_v1',captured_at:'2026-09-21T10:03:00.000Z',item_count:1,items:[item],...closed,reviewed_by:'admin-should-not-escape'};
const q=normalizePreviewDeadLetterReviewQueue(rawQueue); for(const x of ['f'.repeat(32),'provider_secret_bundle_missing','person@example.invalid','admin-should-not-escape']) expect(!JSON.stringify(q).includes(x),`queue leaked ${x}`);
assert.throws(()=>normalizePreviewDeadLetterReviewQueue({...rawQueue,requeue_execution_authorized:true}),/cannot authorize execution/);
assert.throws(()=>normalizePreviewDeadLetterReviewQueue({...rawQueue,items:[{...item,dead_letter_reason:'invalid_work_item'}]}),/requires attempts_exhausted/);

const rawReview={schema_version:'smart_parrot_booking_preview_launch_blocker_dead_letter_review_v1',review_id:201,queue_item_id:92,snapshot_id:51,alert_id:53,dead_letter_event_id:112,dead_letter_reason:'attempts_exhausted',attempt_no:5,decision:'retry_after_review',reviewed_at:'2026-09-21T10:02:00.000Z',replay:false,...closed,reviewed_by:'admin-private'};
const r=normalizePreviewDeadLetterReview(rawReview); expect(!JSON.stringify(r).includes('admin-private'),'review leaked actor');
assert.throws(()=>normalizePreviewDeadLetterReview({...rawReview,decision:'invalid_work_item_confirmed'}),/requires invalid_work_item/);

const rawGeneration={schema_version:'smart_parrot_booking_preview_launch_blocker_requeue_eligibility_v1',generation_id:301,generation_no:1,review_id:201,queue_item_id:92,snapshot_id:51,alert_id:53,dead_letter_event_id:112,validity_seconds:900,generated_at:'2026-09-21T10:02:00.000Z',expires_at:'2026-09-21T10:17:00.000Z',requeue_eligible:true,replay:false,...closed,generated_by:'admin-private',stripe_payment_intent:'pi_private'};
const g=normalizePreviewRequeueEligibilityGeneration(rawGeneration); for(const x of ['admin-private','pi_private']) expect(!JSON.stringify(g).includes(x),`generation leaked ${x}`);
assert.throws(()=>normalizePreviewRequeueEligibilityGeneration({...rawGeneration,validity_seconds:901}),/900 seconds/);
assert.throws(()=>normalizePreviewRequeueEligibilityGeneration({...rawGeneration,expires_at:'2026-09-21T10:16:59.000Z'}),/exactly 15 minutes/);

const requests=[];
const transport=createApprovedPreviewSupabaseTransport({previewRef:APPROVED_SMART_PARROT_PREVIEW.projectRef,supabaseUrl:APPROVED_SMART_PARROT_PREVIEW.supabaseUrl,publishableKey:'sb_publishable_phase_u_contract_only',adminAccessToken:'admin.jwt.phase.u.contract',fetchImpl:async(url,init)=>{requests.push({url,init});const body=url.endsWith(`/${PREVIEW_DEAD_LETTER_REVIEW_QUEUE_RPC}`)?rawQueue:url.endsWith(`/${PREVIEW_DEAD_LETTER_REVIEW_RPC}`)?rawReview:rawGeneration;return{ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>body};}});
await listPreviewDeadLetterReviewQueue({transport,limit:25}); await recordPreviewDeadLetterReview({transport,queueItemId:92,decision:'retry_after_review'}); await generatePreviewDeadLetterRequeueEligibility({transport,reviewId:201});
assert.equal(requests.length,3); assert.deepEqual(requests.map(x=>x.url),[PREVIEW_DEAD_LETTER_REVIEW_QUEUE_RPC,PREVIEW_DEAD_LETTER_REVIEW_RPC,PREVIEW_REQUEUE_ELIGIBILITY_RPC].map(x=>`${APPROVED_SMART_PARROT_PREVIEW.supabaseUrl}/rest/v1/rpc/${x}`));
for(const request of requests){assert.equal(request.init.method,'POST');assert.equal(request.init.headers.apikey,'sb_publishable_phase_u_contract_only');assert.equal(request.init.headers.authorization,'Bearer admin.jwt.phase.u.contract');const payload=JSON.parse(request.init.body);expect(!Object.keys(payload).some(k=>/^p_(?:now|current_time|reviewed_at|generated_at|expires_at)$/i.test(k)),'payload contained caller time');expect(!JSON.stringify(payload).match(/sk_(?:test|live)_|whsec_|sb_secret_|person@example.invalid/),'payload leaked secret/customer data');}
assert.deepEqual(JSON.parse(requests[0].init.body),{p_limit:25}); assert.deepEqual(JSON.parse(requests[1].init.body),{p_queue_item_id:92,p_decision:'retry_after_review'}); assert.deepEqual(JSON.parse(requests[2].init.body),{p_review_id:201});
await assert.rejects(()=>recordPreviewDeadLetterReview({transport,queueItemId:92,decision:'send_now'}),/Invalid preview dead-letter review decision/);
console.log('Lesson booking Phase 4C5U dead-letter review + bounded requeue evidence contract passed.');
