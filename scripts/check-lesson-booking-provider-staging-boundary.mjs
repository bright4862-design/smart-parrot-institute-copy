import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const providerReadiness = fs.readFileSync('supabase/functions/booking-provider-preview-readiness/index.ts','utf8');
const providerReadinessContract = fs.readFileSync('supabase/functions/_shared/provider-preview-readiness.ts','utf8');
const dailyWebhook = fs.readFileSync('supabase/functions/daily-webhook/index.ts','utf8');
const baseReadiness = fs.readFileSync('supabase/functions/booking-preview-readiness/index.ts','utf8');
const providerHarness = fs.readFileSync('scripts/lesson-booking-provider-preview-e2e.mjs','utf8');
const migration = fs.readFileSync('supabase/migrations/20260920170500_lesson_booking_phase4c4_provider_retention_approval.sql','utf8');
const config = fs.readFileSync('supabase/config.toml','utf8');
const workflow = fs.readFileSync('.github/workflows/lesson-booking-foundation.yml','utf8');

function requireAll(text, needles, label) {
  for (const needle of needles) {
    if (!text.includes(needle)) throw new Error(`${label} missing required contract: ${needle}`);
  }
}

requireAll(providerReadiness,[
  "withSupabase({ auth: 'user' }","profile?.role !== 'admin'","SMART_PARROT_PROVIDER_E2E_ENABLED",
  "SMART_PARROT_STRIPE_TEST_ACCOUNT_ID","https://api.stripe.com/v1/account",
  "SMART_PARROT_DAILY_PREVIEW_WEBHOOK_ID","SMART_PARROT_DAILY_PREVIEW_DOMAIN_ID","SMART_PARROT_DAILY_PREVIEW_DOMAIN_NAME",
  "SMART_PARROT_DAILY_PREVIEW_ROOM_PREFIX","DAILY_WEBHOOK_SECRET","https://api.daily.co/v1/webhooks/","stripe_account_mismatch",
  "daily_webhook_domain_mismatch","daily_webhook_not_active","dailyWebhookConfiguration(webhook, webhookSecret)",
  "smart_parrot_booking_provider_preview_readiness_v2",
  "No secret, account ID, project ref, webhook ID, domain ID, webhook URL, HMAC, or provider response body is returned.",
], 'Provider preview readiness');

requireAll(providerReadinessContract,[
  "participant.joined","participant.left","circuit-breaker","exponential",
  "daily_webhook_hmac_required","daily_webhook_hmac_mismatch",
  "daily_webhook_attendance_events_missing","daily_webhook_retry_configuration_invalid",
  "webhook.hmac.trim() !== expectedHmac",
], 'Provider preview Daily contract');

requireAll(dailyWebhook,[
  "const rawBody = await req.text()","x-webhook-timestamp","x-webhook-signature","DAILY_WEBHOOK_SECRET",
  "verified = await signatureOk(req, rawBody)","event.test === 'test'","participant.joined","participant.left",
], 'Daily signed webhook receiver');

requireAll(providerHarness,[
  "SMART_PARROT_PROVIDER_PREVIEW_E2E !== '1'","SMART_PARROT_PROVIDER_WRITES_CONFIRMED !== 'preview-only'",
  "SMART_PARROT_PRODUCTION_PROJECT_REF","booking-preview-readiness","booking-provider-preview-readiness",
  "https://api.stripe.com/v1/account","https://api.stripe.com/v1/customers","https://api.daily.co/v1/rooms",
  "method: 'DELETE'","finally","cleanup_complete","smart_parrot_provider_preview_e2e_v1",
  "No booking, PaymentIntent, charge, capture, refund, email, deploy, or publish was created.",
], 'Provider preview E2E harness');

requireAll(migration,[
  'lesson_booking_retention_approval_events','approved_by','approval_reference',
  'admin_approve_booking_retention_class','admin_revoke_booking_retention_class_approval',
  "'approved','approval_revoked'",'lesson_booking_retention_approval_events_append_only',
  "'automatic_erasure_enabled',false",'approved_duration_required','source_authority',
], 'Phase 4C4 retention approval migration');
for (const forbidden of ['delete from public.bookings','delete from public.ledger_entries','truncate public.','purge_booking','automatic_erasure_worker']) {
  if (migration.toLowerCase().includes(forbidden)) throw new Error(`Retention approval migration contains destructive primitive: ${forbidden}`);
}

requireAll(baseReadiness,[
  'approved_by','approval_reference','retention_policy_approved','smart_parrot_booking_preview_readiness_v2',
], 'Base preview readiness reviewed-retention gate');
if (/fetch\s*\(/.test(baseReadiness)) throw new Error('Base preview readiness must remain provider-no-network.');

requireAll(config,['[functions.booking-provider-preview-readiness]','verify_jwt = true'],'Supabase provider readiness config');
requireAll(workflow,[
  'check-lesson-booking-provider-staging-boundary.mjs','lesson-booking-provider-preview-e2e.mjs',
  'lesson_booking_retention_approval_scenarios.sql','booking-provider-preview-readiness/index.ts',
], 'Booking CI Phase 4C4 coverage');

const denoContract = spawnSync('deno', [
  'test',
  '--node-modules-dir=none',
  'supabase/functions/booking-provider-preview-readiness/provider_config_test.ts',
], { stdio: 'inherit' });
if (denoContract.error) throw denoContract.error;
if (denoContract.status !== 0) {
  throw new Error(`Provider readiness behavioral contract failed with exit ${denoContract.status}.`);
}

console.log('Phase 4C4 provider staging/retention approval boundary checks passed with signed Daily webhook readiness regressions.');
