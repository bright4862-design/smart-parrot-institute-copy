import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260920180500_lesson_booking_phase4c5_rehearsal_evidence.sql','utf8');
const providerHarness = fs.readFileSync('scripts/lesson-booking-provider-preview-e2e.mjs','utf8');
const api = fs.readFileSync('src/lib/lessonBookingApi.js','utf8');
const retention = fs.readFileSync('src/components/lesson/BookingRetentionControls.jsx','utf8');
const workflow = fs.readFileSync('.github/workflows/lesson-booking-foundation.yml','utf8');

function requireAll(text, needles, label) {
  for (const needle of needles) {
    if (!text.includes(needle)) throw new Error(`${label} missing required contract: ${needle}`);
  }
}

requireAll(migration,[
  'lesson_booking_provider_rehearsals','lesson_booking_provider_rehearsal_reconciliations',
  'admin_ingest_booking_provider_rehearsal','admin_reconcile_booking_provider_rehearsal_cleanup',
  'lesson_booking_provider_rehearsals_append_only','smart_parrot_booking_launch_health_v3',
  'provider_rehearsal_missing','provider_rehearsal_latest_failed','unreconciled_provider_cleanup_failures',
  'retention_reviews_due_next_30d','provider_rehearsal_cleanup','evidence_sha256',
], 'Phase 4C5A migration');
for (const forbidden of [
  'stripe_customer_id','daily_room_name','daily_webhook_id','provider_response_body','raw_failure_message',
  'delete from public.bookings','delete from public.ledger_entries','truncate public.','automatic_erasure_worker',
]) {
  if (migration.toLowerCase().includes(forbidden)) throw new Error(`Phase 4C5A migration contains forbidden persisted/destructive primitive: ${forbidden}`);
}

requireAll(providerHarness,[
  "SMART_PARROT_PROVIDER_PREVIEW_E2E !== '1'","SMART_PARROT_PROVIDER_WRITES_CONFIRMED !== 'preview-only'",
  'createHash','admin_ingest_booking_provider_rehearsal','evidence_sha256','p_failure_code',
  "stripeKey.startsWith('sk_test_')",'booking-preview-readiness','booking-provider-preview-readiness',
], 'Provider preview rehearsal persistence');
if (providerHarness.includes('sk_live_')) throw new Error('Provider preview harness must not contain a live Stripe key path.');

requireAll(api,[
  'approveAdminBookingRetentionClass','revokeAdminBookingRetentionClassApproval',
], 'Lesson booking admin API');
requireAll(retention,[
  'approveAdminBookingRetentionClass','revokeAdminBookingRetentionClassApproval',
  'sourceAuthority','reviewReference','activeRetentionDays','archiveRetentionDays',
], 'Retention approval UX');
requireAll(workflow,[
  'check-lesson-booking-launch-rehearsal-boundary.mjs','lesson_booking_provider_rehearsal_scenarios.sql',
], 'Booking CI Phase 4C5A coverage');

console.log('Phase 4C5A launch rehearsal/retention approval boundary checks passed.');
