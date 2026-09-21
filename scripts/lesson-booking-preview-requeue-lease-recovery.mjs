const EXPIRY_OBSERVATION_SCHEMA = 'smart_parrot_booking_preview_launch_blocker_requeue_lease_expiry_observation_v1';
const EXPIRY_OBSERVER_RPC = 'service_observe_booking_preview_launch_blocker_requeue_expired_leases';
const LINEAGE_RE = /^rqg:(\d+):(\d+):(\d+):(\d+)$/;

function requirePositiveId(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function requireNonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}

function requireTimestamp(value, name) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${name} must be an ISO timestamp`);
  return parsed.toISOString();
}

function requireLineage(value, snapshotId, queueItemId) {
  const lineage = String(value ?? '');
  const match = LINEAGE_RE.exec(lineage);
  if (!match) throw new Error('Invalid preview requeue lineage reference');
  if (Number(match[1]) !== snapshotId || Number(match[2]) !== queueItemId) {
    throw new Error('Preview requeue lineage reference mismatch');
  }
  return lineage;
}

function requireFailClosed(raw) {
  for (const key of [
    'requeue_execution_authorized',
    'automatic_notification_authorized',
    'notifier_send_authorized',
    'outcome_suppresses_blocker',
    'provider_write_authorized',
    'booking_launch_authorized',
    'destructive_cleanup_authorized',
  ]) {
    if (raw[key] !== false) throw new Error('Preview requeue expiry observer cannot authorize execution, notification, providers, launch, or cleanup');
  }
  if (raw.server_time_authoritative !== true) throw new Error('Preview requeue expiry observer must use server time');
}

export function normalizePreviewRequeueLeaseExpiryObservation(raw = {}) {
  if (raw.schema_version !== EXPIRY_OBSERVATION_SCHEMA) throw new Error('Unexpected preview requeue lease expiry observation schema');
  requireFailClosed(raw);
  if (!Array.isArray(raw.items)) throw new Error('Preview requeue lease expiry observation items must be an array');
  if (requireNonNegativeInteger(raw.item_count, 'item_count') !== raw.items.length) {
    throw new Error('Preview requeue lease expiry observation count mismatch');
  }

  const items = raw.items.map((item) => {
    const snapshotId = requirePositiveId(item.snapshot_id, 'snapshot_id');
    const queueItemId = requirePositiveId(item.queue_item_id, 'queue_item_id');
    const leaseGenerationNo = requirePositiveId(item.lease_generation_no, 'lease_generation_no');
    if (leaseGenerationNo > 3) throw new Error('lease_generation_no exceeds the bounded requeue limit');
    if (item.expiry_reason !== 'lease_timeout') throw new Error('Unexpected preview requeue lease expiry reason');
    const leaseExpiresAt = requireTimestamp(item.lease_expires_at, 'lease_expires_at');
    const observedAt = requireTimestamp(item.observed_at, 'observed_at');
    if (new Date(observedAt).getTime() < new Date(leaseExpiresAt).getTime()) {
      throw new Error('Preview requeue lease expiry cannot be observed before server lease expiry');
    }
    return Object.freeze({
      expiry_id: requirePositiveId(item.expiry_id, 'expiry_id'),
      claim_event_id: requirePositiveId(item.claim_event_id, 'claim_event_id'),
      activation_id: requirePositiveId(item.activation_id, 'activation_id'),
      work_generation_id: requirePositiveId(item.work_generation_id, 'work_generation_id'),
      queue_item_id: queueItemId,
      snapshot_id: snapshotId,
      alert_id: requirePositiveId(item.alert_id, 'alert_id'),
      lineage_ref: requireLineage(item.lineage_ref, snapshotId, queueItemId),
      lease_generation_no: leaseGenerationNo,
      lease_expires_at: leaseExpiresAt,
      expiry_reason: 'lease_timeout',
      observed_at: observedAt,
    });
  });

  return Object.freeze({
    schema_version: EXPIRY_OBSERVATION_SCHEMA,
    captured_at: requireTimestamp(raw.captured_at, 'captured_at'),
    item_count: items.length,
    items: Object.freeze(items),
    requeue_execution_authorized: false,
    automatic_notification_authorized: false,
    notifier_send_authorized: false,
    outcome_suppresses_blocker: false,
    provider_write_authorized: false,
    booking_launch_authorized: false,
    destructive_cleanup_authorized: false,
    server_time_authoritative: true,
  });
}

export async function observeExpiredPreviewRequeueLeases({ transport, limit = 25 } = {}) {
  if (!transport || typeof transport.invokeServer !== 'function') throw new Error('Approved preview Supabase transport is required');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('limit must be between 1 and 100');
  return normalizePreviewRequeueLeaseExpiryObservation(await transport.invokeServer({
    target: EXPIRY_OBSERVER_RPC,
    auth: 'service_rpc',
    payload: { p_limit: limit },
  }));
}

export const PREVIEW_REQUEUE_LEASE_EXPIRY_OBSERVATION_SCHEMA = EXPIRY_OBSERVATION_SCHEMA;
export const PREVIEW_REQUEUE_LEASE_EXPIRY_OBSERVER_RPC = EXPIRY_OBSERVER_RPC;
