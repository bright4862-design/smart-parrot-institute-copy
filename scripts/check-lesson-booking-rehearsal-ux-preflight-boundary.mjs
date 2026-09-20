import fs from 'node:fs';

const api = fs.readFileSync('src/lib/lessonBookingRehearsalApi.js','utf8');
const panel = fs.readFileSync('src/components/lesson/BookingProviderRehearsalPanel.jsx','utf8');
const admin = fs.readFileSync('src/pages/LessonBookingAdmin.jsx','utf8');
const preflight = fs.readFileSync('scripts/lesson-booking-full-preview-preflight.mjs','utf8');
const workflow = fs.readFileSync('.github/workflows/lesson-booking-foundation.yml','utf8');

function requireAll(text, needles, label) {
  for (const needle of needles) if (!text.includes(needle)) throw new Error(`${label} missing required contract: ${needle}`);
}

requireAll(api,[
  'admin_provider_rehearsal_history','admin_provider_rehearsal_readiness',
  'admin_reconcile_booking_provider_rehearsal_cleanup','p_evidence_reference','p_reason_code',
], 'Phase 4C5B2 rehearsal API');
requireAll(panel,[
  'Provider rehearsal readiness','Server-authoritative provider rehearsal readiness',
  'Minimized rehearsal history','Record reconciliation','recent_successful_rehearsal',
  'unresolved_cleanup_failures','identity_verified','cleanup_incomplete',
], 'Phase 4C5B2 rehearsal operator UX');
requireAll(admin,[
  "BookingProviderRehearsalPanel",'<BookingProviderRehearsalPanel',
], 'Lesson operations rehearsal integration');

for (const forbidden of [
  'evidence_sha256','stripe_customer_id','daily_room_name','daily_webhook_id','webhook_hmac',
  'raw_provider_payload','secret_key','card_number','customer_email',
]) {
  if (panel.toLowerCase().includes(forbidden)) throw new Error(`Rehearsal operator UX exposes forbidden field: ${forbidden}`);
}

requireAll(preflight,[
  "SMART_PARROT_FULL_PREVIEW_PREFLIGHT !== '1'",'FULL_PREVIEW_PLAN',
  "stage: 'booking_reservation'","stage: 'stripe_test_authorization'","stage: 'daily_attendance'",
  "stage: 'deterministic_settlement'",'write_enabled: false',
  'admin_provider_rehearsal_readiness','booking-preview-readiness','booking-provider-preview-readiness',
  "stripeKey.startsWith('sk_test_')",'https://api.stripe.com/v1/account','https://api.daily.co/v1/webhooks/',
  'Provider rehearsal readiness is blocked','provider_writes_enabled: false',
], 'Disabled full-preview preflight');

for (const forbidden of [
  'api.stripe.com/v1/payment_intents','api.stripe.com/v1/customers','api.stripe.com/v1/refunds',
  'api.daily.co/v1/rooms','/capture','method: \'delete\'',
]) {
  if (preflight.toLowerCase().includes(forbidden)) throw new Error(`Full-preview preflight contains forbidden provider-write primitive: ${forbidden}`);
}

requireAll(workflow,[
  'check-lesson-booking-rehearsal-ux-preflight-boundary.mjs',
  'lesson-booking-full-preview-preflight.mjs',
], 'Booking CI Phase 4C5B2 coverage');

console.log('Phase 4C5B2 rehearsal operator UX/full-preview preflight boundary checks passed.');
