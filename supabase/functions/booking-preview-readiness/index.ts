import { withSupabase } from 'npm:@supabase/server@^1';

const REQUIRED_RETENTION_CLASSES = new Set([
  'booking_operations',
  'payment_evidence',
  'consumer_compliance',
  'legal_claim_archive',
]);

type ReadinessCheck = {
  ready: boolean;
  status: string;
};

function response(error: string, status: number) {
  return Response.json({ error }, { status });
}

function env(name: string) {
  return Deno.env.get(name)?.trim() ?? '';
}

function validHttpsUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function supabaseBackendSecretContext(): ReadinessCheck {
  const modern = env('SUPABASE_SECRET_KEYS');
  if (modern) {
    try {
      const keys = JSON.parse(modern) as Record<string, unknown>;
      if (Object.values(keys).some((value) => typeof value === 'string' && value.startsWith('sb_secret_'))) {
        return { ready: true, status: 'ready' };
      }
    } catch {
      return { ready: false, status: 'invalid_secret_key_context' };
    }
  }

  // Kept as a warning-only bridge while Supabase completes its 2026 migration
  // from legacy service_role keys to revocable secret keys.
  if (env('SUPABASE_SERVICE_ROLE_KEY')) {
    return { ready: true, status: 'legacy_key_migration_required' };
  }

  return { ready: false, status: 'missing' };
}

function basicCheck(ready: boolean, invalidStatus = 'missing'): ReadinessCheck {
  return { ready, status: ready ? 'ready' : invalidStatus };
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return response('method_not_allowed', 405);

    const userId = ctx.userClaims?.id;
    if (!userId) return response('authenticated_user_required', 401);

    const { data: profile, error: profileError } = await ctx.supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) return response('admin_authorization_unavailable', 503);
    if (profile?.role !== 'admin') return response('admin_required', 403);

    const stripeKey = env('STRIPE_SECRET_KEY');
    const checkoutWebhookSecret = env('STRIPE_WEBHOOK_SECRET');
    const disputeWebhookSecret = env('STRIPE_DISPUTE_WEBHOOK_SECRET');
    const dailyApiKey = env('DAILY_API_KEY');
    const dailyWebhookSecret = env('DAILY_WEBHOOK_SECRET');
    const deliveryProvider = env('COMPLIANCE_DELIVERY_PROVIDER');

    const { data: retentionRows, error: retentionError } = await ctx.supabaseAdmin
      .from('lesson_booking_retention_classes')
      .select('code, active_retention_days, source_authority, approved_at');

    const retentionByCode = new Map(
      (retentionRows ?? []).map((row: Record<string, unknown>) => [String(row.code), row]),
    );
    const retentionPolicyReady = !retentionError && [...REQUIRED_RETENTION_CLASSES].every((code) => {
      const row = retentionByCode.get(code) as Record<string, unknown> | undefined;
      return Boolean(
        row &&
        Number.isInteger(row.active_retention_days) &&
        Number(row.active_retention_days) > 0 &&
        typeof row.source_authority === 'string' &&
        row.source_authority.trim() &&
        row.approved_at,
      );
    });

    const backendSecret = supabaseBackendSecretContext();
    const checks: Record<string, ReadinessCheck> = {
      supabase_browser_authenticated: { ready: true, status: 'ready' },
      supabase_backend_secret_context: backendSecret,
      stripe_test_secret: basicCheck(stripeKey.startsWith('sk_test_'), stripeKey ? 'test_key_required' : 'missing'),
      stripe_checkout_webhook_secret: basicCheck(checkoutWebhookSecret.startsWith('whsec_'), 'missing_or_invalid'),
      stripe_dispute_webhook_secret: basicCheck(disputeWebhookSecret.startsWith('whsec_'), 'missing_or_invalid'),
      stripe_webhook_secrets_distinct: basicCheck(
        checkoutWebhookSecret.startsWith('whsec_') &&
          disputeWebhookSecret.startsWith('whsec_') &&
          checkoutWebhookSecret !== disputeWebhookSecret,
        'separate_signing_secrets_required',
      ),
      app_url: basicCheck(validHttpsUrl(env('APP_URL')), 'https_url_required'),
      terms_of_service_url: basicCheck(validHttpsUrl(env('TERMS_OF_SERVICE_URL')), 'https_url_required'),
      daily_api_key: basicCheck(dailyApiKey.length >= 16, 'missing_or_invalid'),
      daily_webhook_secret: basicCheck(dailyWebhookSecret.length >= 16, 'missing_or_invalid'),
      durable_medium_delivery_provider: basicCheck(
        Boolean(deliveryProvider) && !['disabled', 'none', 'stub', 'test_stub'].includes(deliveryProvider.toLowerCase()),
        'real_provider_required',
      ),
      retention_policy_approved: basicCheck(
        retentionPolicyReady,
        retentionError ? 'database_check_failed' : 'approved_durations_required',
      ),
    };

    const blockers = Object.entries(checks)
      .filter(([, check]) => !check.ready)
      .map(([name]) => name);
    const warnings = Object.entries(checks)
      .filter(([, check]) => check.ready && check.status !== 'ready')
      .map(([name]) => name);

    return Response.json({
      schema_version: 'smart_parrot_booking_preview_readiness_v1',
      generated_at: new Date().toISOString(),
      status: blockers.length ? 'blocked' : warnings.length ? 'ready_with_warning' : 'ready',
      checks,
      blockers,
      warnings,
      preview_flow: [
        'authenticated_reservation',
        'stripe_test_checkout_or_setup',
        'test_hold_or_saved_card_recovery',
        'server_or_daily_attendance_evidence',
        'deterministic_test_settlement_or_cancellation',
        'append_only_ledger_and_evidence_review',
      ],
      boundaries: [
        'No secret value is returned by this endpoint.',
        'Readiness never moves money, creates provider objects, sends email, deploys, or publishes.',
        'Stripe readiness accepts test keys only.',
        'Retention readiness is blocked until approved durations and their authority are configured.',
      ],
    });
  }),
};
