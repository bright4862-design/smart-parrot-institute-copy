# Lesson Booking Build Progress

Last updated: 2026-09-21

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute` without explicit instruction).
- Working branch: `agent/lesson-booking-blueprint`.
- Draft PR: #16.
- Default branch refreshed this run: `main` at `7f764e5c2b691874b6049e706f1c09026c1eafaf`.
- Phase 4C5N verified engineering checkpoint: **`45aceb35333b344af0c1e943ea8825bf1905a163`**.
- GitHub comparison at the verified engineering checkpoint: **diverged, 144 commits ahead / 15 behind `main`**, merge base `210345bbe09bc46c468fb6a7e0eee0596e8d902b`.
- `main` remains untouched. Nothing has been merged, rebased, published to Base44, or deployed to production.
- Approved Supabase PREVIEW/TEST project only: `mrzzbhqzxshtbqvxkcjn`, region `eu-west-1`, URL `https://mrzzbhqzxshtbqvxkcjn.supabase.co`.
- Applied preview migrations now include **`20260921042322 / lesson_booking_phase4c5n_cleanup_plan_lifecycle_manifest`**.
- All 12 previously deployed booking Edge Functions remain unchanged in Phases 4C5L–4C5N.
- Stripe remains TEST/SANDBOX only. Live Stripe keys/objects remain inadmissible. Stripe Connect remains deferred.

## Architecture lock

- Base44/React remains the frontend shell; app id `69c16c52c86d161e74940243`.
- Supabase Postgres/Auth/RLS/Edge Functions/Cron remains authoritative for identity, booking, policy, evidence, time, payment state, attendance, cancellation, settlement, compliance, provider readiness, preview continuation, terminal rehearsal evidence, reconciliation, retention review, cleanup-review planning, and cleanup-plan lifecycle.
- No browser-authoritative money, provider-state, attendance, identity, cleanup, retention, reconciliation, or time transition is allowed.
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
- **4C5J:** failure-safe terminal cleanup, deterministic transcript hashing, append-only terminal evidence correlation, replay/conflict protection.
- **4C5K:** read-only terminal reconciliation queue, missing-evidence detection, and server-time preview evidence retention review status.
- **4C5L:** service-only reconciliation-resolution evidence plus immutable admin retention-review audit decisions.
- **4C5M:** server-validated cleanup-review candidate queue and bounded, expiring, dry-run-only cleanup review plans.
- **4C5N (current):** append-only cleanup-plan expiry/renewal/revocation lifecycle plus immutable, minimized execution-manifest preview. Actual cleanup/deletion remains disabled.

## Phase 4C5N — cleanup-plan lifecycle + execution-manifest preview — complete

Verified engineering checkpoint: **`45aceb35333b344af0c1e943ea8825bf1905a163`**.

### Implemented

- Added `supabase/migrations/20260921043000_lesson_booking_phase4c5n_cleanup_plan_lifecycle_manifest.sql`.
- Added append-only, RLS-enabled `lesson_booking_full_preview_cleanup_plan_lifecycle`.
  - Records `expiry_observed`, `renewed`, and terminal `revoked` events.
  - Renewal/revocation is tied to the exact current plan generation; stale generations are rejected.
  - Revocation reasons are restricted to `preserve_override`, `review_changed`, and `manual_safety_hold`.
  - Direct `anon`, `authenticated`, and `service_role` table privileges are revoked.
  - UPDATE/DELETE are blocked by the existing append-only trigger boundary.
- Added append-only, RLS-enabled `lesson_booking_full_preview_cleanup_execution_manifest_previews`.
  - Stores only the exact immutable retention-review timestamp and effective plan generation window.
  - `manifest_state` is permanently `preview_only`.
  - No provider object IDs, fixture identity, webhook payloads, access tokens, payment data, or cleanup authority are stored.
- Added `admin_renew_booking_full_preview_cleanup_review_plan(...)`.
  - Uses the existing server-side admin check, `SECURITY DEFINER`, `set search_path=''`, schema-qualified relations, and PostgreSQL `statement_timestamp()`.
  - Locks/revalidates the base dry-run plan, immutable retention review, terminal evidence, reconciliation state, and 30-day review condition.
  - Only an expired current generation can be renewed.
  - Renewal creates an append-only expiry observation and a **new 24-hour dry-run review window**.
  - Identical retries replay idempotently; stale/conflicting generations fail closed.
  - A revocation is terminal and cannot be renewed away.
- Added `admin_revoke_booking_full_preview_cleanup_review_plan(...)`.
  - Requires the exact current generation and an allowed reason code.
  - Records terminal revocation append-only; identical replay is idempotent and conflicting replay is rejected.
  - If the generation is already expired, the server also records its expiry observation.
- Added `admin_prepare_booking_full_preview_cleanup_execution_manifest_preview(...)`.
  - Revalidates retention/reconciliation/current plan state and server-time freshness before writing anything.
  - Refuses stale, expired, revoked, preserved, or unresolved-reconciliation state.
  - Produces an immutable minimized **preview-only** execution manifest; it is not executable.
  - Exact replay is idempotent.
- Every Phase 4C5N RPC always returns `destructive_cleanup_authorized=false`, `cleanup_execution_enabled=false`, and `server_time_authoritative=true`.
- Added `scripts/lesson-booking-full-preview-cleanup-lifecycle.mjs` and updated the approved preview transport with the three guarded admin RPCs.
  - Normalizers return fixed minimized shapes and strip unknown/sensitive provider, identity, hash, token, and payment fields.
  - No browser-supplied `now`/clock input is accepted.
- Added `scripts/check-lesson-booking-full-preview-cleanup-lifecycle.mjs`.
  - Verifies minimization, authority-false invariants, invalid revocation reasons, no browser-clock fields, and absence of destructive/provider paths in the migration.
- Added `supabase/tests/lesson_booking_full_preview_cleanup_plan_lifecycle_manifest_scenarios.sql` and `.github/workflows/lesson-booking-phase4c5n.yml`.
  - Covers expired-plan renewal, append-only expiry/renewal events, idempotent duplicate renewal, stale-generation rejection, current-manifest replay, active-plan renewal denial, base-plan manifest creation, terminal revocation, manifest/renewal denial after revocation, stale review/generation rejection, direct-table denial, append-only mutation denial, and non-admin denial.

### Verification

- GitHub Actions **Lesson booking Phase 4C5N run `35560649796` passed** on exact engineering SHA `45aceb35333b344af0c1e943ea8825bf1905a163`.
- Full **Lesson booking foundation run `35560649769` passed** on the same engineering SHA.
- Dedicated CI passed the Phase 4C5N JavaScript regression, re-verified Phase 4C5M, applied all migrations into ephemeral PostgreSQL, executed M/N SQL scenarios, and completed the production Vite build.
- The full foundation workflow also passed Deno Edge Function typechecks, all prior booking/payment/security regressions, migrations/behavior scenarios, and the production Vite build.
- Preview migration application succeeded and Supabase recorded **`20260921042322 / lesson_booking_phase4c5n_cleanup_plan_lifecycle_manifest`**.
- Post-apply preview verification:
  - cleanup lifecycle rows: **0**;
  - execution-manifest preview rows: **0**;
  - RLS enabled on both new tables;
  - `authenticated` has **no direct SELECT** privilege on either table;
  - authenticated callers can reach the three intentionally guarded admin RPC entry points, whose server-side admin check remains authoritative.
- No synthetic user/session, Stripe object, Daily object, Edge Function deployment, Cron activation, Base44 publication, merge, deletion, or production mutation occurred.

## Research refreshed for Phase 4C5N on 2026-09-21

### Supabase

- Current Supabase function guidance continues to recommend pinning `search_path` for `SECURITY DEFINER` functions and explicitly restricting/granting function execution.
- Service/secret credentials remain server-only; Phase 4C5N uses authenticated admin RPC entry points only where the existing server-side admin check is intentional.
- References:
  - https://supabase.com/docs/guides/database/functions
  - https://supabase.com/docs/guides/database/postgres/row-level-security

### Stripe

- Stripe currently recommends idempotency keys for POST mutations so retries do not duplicate state changes; reused keys with the same parameters replay the saved outcome, while changed parameters are rejected. Stripe also says not to put personal data in idempotency keys.
- Stripe webhook verification still requires the raw request body, `Stripe-Signature`, and the endpoint-specific signing secret, with prompt 2xx acknowledgement.
- Phase 4C5N performs no Stripe request; these rules remain locked for any future provider-writing executor.
- References:
  - https://docs.stripe.com/api/idempotent_requests
  - https://docs.stripe.com/webhooks

### Daily

- Daily webhooks remain signed, retryable provider evidence and can be delivered more than once; future destructive/provider workflows must therefore remain idempotent and server-evidence driven.
- Phase 4C5N stores no Daily room/token/provider identifier and performs no Daily mutation.
- Reference: https://docs.daily.co/reference/rest-api/webhooks

### Base44

- Base44 backend guidance continues to place secret-bearing external integrations and privileged business logic on trusted backend surfaces, not the React/browser bundle.
- Smart Parrot therefore keeps cleanup lifecycle and manifest logic in Supabase and exposes only minimized results to the Base44/React shell.
- References:
  - https://base44.com/developers
  - https://doc-sdk.base44.app/FunctionsDocs

### France / EU privacy/testing

- CNIL guidance continues to require retention to be purpose-based and documented, and recommends fictitious/anonymized data for testing rather than production personal data.
- CNIL minimization guidance supports limiting technical logs/evidence and making retention/review behavior explicit and auditable.
- The Phase 4C5N **24-hour plan window is an internal technical safety window, not a claimed French/EU legal retention period**. It authorizes review only and never deletion.
- References:
  - https://cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees
  - https://www.cnil.fr/fr/tester-vos-applications
  - https://www.cnil.fr/fr/minimiser-les-donnees-collectees

## Supabase preview/advisor status after Phase 4C5N

- Project `mrzzbhqzxshtbqvxkcjn` remains the only approved Smart Parrot preview project.
- Security advisor reports **24** RLS-enabled/no-policy tables. The two new Phase N audit tables account for the increase and are intentional server-only/audit tables with direct table access revoked.
  - Remediation reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Security advisor reports **35** authenticated-callable `SECURITY DEFINER` functions. The three Phase N admin RPCs account for the increase; each pins `search_path=''` and applies the existing server-side admin check before returning minimized data.
  - Remediation/reference: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- The prior mutable `public.forbid_change()` search-path finding remains absent.
- `btree_gist` remains in `public` as a documented existing warning and was not moved blindly during this bounded slice.
  - Remediation/reference: https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public
- Performance advisor remains at **30** unindexed-FK suggestions. Phase N's new foreign-key columns are covered by their primary keys or dedicated indexes, so it introduced no new unindexed-FK warning.
- Performance advisor reports **19** currently-unused indexes, including newly created preview indexes that have no rows/workload yet; no index was removed merely to silence the advisor.
- The existing multiple-permissive-policy warning on `profiles` remains unchanged.
  - FK remediation/reference: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

## External configuration still required for first provider-writing rehearsal

Repository and preview-database hardening can continue without these, but actual provider writes remain fail-closed until the approved preview environment has:

- runtime-only preview `sb_secret_...` credential for synthetic fixture/session administration;
- Stripe **TEST** secret key, exact expected test account id, Checkout webhook signing secret, and separate dispute-webhook signing secret installed for the Supabase Edge Functions;
- one correctly signed TEST delivery accepted by each Stripe webhook endpoint;
- Daily preview API key, webhook/domain identity, room prefix, base64 HMAC, and an `ACTIVE` webhook after signed endpoint verification;
- explicit provider-E2E/write gates opened only for the bounded rehearsal window.

Connecting Stripe inside Base44 still does **not** transfer Stripe secret/webhook credentials to Supabase.

## Next coherent slice

**Phase 4C5O — service-only cleanup execution attestation + impact inventory (still non-destructive):**

1. add a service-only, append-only attestation anchored to the exact current `preview_only` manifest generation and immutable retention/reconciliation state;
2. produce a minimized **impact inventory** of preview-only artifacts that could be considered by a future cleanup executor, using counts/classes rather than provider IDs or personal data;
3. keep actual execution disabled: authenticated/admin clients must not be able to mint execution authority, and no DELETE/TRUNCATE/provider mutation/Cron purge is introduced;
4. add regressions for stale/expired/revoked manifest generations, duplicate service attestation, unauthorized authenticated callers, sensitive-field leakage, and any payload claiming `cleanup_execution_enabled=true`;
5. continue to keep Stripe/Daily provider writes and Base44 publication disabled until the missing TEST credentials are explicitly installed and bounded gates are opened.

## Release status

**NO MERGE / NO BASE44 OR PRODUCTION PUBLISH.** Phase 4C5N is repository-complete and CI-verified at `45aceb35333b344af0c1e943ea8825bf1905a163`. Phases 4C5L–4C5N are applied only to the approved Supabase preview project. PR #16 remains draft. No provider-writing rehearsal, destructive cleanup, or production operation occurred.