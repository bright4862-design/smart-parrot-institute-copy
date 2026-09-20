import { APPROVED_SMART_PARROT_PREVIEW } from './lesson-booking-full-preview-supabase-transport.mjs';

const ACCOUNT_ID_RE = /^acct_[A-Za-z0-9]{8,80}$/;
const SAFE_DAILY_ROOM_PREFIX_RE = /^sp-preview-[a-z0-9-]{3,48}$/;
const SAFE_DAILY_DOMAIN_RE = /^[a-z0-9][a-z0-9-]{2,62}$/;
const WEBHOOK_SECRET_RE = /^whsec_[A-Za-z0-9_-]{8,}$/;

function text(value) {
  return String(value ?? '').trim();
}

function check(ready, status) {
  return Object.freeze({ ready: Boolean(ready), status });
}

function decodeJwtClaims(token, label) {
  const value = text(token);
  const parts = value.split('.');
  if (parts.length !== 3 || value.startsWith('sb_')) throw new Error(`${label}_jwt_required`);
  let payload;
  try {
    const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=');
    payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    throw new Error(`${label}_jwt_required`);
  }
  return { token: value, claims: payload };
}

function sessionCheck(token, label, nowMs) {
  if (!text(token)) return { check: check(false, `${label}_missing`), claims: null, raw: null };
  let parsed;
  try {
    parsed = decodeJwtClaims(token, label);
  } catch {
    return { check: check(false, `${label}_invalid`), claims: null, raw: null };
  }

  const expMs = Number(parsed.claims?.exp) * 1000;
  const iatMs = Number(parsed.claims?.iat) * 1000;
  if (!Number.isFinite(expMs) || expMs <= nowMs + 60_000) {
    return { check: check(false, `${label}_expired_or_expiring`), claims: parsed.claims, raw: parsed.token };
  }
  if (Number.isFinite(iatMs) && iatMs > nowMs + 5 * 60_000) {
    return { check: check(false, `${label}_issued_in_future`), claims: parsed.claims, raw: parsed.token };
  }
  if (Number.isFinite(iatMs) && expMs - iatMs > 2 * 60 * 60_000) {
    return { check: check(false, `${label}_not_short_lived`), claims: parsed.claims, raw: parsed.token };
  }
  if (!text(parsed.claims?.sub)) {
    return { check: check(false, `${label}_subject_required`), claims: parsed.claims, raw: parsed.token };
  }
  return { check: check(true, 'ready'), claims: parsed.claims, raw: parsed.token };
}

function safeDailyRoomPrefix(value) {
  const candidate = text(value);
  return SAFE_DAILY_ROOM_PREFIX_RE.test(candidate)
    && !/(^|-)(prod|production|live)(-|$)/.test(candidate);
}

function safeDailyDomainName(value) {
  const candidate = text(value);
  return SAFE_DAILY_DOMAIN_RE.test(candidate)
    && !/(^|-)(prod|production|live)(-|$)/.test(candidate);
}

function validBase64Secret(value) {
  const candidate = text(value);
  if (candidate.length < 24 || candidate.length % 4 !== 0) return false;
  try {
    return Buffer.from(candidate, 'base64').length >= 16;
  } catch {
    return false;
  }
}

function httpsUrlCheck(value, label, exactHost = null) {
  const candidate = text(value);
  if (!candidate) return check(false, `${label}_missing`);
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:') return check(false, `${label}_https_required`);
    if (exactHost && url.hostname !== exactHost) return check(false, `${label}_host_mismatch`);
    return check(true, 'ready');
  } catch {
    return check(false, `${label}_invalid`);
  }
}

export function buildFullPreviewReadinessManifest(input = {}, { nowMs = Date.now() } = {}) {
  const previewRef = text(input.previewRef || APPROVED_SMART_PARROT_PREVIEW.projectRef);
  const supabaseUrl = text(input.supabaseUrl || APPROVED_SMART_PARROT_PREVIEW.supabaseUrl).replace(/\/$/, '');

  const previewIdentity = previewRef === APPROVED_SMART_PARROT_PREVIEW.projectRef
    && supabaseUrl === APPROVED_SMART_PARROT_PREVIEW.supabaseUrl
    ? check(true, 'ready')
    : check(false, 'approved_preview_identity_required');

  const publishableKey = text(input.publishableKey);
  const secretKey = text(input.secretKey);
  const publishable = publishableKey.startsWith('sb_publishable_')
    ? check(true, 'ready')
    : check(false, publishableKey ? 'supabase_publishable_key_class_mismatch' : 'supabase_publishable_key_missing');
  const backendSecret = secretKey.startsWith('sb_secret_')
    ? check(true, 'ready')
    : check(false, secretKey ? 'supabase_secret_key_class_mismatch' : 'supabase_secret_key_missing');

  const student = sessionCheck(input.studentAccessToken, 'student_session', nowMs);
  const admin = sessionCheck(input.adminAccessToken, 'admin_session', nowMs);
  let distinctSessions = check(true, 'ready');
  if (student.raw && admin.raw) {
    if (student.raw === admin.raw || student.claims?.sub === admin.claims?.sub) {
      distinctSessions = check(false, 'student_admin_sessions_must_be_distinct');
    }
  } else {
    distinctSessions = check(false, 'student_admin_sessions_unavailable');
  }

  const stripeKey = text(input.stripeSecretKey);
  if (stripeKey.startsWith('sk_live_')) throw new Error('live_stripe_key_refused');
  const stripeSecret = stripeKey.startsWith('sk_test_')
    ? check(true, 'ready')
    : check(false, stripeKey ? 'stripe_test_key_required' : 'stripe_test_key_missing');
  const stripeAccount = ACCOUNT_ID_RE.test(text(input.stripeTestAccountId))
    ? check(true, 'ready')
    : check(false, 'stripe_test_account_required');
  const stripeCheckoutWebhook = WEBHOOK_SECRET_RE.test(text(input.stripeWebhookSecret))
    ? check(true, 'ready')
    : check(false, 'stripe_checkout_webhook_secret_required');
  const stripeDisputeWebhook = WEBHOOK_SECRET_RE.test(text(input.stripeDisputeWebhookSecret))
    ? check(true, 'ready')
    : check(false, 'stripe_dispute_webhook_secret_required');

  const dailyApi = text(input.dailyApiKey).length >= 16
    ? check(true, 'ready')
    : check(false, 'daily_api_key_missing');
  const dailyWebhook = text(input.dailyWebhookId).length >= 8
    ? check(true, 'ready')
    : check(false, 'daily_preview_webhook_id_required');
  const dailyDomainId = text(input.dailyDomainId).length >= 8
    ? check(true, 'ready')
    : check(false, 'daily_preview_domain_id_required');
  const dailyDomain = safeDailyDomainName(input.dailyDomainName)
    ? check(true, 'ready')
    : check(false, 'daily_preview_domain_name_required');
  const dailyRoomPrefix = safeDailyRoomPrefix(input.dailyRoomPrefix)
    ? check(true, 'ready')
    : check(false, 'safe_daily_room_prefix_required');
  const dailyWebhookHmac = validBase64Secret(input.dailyWebhookHmac)
    ? check(true, 'ready')
    : check(false, 'daily_webhook_hmac_required');

  const appUrl = httpsUrlCheck(input.appUrl, 'app_url', 'asmartparrot.com');
  const termsUrl = httpsUrlCheck(input.termsUrl, 'terms_url');
  const providerGate = String(input.providerE2eEnabled ?? '') === '1'
    ? check(true, 'ready')
    : check(false, 'provider_e2e_disabled');
  const providerRehearsal = input.rehearsalReady === true
    ? check(true, 'ready')
    : check(false, 'provider_rehearsal_not_ready');
  const providerCleanup = input.providerCleanupState === 'clear'
    ? check(true, 'ready')
    : check(false, input.providerCleanupState === 'ambiguous'
      ? 'provider_cleanup_ambiguous'
      : 'provider_cleanup_unresolved');

  const checks = Object.freeze({
    preview_project_identity: previewIdentity,
    supabase_publishable_key: publishable,
    student_session: student.check,
    admin_session: admin.check,
    distinct_student_admin_sessions: distinctSessions,
    supabase_backend_secret_key: backendSecret,
    provider_e2e_gate: providerGate,
    provider_rehearsal_readiness: providerRehearsal,
    provider_cleanup_state: providerCleanup,
    stripe_test_secret_key: stripeSecret,
    stripe_test_account_identity: stripeAccount,
    stripe_checkout_webhook_secret: stripeCheckoutWebhook,
    stripe_dispute_webhook_secret: stripeDisputeWebhook,
    daily_api_key: dailyApi,
    daily_preview_webhook_id: dailyWebhook,
    daily_preview_domain_id: dailyDomainId,
    daily_preview_domain_name: dailyDomain,
    daily_preview_room_prefix: dailyRoomPrefix,
    daily_webhook_hmac: dailyWebhookHmac,
    app_url: appUrl,
    terms_url: termsUrl,
  });

  const transportNames = [
    'preview_project_identity',
    'supabase_publishable_key',
    'student_session',
    'admin_session',
    'distinct_student_admin_sessions',
    'supabase_backend_secret_key',
  ];
  const providerNames = [
    'provider_e2e_gate',
    'provider_rehearsal_readiness',
    'provider_cleanup_state',
    'stripe_test_secret_key',
    'stripe_test_account_identity',
    'stripe_checkout_webhook_secret',
    'stripe_dispute_webhook_secret',
    'daily_api_key',
    'daily_preview_webhook_id',
    'daily_preview_domain_id',
    'daily_preview_domain_name',
    'daily_preview_room_prefix',
    'daily_webhook_hmac',
    'app_url',
    'terms_url',
  ];

  const blockers = Object.entries(checks)
    .filter(([, value]) => !value.ready)
    .map(([name]) => name);
  const transportReady = transportNames.every((name) => checks[name].ready);
  const providerWriteReady = transportReady && providerNames.every((name) => checks[name].ready);

  return Object.freeze({
    schema_version: 1,
    status: blockers.length ? 'blocked' : 'ready',
    transport_ready: transportReady,
    provider_write_ready: providerWriteReady,
    session_validation: 'shape_expiry_and_subject_only_authoritative_endpoints_still_verify',
    checks,
    blockers: Object.freeze(blockers),
    secrets_exposed: false,
  });
}

export function assertFullPreviewTransportReady(manifest) {
  if (!manifest || manifest.schema_version !== 1 || manifest.transport_ready !== true) {
    throw new Error('full_preview_transport_not_ready');
  }
  return manifest;
}

export function assertFullPreviewProviderWritesReady(manifest) {
  assertFullPreviewTransportReady(manifest);
  if (manifest.provider_write_ready !== true) throw new Error('full_preview_provider_writes_not_ready');
  return manifest;
}
