const PROOF_SCHEMA = 'smart_parrot_booking_preview_launch_blocker_notifier_proof_v1';
const QUEUE_SCHEMA = 'smart_parrot_booking_preview_launch_blocker_escalation_queue_v1';
const PROOF_RPC = 'service_record_booking_preview_launch_blocker_trusted_delivery_proof';
const QUEUE_RPC = 'service_prepare_booking_preview_launch_blocker_escalation_queue';

const PROOF_KINDS = new Set(['receipt_id_hash', 'message_id_hash']);
const SEVERITIES = new Set(['info', 'warning', 'critical']);
const AGE_CLASSES = new Set(['fresh', 'aging', 'overdue']);
const ESCALATION_CLASSES = new Set(['none', 'review', 'urgent']);

function requirePositiveId(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function requireHex(value, length, name) {
  const normalized = String(value ?? '').trim().toLowerCase();
  const matcher = new RegExp(`^[0-9a-f]{${length}}$`);
  if (!matcher.test(normalized) || /^0+$/.test(normalized)) throw new Error(`${name} must be ${length} lowercase hex characters`);
  return normalized;
}

function requireTimestamp(value, name) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${name} must be an ISO timestamp`);
  return parsed.toISOString();
}

function requireFailClosed(raw, keys, label) {
  for (const key of keys) {
    if (raw[key] !== false) throw new Error(`${label} cannot authorize or suppress execution`);
  }
  if (raw.server_time_authoritative !== true) throw new Error(`${label} must use server time`);
}

export function normalizePreviewLaunchBlockerTrustedDeliveryProof(raw = {}) {
  if (raw.schema_version !== PROOF_SCHEMA) throw new Error('Unexpected preview notifier proof schema');
  if (!PROOF_KINDS.has(raw.proof_kind)) throw new Error('Invalid preview notifier proof kind');
  if (raw.trusted_notifier_proof_accepted !== true) throw new Error('Trusted notifier proof must be accepted by the server');
  if (typeof raw.replay !== 'boolean') throw new Error('Invalid preview notifier proof replay flag');
  requireFailClosed(raw, [
    'outcome_suppresses_blocker',
    'notifier_send_authorized',
    'provider_write_authorized',
    'booking_launch_authorized',
    'destructive_cleanup_authorized',
  ], 'Preview notifier proof');

  return Object.freeze({
    schema_version: PROOF_SCHEMA,
    proof_id: requirePositiveId(raw.proof_id, 'proof_id'),
    delivered_receipt_id: requirePositiveId(raw.delivered_receipt_id, 'delivered_receipt_id'),
    snapshot_id: requirePositiveId(raw.snapshot_id, 'snapshot_id'),
    alert_id: requirePositiveId(raw.alert_id, 'alert_id'),
    delivery_key: requireHex(raw.delivery_key, 32, 'delivery_key'),
    proof_kind: raw.proof_kind,
    proof_hash: requireHex(raw.proof_hash, 64, 'proof_hash'),
    recorded_at: requireTimestamp(raw.recorded_at, 'recorded_at'),
    replay: raw.replay,
    trusted_notifier_proof_accepted: true,
    outcome_suppresses_blocker: false,
    notifier_send_authorized: false,
    provider_write_authorized: false,
    booking_launch_authorized: false,
    destructive_cleanup_authorized: false,
    server_time_authoritative: true,
  });
}

export function normalizePreviewLaunchBlockerEscalationQueue(raw = {}) {
  if (raw.schema_version !== QUEUE_SCHEMA) throw new Error('Unexpected preview escalation queue schema');
  if (!SEVERITIES.has(raw.severity)) throw new Error('Invalid preview escalation queue severity');
  if (!AGE_CLASSES.has(raw.age_class)) throw new Error('Invalid preview escalation queue age class');
  if (!ESCALATION_CLASSES.has(raw.escalation_class)) throw new Error('Invalid preview escalation queue class');
  if (!Number.isSafeInteger(raw.blocker_count) || raw.blocker_count < 1) throw new Error('Invalid preview escalation blocker count');
  if (typeof raw.replay !== 'boolean' || typeof raw.queue_required !== 'boolean') throw new Error('Invalid preview escalation queue state');
  requireFailClosed(raw, [
    'automatic_notification_authorized',
    'outcome_suppresses_blocker',
    'provider_write_authorized',
    'booking_launch_authorized',
    'destructive_cleanup_authorized',
  ], 'Preview escalation queue');

  const deliveryKey = requireHex(raw.delivery_key, 32, 'delivery_key');
  if (!raw.queue_required) {
    if (raw.queue_item_id !== null || raw.queued_at !== null || raw.escalation_class !== 'none') {
      throw new Error('Non-escalated preview blocker cannot create queue work');
    }
    return Object.freeze({
      schema_version: QUEUE_SCHEMA,
      queue_item_id: null,
      snapshot_id: requirePositiveId(raw.snapshot_id, 'snapshot_id'),
      alert_id: requirePositiveId(raw.alert_id, 'alert_id'),
      delivery_key: deliveryKey,
      severity: raw.severity,
      age_class: raw.age_class,
      escalation_class: raw.escalation_class,
      blocker_count: raw.blocker_count,
      queued_at: null,
      replay: raw.replay,
      queue_required: false,
      automatic_notification_authorized: false,
      outcome_suppresses_blocker: false,
      provider_write_authorized: false,
      booking_launch_authorized: false,
      destructive_cleanup_authorized: false,
      server_time_authoritative: true,
    });
  }

  if (!['review', 'urgent'].includes(raw.escalation_class)) throw new Error('Queued preview blocker must require review or urgent work');
  return Object.freeze({
    schema_version: QUEUE_SCHEMA,
    queue_item_id: requirePositiveId(raw.queue_item_id, 'queue_item_id'),
    snapshot_id: requirePositiveId(raw.snapshot_id, 'snapshot_id'),
    alert_id: requirePositiveId(raw.alert_id, 'alert_id'),
    delivery_key: deliveryKey,
    severity: raw.severity,
    age_class: raw.age_class,
    escalation_class: raw.escalation_class,
    blocker_count: raw.blocker_count,
    queued_at: requireTimestamp(raw.queued_at, 'queued_at'),
    replay: raw.replay,
    queue_required: true,
    automatic_notification_authorized: false,
    outcome_suppresses_blocker: false,
    provider_write_authorized: false,
    booking_launch_authorized: false,
    destructive_cleanup_authorized: false,
    server_time_authoritative: true,
  });
}

export async function recordPreviewLaunchBlockerTrustedDeliveryProof({
  transport,
  snapshotId,
  deliveryKey,
  proofKind,
  proofHash,
}) {
  if (!transport || typeof transport.invokeServer !== 'function') {
    throw new Error('Approved preview Supabase transport is required');
  }
  const normalizedProofKind = String(proofKind ?? '').trim();
  if (!PROOF_KINDS.has(normalizedProofKind)) throw new Error('Invalid preview notifier proof kind');
  const raw = await transport.invokeServer({
    target: PROOF_RPC,
    auth: 'service_rpc',
    payload: {
      p_snapshot_id: requirePositiveId(snapshotId, 'snapshot_id'),
      p_delivery_key: requireHex(deliveryKey, 32, 'delivery_key'),
      p_proof_kind: normalizedProofKind,
      p_proof_hash: requireHex(proofHash, 64, 'proof_hash'),
    },
  });
  return normalizePreviewLaunchBlockerTrustedDeliveryProof(raw);
}

export async function preparePreviewLaunchBlockerEscalationQueue({ transport, snapshotId }) {
  if (!transport || typeof transport.invokeServer !== 'function') {
    throw new Error('Approved preview Supabase transport is required');
  }
  const raw = await transport.invokeServer({
    target: QUEUE_RPC,
    auth: 'service_rpc',
    payload: { p_snapshot_id: requirePositiveId(snapshotId, 'snapshot_id') },
  });
  return normalizePreviewLaunchBlockerEscalationQueue(raw);
}

export const PREVIEW_LAUNCH_BLOCKER_NOTIFIER_PROOF_SCHEMA = PROOF_SCHEMA;
export const PREVIEW_LAUNCH_BLOCKER_ESCALATION_QUEUE_SCHEMA = QUEUE_SCHEMA;
export const PREVIEW_LAUNCH_BLOCKER_NOTIFIER_PROOF_RPC = PROOF_RPC;
export const PREVIEW_LAUNCH_BLOCKER_ESCALATION_QUEUE_RPC = QUEUE_RPC;
export const PREVIEW_LAUNCH_BLOCKER_NOTIFIER_PROOF_KINDS = Object.freeze([...PROOF_KINDS]);
