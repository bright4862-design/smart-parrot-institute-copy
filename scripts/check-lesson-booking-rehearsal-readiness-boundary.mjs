import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260920190500_lesson_booking_phase4c5b_rehearsal_readiness.sql','utf8');
const workflow = fs.readFileSync('.github/workflows/lesson-booking-foundation.yml','utf8');

function requireAll(text, needles, label) {
  for (const needle of needles) {
    if (!text.includes(needle)) throw new Error(`${label} missing required contract: ${needle}`);
  }
}

requireAll(migration,[
  'admin_provider_rehearsal_history','admin_provider_rehearsal_readiness',
  "interval '7 days'",'provider_rehearsal_latest_not_passed','provider_rehearsal_stale',
  'provider_cleanup_unresolved','unresolved_cleanup_failures','smart_parrot_provider_rehearsal_readiness_v1',
  'private.smart_parrot_require_admin','grant execute on function public.admin_provider_rehearsal_history',
  'grant execute on function public.admin_provider_rehearsal_readiness',
], 'Phase 4C5B1 migration');

for (const forbidden of [
  'evidence_sha256','stripe_customer_id','daily_room_name','daily_webhook_id','webhook_hmac',
  'raw_provider','secret_key','payment_method_id','card_number','customer_email',
  'delete from public.','truncate public.','stripe.com/v1','api.daily.co',
]) {
  if (migration.toLowerCase().includes(forbidden)) {
    throw new Error(`Phase 4C5B1 readiness/history surface contains forbidden data/action primitive: ${forbidden}`);
  }
}

requireAll(workflow,[
  'check-lesson-booking-rehearsal-readiness-boundary.mjs',
  'lesson_booking_provider_rehearsal_readiness_scenarios.sql',
], 'Booking CI Phase 4C5B1 coverage');

console.log('Phase 4C5B1 provider rehearsal readiness/history boundary checks passed.');
