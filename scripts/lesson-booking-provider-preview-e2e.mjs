import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Provider-writing preview probe. It is inert unless two explicit local gates are
// set and both server-side readiness endpoints independently verify preview state.
if (process.env.SMART_PARROT_PROVIDER_PREVIEW_E2E !== '1') {
  console.log('Provider-write preview E2E disabled.');
  process.exit(0);
}
if (process.env.SMART_PARROT_PROVIDER_WRITES_CONFIRMED !== 'preview-only') {
  throw new Error('Provider writes require SMART_PARROT_PROVIDER_WRITES_CONFIRMED=preview-only.');
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
const dailyDomainName = String(process.env.SMART_PARROT_DAILY_PREVIEW_DOMAIN_NAME || '').trim();
const dailyRoomPrefix = String(process.env.SMART_PARROT_DAILY_PREVIEW_ROOM_PREFIX || '').trim();
const evidenceFile = String(process.env.SMART_PARROT_PROVIDER_EVIDENCE_FILE || 'artifacts/lesson-booking-provider-preview-e2e.json').trim();

if (!/^[a-z0-9]{15,40}$/.test(previewRef)) throw new Error('Approved preview Supabase project ref is required.');
if (productionRef && previewRef === productionRef) throw new Error('Provider preview E2E refuses a project marked as production.');
if (supabaseUrl !== `https://${previewRef}.supabase.co`) throw new Error('Supabase URL must exactly match the approved preview project.');
if (!publishableKey.startsWith('sb_publishable_')) throw new Error('Preview Supabase publishable key is required.');
if (!adminToken || adminToken.split('.').length !== 3) throw new Error('Short-lived preview admin access token is required.');
if (!stripeKey.startsWith('sk_test_')) throw new Error('Provider preview E2E accepts Stripe test keys only.');
if (!/^acct_[A-Za-z0-9]{8,80}$/.test(expectedStripeAccount)) throw new Error('Expected Stripe test account ID is required.');
if (dailyKey.length < 16) throw new Error('Daily preview API key is required.');
if (!dailyWebhookId || dailyWebhookId.length < 8) throw new Error('Daily preview webhook ID is required.');
if (!dailyDomainId || dailyDomainId.length < 8) throw new Error('Daily preview domain ID is required.');
if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(dailyDomainName) || /(^|-)(prod|production|live)(-|$)/.test(dailyDomainName)) {
  throw new Error('Daily preview domain name must be an explicitly non-production Daily subdomain.');
}
if (!/^sp-preview-[a-z0-9-]{3,48}$/.test(dailyRoomPrefix) || /(^|-)(prod|production|live)(-|$)/.test(dailyRoomPrefix)) {
  throw new Error('Daily room prefix must be an explicitly preview-only sp-preview-* namespace.');
}

async function jsonRequest(url, init, label) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}.`);
  return response.json();
}

async function supabaseReadiness(functionName) {
  return jsonRequest(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${adminToken}`,
      'content-type': 'application/json',
    },
    body: '{}',
  }, functionName);
}

const runId = crypto.randomUUID();
const startedAt = new Date().toISOString();
const roomSuffix = runId.replaceAll('-', '').slice(0, 20);
const roomName = `${dailyRoomPrefix}-${roomSuffix}`.slice(0, 96);
const evidence = {
  schema_version: 'smart_parrot_provider_preview_e2e_v1',
  run_id: runId,
  started_at: startedAt,
  preview_project_verified: false,
  stripe_account_verified: false,
  daily_webhook_domain_verified: false,
  stripe_customer: { id: null, created: false, deleted: false },
  daily_room: { name: roomName, created: false, deleted: false },
  cleanup_complete: false,
  failure: null,
};

let customerId = null;
let roomCreated = false;
let primaryFailure = null;

try {
  const baseReadiness = await supabaseReadiness('booking-preview-readiness');
  if (baseReadiness?.status !== 'ready' || baseReadiness?.checks?.preview_project_identity?.ready !== true) {
    throw new Error(`Base preview readiness is not ready: ${(baseReadiness?.blockers || []).join(', ') || 'unknown'}.`);
  }
  const providerReadiness = await supabaseReadiness('booking-provider-preview-readiness');
  if (providerReadiness?.status !== 'ready') {
    throw new Error(`Provider preview readiness is not ready: ${(providerReadiness?.blockers || []).join(', ') || 'unknown'}.`);
  }
  evidence.preview_project_verified = true;

  const stripeAccount = await jsonRequest('https://api.stripe.com/v1/account', {
    headers: { authorization: `Bearer ${stripeKey}` },
  }, 'Stripe account identity');
  if (stripeAccount?.object !== 'account' || stripeAccount?.id !== expectedStripeAccount) {
    throw new Error('Stripe test account identity mismatch.');
  }
  evidence.stripe_account_verified = true;

  const dailyWebhookRaw = await jsonRequest(`https://api.daily.co/v1/webhooks/${encodeURIComponent(dailyWebhookId)}`, {
    headers: { authorization: `Bearer ${dailyKey}` },
  }, 'Daily webhook identity');
  const dailyWebhook = Array.isArray(dailyWebhookRaw) ? dailyWebhookRaw[0] : dailyWebhookRaw;
  if (dailyWebhook?.uuid !== dailyWebhookId || dailyWebhook?.domainId !== dailyDomainId) {
    throw new Error('Daily preview webhook/domain identity mismatch.');
  }
  if (dailyWebhook?.state === 'FAILED' || dailyWebhook?.state === 'INACTIVE') {
    throw new Error('Daily preview webhook is not active.');
  }
  evidence.daily_webhook_domain_verified = true;

  const customerBody = new URLSearchParams();
  customerBody.set('description', 'Smart Parrot disposable preview E2E customer');
  customerBody.set('metadata[smart_parrot_preview_run]', runId);
  const customer = await jsonRequest('https://api.stripe.com/v1/customers', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${stripeKey}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: customerBody.toString(),
  }, 'Stripe disposable customer create');
  if (customer?.object !== 'customer' || customer?.livemode !== false || typeof customer?.id !== 'string' || !customer.id.startsWith('cus_')) {
    throw new Error('Stripe disposable customer integrity check failed.');
  }
  customerId = customer.id;
  evidence.stripe_customer.id = customerId;
  evidence.stripe_customer.created = true;

  const room = await jsonRequest('https://api.daily.co/v1/rooms', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${dailyKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name: roomName,
      privacy: 'private',
      properties: {
        exp: Math.floor(Date.now() / 1000) + 15 * 60,
        eject_at_room_exp: true,
      },
    }),
  }, 'Daily disposable room create');
  if (room?.name !== roomName || room?.privacy !== 'private') throw new Error('Daily disposable room integrity check failed.');
  const roomUrl = new URL(String(room?.url || ''));
  if (roomUrl.protocol !== 'https:' || roomUrl.hostname !== `${dailyDomainName}.daily.co`) {
    throw new Error('Daily disposable room was created on an unexpected domain.');
  }
  roomCreated = true;
  evidence.daily_room.created = true;
} catch (error) {
  primaryFailure = error instanceof Error ? error : new Error(String(error));
  evidence.failure = primaryFailure.message;
} finally {
  const cleanupFailures = [];

  if (roomCreated) {
    try {
      const response = await fetch(`https://api.daily.co/v1/rooms/${encodeURIComponent(roomName)}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${dailyKey}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      evidence.daily_room.deleted = true;
    } catch (error) {
      cleanupFailures.push(`daily_room_cleanup:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (customerId) {
    try {
      const deleted = await jsonRequest(`https://api.stripe.com/v1/customers/${encodeURIComponent(customerId)}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${stripeKey}` },
      }, 'Stripe disposable customer cleanup');
      if (deleted?.deleted !== true || deleted?.id !== customerId) throw new Error('Stripe cleanup acknowledgement mismatch.');
      evidence.stripe_customer.deleted = true;
    } catch (error) {
      cleanupFailures.push(`stripe_customer_cleanup:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  evidence.cleanup_complete = (!roomCreated || evidence.daily_room.deleted) && (!customerId || evidence.stripe_customer.deleted);
  if (cleanupFailures.length) {
    evidence.failure = [evidence.failure, ...cleanupFailures].filter(Boolean).join('; ');
  }
  await mkdir(path.dirname(evidenceFile), { recursive: true });
  await writeFile(evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
}

if (primaryFailure) throw primaryFailure;
if (!evidence.cleanup_complete) throw new Error(`Provider preview cleanup incomplete; inspect ${evidenceFile}.`);
console.log(`Provider preview staging passed with deterministic cleanup evidence at ${evidenceFile}. No booking, PaymentIntent, charge, capture, refund, email, deploy, or publish was created.`);
