import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createFullPreviewExecutionShell } from './lesson-booking-full-preview-execution-shell.mjs';
import { assertMinimizedFullPreviewRunSnapshot } from './lesson-booking-full-preview-run-registry.mjs';
import {
  APPROVED_SMART_PARROT_PREVIEW,
  createApprovedPreviewSupabaseTransport,
} from './lesson-booking-full-preview-supabase-transport.mjs';

const runId = '123e4567-e89b-42d3-a456-426614174511';
const bookingId = '123e4567-e89b-42d3-a456-426614174512';
const lessonTypeId = '123e4567-e89b-42d3-a456-426614174513';

const initialized = {
  schema_version: 1,
  run_id: runId,
  scenario: 'near_term_success',
  booking_id: null,
  state: 'initialized',
  pause_reason: null,
  terminal: false,
  revision: 0,
  last_booking_status: null,
  last_observed_at: null,
  completed_at: null,
  replay: false,
};
assert.equal(assertMinimizedFullPreviewRunSnapshot(initialized).state, 'initialized');
assert.throws(
  () => assertMinimizedFullPreviewRunSnapshot({ ...initialized, stripe_payment_intent_id: 'pi_forbidden' }),
  /forbidden_full_preview_run_field/,
);
assert.throws(
  () => assertMinimizedFullPreviewRunSnapshot({ ...initialized, raw_provider_payload: {} }),
  /forbidden_full_preview_run_field/,
);
assert.throws(
  () => assertMinimizedFullPreviewRunSnapshot({ ...initialized, terminal: true }),
  /terminal_state/,
);

const requests = [];
const response = (body) => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  json: async () => body,
  text: async () => JSON.stringify(body),
});
const transport = createApprovedPreviewSupabaseTransport({
  publishableKey: 'sb_publishable_contract_test',
  studentAccessToken: 'student.jwt.contract',
  adminAccessToken: 'admin.jwt.contract',
  secretKey: 'sb_secret_contract_test',
  fetchImpl: async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/functions/v1/create-booking')) {
      return response({ booking: { booking_id: bookingId }, checkout: { status: 'open' } });
    }
    if (url.endsWith('/rest/v1/rpc/admin_begin_booking_full_preview_run')) return response(initialized);
    if (url.endsWith('/rest/v1/rpc/admin_bind_booking_full_preview_run')) {
      return response({
        ...initialized,
        booking_id: bookingId,
        state: 'awaiting_checkout_completion',
        pause_reason: 'checkout_completion',
        revision: 1,
        last_booking_status: 'pending_checkout',
        last_observed_at: '2026-09-20T20:20:00.000Z',
      });
    }
    if (url.endsWith('/rest/v1/rpc/admin_refresh_booking_full_preview_run')) {
      return response({
        ...initialized,
        booking_id: bookingId,
        state: 'awaiting_checkout_completion',
        pause_reason: 'checkout_completion',
        revision: 1,
        last_booking_status: 'pending_checkout',
        last_observed_at: '2026-09-20T20:21:00.000Z',
        replay: true,
      });
    }
    if (url.endsWith('/functions/v1/place-holds')) return response({ holds: [] });
    throw new Error(`unexpected request ${url}`);
  },
});

assert.deepEqual(transport.identity, {
  project_ref: APPROVED_SMART_PARROT_PREVIEW.projectRef,
  supabase_url: APPROVED_SMART_PARROT_PREVIEW.supabaseUrl,
});
assert.throws(
  () => createApprovedPreviewSupabaseTransport({
    previewRef: 'differentpreviewref',
    supabaseUrl: APPROVED_SMART_PARROT_PREVIEW.supabaseUrl,
    fetchImpl: async () => response({}),
  }),
  /unapproved_preview_project_ref/,
);
assert.throws(
  () => createApprovedPreviewSupabaseTransport({
    previewRef: APPROVED_SMART_PARROT_PREVIEW.projectRef,
    supabaseUrl: 'https://example.supabase.co',
    fetchImpl: async () => response({}),
  }),
  /unapproved_preview_supabase_url/,
);

const shell = createFullPreviewExecutionShell({ invokeServer: transport.invokeServer });
const gate = {
  writeGate: '1',
  shellGate: '1',
  preflightStatus: 'preflight_ready',
  rehearsalReady: true,
  unresolvedCleanupFailures: 0,
  providerIdentityReady: true,
  dailyIdentityReady: true,
  previewRef: APPROVED_SMART_PARROT_PREVIEW.projectRef,
  productionRef: 'productionrefnotpreview',
  supabaseUrl: APPROVED_SMART_PARROT_PREVIEW.supabaseUrl,
  stripeKey: 'sk_test_transport_contract',
};

const reserved = await shell.reserve({
  gate,
  runId,
  scenario: 'near_term_success',
  lessonTypeId,
  startsAt: '2026-09-25T12:00:00.000Z',
});
assert.equal(reserved.run_registry.booking_id, bookingId);
assert.equal(reserved.run_registry.revision, 1);
assert.deepEqual(
  requests.slice(0, 3).map((item) => new URL(item.url).pathname),
  [
    '/rest/v1/rpc/admin_begin_booking_full_preview_run',
    '/functions/v1/create-booking',
    '/rest/v1/rpc/admin_bind_booking_full_preview_run',
  ],
);
assert.equal(requests[0].options.headers.apikey, 'sb_publishable_contract_test');
assert.equal(requests[0].options.headers.authorization, 'Bearer admin.jwt.contract');
assert.equal(requests[1].options.headers.apikey, 'sb_publishable_contract_test');
assert.equal(requests[1].options.headers.authorization, 'Bearer student.jwt.contract');

const refreshed = await shell.refreshRun({ runId });
assert.equal(refreshed.replay, true);
assert.equal(new URL(requests.at(-1).url).pathname, '/rest/v1/rpc/admin_refresh_booking_full_preview_run');

await shell.runServerStep({ operation: 'place_deferred_holds' });
assert.equal(new URL(requests.at(-1).url).pathname, '/functions/v1/place-holds');
assert.equal(requests.at(-1).options.headers.apikey, 'sb_secret_contract_test');
assert.equal('authorization' in requests.at(-1).options.headers, false);

await assert.rejects(
  () => transport.invokeServer({ target: 'stripe-webhook', auth: 'admin_rpc', payload: {} }),
  /unsupported_preview_target/,
);
await assert.rejects(
  () => transport.invokeServer({ target: 'place-holds', auth: 'student_user', payload: {} }),
  /preview_auth_class_mismatch/,
);

const transportSource = fs.readFileSync('scripts/lesson-booking-full-preview-supabase-transport.mjs', 'utf8');
assert.ok(transportSource.includes(APPROVED_SMART_PARROT_PREVIEW.projectRef));
assert.ok(!transportSource.includes('sk_test_'));
assert.ok(!transportSource.includes('api.stripe.com'));
assert.ok(!transportSource.includes('api.daily.co'));
assert.ok(!transportSource.includes('service_role'));

const migration = fs.readFileSync(
  'supabase/migrations/20260920221000_lesson_booking_phase4c5e_preview_run_registry.sql',
  'utf8',
);
assert.ok(migration.includes("alter function public.forbid_change() set search_path = ''"));
assert.ok(migration.includes('lesson_booking_full_preview_runs'));
assert.ok(migration.includes('lesson_booking_full_preview_run_checkpoints'));
assert.ok(migration.includes('private.smart_parrot_require_admin(uid)'));
assert.ok(migration.includes('b.client_request_id is distinct from p_run_id'));
assert.ok(migration.includes('enable row level security'));
assert.ok(migration.includes('lesson_booking_full_preview_run_checkpoints_append_only'));
for (const forbidden of [
  'stripe_payment_intent_id',
  'stripe_payment_method_id',
  'stripe_checkout_session_id',
  'video_room_name',
  'raw_provider_payload',
  'webhook_secret',
  'card_number',
]) {
  assert.ok(!migration.includes(forbidden), `Run registry leaked provider-sensitive field ${forbidden}`);
}

console.log('Phase 4C5E approved preview transport/durable run registry checks passed.');
