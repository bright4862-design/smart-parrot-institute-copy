# Lesson Booking Build Progress

Last updated: 2026-09-20

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute` without explicit instruction).
- Working branch: `agent/lesson-booking-blueprint`.
- Draft PR: #16.
- Base/default branch: `main` at `210345bbe09bc46c468fb6a7e0eee0596e8d902b` at the start of this run.
- `main` remains untouched.
- Nothing from this branch has been merged, deployed, published, or applied to a live Supabase, Stripe, Daily, Base44, cron, or email environment.
- Stripe execution remains repository-locked to test/sandbox credentials and objects. Live Stripe credentials/objects remain inadmissible.
- Marketplace / Stripe Connect remains out of scope until the single-school path is stable.

## Architecture lock

- Base44/React is the app shell.
- Supabase Postgres/Auth/RLS/Edge Functions/Cron is authoritative for booking, identity, policy, evidence, time, payment state, cancellation, settlement, compliance, retention governance, and operations state.
- Browser time, identity, attendance time, tutor/price/policy fields, cancellation fees, payment transitions, compliance delivery, provider dispute state, retention decisions, provider-environment identity, and admin evidence decisions are never authoritative.
- Stripe uses hold-before/capture-after. Near-term lessons authorize at Checkout; later lessons save a payment method and a secret-authenticated worker authorizes when due.
- Daily provides online attendance evidence. Rooms are private and booking-scoped; server/provider evidence remains separate from browser state.

## Completed phases

- **Phase 0A–0C:** authoritative schema/RLS/evidence foundation, bounded availability, browser-safe Supabase client, isolated booking preview.
- **Phase 1A–1C:** atomic booking/consent, Stripe test-only Checkout + manual authorization, deferred off-session holds, failed-hold evidence and customer-present recovery.
- **Phase 2A–2B:** signed/replay-safe Daily/server attendance evidence and deterministic test-only settlement/capture/release.
- **Phase 3A–3B:** server-authoritative cancellation/withdrawal foundation, compliance acknowledgement outbox, My Lessons UX, immutable policy view, retry/dead-letter handling.
- **Phase 4A–4C3:** admin review/evidence operations, test-only dispute intake, out-of-order dispute hardening, launch health/readiness, retention/legal-hold controls, preview-project identity protection, and provider-write-disabled preview E2E gate.
- **Phase 4C4:** separate provider identity/readiness checks, disposable test-provider rehearsal with deterministic cleanup, and audited retention-duration approval/revocation hooks.
- **Phase 4C5A (current checkpoint):** append-only preview-rehearsal evidence registry, cleanup-reconciliation signals, reviewed retention approval/revocation UI, and launch-health rehearsal signals.

## Phase 4C5A — launch-rehearsal evidence + operator approval UX — complete in repository, not deployed

Verified engineering checkpoint: `b9a8ca938f7923106b0df489f231276a30cc6f5a`.

### Implemented

- Added append-only `lesson_booking_provider_rehearsals` for minimized provider rehearsal evidence. It persists only timestamps, preview/Stripe/Daily verification booleans, disposable-object created/deleted booleans, cleanup completeness, a machine-readable failure code, SHA-256 evidence hash, and admin ingestion metadata. It does **not** persist Stripe Customer IDs, Daily room names, webhook IDs/HMACs, raw provider payloads, secrets, card/payment data, customer data, or raw failure messages.
- Added admin-only, idempotent `admin_ingest_booking_provider_rehearsal(...)`. Identical replays are accepted as replays; conflicting evidence for the same run ID is rejected. Status is derived server-side as `passed`, `failed`, or `cleanup_incomplete`.
- The separately gated provider preview rehearsal now hashes its mode-0600 local evidence artifact and ingests only the minimized evidence/hash through the authenticated RPC boundary. Registry persistence failure fails the rehearsal rather than silently discarding operational evidence.
- Added append-only `lesson_booking_provider_rehearsal_reconciliations` plus `admin_reconcile_booking_provider_rehearsal_cleanup(...)`. Reconciliation records an admin, reason code, and evidence reference after independent cleanup verification; it does not call Stripe or Daily or mutate the original rehearsal evidence.
- Admin review queue now emits an urgent generic `provider_rehearsal_cleanup` item for unreconciled cleanup-incomplete preview runs without exposing provider/run identifiers through the queue surface.
- Launch health advanced to `smart_parrot_booking_launch_health_v3`, retaining prior counts and adding `provider_rehearsal_missing`, `provider_rehearsal_latest_failed`, `unreconciled_provider_cleanup_failures`, and `retention_reviews_due_next_30d`. The endpoint remains count-only and returns no customer/provider identifiers, evidence bodies, legal-hold reasons, or secrets.
- Retention governance UI now exposes the existing reviewed class approval/revocation RPCs. Approval requires positive whole-day active retention, optional archive retention, source authority, review reference, and machine-readable reason; revocation returns the class to fail-closed/unapproved status. The browser performs no direct retention-table writes and cannot enable automatic erasure.
- Added static Phase 4C5A boundary checks and executable PostgreSQL scenarios covering rehearsal ingest, idempotent replay, conflicting replay rejection, cleanup failure surfacing, reconciliation, append-only evidence, non-admin rejection, launch-health signals, and no identifier/hash leakage.
- CI keeps both preview E2E drivers closed by default. No provider write was executed during CI.

### Verification

All three workflows passed on engineering SHA `b9a8ca938f7923106b0df489f231276a30cc6f5a` after fixing two backward-compatibility regressions caught by CI:

- `Lesson booking foundation` run **#145** — passed. Deno checks, every prior booking/payment/security boundary, the Phase 4C5A boundary regression, both closed preview E2E gates, every migration and all behavioral scenarios on ephemeral PostgreSQL, and the Vite build completed successfully.
- `Heathrow Piccadilly Compatibility` run **#186** — passed.
- `Game Smoke Test` run **#256** — passed.

CI first caught an older Phase 4C3 static assertion that depended on obsolete UI wording, then an older retention scenario that still expected launch-health schema v2. Both were updated to assert the preserved semantic boundary and the new v3 rehearsal signal rather than weakening the implementation.

## Research refreshed for Phase 4C5A on 2026-09-20

### Stripe

- Stripe's current testing guidance says sandbox transactions do not move funds and test API keys should be used for API test calls. The preview rehearsal therefore remains hard-locked to `sk_test_...`, independently verifies the expected account, and creates no payment object.
- Cleanup continues to delete the disposable test Customer; a cleanup failure is now persisted as minimized operational evidence instead of existing only in a local artifact.
- References: https://docs.stripe.com/testing , https://docs.stripe.com/keys

### Supabase

- Current Supabase guidance distinguishes browser-safe publishable keys from backend-only secret keys that bypass RLS. Hosted Edge Functions expose deployment identity through `DENO_DEPLOYMENT_ID`, which remains part of the preview-project guard.
- Supabase is deprecating legacy `anon` / `service_role` keys by the end of 2026, so preview readiness continues to prefer `sb_publishable_...` and modern backend secret context.
- References: https://supabase.com/docs/guides/functions/secrets , https://supabase.com/docs/guides/getting-started/api-keys

### Daily

- Daily exposes webhook configuration including webhook/domain identity and supports deletion of disposable rooms. Phase 4C5A continues to compare only the minimum identity fields and keeps HMAC/provider response data out of the rehearsal registry.
- References: https://docs.daily.co/reference/rest-api/webhooks/get-webhook , https://docs.daily.co/reference/rest-api/rooms/delete-room

### Base44

- Base44's current developer guidance keeps sensitive operations, secrets, third-party API calls, and elevated business logic server-side, with row-level permissions enforced for client access. The Base44/React UI therefore remains an operator shell over authenticated Supabase RPCs, not the money/evidence/retention authority.
- References: https://base44.com/developers , https://base44.com/blog/application-security

### France/EU retention

- CNIL guidance updated in April 2026 continues to require purpose-based retention, with active retention and intermediate archival treated as distinct phases. If no law specifies a duration, the controller must set and justify a non-excessive duration rather than retain data indefinitely.
- Phase 4C5A therefore records reviewed duration/source approval but still introduces no automatic deletion or guessed French retention period.
- References: https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees , https://www.cnil.fr/fr/cnil-direct/question/dois-je-fixer-une-duree-de-conservation-des-donnees-dans-mon-fichier

## Next coherent slice

**Phase 4C5B — rehearsal reconciliation UX + disabled full-preview-path preflight:**

1. add an admin-safe rehearsal registry view that exposes only minimized run/status/timing fields and lets an authorized operator attach a cleanup reconciliation reference without revealing provider object IDs or raw provider evidence;
2. require a recent successful provider rehearsal and zero unreconciled cleanup failures before any future full provider preview driver is considered ready;
3. prepare a separately gated, still-disabled preview booking → Stripe test authorization → Daily attendance → deterministic settlement driver with disposable identities, test payment methods, deterministic cleanup/reconciliation evidence, and no browser-authoritative state;
4. add regressions for stale/failed rehearsal readiness, reconciliation authorization, and refusal to run against production/unknown project/provider identities;
5. keep deploy, publish, cron activation, production email, live Stripe, automatic retention deletion, and Stripe Connect disabled.

## External configuration still needed for real provider rehearsal/E2E

Repository engineering can continue without these, but provider integration cannot be exercised until a safe preview environment is explicitly configured:

- dedicated Smart Parrot Supabase preview/test project (or explicit approval of an existing safe project);
- `SMART_PARROT_PREVIEW_PROJECT_REF`, preview `VITE_SUPABASE_URL`, browser `sb_publishable_...` key, and a short-lived preview admin access token;
- modern backend `sb_secret_...` context stored only server-side/Vault;
- `SMART_PARROT_PROVIDER_E2E_ENABLED=1` only in the approved preview project;
- Stripe test/sandbox `STRIPE_SECRET_KEY`, `SMART_PARROT_STRIPE_TEST_ACCOUNT_ID`, Checkout webhook signing secret, and separate dispute webhook signing secret;
- Daily test API key, preview webhook ID, preview domain ID/name, preview-only room prefix, webhook HMAC secret, and a test webhook delivery;
- HTTPS `APP_URL` and public HTTPS `TERMS_OF_SERVICE_URL`;
- real durable-medium delivery provider for consumer-law acknowledgements;
- reviewed retention durations plus source authority and review reference for each mandatory class;
- before compliance launch: approved French consumer-law classification/copy and consumer mediator details.

## Release status

**NO DEPLOY / NO MERGE.** Phase 4C5A is repository-complete and verified at `b9a8ca938f7923106b0df489f231276a30cc6f5a`. The provider-write driver remains inert by default and was not executed. PR #16 stays intentionally draft and unmerged until preview/provider/legal gates are explicitly approved and verified.
