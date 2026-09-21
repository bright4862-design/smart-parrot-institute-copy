const DISPATCH_PREFLIGHT_SCHEMA = 'smart_parrot_booking_preview_launch_blocker_requeue_dispatch_preflight_v1';
const DISPATCH_PREFLIGHT_RPC = 'service_prepare_booking_preview_launch_blocker_requeue_dispatch_preflight';
const LINEAGE_RE = /^rqg:(\d+):(\d+):(\d+):(\d+)$/;
const INTENT_KEY_RE = /^rqi:(\d+):(\d+):([1-3])$/;
const PREFLIGHT_KEY_RE = /^[0-9a-f]{32}$/;
const EXCLUSION_REASONS = new Set(['claim_closed', 'lease_expired', 'snapshot_superseded']);

function positiveId(value, name, { nullable = false } = {}) {
  if (nullable && value == null) return null;
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function timestamp(value, name) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${name} must be an ISO timestamp`);
  return parsed.toISOString();
}

function lineage(value, snapshotId, queueItemId) {
  const candidate = String(value ?? '');
  const match = LINEAGE_RE.exec(candidate);
  if (!match || Number(match[1]) !== snapshotId || Number(match[2]) !== queueItemId) {
    throw new Error('Preview requeue dispatch preflight lineage mismatch');
  }
  return candidate;
}

function intentKey(value, activationId, claimEventId, leaseGenerationNo) {
  const candidate = String(value ?? '');
  const match = INTENT_KEY_RE.exec(candidate);
  if (
    !match
    || Number(match[1]) !== activationId
    || Number(match[2]) !== claimEventId
    || Number(match[3]) !== leaseGenerationNo
  ) {
    throw new Error('Preview requeue dispatch preflight intent key mismatch');
  }
  return candidate;
}

function preflightKey(value) {
  const candidate = String(value ?? '').trim().toLowerCase();
  if (!PREFLIGHT_KEY_RE.test(candidate) || candidate === '0'.repeat(32)) {
    throw new Error('preflight_key must be a non-zero 32-character lowercase hex value');
  }
  return candidate;
}

function failClosed(raw) {
  for (const key of [
    'dispatch_authorized',
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
    if (raw[key] !== false) throw new Error('Preview requeue dispatch preflight must remain no-send and fail closed');
  }
  if (raw.server_time_authoritative !== true) {
    throw new Error('Preview requeue dispatch preflight must use server time');
  }
}

export function normalizePreviewRequeueDispatchPreflight(raw = {}) {
  if (raw.schema_version !== DISPATCH_PREFLIGHT_SCHEMA) {
    throw new Error('Unexpected preview requeue dispatch preflight schema');
  }
  if (!['ready_no_send', 'excluded'].includes(raw.decision)) {
    throw new Error('Unexpected preview requeue dispatch preflight decision');
  }
  if (raw.preflight_scope !== 'provider_neutral_preview') {
    throw new Error('Unexpected preview requeue dispatch preflight scope');
  }
  if (typeof raw.replay !== 'boolean') {
    throw new Error('Invalid preview requeue dispatch preflight replay flag');
  }
  failClosed(raw);

  const intentId = positiveId(raw.intent_id, 'intent_id');
  const claimEventId = positiveId(raw.claim_event_id, 'claim_event_id');
  const activationId = positiveId(raw.activation_id, 'activation_id');
  const queueItemId = positiveId(raw.queue_item_id, 'queue_item_id');
  const snapshotId = positiveId(raw.snapshot_id, 'snapshot_id');
  const leaseGenerationNo = positiveId(raw.lease_generation_no, 'lease_generation_no');
  if (leaseGenerationNo > 3) throw new Error('lease_generation_no exceeds the bounded requeue limit');

  const leaseExpiresAt = timestamp(raw.lease_expires_at, 'lease_expires_at');
  const observedAt = timestamp(raw.observed_at, 'observed_at');
  const preflightId = positiveId(raw.preflight_id, 'preflight_id', { nullable: true });
  const exclusionId = positiveId(raw.exclusion_id, 'exclusion_id', { nullable: true });

  let exclusionReason = null;
  if (raw.decision === 'ready_no_send') {
    if (preflightId == null || exclusionId != null || raw.exclusion_reason != null) {
      throw new Error('Ready preview requeue dispatch preflight has inconsistent evidence');
    }
    if (new Date(observedAt).getTime() >= new Date(leaseExpiresAt).getTime()) {
      throw new Error('Ready preview requeue dispatch preflight cannot be observed after lease expiry');
    }
  } else {
    if (exclusionId == null || !EXCLUSION_REASONS.has(raw.exclusion_reason)) {
      throw new Error('Excluded preview requeue dispatch preflight requires bounded exclusion evidence');
    }
    exclusionReason = raw.exclusion_reason;
    if (
      exclusionReason === 'lease_expired'
      && new Date(observedAt).getTime() < new Date(leaseExpiresAt).getTime()
    ) {
      throw new Error('Lease-expired preflight exclusion precedes authoritative expiry');
    }
  }

  return Object.freeze({
    schema_version: DISPATCH_PREFLIGHT_SCHEMA,
    decision: raw.decision,
    preflight_id: preflightId,
    exclusion_id: exclusionId,
    intent_id: intentId,
    claim_event_id: claimEventId,
    activation_id: activationId,
    work_generation_id: positiveId(raw.work_generation_id, 'work_generation_id'),
    queue_item_id: queueItemId,
    snapshot_id: snapshotId,
    alert_id: positiveId(raw.alert_id, 'alert_id'),
    lineage_ref: lineage(raw.lineage_ref, snapshotId, queueItemId),
    lease_generation_no: leaseGenerationNo,
    lease_expires_at: leaseExpiresAt,
    intent_key: intentKey(raw.intent_key, activationId, claimEventId, leaseGenerationNo),
    exclusion_reason: exclusionReason,
    observed_at: observedAt,
    preflight_scope: 'provider_neutral_preview',
    replay: raw.replay,
    dispatch_authorized: false,
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

export async function preparePreviewRequeueDispatchPreflight({ transport, intentId, preflightKey: key } = {}) {
  if (!transport || typeof transport.invokeServer !== 'function') {
    throw new Error('Approved preview Supabase transport is required');
  }
  return normalizePreviewRequeueDispatchPreflight(await transport.invokeServer({
    target: DISPATCH_PREFLIGHT_RPC,
    auth: 'service_rpc',
    payload: {
      p_intent_id: positiveId(intentId, 'intent_id'),
      p_preflight_key: preflightKey(key),
    },
  }));
}

export const PREVIEW_REQUEUE_DISPATCH_PREFLIGHT_SCHEMA = DISPATCH_PREFLIGHT_SCHEMA;
export const PREVIEW_REQUEUE_DISPATCH_PREFLIGHT_RPC = DISPATCH_PREFLIGHT_RPC;
