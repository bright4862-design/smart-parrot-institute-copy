const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const FULL_PREVIEW_RUN_SCENARIOS = Object.freeze([
  'near_term_success',
  'near_term_sca',
  'deferred_success',
  'deferred_hold_failure_recovery',
]);

export const FULL_PREVIEW_RUN_STATES = Object.freeze([
  'initialized',
  'awaiting_checkout_completion',
  'awaiting_customer_authentication',
  'awaiting_deferred_hold_worker',
  'awaiting_customer_payment_recovery',
  'awaiting_attendance_evidence',
  'lesson_in_progress',
  'awaiting_settlement_worker',
  'complete',
  'cancelled',
  'blocked_unknown_server_state',
]);

const ALLOWED_FIELDS = new Set([
  'schema_version',
  'run_id',
  'scenario',
  'booking_id',
  'state',
  'pause_reason',
  'terminal',
  'revision',
  'last_booking_status',
  'last_observed_at',
  'completed_at',
  'replay',
]);

const MACHINE_CODE_RE = /^[a-z0-9][a-z0-9_.-]{2,79}$/;

function optionalIso(value, field) {
  if (value == null) return null;
  const text = String(value);
  if (Number.isNaN(new Date(text).getTime())) throw new Error(`invalid_full_preview_run_${field}`);
  return text;
}

export function assertMinimizedFullPreviewRunSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_full_preview_run_snapshot');
  }

  for (const key of Object.keys(value)) {
    if (!ALLOWED_FIELDS.has(key)) throw new Error(`forbidden_full_preview_run_field:${key}`);
  }

  if (value.schema_version !== 1) throw new Error('unsupported_full_preview_run_schema');
  if (!UUID_RE.test(String(value.run_id ?? ''))) throw new Error('invalid_full_preview_run_id');
  if (!FULL_PREVIEW_RUN_SCENARIOS.includes(value.scenario)) throw new Error('invalid_full_preview_run_scenario');
  if (value.booking_id != null && !UUID_RE.test(String(value.booking_id))) {
    throw new Error('invalid_full_preview_run_booking_id');
  }
  if (!FULL_PREVIEW_RUN_STATES.includes(value.state)) throw new Error('invalid_full_preview_run_state');
  if (value.pause_reason != null && !MACHINE_CODE_RE.test(String(value.pause_reason))) {
    throw new Error('invalid_full_preview_run_pause_reason');
  }
  if (typeof value.terminal !== 'boolean') throw new Error('invalid_full_preview_run_terminal');
  if (!Number.isInteger(value.revision) || value.revision < 0) {
    throw new Error('invalid_full_preview_run_revision');
  }
  if (value.last_booking_status != null && !MACHINE_CODE_RE.test(String(value.last_booking_status))) {
    throw new Error('invalid_full_preview_run_booking_status');
  }
  if (typeof value.replay !== 'boolean') throw new Error('invalid_full_preview_run_replay');

  optionalIso(value.last_observed_at, 'last_observed_at');
  optionalIso(value.completed_at, 'completed_at');

  if (value.terminal !== ['complete', 'cancelled'].includes(value.state)) {
    throw new Error('invalid_full_preview_run_terminal_state');
  }
  if (value.terminal !== (value.completed_at != null)) {
    throw new Error('invalid_full_preview_run_completion_state');
  }

  return Object.freeze({ ...value });
}
