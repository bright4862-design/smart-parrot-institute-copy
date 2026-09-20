import { assertMinimizedFullPreviewRunSnapshot } from './lesson-booking-full-preview-run-registry.mjs';
import { assertFullPreviewProviderWritesReady } from './lesson-booking-full-preview-readiness-manifest.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const FULL_PREVIEW_WORKER_WRITE_GATE = 'SMART_PARROT_FULL_PREVIEW_WORKER_WRITES_ENABLED';

const CUSTOMER_PAUSES = Object.freeze({
  awaiting_checkout_completion: Object.freeze({
    reason: 'checkout_completion',
    action: 'complete_checkout',
    target: 'create-booking_checkout_url',
  }),
  awaiting_customer_authentication: Object.freeze({
    reason: 'customer_authentication',
    action: 'complete_stripe_authentication',
    target: 'stripe_checkout_customer_surface',
  }),
  awaiting_customer_payment_recovery: Object.freeze({
    reason: 'payment_recovery',
    action: 'open_fix_payment',
    target: 'fix-payment',
  }),
});

const WORKER_ACTIONS = Object.freeze({
  awaiting_deferred_hold_worker: Object.freeze({
    operation: 'place_deferred_holds',
    authority: 'supabase_edge_function',
    auth: 'secret_worker',
  }),
  awaiting_settlement_worker: Object.freeze({
    operation: 'settle_due_lessons',
    authority: 'supabase_edge_function',
    auth: 'secret_worker',
  }),
});

function requiredRunId(value) {
  const runId = String(value ?? '').trim();
  if (!UUID_RE.test(runId)) throw new Error('invalid_run_id');
  return runId;
}

function normalizeExpectedRevision(value) {
  if (value == null) return null;
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 0) throw new Error('invalid_expected_run_revision');
  return revision;
}

function pauseEnvelope(snapshot, pause) {
  return Object.freeze({
    schema_version: 1,
    status: 'paused',
    run_id: snapshot.run_id,
    revision: snapshot.revision,
    state: snapshot.state,
    reason: pause.reason,
    customer_action: Object.freeze({
      action: pause.action,
      target: pause.target,
      requires_customer_present_session: true,
      automation_may_execute: false,
      money_transition_authority: 'server_only',
    }),
    resume: Object.freeze({
      run_id: snapshot.run_id,
      expected_revision: snapshot.revision,
      refresh_server_state_first: true,
    }),
  });
}

export function buildPreviewWorkerIntent(snapshot, readinessManifest, { workerWriteGate = '0' } = {}) {
  const run = assertMinimizedFullPreviewRunSnapshot(snapshot);
  const worker = WORKER_ACTIONS[run.state] ?? null;
  if (!worker) return null;

  const gateOpen = String(workerWriteGate) === '1';
  const providerReady = readinessManifest?.provider_write_ready === true;
  return Object.freeze({
    schema_version: 1,
    run_id: run.run_id,
    revision: run.revision,
    operation: worker.operation,
    authority: worker.authority,
    auth: worker.auth,
    execution: gateOpen && providerReady ? 'approved_preview_write' : 'dry_run_only',
    provider_write_ready: providerReady,
    worker_write_gate_open: gateOpen,
    browser_authoritative: false,
    direct_provider_call: false,
  });
}

export function createResumableFullPreviewExecutor({
  shell,
  readinessManifest,
  workerWriteGate = '0',
} = {}) {
  if (!shell || typeof shell.refreshRun !== 'function' || typeof shell.runServerStep !== 'function') {
    throw new Error('full_preview_execution_shell_required');
  }

  async function refresh(runId) {
    const raw = await shell.refreshRun({ runId: requiredRunId(runId) });
    return assertMinimizedFullPreviewRunSnapshot(raw);
  }

  return Object.freeze({
    async resume({ runId, expectedRevision = null } = {}) {
      const id = requiredRunId(runId);
      const expected = normalizeExpectedRevision(expectedRevision);
      const snapshot = await refresh(id);

      if (expected != null && snapshot.revision !== expected) {
        return Object.freeze({
          schema_version: 1,
          status: 'stale_revision',
          run_id: snapshot.run_id,
          expected_revision: expected,
          authoritative_revision: snapshot.revision,
          authoritative_state: snapshot.state,
          server_write_performed: false,
          action: 'refresh_and_reconfirm',
        });
      }

      if (snapshot.terminal) {
        return Object.freeze({
          schema_version: 1,
          status: 'terminal',
          run_id: snapshot.run_id,
          revision: snapshot.revision,
          state: snapshot.state,
          replay: true,
          server_write_performed: false,
        });
      }

      const customerPause = CUSTOMER_PAUSES[snapshot.state];
      if (customerPause) return pauseEnvelope(snapshot, customerPause);

      if (snapshot.state === 'awaiting_attendance_evidence') {
        return Object.freeze({
          schema_version: 1,
          status: 'paused',
          run_id: snapshot.run_id,
          revision: snapshot.revision,
          state: snapshot.state,
          reason: 'attendance_evidence',
          server_write_performed: false,
          resume: Object.freeze({
            run_id: snapshot.run_id,
            expected_revision: snapshot.revision,
            refresh_server_state_first: true,
          }),
        });
      }

      if (snapshot.state === 'lesson_in_progress') {
        return Object.freeze({
          schema_version: 1,
          status: 'paused',
          run_id: snapshot.run_id,
          revision: snapshot.revision,
          state: snapshot.state,
          reason: 'server_time_before_lesson_end',
          server_write_performed: false,
          resume: Object.freeze({
            run_id: snapshot.run_id,
            expected_revision: snapshot.revision,
            refresh_server_state_first: true,
          }),
        });
      }

      const workerIntent = buildPreviewWorkerIntent(snapshot, readinessManifest, { workerWriteGate });
      if (workerIntent) {
        if (workerIntent.execution !== 'approved_preview_write') {
          return Object.freeze({
            schema_version: 1,
            status: 'paused',
            run_id: snapshot.run_id,
            revision: snapshot.revision,
            state: snapshot.state,
            reason: readinessManifest?.provider_write_ready === true
              ? 'worker_write_gate_closed'
              : 'provider_configuration_required',
            server_write_performed: false,
            worker_intent: workerIntent,
          });
        }

        assertFullPreviewProviderWritesReady(readinessManifest);
        await shell.runServerStep({ operation: workerIntent.operation, payload: {} });
        const after = await refresh(id);
        return Object.freeze({
          schema_version: 1,
          status: after.terminal ? 'terminal' : 'server_step_complete',
          run_id: after.run_id,
          previous_revision: snapshot.revision,
          revision: after.revision,
          state: after.state,
          terminal: after.terminal,
          server_write_performed: true,
          worker_operation: workerIntent.operation,
        });
      }

      if (snapshot.state === 'initialized') {
        return Object.freeze({
          schema_version: 1,
          status: 'blocked',
          run_id: snapshot.run_id,
          revision: snapshot.revision,
          reason: 'booking_not_bound',
          server_write_performed: false,
        });
      }

      return Object.freeze({
        schema_version: 1,
        status: 'blocked',
        run_id: snapshot.run_id,
        revision: snapshot.revision,
        reason: 'unknown_or_manual_server_state',
        state: snapshot.state,
        server_write_performed: false,
      });
    },
  });
}
