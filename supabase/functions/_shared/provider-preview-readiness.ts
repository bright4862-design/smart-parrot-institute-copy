export type ProviderCheck = { ready: boolean; status: string };

const REQUIRED_DAILY_ATTENDANCE_EVENTS = ['participant.joined', 'participant.left'] as const;
const DAILY_RETRY_TYPES = new Set(['circuit-breaker', 'exponential']);

export function validDailyWebhookSecret(value: string) {
  if (!value || value.length < 24 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return false;
  }
  try {
    return atob(value).length >= 16;
  } catch {
    return false;
  }
}

export function dailyWebhookConfiguration(
  webhook: Record<string, unknown>,
  expectedHmac: string,
): ProviderCheck {
  if (!validDailyWebhookSecret(expectedHmac)) {
    return { ready: false, status: 'daily_webhook_hmac_required' };
  }
  if (typeof webhook.hmac !== 'string' || webhook.hmac.trim() !== expectedHmac) {
    return { ready: false, status: 'daily_webhook_hmac_mismatch' };
  }

  const eventTypes = Array.isArray(webhook.eventTypes)
    ? webhook.eventTypes.filter((value): value is string => typeof value === 'string')
    : [];
  if (!REQUIRED_DAILY_ATTENDANCE_EVENTS.every((eventType) => eventTypes.includes(eventType))) {
    return { ready: false, status: 'daily_webhook_attendance_events_missing' };
  }

  const retryType = typeof webhook.retryType === 'string' ? webhook.retryType : '';
  if (!DAILY_RETRY_TYPES.has(retryType)) {
    return { ready: false, status: 'daily_webhook_retry_configuration_invalid' };
  }

  return { ready: true, status: 'ready' };
}
