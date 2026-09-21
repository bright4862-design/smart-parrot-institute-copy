const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVOCATION_REASONS = new Set(['preserve_override', 'review_changed', 'manual_safety_hold']);
const SOURCE_PLAN_KINDS = new Set(['base_plan', 'renewal']);

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
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label}_invalid`);
  return parsed.toISOString();
}

function assertNoCleanupAuthority(payload, label) {
  if (payload?.destructive_cleanup_authorized !== false) {
    throw new Error(`${label}_delete_authority_forbidden`);
  }
  if (payload?.cleanup_execution_enabled !== false) {
    throw new Error(`${label}_cleanup_execution_forbidden`);
  }
  if (payload?.server_time_authoritative !== true) {
    throw new Error(`${label}_server_time_required`);
  }
}

function assertRevocationReason(value) {
  const reason = required(value, 'revocation_reason').toLowerCase();
  if (!REVOCATION_REASONS.has(reason)) throw new Error('cleanup_plan_revocation_reason_invalid');
  return reason;
}

function assertOrderedWindow(generatedAt, expiresAt, label) {
  if (new Date(expiresAt).getTime() <= new Date(generatedAt).getTime()) {
    throw new Error(`${label}_expiry_invalid`);
  }
}

export function normalizeFullPreviewCleanupPlanLifecycle(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('cleanup_plan_lifecycle_invalid');
  }
  if (String(payload.schema_version ?? '') !== 'smart_parrot_full_preview_cleanup_plan_lifecycle_v1') {
    throw new Error('cleanup_plan_lifecycle_schema_invalid');
  }
  const eventKind = required(payload.event_kind, 'event_kind');
  if (!['renewed', 'revoked'].includes(eventKind)) {
    throw new Error('cleanup_plan_lifecycle_event_invalid');
  }
  assertNoCleanupAuthority(payload, 'cleanup_plan_lifecycle');

  const common = {
    schema_version: 'smart_parrot_full_preview_cleanup_plan_lifecycle_v1',
    run_id: assertRunId(payload.run_id),
    event_kind: eventKind,
    prior_effective_expires_at: parseIso(payload.prior_effective_expires_at, 'prior_effective_expires_at'),
    replay: Boolean(payload.replay),
    destructive_cleanup_authorized: false,
    cleanup_execution_enabled: false,
    server_time_authoritative: true,
  };

  if (eventKind === 'renewed') {
    const generatedAt = parseIso(payload.effective_generated_at, 'effective_generated_at');
    const expiresAt = parseIso(payload.effective_expires_at, 'effective_expires_at');
    assertOrderedWindow(generatedAt, expiresAt, 'cleanup_plan_lifecycle');
    const planStatus = required(payload.plan_status, 'plan_status');
    if (!['active', 'expired'].includes(planStatus)) {
      throw new Error('cleanup_plan_lifecycle_status_invalid');
    }
    return Object.freeze({
      ...common,
      effective_generated_at: generatedAt,
      effective_expires_at: expiresAt,
      plan_status: planStatus,
    });
  }

  return Object.freeze({
    ...common,
    reason_code: assertRevocationReason(payload.reason_code),
    recorded_at: parseIso(payload.recorded_at, 'recorded_at'),
  });
}

export function normalizeFullPreviewCleanupExecutionManifestPreview(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('cleanup_execution_manifest_preview_invalid');
  }
  if (String(payload.schema_version ?? '') !== 'smart_parrot_full_preview_cleanup_execution_manifest_preview_v1') {
    throw new Error('cleanup_execution_manifest_preview_schema_invalid');
  }
  if (String(payload.manifest_state ?? '') !== 'preview_only') {
    throw new Error('cleanup_execution_manifest_preview_state_invalid');
  }
  const sourcePlanKind = required(payload.source_plan_kind, 'source_plan_kind');
  if (!SOURCE_PLAN_KINDS.has(sourcePlanKind)) {
    throw new Error('cleanup_execution_manifest_preview_source_invalid');
  }
  if (String(payload.manifest_status ?? '') !== 'current') {
    throw new Error('cleanup_execution_manifest_preview_status_invalid');
  }
  assertNoCleanupAuthority(payload, 'cleanup_execution_manifest_preview');

  const generatedAt = parseIso(payload.plan_effective_generated_at, 'plan_effective_generated_at');
  const expiresAt = parseIso(payload.plan_effective_expires_at, 'plan_effective_expires_at');
  assertOrderedWindow(generatedAt, expiresAt, 'cleanup_execution_manifest_preview');

  return Object.freeze({
    schema_version: 'smart_parrot_full_preview_cleanup_execution_manifest_preview_v1',
    run_id: assertRunId(payload.run_id),
    manifest_state: 'preview_only',
    source_plan_kind: sourcePlanKind,
    retention_reviewed_at: parseIso(payload.retention_reviewed_at, 'retention_reviewed_at'),
    plan_effective_generated_at: generatedAt,
    plan_effective_expires_at: expiresAt,
    prepared_at: parseIso(payload.prepared_at, 'prepared_at'),
    manifest_status: 'current',
    replay: Boolean(payload.replay),
    destructive_cleanup_authorized: false,
    cleanup_execution_enabled: false,
    server_time_authoritative: true,
  });
}

export function createFullPreviewCleanupLifecycleReader(transport) {
  if (!transport || typeof transport.invokeServer !== 'function') throw new Error('preview_transport_required');

  return Object.freeze({
    async renewPlan(runId, expectedEffectiveExpiresAt, expectedReviewedAt) {
      const payload = await transport.invokeServer({
        target: 'admin_renew_booking_full_preview_cleanup_review_plan',
        auth: 'admin_rpc',
        payload: {
          p_run_id: assertRunId(runId),
          p_expected_effective_expires_at: parseIso(expectedEffectiveExpiresAt, 'expected_effective_expires_at'),
          p_expected_reviewed_at: parseIso(expectedReviewedAt, 'expected_reviewed_at'),
        },
      });
      return normalizeFullPreviewCleanupPlanLifecycle(payload);
    },

    async revokePlan(runId, expectedEffectiveExpiresAt, reasonCode) {
      const payload = await transport.invokeServer({
        target: 'admin_revoke_booking_full_preview_cleanup_review_plan',
        auth: 'admin_rpc',
        payload: {
          p_run_id: assertRunId(runId),
          p_expected_effective_expires_at: parseIso(expectedEffectiveExpiresAt, 'expected_effective_expires_at'),
          p_reason_code: assertRevocationReason(reasonCode),
        },
      });
      return normalizeFullPreviewCleanupPlanLifecycle(payload);
    },

    async prepareExecutionManifestPreview(runId, expectedEffectiveExpiresAt, expectedReviewedAt) {
      const payload = await transport.invokeServer({
        target: 'admin_prepare_booking_full_preview_cleanup_execution_manifest_preview',
        auth: 'admin_rpc',
        payload: {
          p_run_id: assertRunId(runId),
          p_expected_effective_expires_at: parseIso(expectedEffectiveExpiresAt, 'expected_effective_expires_at'),
          p_expected_reviewed_at: parseIso(expectedReviewedAt, 'expected_reviewed_at'),
        },
      });
      return normalizeFullPreviewCleanupExecutionManifestPreview(payload);
    },
  });
}
