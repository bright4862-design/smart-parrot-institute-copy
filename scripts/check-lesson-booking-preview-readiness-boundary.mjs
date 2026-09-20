import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260920150500_lesson_booking_phase4c2_preview_retention.sql','utf8');
const readiness = fs.readFileSync('supabase/functions/booking-preview-readiness/index.ts','utf8');
const config = fs.readFileSync('supabase/config.toml','utf8');
const api = fs.readFileSync('src/lib/lessonBookingApi.js','utf8');
const page = fs.readFileSync('src/pages/LessonBookingAdmin.jsx','utf8');
const harness = fs.readFileSync('scripts/lesson-booking-preview-e2e.mjs','utf8');

function requireAll(text, needles, label) {
  for (const needle of needles) {
    if (!text.includes(needle)) throw new Error(`${label} missing required contract: ${needle}`);
  }
}

requireAll(readiness,[
  "withSupabase({ auth: 'user' }","profile?.role !== 'admin'","STRIPE_SECRET_KEY","sk_test_",
  "STRIPE_WEBHOOK_SECRET","STRIPE_DISPUTE_WEBHOOK_SECRET","TERMS_OF_SERVICE_URL","DAILY_API_KEY","DAILY_WEBHOOK_SECRET",
  "COMPLIANCE_DELIVERY_PROVIDER","SUPABASE_SECRET_KEYS","legacy_key_migration_required",
  "No secret value or Supabase project ref is returned by this endpoint.","retention_policy_approved","status: blockers.length ? 'blocked'",
  "preview_project_identity","SMART_PARROT_PREVIEW_PROJECT_REF","DENO_DEPLOYMENT_ID",
], 'Preview readiness function');

if (readiness.includes('sk_live_')) throw new Error('Preview readiness must never accept or reference a live Stripe key.');
if (/fetch\s*\(/.test(readiness)) throw new Error('Readiness endpoint must not call external providers.');

requireAll(migration,[
  'lesson_booking_retention_classes','booking_retention_controls','booking_retention_control_events',
  'booking_retention_events_append_only','booking_retention_controls_no_delete','admin_booking_retention_status',
  'admin_set_booking_retention_control',"'automatic_erasure_enabled',false",'approved_duration_required',
  'from anon, authenticated','to authenticated',
], 'Phase 4C2 migration');

for (const forbidden of ['delete_booking_evidence','purge_booking','automatic_erasure_worker','truncate public.']) {
  if (migration.toLowerCase().includes(forbidden)) throw new Error(`Retention migration contains destructive primitive: ${forbidden}`);
}

requireAll(config,['[functions.booking-preview-readiness]','verify_jwt = true'],'Supabase config');
requireAll(api,['getAdminBookingLaunchHealth','getAdminBookingPreviewReadiness','getAdminBookingRetentionStatus','setAdminBookingRetentionControl'],'Admin browser API');
requireAll(page,['Launch health','Preview readiness','getAdminBookingLaunchHealth','getAdminBookingPreviewReadiness','No secret values or project refs are shown'],'Admin operations page');
requireAll(harness,[
  "SMART_PARROT_PREVIEW_E2E !== '1'","VITE_SUPABASE_PUBLISHABLE_KEY","sb_publishable_",
  'booking-preview-readiness','stripe_test_checkout_or_setup','append_only_ledger_and_evidence_review',
  'SMART_PARROT_PREVIEW_PROJECT_REF',
], 'Preview E2E gate');

const browserSurface = `${api}\n${page}`;
for (const forbidden of ['SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY','sb_secret_','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','STRIPE_DISPUTE_WEBHOOK_SECRET','DAILY_API_KEY','DAILY_WEBHOOK_SECRET','COMPLIANCE_DELIVERY_PROVIDER','sk_test_','whsec_']) {
  if (browserSurface.includes(forbidden)) throw new Error(`Browser readiness surface contains forbidden secret marker: ${forbidden}`);
}

console.log('Phase 4C2 preview readiness/retention boundary checks passed.');
