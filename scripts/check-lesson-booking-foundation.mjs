#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const migrationPath = new URL(
  '../supabase/migrations/20260920011000_lesson_booking_foundation.sql',
  import.meta.url,
);
const testPath = new URL(
  '../supabase/tests/lesson_booking_foundation_rls.test.sql',
  import.meta.url,
);

const migration = readFileSync(migrationPath, 'utf8');
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
  /create extension if not exists btree_gist;/i.test(migration),
  'btree_gist extension is required for exclusion constraints',
);

for (const table of tables) {
  expect(
    new RegExp(`create table if not exists public\\.${table}\\b`, 'i').test(migration),
    `missing table: ${table}`,
  );
  expect(
    new RegExp(`alter table public\\.${table} enable row level security;`, 'i').test(migration),
    `RLS is not enabled for ${table}`,
  );
  expect(
    new RegExp(`revoke all on table public\\.${table} from anon, authenticated;`, 'i').test(migration),
    `default browser grants are not revoked for ${table}`,
  );
}

for (const constraint of ['no_tutor_overlap', 'no_student_overlap']) {
  expect(
    new RegExp(`constraint ${constraint}[\\s\\S]*?exclude using gist`, 'i').test(migration),
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
    new RegExp(`create trigger ${trigger}\\b`, 'i').test(migration),
    `missing append-only trigger: ${trigger}`,
  );
}

expect(
  /grant update \(full_name, timezone\) on table public\.profiles to authenticated;/i.test(migration),
  'profile updates are not column-scoped',
);
expect(
  !/grant\s+(insert|update|delete)[^;]*public\.(bookings|attendance_events|consents|ledger_entries)\s+to\s+(anon|authenticated)/i.test(
    migration,
  ),
  'server-owned booking/evidence tables expose a browser write grant',
);
expect(
  /stripe_links and stripe_events intentionally have no client grants or policies/i.test(migration),
  'server-only Stripe table intent is not documented',
);
expect(
  !/(sk_live_|sk_test_|sb_secret_[A-Za-z0-9_-]{12,})/.test(migration),
  'migration appears to contain a secret credential',
);

expect(
  /select plan\(15\);/i.test(pgtap),
  'pgTAP plan count changed unexpectedly',
);
expect(
  /browser roles cannot write bookings/i.test(pgtap),
  'pgTAP suite does not assert server-authoritative booking writes',
);
expect(
  /database rejects overlapping tutor bookings/i.test(pgtap)
    && /database rejects overlapping student bookings/i.test(pgtap),
  'pgTAP suite does not cover double-booking protection',
);
expect(
  /cannot self-promote roles/i.test(pgtap),
  'pgTAP suite does not cover role self-promotion protection',
);

if (failures.length) {
  console.error('Lesson booking foundation contract failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Lesson booking foundation contract passed (${tables.length} RLS tables, overlap guards, immutable evidence, least-privilege grants).`,
);
