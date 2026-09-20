const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT_REF_RE = /^[a-z0-9]{15,40}$/;

export const FULL_PREVIEW_WRITE_GATE = 'SMART_PARROT_FULL_PREVIEW_EXECUTION_ENABLED';

export const FULL_PREVIEW_STAGES = Object.freeze([
  Object.freeze({
    stage: 'booking_reservation',
    authority: 'supabase',
    invoke: 'create-booking',
    auth: 'student_user',
    direct_provider_write: false,
  }),
  Object.freeze({
    stage: 'stripe_test_authorization',
    authority: 'existing_server_payment_path',
    invoke: 'create-booking|stripe-webhook|place-holds|fix-payment',
    auth: 'user_or_secret_or_signed_webhook',
    direct_provider_write: false,
  }),
  Object.freeze({
    stage: 'daily_attendance',
    authority: 'signed_provider_or_server_checkin',
    invoke: 'daily-webhook|check-in',
    auth: 'signed_webhook_or_booking_user',
    direct_provider_write: false,
  }),
  Object.freeze({
    stage: 'deterministic_settlement',
    authority: 'supabase_worker',
    invoke: 'settle-lessons',
    auth: 'secret_worker',
    direct_provider_write: false,
  }),
  Object.freeze({
    stage: 'terminal_evidence_reconciliation',
    authority: 'supabase',
    invoke: 'server_state_and_append_only_evidence',
    auth: 'admin_read_only',
    direct_provider_write: false,
  }),
]);

export const FULL_PREVIEW_SCENARIOS = Object.freeze({
  near_term_success: Object.freeze({
    hold_strategy: 'at_checkout',
    checkout_mode: 'payment',
    stripe_test_payment_method: 'pm_card_visa',
    automated: true,
    expected_authorization_observation: 'requires_capture',
    recovery_path: null,
  }),
  near_term_sca: Object.freeze({
    hold_strategy: 'at_checkout',
    checkout_mode: 'payment',
    stripe_test_payment_method: null,
    stripe_test_fixture: 'sca_customer_present',
    automated: false,
    expected_authorization_observation: 'requires_action_then_requires_capture',
    recovery_path: 'customer_present_authentication',
  }),
  deferred_success: Object.freeze({
    hold_strategy: 'deferred',
    checkout_mode: 'setup',
    stripe_test_payment_method: 'pm_card_visa',
    automated: true,
    expected_authorization_observation: 'requires_capture',
    recovery_path: null,
  }),
  deferred_hold_failure_recovery: Object.freeze({
    hold_strategy: 'deferred',
    checkout_mode: 'setup',
    stripe_test_payment_method: null,
    stripe_test_fixture: 'off_session_authentication_required',
    automated: false,
    expected_authorization_observation: 'hold_failed',
    recovery_path: 'fix-payment',
  }),
});

export const FULL_PREVIEW_EVIDENCE_POLICY = Object.freeze({
  preserve: Object.freeze([
    'booking_state',
    'consent_evidence',
    'payment_ledger',
    'attendance_evidence',
    'settlement_evidence',
    'provider_webhook_evidence',
  ]),
  cleanup_or_reconcile: Object.freeze([
    'driver_owned_daily_preview_room',
  ]),
  never_auto_delete: Object.freeze([
    'stripe_customer_used_by_financial_evidence',
    'stripe_payment_method_used_by_financial_evidence',
    'supabase_booking_rows',
    'append_only_financial_or_consent_or_attendance_rows',
  ]),
});

function requiredString(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label}_required`);
  return normalized;
}

export function assertFullPreviewExecutionAllowed(input = {}) {
  const previewRef = requiredString(input.previewRef, 'preview_project_ref');
  const supabaseUrl = requiredString(input.supabaseUrl, 'supabase_url').replace(/\/$/, '');
  const stripeKey = requiredString(input.stripeKey, 'stripe_test_key');

  if (String(input.writeGate ?? '') !== '1') throw new Error('full_preview_write_gate_closed');
  if (input.preflightStatus !== 'preflight_ready') throw new Error('full_preview_preflight_not_ready');
  if (input.rehearsalReady !== true) throw new Error('provider_rehearsal_not_ready');
  if (Number(input.unresolvedCleanupFailures ?? 0) !== 0) throw new Error('provider_cleanup_unresolved');
  if (input.providerIdentityReady !== true) throw new Error('provider_identity_not_ready');
  if (input.dailyIdentityReady !== true) throw new Error('daily_identity_not_ready');
  if (!PROJECT_REF_RE.test(previewRef)) throw new Error('invalid_preview_project_ref');
  if (input.productionRef && previewRef === String(input.productionRef).trim()) {
    throw new Error('production_project_refused');
  }
  if (supabaseUrl !== `https://${previewRef}.supabase.co`) throw new Error('preview_project_url_mismatch');
  if (!stripeKey.startsWith('sk_test_')) throw new Error('stripe_test_key_required');

  return Object.freeze({
    allowed: true,
    preview_project_verified: true,
    stripe_test_mode_verified: true,
    provider_identity_verified: true,
    unresolved_cleanup_failures: 0,
  });
}

export function buildFullPreviewRunContract({ runId, scenario }) {
  const normalizedRunId = requiredString(runId, 'run_id');
  if (!UUID_RE.test(normalizedRunId)) throw new Error('invalid_run_id');
  if (!Object.prototype.hasOwnProperty.call(FULL_PREVIEW_SCENARIOS, scenario)) {
    throw new Error('unknown_full_preview_scenario');
  }

  const scenarioContract = FULL_PREVIEW_SCENARIOS[scenario];
  return Object.freeze({
    schema_version: 1,
    run_id: normalizedRunId,
    scenario,
    scenario_contract: scenarioContract,
    authoritative_stages: FULL_PREVIEW_STAGES,
    evidence_policy: FULL_PREVIEW_EVIDENCE_POLICY,
    time_authority: 'server_and_provider_only',
    money_authority: 'existing_supabase_edge_functions_only',
    browser_authoritative_transitions: false,
    direct_stripe_api_calls_from_driver: false,
    direct_daily_api_calls_from_driver: false,
    cleanup_requires_reconciliation_on_ambiguity: true,
  });
}

export function classifyProviderCleanup({ dailyRoomDeleted, appendOnlyEvidencePreserved }) {
  if (appendOnlyEvidencePreserved !== true) {
    throw new Error('append_only_evidence_must_be_preserved');
  }

  if (dailyRoomDeleted === true) {
    return Object.freeze({ status: 'cleanup_complete', reconciliation_required: false });
  }

  return Object.freeze({
    status: 'cleanup_incomplete',
    reconciliation_required: true,
    reason: dailyRoomDeleted === false ? 'daily_room_delete_failed' : 'daily_room_delete_ambiguous',
  });
}

export function classifyAuthorizationObservation({ scenario, livemode, status }) {
  if (!Object.prototype.hasOwnProperty.call(FULL_PREVIEW_SCENARIOS, scenario)) {
    throw new Error('unknown_full_preview_scenario');
  }
  if (livemode !== false) throw new Error('live_stripe_object_disabled');

  if (status === 'requires_capture') {
    return Object.freeze({ state: 'authorized_for_manual_capture', customer_action_required: false });
  }

  if (status === 'requires_action') {
    return Object.freeze({ state: 'customer_action_required', customer_action_required: true });
  }

  if (status === 'requires_payment_method' && scenario === 'deferred_hold_failure_recovery') {
    return Object.freeze({ state: 'hold_failed_recovery_required', customer_action_required: true });
  }

  throw new Error(`unexpected_authorization_observation:${status}`);
}
