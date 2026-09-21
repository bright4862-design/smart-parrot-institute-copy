const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ATTESTATION_SCHEMA = 'smart_parrot_full_preview_cleanup_execution_attestation_v1';
const IMPACT_CLASSES = Object.freeze([
  'full_preview_run',
  'terminal_evidence',
  'reconciliation_resolution',
  'retention_review',
  'cleanup_review_plan',
  'cleanup_plan_lifecycle',
  'cleanup_manifest_preview',
]);

function required(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label}_required`);
  return normalized;
}

function requiredUuid(value, label = 'run_id') {
  const normalized = required(value, label).toLowerCase();
  if (!UUID_RE.test(normalized)) throw new Error(`${label}_invalid`);
  return normalized;
}

function requiredIso(value, label) {
  const raw = required(value, label);
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label}_invalid`);
  return date.toISOString();
}

function requiredBoolean(value, label) {
  if (value !== true && value !== false) throw new Error(`${label}_invalid`);
  return value;
}

function requiredNonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label}_invalid`);
  return value;
}

export function normalizeFullPreviewCleanupExecutionAttestation(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('cleanup_attestation_payload_invalid');
  }
  if (raw.schema_version !== ATTESTATION_SCHEMA) {
    throw new Error('cleanup_attestation_schema_invalid');
  }
  if (raw.attestation_state !== 'non_executable') {
    throw new Error('cleanup_attestation_state_invalid');
  }
  if (raw.service_only !== true) {
    throw new Error('cleanup_attestation_service_only_required');
  }
  if (raw.destructive_cleanup_authorized !== false) {
    throw new Error('cleanup_attestation_delete_authority_forbidden');
  }
  if (raw.cleanup_execution_enabled !== false) {
    throw new Error('cleanup_attestation_execution_forbidden');
  }
  if (raw.server_time_authoritative !== true) {
    throw new Error('cleanup_attestation_server_time_required');
  }
  if (!Array.isArray(raw.impact_inventory) || raw.impact_inventory.length !== IMPACT_CLASSES.length) {
    throw new Error('cleanup_attestation_inventory_invalid');
  }

  const seen = new Set();
  const impactInventory = raw.impact_inventory.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('cleanup_attestation_inventory_item_invalid');
    }
    const artifactClass = required(item.artifact_class, 'impact_artifact_class');
    if (!IMPACT_CLASSES.includes(artifactClass) || seen.has(artifactClass)) {
      throw new Error('cleanup_attestation_inventory_class_invalid');
    }
    seen.add(artifactClass);
    return Object.freeze({
      artifact_class: artifactClass,
      row_count: requiredNonNegativeInteger(item.row_count, `impact_${artifactClass}_row_count`),
    });
  });

  for (const artifactClass of IMPACT_CLASSES) {
    if (!seen.has(artifactClass)) throw new Error('cleanup_attestation_inventory_incomplete');
  }

  return Object.freeze({
    schema_version: ATTESTATION_SCHEMA,
    run_id: requiredUuid(raw.run_id),
    attestation_state: 'non_executable',
    manifest_prepared_at: requiredIso(raw.manifest_prepared_at, 'manifest_prepared_at'),
    retention_reviewed_at: requiredIso(raw.retention_reviewed_at, 'retention_reviewed_at'),
    plan_effective_expires_at: requiredIso(raw.plan_effective_expires_at, 'plan_effective_expires_at'),
    attested_at: requiredIso(raw.attested_at, 'attested_at'),
    impact_inventory: Object.freeze(impactInventory),
    replay: requiredBoolean(raw.replay, 'replay'),
    service_only: true,
    destructive_cleanup_authorized: false,
    cleanup_execution_enabled: false,
    server_time_authoritative: true,
  });
}

export function createFullPreviewCleanupExecutionAttestationService(transport) {
  if (!transport || typeof transport.invokeServer !== 'function') {
    throw new Error('cleanup_attestation_transport_required');
  }

  return Object.freeze({
    async attest(runId, manifestPreparedAt, expectedEffectiveExpiresAt) {
      const raw = await transport.invokeServer({
        target: 'service_attest_booking_full_preview_cleanup_execution_manifest',
        auth: 'service_rpc',
        payload: {
          p_run_id: requiredUuid(runId),
          p_expected_manifest_prepared_at: requiredIso(manifestPreparedAt, 'manifest_prepared_at'),
          p_expected_effective_expires_at: requiredIso(expectedEffectiveExpiresAt, 'plan_effective_expires_at'),
        },
      });
      return normalizeFullPreviewCleanupExecutionAttestation(raw);
    },
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Phase 4C5O cleanup execution attestation is a non-executable service-only library contract; no network request was executed.');
}
