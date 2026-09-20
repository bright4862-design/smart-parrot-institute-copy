import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FULL_PREVIEW_WRITE_GATE,
  assertFullPreviewExecutionAllowed,
  buildFullPreviewRunContract,
  classifyProviderCleanup,
} from './lesson-booking-full-preview-driver-contract.mjs';
import { assertMinimizedPreviewObservation } from './lesson-booking-full-preview-observer.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const FULL_PREVIEW_SHELL_GATE = 'SMART_PARROT_FULL_PREVIEW_SHELL_ENABLED';

export const AUTHORITATIVE_SERVER_OPERATIONS = Object.freeze({
  reserve_booking: Object.freeze({ target: 'create-booking', auth: 'student_user' }),
  observe_run: Object.freeze({ target: 'admin_observe_booking_preview_run', auth: 'admin_rpc' }),
  place_deferred_holds: Object.freeze({ target: 'place-holds', auth: 'secret_worker' }),
  recover_failed_hold: Object.freeze({ target: 'fix-payment', auth: 'student_user' }),
  settle_due_lessons: Object.freeze({ target: 'settle-lessons', auth: 'secret_worker' }),
  reconcile_cleanup: Object.freeze({
    target: 'admin_reconcile_booking_provider_rehearsal_cleanup',
    auth: 'admin_rpc',
  }),
});

function requiredString(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label}_required`);
  return normalized;
}

export function buildPreviewFixtureNamespace(runId) {
  const normalized = requiredString(runId, 'run_id');
  if (!UUID_RE.test(normalized)) throw new Error('invalid_run_id');

  const short = normalized.replaceAll('-', '').slice(0, 12).toLowerCase();
  const prefix = `sp-preview-${short}`;
  return Object.freeze({
    schema_version: 1,
    run_id: normalized,
    prefix,
    student_ref: `${prefix}-student`,
    tutor_ref: `${prefix}-tutor`,
    lesson_ref: `${prefix}-lesson`,
    daily_room_prefix: `${prefix}-room`,
    disposable: true,
    contains_customer_pii: false,
  });
}

export function classifyPreviewProgress(observation, scenario) {
  const state = assertMinimizedPreviewObservation(observation);

  if (state.settled || state.booking_status === 'settled') {
    return Object.freeze({ state: 'complete', terminal: true, next_operation: null });
  }

  if (state.booking_status === 'cancelled') {
    return Object.freeze({ state: 'cancelled', terminal: true, next_operation: null });
  }

  if (state.booking_status === 'pending_checkout') {
    return Object.freeze({
      state: scenario === 'near_term_sca'
        ? 'awaiting_customer_authentication'
        : 'awaiting_checkout_completion',
      terminal: false,
      next_operation: null,
    });
  }

  if (state.booking_status === 'card_saved') {
    return Object.freeze({
      state: 'awaiting_deferred_hold_worker',
      terminal: false,
      next_operation: 'place_deferred_holds',
    });
  }

  if (state.booking_status === 'hold_failed') {
    return Object.freeze({
      state: 'awaiting_customer_payment_recovery',
      terminal: false,
      next_operation: 'recover_failed_hold',
    });
  }

  if (state.booking_status === 'hold_placed') {
    if (state.student_attendance_count === 0 || state.tutor_attendance_count === 0) {
      return Object.freeze({
        state: 'awaiting_attendance_evidence',
        terminal: false,
        next_operation: null,
      });
    }
    return Object.freeze({
      state: state.lesson_end_passed ? 'awaiting_settlement_claim' : 'lesson_in_progress',
      terminal: false,
      next_operation: state.lesson_end_passed ? 'settle_due_lessons' : null,
    });
  }

  if (state.booking_status === 'awaiting_settlement') {
    return Object.freeze({
      state: 'awaiting_settlement_worker',
      terminal: false,
      next_operation: 'settle_due_lessons',
    });
  }

  return Object.freeze({ state: 'blocked_unknown_server_state', terminal: false, next_operation: null });
}

export function createFullPreviewExecutionShell({ invokeServer }) {
  if (typeof invokeServer !== 'function') throw new Error('authoritative_server_transport_required');

  async function invokeAuthoritative(operation, payload) {
    const contract = AUTHORITATIVE_SERVER_OPERATIONS[operation];
    if (!contract) throw new Error(`unsupported_authoritative_operation:${operation}`);
    return invokeServer(Object.freeze({
      operation,
      target: contract.target,
      auth: contract.auth,
      payload,
    }));
  }

  return Object.freeze({
    async reserve({ gate, runId, scenario, lessonTypeId, startsAt }) {
      assertFullPreviewExecutionAllowed(gate);
      if (String(gate.shellGate ?? '') !== '1') throw new Error('full_preview_shell_gate_closed');

      const runContract = buildFullPreviewRunContract({ runId, scenario });
      const fixture = buildPreviewFixtureNamespace(runId);
      const lessonId = requiredString(lessonTypeId, 'lesson_type_id');
      if (!UUID_RE.test(lessonId)) throw new Error('invalid_lesson_type_id');

      const starts = new Date(requiredString(startsAt, 'starts_at'));
      if (Number.isNaN(starts.getTime())) throw new Error('invalid_starts_at');

      const response = await invokeAuthoritative('reserve_booking', {
        lesson_type_id: lessonId,
        starts_at: starts.toISOString(),
        request_id: runContract.run_id,
        express_start_request: true,
      });

      return Object.freeze({
        run_contract: runContract,
        fixture,
        reservation_response: response,
        idempotency_scope: Object.freeze({
          booking_request_id: runContract.run_id,
          server_checkout_key: 'derived_from_booking_id',
        }),
      });
    },

    async observe({ bookingId, scenario }) {
      const id = requiredString(bookingId, 'booking_id');
      if (!UUID_RE.test(id)) throw new Error('invalid_booking_id');
      const raw = await invokeAuthoritative('observe_run', { p_booking_id: id });
      const observation = assertMinimizedPreviewObservation(raw);
      return Object.freeze({
        observation,
        progress: classifyPreviewProgress(observation, scenario),
      });
    },

    async runServerStep({ operation, payload = {} }) {
      if (![
        'place_deferred_holds',
        'recover_failed_hold',
        'settle_due_lessons',
        'reconcile_cleanup',
      ].includes(operation)) {
        throw new Error(`unsupported_preview_server_step:${operation}`);
      }
      return invokeAuthoritative(operation, payload);
    },
  });
}

export function buildCleanupDisposition({ dailyRoomDeleted, appendOnlyEvidencePreserved, runId }) {
  const cleanup = classifyProviderCleanup({ dailyRoomDeleted, appendOnlyEvidencePreserved });
  if (!cleanup.reconciliation_required) {
    return Object.freeze({ ...cleanup, reconciliation_intent: null });
  }

  const normalized = requiredString(runId, 'run_id');
  if (!UUID_RE.test(normalized)) throw new Error('invalid_run_id');
  return Object.freeze({
    ...cleanup,
    reconciliation_intent: Object.freeze({
      operation: 'reconcile_cleanup',
      run_id: normalized,
      reason_code: cleanup.reason,
      evidence_reference_required: true,
      automatic_provider_retry: false,
    }),
  });
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isMainModule()) {
  if (process.env[FULL_PREVIEW_WRITE_GATE] !== '1' || process.env[FULL_PREVIEW_SHELL_GATE] !== '1') {
    console.log('Full lesson-booking preview execution shell disabled.');
  } else {
    throw new Error(
      'Full preview shell transport is intentionally not auto-configured. '
      + 'Use the approved preview adapter only after provider/test environment approval.',
    );
  }
}
