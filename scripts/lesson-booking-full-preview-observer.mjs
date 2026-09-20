const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const PREVIEW_OBSERVER_SCHEMA_VERSION = 1;

export const PREVIEW_OBSERVER_FIELDS = Object.freeze([
  'schema_version',
  'booking_id',
  'booking_status',
  'hold_strategy',
  'checkout_mode',
  'authorization_state',
  'has_payment_intent',
  'has_capture_deadline',
  'consent_evidence_count',
  'payment_ledger_count',
  'attendance_evidence_count',
  'student_attendance_count',
  'tutor_attendance_count',
  'settlement_evidence_count',
  'hold_attempts',
  'hold_error_present',
  'settlement_attempts',
  'settlement_error_present',
  'lesson_end_passed',
  'settled',
  'outcome',
  'observed_at',
]);

const FORBIDDEN_FIELD = /(?:stripe_(?:customer|payment_method|payment_intent|checkout_session|setup_intent)_id|daily|webhook|payload|secret|token|raw|ip|user_agent|evidence_sha|card)/i;

function nonNegativeInt(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(`invalid_${label}`);
  return number;
}

function requiredBoolean(value, label) {
  if (value !== true && value !== false) throw new Error(`invalid_${label}`);
  return value;
}

export function assertMinimizedPreviewObservation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('preview_observation_object_required');
  }

  for (const key of Object.keys(input)) {
    if (!PREVIEW_OBSERVER_FIELDS.includes(key)) {
      if (FORBIDDEN_FIELD.test(key)) throw new Error(`forbidden_preview_observer_field:${key}`);
      throw new Error(`unknown_preview_observer_field:${key}`);
    }
  }

  if (Number(input.schema_version) !== PREVIEW_OBSERVER_SCHEMA_VERSION) {
    throw new Error('unsupported_preview_observer_schema');
  }

  const bookingId = String(input.booking_id ?? '').trim();
  if (!UUID_RE.test(bookingId)) throw new Error('invalid_preview_observer_booking_id');

  const bookingStatus = String(input.booking_status ?? '').trim();
  const allowedStatuses = new Set([
    'pending_checkout',
    'card_saved',
    'hold_placed',
    'hold_failed',
    'awaiting_settlement',
    'settled',
    'cancelled',
  ]);
  if (!allowedStatuses.has(bookingStatus)) throw new Error('invalid_preview_observer_booking_status');

  const observedAt = new Date(String(input.observed_at ?? ''));
  if (Number.isNaN(observedAt.getTime())) throw new Error('invalid_preview_observer_timestamp');

  return Object.freeze({
    schema_version: PREVIEW_OBSERVER_SCHEMA_VERSION,
    booking_id: bookingId,
    booking_status: bookingStatus,
    hold_strategy: input.hold_strategy == null ? null : String(input.hold_strategy),
    checkout_mode: input.checkout_mode == null ? null : String(input.checkout_mode),
    authorization_state: String(input.authorization_state ?? ''),
    has_payment_intent: requiredBoolean(input.has_payment_intent, 'has_payment_intent'),
    has_capture_deadline: requiredBoolean(input.has_capture_deadline, 'has_capture_deadline'),
    consent_evidence_count: nonNegativeInt(input.consent_evidence_count, 'consent_evidence_count'),
    payment_ledger_count: nonNegativeInt(input.payment_ledger_count, 'payment_ledger_count'),
    attendance_evidence_count: nonNegativeInt(input.attendance_evidence_count, 'attendance_evidence_count'),
    student_attendance_count: nonNegativeInt(input.student_attendance_count, 'student_attendance_count'),
    tutor_attendance_count: nonNegativeInt(input.tutor_attendance_count, 'tutor_attendance_count'),
    settlement_evidence_count: nonNegativeInt(input.settlement_evidence_count, 'settlement_evidence_count'),
    hold_attempts: nonNegativeInt(input.hold_attempts, 'hold_attempts'),
    hold_error_present: requiredBoolean(input.hold_error_present, 'hold_error_present'),
    settlement_attempts: nonNegativeInt(input.settlement_attempts, 'settlement_attempts'),
    settlement_error_present: requiredBoolean(input.settlement_error_present, 'settlement_error_present'),
    lesson_end_passed: requiredBoolean(input.lesson_end_passed, 'lesson_end_passed'),
    settled: requiredBoolean(input.settled, 'settled'),
    outcome: input.outcome == null ? null : String(input.outcome),
    observed_at: observedAt.toISOString(),
  });
}
