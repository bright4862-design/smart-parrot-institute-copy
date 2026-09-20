// Safe preview integration probe. It never creates a booking or provider object.
// Provider-write E2E remains disabled until an operator explicitly supplies the
// gate plus a preview admin session and the server-side readiness endpoint is green.

const PREVIEW_FLOW = [
  'authenticated_reservation',
  'stripe_test_checkout_or_setup',
  'test_hold_or_saved_card_recovery',
  'server_or_daily_attendance_evidence',
  'deterministic_test_settlement_or_cancellation',
  'append_only_ledger_and_evidence_review',
];

if (process.env.SMART_PARROT_PREVIEW_E2E !== '1') {
  console.log(`Preview provider execution disabled. Contract: ${PREVIEW_FLOW.join(' -> ')}`);
  process.exit(0);
}

const url = String(process.env.VITE_SUPABASE_URL || '').trim();
const publishableKey = String(process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
const adminAccessToken = String(process.env.SMART_PARROT_PREVIEW_ADMIN_ACCESS_TOKEN || '').trim();
const expectedProjectRef = String(process.env.SMART_PARROT_PREVIEW_PROJECT_REF || '').trim();
const productionProjectRef = String(process.env.SMART_PARROT_PRODUCTION_PROJECT_REF || '').trim();

if (!/^[a-z0-9]{15,40}$/.test(expectedProjectRef)) {
  throw new Error('SMART_PARROT_PREVIEW_PROJECT_REF must explicitly identify the approved preview Supabase project.');
}
if (productionProjectRef && expectedProjectRef === productionProjectRef) {
  throw new Error('Preview E2E refuses a project ref explicitly marked as production.');
}

let parsed;
try { parsed = new URL(url); } catch { throw new Error('A valid preview VITE_SUPABASE_URL is required.'); }
if (parsed.protocol !== 'https:' || parsed.hostname !== `${expectedProjectRef}.supabase.co`) {
  throw new Error('Preview E2E URL must exactly match SMART_PARROT_PREVIEW_PROJECT_REF on supabase.co.');
}
if (!publishableKey.startsWith('sb_publishable_')) throw new Error('A Supabase publishable key is required.');
if (!adminAccessToken || adminAccessToken.split('.').length !== 3) throw new Error('A short-lived preview admin access token is required.');

const readinessResponse = await fetch(`${url.replace(/\/$/,'')}/functions/v1/booking-preview-readiness`, {
  method: 'POST',
  headers: {
    apikey: publishableKey,
    authorization: `Bearer ${adminAccessToken}`,
    'content-type': 'application/json',
  },
  body: '{}',
});

if (!readinessResponse.ok) throw new Error(`Preview readiness probe failed with HTTP ${readinessResponse.status}.`);
const readiness = await readinessResponse.json();
if (readiness?.status !== 'ready') {
  throw new Error(`Preview is not ready: ${(readiness?.blockers || []).join(', ') || readiness?.status || 'unknown'}`);
}
if (readiness?.checks?.preview_project_identity?.ready !== true) {
  throw new Error('Server-side preview project identity is not verified.');
}
if (!Array.isArray(readiness.preview_flow) || PREVIEW_FLOW.some((step) => !readiness.preview_flow.includes(step))) {
  throw new Error('Preview readiness flow contract mismatch.');
}

console.log('Preview identity/readiness gate passed. Provider-write E2E remains intentionally separate and disabled by this probe.');
