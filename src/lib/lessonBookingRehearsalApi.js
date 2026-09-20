const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REASON_RE = /^[a-z0-9][a-z0-9_.-]{2,79}$/;

function requireClient(client) {
  if (!client) throw new Error('Lesson booking Supabase client is unavailable.');
}

function assertUuid(value, label) {
  const normalized = String(value ?? '').trim();
  if (!UUID_RE.test(normalized)) throw new Error(`${label} must be a UUID.`);
  return normalized;
}

function assertReasonCode(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!REASON_RE.test(normalized)) throw new Error('reasonCode must be a short machine-readable code.');
  return normalized;
}

function assertEvidenceReference(value) {
  const normalized = String(value ?? '').trim();
  if (normalized.length < 3 || normalized.length > 200) throw new Error('evidenceReference must be 3 to 200 characters.');
  return normalized;
}

export async function listAdminProviderRehearsalHistory(client, limit = 20) {
  requireClient(client);
  const bounded = Math.max(1, Math.min(100, Number(limit) || 20));
  const { data, error } = await client.rpc('admin_provider_rehearsal_history', { p_limit: bounded });
  if (error) throw error;
  return data ?? [];
}

export async function getAdminProviderRehearsalReadiness(client) {
  requireClient(client);
  const { data, error } = await client.rpc('admin_provider_rehearsal_readiness');
  if (error) throw error;
  return data;
}

export async function reconcileAdminProviderRehearsalCleanup(client, { runId, reasonCode, evidenceReference }) {
  requireClient(client);
  const { data, error } = await client.rpc('admin_reconcile_booking_provider_rehearsal_cleanup', {
    p_run_id: assertUuid(runId, 'runId'),
    p_reason_code: assertReasonCode(reasonCode),
    p_evidence_reference: assertEvidenceReference(evidenceReference),
  });
  if (error) throw error;
  return data;
}
