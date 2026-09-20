import Stripe from 'npm:stripe@^22';

type AdminClient = any;

let stripeInstance: Stripe | null = null;

export function getStripe() {
  if (stripeInstance) return stripeInstance;

  const key = Deno.env.get('STRIPE_SECRET_KEY')?.trim() ?? '';
  if (!key.startsWith('sk_test_')) {
    throw new Error('stripe_test_configuration_required');
  }

  stripeInstance = new Stripe(key);
  return stripeInstance;
}

export function getStripeWebhookSecret() {
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET')?.trim() ?? '';
  if (!secret.startsWith('whsec_')) {
    throw new Error('stripe_webhook_configuration_required');
  }
  return secret;
}

export function getAppUrl() {
  const raw = Deno.env.get('APP_URL')?.trim() ?? '';
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('app_url_configuration_required');
  }

  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new Error('app_url_configuration_required');
  }

  return url.origin;
}

export function getBusinessName() {
  return Deno.env.get('BUSINESS_NAME')?.trim() || 'Smart Parrot Institute';
}

export function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export function checkoutAuthorizationText(booking: {
  policy_version_id: string;
  max_charge_cents: number;
  currency: string;
}) {
  return `I agree to the Lesson & Lateness Policy (${booking.policy_version_id}) and authorise ${getBusinessName()} to place a card hold up to ${formatMoney(booking.max_charge_cents, booking.currency)} and collect the amount due for this lesson under that policy.`;
}

export async function getOrCreateStripeCustomer(
  admin: AdminClient,
  userId: string,
  email?: string | null,
) {
  const { data: existing, error: readError } = await admin
    .from('stripe_links')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (readError) throw readError;
  if (existing?.stripe_customer_id) return existing.stripe_customer_id as string;

  const customer = await getStripe().customers.create(
    {
      ...(email ? { email } : {}),
      metadata: { smart_parrot_user_id: userId },
    },
    { idempotencyKey: `smart-parrot-customer-${userId}` },
  );

  if (customer.livemode) {
    throw new Error('live_stripe_object_disabled');
  }

  const { error: writeError } = await admin
    .from('stripe_links')
    .upsert(
      { user_id: userId, stripe_customer_id: customer.id },
      { onConflict: 'user_id' },
    );

  if (writeError) throw writeError;
  return customer.id;
}

export function stripeObjectId(value: string | { id?: string } | null | undefined) {
  if (typeof value === 'string') return value;
  return value?.id ?? null;
}
