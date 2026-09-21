import { randomBytes } from 'node:crypto';
import { APPROVED_SMART_PARROT_PREVIEW } from './lesson-booking-full-preview-supabase-transport.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIXTURE_ROLES = Object.freeze(['student', 'admin']);
const MIN_SESSION_REMAINING_MS = 5 * 60 * 1000;
export const PREVIEW_EPHEMERAL_SESSION_GATE = 'SMART_PARROT_PREVIEW_EPHEMERAL_SESSIONS_ENABLED';

function text(value) {
  return String(value ?? '').trim();
}

function check(ready, status) {
  return Object.freeze({ ready: Boolean(ready), status });
}

function fixtureEmail(runId, role) {
  return `sp-preview-${runId.replaceAll('-', '')}-${role}@example.invalid`;
}

function structuralPlanCheck(plan) {
  if (!plan || plan.schema_version !== 1 || !UUID_RE.test(text(plan.run_id))) throw new Error('fixture_plan_invalid');
  if (text(plan.preview_project_ref) !== APPROVED_SMART_PARROT_PREVIEW.projectRef) throw new Error('approved_preview_identity_required');
  if (text(plan.supabase_url).replace(/\/$/, '') !== APPROVED_SMART_PARROT_PREVIEW.supabaseUrl) throw new Error('approved_preview_identity_required');
  if (!Array.isArray(plan.principals) || plan.principals.length !== 2) throw new Error('fixture_principal_pair_required');
  const expiresMs = Date.parse(text(plan.expires_at));
  if (!Number.isFinite(expiresMs)) throw new Error('fixture_plan_expiry_invalid');
  const roles = new Set();
  for (const principal of plan.principals) {
    if (!FIXTURE_ROLES.includes(principal?.role) || roles.has(principal.role)) throw new Error('fixture_role_invalid');
    roles.add(principal.role);
    if (!UUID_RE.test(text(principal.id))) throw new Error('fixture_user_id_invalid');
    if (text(principal.email).toLowerCase() !== fixtureEmail(plan.run_id, principal.role)) throw new Error('fixture_email_namespace_invalid');
    if (principal.user_metadata?.smart_parrot_preview_fixture !== true
      || principal.user_metadata?.smart_parrot_preview_run_id !== plan.run_id
      || principal.user_metadata?.smart_parrot_preview_role !== principal.role
      || principal.user_metadata?.data_class !== 'synthetic') {
      throw new Error('fixture_metadata_invalid');
    }
  }
  return { expiresMs };
}

function assertActivePlan(plan, nowMs, minRemainingMs = 0) {
  const { expiresMs } = structuralPlanCheck(plan);
  if (!Number.isFinite(nowMs)) throw new Error('fixture_clock_invalid');
  if (expiresMs <= nowMs + minRemainingMs) throw new Error('fixture_plan_expired_or_too_close');
  return expiresMs;
}

function assertFixtureSummary(plan, fixtureSummary) {
  if (fixtureSummary?.status !== 'fixture_principals_ready'
    || fixtureSummary?.run_id !== plan.run_id
    || fixtureSummary?.synthetic_only !== true) {
    throw new Error('fixture_principals_not_ready');
  }
}

function principalMatches(user, principal, runId) {
  return Boolean(user)
    && text(user.id) === principal.id
    && text(user.email).toLowerCase() === principal.email
    && user.user_metadata?.smart_parrot_preview_fixture === true
    && user.user_metadata?.smart_parrot_preview_run_id === runId
    && user.user_metadata?.smart_parrot_preview_role === principal.role
    && user.user_metadata?.data_class === 'synthetic';
}

function generatedPassword() {
  return `${randomBytes(32).toString('base64url')}!aA7`;
}

export async function rotatePreviewFixtureRuntimeCredentials({
  plan,
  fixtureSummary,
  writeGate,
  secretKey,
  authAdmin,
  credentialSink,
  nowMs = Date.now(),
  passwordFactory = generatedPassword,
} = {}) {
  assertActivePlan(plan, nowMs, MIN_SESSION_REMAINING_MS);
  assertFixtureSummary(plan, fixtureSummary);
  if (String(writeGate ?? '') !== '1') throw new Error('preview_fixture_write_gate_closed');
  if (!text(secretKey).startsWith('sb_secret_')) throw new Error('preview_supabase_secret_key_required');
  if (!authAdmin?.getUserById || !authAdmin?.updateUserById) throw new Error('fixture_auth_admin_rotation_adapter_required');
  if (typeof credentialSink !== 'function') throw new Error('fixture_credential_sink_required');

  let rotated = 0;
  for (const principal of plan.principals) {
    const lookup = await authAdmin.getUserById(principal.id);
    if (lookup?.error) throw lookup.error;
    const user = lookup?.data?.user ?? null;
    if (!principalMatches(user, principal, plan.run_id)) throw new Error(`fixture_identity_collision:${principal.role}`);

    const password = text(passwordFactory(principal.role));
    if (password.length < 24) throw new Error('fixture_runtime_password_too_short');
    const update = await authAdmin.updateUserById(principal.id, { password });
    if (update?.error) throw update.error;
    const updatedUser = update?.data?.user ?? user;
    if (!principalMatches(updatedUser, principal, plan.run_id)) throw new Error(`fixture_rotation_identity_mismatch:${principal.role}`);

    await credentialSink(Object.freeze({ role: principal.role, email: principal.email, password }));
    rotated += 1;
  }

  return Object.freeze({
    schema_version: 1,
    status: 'fixture_runtime_credentials_rotated',
    run_id: plan.run_id,
    rotated_count: rotated,
    credentials_exposed: false,
    persistent_storage_used: false,
    provider_writes_enabled: false,
  });
}

async function localSignOut(clients) {
  const failures = [];
  for (const [role, client] of clients.entries()) {
    try {
      const result = await client.auth.signOut({ scope: 'local' });
      if (result?.error) throw result.error;
    } catch {
      failures.push(role);
    }
  }
  return failures;
}

function validateSessionIdentity({ role, principal, data, nowMs, minRemainingMs }) {
  const session = data?.session;
  const user = data?.user ?? session?.user ?? null;
  if (!principalMatches(user, principal, principal.user_metadata.smart_parrot_preview_run_id)) {
    throw new Error(`fixture_session_identity_mismatch:${role}`);
  }
  const accessToken = text(session?.access_token);
  if (!accessToken) throw new Error(`fixture_session_access_token_missing:${role}`);
  const expiresAtSeconds = Number(session?.expires_at);
  if (!Number.isFinite(expiresAtSeconds)) throw new Error(`fixture_session_expiry_invalid:${role}`);
  const expiresMs = expiresAtSeconds * 1000;
  if (expiresMs <= nowMs + minRemainingMs) throw new Error(`fixture_session_stale:${role}`);
  return { accessToken, expiresMs };
}

export async function issueEphemeralPreviewFixtureSessions({
  plan,
  fixtureSummary,
  sessionGate,
  publishableKey,
  credentialProvider,
  authClientFactory,
  existingBundle = null,
  nowMs = Date.now(),
  minRemainingMs = MIN_SESSION_REMAINING_MS,
} = {}) {
  const fixtureExpiresMs = assertActivePlan(plan, nowMs, minRemainingMs);
  assertFixtureSummary(plan, fixtureSummary);
  if (String(sessionGate ?? '') !== '1') throw new Error('preview_ephemeral_session_gate_closed');
  if (!text(publishableKey).startsWith('sb_publishable_')) throw new Error('supabase_publishable_key_required');
  if (typeof credentialProvider !== 'function') throw new Error('fixture_credential_provider_required');
  if (typeof authClientFactory !== 'function') throw new Error('fixture_auth_client_factory_required');
  if (!Number.isFinite(minRemainingMs) || minRemainingMs < 60_000) throw new Error('fixture_session_min_remaining_invalid');

  if (existingBundle?.summary?.status === 'fixture_sessions_ready'
    && existingBundle.summary.run_id === plan.run_id
    && typeof existingBundle.isUsable === 'function'
    && existingBundle.isUsable(nowMs, minRemainingMs)) {
    return existingBundle;
  }

  const clients = new Map();
  const tokens = new Map();
  const expiries = [];
  try {
    for (const role of FIXTURE_ROLES) {
      const principal = plan.principals.find((item) => item.role === role);
      const credential = await credentialProvider(role);
      if (!credential
        || text(credential.email).toLowerCase() !== principal.email
        || text(credential.password).length < 24) {
        throw new Error(`fixture_runtime_credential_invalid:${role}`);
      }
      const client = await authClientFactory({
        role,
        supabaseUrl: APPROVED_SMART_PARROT_PREVIEW.supabaseUrl,
        publishableKey,
      });
      if (!client?.auth?.signInWithPassword || !client?.auth?.signOut) throw new Error(`fixture_auth_client_invalid:${role}`);
      clients.set(role, client);
      const signedIn = await client.auth.signInWithPassword({
        email: principal.email,
        password: credential.password,
      });
      if (signedIn?.error) throw signedIn.error;
      const validated = validateSessionIdentity({ role, principal, data: signedIn?.data, nowMs, minRemainingMs });
      tokens.set(role, validated.accessToken);
      expiries.push(validated.expiresMs);
    }
  } catch (error) {
    const failures = await localSignOut(clients);
    tokens.clear();
    if (failures.length) {
      const ambiguous = new Error(`fixture_session_issue_failed_cleanup_ambiguous:${text(error?.message) || 'unknown'}`);
      ambiguous.cause = error;
      ambiguous.cleanup_failures = failures;
      throw ambiguous;
    }
    throw error;
  }

  const effectiveExpiresMs = Math.min(fixtureExpiresMs, ...expiries);
  const summary = Object.freeze({
    schema_version: 1,
    status: 'fixture_sessions_ready',
    run_id: plan.run_id,
    roles: Object.freeze([...FIXTURE_ROLES]),
    effective_expires_at: new Date(effectiveExpiresMs).toISOString(),
    persistent_storage_used: false,
    refresh_tokens_retained: false,
    credentials_exposed: false,
    provider_writes_enabled: false,
  });
  let closed = false;

  const bundle = {
    summary,
    isUsable(atMs = Date.now(), requiredRemainingMs = MIN_SESSION_REMAINING_MS) {
      return !closed && effectiveExpiresMs > atMs + requiredRemainingMs && tokens.size === FIXTURE_ROLES.length;
    },
    getAccessToken(role) {
      if (closed) throw new Error('fixture_session_bundle_closed');
      if (!FIXTURE_ROLES.includes(role)) throw new Error('fixture_session_role_invalid');
      const token = tokens.get(role);
      if (!token) throw new Error(`fixture_session_access_token_unavailable:${role}`);
      return token;
    },
    async close() {
      if (closed) {
        return Object.freeze({
          schema_version: 1,
          status: 'fixture_sessions_closed',
          run_id: plan.run_id,
          local_signout_count: 0,
          local_signout_failure_count: 0,
          credentials_exposed: false,
        });
      }
      const failures = await localSignOut(clients);
      tokens.clear();
      clients.clear();
      closed = true;
      return Object.freeze({
        schema_version: 1,
        status: failures.length ? 'fixture_session_close_ambiguous' : 'fixture_sessions_closed',
        run_id: plan.run_id,
        local_signout_count: FIXTURE_ROLES.length - failures.length,
        local_signout_failure_count: failures.length,
        access_tokens_expire_naturally: true,
        credentials_exposed: false,
      });
    },
    toJSON() {
      return summary;
    },
  };
  return Object.freeze(bundle);
}

export function buildPreviewFixtureLifecycleReadiness({
  plan,
  fixtureSummary,
  sessionSummary,
  cleanupSummary = null,
  nowMs = Date.now(),
  minRemainingMs = MIN_SESSION_REMAINING_MS,
} = {}) {
  const { expiresMs } = structuralPlanCheck(plan);
  const sessionExpiresMs = Date.parse(text(sessionSummary?.effective_expires_at));
  const fixtureReady = fixtureSummary?.status === 'fixture_principals_ready'
    && fixtureSummary?.run_id === plan.run_id
    && fixtureSummary?.synthetic_only === true;
  const leaseReady = Number.isFinite(nowMs)
    && Number.isFinite(minRemainingMs)
    && minRemainingMs >= 60_000
    && expiresMs > nowMs + minRemainingMs;
  const sessionReady = sessionSummary?.status === 'fixture_sessions_ready'
    && sessionSummary?.run_id === plan.run_id
    && sessionSummary?.persistent_storage_used === false
    && sessionSummary?.refresh_tokens_retained === false
    && Number.isFinite(sessionExpiresMs)
    && sessionExpiresMs > nowMs + minRemainingMs;
  const cleanupReady = cleanupSummary == null;

  const checks = Object.freeze({
    fixture_principals_ready: check(fixtureReady, fixtureReady ? 'ready' : 'fixture_principals_not_ready'),
    fixture_lease_active: check(leaseReady, leaseReady ? 'ready' : 'fixture_lease_expired_or_too_close'),
    fixture_sessions_fresh: check(sessionReady, sessionReady ? 'ready' : 'fixture_sessions_missing_or_stale'),
    fixture_cleanup_not_started: check(
      cleanupReady,
      cleanupReady
        ? 'ready'
        : cleanupSummary?.reconciliation_required === true || cleanupSummary?.status === 'fixture_cleanup_ambiguous'
          ? 'fixture_cleanup_ambiguous'
          : 'fixture_cleanup_already_started',
    ),
  });
  const blockers = Object.entries(checks).filter(([, value]) => !value.ready).map(([name]) => name);
  return Object.freeze({
    schema_version: 1,
    status: blockers.length ? 'blocked' : 'ready',
    run_id: plan.run_id,
    checks,
    blockers: Object.freeze(blockers),
    credentials_exposed: false,
    provider_writes_enabled: false,
  });
}

export async function runFixtureBoundPreviewOperatorHandoff({
  runId,
  fixtureLifecycle,
  operatorBootstrap,
  operatorArgs = {},
} = {}) {
  const id = text(runId);
  if (!UUID_RE.test(id)) throw new Error('operator_handoff_run_id_invalid');
  if (fixtureLifecycle?.schema_version !== 1 || fixtureLifecycle?.run_id !== id) {
    throw new Error('operator_handoff_fixture_lifecycle_mismatch');
  }
  if (typeof operatorBootstrap !== 'function') throw new Error('operator_bootstrap_adapter_required');
  if (fixtureLifecycle.status !== 'ready') {
    return Object.freeze({
      schema_version: 1,
      status: 'blocked',
      phase: 'fixture_lifecycle_preflight',
      run_id: id,
      fixture_lifecycle: fixtureLifecycle,
      blockers: fixtureLifecycle.blockers,
      operator_result: null,
      provider_writes_enabled: false,
      server_write_performed: false,
      secrets_exposed: false,
    });
  }

  const operatorResult = await operatorBootstrap({ ...operatorArgs, runId: id });
  if (!operatorResult || operatorResult.schema_version !== 1) throw new Error('operator_handoff_result_invalid');
  return Object.freeze({
    schema_version: 1,
    status: operatorResult.status === 'ready' ? 'ready' : 'blocked',
    phase: 'fixture_bound_operator_readiness',
    run_id: id,
    fixture_lifecycle: fixtureLifecycle,
    blockers: Object.freeze([...(operatorResult.blockers ?? [])]),
    operator_result: operatorResult,
    provider_writes_enabled: false,
    server_write_performed: operatorResult.server_write_performed === true,
    secrets_exposed: false,
  });
}

export function buildRedactedProviderTestTranscript({
  runId,
  fixtureLifecycle,
  operatorResult,
  nowMs = Date.now(),
} = {}) {
  const id = text(runId);
  if (!UUID_RE.test(id)) throw new Error('transcript_run_id_invalid');
  if (fixtureLifecycle?.schema_version !== 1 || fixtureLifecycle?.run_id !== id) throw new Error('transcript_fixture_lifecycle_mismatch');
  if (!operatorResult || operatorResult.schema_version !== 1) throw new Error('transcript_operator_result_required');
  if (!Number.isFinite(nowMs)) throw new Error('transcript_clock_invalid');

  const statusOf = (name, fallback) => text(operatorResult?.checks?.[name]?.status) || fallback;
  const transcript = {
    schema_version: 1,
    generated_at: new Date(nowMs).toISOString(),
    run_id: id,
    idempotency_namespace: `smart-parrot-preview:${id}`,
    fixture_lifecycle_status: fixtureLifecycle.status,
    operator_status: operatorResult.status,
    provider_evidence: Object.freeze({
      stripe_signed_webhook_proof: statusOf('stripe_signed_webhook_proof', 'not_observed'),
      daily_signed_endpoint_verification: statusOf('daily_signed_endpoint_verification', 'not_observed'),
      provider_rehearsal: statusOf('provider_rehearsal', 'not_observed'),
    }),
    provider_ready_for_bounded_rehearsal: operatorResult.provider_ready_for_bounded_rehearsal === true,
    provider_writes_enabled: false,
    customer_data_included: false,
    provider_object_ids_included: false,
    secrets_exposed: false,
  };
  return Object.freeze(transcript);
}
