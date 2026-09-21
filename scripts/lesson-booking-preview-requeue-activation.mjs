const RESULT_SCHEMA = 'smart_parrot_booking_preview_launch_blocker_requeue_activation_result_v1';
const ACTIVATE_RPC = 'service_activate_booking_preview_launch_blocker_requeue_lineage';
const KEY_RE = /^[0-9a-f]{32}$/;

function requirePositiveId(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}
function requireTimestamp(value, name) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${name} must be an ISO timestamp`);
  return parsed.toISOString();
}
function requireActivationKey(value) {
  const key = String(value ?? '').trim().toLowerCase();
  if (!KEY_RE.test(key) || key === '0'.repeat(32)) throw new Error('activation_key must be a non-zero 32-hex value');
  return key;
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
    if (raw[key] !== false) throw new Error('Preview requeue activation cannot authorize execution, notification, providers, launch, or cleanup');
  }
  if (raw.claim_eligible !== true) throw new Error('Preview requeue activation must explicitly establish internal claim eligibility');
  if (raw.server_time_authoritative !== true) throw new Error('Preview requeue activation must use server time');
}

export function normalizePreviewRequeueActivation(raw = {}) {
  if (raw.schema_version !== RESULT_SCHEMA) throw new Error('Unexpected preview requeue activation schema');
  if (raw.activation_status !== 'activated') throw new Error('Preview requeue activation status must be activated');
  if (raw.lease_handoff_state !== 'eligible_for_internal_claim') throw new Error('Preview requeue lease handoff state mismatch');
  if (raw.claim_scope !== 'internal_preview_escalation_lease') throw new Error('Preview requeue claim scope mismatch');
  if (typeof raw.replay !== 'boolean') throw new Error('Invalid preview requeue activation replay flag');
  requireFailClosed(raw);

  const snapshotId = requirePositiveId(raw.snapshot_id, 'snapshot_id');
  const queueItemId = requirePositiveId(raw.queue_item_id, 'queue_item_id');
  const eligibilityGenerationId = requirePositiveId(raw.eligibility_generation_id, 'eligibility_generation_id');
  const workGenerationNo = requirePositiveId(raw.work_generation_no, 'work_generation_no');
  const expectedLineage = `rqg:${snapshotId}:${queueItemId}:${eligibilityGenerationId}:${workGenerationNo}`;
  if (raw.lineage_ref !== expectedLineage) throw new Error('Preview requeue activation lineage reference mismatch');

  return Object.freeze({
    schema_version: RESULT_SCHEMA,
    activation_id: requirePositiveId(raw.activation_id, 'activation_id'),
    work_generation_id: requirePositiveId(raw.work_generation_id, 'work_generation_id'),
    consumption_id: requirePositiveId(raw.consumption_id, 'consumption_id'),
    eligibility_generation_id: eligibilityGenerationId,
    review_id: requirePositiveId(raw.review_id, 'review_id'),
    queue_item_id: queueItemId,
    snapshot_id: snapshotId,
    alert_id: requirePositiveId(raw.alert_id, 'alert_id'),
    dead_letter_event_id: requirePositiveId(raw.dead_letter_event_id, 'dead_letter_event_id'),
    work_generation_no: workGenerationNo,
    lineage_ref: expectedLineage,
    activation_status: 'activated',
    lease_handoff_state: 'eligible_for_internal_claim',
    claim_scope: 'internal_preview_escalation_lease',
    claim_eligible: true,
    activated_at: requireTimestamp(raw.activated_at, 'activated_at'),
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

export async function activatePreviewRequeueLineage({ transport, workGenerationId, activationKey } = {}) {
  if (!transport || typeof transport.invokeServer !== 'function') throw new Error('Approved preview Supabase transport is required');
  const payload = {
    p_work_generation_id: requirePositiveId(workGenerationId, 'work_generation_id'),
    p_activation_key: requireActivationKey(activationKey),
  };
  return normalizePreviewRequeueActivation(
    await transport.invokeServer({ target: ACTIVATE_RPC, auth: 'service_rpc', payload }),
  );
}

export const PREVIEW_REQUEUE_ACTIVATION_SCHEMA = RESULT_SCHEMA;
export const PREVIEW_REQUEUE_ACTIVATION_RPC = ACTIVATE_RPC;
