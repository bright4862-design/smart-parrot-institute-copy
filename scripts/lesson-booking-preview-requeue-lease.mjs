const CLAIM_SCHEMA = 'smart_parrot_booking_preview_launch_blocker_requeue_claim_v1';
const TRANSITION_SCHEMA = 'smart_parrot_booking_preview_launch_blocker_requeue_transition_v1';
const INSPECTION_SCHEMA = 'smart_parrot_booking_preview_launch_blocker_requeue_inspection_v1';
const CLAIM_RPC = 'service_claim_booking_preview_launch_blocker_requeue_work_audited';
const TRANSITION_RPC = 'service_transition_booking_preview_launch_blocker_requeue_work';
const INSPECTION_RPC = 'service_list_booking_preview_launch_blocker_requeue_work';
const KEY_RE = /^[0-9a-f]{32}$/;
const LINEAGE_RE = /^rqg:(\d+):(\d+):(\d+):(\d+)$/;
const OUTCOMES = Object.freeze({
  release: 'observed_no_send',
  retry: 'transient_worker_failure',
  dead_letter: 'requeue_attempts_exhausted',
});

function requirePositiveId(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}
function requireNonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}
function requireTimestamp(value, name, { nullable = false } = {}) {
  if (value == null && nullable) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${name} must be an ISO timestamp`);
  return parsed.toISOString();
}
function requireClaimKey(value) {
  const key = String(value ?? '').trim().toLowerCase();
  if (!KEY_RE.test(key) || key === '0'.repeat(32)) throw new Error('claim_key must be a non-zero 32-hex value');
  return key;
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
    if (raw[key] !== false) throw new Error('Preview requeue lease cannot authorize execution, notification, providers, launch, or cleanup');
  }
  if (raw.server_time_authoritative !== true) throw new Error('Preview requeue lease must use server time');
}
function baseIdentity(raw) {
  const snapshotId = requirePositiveId(raw.snapshot_id, 'snapshot_id');
  const queueItemId = requirePositiveId(raw.queue_item_id, 'queue_item_id');
  return Object.freeze({
    activation_id: requirePositiveId(raw.activation_id, 'activation_id'),
    work_generation_id: requirePositiveId(raw.work_generation_id, 'work_generation_id'),
    queue_item_id: queueItemId,
    snapshot_id: snapshotId,
    alert_id: requirePositiveId(raw.alert_id, 'alert_id'),
    lineage_ref: requireLineage(raw.lineage_ref, snapshotId, queueItemId),
  });
}

export function normalizePreviewRequeueClaim(raw = {}) {
  if (raw.schema_version !== CLAIM_SCHEMA) throw new Error('Unexpected preview requeue claim schema');
  if (raw.work_state !== 'leased' || raw.lease_active !== true) throw new Error('Preview requeue claim must represent an active lease');
  if (typeof raw.replay !== 'boolean') throw new Error('Invalid preview requeue claim replay flag');
  requireFailClosed(raw);
  const identity = baseIdentity(raw);
  const leaseGenerationNo = requirePositiveId(raw.lease_generation_no, 'lease_generation_no');
  if (leaseGenerationNo > 3) throw new Error('lease_generation_no exceeds the bounded requeue limit');
  if (!Number.isSafeInteger(raw.lease_seconds) || raw.lease_seconds < 30 || raw.lease_seconds > 300) {
    throw new Error('lease_seconds must be between 30 and 300');
  }
  const recordedAt = requireTimestamp(raw.recorded_at, 'recorded_at');
  const leaseExpiresAt = requireTimestamp(raw.lease_expires_at, 'lease_expires_at');
  if (new Date(leaseExpiresAt).getTime() <= new Date(recordedAt).getTime()) throw new Error('Preview requeue lease expiry must follow server record time');
  return Object.freeze({
    schema_version: CLAIM_SCHEMA,
    ...identity,
    event_id: requirePositiveId(raw.event_id, 'event_id'),
    lease_generation_no: leaseGenerationNo,
    lease_seconds: raw.lease_seconds,
    lease_expires_at: leaseExpiresAt,
    recorded_at: recordedAt,
    work_state: 'leased',
    lease_active: true,
    replay: raw.replay,
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

export function normalizePreviewRequeueTransition(raw = {}) {
  if (raw.schema_version !== TRANSITION_SCHEMA) throw new Error('Unexpected preview requeue transition schema');
  if (typeof raw.replay !== 'boolean') throw new Error('Invalid preview requeue transition replay flag');
  requireFailClosed(raw);
  const identity = baseIdentity(raw);
  const leaseGenerationNo = requirePositiveId(raw.lease_generation_no, 'lease_generation_no');
  if (leaseGenerationNo > 3) throw new Error('lease_generation_no exceeds the bounded requeue limit');
  const outcome = String(raw.outcome ?? '');
  const expectedReason = OUTCOMES[outcome];
  if (!expectedReason) throw new Error('Invalid preview requeue transition outcome');
  if (outcome === 'dead_letter') {
    if (!['requeue_attempts_exhausted', 'invalid_activation_lineage'].includes(raw.reason_code)) {
      throw new Error('Preview requeue transition reason mismatch');
    }
  } else if (raw.reason_code !== expectedReason) {
    throw new Error('Preview requeue transition reason mismatch');
  }
  const expectedState = outcome === 'release' ? 'available' : outcome === 'retry' ? 'retry_wait' : 'dead_lettered';
  if (raw.work_state !== expectedState) throw new Error('Preview requeue transition work state mismatch');
  const nextEligibleAt = requireTimestamp(raw.next_eligible_at, 'next_eligible_at', { nullable: true });
  if ((outcome === 'retry') !== (nextEligibleAt !== null)) throw new Error('Preview requeue retry eligibility mismatch');
  if (outcome === 'retry' && leaseGenerationNo >= 3) throw new Error('Exhausted requeue generation cannot schedule another retry');
  if (outcome === 'dead_letter' && raw.reason_code === 'requeue_attempts_exhausted' && leaseGenerationNo < 3) {
    throw new Error('Requeue attempts cannot be exhausted before generation three');
  }
  return Object.freeze({
    schema_version: TRANSITION_SCHEMA,
    ...identity,
    event_id: requirePositiveId(raw.event_id, 'event_id'),
    lease_generation_no: leaseGenerationNo,
    outcome,
    reason_code: raw.reason_code,
    work_state: expectedState,
    next_eligible_at: nextEligibleAt,
    recorded_at: requireTimestamp(raw.recorded_at, 'recorded_at'),
    replay: raw.replay,
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

export function normalizePreviewRequeueInspection(raw = {}) {
  if (raw.schema_version !== INSPECTION_SCHEMA) throw new Error('Unexpected preview requeue inspection schema');
  requireFailClosed(raw);
  if (!Array.isArray(raw.items)) throw new Error('Preview requeue inspection items must be an array');
  if (requireNonNegativeInteger(raw.item_count, 'item_count') !== raw.items.length) throw new Error('Preview requeue inspection count mismatch');
  const items = raw.items.map((item) => {
    const identity = baseIdentity(item);
    const workState = String(item.work_state ?? '');
    if (!['available', 'leased', 'retry_wait', 'dead_lettered'].includes(workState)) throw new Error('Invalid preview requeue work state');
    const leaseGenerationNo = requireNonNegativeInteger(item.lease_generation_no, 'lease_generation_no');
    if (leaseGenerationNo > 3) throw new Error('lease_generation_no exceeds the bounded requeue limit');
    const leaseExpiresAt = requireTimestamp(item.lease_expires_at, 'lease_expires_at', { nullable: true });
    const nextEligibleAt = requireTimestamp(item.next_eligible_at, 'next_eligible_at', { nullable: true });
    if ((workState === 'leased') !== (leaseExpiresAt !== null)) throw new Error('Preview requeue inspection lease state mismatch');
    if ((workState === 'retry_wait') !== (nextEligibleAt !== null)) throw new Error('Preview requeue inspection retry state mismatch');
    return Object.freeze({
      ...identity,
      lease_generation_no: leaseGenerationNo,
      work_state: workState,
      lease_expires_at: leaseExpiresAt,
      next_eligible_at: nextEligibleAt,
      last_event_at: requireTimestamp(item.last_event_at, 'last_event_at', { nullable: true }),
    });
  });
  return Object.freeze({
    schema_version: INSPECTION_SCHEMA,
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

export async function claimPreviewRequeueWork({ transport, activationId, claimKey, leaseSeconds = 120 } = {}) {
  if (!transport || typeof transport.invokeServer !== 'function') throw new Error('Approved preview Supabase transport is required');
  if (!Number.isSafeInteger(leaseSeconds) || leaseSeconds < 30 || leaseSeconds > 300) throw new Error('lease_seconds must be between 30 and 300');
  return normalizePreviewRequeueClaim(await transport.invokeServer({
    target: CLAIM_RPC,
    auth: 'service_rpc',
    payload: {
      p_activation_id: requirePositiveId(activationId, 'activation_id'),
      p_claim_key: requireClaimKey(claimKey),
      p_lease_seconds: leaseSeconds,
    },
  }));
}

export async function transitionPreviewRequeueWork({
  transport,
  activationId,
  claimKey,
  outcome,
  reasonCode,
} = {}) {
  if (!transport || typeof transport.invokeServer !== 'function') throw new Error('Approved preview Supabase transport is required');
  const normalizedOutcome = String(outcome ?? '');
  if (!Object.hasOwn(OUTCOMES, normalizedOutcome)) throw new Error('outcome must be release, retry, or dead_letter');
  const expectedReason = OUTCOMES[normalizedOutcome];
  const normalizedReason = String(reasonCode ?? expectedReason);
  if (normalizedOutcome === 'dead_letter') {
    if (!['requeue_attempts_exhausted', 'invalid_activation_lineage'].includes(normalizedReason)) {
      throw new Error('invalid dead-letter reason');
    }
  } else if (normalizedReason !== expectedReason) {
    throw new Error('transition reason does not match outcome');
  }
  return normalizePreviewRequeueTransition(await transport.invokeServer({
    target: TRANSITION_RPC,
    auth: 'service_rpc',
    payload: {
      p_activation_id: requirePositiveId(activationId, 'activation_id'),
      p_claim_key: requireClaimKey(claimKey),
      p_outcome: normalizedOutcome,
      p_reason_code: normalizedReason,
    },
  }));
}

export async function listPreviewRequeueWork({ transport, limit = 25 } = {}) {
  if (!transport || typeof transport.invokeServer !== 'function') throw new Error('Approved preview Supabase transport is required');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('limit must be between 1 and 100');
  return normalizePreviewRequeueInspection(await transport.invokeServer({
    target: INSPECTION_RPC,
    auth: 'service_rpc',
    payload: { p_limit: limit },
  }));
}

export const PREVIEW_REQUEUE_CLAIM_SCHEMA = CLAIM_SCHEMA;
export const PREVIEW_REQUEUE_TRANSITION_SCHEMA = TRANSITION_SCHEMA;
export const PREVIEW_REQUEUE_INSPECTION_SCHEMA = INSPECTION_SCHEMA;
export const PREVIEW_REQUEUE_CLAIM_RPC = CLAIM_RPC;
export const PREVIEW_REQUEUE_TRANSITION_RPC = TRANSITION_RPC;
export const PREVIEW_REQUEUE_INSPECTION_RPC = INSPECTION_RPC;