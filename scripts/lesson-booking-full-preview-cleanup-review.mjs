const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLAN_STATUSES = new Set(['not_prepared', 'active', 'expired']);

function required(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label}_required`);
  return normalized;
}

function assertRunId(value) {
  const runId = required(value, 'run_id').toLowerCase();
  if (!UUID_RE.test(runId)) throw new Error('run_id_invalid');
  return runId;
}

function parseIso(value, label) {
  const normalized = required(value, label);
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new Error(`${label}_invalid`);
  return date.toISOString();
}

function optionalIso(value, label) {
  return value == null ? null : parseIso(value, label);
}

function assertNoCleanupAuthority(payload, label) {
  if (payload?.destructive_cleanup_authorized !== false) {
    throw new Error(`${label}_delete_authority_forbidden`);
  }
  if (payload?.cleanup_execution_enabled !== false) {
    throw new Error(`${label}_cleanup_execution_forbidden`);
  }
}

export function normalizeFullPreviewCleanupReviewQueue(rows) {
  if (!Array.isArray(rows)) throw new Error('cleanup_review_queue_invalid');
  return Object.freeze(rows.map((row) => {
    const planStatus = required(row?.plan_status, 'plan_status');
    if (!PLAN_STATUSES.has(planStatus)) throw new Error('cleanup_review_plan_status_invalid');
    assertNoCleanupAuthority(row, 'cleanup_review_queue');

    const generatedAt = optionalIso(row?.plan_generated_at, 'plan_generated_at');
    const expiresAt = optionalIso(row?.plan_expires_at, 'plan_expires_at');

    if (planStatus === 'not_prepared' && (generatedAt !== null || expiresAt !== null)) {
      throw new Error('cleanup_review_unprepared_plan_timestamps_forbidden');
    }
    if (planStatus !== 'not_prepared' && (!generatedAt || !expiresAt)) {
      throw new Error('cleanup_review_plan_timestamps_required');
    }

    return Object.freeze({
      run_id: assertRunId(row?.run_id),
      terminal_state: required(row?.terminal_state, 'terminal_state'),
      retention_reviewed_at: parseIso(row?.retention_reviewed_at, 'retention_reviewed_at'),
      plan_status: planStatus,
      plan_generated_at: generatedAt,
      plan_expires_at: expiresAt,
      destructive_cleanup_authorized: false,
      cleanup_execution_enabled: false,
    });
  }));
}

export function normalizeFullPreviewCleanupReviewPlan(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('cleanup_review_plan_invalid');
  }
  if (String(payload.schema_version ?? '') !== 'smart_parrot_full_preview_cleanup_review_plan_v1') {
    throw new Error('cleanup_review_plan_schema_invalid');
  }
  if (String(payload.plan_state ?? '') !== 'dry_run_only') {
    throw new Error('cleanup_review_plan_state_invalid');
  }
  const planStatus = required(payload.plan_status, 'plan_status');
  if (!['active', 'expired'].includes(planStatus)) throw new Error('cleanup_review_plan_status_invalid');
  if (payload.server_time_authoritative !== true) throw new Error('cleanup_review_server_time_required');
  assertNoCleanupAuthority(payload, 'cleanup_review_plan');

  const generatedAt = parseIso(payload.generated_at, 'generated_at');
  const expiresAt = parseIso(payload.expires_at, 'expires_at');
  if (new Date(expiresAt).getTime() <= new Date(generatedAt).getTime()) {
    throw new Error('cleanup_review_plan_expiry_invalid');
  }

  return Object.freeze({
    schema_version: 'smart_parrot_full_preview_cleanup_review_plan_v1',
    run_id: assertRunId(payload.run_id),
    plan_state: 'dry_run_only',
    retention_reviewed_at: parseIso(payload.retention_reviewed_at, 'retention_reviewed_at'),
    generated_at: generatedAt,
    expires_at: expiresAt,
    plan_status: planStatus,
    replay: Boolean(payload.replay),
    destructive_cleanup_authorized: false,
    cleanup_execution_enabled: false,
    server_time_authoritative: true,
  });
}

export function createFullPreviewCleanupReviewReader(transport) {
  if (!transport || typeof transport.invokeServer !== 'function') throw new Error('preview_transport_required');

  return Object.freeze({
    async listQueue(limit = 50) {
      const bounded = Math.max(1, Math.min(100, Number(limit) || 50));
      const rows = await transport.invokeServer({
        target: 'admin_booking_full_preview_cleanup_review_queue',
        auth: 'admin_rpc',
        payload: { p_limit: bounded },
      });
      return normalizeFullPreviewCleanupReviewQueue(rows ?? []);
    },

    async preparePlan(runId, expectedReviewedAt) {
      const payload = await transport.invokeServer({
        target: 'admin_prepare_booking_full_preview_cleanup_review_plan',
        auth: 'admin_rpc',
        payload: {
          p_run_id: assertRunId(runId),
          p_expected_reviewed_at: parseIso(expectedReviewedAt, 'expected_reviewed_at'),
        },
      });
      return normalizeFullPreviewCleanupReviewPlan(payload);
    },
  });
}
