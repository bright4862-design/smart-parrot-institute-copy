const SNAPSHOT_SCHEMA = 'smart_parrot_booking_preview_launch_blocker_snapshot_v1';
const RPC_NAME = 'service_record_booking_preview_launch_blocker_snapshot';

const RUNTIME_KEYS = [
  'provider_secret_bundle_ready',
  'preview_project_identity_ready',
  'stripe_account_identity_ready',
  'daily_webhook_identity_ready',
  'daily_signed_endpoint_ready',
  'fixture_principals_ready',
  'ephemeral_sessions_ready',
  'provider_e2e_gate_open',
  'worker_write_gate_open',
];

const CHECK_KEYS = [
  'schema_function_ready',
  'provider_secret_bundle_ready',
  'preview_project_identity_ready',
  'stripe_account_identity_ready',
  'daily_webhook_identity_ready',
  'stripe_checkout_signed_recent',
  'stripe_dispute_signed_recent',
  'daily_signed_endpoint_ready',
  'provider_rehearsal_recent',
  'fixture_principals_ready',
  'ephemeral_sessions_ready',
  'provider_e2e_gate_open',
  'worker_write_gate_open',
  'unresolved_provider_cleanup_count',
  'unresolved_terminal_reconciliation_count',
  'missing_terminal_evidence_count',
];

const BLOCKER_CODES = new Set([
  'schema_or_function_not_ready',
  'provider_secret_bundle_missing',
  'preview_project_identity_not_ready',
  'stripe_account_identity_not_ready',
  'daily_webhook_identity_not_ready',
  'stripe_checkout_signed_proof_stale_or_missing',
  'stripe_dispute_signed_proof_stale_or_missing',
  'daily_signed_endpoint_proof_missing',
  'provider_rehearsal_stale_or_missing',
  'fixture_principals_unavailable',
  'ephemeral_sessions_unavailable',
  'unresolved_provider_cleanup',
  'unresolved_terminal_reconciliation',
  'terminal_evidence_missing',
  'provider_e2e_gate_closed',
  'worker_write_gate_closed',
]);

const ALERT_KINDS = new Set([
  'unchanged',
  'initial_state',
  'became_blocked',
  'became_ready',
  'blockers_changed',
]);

function requireBoolean(value, name) {
  if (typeof value !== 'boolean') throw new Error(`${name} must be a boolean`);
  return value;
}

function requireCount(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}

export function normalizePreviewLaunchBlockerRuntimeReadiness(input = {}) {
  const normalized = {};
  for (const key of RUNTIME_KEYS) normalized[key] = requireBoolean(input[key], key);
  return Object.freeze(normalized);
}

export function normalizePreviewLaunchBlockerSnapshot(raw = {}) {
  if (raw.schema_version !== SNAPSHOT_SCHEMA) throw new Error('Unexpected preview launch-blocker snapshot schema');
  if (!Number.isSafeInteger(raw.snapshot_id) || raw.snapshot_id < 1) throw new Error('Invalid preview launch-blocker snapshot id');
  if (!['blocked', 'ready'].includes(raw.status)) throw new Error('Invalid preview launch-blocker snapshot status');
  if (!Array.isArray(raw.blocker_codes) || raw.blocker_codes.some((code) => !BLOCKER_CODES.has(code))) {
    throw new Error('Invalid preview launch-blocker blocker code');
  }
  if (raw.status === 'ready' && raw.blocker_codes.length !== 0) throw new Error('Ready snapshot cannot contain blockers');
  if (raw.status === 'blocked' && raw.blocker_codes.length === 0) throw new Error('Blocked snapshot must contain blockers');

  const capturedAt = new Date(raw.captured_at);
  if (Number.isNaN(capturedAt.getTime())) throw new Error('Invalid preview launch-blocker captured_at');

  const rawChecks = raw.checks && typeof raw.checks === 'object' ? raw.checks : {};
  const checks = {};
  for (const key of CHECK_KEYS) {
    checks[key] = key.endsWith('_count')
      ? requireCount(rawChecks[key], `checks.${key}`)
      : requireBoolean(rawChecks[key], `checks.${key}`);
  }

  const alert = raw.alert && typeof raw.alert === 'object' ? raw.alert : {};
  if (!ALERT_KINDS.has(alert.change_kind)) throw new Error('Invalid preview launch-blocker alert kind');
  const alertReplay = requireBoolean(alert.replay, 'alert.replay');
  const replay = requireBoolean(raw.replay, 'replay');

  if (raw.provider_write_authorized !== false
      || raw.booking_launch_authorized !== false
      || raw.destructive_cleanup_authorized !== false) {
    throw new Error('Preview launch-blocker evidence cannot authorize writes, launch, or cleanup');
  }
  if (raw.server_time_authoritative !== true) throw new Error('Preview launch-blocker evidence must be server-time authoritative');

  return Object.freeze({
    schema_version: SNAPSHOT_SCHEMA,
    snapshot_id: raw.snapshot_id,
    status: raw.status,
    blocker_codes: Object.freeze([...raw.blocker_codes]),
    captured_at: capturedAt.toISOString(),
    checks: Object.freeze(checks),
    alert: Object.freeze({ change_kind: alert.change_kind, replay: alertReplay }),
    replay,
    provider_write_authorized: false,
    booking_launch_authorized: false,
    destructive_cleanup_authorized: false,
    server_time_authoritative: true,
  });
}

export async function recordPreviewLaunchBlockerSnapshot({ transport, runtimeReadiness }) {
  if (!transport || typeof transport.invokeServer !== 'function') {
    throw new Error('Approved preview Supabase transport is required');
  }
  const runtime = normalizePreviewLaunchBlockerRuntimeReadiness(runtimeReadiness);
  const payload = Object.fromEntries(RUNTIME_KEYS.map((key) => [`p_${key}`, runtime[key]]));
  const raw = await transport.invokeServer({
    target: RPC_NAME,
    auth: 'service_rpc',
    payload,
  });
  return normalizePreviewLaunchBlockerSnapshot(raw);
}

export const PREVIEW_LAUNCH_BLOCKER_SNAPSHOT_SCHEMA = SNAPSHOT_SCHEMA;
export const PREVIEW_LAUNCH_BLOCKER_RPC = RPC_NAME;
export const PREVIEW_LAUNCH_BLOCKER_CODES = Object.freeze([...BLOCKER_CODES]);