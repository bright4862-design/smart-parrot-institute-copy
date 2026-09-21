import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PREVIEW_EPHEMERAL_SESSION_GATE,
  rotatePreviewFixtureRuntimeCredentials,
  issueEphemeralPreviewFixtureSessions,
  buildPreviewFixtureLifecycleReadiness,
  runFixtureBoundPreviewOperatorHandoff,
  buildRedactedProviderTestTranscript,
} from './lesson-booking-full-preview-ephemeral-sessions.mjs';

const RUN_ID = '123e4567-e89b-42d3-a456-426614174000';
const NOW = Date.parse('2026-09-21T00:30:00.000Z');
const principal = (role, id) => ({
  role,
  id,
  email: `sp-preview-${RUN_ID.replaceAll('-', '')}-${role}@example.invalid`,
  user_metadata: {
    smart_parrot_preview_fixture: true,
    smart_parrot_preview_run_id: RUN_ID,
    smart_parrot_preview_role: role,
    data_class: 'synthetic',
  },
});
const plan = Object.freeze({
  schema_version: 1,
  run_id: RUN_ID,
  preview_project_ref: 'mrzzbhqzxshtbqvxkcjn',
  supabase_url: 'https://mrzzbhqzxshtbqvxkcjn.supabase.co',
  expires_at: new Date(NOW + 90 * 60_000).toISOString(),
  principals: Object.freeze([
    principal('student', '00000000-0000-4000-8000-000000000201'),
    principal('admin', '00000000-0000-4000-8000-000000000202'),
  ]),
});
const fixtureSummary = Object.freeze({ status:'fixture_principals_ready', run_id:RUN_ID, synthetic_only:true });
assert.equal(PREVIEW_EPHEMERAL_SESSION_GATE, 'SMART_PARROT_PREVIEW_EPHEMERAL_SESSIONS_ENABLED');

const users = new Map(plan.principals.map((p) => [p.id, structuredClone(p)]));
const credentials = new Map();
const authAdmin = {
  async getUserById(id) { return { data:{ user:users.get(id) }, error:null }; },
  async updateUserById(id, input) { return { data:{ user:users.get(id), password_changed:Boolean(input.password) }, error:null }; },
};
const rotated = await rotatePreviewFixtureRuntimeCredentials({
  plan, fixtureSummary, writeGate:'1', secretKey:'sb_secret_preview_test', authAdmin, nowMs:NOW,
  passwordFactory:(role)=>`phase-i-${role}-password-longer-than-24-characters`,
  credentialSink:({role,email,password})=>credentials.set(role,{email,password}),
});
assert.equal(rotated.status, 'fixture_runtime_credentials_rotated');
assert.equal(rotated.rotated_count, 2);
const rotatedJson = JSON.stringify(rotated);
for (const forbidden of [...plan.principals.flatMap((p)=>[p.id,p.email]), ...[...credentials.values()].map((v)=>v.password)]) assert.equal(rotatedJson.includes(forbidden), false);

const signInCalls = [];
const signOutCalls = [];
function token(subject, expiresAt) {
  const enc=(o)=>Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({alg:'RS256',typ:'JWT'})}.${enc({sub:subject,iat:Math.floor(NOW/1000)-5,exp:expiresAt,role:'authenticated'})}.test-signature`;
}
function clientFactory({role, stale=false, wrongSubject=false, wrongRole=false}={}) {
  const p = plan.principals.find((x)=>x.role===role);
  return { auth:{
    async signInWithPassword(input) {
      signInCalls.push({role,email:input.email});
      const exp = Math.floor((NOW + (stale ? 60_000 : 30*60_000))/1000);
      const user = structuredClone(p);
      if (wrongSubject) user.id='00000000-0000-4000-8000-000000000299';
      if (wrongRole) user.user_metadata.smart_parrot_preview_role='tutor';
      return { data:{ user, session:{ user, access_token:token(user.id,exp), refresh_token:'must-not-leak', expires_at:exp } }, error:null };
    },
    async signOut(options) { signOutCalls.push({role,options}); return {error:null}; },
  }};
}

const bundle = await issueEphemeralPreviewFixtureSessions({
  plan, fixtureSummary, sessionGate:'1', publishableKey:'sb_publishable_preview_test', nowMs:NOW,
  credentialProvider:(role)=>credentials.get(role), authClientFactory:({role})=>clientFactory({role}),
});
assert.equal(bundle.summary.status, 'fixture_sessions_ready');
assert.equal(bundle.summary.persistent_storage_used, false);
assert.equal(bundle.summary.refresh_tokens_retained, false);
assert.ok(bundle.getAccessToken('student').includes('.'));
assert.ok(bundle.getAccessToken('admin').includes('.'));
const bundleJson = JSON.stringify(bundle);
for (const forbidden of ['must-not-leak', ...plan.principals.flatMap((p)=>[p.id,p.email]), ...[...credentials.values()].map((v)=>v.password), bundle.getAccessToken('student'), bundle.getAccessToken('admin')]) assert.equal(bundleJson.includes(forbidden), false, `bundle JSON leaked ${forbidden.slice(0,12)}`);
const beforeRepeat = signInCalls.length;
const repeated = await issueEphemeralPreviewFixtureSessions({
  plan, fixtureSummary, sessionGate:'1', publishableKey:'sb_publishable_preview_test', nowMs:NOW,
  credentialProvider:(role)=>credentials.get(role), authClientFactory:({role})=>clientFactory({role}), existingBundle:bundle,
});
assert.equal(repeated, bundle);
assert.equal(signInCalls.length, beforeRepeat, 'usable in-memory bundle must avoid duplicate sign-in');

await assert.rejects(() => issueEphemeralPreviewFixtureSessions({ plan, fixtureSummary, sessionGate:'1', publishableKey:'sb_publishable_preview_test', nowMs:NOW, credentialProvider:(role)=>credentials.get(role), authClientFactory:({role})=>clientFactory({role, stale:role==='student'}) }), /fixture_session_stale:student/);
await assert.rejects(() => issueEphemeralPreviewFixtureSessions({ plan, fixtureSummary, sessionGate:'1', publishableKey:'sb_publishable_preview_test', nowMs:NOW, credentialProvider:(role)=>credentials.get(role), authClientFactory:({role})=>clientFactory({role, wrongSubject:role==='admin'}) }), /fixture_session_identity_mismatch:admin/);
await assert.rejects(() => issueEphemeralPreviewFixtureSessions({ plan, fixtureSummary, sessionGate:'1', publishableKey:'sb_publishable_preview_test', nowMs:NOW, credentialProvider:(role)=>credentials.get(role), authClientFactory:({role})=>clientFactory({role, wrongRole:role==='admin'}) }), /fixture_session_identity_mismatch:admin/);

const lifecycle = buildPreviewFixtureLifecycleReadiness({ plan, fixtureSummary, sessionSummary:bundle.summary, nowMs:NOW });
assert.equal(lifecycle.status, 'ready');
const ambiguous = buildPreviewFixtureLifecycleReadiness({ plan, fixtureSummary, sessionSummary:bundle.summary, nowMs:NOW, cleanupSummary:{status:'fixture_cleanup_ambiguous', reconciliation_required:true} });
assert.equal(ambiguous.status, 'blocked');
assert.equal(ambiguous.checks.fixture_cleanup_not_started.status, 'fixture_cleanup_ambiguous');
const expired = buildPreviewFixtureLifecycleReadiness({ plan, fixtureSummary, sessionSummary:bundle.summary, nowMs:Date.parse(plan.expires_at)-4*60_000 });
assert.equal(expired.status, 'blocked');
assert.equal(expired.checks.fixture_lease_active.ready, false);

let operatorCalls = 0;
const operatorResult = Object.freeze({ schema_version:1, status:'ready', blockers:[], provider_ready_for_bounded_rehearsal:true, server_write_performed:false, checks:Object.freeze({ stripe_signed_webhook_proof:{ready:true,status:'ready'}, daily_signed_endpoint_verification:{ready:true,status:'ready'}, provider_rehearsal:{ready:true,status:'ready'} }) });
const handoff = await runFixtureBoundPreviewOperatorHandoff({ runId:RUN_ID, fixtureLifecycle:lifecycle, operatorBootstrap:async (args)=>{ operatorCalls += 1; assert.equal(args.runId,RUN_ID); return operatorResult; } });
assert.equal(handoff.status,'ready');
assert.equal(operatorCalls,1);
assert.equal(handoff.provider_writes_enabled,false);
const blockedHandoff = await runFixtureBoundPreviewOperatorHandoff({ runId:RUN_ID, fixtureLifecycle:ambiguous, operatorBootstrap:async ()=>{ operatorCalls += 1; return operatorResult; } });
assert.equal(blockedHandoff.status,'blocked');
assert.equal(blockedHandoff.phase,'fixture_lifecycle_preflight');
assert.equal(operatorCalls,1,'blocked fixture lifecycle must stop before operator network/readiness work');

const transcript = buildRedactedProviderTestTranscript({runId:RUN_ID,fixtureLifecycle:lifecycle,operatorResult,nowMs:NOW});
assert.equal(transcript.idempotency_namespace, `smart-parrot-preview:${RUN_ID}`);
assert.equal(transcript.provider_evidence.stripe_signed_webhook_proof, 'ready');
assert.equal(transcript.provider_evidence.daily_signed_endpoint_verification, 'ready');
assert.equal(transcript.provider_evidence.provider_rehearsal, 'ready');
assert.equal(transcript.provider_writes_enabled, false);
const transcriptJson=JSON.stringify(transcript);
for (const forbidden of ['must-not-leak', ...plan.principals.flatMap((p)=>[p.id,p.email]), ...[...credentials.values()].map((v)=>v.password), bundle.getAccessToken('student'), bundle.getAccessToken('admin')]) assert.equal(transcriptJson.includes(forbidden),false);

const closeResult = await bundle.close();
assert.equal(closeResult.status, 'fixture_sessions_closed');
assert.equal(closeResult.local_signout_count, 2);
assert.equal(signOutCalls.slice(-2).every((c)=>c.options?.scope==='local'), true);
assert.equal(bundle.isUsable(NOW), false);
assert.throws(()=>bundle.getAccessToken('student'), /bundle_closed/);

const moduleSource = fs.readFileSync('scripts/lesson-booking-full-preview-ephemeral-sessions.mjs', 'utf8');
assert.ok(moduleSource.includes("scope: 'local'"));
assert.ok(!moduleSource.includes('api.stripe.com'));
assert.ok(!moduleSource.includes('api.daily.co'));
assert.ok(!moduleSource.includes('sk_live_'));
const runnerSource = fs.readFileSync('scripts/lesson-booking-preview-ephemeral-session-handoff.mjs', 'utf8');
assert.ok(runnerSource.includes('persistSession: false'));
assert.ok(runnerSource.includes('autoRefreshToken: false'));
assert.ok(runnerSource.includes('credentials.clear()'));
assert.ok(!runnerSource.includes('refresh_token'));
assert.ok(!runnerSource.includes('api.stripe.com'));
assert.ok(!runnerSource.includes('api.daily.co'));

console.log('Phase 4C5I ephemeral fixture session/rehearsal handoff regression passed.');
