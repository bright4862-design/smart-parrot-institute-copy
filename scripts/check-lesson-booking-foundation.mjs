#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const foundationPath = new URL(
  '../supabase/migrations/20260920011000_lesson_booking_foundation.sql',
  import.meta.url,
);
const hardeningPath = new URL(
  '../supabase/migrations/20260920033000_lesson_booking_phase0b_hardening_and_slots.sql',
  import.meta.url,
);
const testPath = new URL(
  '../supabase/tests/lesson_booking_foundation_rls.test.sql',
  import.meta.url,
);

const foundation = readFileSync(foundationPath, 'utf8');
const hardening = readFileSync(hardeningPath, 'utf8');
const combined = `${foundation}\n${hardening}`;
const pgtap = readFileSync(testPath, 'utf8');

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

const tables = [
  'profiles',
  'stripe_links',
  'tutors',
  'lesson_types',
  'availability_windows',
  'policy_versions',
  'bookings',
  'attendance_events',
  'consents',
  'ledger_entries',
  'stripe_events',
];

expect(
  /create extension if not exists btree_gist;/i.test(foundation),
  'btree_gist extension is required for exclusion constraints',
);

for (const table of tables) {
  expect(
    new RegExp(`create table if not exists public\\.${table}\\b`, 'i').test(foundation),
    `missing table: ${table}`,
  );
  expect(
    new RegExp(`alter table public\\.${table} enable row level security;`, 'i').test(foundation),
    `RLS is not enabled for ${table}`,
  );
  expect(
    new RegExp(`revoke all on table public\\.${table} from anon, authenticated;`, 'i').test(foundation),
    `default browser grants are not revoked for ${table}`,
  );
}

for (const constraint of ['no_tutor_overlap', 'no_student_overlap']) {
  expect(
    new RegExp(`constraint ${constraint}[\\s\\S]*?exclude using gist`, 'i').test(foundation),
    `missing overlap exclusion constraint: ${constraint}`,
  );
}

for (const trigger of [
  'policy_versions_append_only',
  'attendance_append_only',
  'consents_append_only',
  'ledger_append_only',
]) {
  expect(
    new RegExp(`create trigger ${trigger}\\b`, 'i').test(foundation),
    `missing append-only trigger: ${trigger}`,
  );
}

expect(
  /grant update \(full_name, timezone\) on table public\.profiles to authenticated;/i.test(foundation),
  'profile updates are not column-scoped',
);
expect(
  !/grant\s+(insert|update|delete)[^;]*public\.(bookings|attendance_events|consents|ledger_entries)\s+to\s+(anon|authenticated)/i.test(
    foundation,
  ),
  'server-owned booking/evidence tables expose a browser write grant',
);
expect(
  /stripe_links and stripe_events intentionally have no client grants or policies/i.test(foundation),
  'server-only Stripe table intent is not documented',
);
expect(
  !/(sk_live_|sk_test_|sb_secret_[A-Za-z0-9_-]{12,})/.test(combined),
  'booking migrations appear to contain a secret credential',
);

for (const table of ['attendance_events', 'consents', 'ledger_entries']) {
  expect(
    new RegExp(
      `alter table public\\.${table}[\\s\\S]*?foreign key \\(booking_id\\) references public\\.bookings \\(id\\) on delete restrict;`,
      'i',
    ).test(hardening),
    `${table} must retain booking evidence with ON DELETE RESTRICT`,
  );
}

expect(
  /create schema if not exists private;/i.test(hardening),
  'private schema is required for privileged booking helpers',
);
expect(
  /create or replace function private\.smart_parrot_booking_handle_new_user\(\)[\s\S]*?security definer[\s\S]*?set search_path = ''/i.test(
    hardening,
  ),
  'Auth profile trigger helper must be private with a pinned search_path',
);
expect(
  /create trigger smart_parrot_booking_user_created\b/i.test(hardening)
    && /drop trigger if exists on_auth_user_created on auth\.users;/i.test(hardening),
  'generic Auth trigger must be replaced by the Smart Parrot-specific trigger',
);
expect(
  /drop function if exists public\.handle_new_user\(\);/i.test(hardening),
  'generic public Auth trigger helper must be removed',
);

expect(
  /create or replace function private\.smart_parrot_available_slots\([\s\S]*?security definer[\s\S]*?set search_path = ''/i.test(
    hardening,
  ),
  'slot discovery helper must be private, SECURITY DEFINER, and schema-qualified',
);
expect(
  /create or replace function public\.available_slots\([\s\S]*?security invoker[\s\S]*?set search_path = ''/i.test(
    hardening,
  ),
  'public free-slot RPC must remain SECURITY INVOKER',
);
expect(
  /availability range cannot exceed 31 days/i.test(hardening),
  'free-slot RPC must bound anonymous query windows',
);
expect(
  /b\.status <> 'cancelled'[\s\S]*?b\.slot && tstzrange\(c\.slot_start, c\.slot_end, '\[\)'\)/i.test(
    hardening,
  ),
  'free-slot helper must exclude overlapping non-cancelled bookings',
);
expect(
  /grant execute on function public\.available_slots\(uuid, timestamptz, timestamptz\)[\s\S]*?to anon, authenticated;/i.test(
    hardening,
  ),
  'free-slot RPC needs explicit anon/authenticated execute grants',
);

expect(
  /select plan\(21\);/i.test(pgtap),
  'pgTAP plan count changed unexpectedly',
);
for (const assertion of [
  'browser roles cannot write bookings',
  'database rejects overlapping tutor bookings',
  'database rejects overlapping student bookings',
  'cannot self-promote roles',
  'booking evidence foreign keys use ON DELETE RESTRICT rather than cascade',
  'Supabase Auth profile trigger is project-specific rather than generic',
  'public available_slots RPC executes as the caller',
  'booking-inspection helper is isolated in the private schema',
]) {
  expect(pgtap.includes(assertion), `pgTAP suite is missing assertion: ${assertion}`);
}

if (failures.length) {
  console.error('Lesson booking foundation contract failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Lesson booking foundation contract passed (${tables.length} RLS tables, immutable evidence, private privileged helpers, bounded slot RPC).`,
);
