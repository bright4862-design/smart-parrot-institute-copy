#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20260920111500_lesson_booking_phase3b_compliance_ux.sql', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/lib/lessonBookingApi.js', import.meta.url), 'utf8');
const myLessons = readFileSync(new URL('../src/pages/MyLessons.jsx', import.meta.url), 'utf8');
const policyPage = readFileSync(new URL('../src/pages/LessonBookingPolicy.jsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const auth = readFileSync(new URL('../src/lib/LessonBookingAuthContext.jsx', import.meta.url), 'utf8');
const cancellationHandler = readFileSync(new URL('../supabase/functions/cancel-booking/index.ts', import.meta.url), 'utf8');
const scenarios = readFileSync(new URL('../supabase/tests/lesson_booking_compliance_scenarios.sql', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/lesson-booking-foundation.yml', import.meta.url), 'utf8');

const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

for (const required of [
  'private.smart_parrot_booking_action_preview',
  'public.preview_booking_actions',
  'clock_timestamp()',
  'public.booking_compliance_status',
  'public.claim_compliance_notices',
  'for update skip locked',
  "locked_until = p_now + interval '10 minutes'",
  'public.complete_compliance_notice_delivery',
  'public.fail_compliance_notice_delivery',
  'public.list_compliance_delivery_alerts',
  'n.delivery_attempts >= 6',
  "'needs_attention'",
  'declaration_name',
  'declaration_contact',
  'compliance_notice_payload_enrichment',
]) expect(migration.includes(required), `Phase 3B migration missing invariant: ${required}`);

for (const signature of [
  'public.claim_compliance_notices(int,timestamptz)',
  'public.complete_compliance_notice_delivery(uuid,int,text,timestamptz)',
  'public.fail_compliance_notice_delivery(uuid,int,text,timestamptz)',
  'public.list_compliance_delivery_alerts(int,timestamptz)',
]) {
  expect(
    migration.includes(`revoke all on function ${signature}`) && migration.includes(`grant execute on function ${signature}`) && migration.includes('to service_role'),
    `${signature} must remain service-role-only`,
  );
}

expect(
  migration.includes('grant execute on function public.preview_booking_actions(uuid) to authenticated') &&
  migration.includes('grant execute on function public.booking_compliance_status(uuid) to authenticated'),
  'Only safe quote/status RPCs should be browser-authenticated',
);
expect(
  !/grant\s+execute\s+on\s+function\s+public\.(?:claim|complete|fail|list_compliance_delivery_alerts)[\s\S]*?to\s+authenticated/i.test(migration),
  'Delivery worker functions must never be executable by authenticated browsers',
);

for (const required of [
  "rpc('preview_booking_actions'", "rpc('booking_compliance_status'", "functions.invoke('cancel-booking'",
  "const requestBody = { booking_id: id, kind };", 'requestBody.declaration_name', 'requestBody.receipt_email',
  "select('id, tutor_id, lesson_type_id, policy_version_id, starts_at, ends_at, status, currency, final_amount_cents, outcome, cancelled_at, cancel_kind')",
]) expect(api.includes(required), `lessonBookingApi missing Phase 3B boundary: ${required}`);

const requestStart = api.indexOf('export async function requestBookingCancellation');
const requestSlice = requestStart >= 0 ? api.slice(requestStart) : '';
for (const forbidden of ['amount_cents:', 'requested_at:', 'policy_version_id:', 'payment_action:', 'starts_at:']) {
  expect(!requestSlice.includes(forbidden), `Browser cancellation request must not author ${forbidden}`);
}
expect(!/stripe_/i.test(requestSlice), 'Browser cancellation request must not send Stripe identifiers');

for (const required of [
  'Server-calculated cancellation charge',
  'actions?.withdrawal?.eligible',
  'Exercise withdrawal right',
  'Confirm withdrawal',
  'Name on declaration',
  'Email for acknowledgement',
  'durable-medium acknowledgement',
]) expect(myLessons.includes(required), `My Lessons UX missing: ${required}`);
expect(!myLessons.includes('free_cancel_hours'), 'My Lessons must not compute cancellation policy windows in the browser');
expect(!myLessons.includes('late_cancel_pct'), 'My Lessons must not compute cancellation percentages in the browser');

for (const required of [
  'getPolicyVersion', 'policy.terms_markdown', 'policy.terms_sha256', 'policy.published_at',
  'immutable policy version',
]) expect(policyPage.includes(required), `Versioned policy page missing: ${required}`);
expect(!policyPage.includes('dangerouslySetInnerHTML'), 'Policy Markdown must render as text, not unsanitized HTML');

for (const required of [
  'const MyLessons = lazy', 'const LessonBookingPolicy = lazy',
  'path="/my-lessons"', 'path="/lesson-booking-policy/:policyVersionId"',
]) expect(app.includes(required), `App routes missing Phase 3B route: ${required}`);
expect(auth.includes('currentLessonBookingReturnUrl()'), 'Magic-link login must return to the current lesson-booking route');

for (const required of [
  'withdrawalDeclaration(body, kind)', 'p_declaration_name: declarationName', 'p_declaration_contact: receiptEmail',
  "return responseError('withdrawal_declaration_incomplete', 422)", "withSupabase({ auth: 'user' }",
]) expect(cancellationHandler.includes(required), `cancel-booking missing withdrawal declaration boundary: ${required}`);
expect(!cancellationHandler.includes('p_now:'), 'Browser Edge Function must never pass a client-authored cancellation clock');
expect(!cancellationHandler.includes('p_amount'), 'Browser Edge Function must never pass a client-authored cancellation amount');

for (const required of [
  'Preview/prepare parity mismatch', 'declaration_name', 'declaration_contact',
  'provider_503', 'reclaimed before retry deadline', 'provider-test-message-123',
  'needs_attention', 'dead_letter', 'booking_compliance_status',
]) expect(scenarios.includes(required), `Phase 3B executable scenario missing: ${required}`);

expect(workflow.includes('check-lesson-booking-compliance-ux-boundary.mjs'), 'CI must execute the Phase 3B static boundary regression');
expect(workflow.includes('lesson_booking_compliance_scenarios.sql'), 'CI must execute the Phase 3B PostgreSQL scenarios');
expect(workflow.includes('src/pages/MyLessons.jsx'), 'CI path filters must include MyLessons.jsx');
expect(workflow.includes('src/pages/LessonBookingPolicy.jsx'), 'CI path filters must include LessonBookingPolicy.jsx');

if (failures.length) {
  console.error('Lesson booking Phase 3B compliance/UX boundary failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Lesson booking Phase 3B compliance/UX boundary passed (server quotes, explicit withdrawal declaration, immutable policy view, safe acknowledgement status, leased retries/dead-letter alert contract).');
