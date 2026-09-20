import { createHash, randomBytes } from 'node:crypto';
import { APPROVED_SMART_PARROT_PREVIEW } from './lesson-booking-full-preview-supabase-transport.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIXTURE_ROLES = Object.freeze(['student', 'admin']);
const FIXTURE_EMAIL_DOMAIN = 'example.invalid';
export const PREVIEW_FIXTURE_WRITE_GATE = 'SMART_PARROT_PREVIEW_FIXTURE_WRITES_ENABLED';

function text(value) {
  return String(value ?? '').trim();
}

function exactPreviewIdentity(previewRef, supabaseUrl) {
  return previewRef === APPROVED_SMART_PARROT_PREVIEW.projectRef
    && supabaseUrl.replace(/\/$/, '') === APPROVED_SMART_PARROT_PREVIEW.supabaseUrl;
}

function derivedFixtureUuid(runId, role) {
  const hex = createHash('sha256')
    .update(`smart-parrot-preview-fixture:${runId}:${role}`)
    .digest('hex')
    .slice(0, 32)
    .split('');
  hex[12] = '5';
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4];
  const raw = hex.join('');
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function fixtureEmail(runId, role) {
  return `sp-preview-${runId.replaceAll('-', '')}-${role}@${FIXTURE_EMAIL_DOMAIN}`;
}

function frozenPrincipal(runId, role) {
  return Object.freeze({
    role,
    id: derivedFixtureUuid(runId, role),
    email: fixtureEmail(runId, role),
    user_metadata: Object.freeze({
      smart_parrot_preview_fixture: true,
      smart_parrot_preview_run_id: runId,
      smart_parrot_preview_role: role,
      data_class: 'synthetic',
    }),
  });
}

export function buildPreviewFixturePrincipalPlan({
  runId,
  previewRef = APPROVED_SMART_PARROT_PREVIEW.projectRef,
  supabaseUrl = APPROVED_SMART_PARROT_PREVIEW.supabaseUrl,
  ttlMinutes = 90,
  nowMs = Date.now(),
} = {}) {
  const normalizedRunId = text(runId);
  const normalizedRef = text(previewRef);
  const normalizedUrl = text(supabaseUrl).replace(/\/$/, '');
  const ttl = Number(ttlMinutes);

  if (!UUID_RE.test(normalizedRunId)) throw new Error('fixture_run_id_uuid_required');
  if (!exactPreviewIdentity(normalizedRef, normalizedUrl)) throw new Error('approved_preview_identity_required');
  if (!Number.isInteger(ttl) || ttl < 15 || ttl > 120) throw new Error('fixture_ttl_out_of_bounds');
  if (!Number.isFinite(nowMs)) throw new Error('fixture_clock_invalid');

  const principals = Object.freeze(FIXTURE_ROLES.map((role) => frozenPrincipal(normalizedRunId, role)));
  return Object.freeze({
    schema_version: 1,
    run_id: normalizedRunId,
    preview_project_ref: normalizedRef,
    supabase_url: normalizedUrl,
    created_at: new Date(nowMs).toISOString(),
    expires_at: new Date(nowMs + ttl * 60_000).toISOString(),
    data_class: 'synthetic_only',
    principals,
    credentials_exposed: false,
  });
}

function assertFixturePlan(plan, nowMs = Date.now()) {
  if (!plan || plan.schema_version !== 1 || !UUID_RE.test(text(plan.run_id))) throw new Error('fixture_plan_invalid');
  if (!exactPreviewIdentity(text(plan.preview_project_ref), text(plan.supabase_url))) throw new Error('approved_preview_identity_required');
  if (!Array.isArray(plan.principals) || plan.principals.length !== 2) throw new Error('fixture_principal_pair_required');
  if (new Date(plan.expires_at).getTime() <= nowMs) throw new Error('fixture_plan_expired');

  const seen = new Set();
  for (const principal of plan.principals) {
    if (!FIXTURE_ROLES.includes(principal.role)) throw new Error('fixture_role_invalid');
    if (seen.has(principal.role)) throw new Error('fixture_role_duplicate');
    seen.add(principal.role);
    if (!UUID_RE.test(text(principal.id))) throw new Error('fixture_user_id_invalid');
    if (text(principal.email) !== fixtureEmail(plan.run_id, principal.role)) throw new Error('fixture_email_namespace_invalid');
    if (!principal.email.endsWith(`@${FIXTURE_EMAIL_DOMAIN}`)) throw new Error('fixture_email_domain_invalid');
    if (principal.user_metadata?.smart_parrot_preview_fixture !== true
      || principal.user_metadata?.smart_parrot_preview_run_id !== plan.run_id
      || principal.user_metadata?.smart_parrot_preview_role !== principal.role
      || principal.user_metadata?.data_class !== 'synthetic') {
      throw new Error('fixture_metadata_invalid');
    }
  }
  return plan;
}

export function assertPreviewFixtureProvisioningAllowed({ plan, writeGate, secretKey, nowMs = Date.now() } = {}) {
  assertFixturePlan(plan, nowMs);
  if (String(writeGate ?? '') !== '1') throw new Error('preview_fixture_write_gate_closed');
  const key = text(secretKey);
  if (!key.startsWith('sb_secret_')) throw new Error('preview_supabase_secret_key_required');
  return Object.freeze({ allowed: true, preview_project_verified: true, synthetic_only: true });
}

function identityMatches(user, principal, runId) {
  return Boolean(user)
    && text(user.id) === principal.id
    && text(user.email).toLowerCase() === principal.email
    && user.user_metadata?.smart_parrot_preview_fixture === true
    && user.user_metadata?.smart_parrot_preview_run_id === runId
    && user.user_metadata?.smart_parrot_preview_role === principal.role
    && user.user_metadata?.data_class === 'synthetic';
}

function isNotFound(error) {
  return Number(error?.status) === 404
    || error?.code === 'user_not_found'
    || /user.*not.*found/i.test(text(error?.message));
}

function generatedPassword() {
  return `${randomBytes(32).toString('base64url')}!aA7`;
}

async function cleanupCreatedUsers(authAdmin, createdPrincipals) {
  const failures = [];
  for (const principal of [...createdPrincipals].reverse()) {
    try {
      const result = await authAdmin.deleteUser(principal.id);
      if (result?.error) throw result.error;
    } catch (error) {
      failures.push({ role: principal.role, error });
    }
  }
  return failures;
}

export async function provisionPreviewFixturePrincipals({
  plan,
  writeGate,
  secretKey,
  authAdmin,
  profileStore,
  nowMs = Date.now(),
  passwordFactory = generatedPassword,
} = {}) {
  assertPreviewFixtureProvisioningAllowed({ plan, writeGate, secretKey, nowMs });
  if (!authAdmin?.getUserById || !authAdmin?.createUser || !authAdmin?.deleteUser) throw new Error('fixture_auth_admin_adapter_required');
  if (!profileStore?.setRole || !profileStore?.getRole) throw new Error('fixture_profile_store_adapter_required');

  const created = [];
  let reusedCount = 0;
  try {
    for (const principal of plan.principals) {
      const lookup = await authAdmin.getUserById(principal.id);
      let user = lookup?.data?.user ?? null;
      if (lookup?.error && !isNotFound(lookup.error)) throw lookup.error;

      if (user) {
        if (!identityMatches(user, principal, plan.run_id)) throw new Error(`fixture_identity_collision:${principal.role}`);
        reusedCount += 1;
      } else {
        const password = text(passwordFactory(principal.role));
        if (password.length < 24) throw new Error('fixture_runtime_password_too_short');
        const creation = await authAdmin.createUser({
          id: principal.id,
          email: principal.email,
          password,
          email_confirm: true,
          user_metadata: principal.user_metadata,
        });
        if (creation?.error) throw creation.error;
        user = creation?.data?.user ?? null;
        if (!identityMatches(user, principal, plan.run_id)) throw new Error(`fixture_created_identity_mismatch:${principal.role}`);
        created.push(principal);
      }

      const roleWrite = await profileStore.setRole(principal.id, principal.role);
      if (roleWrite?.error) throw roleWrite.error;
      const roleRead = await profileStore.getRole(principal.id);
      if (roleRead?.error) throw roleRead.error;
      if (roleRead?.role !== principal.role) throw new Error(`fixture_role_verification_failed:${principal.role}`);
    }
  } catch (error) {
    const cleanupFailures = await cleanupCreatedUsers(authAdmin, created);
    if (cleanupFailures.length) {
      const ambiguous = new Error(`fixture_provisioning_failed_cleanup_ambiguous:${text(error?.message) || 'unknown'}`);
      ambiguous.cause = error;
      ambiguous.cleanup_failures = cleanupFailures.map(({ role }) => role);
      throw ambiguous;
    }
    throw error;
  }

  return Object.freeze({
    schema_version: 1,
    status: 'fixture_principals_ready',
    run_id: plan.run_id,
    principal_count: plan.principals.length,
    roles: Object.freeze([...FIXTURE_ROLES]),
    created_count: created.length,
    reused_count: reusedCount,
    expires_at: plan.expires_at,
    synthetic_only: true,
    credentials_exposed: false,
    provider_writes_enabled: false,
  });
}

function evidenceCount(value) {
  const count = Number(value ?? 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function protectedLinkage(probe = {}) {
  return evidenceCount(probe.booking_count)
    + evidenceCount(probe.consent_count)
    + evidenceCount(probe.stripe_link_count)
    + evidenceCount(probe.audit_reference_count) > 0;
}

export async function cleanupPreviewFixturePrincipals({ plan, authAdmin, linkageProbe } = {}) {
  assertFixturePlan(plan, 0);
  if (!authAdmin?.getUserById || !authAdmin?.deleteUser) throw new Error('fixture_auth_admin_adapter_required');
  if (typeof linkageProbe !== 'function') throw new Error('fixture_linkage_probe_required');

  let deleted = 0;
  let alreadyAbsent = 0;
  let preserved = 0;
  const failures = [];

  for (const principal of [...plan.principals].reverse()) {
    const linkage = await linkageProbe(principal.id);
    if (protectedLinkage(linkage)) {
      preserved += 1;
      continue;
    }

    const lookup = await authAdmin.getUserById(principal.id);
    if (lookup?.error && !isNotFound(lookup.error)) {
      failures.push(principal.role);
      continue;
    }
    const user = lookup?.data?.user ?? null;
    if (!user) {
      alreadyAbsent += 1;
      continue;
    }
    if (!identityMatches(user, principal, plan.run_id)) throw new Error(`fixture_cleanup_identity_collision:${principal.role}`);

    const result = await authAdmin.deleteUser(principal.id);
    if (result?.error) failures.push(principal.role);
    else deleted += 1;
  }

  const ambiguous = failures.length > 0;
  return Object.freeze({
    schema_version: 1,
    status: ambiguous
      ? 'fixture_cleanup_ambiguous'
      : preserved
        ? 'fixture_cleanup_preserved_by_evidence'
        : 'fixture_cleanup_complete',
    run_id: plan.run_id,
    deleted_count: deleted,
    already_absent_count: alreadyAbsent,
    preserved_by_evidence_count: preserved,
    cleanup_failure_count: failures.length,
    reconciliation_required: ambiguous,
    append_only_evidence_preserved: true,
    credentials_exposed: false,
  });
}

export function buildBoundedSignedProviderRehearsalPreparation({
  plan,
  fixtureSummary,
  stripeWebhookProof,
  dailyWebhookProof,
  nowMs = Date.now(),
} = {}) {
  assertFixturePlan(plan, nowMs);
  if (fixtureSummary?.status !== 'fixture_principals_ready' || fixtureSummary?.run_id !== plan.run_id) {
    throw new Error('fixture_principals_not_ready');
  }

  const checks = Object.freeze({
    synthetic_fixture_principals: Object.freeze({ ready: fixtureSummary.synthetic_only === true, status: fixtureSummary.synthetic_only === true ? 'ready' : 'synthetic_fixture_required' }),
    stripe_checkout_signed_test_delivery: Object.freeze({ ready: stripeWebhookProof?.checkout_recent === true, status: stripeWebhookProof?.checkout_recent === true ? 'ready' : 'stripe_checkout_signed_test_delivery_required' }),
    stripe_dispute_signed_test_delivery: Object.freeze({ ready: stripeWebhookProof?.dispute_recent === true, status: stripeWebhookProof?.dispute_recent === true ? 'ready' : 'stripe_dispute_signed_test_delivery_required' }),
    daily_signed_test_delivery: Object.freeze({ ready: dailyWebhookProof?.signed_test_verified === true, status: dailyWebhookProof?.signed_test_verified === true ? 'ready' : 'daily_signed_test_delivery_required' }),
    daily_webhook_active: Object.freeze({ ready: dailyWebhookProof?.state === 'ACTIVE', status: dailyWebhookProof?.state === 'ACTIVE' ? 'ready' : 'daily_webhook_active_required' }),
  });
  const blockers = Object.entries(checks).filter(([, value]) => !value.ready).map(([name]) => name);

  return Object.freeze({
    schema_version: 1,
    status: blockers.length ? 'blocked' : 'ready',
    run_id: plan.run_id,
    test_only: true,
    synthetic_fixtures_only: true,
    signed_provider_proof_required: true,
    checks,
    blockers: Object.freeze(blockers),
    provider_writes_enabled: false,
    requires_explicit_full_preview_write_gate: true,
    credentials_exposed: false,
  });
}
