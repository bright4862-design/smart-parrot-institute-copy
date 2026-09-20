#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260920052500_lesson_booking_phase1a_reservation_rpc.sql', import.meta.url),
  'utf8',
);
const edge = readFileSync(
  new URL('../supabase/functions/create-booking/index.ts', import.meta.url),
  'utf8',
);
const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
const pgtap = readFileSync(
  new URL('../supabase/tests/lesson_booking_foundation_rls.test.sql', import.meta.url),
  'utf8',
);

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(
  /add column if not exists client_request_id uuid;/i.test(migration),
  'bookings must store a UUID client_request_id',
);
expect(
  /create unique index if not exists bookings_student_request_id_unique[\s\S]*?student_id, client_request_id[\s\S]*?client_request_id is not null;/i.test(migration),
  'reservation idempotency must be unique per student',
);
expect(
  /create or replace function public\.create_booking_reservation\([\s\S]*?security definer[\s\S]*?set search_path = ''/i.test(migration),
  'reservation RPC must be SECURITY DEFINER with a pinned empty search_path',
);
expect(
  /revoke all on function public\.create_booking_reservation\([\s\S]*?from public, anon, authenticated;/i.test(migration),
  'browser roles must not execute the reservation RPC directly',
);
expect(
  /grant execute on function public\.create_booking_reservation\([\s\S]*?to service_role;/i.test(migration),
  'reservation RPC must be service-role-only',
);

for (const requiredBoundary of [
  "from public.lesson_types lt",
  "from public.policy_versions pv",
  "private.smart_parrot_available_slots(",
  "insert into public.bookings",
  "insert into public.consents",
  "express_start_request_required",
  "idempotency_key_reused",
  "slot_taken",
]) {
  expect(
    migration.toLowerCase().includes(requiredBoundary.toLowerCase()),
    `reservation transaction is missing boundary: ${requiredBoundary}`,
  );
}

expect(
  /v_late_surcharge_pct\s*:=\s*\(v_policy\.config\s*->>\s*'late_surcharge_pct'\)::numeric/i.test(migration)
    && /v_max_charge_cents\s*:=\s*round\([\s\S]*?v_lesson\.on_time_price_cents[\s\S]*?v_late_surcharge_pct/i.test(migration),
  'reservation price must be recomputed from server-owned lesson/policy rows',
);
expect(
  /v_hold_strategy := 'at_checkout'[\s\S]*?v_hold_strategy := 'deferred'/i.test(migration),
  'reservation must choose hold strategy server-side',
);

expect(
  /withSupabase\(\{ auth: 'user' \}/.test(edge),
  'create-booking Edge Function must require an authenticated Supabase user',
);
expect(
  /ctx\.userClaims\?\.id/.test(edge),
  'create-booking must derive student identity from verified user claims',
);
expect(
  /ctx\.supabaseAdmin\.rpc\('create_booking_reservation'/.test(edge),
  'create-booking must delegate the privileged atomic write to the reservation RPC',
);
expect(
  !/body\.(?:student_id|tutor_id|on_time_price_cents|max_charge_cents|currency|policy_version_id|duration_minutes)/.test(edge),
  'create-booking must not trust browser-owned identity, price, policy, currency, tutor, or duration',
);
expect(
  !/\.from\(['"](?:bookings|consents)['"]\)[\s\S]*?\.(?:insert|update|upsert|delete)\(/i.test(edge),
  'create-booking must not split booking and consent into separate Edge Function writes',
);
expect(
  !/stripe/i.test(edge),
  'Phase 1A create-booking must remain payment-free until reservation tests are green',
);
expect(
  /case 'slot_taken':[\s\S]*?case 'slot_unavailable':[\s\S]*?status: 409/i.test(edge),
  'slot races must map to a stable 409 response',
);
expect(
  /case 'express_start_request_required':[\s\S]*?status: 422/i.test(edge),
  'missing EU express-start consent must map to 422',
);
expect(
  /\[functions\.create-booking\][\s\S]*?verify_jwt = true/i.test(config),
  'Supabase config must keep platform JWT verification enabled for create-booking',
);

expect(/select plan\(26\);/i.test(pgtap), 'pgTAP reservation plan must contain 26 assertions');
for (const assertion of [
  'bookings carry a UUID idempotency key',
  'booking idempotency key is unique per student',
  'reservation RPC is SECURITY DEFINER with an empty search_path',
  'browser roles cannot call the privileged reservation RPC directly',
  'service role alone can reserve and the payload helper stays private/invoker',
]) {
  expect(pgtap.includes(assertion), `pgTAP suite is missing reservation assertion: ${assertion}`);
}

if (failures.length) {
  console.error('Lesson booking reservation boundary failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Lesson booking reservation boundary passed (atomic consent, idempotency, server authority, auth gate).');
