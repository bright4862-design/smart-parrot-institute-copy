const ACK_SCHEMA = 'smart_parrot_booking_preview_launch_blocker_ack_v1';
const ACK_RPC = 'service_record_booking_preview_launch_blocker_acknowledgement';
const HANDOFF_RPC = 'service_prepare_booking_preview_launch_blocker_alert_handoff';

const DECISIONS = new Set([
  'investigate',
  'provider_configuration_required',
  'rehearsal_required',
  'hold_launch',
]);
const SEVERITIES = new Set(['info', 'warning', 'critical']);
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
  if (!Array.isArray(value) || value.some((code) => !BLOCKER_CODES.has(code))) {
    throw new Error('Invalid preview launch-blocker code');
  }
  return Object.freeze([...value]);
}

function normalizeSeverity(value) {
  if (!SEVERITIES.has(value)) throw new Error('Invalid preview launch-blocker severity');
  return value;
}

export function normalizePreviewLaunchBlockerAcknowledgement(raw = {}) {
  if (raw.schema_version !== ACK_SCHEMA) throw new Error('Unexpected preview launch-blocker acknowledgement schema');
  if (!DECISIONS.has(raw.decision)) throw new Error('Invalid preview launch-blocker runbook decision');
  if (raw.acknowledgement_suppresses_blocker !== false
      || raw.provider_write_authorized !== false
      || raw.booking_launch_authorized !== false
      || raw.destructive_cleanup_authorized !== false) {
    throw new Error('Preview launch-blocker acknowledgement cannot bypass blockers or authorize execution');
  }
  if (raw.server_time_authoritative !== true) throw new Error('Preview launch-blocker acknowledgement must use server time');
  if (typeof raw.replay !== 'boolean') throw new Error('Invalid preview launch-blocker acknowledgement replay flag');

  return Object.freeze({
    schema_version: ACK_SCHEMA,
    acknowledgement_id: requirePositiveId(raw.acknowledgement_id, 'acknowledgement_id'),
    snapshot_id: requirePositiveId(raw.snapshot_id, 'snapshot_id'),
    alert_id: requirePositiveId(raw.alert_id, 'alert_id'),
    decision: raw.decision,
    blocker_codes: normalizeBlockers(raw.blocker_codes),
    severity: normalizeSeverity(raw.severity),
    snapshot_captured_at: requireTimestamp(raw.snapshot_captured_at, 'snapshot_captured_at'),
    alert_recorded_at: requireTimestamp(raw.alert_recorded_at, 'alert_recorded_at'),
    acknowledged_at: requireTimestamp(raw.acknowledged_at, 'acknowledged_at'),
    replay: raw.replay,
    acknowledgement_suppresses_blocker: false,
    provider_write_authorized: false,
    booking_launch_authorized: false,
    destructive_cleanup_authorized: false,
    server_time_authoritative: true,
  });
}

export function normalizePreviewLaunchBlockerAlertHandoff(raw = {}) {
  return Object.freeze({
    snapshot_id: requirePositiveId(raw.snapshot_id, 'snapshot_id'),
    alert_id: requirePositiveId(raw.alert_id, 'alert_id'),
    blocker_codes: normalizeBlockers(raw.blocker_codes),
    severity: normalizeSeverity(raw.severity),
    snapshot_captured_at: requireTimestamp(raw.snapshot_captured_at, 'snapshot_captured_at'),
    alert_recorded_at: requireTimestamp(raw.alert_recorded_at, 'alert_recorded_at'),
    prepared_at: requireTimestamp(raw.prepared_at, 'prepared_at'),
  });
}

export async function recordPreviewLaunchBlockerAcknowledgement({ transport, snapshotId, decision }) {
  if (!transport || typeof transport.invokeServer !== 'function') {
    throw new Error('Approved preview Supabase transport is required');
  }
  const normalizedDecision = String(decision ?? '').trim();
  if (!DECISIONS.has(normalizedDecision)) throw new Error('Invalid preview launch-blocker runbook decision');
  const raw = await transport.invokeServer({
    target: ACK_RPC,
    auth: 'service_rpc',
    payload: {
      p_snapshot_id: requirePositiveId(snapshotId, 'snapshot_id'),
      p_decision: normalizedDecision,
    },
  });
  return normalizePreviewLaunchBlockerAcknowledgement(raw);
}

export async function preparePreviewLaunchBlockerAlertHandoff({ transport, snapshotId }) {
  if (!transport || typeof transport.invokeServer !== 'function') {
    throw new Error('Approved preview Supabase transport is required');
  }
  const raw = await transport.invokeServer({
    target: HANDOFF_RPC,
    auth: 'service_rpc',
    payload: { p_snapshot_id: requirePositiveId(snapshotId, 'snapshot_id') },
  });
  return normalizePreviewLaunchBlockerAlertHandoff(raw);
}

export const PREVIEW_LAUNCH_BLOCKER_ACK_SCHEMA = ACK_SCHEMA;
export const PREVIEW_LAUNCH_BLOCKER_ACK_RPC = ACK_RPC;
export const PREVIEW_LAUNCH_BLOCKER_HANDOFF_RPC = HANDOFF_RPC;
export const PREVIEW_LAUNCH_BLOCKER_RUNBOOK_DECISIONS = Object.freeze([...DECISIONS]);
