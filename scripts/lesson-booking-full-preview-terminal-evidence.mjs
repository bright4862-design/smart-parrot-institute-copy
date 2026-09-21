import { createHash } from 'node:crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TERMINAL_STATES = new Set(['complete', 'cancelled']);
const CLOSE_STATES = new Set(['fixture_sessions_closed', 'fixture_session_close_ambiguous']);
const CLEANUP_STATES = new Set([
  'fixture_cleanup_complete',
  'fixture_cleanup_preserved_by_evidence',
  'fixture_cleanup_ambiguous',
  'fixture_cleanup_deferred_session_close_ambiguous',
  'fixture_cleanup_deferred_missing_transcript',
  'fixture_cleanup_deferred_write_gate_closed',
]);

function required(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label}_required`);
  return normalized;
}

function assertRunId(value) {
  const runId = required(value, 'run_id');
  if (!UUID_RE.test(runId)) throw new Error('run_id_invalid');
  return runId.toLowerCase();
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function minimizedTranscriptPayload(transcript) {
  if (!transcript || typeof transcript !== 'object') throw new Error('provider_test_transcript_required');
  const runId = assertRunId(transcript.run_id);
  if (Number(transcript.schema_version) !== 1) throw new Error('provider_test_transcript_schema_invalid');
  if (transcript.provider_writes_enabled !== false || transcript.secrets_exposed !== false) {
    throw new Error('provider_test_transcript_not_redacted');
  }
  if (String(transcript.idempotency_namespace ?? '') !== `smart-parrot-preview:${runId}`) {
    throw new Error('provider_test_transcript_namespace_mismatch');
  }
  const providerEvidence = transcript.provider_evidence;
  if (!providerEvidence || typeof providerEvidence !== 'object' || Array.isArray(providerEvidence)) {
    throw new Error('provider_test_transcript_evidence_invalid');
  }
  const allowedEvidence = [
    'stripe_signed_webhook_proof',
    'daily_signed_endpoint_verification',
    'provider_rehearsal',
  ];
  const evidence = Object.fromEntries(
    allowedEvidence.map((key) => [key, required(providerEvidence[key], `provider_evidence_${key}`)]),
  );
  return Object.freeze({
    schema_version: 1,
    run_id: runId,
    idempotency_namespace: transcript.idempotency_namespace,
    fixture_lifecycle_status: required(transcript.fixture_lifecycle_status, 'fixture_lifecycle_status'),
    operator_status: required(transcript.operator_status, 'operator_status'),
    provider_evidence: Object.freeze(evidence),
    provider_ready_for_bounded_rehearsal: Boolean(transcript.provider_ready_for_bounded_rehearsal),
    provider_writes_enabled: false,
    secrets_exposed: false,
  });
}

export function digestRedactedProviderTestTranscript(transcript) {
  const payload = minimizedTranscriptPayload(transcript);
  return Object.freeze({
    schema_version: 1,
    run_id: payload.run_id,
    transcript_sha256: sha256(stableJson(payload)),
    canonical_payload: payload,
  });
}

function normalizeCloseSummary(summary) {
  const status = String(summary?.status ?? 'fixture_session_close_ambiguous');
  if (!CLOSE_STATES.has(status)) return Object.freeze({ status: 'fixture_session_close_ambiguous', reconciliation_required: true });
  return Object.freeze({
    status,
    reconciliation_required: status !== 'fixture_sessions_closed' || Boolean(summary?.reconciliation_required),
  });
}

function normalizeCleanupSummary(summary) {
  const status = String(summary?.status ?? 'fixture_cleanup_ambiguous');
  if (!CLEANUP_STATES.has(status)) return Object.freeze({ status: 'fixture_cleanup_ambiguous', reconciliation_required: true });
  return Object.freeze({
    status,
    reconciliation_required: status.includes('ambiguous') || status.includes('deferred') || Boolean(summary?.reconciliation_required),
  });
}

export function buildTerminalPreviewEvidenceRecord({
  runState,
  transcript,
  sessionCloseSummary,
  fixtureCleanupSummary,
} = {}) {
  const runId = assertRunId(runState?.run_id);
  const terminalState = required(runState?.state, 'terminal_state');
  if (runState?.terminal !== true || !TERMINAL_STATES.has(terminalState)) throw new Error('terminal_server_run_required');
  const digest = digestRedactedProviderTestTranscript(transcript);
  if (digest.run_id !== runId) throw new Error('terminal_evidence_run_mismatch');
  const close = normalizeCloseSummary(sessionCloseSummary);
  const cleanup = normalizeCleanupSummary(fixtureCleanupSummary);
  const reconciliationRequired = close.reconciliation_required || cleanup.reconciliation_required;
  const correlationPayload = Object.freeze({
    schema_version: 1,
    run_id: runId,
    terminal_state: terminalState,
    transcript_sha256: digest.transcript_sha256,
    session_close_status: close.status,
    fixture_cleanup_status: cleanup.status,
    reconciliation_required: reconciliationRequired,
  });
  return Object.freeze({
    ...correlationPayload,
    correlation_sha256: sha256(stableJson(correlationPayload)),
    provider_writes_enabled: false,
    secrets_exposed: false,
  });
}

export async function finalizeTerminalPreviewRehearsal({
  runState,
  transcript,
  sessionBundle,
  cleanupFixturePrincipals,
  recordTerminalEvidence,
  cleanupWriteGate,
  secretKey,
} = {}) {
  const runId = assertRunId(runState?.run_id);
  const terminalState = required(runState?.state, 'terminal_state');
  if (runState?.terminal !== true || !TERMINAL_STATES.has(terminalState)) throw new Error('terminal_server_run_required');
  if (!sessionBundle || typeof sessionBundle.close !== 'function') throw new Error('fixture_session_bundle_required');
  if (typeof cleanupFixturePrincipals !== 'function') throw new Error('fixture_cleanup_function_required');
  if (typeof recordTerminalEvidence !== 'function') throw new Error('terminal_evidence_recorder_required');

  let closeSummary;
  try {
    closeSummary = normalizeCloseSummary(await sessionBundle.close());
  } catch {
    closeSummary = Object.freeze({ status: 'fixture_session_close_ambiguous', reconciliation_required: true });
  }

  let cleanupSummary;
  if (closeSummary.status !== 'fixture_sessions_closed') {
    cleanupSummary = Object.freeze({
      status: 'fixture_cleanup_deferred_session_close_ambiguous',
      reconciliation_required: true,
    });
  } else if (!transcript) {
    cleanupSummary = Object.freeze({
      status: 'fixture_cleanup_deferred_missing_transcript',
      reconciliation_required: true,
    });
  } else if (String(cleanupWriteGate ?? '') !== '1' || !String(secretKey ?? '').trim().startsWith('sb_secret_')) {
    cleanupSummary = Object.freeze({
      status: 'fixture_cleanup_deferred_write_gate_closed',
      reconciliation_required: true,
    });
  } else {
    try {
      cleanupSummary = normalizeCleanupSummary(await cleanupFixturePrincipals());
    } catch {
      cleanupSummary = Object.freeze({ status: 'fixture_cleanup_ambiguous', reconciliation_required: true });
    }
  }

  if (!transcript) {
    return Object.freeze({
      schema_version: 1,
      run_id: runId,
      status: 'terminal_cleanup_requires_reconciliation',
      session_close_status: closeSummary.status,
      fixture_cleanup_status: cleanupSummary.status,
      evidence_recorded: false,
      reconciliation_required: true,
      provider_writes_enabled: false,
      secrets_exposed: false,
    });
  }

  const evidence = buildTerminalPreviewEvidenceRecord({
    runState,
    transcript,
    sessionCloseSummary: closeSummary,
    fixtureCleanupSummary: cleanupSummary,
  });
  const acknowledgement = await recordTerminalEvidence(evidence);
  if (acknowledgement?.run_id !== runId) throw new Error('terminal_evidence_acknowledgement_mismatch');
  if (acknowledgement?.correlation_sha256 !== evidence.correlation_sha256) {
    throw new Error('terminal_evidence_correlation_mismatch');
  }

  return Object.freeze({
    schema_version: 1,
    run_id: runId,
    status: evidence.reconciliation_required ? 'terminal_cleanup_requires_reconciliation' : 'terminal_cleanup_recorded',
    transcript_sha256: evidence.transcript_sha256,
    correlation_sha256: evidence.correlation_sha256,
    session_close_status: evidence.session_close_status,
    fixture_cleanup_status: evidence.fixture_cleanup_status,
    evidence_recorded: true,
    evidence_replay: Boolean(acknowledgement?.replay),
    reconciliation_required: evidence.reconciliation_required,
    provider_writes_enabled: false,
    secrets_exposed: false,
  });
}

export function createTerminalEvidenceRecorder(transport) {
  if (!transport || typeof transport.invokeServer !== 'function') throw new Error('preview_transport_required');
  return async (evidence) => transport.invokeServer({
    target: 'admin_record_booking_full_preview_terminal_evidence',
    auth: 'admin_rpc',
    payload: {
      p_run_id: evidence.run_id,
      p_terminal_state: evidence.terminal_state,
      p_transcript_sha256: evidence.transcript_sha256,
      p_correlation_sha256: evidence.correlation_sha256,
      p_session_close_status: evidence.session_close_status,
      p_fixture_cleanup_status: evidence.fixture_cleanup_status,
      p_reconciliation_required: evidence.reconciliation_required,
    },
  });
}

export async function runTerminalPreviewOperationWithFinalization({
  operation,
  finalization,
} = {}) {
  if (typeof operation !== 'function') throw new Error('terminal_preview_operation_required');
  let operationResult = null;
  let primaryFailure = null;
  try {
    operationResult = await operation();
  } catch {
    primaryFailure = new Error('preview_terminal_operation_failed');
  }

  const summary = await finalizeTerminalPreviewRehearsal({
    ...finalization,
    transcript: operationResult?.transcript ?? finalization?.transcript ?? null,
  });

  if (primaryFailure) {
    primaryFailure.finalization = summary;
    throw primaryFailure;
  }
  return Object.freeze({ operation_result: operationResult, finalization: summary });
}
