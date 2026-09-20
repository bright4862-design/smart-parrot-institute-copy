import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260920132000_lesson_booking_phase4b_admin_disputes.sql','utf8');
const webhook = fs.readFileSync('supabase/functions/stripe-dispute-webhook/index.ts','utf8');
const config = fs.readFileSync('supabase/config.toml','utf8');
const api = fs.readFileSync('src/lib/lessonBookingApi.js','utf8');
const page = fs.readFileSync('src/pages/LessonBookingAdmin.jsx','utf8');
const app = fs.readFileSync('src/App.jsx','utf8');

function requireAll(text, needles, label) {
  for (const needle of needles) {
    if (!text.includes(needle)) throw new Error(`${label} missing required contract: ${needle}`);
  }
}

requireAll(migration,[
  'stripe_dispute_events','stripe_dispute_events_append_only','record_stripe_dispute_event',
  'admin_claim_review_case','admin_add_review_note','admin_acknowledge_alert','admin_data_subject_inventory',
  "to service_role","opened_source","claim_expires_at","stripe_dispute_unmatched",
  'Raw provider webhook payloads, IP addresses, user agents, secrets, and tutor attendance are excluded',
], 'Phase 4B migration');

if (/stripe_dispute_events[\s\S]{0,1200}\b(raw|payload)\s+jsonb\b/i.test(migration)) {
  throw new Error('Minimized dispute table must not persist a raw/payload JSON body.');
}

requireAll(webhook,[
  "await req.text()","stripe-signature","constructEventAsync","STRIPE_DISPUTE_WEBHOOK_SECRET",
  "event.livemode","dispute.livemode","charge.dispute.created","charge.dispute.updated","charge.dispute.closed",
  "record_stripe_dispute_event",
], 'Stripe dispute webhook');

for (const forbidden of ['stripe.disputes.update','stripe.disputes.close','submitEvidence','sk_live_']) {
  if (webhook.includes(forbidden)) throw new Error(`Dispute webhook contains forbidden provider-write/live primitive: ${forbidden}`);
}

requireAll(config,['[functions.stripe-dispute-webhook]','verify_jwt = false'],'Supabase config');
requireAll(api,['listAdminReviewQueue','openAdminReviewCase','claimAdminReviewCase','addAdminReviewNote','resolveAdminReviewCase','acknowledgeAdminAlert','exportAdminBookingEvidence'],'Admin browser API');
requireAll(page,['LessonBookingAuthProvider','listAdminReviewQueue','Admin access is required','cannot submit, accept, or close a Stripe dispute','secret/service-role key'],'Admin page');
requireAll(app,["@/pages/LessonBookingAdmin","/lesson-booking-admin"],'Admin route');

const browserSurface = `${api}\n${page}`;
for (const forbidden of ['SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY','sb_secret_','sk_test_','STRIPE_SECRET_KEY']) {
  if (browserSurface.includes(forbidden)) throw new Error(`Browser admin surface contains forbidden secret material marker: ${forbidden}`);
}

console.log('Phase 4B admin/dispute boundary checks passed.');
