import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APPROVED_SMART_PARROT_PREVIEW,
  createApprovedPreviewSupabaseTransport,
} from './lesson-booking-full-preview-supabase-transport.mjs';
import { buildFullPreviewReadinessManifest } from './lesson-booking-full-preview-readiness-manifest.mjs';
import { assertMinimizedFullPreviewRunSnapshot } from './lesson-booking-full-preview-run-registry.mjs';
import { buildPreviewWorkerIntent } from './lesson-booking-full-preview-resumable-executor.mjs';

export const FULL_PREVIEW_OPERATOR_GATE = 'SMART_PARROT_FULL_PREVIEW_OPERATOR_BOOTSTRAP';
const DEFAULT_MAX_READINESS_AGE_MS = 5 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 60 * 1000;

function check(ready, status) {
  return Object.freeze({ ready: Boolean(ready), status });
}

function requiredRunId(value) {
  const runId = String(value ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)) {
    throw new Error('invalid_run_id');
  }
  return runId;
}

function freshness(payload, schemaVersion, nowMs, maxAgeMs, label) {
  if (!payload || payload.schema_version !== schemaVersion) return check(false, `${label}_schema_mismatch`);
  const generatedMs = Date.parse(String(payload.generated_at ?? ''));
  if (!Number.isFinite(generatedMs)) return check(false, `${label}_generated_at_invalid`);
  if (generatedMs > nowMs + MAX_FUTURE_SKEW_MS) return check(false, `${label}_generated_in_future`);
  if (nowMs - generatedMs > maxAgeMs) return check(false, `${label}_stale`);
  return check(true, 'ready');
}

function localOperatorChecks(manifest) {
  const names = [
    'preview_project_identity',
    'supabase_publishable_key',
    'student_session',
    'admin_session',
    'distinct_student_admin_sessions',
  ];
  const checks = Object.fromEntries(names.map((name) => [name, manifest.checks[name]]));
  return Object.freeze({
    ready: names.every((name) => checks[name]?.ready === true),
    checks: Object.freeze(checks),
  });
}

function minimizedRun(snapshot) {
  if (!snapshot) return null;
  return Object.freeze({
    run_id: snapshot.run_id,
    scenario: snapshot.scenario,
    state: snapshot.state,
    pause_reason: snapshot.pause_reason,
    terminal: snapshot.terminal,
    revision: snapshot.revision,
    last_booking_status: snapshot.last_booking_status,
    last_observed_at: snapshot.last_observed_at,
    completed_at: snapshot.completed_at,
  });
}

function blockerNames(checks) {
  return Object.entries(checks).filter(([, value]) => value?.ready !== true).map(([name]) => name);
}

export async function runFullPreviewOperatorBootstrap({
  transport,
  readinessInput = {},
  runId = null,
  nowMs = Date.now(),
  maxReadinessAgeMs = DEFAULT_MAX_READINESS_AGE_MS,
} = {}) {
  if (!transport || typeof transport.probeUserSession !== 'function' || typeof transport.invokeServer !== 'function') {
    throw new Error('approved_preview_transport_required');
  }
  if (!Number.isFinite(nowMs) || !Number.isFinite(maxReadinessAgeMs) || maxReadinessAgeMs < 60_000) {
    throw new Error('invalid_operator_readiness_clock');
  }

  const manifest = buildFullPreviewReadinessManifest(readinessInput, { nowMs });
  const local = localOperatorChecks(manifest);
  const checks = {
    local_preview_identity: local.checks.preview_project_identity,
    local_supabase_publishable_key: local.checks.supabase_publishable_key,
    local_student_session_shape: local.checks.student_session,
    local_admin_session_shape: local.checks.admin_session,
    local_distinct_session_shape: local.checks.distinct_student_admin_sessions,
  };

  if (!local.ready) {
    return Object.freeze({
      schema_version: 1,
      status: 'blocked',
      phase: 'local_transport_preflight',
      checks: Object.freeze(checks),
      blockers: Object.freeze(blockerNames(checks)),
      provider_writes_enabled: false,
      server_write_performed: false,
      secrets_exposed: false,
      run: null,
      worker_intent: null,
    });
  }

  const [studentIdentity, adminIdentity] = await Promise.all([
    transport.probeUserSession('student_user'),
    transport.probeUserSession('admin_user'),
  ]);
  checks.server_student_role = check(studentIdentity?.role === 'student', studentIdentity?.role === 'student' ? 'ready' : 'student_role_required');
  checks.server_admin_role = check(adminIdentity?.role === 'admin', adminIdentity?.role === 'admin' ? 'ready' : 'admin_role_required');
  checks.server_distinct_principals = check(
    Boolean(studentIdentity?.subject && adminIdentity?.subject && studentIdentity.subject !== adminIdentity.subject),
    studentIdentity?.subject && adminIdentity?.subject && studentIdentity.subject !== adminIdentity.subject
      ? 'ready'
      : 'student_admin_principals_must_be_distinct',
  );

  if (!checks.server_student_role.ready || !checks.server_admin_role.ready || !checks.server_distinct_principals.ready) {
    return Object.freeze({
      schema_version: 1,
      status: 'blocked',
      phase: 'authoritative_session_roles',
      checks: Object.freeze(checks),
      blockers: Object.freeze(blockerNames(checks)),
      provider_writes_enabled: false,
      server_write_performed: false,
      secrets_exposed: false,
      run: null,
      worker_intent: null,
    });
  }

  const [baseReadiness, providerReadiness, rehearsalReadiness, webhookProof] = await Promise.all([
    transport.invokeServer({ target: 'booking-preview-readiness', auth: 'admin_user', payload: {} }),
    transport.invokeServer({ target: 'booking-provider-preview-readiness', auth: 'admin_user', payload: {} }),
    transport.invokeServer({ target: 'admin_provider_rehearsal_readiness', auth: 'admin_rpc', payload: {} }),
    transport.invokeServer({ target: 'admin_booking_webhook_readiness_proof', auth: 'admin_rpc', payload: {} }),
  ]);

  checks.base_readiness_fresh = freshness(baseReadiness, 'smart_parrot_booking_preview_readiness_v2', nowMs, maxReadinessAgeMs, 'base_readiness');
  checks.provider_readiness_fresh = freshness(providerReadiness, 'smart_parrot_booking_provider_preview_readiness_v1', nowMs, maxReadinessAgeMs, 'provider_readiness');
  checks.rehearsal_readiness_fresh = freshness(rehearsalReadiness, 'smart_parrot_provider_rehearsal_readiness_v1', nowMs, maxReadinessAgeMs, 'rehearsal_readiness');
  checks.webhook_proof_fresh = freshness(webhookProof, 'smart_parrot_booking_webhook_readiness_proof_v1', nowMs, maxReadinessAgeMs, 'webhook_proof');
  checks.server_preview_project_identity = check(
    baseReadiness?.checks?.preview_project_identity?.ready === true
      && providerReadiness?.checks?.preview_project_identity?.ready === true,
    baseReadiness?.checks?.preview_project_identity?.ready === true
      && providerReadiness?.checks?.preview_project_identity?.ready === true
      ? 'ready'
      : 'preview_project_identity_not_proven',
  );
  checks.base_configuration = check(
    checks.base_readiness_fresh.ready && ['ready', 'ready_with_warning'].includes(baseReadiness?.status),
    checks.base_readiness_fresh.ready && ['ready', 'ready_with_warning'].includes(baseReadiness?.status)
      ? 'ready'
      : (baseReadiness?.blockers?.[0] ?? checks.base_readiness_fresh.status),
  );
  checks.provider_identity = check(
    checks.provider_readiness_fresh.ready && providerReadiness?.status === 'ready',
    checks.provider_readiness_fresh.ready && providerReadiness?.status === 'ready'
      ? 'ready'
      : (providerReadiness?.blockers?.[0] ?? checks.provider_readiness_fresh.status),
  );
  checks.provider_rehearsal = check(
    checks.rehearsal_readiness_fresh.ready && rehearsalReadiness?.status === 'ready' && rehearsalReadiness?.ready === true,
    checks.rehearsal_readiness_fresh.ready && rehearsalReadiness?.status === 'ready' && rehearsalReadiness?.ready === true
      ? 'ready'
      : (rehearsalReadiness?.blockers?.[0] ?? checks.rehearsal_readiness_fresh.status),
  );
  checks.stripe_signed_webhook_proof = check(
    checks.webhook_proof_fresh.ready && webhookProof?.status === 'ready',
    checks.webhook_proof_fresh.ready && webhookProof?.status === 'ready'
      ? 'ready'
      : (webhookProof?.blockers?.[0] ?? checks.webhook_proof_fresh.status),
  );
  checks.daily_signed_endpoint_verification = check(
    checks.provider_readiness_fresh.ready
      && providerReadiness?.checks?.daily_preview_webhook_domain_identity?.ready === true
      && baseReadiness?.checks?.daily_webhook_secret?.ready === true,
    checks.provider_readiness_fresh.ready
      && providerReadiness?.checks?.daily_preview_webhook_domain_identity?.ready === true
      && baseReadiness?.checks?.daily_webhook_secret?.ready === true
      ? 'ready'
      : 'daily_signed_endpoint_verification_not_proven',
  );

  const providerReady = [
    'server_preview_project_identity',
    'base_configuration',
    'provider_identity',
    'provider_rehearsal',
    'stripe_signed_webhook_proof',
    'daily_signed_endpoint_verification',
  ].every((name) => checks[name]?.ready === true);

  let runSnapshot = null;
  let workerIntent = null;
  if (runId != null) {
    const id = requiredRunId(runId);
    runSnapshot = assertMinimizedFullPreviewRunSnapshot(await transport.invokeServer({
      target: 'admin_get_booking_full_preview_run',
      auth: 'admin_rpc',
      payload: { p_run_id: id },
    }));
    workerIntent = buildPreviewWorkerIntent(
      runSnapshot,
      { provider_write_ready: providerReady },
      { workerWriteGate: '0' },
    );
  }

  const blockers = blockerNames(checks);
  return Object.freeze({
    schema_version: 1,
    status: blockers.length ? 'blocked' : 'ready',
    phase: 'operator_readiness',
    approved_preview_project: APPROVED_SMART_PARROT_PREVIEW.projectRef,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    provider_ready_for_bounded_rehearsal: providerReady,
    provider_writes_enabled: false,
    server_write_performed: false,
    secrets_exposed: false,
    run: minimizedRun(runSnapshot),
    worker_intent: workerIntent,
  });
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isMainModule()) {
  if (process.env[FULL_PREVIEW_OPERATOR_GATE] !== '1') {
    console.log('Full lesson-booking preview operator bootstrap disabled.');
  } else {
    const previewRef = String(process.env.SMART_PARROT_PREVIEW_PROJECT_REF || '').trim();
    const supabaseUrl = String(process.env.VITE_SUPABASE_URL || '').trim();
    const publishableKey = String(process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
    const studentAccessToken = String(process.env.SMART_PARROT_PREVIEW_STUDENT_ACCESS_TOKEN || '').trim();
    const adminAccessToken = String(process.env.SMART_PARROT_PREVIEW_ADMIN_ACCESS_TOKEN || '').trim();
    const runId = String(process.env.SMART_PARROT_FULL_PREVIEW_RUN_ID || '').trim() || null;
    const transport = createApprovedPreviewSupabaseTransport({
      previewRef,
      supabaseUrl,
      publishableKey,
      studentAccessToken,
      adminAccessToken,
    });
    const result = await runFullPreviewOperatorBootstrap({
      transport,
      runId,
      readinessInput: {
        previewRef,
        supabaseUrl,
        publishableKey,
        studentAccessToken,
        adminAccessToken,
      },
    });
    console.log(JSON.stringify(result, null, 2));
  }
}
