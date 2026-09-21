const RECEIPT_SCHEMA = 'smart_parrot_booking_preview_launch_blocker_delivery_receipt_v1';
const ESCALATION_SCHEMA = 'smart_parrot_booking_preview_launch_blocker_escalation_v1';
const RECEIPT_RPC = 'service_record_booking_preview_launch_blocker_delivery_receipt';
const ESCALATION_RPC = 'service_observe_booking_preview_launch_blocker_escalation';

const OUTCOMES = new Set(['prepared', 'delivered', 'failed', 'deferred']);
const SEVERITIES = new Set(['info', 'warning', 'critical']);
const AGE_CLASSES = new Set(['fresh', 'aging', 'overdue']);
const ESCALATION_CLASSES = new Set(['none', 'review', 'urgent']);
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

function requirePositiveId(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function requireTimestamp(value, name) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${name} must be an ISO timestamp`);
  return parsed.toISOString();
}

function normalizeBlockers(value) {
  if (!Array.isArray(value) || value.length < 1 || value.some((code) => !BLOCKER_CODES.has(code))) {
    throw new Error('Invalid preview launch-blocker code');
  }
  return Object.freeze([...value]);
}

function normalizeSeverity(value) {
  if (!SEVERITIES.has(value)) throw new Error('Invalid preview launch-blocker severity');
  return value;
}

function requireFailClosed(raw, keys, label) {
  for (const key of keys) {
    if (raw[key] !== false) throw new Error(`${label} cannot authorize or suppress execution`);
  }
  if (raw.server_time_authoritative !== true) throw new Error(`${label} must use server time`);
}

export function normalizePreviewLaunchBlockerDeliveryReceipt(raw = {}) {
  if (raw.schema_version !== RECEIPT_SCHEMA) throw new Error('Unexpected preview launch-blocker delivery receipt schema');
  if (!OUTCOMES.has(raw.outcome)) throw new Error('Invalid preview launch-blocker delivery outcome');
  if (!/^[0-9a-f]{32}$/.test(String(raw.delivery_key ?? ''))) throw new Error('Invalid preview launch-blocker delivery key');
  if (typeof raw.replay !== 'boolean') throw new Error('Invalid preview launch-blocker delivery replay flag');
  requireFailClosed(raw, [
    'outcome_suppresses_blocker',
    'notifier_send_authorized',
    'provider_write_authorized',
    'booking_launch_authorized',
    'destructive_cleanup_authorized',
  ], 'Preview launch-blocker delivery receipt');

  return Object.freeze({
    schema_version: RECEIPT_SCHEMA,
    receipt_id: requirePositiveId(raw.receipt_id, 'receipt_id'),
    snapshot_id: requirePositiveId(raw.snapshot_id, 'snapshot_id'),
    alert_id: requirePositiveId(raw.alert_id, 'alert_id'),
    delivery_key: raw.delivery_key,
    outcome: raw.outcome,
    blocker_codes: normalizeBlockers(raw.blocker_codes),
    severity: normalizeSeverity(raw.severity),
    handoff_prepared_at: requireTimestamp(raw.handoff_prepared_at, 'handoff_prepared_at'),
    recorded_at: requireTimestamp(raw.recorded_at, 'recorded_at'),
    replay: raw.replay,
    outcome_suppresses_blocker: false,
    notifier_send_authorized: false,
    provider_write_authorized: false,
    booking_launch_authorized: false,
    destructive_cleanup_authorized: false,
    server_time_authoritative: true,
  });
}

export function normalizePreviewLaunchBlockerEscalation(raw = {}) {
  if (raw.schema_version !== ESCALATION_SCHEMA) throw new Error('Unexpected preview launch-blocker escalation schema');
  if (!AGE_CLASSES.has(raw.age_class)) throw new Error('Invalid preview launch-blocker age class');
  if (!ESCALATION_CLASSES.has(raw.escalation_class)) throw new Error('Invalid preview launch-blocker escalation class');
  if (raw.blocker_unresolved !== true) throw new Error('Preview launch-blocker escalation requires an unresolved blocker');
  if (typeof raw.replay !== 'boolean') throw new Error('Invalid preview launch-blocker escalation replay flag');
  requireFailClosed(raw, [
    'automatic_notification_authorized',
    'outcome_suppresses_blocker',
    'provider_write_authorized',
    'booking_launch_authorized',
    'destructive_cleanup_authorized',
  ], 'Preview launch-blocker escalation');

  return Object.freeze({
    schema_version: ESCALATION_SCHEMA,
    observation_id: requirePositiveId(raw.observation_id, 'observation_id'),
    snapshot_id: requirePositiveId(raw.snapshot_id, 'snapshot_id'),
    alert_id: requirePositiveId(raw.alert_id, 'alert_id'),
    blocker_codes: normalizeBlockers(raw.blocker_codes),
    severity: normalizeSeverity(raw.severity),
    age_class: raw.age_class,
    escalation_class: raw.escalation_class,
    observed_at: requireTimestamp(raw.observed_at, 'observed_at'),
    replay: raw.replay,
    blocker_unresolved: true,
    automatic_notification_authorized: false,
    outcome_suppresses_blocker: false,
    provider_write_authorized: false,
    booking_launch_authorized: false,
    destructive_cleanup_authorized: false,
    server_time_authoritative: true,
  });
}

export async function recordPreviewLaunchBlockerDeliveryReceipt({ transport, snapshotId, outcome }) {
  if (!transport || typeof transport.invokeServer !== 'function') {
    throw new Error('Approved preview Supabase transport is required');
  }
  const normalizedOutcome = String(outcome ?? '').trim();
  if (!OUTCOMES.has(normalizedOutcome)) throw new Error('Invalid preview launch-blocker delivery outcome');
  if (normalizedOutcome === 'delivered') {
    throw new Error('Trusted notifier delivery proof is required before delivered can be recorded');
  }
  const raw = await transport.invokeServer({
    target: RECEIPT_RPC,
    auth: 'service_rpc',
    payload: {
      p_snapshot_id: requirePositiveId(snapshotId, 'snapshot_id'),
      p_outcome: normalizedOutcome,
    },
  });
  return normalizePreviewLaunchBlockerDeliveryReceipt(raw);
}

export async function observePreviewLaunchBlockerEscalation({ transport, snapshotId }) {
  if (!transport || typeof transport.invokeServer !== 'function') {
    throw new Error('Approved preview Supabase transport is required');
  }
  const raw = await transport.invokeServer({
    target: ESCALATION_RPC,
    auth: 'service_rpc',
    payload: { p_snapshot_id: requirePositiveId(snapshotId, 'snapshot_id') },
  });
  return normalizePreviewLaunchBlockerEscalation(raw);
}

export const PREVIEW_LAUNCH_BLOCKER_DELIVERY_RECEIPT_SCHEMA = RECEIPT_SCHEMA;
export const PREVIEW_LAUNCH_BLOCKER_ESCALATION_SCHEMA = ESCALATION_SCHEMA;
export const PREVIEW_LAUNCH_BLOCKER_DELIVERY_RECEIPT_RPC = RECEIPT_RPC;
export const PREVIEW_LAUNCH_BLOCKER_ESCALATION_RPC = ESCALATION_RPC;
export const PREVIEW_LAUNCH_BLOCKER_DELIVERY_OUTCOMES = Object.freeze([...OUTCOMES]);
