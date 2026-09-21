const RESULT_SCHEMA = 'smart_parrot_booking_preview_launch_blocker_requeue_consumption_result_v1';
const CONSUME_RPC = 'service_consume_booking_preview_launch_blocker_requeue_eligibility';
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
function requireConsumptionKey(value) {
  const key = String(value ?? '').trim().toLowerCase();
  if (!KEY_RE.test(key) || key === '0'.repeat(32)) throw new Error('consumption_key must be a non-zero 32-hex value');
  return key;
}
function requireFailClosed(raw) {
  for (const key of ['requeue_execution_authorized','automatic_notification_authorized','notifier_send_authorized','outcome_suppresses_blocker','provider_write_authorized','booking_launch_authorized','destructive_cleanup_authorized']) {
    if (raw[key] !== false) throw new Error('Preview requeue lineage cannot authorize execution or suppress blockers');
  }
  if (raw.claim_eligible !== false) throw new Error('Preview requeue work generation must remain claim-ineligible');
  if (raw.server_time_authoritative !== true) throw new Error('Preview requeue lineage must use server time');
}

export function normalizePreviewRequeueConsumption(raw = {}) {
  if (raw.schema_version !== RESULT_SCHEMA) throw new Error('Unexpected preview requeue consumption schema');
  if (raw.work_state !== 'prepared') throw new Error('Preview requeue work state must remain prepared');
  if (typeof raw.replay !== 'boolean') throw new Error('Invalid preview requeue consumption replay flag');
  requireFailClosed(raw);
  const snapshotId = requirePositiveId(raw.snapshot_id, 'snapshot_id');
  const queueItemId = requirePositiveId(raw.queue_item_id, 'queue_item_id');
  const eligibilityGenerationId = requirePositiveId(raw.eligibility_generation_id, 'eligibility_generation_id');
  const workGenerationNo = requirePositiveId(raw.work_generation_no, 'work_generation_no');
  const expectedLineage = `rqg:${snapshotId}:${queueItemId}:${eligibilityGenerationId}:${workGenerationNo}`;
  if (raw.lineage_ref !== expectedLineage) throw new Error('Preview requeue lineage reference mismatch');
  return Object.freeze({
    schema_version: RESULT_SCHEMA,
    consumption_id: requirePositiveId(raw.consumption_id, 'consumption_id'),
    eligibility_generation_id: eligibilityGenerationId,
    review_id: requirePositiveId(raw.review_id, 'review_id'),
    queue_item_id: queueItemId,
    snapshot_id: snapshotId,
    alert_id: requirePositiveId(raw.alert_id, 'alert_id'),
    dead_letter_event_id: requirePositiveId(raw.dead_letter_event_id, 'dead_letter_event_id'),
    source_generation_no: requirePositiveId(raw.source_generation_no, 'source_generation_no'),
    work_generation_id: requirePositiveId(raw.work_generation_id, 'work_generation_id'),
    work_generation_no: workGenerationNo,
    lineage_ref: expectedLineage,
    work_state: 'prepared',
    claim_eligible: false,
    consumed_at: requireTimestamp(raw.consumed_at, 'consumed_at'),
    generated_at: requireTimestamp(raw.generated_at, 'generated_at'),
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

export async function consumePreviewRequeueEligibility({ transport, generationId, consumptionKey } = {}) {
  if (!transport || typeof transport.invokeServer !== 'function') throw new Error('Approved preview Supabase transport is required');
  const payload = {
    p_generation_id: requirePositiveId(generationId, 'eligibility_generation_id'),
    p_consumption_key: requireConsumptionKey(consumptionKey),
  };
  return normalizePreviewRequeueConsumption(await transport.invokeServer({target:CONSUME_RPC,auth:'service_rpc',payload}));
}

export const PREVIEW_REQUEUE_CONSUMPTION_SCHEMA = RESULT_SCHEMA;
export const PREVIEW_REQUEUE_CONSUMPTION_RPC = CONSUME_RPC;