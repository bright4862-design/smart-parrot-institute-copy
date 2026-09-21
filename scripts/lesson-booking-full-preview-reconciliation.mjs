const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QUEUE_SEVERITIES = new Set(['urgent', 'high']);
const RETENTION_STATES = new Set([
  'reconciliation_hold',
  'retention_active',
  'retention_review_due',
  'retention_preserved',
]);
const RETENTION_REVIEW_DECISIONS = new Set(['preserve', 'eligible_for_cleanup_review']);
const RECONCILIATION_RESOLUTION_KINDS = new Set(['cleanup_verified', 'preserve']);

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

function normalizeQueueRow(row) {
  const severity = required(row?.severity, 'severity');
  if (!QUEUE_SEVERITIES.has(severity)) throw new Error('reconciliation_severity_invalid');
  if (String(row?.retention_status ?? '') !== 'reconciliation_hold') {
    throw new Error('reconciliation_retention_status_invalid');
  }
  if (row?.retention_review_after != null) throw new Error('reconciliation_retention_review_must_be_held');

  return Object.freeze({
    run_id: assertRunId(row?.run_id),
    terminal_state: required(row?.terminal_state, 'terminal_state'),
    severity,
    reason: required(row?.reason, 'reason'),
    occurred_at: parseIso(row?.occurred_at, 'occurred_at'),
    retention_status: 'reconciliation_hold',
    retention_review_after: null,
  });
}

export function normalizeFullPreviewReconciliationQueue(rows) {
  if (!Array.isArray(rows)) throw new Error('reconciliation_queue_invalid');
  return Object.freeze(rows.map(normalizeQueueRow));
}

export function normalizeFullPreviewTerminalRetentionStatus(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('terminal_retention_status_invalid');
  }
  const schemaVersion = String(payload.schema_version ?? '');
  if (!['smart_parrot_full_preview_terminal_retention_v1', 'smart_parrot_full_preview_terminal_retention_v2'].includes(schemaVersion)) {
    throw new Error('terminal_retention_schema_invalid');
  }
  const status = required(payload.retention_status, 'retention_status');
  if (!RETENTION_STATES.has(status)) throw new Error('terminal_retention_state_invalid');
  if (payload.destructive_cleanup_authorized !== false) throw new Error('terminal_retention_delete_authority_forbidden');
  if (payload.server_time_authoritative !== true) throw new Error('terminal_retention_server_time_required');
  if (Number(payload.retention_days) !== 30) throw new Error('terminal_retention_window_invalid');
  if (schemaVersion === 'smart_parrot_full_preview_terminal_retention_v2' && payload.cleanup_execution_enabled !== false) {
    throw new Error('terminal_retention_cleanup_execution_forbidden');
  }

  const reviewAfter = optionalIso(payload.retention_review_after, 'retention_review_after');
  const reviewDue = Boolean(payload.retention_review_due);
  const resolutionKind = payload.reconciliation_resolution_kind == null
    ? null
    : required(payload.reconciliation_resolution_kind, 'reconciliation_resolution_kind');
  if (resolutionKind && !RECONCILIATION_RESOLUTION_KINDS.has(resolutionKind)) {
    throw new Error('reconciliation_resolution_kind_invalid');
  }
  const reviewDecision = payload.retention_review_decision == null
    ? null
    : required(payload.retention_review_decision, 'retention_review_decision');
  if (reviewDecision && !RETENTION_REVIEW_DECISIONS.has(reviewDecision)) {
    throw new Error('retention_review_decision_invalid');
  }
  const reviewRecordedAt = optionalIso(payload.retention_review_recorded_at, 'retention_review_recorded_at');

  if (status === 'reconciliation_hold' && (reviewAfter !== null || reviewDue)) {
    throw new Error('terminal_reconciliation_hold_invalid');
  }
  if (status === 'retention_preserved' && (reviewAfter !== null || reviewDue)) {
    throw new Error('terminal_retention_preserved_invalid');
  }
  if (status === 'retention_review_due' && (!reviewAfter || !reviewDue)) {
    throw new Error('terminal_retention_due_invalid');
  }
  if (status === 'retention_active' && (!reviewAfter || reviewDue)) {
    throw new Error('terminal_retention_active_invalid');
  }

  return Object.freeze({
    schema_version: schemaVersion,
    run_id: assertRunId(payload.run_id),
    retention_status: status,
    reconciliation_required: Boolean(payload.reconciliation_required),
    reconciliation_resolved: schemaVersion.endsWith('_v2') ? Boolean(payload.reconciliation_resolved) : false,
    reconciliation_resolution_kind: schemaVersion.endsWith('_v2') ? resolutionKind : null,
    evidence_recorded_at: parseIso(payload.evidence_recorded_at, 'evidence_recorded_at'),
    retention_days: 30,
    retention_review_after: reviewAfter,
    retention_review_due: reviewDue,
    retention_review_decision: schemaVersion.endsWith('_v2') ? reviewDecision : null,
    retention_review_recorded_at: schemaVersion.endsWith('_v2') ? reviewRecordedAt : null,
    destructive_cleanup_authorized: false,
    cleanup_execution_enabled: false,
    server_time_authoritative: true,
  });
}

export function normalizeFullPreviewRetentionReview(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('retention_review_response_invalid');
  }
  if (String(payload.schema_version ?? '') !== 'smart_parrot_full_preview_retention_review_v1') {
    throw new Error('retention_review_schema_invalid');
  }
  const decision = required(payload.decision, 'retention_review_decision');
  if (!RETENTION_REVIEW_DECISIONS.has(decision)) throw new Error('retention_review_decision_invalid');
  const basis = required(payload.basis_status, 'retention_review_basis');
  if (!RETENTION_STATES.has(basis)) throw new Error('retention_review_basis_invalid');
  if (payload.destructive_cleanup_authorized !== false || payload.cleanup_execution_enabled !== false) {
    throw new Error('retention_review_cleanup_authority_forbidden');
  }
  if (payload.server_time_authoritative !== true) throw new Error('retention_review_server_time_required');

  return Object.freeze({
    schema_version: 'smart_parrot_full_preview_retention_review_v1',
    run_id: assertRunId(payload.run_id),
    decision,
    basis_status: basis,
    reviewed_at: parseIso(payload.reviewed_at, 'reviewed_at'),
    replay: Boolean(payload.replay),
    destructive_cleanup_authorized: false,
    cleanup_execution_enabled: false,
    server_time_authoritative: true,
  });
}

export function createFullPreviewReconciliationReader(transport) {
  if (!transport || typeof transport.invokeServer !== 'function') throw new Error('preview_transport_required');

  return Object.freeze({
    async listQueue(limit = 50) {
      const bounded = Math.max(1, Math.min(100, Number(limit) || 50));
      const rows = await transport.invokeServer({
        target: 'admin_booking_full_preview_reconciliation_queue',
        auth: 'admin_rpc',
        payload: { p_limit: bounded },
      });
      return normalizeFullPreviewReconciliationQueue(rows ?? []);
    },

    async getRetentionStatus(runId) {
      const payload = await transport.invokeServer({
        target: 'admin_booking_full_preview_terminal_retention_status',
        auth: 'admin_rpc',
        payload: { p_run_id: assertRunId(runId) },
      });
      return normalizeFullPreviewTerminalRetentionStatus(payload);
    },

    async recordRetentionReview(runId, decision) {
      const normalizedDecision = required(decision, 'retention_review_decision');
      if (!RETENTION_REVIEW_DECISIONS.has(normalizedDecision)) throw new Error('retention_review_decision_invalid');
      const payload = await transport.invokeServer({
        target: 'admin_record_booking_full_preview_retention_review',
        auth: 'admin_rpc',
        payload: {
          p_run_id: assertRunId(runId),
          p_decision: normalizedDecision,
        },
      });
      return normalizeFullPreviewRetentionReview(payload);
    },
  });
}

export function summarizeFullPreviewReconciliationQueue(rows) {
  const normalized = normalizeFullPreviewReconciliationQueue(rows);
  return Object.freeze({
    schema_version: 1,
    total: normalized.length,
    urgent: normalized.filter((row) => row.severity === 'urgent').length,
    high: normalized.filter((row) => row.severity === 'high').length,
    destructive_cleanup_authorized: false,
    provider_writes_enabled: false,
    server_time_authoritative: true,
  });
}
