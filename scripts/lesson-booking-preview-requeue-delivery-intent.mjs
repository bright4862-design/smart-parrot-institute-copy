const DELIVERY_INTENT_SCHEMA = 'smart_parrot_booking_preview_launch_blocker_requeue_delivery_intent_v1';
const DELIVERY_INTENT_RPC = 'service_prepare_booking_preview_launch_blocker_requeue_delivery_intent';
const LINEAGE_RE = /^rqg:(\d+):(\d+):(\d+):(\d+)$/;
const INTENT_KEY_RE = /^rqi:(\d+):(\d+):([1-3])$/;

function requirePositiveId(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
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

function requireIntentKey(value, activationId, claimEventId, leaseGenerationNo) {
  const key = String(value ?? '');
  const match = INTENT_KEY_RE.exec(key);
  if (!match) throw new Error('Invalid preview requeue delivery intent key');
  if (
    Number(match[1]) !== activationId
    || Number(match[2]) !== claimEventId
    || Number(match[3]) !== leaseGenerationNo
  ) {
    throw new Error('Preview requeue delivery intent key mismatch');
  }
  return key;
}

function requireFailClosed(raw) {
  for (const key of [
    'external_notification_http_authorized',
    'delivery_assertion_authorized',
    'requeue_execution_authorized',
    'automatic_notification_authorized',
    'notifier_send_authorized',
    'outcome_suppresses_blocker',
    'provider_write_authorized',
    'booking_launch_authorized',
    'destructive_cleanup_authorized',
  ]) {
    if (raw[key] !== false) {
      throw new Error('Preview requeue delivery intent cannot authorize HTTP delivery, notification, providers, launch, or cleanup');
    }
  }
  if (raw.server_time_authoritative !== true) {
    throw new Error('Preview requeue delivery intent must use server time');
  }
}

export function normalizePreviewRequeueDeliveryIntent(raw = {}) {
  if (raw.schema_version !== DELIVERY_INTENT_SCHEMA) {
    throw new Error('Unexpected preview requeue delivery intent schema');
  }
  if (raw.intent_state !== 'prepared') {
    throw new Error('Preview requeue delivery intent must remain prepared');
  }
  if (raw.transport_scope !== 'provider_neutral_preview') {
    throw new Error('Unexpected preview requeue delivery transport scope');
  }
  if (typeof raw.replay !== 'boolean') {
    throw new Error('Invalid preview requeue delivery intent replay flag');
  }
  requireFailClosed(raw);

  const snapshotId = requirePositiveId(raw.snapshot_id, 'snapshot_id');
  const queueItemId = requirePositiveId(raw.queue_item_id, 'queue_item_id');
  const activationId = requirePositiveId(raw.activation_id, 'activation_id');
  const claimEventId = requirePositiveId(raw.claim_event_id, 'claim_event_id');
  const leaseGenerationNo = requirePositiveId(raw.lease_generation_no, 'lease_generation_no');
  if (leaseGenerationNo > 3) {
    throw new Error('lease_generation_no exceeds the bounded requeue limit');
  }

  const preparedAt = requireTimestamp(raw.prepared_at, 'prepared_at');
  const leaseExpiresAt = requireTimestamp(raw.lease_expires_at, 'lease_expires_at');
  if (new Date(preparedAt).getTime() >= new Date(leaseExpiresAt).getTime()) {
    throw new Error('Preview requeue delivery intent must be prepared before lease expiry');
  }

  return Object.freeze({
    schema_version: DELIVERY_INTENT_SCHEMA,
    intent_id: requirePositiveId(raw.intent_id, 'intent_id'),
    claim_event_id: claimEventId,
    activation_id: activationId,
    work_generation_id: requirePositiveId(raw.work_generation_id, 'work_generation_id'),
    queue_item_id: queueItemId,
    snapshot_id: snapshotId,
    alert_id: requirePositiveId(raw.alert_id, 'alert_id'),
    lineage_ref: requireLineage(raw.lineage_ref, snapshotId, queueItemId),
    lease_generation_no: leaseGenerationNo,
    lease_expires_at: leaseExpiresAt,
    intent_key: requireIntentKey(raw.intent_key, activationId, claimEventId, leaseGenerationNo),
    intent_state: 'prepared',
    transport_scope: 'provider_neutral_preview',
    prepared_at: preparedAt,
    replay: raw.replay,
    external_notification_http_authorized: false,
    delivery_assertion_authorized: false,
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

export async function preparePreviewRequeueDeliveryIntent({ transport, claimEventId } = {}) {
  if (!transport || typeof transport.invokeServer !== 'function') {
    throw new Error('Approved preview Supabase transport is required');
  }
  return normalizePreviewRequeueDeliveryIntent(await transport.invokeServer({
    target: DELIVERY_INTENT_RPC,
    auth: 'service_rpc',
    payload: {
      p_claim_event_id: requirePositiveId(claimEventId, 'claim_event_id'),
    },
  }));
}

export const PREVIEW_REQUEUE_DELIVERY_INTENT_SCHEMA = DELIVERY_INTENT_SCHEMA;
export const PREVIEW_REQUEUE_DELIVERY_INTENT_RPC = DELIVERY_INTENT_RPC;
