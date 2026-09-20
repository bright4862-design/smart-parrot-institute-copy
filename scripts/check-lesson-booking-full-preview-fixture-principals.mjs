import assert from 'node:assert/strict';
import {
  PREVIEW_FIXTURE_WRITE_GATE,
  buildPreviewFixturePrincipalPlan,
  assertPreviewFixtureProvisioningAllowed,
  provisionPreviewFixturePrincipals,
  cleanupPreviewFixturePrincipals,
  buildBoundedSignedProviderRehearsalPreparation,
} from './lesson-booking-full-preview-fixture-principals.mjs';

const RUN_ID = '123e4567-e89b-42d3-a456-426614174000';
const NOW = Date.parse('2026-09-21T00:00:00.000Z');
const SECRET = 'sb_secret_preview_fixture_test_only';

assert.equal(PREVIEW_FIXTURE_WRITE_GATE, 'SMART_PARROT_PREVIEW_FIXTURE_WRITES_ENABLED');
const plan = buildPreviewFixturePrincipalPlan({ runId: RUN_ID, nowMs: NOW, ttlMinutes: 90 });
const samePlan = buildPreviewFixturePrincipalPlan({ runId: RUN_ID, nowMs: NOW, ttlMinutes: 90 });
assert.deepEqual(plan, samePlan);
assert.equal(plan.data_class, 'synthetic_only');
assert.equal(plan.principals.length, 2);
assert.deepEqual(plan.principals.map((item) => item.role), ['student', 'admin']);
assert.equal(new Set(plan.principals.map((item) => item.id)).size, 2);
assert.ok(plan.principals.every((item) => item.email.endsWith('@example.invalid')));
assert.ok(plan.principals.every((item) => item.user_metadata.data_class === 'synthetic'));
assert.throws(() => buildPreviewFixturePrincipalPlan({ runId: RUN_ID, previewRef: 'wrongpreviewref12345', nowMs: NOW }), /approved_preview_identity_required/);
assert.throws(() => buildPreviewFixturePrincipalPlan({ runId: RUN_ID, nowMs: NOW, ttlMinutes: 121 }), /fixture_ttl_out_of_bounds/);
assert.throws(() => assertPreviewFixtureProvisioningAllowed({ plan, writeGate: '0', secretKey: SECRET, nowMs: NOW }), /write_gate_closed/);
assert.throws(() => assertPreviewFixtureProvisioningAllowed({ plan, writeGate: '1', secretKey: 'sb_publishable_wrong', nowMs: NOW }), /secret_key_required/);
assert.throws(() => assertPreviewFixtureProvisioningAllowed({ plan, writeGate: '1', secretKey: 'eyJhbGciOiJIUzI1NiJ9.payload.signature', nowMs: NOW }), /secret_key_required/);

function makeHarness({ failRole = null, collision = false } = {}) {
  const users = new Map();
  const roles = new Map();
  const creates = [];
  const deletes = [];
  const passwords = [];
  if (collision) {
    users.set(plan.principals[0].id, { id: plan.principals[0].id, email: 'someone@example.invalid', user_metadata: {} });
  }
  const authAdmin = {
    async getUserById(id) {
      const user = users.get(id);
      return user ? { data: { user }, error: null } : { data: { user: null }, error: { status: 404, code: 'user_not_found', message: 'User not found' } };
    },
    async createUser(input) {
      creates.push(input);
      passwords.push(input.password);
      const user = { id: input.id, email: input.email, user_metadata: input.user_metadata };
      users.set(input.id, user);
      return { data: { user }, error: null };
    },
    async deleteUser(id) {
      deletes.push(id);
      users.delete(id);
      roles.delete(id);
      return { data: {}, error: null };
    },
  };
  const profileStore = {
    async setRole(id, role) {
      if (role === failRole) return { error: new Error(`role write failed:${role}`) };
      roles.set(id, role);
      return { error: null };
    },
    async getRole(id) {
      return { role: roles.get(id) ?? null, error: null };
    },
  };
  return { users, roles, creates, deletes, passwords, authAdmin, profileStore };
}

const harness = makeHarness();
const first = await provisionPreviewFixturePrincipals({
  plan,
  writeGate: '1',
  secretKey: SECRET,
  authAdmin: harness.authAdmin,
  profileStore: harness.profileStore,
  nowMs: NOW,
  passwordFactory: (role) => `runtime-${role}-password-with-more-than-24-chars`,
});
assert.equal(first.status, 'fixture_principals_ready');
assert.equal(first.created_count, 2);
assert.equal(first.reused_count, 0);
assert.equal(first.credentials_exposed, false);
assert.equal(first.provider_writes_enabled, false);
assert.equal(harness.creates.length, 2);
assert.ok(harness.passwords.every((password) => password.length >= 24));
assert.equal(new Set(harness.passwords).size, 2);
const serializedFirst = JSON.stringify(first);
assert.ok(!serializedFirst.includes('password'));
assert.ok(!plan.principals.some((principal) => serializedFirst.includes(principal.id) || serializedFirst.includes(principal.email)));

const second = await provisionPreviewFixturePrincipals({
  plan,
  writeGate: '1',
  secretKey: SECRET,
  authAdmin: harness.authAdmin,
  profileStore: harness.profileStore,
  nowMs: NOW,
  passwordFactory: () => 'this-password-should-never-be-used-again',
});
assert.equal(second.created_count, 0);
assert.equal(second.reused_count, 2);
assert.equal(harness.creates.length, 2, 'idempotent rerun must not create duplicate users');

const collisionHarness = makeHarness({ collision: true });
await assert.rejects(() => provisionPreviewFixturePrincipals({
  plan,
  writeGate: '1', secretKey: SECRET,
  authAdmin: collisionHarness.authAdmin, profileStore: collisionHarness.profileStore, nowMs: NOW,
}), /fixture_identity_collision:student/);
assert.equal(collisionHarness.creates.length, 0);
assert.equal(collisionHarness.deletes.length, 0, 'pre-existing collision must never be deleted');

const failureHarness = makeHarness({ failRole: 'admin' });
await assert.rejects(() => provisionPreviewFixturePrincipals({
  plan,
  writeGate: '1', secretKey: SECRET,
  authAdmin: failureHarness.authAdmin, profileStore: failureHarness.profileStore, nowMs: NOW,
  passwordFactory: (role) => `failure-${role}-password-with-more-than-24-chars`,
}), /role write failed:admin/);
assert.equal(failureHarness.creates.length, 2);
assert.equal(failureHarness.deletes.length, 2, 'partial provisioning must compensate every user created in this call');
assert.equal(failureHarness.users.size, 0);

const cleanup = await cleanupPreviewFixturePrincipals({
  plan,
  authAdmin: harness.authAdmin,
  linkageProbe: async (id) => id === plan.principals[0].id
    ? { booking_count: 1, consent_count: 1, stripe_link_count: 1 }
    : { booking_count: 0, consent_count: 0, stripe_link_count: 0 },
});
assert.equal(cleanup.status, 'fixture_cleanup_preserved_by_evidence');
assert.equal(cleanup.preserved_by_evidence_count, 1);
assert.equal(cleanup.deleted_count, 1);
assert.equal(cleanup.append_only_evidence_preserved, true);
assert.equal(cleanup.credentials_exposed, false);
assert.equal(harness.users.has(plan.principals[0].id), true, 'linked student principal must be preserved');
assert.equal(harness.users.has(plan.principals[1].id), false, 'unlinked admin principal may be deleted');

const blockedPrep = buildBoundedSignedProviderRehearsalPreparation({
  plan,
  fixtureSummary: first,
  stripeWebhookProof: { checkout_recent: true, dispute_recent: false },
  dailyWebhookProof: { signed_test_verified: true, state: 'ACTIVE' },
  nowMs: NOW,
});
assert.equal(blockedPrep.status, 'blocked');
assert.deepEqual(blockedPrep.blockers, ['stripe_dispute_signed_test_delivery']);
assert.equal(blockedPrep.provider_writes_enabled, false);

const readyPrep = buildBoundedSignedProviderRehearsalPreparation({
  plan,
  fixtureSummary: first,
  stripeWebhookProof: { checkout_recent: true, dispute_recent: true },
  dailyWebhookProof: { signed_test_verified: true, state: 'ACTIVE' },
  nowMs: NOW,
});
assert.equal(readyPrep.status, 'ready');
assert.equal(readyPrep.test_only, true);
assert.equal(readyPrep.synthetic_fixtures_only, true);
assert.equal(readyPrep.provider_writes_enabled, false);
assert.equal(readyPrep.requires_explicit_full_preview_write_gate, true);
assert.equal(readyPrep.credentials_exposed, false);

console.log('Phase 4C5H preview fixture principal/rehearsal preparation regression passed.');
