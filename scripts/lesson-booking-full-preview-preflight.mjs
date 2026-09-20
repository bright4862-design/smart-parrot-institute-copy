// Read-only full-path preview preflight. This script never creates a booking,
// Stripe object, Daily room, payment authorization, attendance event, settlement,
// email, deployment, or publication. It is inert unless explicitly enabled.
if (process.env.SMART_PARROT_FULL_PREVIEW_PREFLIGHT !== '1') {
  console.log('Full lesson-booking preview preflight disabled.');
  process.exit(0);
}

const supabaseUrl = String(process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
const publishableKey = String(process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
const adminToken = String(process.env.SMART_PARROT_PREVIEW_ADMIN_ACCESS_TOKEN || '').trim();
const previewRef = String(process.env.SMART_PARROT_PREVIEW_PROJECT_REF || '').trim();
const productionRef = String(process.env.SMART_PARROT_PRODUCTION_PROJECT_REF || '').trim();
const stripeKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
const expectedStripeAccount = String(process.env.SMART_PARROT_STRIPE_TEST_ACCOUNT_ID || '').trim();
const dailyKey = String(process.env.DAILY_API_KEY || '').trim();
const dailyWebhookId = String(process.env.SMART_PARROT_DAILY_PREVIEW_WEBHOOK_ID || '').trim();
const dailyDomainId = String(process.env.SMART_PARROT_DAILY_PREVIEW_DOMAIN_ID || '').trim();

const FULL_PREVIEW_PLAN = Object.freeze([
  { stage: 'booking_reservation', authority: 'supabase', write_enabled: false },
  { stage: 'stripe_test_authorization', authority: 'server', write_enabled: false },
  { stage: 'daily_attendance', authority: 'signed_provider_or_server_checkin', write_enabled: false },
  { stage: 'deterministic_settlement', authority: 'supabase_worker', write_enabled: false },
  { stage: 'terminal_evidence_reconciliation', authority: 'supabase', write_enabled: false },
]);

if (!/^[a-z0-9]{15,40}$/.test(previewRef)) throw new Error('Approved preview Supabase project ref is required.');
if (productionRef && previewRef === productionRef) throw new Error('Full preview preflight refuses a project marked as production.');
if (supabaseUrl !== `https://${previewRef}.supabase.co`) throw new Error('Supabase URL must exactly match the approved preview project.');
if (!publishableKey.startsWith('sb_publishable_')) throw new Error('Preview Supabase publishable key is required.');
if (!adminToken || adminToken.split('.').length !== 3) throw new Error('Short-lived preview admin access token is required.');
if (!stripeKey.startsWith('sk_test_')) throw new Error('Full preview preflight accepts Stripe test keys only.');
if (!/^acct_[A-Za-z0-9]{8,80}$/.test(expectedStripeAccount)) throw new Error('Expected Stripe test account ID is required.');
if (dailyKey.length < 16) throw new Error('Daily preview API key is required.');
if (!dailyWebhookId || dailyWebhookId.length < 8) throw new Error('Daily preview webhook ID is required.');
if (!dailyDomainId || dailyDomainId.length < 8) throw new Error('Daily preview domain ID is required.');

async function jsonRequest(url, init, label) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}.`);
  return response.json();
}

const supabaseHeaders = {
  apikey: publishableKey,
  authorization: `Bearer ${adminToken}`,
  'content-type': 'application/json',
};

async function edgeReadiness(functionName) {
  return jsonRequest(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: supabaseHeaders,
    body: '{}',
  }, functionName);
}

const rehearsalReadiness = await jsonRequest(`${supabaseUrl}/rest/v1/rpc/admin_provider_rehearsal_readiness`, {
  method: 'POST',
  headers: supabaseHeaders,
  body: '{}',
}, 'provider rehearsal readiness');
if (rehearsalReadiness?.status !== 'ready' || rehearsalReadiness?.ready !== true || Number(rehearsalReadiness?.unresolved_cleanup_failures || 0) !== 0) {
  throw new Error(`Provider rehearsal readiness is blocked: ${(rehearsalReadiness?.blockers || []).join(', ') || 'unknown'}.`);
}

const baseReadiness = await edgeReadiness('booking-preview-readiness');
if (baseReadiness?.status !== 'ready' || baseReadiness?.checks?.preview_project_identity?.ready !== true) {
  throw new Error(`Base preview readiness is blocked: ${(baseReadiness?.blockers || []).join(', ') || 'unknown'}.`);
}
const providerReadiness = await edgeReadiness('booking-provider-preview-readiness');
if (providerReadiness?.status !== 'ready') {
  throw new Error(`Provider preview readiness is blocked: ${(providerReadiness?.blockers || []).join(', ') || 'unknown'}.`);
}

const stripeAccount = await jsonRequest('https://api.stripe.com/v1/account', {
  headers: { authorization: `Bearer ${stripeKey}` },
}, 'Stripe test account identity');
if (stripeAccount?.object !== 'account' || stripeAccount?.id !== expectedStripeAccount) {
  throw new Error('Stripe test account identity mismatch.');
}

const dailyWebhookRaw = await jsonRequest(`https://api.daily.co/v1/webhooks/${encodeURIComponent(dailyWebhookId)}`, {
  headers: { authorization: `Bearer ${dailyKey}` },
}, 'Daily preview webhook identity');
const dailyWebhook = Array.isArray(dailyWebhookRaw) ? dailyWebhookRaw[0] : dailyWebhookRaw;
if (dailyWebhook?.uuid !== dailyWebhookId || dailyWebhook?.domainId !== dailyDomainId) {
  throw new Error('Daily preview webhook/domain identity mismatch.');
}
if (dailyWebhook?.state === 'FAILED' || dailyWebhook?.state === 'INACTIVE') {
  throw new Error('Daily preview webhook is not active.');
}

console.log(JSON.stringify({
  status: 'preflight_ready',
  provider_rehearsal_ready: true,
  preview_project_ready: true,
  provider_identity_ready: true,
  provider_writes_enabled: false,
  plan: FULL_PREVIEW_PLAN,
}, null, 2));
