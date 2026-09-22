import { withSupabase } from 'npm:@supabase/server@^1';
import {
  dailyWebhookConfiguration,
  validDailyWebhookSecret,
  type ProviderCheck,
} from '../_shared/provider-preview-readiness.ts';

type Check = ProviderCheck;

function env(name: string) {
  return Deno.env.get(name)?.trim() ?? '';
}

function json(error: string, status: number) {
  return Response.json({ error }, { status });
}

function validProjectRef(value: string) {
  return /^[a-z0-9]{15,40}$/.test(value);
}

function previewProjectIdentity(): Check {
  const expected = env('SMART_PARROT_PREVIEW_PROJECT_REF');
  const deploymentId = env('DENO_DEPLOYMENT_ID');
  if (!expected) return { ready: false, status: 'preview_project_ref_required' };
  if (!validProjectRef(expected)) return { ready: false, status: 'invalid_preview_project_ref' };
  if (!deploymentId) return { ready: false, status: 'deployment_identity_unavailable' };
  if (!deploymentId.startsWith(`${expected}_`)) return { ready: false, status: 'preview_project_mismatch' };
  return { ready: true, status: 'ready' };
}

function safeRoomPrefix(value: string) {
  return /^sp-preview-[a-z0-9-]{3,48}$/.test(value) && !/(^|-)(prod|production|live)(-|$)/.test(value);
}

function safeDailyDomainName(value: string) {
  return /^[a-z0-9][a-z0-9-]{2,62}$/.test(value) && !/(^|-)(prod|production|live)(-|$)/.test(value);
}

async function stripeIdentity(): Promise<Check> {
  const key = env('STRIPE_SECRET_KEY');
  const expectedAccountId = env('SMART_PARROT_STRIPE_TEST_ACCOUNT_ID');
  if (env('SMART_PARROT_PROVIDER_E2E_ENABLED') !== '1') return { ready: false, status: 'provider_e2e_disabled' };
  if (!key.startsWith('sk_test_')) return { ready: false, status: key ? 'stripe_test_key_required' : 'stripe_test_key_missing' };
  if (!/^acct_[A-Za-z0-9]{8,80}$/.test(expectedAccountId)) return { ready: false, status: 'expected_stripe_account_required' };

  try {
    const response = await fetch('https://api.stripe.com/v1/account', {
      headers: { authorization: `Bearer ${key}` },
    });
    if (!response.ok) return { ready: false, status: `stripe_identity_http_${response.status}` };
    const account = await response.json() as Record<string, unknown>;
    if (account.id !== expectedAccountId || account.object !== 'account') {
      return { ready: false, status: 'stripe_account_mismatch' };
    }
    return { ready: true, status: 'ready' };
  } catch {
    return { ready: false, status: 'stripe_identity_unavailable' };
  }
}

async function dailyIdentity(): Promise<Check> {
  const apiKey = env('DAILY_API_KEY');
  const webhookId = env('SMART_PARROT_DAILY_PREVIEW_WEBHOOK_ID');
  const expectedDomainId = env('SMART_PARROT_DAILY_PREVIEW_DOMAIN_ID');
  const domainName = env('SMART_PARROT_DAILY_PREVIEW_DOMAIN_NAME');
  const roomPrefix = env('SMART_PARROT_DAILY_PREVIEW_ROOM_PREFIX');
  const webhookSecret = env('DAILY_WEBHOOK_SECRET');

  if (env('SMART_PARROT_PROVIDER_E2E_ENABLED') !== '1') return { ready: false, status: 'provider_e2e_disabled' };
  if (apiKey.length < 16) return { ready: false, status: 'daily_api_key_missing' };
  if (!webhookId || webhookId.length < 8) return { ready: false, status: 'daily_preview_webhook_id_required' };
  if (!expectedDomainId || expectedDomainId.length < 8) return { ready: false, status: 'daily_preview_domain_id_required' };
  if (!safeDailyDomainName(domainName)) return { ready: false, status: 'daily_preview_domain_name_required' };
  if (!safeRoomPrefix(roomPrefix)) return { ready: false, status: 'safe_daily_room_prefix_required' };
  if (!validDailyWebhookSecret(webhookSecret)) return { ready: false, status: 'daily_webhook_hmac_required' };

  try {
    const response = await fetch(`https://api.daily.co/v1/webhooks/${encodeURIComponent(webhookId)}`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) return { ready: false, status: `daily_identity_http_${response.status}` };
    const raw = await response.json() as Record<string, unknown> | Record<string, unknown>[];
    const webhook = (Array.isArray(raw) ? raw[0] : raw) ?? {};
    if (webhook.uuid !== webhookId || webhook.domainId !== expectedDomainId) {
      return { ready: false, status: 'daily_webhook_domain_mismatch' };
    }
    if (webhook.state === 'FAILED' || webhook.state === 'INACTIVE') {
      return { ready: false, status: 'daily_webhook_not_active' };
    }
    return dailyWebhookConfiguration(webhook, webhookSecret);
  } catch {
    return { ready: false, status: 'daily_identity_unavailable' };
  }
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return json('method_not_allowed', 405);
    const userId = ctx.userClaims?.id;
    if (!userId) return json('authenticated_user_required', 401);

    const { data: profile, error: profileError } = await ctx.supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) return json('admin_authorization_unavailable', 503);
    if (profile?.role !== 'admin') return json('admin_required', 403);

    const providerGate: Check = env('SMART_PARROT_PROVIDER_E2E_ENABLED') === '1'
      ? { ready: true, status: 'ready' }
      : { ready: false, status: 'provider_e2e_disabled' };
    const projectIdentity = previewProjectIdentity();

    // Provider reads happen only after the explicit server-side preview gate and
    // Supabase preview deployment identity have both passed.
    const stripe = providerGate.ready && projectIdentity.ready
      ? await stripeIdentity()
      : { ready: false, status: providerGate.ready ? projectIdentity.status : providerGate.status };
    const daily = providerGate.ready && projectIdentity.ready
      ? await dailyIdentity()
      : { ready: false, status: providerGate.ready ? projectIdentity.status : providerGate.status };

    const checks: Record<string, Check> = {
      provider_preview_gate: providerGate,
      preview_project_identity: projectIdentity,
      stripe_test_account_identity: stripe,
      daily_preview_webhook_domain_identity: daily,
    };
    const blockers = Object.entries(checks).filter(([, check]) => !check.ready).map(([name]) => name);

    return Response.json({
      schema_version: 'smart_parrot_booking_provider_preview_readiness_v2',
      generated_at: new Date().toISOString(),
      status: blockers.length ? 'blocked' : 'ready',
      checks,
      blockers,
      boundaries: [
        'Provider identity checks are read-only and admin-only.',
        'Stripe must use a test secret key and match the explicitly configured test account.',
        'Daily must match the explicitly configured preview webhook/domain, preview-only room namespace, exact local HMAC secret, supported retry configuration, and attendance event subscriptions.',
        'No secret, account ID, project ref, webhook ID, domain ID, webhook URL, HMAC, or provider response body is returned.',
        'This endpoint never creates, captures, refunds, settles, deletes, deploys, publishes, or sends customer communications.',
      ],
    });
  }),
};
