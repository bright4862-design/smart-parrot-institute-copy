# Lesson Booking Build Progress

Last updated: 2026-09-21

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute` without explicit instruction).
- Working branch: `agent/lesson-booking-blueprint`.
- Draft PR: #16.
- Default branch refreshed this run: `main` at `7f764e5c2b691874b6049e706f1c09026c1eafaf`.
- Phase 4C5I engineering checkpoint: **`b61dd9cff967696a8da6c23b7439b7f5955beb01`**.
- GitHub comparison after the engineering checkpoint: **diverged, 115 commits ahead / 15 behind `main`**, merge base `210345bbe09bc46c468fb6a7e0eee0596e8d902b`.
- Separate read-only divergence evidence: `docs/lesson-booking-main-divergence-2026-09-21.md`.
- `main` remains untouched. Nothing has been merged, rebased, published to Base44, or deployed to production.
- Approved Supabase PREVIEW/TEST project only: `mrzzbhqzxshtbqvxkcjn`, `eu-west-1`, `https://mrzzbhqzxshtbqvxkcjn.supabase.co`.
- Preview health refreshed this run: `ACTIVE_HEALTHY`, Postgres `17.6.1.166`.
- Applied migrations remain through `20260920222136 / lesson_booking_phase4c5g_operator_bootstrap`; Phase 4C5I requires no schema migration.
- All 12 booking Edge Functions remain `ACTIVE`; `daily-webhook` remains version 2 and the others version 1. Phase 4C5I deploys no Edge Function.
- Stripe remains TEST/SANDBOX only. Live Stripe keys/objects remain inadmissible. Stripe Connect remains deferred.

## Architecture lock

- Base44/React is the frontend shell; app id `69c16c52c86d161e74940243`.
- Supabase Postgres/Auth/RLS/Edge Functions/Cron remains authoritative for identity, booking, policy, evidence, time, payment state, attendance, cancellation, settlement, compliance, provider readiness, and preview-run continuation.
- No browser-authoritative money, provider-state, attendance, identity, or time transition is allowed.
- Stripe remains hold-before/capture-after: setup mode for bookings 48h+ ahead, manual capture for near-term bookings, server-side idempotency/evidence, capture/release only from trusted worker boundaries.
- Daily remains server-evidence only with booking-scoped private rooms/tokens and signed webhook evidence.
- Preview tooling may coordinate existing server boundaries but may not call Stripe/Daily directly or recreate settlement/attendance/time logic in the browser.

## Completed phases

- **0A–0C:** schema/RLS/evidence foundation, bounded availability, browser-safe Supabase client, isolated booking preview.
- **1A–1C:** atomic reservation/consent, Stripe Checkout/manual authorization, deferred holds, failed-hold recovery.
- **2A–2B:** signed Daily attendance evidence and deterministic settlement/capture/release.
- **3A–3B:** cancellation/withdrawal, compliance delivery, My Lessons, immutable policy evidence.
- **4A–4C4:** admin queue/evidence/disputes, launch health/readiness, retention/legal hold, provider staging.
- **4C5A–4C5G:** provider rehearsal evidence/readiness, full-preview contracts, durable run registry, resumable executor, exact preview transport, read-only operator bootstrap, signed webhook proof, Daily HMAC correction.
- **4C5H:** deterministic synthetic preview fixture principals, evidence-aware cleanup, bounded signed-provider preparation.
- **4C5I (current):** ephemeral fixture sessions, fixture lifecycle gating, redacted rehearsal transcript, branch-divergence evidence.

## Phase 4C5I — ephemeral fixture sessions + bounded rehearsal handoff — complete

Verified engineering checkpoint: **`b61dd9cff967696a8da6c23b7439b7f5955beb01`**.

### Implemented

- Added `scripts/lesson-booking-full-preview-ephemeral-sessions.mjs`.
  - Runtime credential rotation is allowed only for the exact approved preview fixture plan, requires the existing preview fixture write gate plus an `sb_secret_...` backend credential, verifies the deterministic synthetic user before every password rotation, and emits no password/email/user-id material.
  - Student/admin sessions are created only through the Supabase publishable/Auth boundary with `persistSession=false`, `autoRefreshToken=false`, and no browser URL session detection.
  - Access tokens remain inside an in-memory closure. The public/JSON representation contains only role names, run id, effective expiry, and redacted booleans; refresh tokens are never retained or returned.
  - Session identity must match the deterministic fixture subject/email/metadata/role. Subject mismatch, fixture-role mismatch, stale sessions, wrong key class, and expired fixture lease all fail closed.
  - A still-usable in-memory bundle is reused on duplicate calls, preventing duplicate sign-in churn during the same bounded rehearsal handoff.
  - Closing the bundle uses Supabase local-scope sign-out and clears all token/client maps. The summary explicitly records that already-issued access JWTs expire naturally rather than pretending local sign-out revokes them instantly.
- Added fixture lifecycle readiness binding.
  - Rehearsal cannot continue when the fixture lease has less than five minutes remaining, sessions are stale/missing, principals are not ready, or cleanup has already started/has an ambiguous reconciliation state.
  - `runFixtureBoundPreviewOperatorHandoff()` stops before the existing operator bootstrap when lifecycle is blocked; the operator remains read-only and its provider-write gate remains closed.
- Added a redacted provider-test transcript contract.
  - Records only run id, an idempotency namespace derived from the synthetic run UUID, fixture/operator readiness, signed Stripe webhook proof status, Daily signed endpoint status, and provider-rehearsal status.
  - Does not contain access/refresh tokens, fixture passwords, user emails/IDs, booking/customer IDs, provider object IDs, provider secrets, or live-key material.
  - `provider_writes_enabled` is always `false` in the transcript.
- Added trusted runner `scripts/lesson-booking-preview-ephemeral-session-handoff.mjs`.
  - Gate-closed by default and in CI.
  - Provisions/reuses the Phase 4C5H synthetic principals, rotates their runtime-only passwords, signs them in through preview Auth, immediately clears the password map, passes only the in-memory access tokens into the existing approved-preview operator transport, emits redacted output, and locally signs out in `finally`.
  - Contains no direct Stripe or Daily API calls.
- Added `scripts/check-lesson-booking-full-preview-ephemeral-sessions.mjs` regressions for credential redaction, fresh session issuance, stale-session rejection, wrong fixture role, subject mismatch, duplicate in-memory reuse, lease expiry, cleanup ambiguity, pre-operator blocking, transcript redaction/idempotency namespace, and local-scope sign-out.
- Added `.github/workflows/lesson-booking-phase4c5i.yml`, which reruns Phase 4C5I plus Phase 4C5H and Phase 4C5G boundaries, proves the new handoff gate is closed in CI, and builds the application.
- Added `docs/lesson-booking-main-divergence-2026-09-21.md` rather than merging/rebasing the 15 `main` commits. The current overlap surface is the package files, `src/App.jsx`, and the existing booking frontend/lib/page files; Phase 4C5I itself stays isolated to preview tooling/CI/docs.

### Verification

- Local Node 22 syntax/regression verification passed before push for the new Phase 4C5I module and test harness.
- GitHub Actions **`Lesson booking Phase 4C5I` run #1** passed on exact engineering SHA `b61dd9cff967696a8da6c23b7439b7f5955beb01` (run id `35547315722`).
  - Phase 4C5I ephemeral fixture-session/rehearsal handoff regression: passed.
  - Phase 4C5H fixture lifecycle regression: passed.
  - Phase 4C5G operator bootstrap regression: passed.
  - New session-handoff write gate closed in CI: passed.
  - Production Vite build: passed.
- No real synthetic users or sessions were created because the runtime-only preview `sb_secret_...` credential was not supplied to this automation. This is the intended fail-closed state.
- No Supabase migration/function deployment, Stripe/Daily provider write, Base44 publication, cron activation, merge, or production mutation occurred.

## Research refreshed for Phase 4C5I on 2026-09-21

### Stripe

- Stripe continues to support idempotency keys on POST requests and recommends unique random/UUID-derived keys for safe retry; the first result is replayed and parameters are checked on reuse. The Phase 4C5I transcript therefore stores only a run-UUID-derived idempotency namespace, never PII or payment secrets.
- Stripe webhook verification still requires the raw request body, `Stripe-Signature`, and the signing secret for that exact endpoint, with fast 2xx acknowledgement.
- References: https://docs.stripe.com/api/idempotent_requests and https://docs.stripe.com/webhooks

### Supabase

- Supabase access tokens are intentionally short lived (commonly up to about one hour), while refresh tokens represent the longer-lived session. Local sign-out revokes the session/refresh path but an already-issued access JWT can remain valid until its encoded expiry.
- Phase 4C5I therefore requires at least five minutes of remaining token/fixture life, disables persistence and auto-refresh for the trusted rehearsal clients, never retains refresh tokens, and drops access tokens from memory on close.
- References: https://supabase.com/docs/guides/auth/sessions and https://supabase.com/docs/reference/javascript/auth-signout

### Daily

- Daily webhook delivery remains at-least-once and may retry, so signed evidence remains deduplicated server-side rather than treated as a browser event. Its endpoint-verification request remains signed and time-bounded.
- Reference: https://docs.daily.co/reference/rest-api/webhooks

### Base44

- Base44's privileged/service-role operations belong in trusted backend functions, while frontend clients operate with user-level permissions. The new Supabase secret/password/session-bootstrap path therefore stays out of the Base44/React browser bundle.
- Reference: https://docs.base44.com/sdk-getting-started/client

### France / EU privacy/testing

- CNIL guidance continues to recommend separating development/test from production and using fictitious or anonymized data. It also requires purpose-based data minimization/retention rather than indefinite logging.
- Phase 4C5I keeps `.invalid` synthetic identities in the dedicated preview project and outputs minimized rehearsal state rather than customer/provider payloads.
- References: https://www.cnil.fr/fr/tester-vos-applications , https://www.cnil.fr/fr/securite-encadrer-les-developpements-informatiques , https://www.cnil.fr/fr/limiter-la-conservation-des-donnees

## Supabase preview/advisor status

- Project `mrzzbhqzxshtbqvxkcjn` remains `ACTIVE_HEALTHY`.
- Migrations and Edge Function versions are unchanged from Phase 4C5H.
- Security advisor still reports the intentional server-only RLS/no-policy tables, `btree_gist` in `public`, and authenticated-callable SECURITY DEFINER RPC review items. The prior `public.forbid_change()` mutable-search-path warning remains resolved.
- Performance advisor still reports 29 unindexed foreign-key suggestions, 14 currently-unused indexes, and the existing multiple-permissive-policy warning on `profiles`. No speculative index/policy rewrite was applied without query evidence.

## External configuration still required for first provider-writing rehearsal

Repository work can continue without these, but actual provider writes remain fail-closed until the approved preview environment has:

- runtime-only preview `sb_secret_...` credential for synthetic fixture/session administration;
- Stripe **TEST** secret key, exact expected test account id, Checkout webhook signing secret, and separate dispute-webhook signing secret installed for the Supabase Edge Functions;
- one correctly signed TEST delivery accepted by each Stripe webhook endpoint;
- Daily preview API key, webhook/domain identity, room prefix, base64 HMAC, and an `ACTIVE` webhook after signed endpoint verification;
- explicit provider-E2E/write gates opened only for the bounded rehearsal window.

Connecting Stripe inside Base44 still does **not** transfer Stripe secret/webhook credentials to Supabase.

## Next coherent slice

**Phase 4C5J — bounded rehearsal cleanup + evidence correlation:**

1. add a failure-safe handoff wrapper that always closes ephemeral sessions and then runs evidence-aware fixture cleanup only after the rehearsal/run is terminal;
2. preserve any synthetic principal linked to booking/payment/consent/audit evidence and surface reconciliation-required cleanup rather than deleting it;
3. bind the redacted transcript to a deterministic hash/correlation record suitable for the existing append-only rehearsal evidence RPC without storing provider payloads or credentials;
4. add regressions for provider-readiness failure, operator exception, session-close ambiguity, cleanup preservation, duplicate terminal replay, and transcript hash stability;
5. keep all provider writes and Base44 publication disabled unless the missing TEST credentials are explicitly installed and the bounded gates are opened.

## Release status

**NO MERGE / NO BASE44 OR PRODUCTION PUBLISH.** Phase 4C5I is repository-complete and CI-verified at `b61dd9cff967696a8da6c23b7439b7f5955beb01`. PR #16 remains draft. The approved Supabase preview project was inspected only; no provider-writing rehearsal or production operation occurred.