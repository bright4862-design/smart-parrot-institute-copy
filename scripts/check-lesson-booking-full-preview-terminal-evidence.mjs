import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  digestRedactedProviderTestTranscript,
  buildTerminalPreviewEvidenceRecord,
  finalizeTerminalPreviewRehearsal,
  runTerminalPreviewOperationWithFinalization,
  createTerminalEvidenceRecorder,
} from './lesson-booking-full-preview-terminal-evidence.mjs';

const RUN_ID='123e4567-e89b-42d3-a456-426614174000';
const transcript=(generatedAt='2026-09-21T01:00:00.000Z')=>({
  schema_version:1,
  generated_at:generatedAt,
  run_id:RUN_ID,
  idempotency_namespace:`smart-parrot-preview:${RUN_ID}`,
  fixture_lifecycle_status:'ready',
  operator_status:'ready',
  provider_evidence:{
    stripe_signed_webhook_proof:'ready',
    daily_signed_endpoint_verification:'ready',
    provider_rehearsal:'ready',
  },
  provider_ready_for_bounded_rehearsal:true,
  provider_writes_enabled:false,
  secrets_exposed:false,
});

const d1=digestRedactedProviderTestTranscript(transcript());
const d2=digestRedactedProviderTestTranscript(transcript('2026-09-21T01:05:00.000Z'));
assert.equal(d1.transcript_sha256,d2.transcript_sha256,'wall-clock transcript timestamp must not change semantic digest');
assert.match(d1.transcript_sha256,/^[0-9a-f]{64}$/);

const runState={run_id:RUN_ID,state:'complete',terminal:true};
const evidence=buildTerminalPreviewEvidenceRecord({
  runState,transcript:transcript(),
  sessionCloseSummary:{status:'fixture_sessions_closed'},
  fixtureCleanupSummary:{status:'fixture_cleanup_complete'},
});
assert.equal(evidence.reconciliation_required,false);
assert.match(evidence.correlation_sha256,/^[0-9a-f]{64}$/);
assert.equal(evidence.provider_writes_enabled,false);

let closeCalls=0, cleanupCalls=0, recordCalls=0;
const recordMap=new Map();
const finalize=()=>finalizeTerminalPreviewRehearsal({
  runState, transcript:transcript(),
  sessionBundle:{async close(){closeCalls++;return {status:'fixture_sessions_closed'}}},
  cleanupFixturePrincipals:async()=>{cleanupCalls++;return {status:'fixture_cleanup_complete'}},
  cleanupWriteGate:'1', secretKey:'sb_secret_preview_test',
  recordTerminalEvidence:async(ev)=>{
    recordCalls++;
    const prior=recordMap.get(ev.run_id);
    if(prior && prior!==ev.correlation_sha256) throw new Error('conflict');
    const replay=Boolean(prior); recordMap.set(ev.run_id,ev.correlation_sha256);
    return {run_id:ev.run_id,correlation_sha256:ev.correlation_sha256,replay};
  },
});
const first=await finalize();
const second=await finalize();
assert.equal(first.status,'terminal_cleanup_recorded');
assert.equal(first.evidence_replay,false);
assert.equal(second.evidence_replay,true);
assert.equal(closeCalls,2);
assert.equal(cleanupCalls,2);
assert.equal(recordCalls,2);

cleanupCalls=0;
const ambiguousClose=await finalizeTerminalPreviewRehearsal({
  runState, transcript:transcript(),
  sessionBundle:{async close(){throw new Error('network')}},
  cleanupFixturePrincipals:async()=>{cleanupCalls++;return {status:'fixture_cleanup_complete'}},
  cleanupWriteGate:'1', secretKey:'sb_secret_preview_test',
  recordTerminalEvidence:async(ev)=>({run_id:ev.run_id,correlation_sha256:ev.correlation_sha256,replay:false}),
});
assert.equal(ambiguousClose.status,'terminal_cleanup_requires_reconciliation');
assert.equal(ambiguousClose.fixture_cleanup_status,'fixture_cleanup_deferred_session_close_ambiguous');
assert.equal(cleanupCalls,0,'ambiguous session close must defer fixture deletion');

let exceptionCloseCalls=0;
const missingTranscript=await finalizeTerminalPreviewRehearsal({
  runState, transcript:null,
  sessionBundle:{async close(){exceptionCloseCalls++;return {status:'fixture_sessions_closed'}}},
  cleanupFixturePrincipals:async()=>{throw new Error('must not run')},
  cleanupWriteGate:'1', secretKey:'sb_secret_preview_test',
  recordTerminalEvidence:async()=>{throw new Error('must not record')},
});
assert.equal(exceptionCloseCalls,1);
assert.equal(missingTranscript.evidence_recorded,false);
assert.equal(missingTranscript.fixture_cleanup_status,'fixture_cleanup_deferred_missing_transcript');

cleanupCalls=0;
const gateClosed=await finalizeTerminalPreviewRehearsal({
  runState, transcript:transcript(),
  sessionBundle:{async close(){return {status:'fixture_sessions_closed'}}},
  cleanupFixturePrincipals:async()=>{cleanupCalls++;return {status:'fixture_cleanup_complete'}},
  cleanupWriteGate:'0', secretKey:'sb_secret_preview_test',
  recordTerminalEvidence:async(ev)=>({run_id:ev.run_id,correlation_sha256:ev.correlation_sha256,replay:false}),
});
assert.equal(gateClosed.fixture_cleanup_status,'fixture_cleanup_deferred_write_gate_closed');
assert.equal(cleanupCalls,0,'closed cleanup gate must prevent Auth deletion');

let wrapperClose=0, wrapperCleanup=0, wrapperRecord=0;
await assert.rejects(
  ()=>runTerminalPreviewOperationWithFinalization({
    operation:async()=>{throw new Error('raw provider secret must not be surfaced')},
    finalization:{
      runState, transcript:transcript(),
      sessionBundle:{async close(){wrapperClose++;return {status:'fixture_sessions_closed'}}},
      cleanupFixturePrincipals:async()=>{wrapperCleanup++;return {status:'fixture_cleanup_complete'}},
      cleanupWriteGate:'1', secretKey:'sb_secret_preview_test',
      recordTerminalEvidence:async(ev)=>{wrapperRecord++;return {run_id:ev.run_id,correlation_sha256:ev.correlation_sha256,replay:false}},
    },
  }),
  (error)=>error.message==='preview_terminal_operation_failed' && error.finalization?.evidence_recorded===true,
);
assert.equal(wrapperClose,1,'operator exception must still close sessions');
assert.equal(wrapperCleanup,1,'terminal operator exception with redacted transcript may still run bounded cleanup');
assert.equal(wrapperRecord,1,'terminal operator exception must preserve minimized evidence');

const rpcCalls=[];
const recorder=createTerminalEvidenceRecorder({invokeServer:async(call)=>{
  rpcCalls.push(call);
  return {run_id:RUN_ID,correlation_sha256:evidence.correlation_sha256,replay:false};
}});
await recorder(evidence);
assert.equal(rpcCalls[0].target,'admin_record_booking_full_preview_terminal_evidence');
assert.equal(rpcCalls[0].auth,'admin_rpc');
assert.equal(JSON.stringify(rpcCalls[0]).includes('generated_at'),false);

await assert.rejects(()=>finalizeTerminalPreviewRehearsal({
  runState:{run_id:RUN_ID,state:'awaiting_settlement_worker',terminal:false},transcript:transcript(),
  sessionBundle:{async close(){return {status:'fixture_sessions_closed'}}},
  cleanupFixturePrincipals:async()=>({status:'fixture_cleanup_complete'}),
  cleanupWriteGate:'1', secretKey:'sb_secret_preview_test',
  recordTerminalEvidence:async()=>({}),
}),/terminal_server_run_required/);

const dirty={...transcript(),provider_writes_enabled:true};
assert.throws(()=>digestRedactedProviderTestTranscript(dirty),/not_redacted/);

const moduleSource=fs.readFileSync('scripts/lesson-booking-full-preview-terminal-evidence.mjs','utf8');
for(const forbidden of ['api.stripe.com','api.daily.co','sk_live_','refresh_token','payment_method']) {
  assert.equal(moduleSource.includes(forbidden),false,`terminal evidence module contains forbidden provider/browser secret surface: ${forbidden}`);
}
const migrationSource=fs.readFileSync('supabase/migrations/20260921011500_lesson_booking_phase4c5j_terminal_evidence.sql','utf8');
assert.ok(migrationSource.includes('set search_path = \'\''));
assert.ok(migrationSource.includes('lesson_booking_full_preview_terminal_evidence_append_only'));
assert.ok(migrationSource.includes('full_preview_terminal_evidence_conflicting_replay'));

console.log('Phase 4C5J bounded terminal cleanup/evidence correlation regression passed.');
