# Lesson Booking Build Progress

Last updated: 2026-09-21

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute` without explicit instruction).
- Working branch: `agent/lesson-booking-blueprint`.
- Draft PR: #16.
- Default branch refreshed this run: `main` at `7f764e5c2b691874b6049e706f1c09026c1eafaf` (`base44-builder[bot]`, `Update base44 packages`).
- Booking branch was deliberately continued without rebasing: it is currently diverged from `main` (109 commits ahead / 15 behind at the Phase 4C5G engineering checkpoint; merge base `210345bbe09bc46c468fb6a7e0eee0596e8d902b`). No default-branch merge/rebase was attempted.
- Verified Phase 4C5G engineering checkpoint: `944f65572db9679c1e59538007903238306da85b`.
- Previous verified Phase 4C5F checkpoint: `3e6d25c10a506c5c464d5d47f1f7672cabfed856`.
- `main` remains untouched. Nothing has been merged or published to Base44/production.
- Approved Supabase PREVIEW/TEST project: `mrzzbhqzxshtbqvxkcjn`, `eu-west-1`, `https://mrzzbhqzxshtbqvxkcjn.supabase.co`. It is not production.
- Preview project health was refreshed this run and is `ACTIVE_HEALTHY`.
- Stripe execution remains test/sandbox-only. Live Stripe keys and live objects are inadmissible.
- Marketplace / Stripe Connect remains deferred until the single-school path is stable.

## Architecture lock

- Base44/React is the application shell.
- Supabase Postgres/Auth/RLS/Edge Functions/Cron is authoritative for booking, identity, policy, evidence, time, payment state, cancellation, settlement, compliance, retention governance, provider-rehearsal readiness, and preview-run continuation.
- Browser time, browser identity assertions, attendance time, price/policy inputs, money transitions, provider state, and preview continuation are never authoritative.
- Stripe uses hold-before/capture-after. Near-term lessons authorize using manual capture; later lessons save a payment method and the secret-authenticated worker authorizes when due.
- Daily supplies online attendance evidence. Private booking-scoped rooms/tokens and signed provider/server evidence remain separate from browser state.
- Preview orchestration may coordinate existing authoritative endpoints but may not recreate Stripe, Daily, settlement, attendance, or server-time logic client-side.

## Completed phases

- **Phase 0A–0C:** authoritative schema/RLS/evidence foundation, bounded availability, browser-safe Supabase client, isolated booking preview.
- **Phase 1A–1C:** atomic booking/consent, Stripe test-only Checkout + manual authorization, deferred off-session holds, failed-hold evidence and customer-present recovery.
- **Phase 2A–2B:** signed/replay-safe Daily/server attendance evidence and deterministic test-only settlement/capture/release.
- **Phase 3A–3B:** server-authoritative cancellation/withdrawal foundation, compliance acknowledgement outbox, My Lessons UX, immutable policy view, retry/dead-letter handling.
- **Phase 4A–4C4:** admin review/evidence operations, test-only dispute intake, launch health/readiness, retention/legal-hold controls, preview identity protection, provider staging, and reviewed retention approval hooks.
- **Phase 4C5A–4C5D:** append-only provider-rehearsal evidence, readiness/history, operator preflight, full-preview contract, disabled execution shell, disposable fixture namespace, and minimized authoritative booking observer.
- **Phase 4C5E:** exact-preview Supabase transport plus durable server-authoritative full-preview run/checkpoint registry; search-path hardening for `public.forbid_change()`.
- **Phase 4C5F:** resumable preview executor plus fail-closed redacted credential/readiness handoff.
- **Phase 4C5G (current):** read-only operator bootstrap, authoritative preview-role validation, recent signed-Stripe-webhook readiness proof, and corrected Daily HMAC/test-webhook verification.

## Phase 4C5F — resumable executor + credential/readiness handoff — complete

Verified engineering checkpoint: `3e6d25c10a506c5c464d5d47f1f7672cabfed856`.

### Implemented

- Added `scripts/lesson-booking-full-preview-readiness-manifest.mjs`.
  - Hard-locks readiness to the approved Smart Parrot preview project identity.
  - Classifies the Supabase browser key as `sb_publishable_...` and the backend worker key as `sb_secret_...`; key-class confusion fails closed.
  - Validates short-lived student/admin session shape, expiry, subject presence, and separation without returning token values. JWT signature/role verification deliberately remains the authoritative endpoint's responsibility.
  - Refuses any `sk_live_...` Stripe key immediately and accepts only the test-key class for provider-write readiness.
  - Requires explicit Stripe test account identity plus separate Checkout and dispute webhook-secret presence.
  - Requires Daily preview API/webhook/domain identity inputs, safe non-production domain/room naming, and webhook HMAC presence.
  - Requires `https://asmartparrot.com`, an HTTPS terms URL, provider-E2E enablement, server-derived rehearsal readiness, and a clear provider-cleanup state.
  - Returns only boolean/status checks and blocker names; raw credentials, tokens, provider IDs, webhook secrets, and HMAC values are never emitted.
- Added `scripts/lesson-booking-full-preview-resumable-executor.mjs`.
  - Every resume begins with `refreshRun()` and therefore re-reads the durable server-authoritative preview registry before making any decision.
  - Optional expected revision implements optimistic continuation: stale callers stop before a write and must refresh/reconfirm.
  - Checkout completion, SCA/customer authentication, and failed-hold `fix-payment` recovery are explicit customer-present pause envelopes with `automation_may_execute=false`.
  - Attendance and pre-end-time states pause without inventing attendance or advancing server time.
  - Deferred-hold and settlement worker states produce a dry-run intent unless both the redacted provider-readiness manifest is fully ready and `SMART_PARROT_FULL_PREVIEW_WORKER_WRITES_ENABLED=1` is explicitly open.
  - Approved worker execution still calls only the existing Supabase Edge Function boundary (`place-holds` or `settle-lessons`), then refreshes authoritative state again. There is no direct Stripe or Daily API primitive in the executor.
  - Terminal runs replay without writes. Duplicate retries carrying an older revision stop as stale before a second worker write.
- Added `scripts/check-lesson-booking-full-preview-resumable-executor.mjs` with regressions for redaction, live-key refusal, key-class confusion, expired/missing sessions, same-principal misuse, cleanup ambiguity, customer pauses, stale revisions, terminal replay, provider/write gates, one-write-then-refresh behavior, duplicate retry safety, and absence of direct provider/browser-authoritative time logic.
- Updated `.github/workflows/lesson-booking-foundation.yml` so the Phase 4C5F contract is part of the full booking gate.

### Verification

- GitHub Actions `Lesson booking foundation` run **#161** passed on exact engineering SHA `3e6d25c10a506c5c464d5d47f1f7672cabfed856`.
- No database migration or Edge Function deployment was required for Phase 4C5F.

## Phase 4C5G — preview operator bootstrap + webhook/readiness proof — complete

Verified engineering checkpoint: `944f65572db9679c1e59538007903238306da85b`.

### Implemented

- Extended `scripts/lesson-booking-full-preview-supabase-transport.mjs` with fail-closed operation/auth-class mappings for the base preview readiness function, provider readiness function, rehearsal readiness RPC, new webhook-proof RPC, and new read-only durable-run RPC.
- Added authoritative session probing to the approved preview transport:
  - validates the supplied student/admin access token against the exact preview Auth service (`/auth/v1/user`) instead of trusting decoded browser claims;
  - reads only the caller's own `profiles(id, role)` row through existing RLS and returns a minimized internal `{subject, role}` result;
  - the operator requires a real server-side `student` role, a real server-side `admin` role, and distinct principals before privileged readiness reads.
- Added `scripts/lesson-booking-full-preview-operator-bootstrap.mjs`.
  - Combines the redacted local credential-shape preflight with authoritative server role checks, base preview readiness, provider identity readiness, provider-rehearsal readiness, recent signed-Stripe-webhook proof, and optional durable run lookup.
  - Rejects stale server readiness snapshots and exact-project mismatch.
  - Drops booking/customer linkage from operator output and never emits access tokens, provider secrets, user IDs, provider object IDs, or webhook secrets.
  - Even when every readiness proof is green, it hardcodes the resumable worker intent to `workerWriteGate: '0'`; Phase 4C5G therefore cannot move money or mutate Stripe/Daily.
- Added migration `supabase/migrations/20260920223000_lesson_booking_phase4c5g_operator_bootstrap.sql`.
  - `admin_get_booking_full_preview_run(uuid)` is an admin-guarded, `STABLE`, read-only lookup that uses the existing minimized run payload and does **not** refresh time/state or create a checkpoint.
  - `admin_booking_webhook_readiness_proof(timestamptz)` is an admin-guarded, `STABLE`, read-only proof that both independent Stripe webhook boundaries have successfully stored a TEST-mode signed delivery within seven days. It returns only status/booleans/timestamps, never provider IDs, event payloads, customer data, or secrets.
- Added `supabase/tests/lesson_booking_full_preview_operator_scenarios.sql`.
  - proves the run lookup does not mutate `updated_at` or checkpoint count;
  - proves missing, recent, and stale Stripe signature evidence transitions correctly;
  - proves a non-admin cannot call either new RPC.
- Corrected the Daily webhook signature implementation in `supabase/functions/daily-webhook/index.ts` after refreshing Daily's official webhook specification:
  - `DAILY_WEBHOOK_SECRET` is a base64-encoded HMAC-SHA256 secret, so the function now base64-decodes it before importing the cryptographic key instead of HMACing with the UTF-8 bytes of the base64 text;
  - the signed Daily endpoint-verification body `{"test":"test"}` now returns HTTP 200 immediately **after** signature verification and **before** any database/provider round trip, satisfying Daily's endpoint-verification behavior and eight-second response requirement;
  - attendance events retain the same timestamp tolerance, signature boundary, replay/error behavior, and server-side evidence path.
- Added `scripts/check-lesson-booking-full-preview-operator-bootstrap.mjs` with regressions for:
  - ready/minimized read-only operator output;
  - no tokens, subjects, booking IDs, or credentials in output;
  - deterministic repeated bootstrap with no secret-worker invocation;
  - wrong authoritative admin role stopping before privileged reads;
  - wrong publishable-key class stopping before all I/O;
  - stale readiness, wrong preview project, wrong Stripe account/Daily domain, and missing signed webhook proof;
  - hard-closed worker intent even when provider readiness is otherwise green;
  - the corrected Daily base64 HMAC behavior and signed test-event fast path.
- Updated `.github/workflows/lesson-booking-foundation.yml` to run the new JS regression, the new SQL scenario, and a closed operator-bootstrap gate on every relevant booking change.

### Verification

- GitHub Actions `Lesson booking foundation` run **#162** passed on exact engineering SHA `944f65572db9679c1e59538007903238306da85b`.
  - New Phase 4C5G operator bootstrap/webhook proof regression passed.
  - Modified Daily webhook passed Deno typecheck.
  - Every earlier booking/payment/security regression through Phase 4C5F passed.
  - Preview/provider/full-path/operator write gates remained closed in CI.
  - All repository migrations and PostgreSQL behavior scenarios, including the new operator scenario, passed.
  - Production Vite build passed.
- Applied only the bounded read-only Phase 4C5G migration to approved preview project `mrzzbhqzxshtbqvxkcjn`; Supabase recorded migration version **`20260920222136`** with name `lesson_booking_phase4c5g_operator_bootstrap`.
- Deployed only the corrected `daily-webhook` to the approved preview project. It is **version 2**, `ACTIVE`, and remains `verify_jwt=false` because the endpoint authenticates Daily with its signed HMAC webhook boundary.
- No Stripe Edge Function, worker, cron, Base44 site, default branch, or production environment was changed.

## Research refreshed for Phase 4C5G on 2026-09-20/21

### Stripe

- Stripe's official webhook guidance still requires verification against the exact raw request body plus the `Stripe-Signature` header and the endpoint-specific `whsec_...` signing secret.
- Stripe explicitly distinguishes Dashboard endpoint secrets from Stripe CLI listener secrets even though both begin `whsec_`; they cannot be interchanged. Phase 4C5G therefore proves each deployed endpoint through events accepted by its own existing signature boundary rather than treating webhook-secret presence as proof.
- Reference: https://docs.stripe.com/webhooks/signature

### Supabase

- Current Supabase Auth guidance requires server-side verification for authorization-sensitive identity checks. The Phase 4C5G operator now validates supplied user sessions against Auth and then obtains the role from the RLS-protected `profiles` row instead of trusting a decoded JWT role claim.
- Publishable keys remain browser/public credentials; `sb_secret_...` remains backend-only and is still excluded from the operator bootstrap.
- References: https://supabase.com/docs/guides/auth and https://supabase.com/docs/guides/api/api-keys

### Daily

- Daily signs webhook deliveries with an HMAC-SHA256 secret that its documentation represents as base64 and demonstrates decoding before HMAC verification.
- On webhook creation/update/reactivation, Daily sends a signed `{"test":"test"}` request and expects HTTP 200 within eight seconds; the endpoint should not perform slow database/network work before that response.
- Daily webhook deliveries can be duplicated, so existing append-only/replay-safe evidence handling remains required.
- Reference: https://docs.daily.co/reference/rest-api/webhooks

### Base44

- The Base44 CLI for app `69c16c52c86d161e74940243` exposes its own project secret store (`base44 secrets list/set/delete`) separately from site deployment. This reinforces the existing boundary: connecting/configuring a provider in Base44 does not populate the approved Supabase project's Edge Function secrets.
- No Base44 publish/deploy command was run.

### France / EU consumer requirements

- France's current official consumer guidance continues to state that distance service contracts generally carry a 14-day withdrawal period from contract conclusion, subject to statutory exceptions and disclosure requirements.
- Official guidance also requires an express consumer request when a paid service is to begin during the withdrawal period, with the relevant acknowledgement when full performance can extinguish that right. Existing immutable policy/consent/evidence design remains appropriate; final product-specific legal wording remains a launch-review item.
- Reference: https://www.economie.gouv.fr/particuliers/mes-droits-conso/bien-consommer/vente-distance-tout-savoir-sur-votre-droit-de-retractation

## Supabase advisor review after Phase 4C5G

- Security advisor was rerun after the preview migration.
- No mutable-search-path warning reappeared; the prior `public.forbid_change()` hardening remains effective.
- The existing RLS-enabled/no-policy notices remain intentional for server-only tables; no policies were added just to silence the linter.
- `btree_gist` remains installed in `public`; moving an installed extension was not bundled into this provider-readiness slice.
- The authenticated-callable `SECURITY DEFINER` warning now includes the two new admin RPCs. This is intentional: both pin `search_path=''`, immediately call `private.smart_parrot_require_admin(auth.uid())`, expose minimized data only, and the SQL regression proves a non-admin is rejected. They are not being silently reclassified as safe merely because the advisor warns.
- Security remediation references: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy , https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public , https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- Performance advisor remains advisory, not a launch blocker in an empty preview dataset: 29 unindexed-FK notices, 14 currently-unused-index notices, and one multiple-permissive-policy notice on `profiles` SELECT. No speculative index/policy churn was introduced without query evidence.

## External configuration still needed before real provider rehearsal/E2E

The repository and Supabase preview foundation can continue without these, but real provider-writing rehearsal remains fail-closed until all required preview inputs are installed and verified:

- safe short-lived Supabase preview **student** and **admin** sessions whose authoritative `profiles.role` values are `student` and `admin` respectively;
- backend `sb_secret_...` context only for the approved secret-worker path;
- Stripe **test-mode** `STRIPE_SECRET_KEY`, exact expected Stripe test account ID, Checkout webhook signing secret, and a separate dispute-webhook signing secret in Supabase preview Edge Function secrets;
- after those Stripe webhook secrets are installed, at least one correctly signed TEST-mode delivery must be accepted by **each** independent Stripe endpoint (Checkout and dispute) so the new recent-signature proof becomes ready;
- Daily preview API key, webhook ID/domain identity, safe preview domain/room prefix, base64 HMAC secret, and an `ACTIVE` webhook after Daily's signed endpoint-verification request succeeds;
- provider E2E gate deliberately enabled only for the controlled rehearsal;
- `APP_URL=https://asmartparrot.com` and a public HTTPS terms URL in provider configuration;
- durable-medium delivery provider for required consumer acknowledgements;
- reviewed retention durations/source authority and final French consumer-law wording/mediator details before compliance launch.

Connecting Stripe inside Base44 alone does **not** provide Stripe server/webhook secrets to Supabase Edge Functions.

## Next coherent slice

**Phase 4C5H — preview fixture principals + bounded signed-provider rehearsal preparation:**

1. add a fail-closed preview-fixture principal contract for disposable student/tutor/admin identities, including exact allowed roles, naming/PII minimization, TTL/cleanup evidence, and no production-user reuse;
2. add an operator-safe readiness command that reports exactly which provider/session prerequisites remain without printing credentials or enabling worker writes;
3. add deterministic webhook-test/rehearsal instructions and machine-readable expected evidence for both Stripe endpoints and Daily's signed test handshake, while keeping all direct provider writes behind the existing explicit gates;
4. add regressions for accidental production principal reuse, stale/incorrect roles, incomplete fixture cleanup, and webhook endpoint/secret cross-wiring;
5. inspect the growing `main` divergence separately and prepare a conflict/rebase evidence report, but do not merge/rebase the booking branch without explicit release approval;
6. once the user supplies the missing TEST provider configuration, use the Phase 4C5G/H gates for the first bounded provider rehearsal — never with live Stripe credentials.

## Release status

**NO MERGE / NO BASE44 OR PRODUCTION PUBLISH.** Phase 4C5G is repository-complete and CI-verified at `944f65572db9679c1e59538007903238306da85b`. The approved preview project received only the bounded Phase 4C5G read-only migration and Daily webhook signature fix described above. PR #16 remains intentionally draft. No provider-writing rehearsal, live Stripe operation, cron activation, production email, production migration, Base44 publication, or Stripe Connect work occurred in this slice.
