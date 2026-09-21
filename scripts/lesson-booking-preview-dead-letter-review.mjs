const QUEUE_SCHEMA = 'smart_parrot_booking_preview_launch_blocker_dead_letter_review_queue_v1';
const REVIEW_SCHEMA = 'smart_parrot_booking_preview_launch_blocker_dead_letter_review_v1';
const GENERATION_SCHEMA = 'smart_parrot_booking_preview_launch_blocker_requeue_eligibility_v1';

const QUEUE_RPC = 'admin_list_booking_preview_launch_blocker_dead_letter_review_queue';
const REVIEW_RPC = 'admin_record_booking_preview_launch_blocker_dead_letter_review';
const GENERATION_RPC = 'admin_generate_booking_preview_launch_blocker_requeue_eligibility';

const DEAD_LETTER_REASONS = new Set(['attempts_exhausted', 'invalid_work_item']);
const REVIEW_DECISIONS = new Set(['preserve', 'retry_after_review', 'invalid_work_item_confirmed']);
const REVIEW_STATUSES = new Set(['pending', 'reviewed']);

function requirePositiveId(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}
function requireNullablePositiveId(value, name) {
  if (value === null) return null;
  return requirePositiveId(value, name);
}
function requireTimestamp(value, name, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${name} must be an ISO timestamp`);
  return parsed.toISOString();
}
function requireDeadLetterReason(value) {
  const normalized = String(value ?? '').trim();
  if (!DEAD_LETTER_REASONS.has(normalized)) throw new Error('Invalid preview dead-letter reason');
  return normalized;
}
function requireReviewDecision(value, reason = null) {
  const normalized = String(value ?? '').trim();
  if (!REVIEW_DECISIONS.has(normalized)) throw new Error('Invalid preview dead-letter review decision');
  if (reason === 'invalid_work_item' && normalized === 'retry_after_review') throw new Error('retry_after_review requires attempts_exhausted');
  if (reason === 'attempts_exhausted' && normalized === 'invalid_work_item_confirmed') throw new Error('invalid_work_item_confirmed requires invalid_work_item');
  return normalized;
}
function requireFailClosed(raw, label) {
  for (const key of ['requeue_execution_authorized','automatic_notification_authorized','notifier_send_authorized','outcome_suppresses_blocker','provider_write_authorized','booking_launch_authorized','destructive_cleanup_authorized']) {
    if (raw[key] !== false) throw new Error(`${label} cannot authorize execution or suppress blockers`);
  }
  if (raw.server_time_authoritative !== true) throw new Error(`${label} must use server time`);
}
function normalizeQueueItem(raw = {}) {
  const reason = requireDeadLetterReason(raw.dead_letter_reason);
  const reviewStatus = String(raw.review_status ?? '').trim();
  if (!REVIEW_STATUSES.has(reviewStatus)) throw new Error('Invalid preview dead-letter review status');
  if (typeof raw.requeue_eligible !== 'boolean') throw new Error('Invalid preview requeue eligibility flag');
  const reviewId = requireNullablePositiveId(raw.review_id, 'review_id');
  const decision = raw.decision === null ? null : requireReviewDecision(raw.decision, reason);
  const reviewedAt = requireTimestamp(raw.reviewed_at, 'reviewed_at', { nullable: true });
  const generationId = requireNullablePositiveId(raw.generation_id, 'generation_id');
  const generationExpiresAt = requireTimestamp(raw.generation_expires_at, 'generation_expires_at', { nullable: true });
  if (reviewStatus === 'pending' && (reviewId !== null || decision !== null || reviewedAt !== null)) throw new Error('Pending dead-letter work cannot contain review evidence');
  if (reviewStatus === 'reviewed' && (reviewId === null || decision === null || reviewedAt === null)) throw new Error('Reviewed dead-letter work requires review evidence');
  if (raw.requeue_eligible && (decision !== 'retry_after_review' || generationId === null || generationExpiresAt === null)) throw new Error('Requeue-eligible work requires an active retry-after-review generation');
  if (!raw.requeue_eligible && (generationId !== null || generationExpiresAt !== null)) throw new Error('Non-eligible work cannot expose a requeue generation');
  return Object.freeze({
    queue_item_id: requirePositiveId(raw.queue_item_id, 'queue_item_id'),
    snapshot_id: requirePositiveId(raw.snapshot_id, 'snapshot_id'),
    alert_id: requirePositiveId(raw.alert_id, 'alert_id'),
    dead_letter_event_id: requirePositiveId(raw.dead_letter_event_id, 'dead_letter_event_id'),
    dead_letter_reason: reason,
    attempt_no: requirePositiveId(raw.attempt_no, 'attempt_no'),
    dead_lettered_at: requireTimestamp(raw.dead_lettered_at, 'dead_lettered_at'),
    review_status: reviewStatus,
    review_id: reviewId,
    decision,
    reviewed_at: reviewedAt,
    requeue_eligible: raw.requeue_eligible,
    generation_id: generationId,
    generation_expires_at: generationExpiresAt,
  });
}

export function normalizePreviewDeadLetterReviewQueue(raw = {}) {
  if (raw.schema_version !== QUEUE_SCHEMA) throw new Error('Unexpected preview dead-letter review queue schema');
  if (!Array.isArray(raw.items)) throw new Error('Preview dead-letter review queue items must be an array');
  if (!Number.isSafeInteger(raw.item_count) || raw.item_count !== raw.items.length) throw new Error('Preview dead-letter review queue item count mismatch');
  requireFailClosed(raw, 'Preview dead-letter review queue');
  return Object.freeze({schema_version:QUEUE_SCHEMA,captured_at:requireTimestamp(raw.captured_at,'captured_at'),item_count:raw.item_count,items:Object.freeze(raw.items.map(normalizeQueueItem)),requeue_execution_authorized:false,automatic_notification_authorized:false,notifier_send_authorized:false,outcome_suppresses_blocker:false,provider_write_authorized:false,booking_launch_authorized:false,destructive_cleanup_authorized:false,server_time_authoritative:true});
}
export function normalizePreviewDeadLetterReview(raw = {}) {
  if (raw.schema_version !== REVIEW_SCHEMA) throw new Error('Unexpected preview dead-letter review schema');
  const reason = requireDeadLetterReason(raw.dead_letter_reason);
  const decision = requireReviewDecision(raw.decision, reason);
  if (typeof raw.replay !== 'boolean') throw new Error('Invalid preview dead-letter review replay flag');
  requireFailClosed(raw, 'Preview dead-letter review');
  return Object.freeze({schema_version:REVIEW_SCHEMA,review_id:requirePositiveId(raw.review_id,'review_id'),queue_item_id:requirePositiveId(raw.queue_item_id,'queue_item_id'),snapshot_id:requirePositiveId(raw.snapshot_id,'snapshot_id'),alert_id:requirePositiveId(raw.alert_id,'alert_id'),dead_letter_event_id:requirePositiveId(raw.dead_letter_event_id,'dead_letter_event_id'),dead_letter_reason:reason,attempt_no:requirePositiveId(raw.attempt_no,'attempt_no'),decision,reviewed_at:requireTimestamp(raw.reviewed_at,'reviewed_at'),replay:raw.replay,requeue_execution_authorized:false,automatic_notification_authorized:false,notifier_send_authorized:false,outcome_suppresses_blocker:false,provider_write_authorized:false,booking_launch_authorized:false,destructive_cleanup_authorized:false,server_time_authoritative:true});
}
export function normalizePreviewRequeueEligibilityGeneration(raw = {}) {
  if (raw.schema_version !== GENERATION_SCHEMA) throw new Error('Unexpected preview requeue eligibility schema');
  if (raw.requeue_eligible !== true) throw new Error('Preview requeue generation must be eligible');
  if (raw.validity_seconds !== 900) throw new Error('Preview requeue generation validity must be 900 seconds');
  if (typeof raw.replay !== 'boolean') throw new Error('Invalid preview requeue generation replay flag');
  requireFailClosed(raw, 'Preview requeue eligibility generation');
  const generatedAt = requireTimestamp(raw.generated_at, 'generated_at');
  const expiresAt = requireTimestamp(raw.expires_at, 'expires_at');
  if (new Date(expiresAt).getTime() - new Date(generatedAt).getTime() !== 900000) throw new Error('Preview requeue generation must expire exactly 15 minutes after generation');
  return Object.freeze({schema_version:GENERATION_SCHEMA,generation_id:requirePositiveId(raw.generation_id,'generation_id'),generation_no:requirePositiveId(raw.generation_no,'generation_no'),review_id:requirePositiveId(raw.review_id,'review_id'),queue_item_id:requirePositiveId(raw.queue_item_id,'queue_item_id'),snapshot_id:requirePositiveId(raw.snapshot_id,'snapshot_id'),alert_id:requirePositiveId(raw.alert_id,'alert_id'),dead_letter_event_id:requirePositiveId(raw.dead_letter_event_id,'dead_letter_event_id'),validity_seconds:900,generated_at:generatedAt,expires_at:expiresAt,requeue_eligible:true,replay:raw.replay,requeue_execution_authorized:false,automatic_notification_authorized:false,notifier_send_authorized:false,outcome_suppresses_blocker:false,provider_write_authorized:false,booking_launch_authorized:false,destructive_cleanup_authorized:false,server_time_authoritative:true});
}
export async function listPreviewDeadLetterReviewQueue({ transport, limit = 25 } = {}) {
  if (!transport || typeof transport.invokeServer !== 'function') throw new Error('Approved preview Supabase transport is required');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('review queue limit must be between 1 and 100');
  return normalizePreviewDeadLetterReviewQueue(await transport.invokeServer({target:QUEUE_RPC,auth:'admin_rpc',payload:{p_limit:limit}}));
}
export async function recordPreviewDeadLetterReview({ transport, queueItemId, decision }) {
  if (!transport || typeof transport.invokeServer !== 'function') throw new Error('Approved preview Supabase transport is required');
  return normalizePreviewDeadLetterReview(await transport.invokeServer({target:REVIEW_RPC,auth:'admin_rpc',payload:{p_queue_item_id:requirePositiveId(queueItemId,'queue_item_id'),p_decision:requireReviewDecision(decision)}}));
}
export async function generatePreviewDeadLetterRequeueEligibility({ transport, reviewId }) {
  if (!transport || typeof transport.invokeServer !== 'function') throw new Error('Approved preview Supabase transport is required');
  return normalizePreviewRequeueEligibilityGeneration(await transport.invokeServer({target:GENERATION_RPC,auth:'admin_rpc',payload:{p_review_id:requirePositiveId(reviewId,'review_id')}}));
}
export const PREVIEW_DEAD_LETTER_REVIEW_QUEUE_SCHEMA=QUEUE_SCHEMA;
export const PREVIEW_DEAD_LETTER_REVIEW_SCHEMA=REVIEW_SCHEMA;
export const PREVIEW_REQUEUE_ELIGIBILITY_SCHEMA=GENERATION_SCHEMA;
export const PREVIEW_DEAD_LETTER_REVIEW_QUEUE_RPC=QUEUE_RPC;
export const PREVIEW_DEAD_LETTER_REVIEW_RPC=REVIEW_RPC;
export const PREVIEW_REQUEUE_ELIGIBILITY_RPC=GENERATION_RPC;
