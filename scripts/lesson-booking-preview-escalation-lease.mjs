const CLAIM_SCHEMA = 'smart_parrot_booking_preview_launch_blocker_escalation_claim_v1';
const TRANSITION_SCHEMA = 'smart_parrot_booking_preview_launch_blocker_escalation_transition_v1';
const INSPECTION_SCHEMA = 'smart_parrot_booking_preview_launch_blocker_escalation_inspection_v1';
const CLAIM_RPC = 'service_claim_booking_preview_launch_blocker_escalation_work';
const TRANSITION_RPC = 'service_transition_booking_preview_launch_blocker_escalation_work';
const INSPECTION_RPC = 'service_list_booking_preview_launch_blocker_escalation_work';

const OUTCOME_REASONS = Object.freeze({
  release: new Set(['observed_no_send']),
  retry: new Set(['transient_failure']),
  dead_letter: new Set(['attempts_exhausted', 'invalid_work_item']),
});
const WORK_STATES = new Set(['available', 'leased', 'retry_wait', 'dead_lettered']);
const SEVERITIES = new Set(['info', 'warning', 'critical']);
const ESCALATION_CLASSES = new Set(['review', 'urgent']);

function requirePositiveId(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function requireNonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}

function requireHex(value, length, name) {
  const normalized = String(value ?? '').trim().toLowerCase();
  const matcher = new RegExp(`^[0-9a-f]{${length}}$`);
  if (!matcher.test(normalized) || /^0+$/.test(normalized)) throw new Error(`${name} must be ${length} lowercase hex characters`);
  return normalized;
}

function requireTimestamp(value, name, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${name} must be an ISO timestamp`);
  return parsed.toISOString();
}

function requireFailClosed(raw, label) {
  for (const key of [
    'automatic_notification_authorized',
    'notifier_send_authorized',
    'outcome_suppresses_blocker',
    'provider_write_authorized',
    'booking_launch_authorized',
    'destructive_cleanup_authorized',
  ]) {
    if (raw[key] !== false) throw new Error(`${label} cannot authorize or suppress execution`);
  }
  if (raw.server_time_authoritative !== true) throw new Error(`${label} must use server time`);
}

export function normalizePreviewEscalationClaim(raw = {}) {
  if (raw.schema_version !== CLAIM_SCHEMA) throw new Error('Unexpected preview escalation claim schema');
  if (raw.work_state !== 'leased' || raw.lease_active !== true) throw new Error('Preview escalation claim must be an active lease');
  if (typeof raw.replay !== 'boolean') throw new Error('Invalid preview escalation claim replay flag');
  if (!Number.isSafeInteger(raw.lease_seconds) || raw.lease_seconds < 30 || raw.lease_seconds > 300) {
    throw new Error('Preview escalation lease must be between 30 and 300 seconds');
  }
  requireFailClosed(raw, 'Preview escalation claim');
  return Object.freeze({
    schema_version: CLAIM_SCHEMA,
    event_id: requirePositiveId(raw.event_id, 'event_id'),
    queue_item_id: requirePositiveId(raw.queue_item_id, 'queue_item_id'),
    snapshot_id: requirePositiveId(raw.snapshot_id, 'snapshot_id'),
    alert_id: requirePositiveId(raw.alert_id, 'alert_id'),
    claim_key: requireHex(raw.claim_key, 32, 'claim_key'),
    attempt_no: requirePositiveId(raw.attempt_no, 'attempt_no'),
    lease_seconds: raw.lease_seconds,
    lease_expires_at: requireTimestamp(raw.lease_expires_at, 'lease_expires_at'),
    recorded_at: requireTimestamp(raw.recorded_at, 'recorded_at'),
    work_state: 'leased',
    lease_active: true,
    replay: raw.replay,
    automatic_notification_authorized: false,
    notifier_send_authorized: false,
    outcome_suppresses_blocker: false,
    provider_write_authorized: false,
    booking_launch_authorized: false,
    destructive_cleanup_authorized: false,
    server_time_authoritative: true,
  });
}

export function normalizePreviewEscalationTransition(raw = {}) {
  if (raw.schema_version !== TRANSITION_SCHEMA) throw new Error('Unexpected preview escalation transition schema');
  const outcome = String(raw.outcome ?? '').trim();
  const reasonCode = String(raw.reason_code ?? '').trim();
  if (!Object.hasOwn(OUTCOME_REASONS, outcome) || !OUTCOME_REASONS[outcome].has(reasonCode)) {
    throw new Error('Invalid preview escalation transition outcome/reason');
  }
  const expectedState = outcome === 'release' ? 'available' : outcome === 'retry' ? 'retry_wait' : 'dead_lettered';
  if (raw.work_state !== expectedState) throw new Error('Preview escalation transition state mismatch');
  if (typeof raw.replay !== 'boolean') throw new Error('Invalid preview escalation transition replay flag');
  requireFailClosed(raw, 'Preview escalation transition');
  const nextEligible = requireTimestamp(raw.next_eligible_at, 'next_eligible_at', { nullable: true });
  if (outcome === 'retry' && nextEligible === null) throw new Error('Retry transition must include next_eligible_at');
  if (outcome !== 'retry' && nextEligible !== null) throw new Error('Non-retry transition cannot include next_eligible_at');
  return Object.freeze({
    schema_version: TRANSITION_SCHEMA,
    event_id: requirePositiveId(raw.event_id, 'event_id'),
    queue_item_id: requirePositiveId(raw.queue_item_id, 'queue_item_id'),
    snapshot_id: requirePositiveId(raw.snapshot_id, 'snapshot_id'),
    alert_id: requirePositiveId(raw.alert_id, 'alert_id'),
    claim_key: requireHex(raw.claim_key, 32, 'claim_key'),
    attempt_no: requirePositiveId(raw.attempt_no, 'attempt_no'),
    outcome,
    reason_code: reasonCode,
    work_state: expectedState,
    next_eligible_at: nextEligible,
    recorded_at: requireTimestamp(raw.recorded_at, 'recorded_at'),
    replay: raw.replay,
    automatic_notification_authorized: false,
    notifier_send_authorized: false,
    outcome_suppresses_blocker: false,
    provider_write_authorized: false,
    booking_launch_authorized: false,
    destructive_cleanup_authorized: false,
    server_time_authoritative: true,
  });
}

function normalizeInspectionItem(raw = {}) {
  if (!WORK_STATES.has(raw.work_state)) throw new Error('Invalid preview escalation inspection work state');
  if (!SEVERITIES.has(raw.severity)) throw new Error('Invalid preview escalation inspection severity');
  if (!ESCALATION_CLASSES.has(raw.escalation_class)) throw new Error('Invalid preview escalation inspection class');
  const leaseExpiresAt = requireTimestamp(raw.lease_expires_at, 'lease_expires_at', { nullable: true });
  const nextEligibleAt = requireTimestamp(raw.next_eligible_at, 'next_eligible_at', { nullable: true });
  if (raw.work_state === 'leased' && leaseExpiresAt === null) throw new Error('Leased work must include lease_expires_at');
  if (raw.work_state !== 'leased' && leaseExpiresAt !== null) throw new Error('Non-leased work cannot include lease_expires_at');
  if (raw.work_state === 'retry_wait' && nextEligibleAt === null) throw new Error('Retry-wait work must include next_eligible_at');
  if (raw.work_state !== 'retry_wait' && nextEligibleAt !== null) throw new Error('Non-retry work cannot include next_eligible_at');
  return Object.freeze({
    queue_item_id: requirePositiveId(raw.queue_item_id, 'queue_item_id'),
    snapshot_id: requirePositiveId(raw.snapshot_id, 'snapshot_id'),
    alert_id: requirePositiveId(raw.alert_id, 'alert_id'),
    delivery_key: requireHex(raw.delivery_key, 32, 'delivery_key'),
    severity: raw.severity,
    escalation_class: raw.escalation_class,
    blocker_count: requirePositiveId(raw.blocker_count, 'blocker_count'),
    attempt_no: requireNonNegativeInteger(raw.attempt_no, 'attempt_no'),
    work_state: raw.work_state,
    lease_expires_at: leaseExpiresAt,
    next_eligible_at: nextEligibleAt,
    last_event_at: requireTimestamp(raw.last_event_at, 'last_event_at', { nullable: true }),
  });
}

export function normalizePreviewEscalationInspection(raw = {}) {
  if (raw.schema_version !== INSPECTION_SCHEMA) throw new Error('Unexpected preview escalation inspection schema');
  if (!Array.isArray(raw.items)) throw new Error('Preview escalation inspection items must be an array');
  if (!Number.isSafeInteger(raw.item_count) || raw.item_count !== raw.items.length) throw new Error('Preview escalation inspection item count mismatch');
  requireFailClosed(raw, 'Preview escalation inspection');
  return Object.freeze({
    schema_version: INSPECTION_SCHEMA,
    captured_at: requireTimestamp(raw.captured_at, 'captured_at'),
    item_count: raw.item_count,
    items: Object.freeze(raw.items.map(normalizeInspectionItem)),
    automatic_notification_authorized: false,
    notifier_send_authorized: false,
    outcome_suppresses_blocker: false,
    provider_write_authorized: false,
    booking_launch_authorized: false,
    destructive_cleanup_authorized: false,
    server_time_authoritative: true,
  });
}

export async function claimPreviewEscalationWork({ transport, queueItemId, claimKey, leaseSeconds = 60 }) {
  if (!transport || typeof transport.invokeServer !== 'function') throw new Error('Approved preview Supabase transport is required');
  if (!Number.isSafeInteger(leaseSeconds) || leaseSeconds < 30 || leaseSeconds > 300) throw new Error('lease_seconds must be between 30 and 300');
  const raw = await transport.invokeServer({
    target: CLAIM_RPC,
    auth: 'service_rpc',
    payload: {
      p_queue_item_id: requirePositiveId(queueItemId, 'queue_item_id'),
      p_claim_key: requireHex(claimKey, 32, 'claim_key'),
      p_lease_seconds: leaseSeconds,
    },
  });
  return normalizePreviewEscalationClaim(raw);
}

export async function transitionPreviewEscalationWork({ transport, queueItemId, claimKey, outcome, reasonCode }) {
  if (!transport || typeof transport.invokeServer !== 'function') throw new Error('Approved preview Supabase transport is required');
  const normalizedOutcome = String(outcome ?? '').trim();
  const normalizedReason = String(reasonCode ?? '').trim();
  if (!Object.hasOwn(OUTCOME_REASONS, normalizedOutcome) || !OUTCOME_REASONS[normalizedOutcome].has(normalizedReason)) {
    throw new Error('Invalid preview escalation transition outcome/reason');
  }
  const raw = await transport.invokeServer({
    target: TRANSITION_RPC,
    auth: 'service_rpc',
    payload: {
      p_queue_item_id: requirePositiveId(queueItemId, 'queue_item_id'),
      p_claim_key: requireHex(claimKey, 32, 'claim_key'),
      p_outcome: normalizedOutcome,
      p_reason_code: normalizedReason,
    },
  });
  return normalizePreviewEscalationTransition(raw);
}

export async function inspectPreviewEscalationWork({ transport, limit = 25 } = {}) {
  if (!transport || typeof transport.invokeServer !== 'function') throw new Error('Approved preview Supabase transport is required');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('inspection limit must be between 1 and 100');
  const raw = await transport.invokeServer({
    target: INSPECTION_RPC,
    auth: 'service_rpc',
    payload: { p_limit: limit },
  });
  return normalizePreviewEscalationInspection(raw);
}

export const PREVIEW_ESCALATION_CLAIM_SCHEMA = CLAIM_SCHEMA;
export const PREVIEW_ESCALATION_TRANSITION_SCHEMA = TRANSITION_SCHEMA;
export const PREVIEW_ESCALATION_INSPECTION_SCHEMA = INSPECTION_SCHEMA;
export const PREVIEW_ESCALATION_CLAIM_RPC = CLAIM_RPC;
export const PREVIEW_ESCALATION_TRANSITION_RPC = TRANSITION_RPC;
export const PREVIEW_ESCALATION_INSPECTION_RPC = INSPECTION_RPC;
