export const APPROVED_SMART_PARROT_PREVIEW = Object.freeze({
  projectRef: 'mrzzbhqzxshtbqvxkcjn',
  supabaseUrl: 'https://mrzzbhqzxshtbqvxkcjn.supabase.co',
});

const OPERATION_AUTH = Object.freeze({
  'create-booking': 'student_user',
  'fix-payment': 'student_user',
  'place-holds': 'secret_worker',
  'settle-lessons': 'secret_worker',
  'admin_observe_booking_preview_run': 'admin_rpc',
  'admin_reconcile_booking_provider_rehearsal_cleanup': 'admin_rpc',
  'admin_begin_booking_full_preview_run': 'admin_rpc',
  'admin_bind_booking_full_preview_run': 'admin_rpc',
  'admin_refresh_booking_full_preview_run': 'admin_rpc',
});

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

  async function invokeEdgeFunction(target, payload, auth) {
    const headers = { 'content-type': 'application/json' };
    if (auth === 'student_user') {
      headers.apikey = assertPublishableKey(publishableKey);
      headers.authorization = `Bearer ${required(studentAccessToken, 'student_access_token')}`;
    } else if (auth === 'secret_worker') {
      headers.apikey = assertSecretKey(secretKey);
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

  async function invokeRpc(target, payload) {
    const response = await fetchImpl(`${identity.url}/rest/v1/rpc/${target}`, {
      method: 'POST',
      headers: {
        apikey: assertPublishableKey(publishableKey),
        authorization: `Bearer ${required(adminAccessToken, 'admin_access_token')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload ?? {}),
    });
    return decodeResponse(response);
  }

  return Object.freeze({
    identity: Object.freeze({ project_ref: identity.ref, supabase_url: identity.url }),
    async invokeServer(call) {
      if (!call || typeof call !== 'object') throw new Error('invalid_preview_transport_call');
      const target = required(call.target, 'preview_target');
      const expectedAuth = OPERATION_AUTH[target];
      if (!expectedAuth) throw new Error(`unsupported_preview_target:${target}`);
      if (call.auth !== expectedAuth) throw new Error(`preview_auth_class_mismatch:${target}`);

      if (expectedAuth === 'admin_rpc') return invokeRpc(target, call.payload);
      return invokeEdgeFunction(target, call.payload, expectedAuth);
    },
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Approved Smart Parrot preview Supabase transport is a library contract; no network request was executed.');
}
