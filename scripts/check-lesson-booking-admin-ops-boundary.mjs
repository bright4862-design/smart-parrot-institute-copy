#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20260920122000_lesson_booking_phase4a_admin_ops.sql', import.meta.url), 'utf8');
const scenarios = readFileSync(new URL('../supabase/tests/lesson_booking_admin_ops_scenarios.sql', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/lesson-booking-foundation.yml', import.meta.url), 'utf8');

const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

for (const required of [
  'public.admin_review_cases',
  'public.admin_review_case_events',
  'public.admin_evidence_access_log',
  'private.smart_parrot_require_admin',
  "p.role = 'admin'",
  'public.admin_open_review_case',
  'public.admin_resolve_review_case',
  'public.admin_review_queue',
  'public.admin_export_booking_evidence',
  "b.status='hold_failed'",
  'b.settlement_last_error_at is not null',
  'b.cancellation_last_error_at is not null',
  'o.dead_lettered_at is not null',
  "'smart_parrot_booking_evidence_v1'",
  "'minimized_v1'",
  "p_purpose='payment_dispute'",
  "p_purpose='legal_compliance'",
  'admin_evidence_access_log_append_only',
]) expect(migration.includes(required), `Phase 4A migration missing invariant: ${required}`);

for (const signature of [
  'public.admin_open_review_case(uuid,text,text,text)',
  'public.admin_resolve_review_case(uuid,text)',
  'public.admin_review_queue(int,timestamptz)',
  'public.admin_export_booking_evidence(uuid,text)',
]) {
  expect(
    migration.includes(`revoke all on function ${signature}`) &&
    migration.includes(`grant execute on function ${signature} to authenticated`),
    `${signature} must be callable only through the authenticated RPC boundary`,
  );
}

for (const table of ['admin_review_cases','admin_review_case_events','admin_evidence_access_log']) {
  expect(
    migration.includes(`revoke all on table public.${table} from anon, authenticated`),
    `${table} must have no direct browser table grants`,
  );
}

const exportStart = migration.indexOf('create or replace function public.admin_export_booking_evidence');
const exportSlice = exportStart >= 0 ? migration.slice(exportStart) : '';
for (const forbidden of ['e.raw', 'e.ip', 'e.user_agent', 'c.ip', 'c.user_agent', 'r.request_ip', 'r.user_agent']) {
  expect(!exportSlice.includes(forbidden), `Evidence export must not expose ${forbidden}`);
}
expect(exportSlice.includes("case when p_purpose='payment_dispute' then e.external_id else null end"), 'Provider attendance references must be purpose-gated');
expect(exportSlice.includes("case when p_purpose='payment_dispute' then l.stripe_object_id else null end"), 'Payment references must be purpose-gated');
expect(exportSlice.includes("case when p_purpose='legal_compliance' then r.declaration_contact else null end"), 'Withdrawal contact must be legal-compliance-only');

for (const required of [
  'Admin case idempotency mismatch',
  'Admin queue mismatch',
  'Minimized evidence packet leaked sensitive/provider data',
  'Payment dispute packet missing provider correlation IDs',
  'Non-admin queue access unexpectedly succeeded',
  'Evidence export audit missing',
  'Append-only evidence access log accepted update',
]) expect(scenarios.includes(required), `Phase 4A executable scenario missing: ${required}`);

expect(workflow.includes('check-lesson-booking-admin-ops-boundary.mjs'), 'CI must execute the Phase 4A static boundary regression');
expect(workflow.includes('lesson_booking_admin_ops_scenarios.sql'), 'CI must execute the Phase 4A PostgreSQL scenarios');

if (failures.length) {
  console.error('Lesson booking Phase 4A admin operations boundary failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Lesson booking Phase 4A admin operations boundary passed (admin-only queue, purpose-limited evidence export, no raw/IP/UA leakage, auditable access, retry-safe case lifecycle).');
