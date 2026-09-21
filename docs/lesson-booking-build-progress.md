# Lesson Booking Build Progress

Last updated: 2026-09-21

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute` without explicit instruction).
- Working branch: `agent/lesson-booking-blueprint`.
- Draft PR: #16.
- Default branch refreshed this run: `main` at `7f764e5c2b691874b6049e706f1c09026c1eafaf`.
- Phase 4C5J verified engineering checkpoint: **`efafa4444867c0c896bde5b7d76066a126570a8c`**.
- GitHub comparison at the engineering checkpoint: **diverged, 123 commits ahead / 15 behind `main`**, merge base `210345bbe09bc46c468fb6a7e0eee0596e8d902b`.
- `main` remains untouched. Nothing has been merged, rebased, published to Base44, or deployed to production.
- Approved Supabase PREVIEW/TEST project only: `mrzzbhqzxshtbqvxkcjn`, `eu-west-1`, `https://mrzzbhqzxshtbqvxkcjn.supabase.co`.
- Applied migrations now run through **`20260921011949 / lesson_booking_phase4c5j_terminal_evidence`**.
- All 12 previously deployed booking Edge Functions remain unchanged this slice; Phase 4C5J deploys no Edge Function.
- Stripe remains TEST/SANDBOX only. Live Stripe keys/objects remain inadmissible. Stripe Connect remains deferred.

## Architecture lock

- Base44/React remains the frontend shell; app id `69c16c52c86d161e74940243`.
- Supabase Postgres/Auth/RLS/Edge Functions/Cron remains authoritative for identity, booking, policy, evidence, time, payment state, attendance, cancellation, settlement, compliance, provider readiness, preview continuation, and terminal rehearsal evidence.
- No browser-authoritative money, provider-state, attendance, identity, cleanup, or time transition is allowed.
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
- **4C5I:** ephemeral fixture sessions, fixture lifecycle gating, redacted provider-test transcript, branch-divergence evidence.
- **4C5J (current):** failure-safe terminal cleanup, deterministic redacted transcript hashing, append-only terminal evidence correlation, replay/conflict protection.

## Phase 4C5J — bounded rehearsal cleanup + evidence correlation — complete

Verified engineering checkpoint: **`efafa4444867c0c896bde5b7d76066a126570a8c`**.

### Implemented

- Added `scripts/lesson-booking-full-preview-terminal-evidence.mjs`.
  - Canonicalizes and SHA-256 hashes the already-redacted provider-test transcript while deliberately excluding wall-clock-only fields such as `generated_at`, so semantically identical retries produce the same digest.
  - Refuses transcripts that expose secrets or claim provider writes are enabled; accepts only minimized readiness/status evidence and the deterministic `smart-parrot-preview:<run_id>` namespace.
  - Binds the transcript digest to the server-authoritative terminal run state plus session-close and fixture-cleanup outcomes in a second deterministic `correlation_sha256`.
  - Requires the durable Supabase run to be terminal (`complete` or `cancelled`) before terminal evidence can be constructed.
  - Always attempts ephemeral-session closure first. Ambiguous close defers synthetic-principal deletion rather than guessing that credentials are gone.
  - Fixture cleanup runs only behind the existing explicit preview write gate and runtime `sb_secret_...` credential. Missing transcript, closed gate, or ambiguous close records a reconciliation-required state instead of destructive cleanup.
  - Operator/provider exceptions are converted to the generic `preview_terminal_operation_failed` boundary while the finalizer still closes sessions and preserves minimized terminal evidence; raw provider exception text is not surfaced.
- Added `supabase/migrations/20260921011500_lesson_booking_phase4c5j_terminal_evidence.sql`.
  - Adds server-only, RLS-enabled `lesson_booking_full_preview_terminal_evidence` with one append-only row per preview run.
  - Stores only terminal state, transcript/correlation SHA-256 values, cleanup/session status, reconciliation flag, admin recorder, and timestamp—no provider IDs, webhook bodies, tokens, fixture identities, payment instruments, room names, or provider secrets.
  - Adds `admin_record_booking_full_preview_terminal_evidence(...)`, pinned to `search_path=''`, with the existing server-side admin-role guard.
  - Identical terminal replay is idempotent and returns `replay=true`; a conflicting replay is rejected rather than overwriting evidence.
  - UPDATE/DELETE is blocked by the existing immutable-change trigger.
- Updated `scripts/lesson-booking-full-preview-supabase-transport.mjs` so only the `admin_rpc` authorization class can call the new terminal-evidence RPC.
- Added SQL scenario coverage in `supabase/tests/lesson_booking_full_preview_terminal_evidence_scenarios.sql` for first insert, identical replay, conflicting replay, non-terminal rejection, append-only update rejection, and non-admin rejection.
- Added `scripts/check-lesson-booking-full-preview-terminal-evidence.mjs` for deterministic transcript hashing, cleanup/session failure paths, write-gate closure, generic operator failure, transport minimization, dirty-transcript rejection, and static secret/provider-surface checks.
- Added `.github/workflows/lesson-booking-phase4c5j.yml`; it runs 4C5J plus 4C5I/4C5H regressions, executes every migration and the new SQL scenarios in ephemeral PostgreSQL, and builds the production Vite bundle.

### Verification

- GitHub Actions **Lesson booking Phase 4C5J run `35550429231` passed** on exact engineering SHA `efafa4444867c0c896bde5b7d76066a126570a8c`.
  - Phase 4C5J JS cleanup/evidence regression: passed.
  - Phase 4C5I ephemeral-session regression: passed.
  - Phase 4C5H fixture lifecycle regression: passed.
  - Ephemeral PostgreSQL migration application: passed.
  - Phase 4C5J append-only terminal-evidence SQL scenarios: passed.
  - Production Vite build: passed.
- Full **Lesson booking foundation run `35550409010` passed** at checkpoint `76fa2b1b9ad0958bdb75c16bea69daa1ea6a3967`, including Edge Function typechecks, all existing booking/payment/security boundaries, all migrations/scenarios, closed preview execution gates, and the production build.
- The bounded Phase 4C5J migration was applied only to approved preview project `mrzzbhqzxshtbqvxkcjn`; Supabase recorded it as **`20260921011949 / lesson_booking_phase4c5j_terminal_evidence`**.
- Preview verification after apply: RLS is enabled on the new table, it contains **0 rows**, `authenticated` has **no direct SELECT** privilege, and the authenticated RPC surface is available only through the function's internal admin-role check.
- No synthetic user/session, Stripe object, Daily object, Base44 publication, cron activation, merge, or production mutation occurred.

## Research refreshed for Phase 4C5J on 2026-09-21

### Stripe

- Stripe requires webhook signature verification against the raw request body, `Stripe-Signature`, and the signing secret for the exact endpoint, and recommends returning a fast 2xx before slow downstream work.
- Stripe's POST idempotency contract supports safe retries with a stable idempotency key. Phase 4C5J mirrors that property for terminal evidence: an identical terminal replay is accepted as replay, while a conflicting replay is rejected.
- References: https://docs.stripe.com/webhooks and https://docs.stripe.com/api/idempotent_requests

### Supabase

- Auth admin methods require a secret key and belong on a trusted server; secret credentials must never be exposed to the browser.
- Local sign-out revokes the current refresh/session path, but an issued access JWT remains valid until expiry. Phase 4C5J therefore treats session closure as an explicit evidence state and defers destructive fixture cleanup when close is ambiguous.
- References: https://supabase.com/docs/reference/javascript/auth-signout , https://supabase.com/docs/guides/auth/sessions , https://supabase.com/docs/reference/python/admin-api

### Daily

- Daily documents that webhook deliveries can be duplicated and recommends idempotent duplicate handling; its default retry behavior attempts deliveries at least once. Phase 4C5J therefore uses deterministic semantic hashes/correlation instead of treating a terminal callback as unique by arrival.
- Daily's webhook verification continues to use the signed timestamp/payload with a base64-encoded HMAC secret; no Daily secret or payload is stored in the new terminal evidence table.
- Reference: https://docs.daily.co/reference/rest-api/webhooks

### Base44

- Base44's service-role permissions are available only inside Base44-hosted backend functions; normal frontend SDK usage is user-scoped. Phase 4C5J adds no privileged logic or Supabase secret to the Base44/React bundle.
- Reference: https://docs.base44.com/sdk-getting-started/client

### France / EU privacy/testing

- CNIL guidance recommends using fictitious/anonymized data in development/test, minimizing collected data, defining retention periods, and deleting/anonymizing data once no longer necessary.
- Phase 4C5J therefore keeps synthetic identities cleanup-aware while retaining only deterministic hashes and minimized lifecycle evidence when accountability/reconciliation requires evidence preservation.
- References: https://www.cnil.fr/fr/tester-vos-applications , https://www.cnil.fr/fr/minimiser-les-donnees-collectees , https://www.cnil.fr/fr/cnil-direct/question/dois-je-fixer-une-duree-de-conservation-des-donnees-dans-mon-fichier

## Supabase preview/advisor status after Phase 4C5J

- Project `mrzzbhqzxshtbqvxkcjn` remains the only approved Smart Parrot preview project.
- Security advisor now reports **19** RLS-enabled/no-policy tables; the new terminal-evidence table is intentionally included because it is server-only and direct authenticated table access is revoked.
- Security advisor reports **27** authenticated-callable SECURITY DEFINER functions; the new terminal-evidence RPC is intentionally included, pins `search_path=''`, and immediately performs the existing server-side admin-role check. The old mutable `public.forbid_change()` search-path finding remains absent.
- `btree_gist` remains in `public` as an existing review item; it was not moved blindly during this bounded slice.
- Performance advisor reports **30** unindexed-FK suggestions after adding `recorded_by`, plus 14 currently-unused indexes and the existing multiple-permissive-policy warning on `profiles`. No speculative index/policy rewrite was applied without query/workload evidence.

## External configuration still required for first provider-writing rehearsal

Repository work can continue without these, but actual provider writes remain fail-closed until the approved preview environment has:

- runtime-only preview `sb_secret_...` credential for synthetic fixture/session administration;
- Stripe **TEST** secret key, exact expected test account id, Checkout webhook signing secret, and separate dispute-webhook signing secret installed for the Supabase Edge Functions;
- one correctly signed TEST delivery accepted by each Stripe webhook endpoint;
- Daily preview API key, webhook/domain identity, room prefix, base64 HMAC, and an `ACTIVE` webhook after signed endpoint verification;
- explicit provider-E2E/write gates opened only for the bounded rehearsal window.

Connecting Stripe inside Base44 still does **not** transfer Stripe secret/webhook credentials to Supabase.

## Next coherent slice

**Phase 4C5K — terminal reconciliation queue + expiry/retention hardening:**

1. surface `reconciliation_required=true` terminal preview evidence through the existing admin review/operations boundary without giving the browser mutation authority;
2. add a server-computed observer/readiness view that distinguishes ambiguous session closure, cleanup preservation, cleanup-write-gate closure, and conflicting/absent terminal evidence;
3. add bounded expiry/retention semantics for synthetic preview artifacts and evidence, preserving records under explicit legal/evidence hold rather than deleting blindly;
4. add regressions proving non-admin rejection, duplicate queue suppression, no provider secrets/IDs in admin responses, and no cleanup/time transition from browser inputs;
5. keep all provider writes and Base44 publication disabled unless the missing TEST credentials are explicitly installed and the bounded gates are opened.

## Release status

**NO MERGE / NO BASE44 OR PRODUCTION PUBLISH.** Phase 4C5J is repository-complete and CI-verified at `efafa4444867c0c896bde5b7d76066a126570a8c`. The bounded migration is present only in the approved Supabase preview project. PR #16 remains draft. No provider-writing rehearsal or production operation occurred.