import { createClient } from '@supabase/supabase-js';
import { APPROVED_SMART_PARROT_PREVIEW, createApprovedPreviewSupabaseTransport } from './lesson-booking-full-preview-supabase-transport.mjs';
import { buildPreviewFixturePrincipalPlan, provisionPreviewFixturePrincipals } from './lesson-booking-full-preview-fixture-principals.mjs';
import { runFullPreviewOperatorBootstrap } from './lesson-booking-full-preview-operator-bootstrap.mjs';
import {
  PREVIEW_EPHEMERAL_SESSION_GATE,
  rotatePreviewFixtureRuntimeCredentials,
  issueEphemeralPreviewFixtureSessions,
  buildPreviewFixtureLifecycleReadiness,
  runFixtureBoundPreviewOperatorHandoff,
  buildRedactedProviderTestTranscript,
} from './lesson-booking-full-preview-ephemeral-sessions.mjs';

if (process.env[PREVIEW_EPHEMERAL_SESSION_GATE] !== '1') {
  console.log('Smart Parrot preview ephemeral session handoff disabled.');
  process.exit(0);
}

const runId = String(process.env.SMART_PARROT_FULL_PREVIEW_RUN_ID || '').trim();
const secretKey = String(process.env.SMART_PARROT_PREVIEW_SUPABASE_SECRET_KEY || '').trim();
const publishableKey = String(process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
const fixtureWriteGate = String(process.env.SMART_PARROT_PREVIEW_FIXTURE_WRITES_ENABLED || '').trim();
const ttlMinutes = Number(process.env.SMART_PARROT_PREVIEW_FIXTURE_TTL_MINUTES || 90);

if (fixtureWriteGate !== '1') throw new Error('SMART_PARROT_PREVIEW_FIXTURE_WRITES_ENABLED must be 1 for the bounded fixture/session handoff.');
if (!secretKey.startsWith('sb_secret_')) throw new Error('SMART_PARROT_PREVIEW_SUPABASE_SECRET_KEY must be an sb_secret_ key for the approved preview project.');
if (!publishableKey.startsWith('sb_publishable_')) throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY must be the approved preview publishable key.');

const plan = buildPreviewFixturePrincipalPlan({
  runId,
  previewRef: APPROVED_SMART_PARROT_PREVIEW.projectRef,
  supabaseUrl: APPROVED_SMART_PARROT_PREVIEW.supabaseUrl,
  ttlMinutes,
});

const supabaseAdmin = createClient(APPROVED_SMART_PARROT_PREVIEW.supabaseUrl, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const authAdmin = {
  getUserById: (id) => supabaseAdmin.auth.admin.getUserById(id),
  createUser: (input) => supabaseAdmin.auth.admin.createUser(input),
  updateUserById: (id, input) => supabaseAdmin.auth.admin.updateUserById(id, input),
  deleteUser: (id) => supabaseAdmin.auth.admin.deleteUser(id),
};
const profileStore = {
  async setRole(userId, role) {
    const { error } = await supabaseAdmin.from('profiles').update({ role }).eq('id', userId);
    return { error };
  },
  async getRole(userId) {
    const { data, error } = await supabaseAdmin.from('profiles').select('role').eq('id', userId).maybeSingle();
    return { role: data?.role ?? null, error };
  },
};

const credentials = new Map();
let sessionBundle = null;
try {
  const fixtureSummary = await provisionPreviewFixturePrincipals({
    plan,
    writeGate: fixtureWriteGate,
    secretKey,
    authAdmin,
    profileStore,
  });
  await rotatePreviewFixtureRuntimeCredentials({
    plan,
    fixtureSummary,
    writeGate: fixtureWriteGate,
    secretKey,
    authAdmin,
    credentialSink: ({ role, email, password }) => credentials.set(role, { email, password }),
  });

  sessionBundle = await issueEphemeralPreviewFixtureSessions({
    plan,
    fixtureSummary,
    sessionGate: process.env[PREVIEW_EPHEMERAL_SESSION_GATE],
    publishableKey,
    credentialProvider: (role) => credentials.get(role),
    authClientFactory: () => createClient(APPROVED_SMART_PARROT_PREVIEW.supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }),
  });
  credentials.clear();

  const fixtureLifecycle = buildPreviewFixtureLifecycleReadiness({
    plan,
    fixtureSummary,
    sessionSummary: sessionBundle.summary,
  });
  const studentAccessToken = sessionBundle.getAccessToken('student');
  const adminAccessToken = sessionBundle.getAccessToken('admin');
  const transport = createApprovedPreviewSupabaseTransport({
    previewRef: APPROVED_SMART_PARROT_PREVIEW.projectRef,
    supabaseUrl: APPROVED_SMART_PARROT_PREVIEW.supabaseUrl,
    publishableKey,
    studentAccessToken,
    adminAccessToken,
  });
  const operatorHandoff = await runFixtureBoundPreviewOperatorHandoff({
    runId,
    fixtureLifecycle,
    operatorBootstrap: runFullPreviewOperatorBootstrap,
    operatorArgs: {
      transport,
      readinessInput: {
        previewRef: APPROVED_SMART_PARROT_PREVIEW.projectRef,
        supabaseUrl: APPROVED_SMART_PARROT_PREVIEW.supabaseUrl,
        publishableKey,
        studentAccessToken,
        adminAccessToken,
      },
    },
  });
  const transcript = operatorHandoff.operator_result
    ? buildRedactedProviderTestTranscript({ runId, fixtureLifecycle, operatorResult: operatorHandoff.operator_result })
    : null;

  console.log(JSON.stringify({
    schema_version: 1,
    status: operatorHandoff.status,
    fixture_sessions: sessionBundle.summary,
    fixture_lifecycle: fixtureLifecycle,
    operator_handoff: operatorHandoff,
    provider_test_transcript: transcript,
    provider_writes_enabled: false,
    secrets_exposed: false,
  }, null, 2));
} finally {
  credentials.clear();
  if (sessionBundle) await sessionBundle.close();
}
