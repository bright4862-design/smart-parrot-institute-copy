export const APPROVED_SMART_PARROT_PREVIEW = Object.freeze({
  projectRef: 'mrzzbhqzxshtbqvxkcjn',
  supabaseUrl: 'https://mrzzbhqzxshtbqvxkcjn.supabase.co',
});

const OPERATION_AUTH = Object.freeze({
  'create-booking': 'student_user',
  'fix-payment': 'student_user',
  'place-holds': 'secret_worker',
  'settle-lessons': 'secret_worker',
  'booking-preview-readiness': 'admin_user',
  'booking-provider-preview-readiness': 'admin_user',
  'admin_provider_rehearsal_readiness': 'admin_rpc',
  'admin_booking_webhook_readiness_proof': 'admin_rpc',
  'admin_get_booking_full_preview_run': 'admin_rpc',
  'admin_observe_booking_preview_run': 'admin_rpc',
  'admin_reconcile_booking_provider_rehearsal_cleanup': 'admin_rpc',
  'admin_begin_booking_full_preview_run': 'admin_rpc',
  'admin_bind_booking_full_preview_run': 'admin_rpc',
  'admin_refresh_booking_full_preview_run': 'admin_rpc',
  'admin_record_booking_full_preview_terminal_evidence': 'admin_rpc',
  'admin_record_booking_full_preview_retention_review': 'admin_rpc',
  'admin_booking_full_preview_cleanup_review_queue': 'admin_rpc',
  'admin_prepare_booking_full_preview_cleanup_review_plan': 'admin_rpc',
  'admin_renew_booking_full_preview_cleanup_review_plan': 'admin_rpc',
  'admin_revoke_booking_full_preview_cleanup_review_plan': 'admin_rpc',
  'admin_prepare_booking_full_preview_cleanup_execution_manifest_preview': 'admin_rpc',
  'service_attest_booking_full_preview_cleanup_execution_manifest': 'service_rpc',
  'service_record_booking_preview_launch_blocker_snapshot': 'service_rpc',
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROFILE_ROLES = new Set(['student', 'tutor', 'admin']);

function required(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label}_required`);
  return normalized;
}

function assertPreviewIdentity({ previewRef, supabaseUrl }) {
  const ref = required(previewRef, 'preview_project_ref');
  const url = required(supabaseUrl, 'supabase_url').replace(/\/$/, '');
  if (ref !== APPROVED_SMART_PARROT_PREVIEW.projectRef) {
    throw new Error('unapproved_preview_project_ref');
  }
  if (url !== APPROVED_SMART_PARROT_PREVIEW.supabaseUrl) {
    throw new Error('unapproved_preview_supabase_url');
  }
  return { ref, url };
}

function assertPublishableKey(value) {
  const key = required(value, 'supabase_publishable_key');
  if (!key.startsWith('sb_publishable_')) throw new Error('supabase_publishable_key_required');
  return key;
}

function assertSecretKey(value) {
  const key = required(value, 'supabase_secret_key');
  if (!key.startsWith('sb_secret_')) throw new Error('supabase_secret_key_required');
  return key;
}

async function decodeResponse(response) {
  const contentType = response.headers?.get?.('content-type') ?? '';
  let body = null;
  if (contentType.includes('application/json')) {
    body = await response.json();
  } else {
    const text = await response.text();
    body = text ? { message: text.slice(0, 500) } : null;
  }
  if (!response.ok) {
    const error = new Error(`preview_supabase_request_failed:${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

export function createApprovedPreviewSupabaseTransport({
  previewRef = APPROVED_SMART_PARROT_PREVIEW.projectRef,
  supabaseUrl = APPROVED_SMART_PARROT_PREVIEW.supabaseUrl,
  publishableKey,
  studentAccessToken,
  adminAccessToken,
  secretKey,
  fetchImpl = globalThis.fetch,
} = {}) {
  const identity = assertPreviewIdentity({ previewRef, supabaseUrl });
  if (typeof fetchImpl !== 'function') throw new Error('preview_fetch_transport_required');

  function userHeaders(accessToken, label) {
    return {
      apikey: assertPublishableKey(publishableKey),
      authorization: `Bearer ${required(accessToken, label)}`,
      'content-type': 'application/json',
    };
  }

  function serviceHeaders() {
    return {
      // Modern sb_secret_* keys identify the backend component through the apikey
      // header. They are not JWTs, so never mirror them into Authorization: Bearer.
      apikey: assertSecretKey(secretKey),
      'content-type': 'application/json',
    };
  }

  async function invokeEdgeFunction(target, payload, auth) {
    let headers;
    if (auth === 'student_user') {
      headers = userHeaders(studentAccessToken, 'student_access_token');
    } else if (auth === 'admin_user') {
      headers = userHeaders(adminAccessToken, 'admin_access_token');
    } else if (auth === 'secret_worker') {
      headers = {
        apikey: assertSecretKey(secretKey),
        'content-type': 'application/json',
      };
    } else {
      throw new Error(`unsupported_preview_edge_auth:${auth}`);
    }
    const response = await fetchImpl(`${identity.url}/functions/v1/${target}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload ?? {}),
    });
    return decodeResponse(response);
  }

  async function invokeAdminRpc(target, payload) {
    const response = await fetchImpl(`${identity.url}/rest/v1/rpc/${target}`, {
      method: 'POST',
      headers: userHeaders(adminAccessToken, 'admin_access_token'),
      body: JSON.stringify(payload ?? {}),
    });
    return decodeResponse(response);
  }

  async function invokeServiceRpc(target, payload) {
    const response = await fetchImpl(`${identity.url}/rest/v1/rpc/${target}`, {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify(payload ?? {}),
    });
    return decodeResponse(response);
  }

  async function probeUserSession(authClass) {
    let token;
    let label;
    if (authClass === 'student_user') {
      token = studentAccessToken;
      label = 'student_access_token';
    } else if (authClass === 'admin_user') {
      token = adminAccessToken;
      label = 'admin_access_token';
    } else {
      throw new Error(`unsupported_preview_session_probe:${authClass}`);
    }

    const headers = userHeaders(token, label);
    const user = await decodeResponse(await fetchImpl(`${identity.url}/auth/v1/user`, {
      method: 'GET',
      headers,
    }));
    const subject = required(user?.id, `${authClass}_subject`);
    if (!UUID_RE.test(subject)) throw new Error(`${authClass}_subject_invalid`);

    const profileUrl = new URL(`${identity.url}/rest/v1/profiles`);
    profileUrl.searchParams.set('select', 'id,role');
    profileUrl.searchParams.set('id', `eq.${subject}`);
    profileUrl.searchParams.set('limit', '1');
    const profiles = await decodeResponse(await fetchImpl(profileUrl.toString(), {
      method: 'GET',
      headers,
    }));
    if (!Array.isArray(profiles) || profiles.length !== 1 || profiles[0]?.id !== subject) {
      throw new Error(`${authClass}_profile_unavailable`);
    }
    const role = required(profiles[0]?.role, `${authClass}_profile_role`);
    if (!PROFILE_ROLES.has(role)) throw new Error(`${authClass}_profile_role_invalid`);

    return Object.freeze({ subject, role });
  }

  return Object.freeze({
    identity: Object.freeze({ project_ref: identity.ref, supabase_url: identity.url }),
    probeUserSession,
    async invokeServer(call) {
      if (!call || typeof call !== 'object') throw new Error('invalid_preview_transport_call');
      const target = required(call.target, 'preview_target');
      const expectedAuth = OPERATION_AUTH[target];
      if (!expectedAuth) throw new Error(`unsupported_preview_target:${target}`);
      if (call.auth !== expectedAuth) throw new Error(`preview_auth_class_mismatch:${target}`);

      if (expectedAuth === 'admin_rpc') return invokeAdminRpc(target, call.payload);
      if (expectedAuth === 'service_rpc') return invokeServiceRpc(target, call.payload);
      return invokeEdgeFunction(target, call.payload, expectedAuth);
    },
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Approved Smart Parrot preview Supabase transport is a library contract; no network request was executed.');
}