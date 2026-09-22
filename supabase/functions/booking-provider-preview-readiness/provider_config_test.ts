import {
  dailyWebhookConfiguration,
  validDailyWebhookSecret,
} from '../_shared/provider-preview-readiness.ts';

function assertEquals(actual: unknown, expected: unknown) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`assertion failed: expected ${expectedJson}, received ${actualJson}`);
  }
}

const matchingSecret = btoa('smart-parrot-preview-hmac-secret');

Deno.test('Daily preview HMAC must be valid base64 with enough decoded entropy', () => {
  assertEquals(validDailyWebhookSecret(matchingSecret), true);
  assertEquals(validDailyWebhookSecret('not-base64'), false);
  assertEquals(validDailyWebhookSecret(btoa('too-short')), false);
});

Deno.test('Daily preview readiness accepts exact HMAC plus attendance events and documented retry policy', () => {
  assertEquals(dailyWebhookConfiguration({
    hmac: matchingSecret,
    retryType: 'exponential',
    eventTypes: ['participant.joined', 'participant.left', 'meeting.ended'],
  }, matchingSecret), { ready: true, status: 'ready' });
});

Deno.test('Daily preview readiness rejects a provider/local HMAC mismatch', () => {
  assertEquals(dailyWebhookConfiguration({
    hmac: btoa('different-preview-hmac-secret'),
    retryType: 'circuit-breaker',
    eventTypes: ['participant.joined', 'participant.left'],
  }, matchingSecret), { ready: false, status: 'daily_webhook_hmac_mismatch' });
});

Deno.test('Daily preview readiness rejects missing attendance subscriptions', () => {
  assertEquals(dailyWebhookConfiguration({
    hmac: matchingSecret,
    retryType: 'circuit-breaker',
    eventTypes: ['participant.joined'],
  }, matchingSecret), { ready: false, status: 'daily_webhook_attendance_events_missing' });
});

Deno.test('Daily preview readiness rejects an undocumented retry policy', () => {
  assertEquals(dailyWebhookConfiguration({
    hmac: matchingSecret,
    retryType: 'none',
    eventTypes: ['participant.joined', 'participant.left'],
  }, matchingSecret), { ready: false, status: 'daily_webhook_retry_configuration_invalid' });
});
