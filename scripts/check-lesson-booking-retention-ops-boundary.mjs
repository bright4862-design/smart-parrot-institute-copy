import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260920160500_lesson_booking_phase4c3_retention_ops_preview_guard.sql','utf8');
const compatibilityMigration = fs.readFileSync('supabase/migrations/20260920160600_lesson_booking_phase4c3_legacy_queue_guard.sql','utf8');
const readiness = fs.readFileSync('supabase/functions/booking-preview-readiness/index.ts','utf8');
const api = fs.readFileSync('src/lib/lessonBookingApi.js','utf8');
const page = fs.readFileSync('src/pages/LessonBookingAdmin.jsx','utf8');
const retentionPanel = fs.readFileSync('src/components/lesson/BookingRetentionControls.jsx','utf8');
const harness = fs.readFileSync('scripts/lesson-booking-preview-e2e.mjs','utf8');

function requireAll(text, needles, label) {
  for (const needle of needles) {
    if (!text.includes(needle)) throw new Error(`${label} missing required contract: ${needle}`);
  }
}

requireAll(migration,[
  'admin_booking_retention_options','retention_unclassified','retention_review_overdue','retention_policy_unapproved',
  'unclassified_evidence_bookings','overdue_legal_hold_reviews','unapproved_retention_classes',
  'smart_parrot_booking_launch_health_v2','A nonzero count is an operator signal','never erases evidence',
], 'Phase 4C3 migration');

requireAll(compatibilityMigration,[
  'Legacy unmatched Stripe test dispute','provider refresh required','stripe_dispute_events','stripe_dispute_current_state',
  'retention_unclassified','retention_review_overdue','retention_policy_unapproved','no provider/payment write authority',
], 'Phase 4C3 legacy queue compatibility migration');

for (const [labelName, text] of [['Phase 4C3 migration', migration], ['Phase 4C3 compatibility migration', compatibilityMigration]]) {
  for (const forbidden of ['delete from public.bookings','delete from public.ledger_entries','truncate public.','automatic_erasure_worker','purge_booking']) {
    if (text.toLowerCase().includes(forbidden)) throw new Error(`${labelName} contains destructive primitive: ${forbidden}`);
  }
}

requireAll(readiness,[
  'SMART_PARROT_PREVIEW_PROJECT_REF','DENO_DEPLOYMENT_ID','preview_project_identity','preview_project_mismatch',
  'smart_parrot_booking_preview_readiness_v2','No secret value or Supabase project ref is returned',
  "stripeKey.startsWith('sk_test_')",
], 'Preview readiness identity guard');
if (readiness.includes('sk_live_')) throw new Error('Preview readiness must not accept or reference live Stripe keys.');

requireAll(harness,[
  "SMART_PARROT_PREVIEW_E2E !== '1'",'SMART_PARROT_PREVIEW_PROJECT_REF','SMART_PARROT_PRODUCTION_PROJECT_REF',
  'parsed.hostname !== `${expectedProjectRef}.supabase.co`','preview_project_identity','Provider-write E2E remains intentionally separate',
], 'Preview E2E identity guard');

requireAll(api,[
  'listAdminBookingRetentionOptions','getAdminBookingRetentionStatus','setAdminBookingRetentionControl',
], 'Admin retention API');
requireAll(retentionPanel,[
  'Retention governance','Automatic erasure','Save audited control','legalHold && !reviewAfter',
  'Approved retention durations remain controlled by the server-side policy table',
], 'Admin retention panel');
requireAll(page,[
  'BookingRetentionControls','Retention / legal hold','unmatched/provider-wide signal','never authority to move money or erase evidence',
], 'Admin retention workflow');

const browserSurface = `${api}\n${page}\n${retentionPanel}`;
for (const forbidden of ['SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY','sb_secret_','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','STRIPE_DISPUTE_WEBHOOK_SECRET','DAILY_API_KEY','DAILY_WEBHOOK_SECRET','COMPLIANCE_DELIVERY_PROVIDER','sk_test_','whsec_']) {
  if (browserSurface.includes(forbidden)) throw new Error(`Browser retention surface contains forbidden secret marker: ${forbidden}`);
}

console.log('Phase 4C3 retention operations/preview identity boundary checks passed.');
