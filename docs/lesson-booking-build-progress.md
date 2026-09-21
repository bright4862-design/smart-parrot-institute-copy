# Lesson Booking Build Progress

Last updated: 2026-09-21

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute` without explicit instruction).
- Working branch: `agent/lesson-booking-blueprint`.
- Draft PR: #16.
- Default branch refreshed this run: `main` at `7f764e5c2b691874b6049e706f1c09026c1eafaf`.
- Phase 4C5O verified engineering checkpoint: **`33740c64081e2ebb70538cc1883f02193ada4555`**.
- GitHub comparison at the verified engineering checkpoint: **diverged, 149 commits ahead / 15 behind `main`**, merge base `210345bbe09bc46c468fb6a7e0eee0596e8d902b`.
- `main` remains untouched. Nothing has been merged, rebased, published to Base44, or deployed to production.
- Approved Supabase PREVIEW/TEST project only: `mrzzbhqzxshtbqvxkcjn`, region `eu-west-1`, URL `https://mrzzbhqzxshtbqvxkcjn.supabase.co`.
- Supabase confirmed the project **ACTIVE_HEALTHY** before the Phase 4C5O preview migration was applied.
- Applied preview migrations now include **`20260921051909 / lesson_booking_phase4c5o_cleanup_execution_attestation_inventory`**.
- All 12 previously deployed booking Edge Functions remain unchanged in Phases 4C5L–4C5O.
- Stripe remains TEST/SANDBOX only. Live Stripe keys/objects remain inadmissible. Stripe Connect remains deferred.

## Architecture lock

- Base44/React remains the frontend shell; app id `69c16c52c86d161e74940243`.
- Supabase Postgres/Auth/RLS/Edge Functions/Cron remains authoritative for identity, booking, policy, evidence, time, payment state, attendance, cancellation, settlement, compliance, provider readiness, preview continuation, terminal rehearsal evidence, reconciliation, retention review, cleanup-review planning, cleanup-plan lifecycle, manifest preview, and service attestation.
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
- **4C5N:** append-only cleanup-plan expiry/renewal/revocation lifecycle plus immutable, minimized execution-manifest preview.
- **4C5O (current):** service-role-only, non-executable cleanup attestation bound to the exact current manifest plus a minimized seven-class impact inventory. No cleanup executor exists.

## Phase 4C5O — service-only cleanup attestation + minimized impact inventory — complete

Verified engineering checkpoint: **`33740c64081e2ebb70538cc1883f02193ada4555`**.

### Implemented

- Added `supabase/migrations/20260921054000_lesson_booking_phase4c5o_cleanup_execution_attestation_inventory.sql`.
- Added append-only, RLS-enabled `lesson_booking_full_preview_cleanup_execution_attestations`.
  - The row is keyed by `(run_id, manifest_prepared_at)` and therefore binds evidence to one exact immutable manifest generation.
  - It stores only timestamps/state and seven non-negative artifact counts; it stores no Stripe/Daily identifiers, fixture identity, webhook body, payment data, access token, or secret.
  - `attestation_state` is permanently constrained to `non_executable`.
  - Direct `anon`, `authenticated`, and `service_role` table privileges are revoked.
  - UPDATE/DELETE are blocked by the existing append-only `forbid_change()` trigger boundary.
- Added `service_attest_booking_full_preview_cleanup_execution_manifest(...)`.
  - `SECURITY DEFINER` with `set search_path=''` and schema-qualified relations.
  - Function execution is **revoked from `public`, `anon`, and `authenticated` and granted only to `service_role`**.
  - Revalidates the exact current `preview_only` manifest, terminal evidence, retention review, reconciliation state, plan generation/renewal, revocation state, server-time expiry, and 30-day internal review threshold before recording the attestation.
  - Uses PostgreSQL `statement_timestamp()`; no browser/user-supplied current time is accepted.
  - Exact replay is idempotent; stale, expired, revoked, preserved, unresolved-reconciliation, or conflicting inputs fail closed.
  - Output always contains `service_only=true`, `destructive_cleanup_authorized=false`, `cleanup_execution_enabled=false`, and `server_time_authoritative=true`.
- Added a minimized impact inventory with exactly these classes:
  - `full_preview_run`;
  - `terminal_evidence`;
  - `reconciliation_resolution`;
  - `retention_review`;
  - `cleanup_review_plan`;
  - `cleanup_plan_lifecycle`;
  - `cleanup_manifest_preview`.
  Only row counts are exposed; object identifiers and personal/provider data are excluded.
- Updated `scripts/lesson-booking-full-preview-supabase-transport.mjs` with a distinct `service_rpc` authorization class.
  - The approved preview identity remains pinned to `mrzzbhqzxshtbqvxkcjn`.
  - `service_rpc` requires a runtime `sb_secret_...` credential and is routed separately from student/admin JWT and worker paths.
  - Modern Supabase `sb_secret_...` keys are sent on the `apikey` header only for this direct Data API RPC path; they are **not** copied into `Authorization: Bearer` because current Supabase guidance states these keys are not JWTs.
  - No secret is placed in the React/browser code or persisted in repository output.
- Added `scripts/lesson-booking-full-preview-cleanup-attestation.mjs`.
  - Strictly normalizes the fixed non-executable response shape and strips unknown/sensitive fields.
  - Rejects any payload claiming destructive or executable cleanup authority.
- Added `scripts/check-lesson-booking-full-preview-cleanup-attestation.mjs`.
  - Injects intentionally sensitive fake provider/identity/token fields and verifies none survive normalization.
  - Verifies service-only routing, no browser-clock fields, fixed inventory shape, authority-false invariants, and absence of DELETE/TRUNCATE/provider-call patterns from the migration.
  - Includes a direct fake-fetch regression proving `sb_secret_...` is placed in `apikey` and never in an Authorization header.
- Added `supabase/tests/lesson_booking_full_preview_cleanup_execution_attestation_scenarios.sql` and `.github/workflows/lesson-booking-phase4c5o.yml`.
  - Covers first attestation, exact replay, minimized counts, stale manifest identity, terminal plan revocation, expired legacy manifest, function/table grants, and append-only mutation denial.

### Verification

- The first Phase 4C5O implementation passed its dedicated and full-foundation suites at `050a8ccbf5afc88abd9171ee93da23300dc80596`.
- Fresh Supabase documentation review then identified the modern secret-key transport requirement. A **test-first regression** was committed at `c84881f4e122a6cb698e808d63f6a4fc57988e3f`; dedicated run **`35564361991` failed exactly at the new secret-header assertion**, demonstrating the old transport incorrectly mirrored `sb_secret_...` into `Authorization: Bearer`.
- The implementation was corrected at **`33740c64081e2ebb70538cc1883f02193ada4555`** so direct service RPCs send the secret on `apikey` only.
- GitHub Actions **Lesson booking Phase 4C5O run `35564407791` passed** on exact final engineering SHA `33740c64081e2ebb70538cc1883f02193ada4555`.
- Full **Lesson booking foundation run `35564407772` passed** on the same exact final engineering SHA.
- The transport change also re-triggered relevant earlier lifecycle workflows; Phase 4C5M run `35564407807`, Phase 4C5N run `35564407786`, Phase 4C5L run `35564407773`, and Phase 4C5J run `35564407783` all passed on the same SHA.
- Dedicated CI passed the Phase 4C5O JavaScript regression, re-verified the Phase 4C5N lifecycle contract, applied every migration to ephemeral PostgreSQL, executed Phase N and O SQL scenarios, and completed the production Vite build.
- The full foundation workflow passed the broader booking/payment/security regression suite, migration execution, Edge Function/Deno checks, and application build.
- Preview migration application succeeded and Supabase recorded **`20260921051909 / lesson_booking_phase4c5o_cleanup_execution_attestation_inventory`**.
- Post-apply preview verification:
  - attestation rows: **0**;
  - RLS enabled: **true**;
  - `authenticated` direct table SELECT: **false**;
  - `service_role` direct table SELECT: **false**;
  - `authenticated` RPC EXECUTE: **false**;
  - `service_role` RPC EXECUTE: **true**;
  - function is `SECURITY DEFINER`: **true**;
  - function config includes empty `search_path`.
- No synthetic user/session, Stripe object, Daily object, Edge Function deployment, Cron activation, Base44 publication, merge, deletion, or production mutation occurred.

## Research refreshed for Phase 4C5O on 2026-09-21

### Supabase

- Current Supabase API-key guidance says `sb_secret_...` is for developer-controlled backend components only and maps to elevated `service_role` access that bypasses RLS. It must never reach the browser or source control.
- The same current guidance states modern publishable/secret keys are supplied through `apikey`; `sb_secret_...` is not a JWT and must not be used as an `Authorization: Bearer` token. Phase 4C5O now has a regression locking this boundary.
- Current Supabase function guidance says `SECURITY DEFINER` functions should pin `search_path` and should have execution explicitly revoked/granted when access must be restricted.
- Phase 4C5O therefore uses a separate server-only `service_rpc` route and Postgres EXECUTE grants rather than an authenticated admin JWT to mint the attestation.
- References:
  - https://supabase.com/docs/guides/getting-started/api-keys
  - https://supabase.com/docs/guides/database/functions
  - https://supabase.com/docs/guides/api/securing-your-api

### Stripe

- Stripe continues to recommend idempotency keys for all POST mutations so retries replay the first result rather than duplicate a mutation, and says not to place personal data in idempotency keys.
- Stripe webhook verification still requires the unmodified raw request body, `Stripe-Signature`, and the endpoint-specific `whsec_...` secret, with a prompt `2xx` response.
- Phase 4C5O makes no Stripe request; these invariants remain locked for the future provider rehearsal/executor paths.
- References:
  - https://docs.stripe.com/api/idempotent_requests
  - https://docs.stripe.com/webhooks

### Daily

- Daily continues to sign webhooks with a base64-encoded HMAC secret and `X-Webhook-Signature` / `X-Webhook-Timestamp`.
- Daily documents duplicate delivery possibilities and recommends idempotent duplicate handling. Its creation/reactivation verification request is signed and expects `200` within 8 seconds.
- Phase 4C5O performs no Daily request and stores no Daily identifier.
- Reference: https://docs.daily.co/reference/rest-api/webhooks

### Base44

- Base44 documentation keeps elevated service-role behavior restricted to Base44-hosted backend functions. Privileged operations should not be implemented in the React/browser client.
- Phase 4C5O therefore keeps the service attestation in Supabase/Postgres and exposes only a minimized normalized result to tooling.
- Reference: https://docs.base44.com/sdk-getting-started/client

### France / EU privacy/testing

- CNIL guidance continues to recommend separate test/development environments and fictitious or anonymized data instead of copying production personal data into tests.
- The Phase 4C5O impact inventory follows data minimization by exposing only artifact classes and counts; its 30-day threshold remains an internal preview troubleshooting/review choice, not a claimed statutory French/EU retention period.
- References:
  - https://www.cnil.fr/fr/tester-vos-applications
  - https://www.cnil.fr/sites/default/files/2024-03/cnil_guide_securite_personnelle_2024.pdf

## Supabase preview/advisor status after Phase 4C5O

- Project `mrzzbhqzxshtbqvxkcjn` remains the only approved Smart Parrot preview project and was `ACTIVE_HEALTHY` when checked this run.
- Security advisor reports **25** RLS-enabled/no-policy tables. The new Phase O attestation table accounts for the increase and is intentionally server-only with all direct API table privileges revoked.
  - Remediation reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Security advisor reports **35** authenticated-callable `SECURITY DEFINER` functions, **unchanged from Phase 4C5N**. The new Phase O function does not increase this warning because authenticated EXECUTE is explicitly revoked; only `service_role` has EXECUTE.
  - Remediation/reference: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- The prior mutable `public.forbid_change()` search-path finding remains absent.
- `btree_gist` remains in `public` as a documented existing warning and was not moved blindly during this bounded slice.
  - Remediation/reference: https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public
- Performance advisor remains at **30** unindexed-FK suggestions; Phase O adds no new unindexed-FK warning because `run_id` is the leading column of its primary key.
- Performance advisor remains at **19** currently-unused indexes; no index was removed merely to silence the advisor.
- The existing multiple-permissive-policy warning on `profiles` remains unchanged.
  - FK remediation/reference: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

## External configuration still required for first provider-writing rehearsal

Repository and preview-database hardening can continue without these, but actual provider writes remain fail-closed until the approved preview environment has:

- runtime-only preview `sb_secret_...` credential for synthetic fixture/session administration and service-only rehearsal tooling;
- Stripe **TEST** secret key, exact expected test account id, Checkout webhook signing secret, and separate dispute-webhook signing secret installed for the Supabase Edge Functions;
- one correctly signed TEST delivery accepted by each Stripe webhook endpoint;
- Daily preview API key, webhook/domain identity, room prefix, base64 HMAC, and an `ACTIVE` webhook after signed endpoint verification;
- explicit provider-E2E/write gates opened only for the bounded rehearsal window.

Connecting Stripe inside Base44 still does **not** transfer Stripe secret/webhook credentials to Supabase.

## Next coherent slice

**Phase 4C5P — immutable preview launch-blocker snapshot + operational alert evidence:**

1. build a server-authoritative, minimized launch-blocker snapshot combining schema/function readiness, signed Stripe/Daily readiness, fixture/session availability, unresolved rehearsal/reconciliation state, and current provider-write gates;
2. create append-only operational evidence for blocker-state changes without storing secrets, provider object identifiers, fixture identity, or payment data;
3. make repeated identical snapshots/alerts idempotent and use PostgreSQL server time for freshness/staleness decisions;
4. add regressions for stale provider proof, missing secret readiness, duplicate alert generation, redaction leakage, unauthorized callers, and attempts to treat advisory readiness as provider-write authority;
5. keep provider writes, destructive cleanup, Cron purge, Base44 publication, default-branch merge, and production changes disabled.

## Release status

**NO MERGE / NO BASE44 OR PRODUCTION PUBLISH.** Phase 4C5O is repository-complete and CI-verified at `33740c64081e2ebb70538cc1883f02193ada4555`. Phases 4C5L–4C5O are applied only to the approved Supabase preview project. PR #16 remains draft. No provider-writing rehearsal, destructive cleanup, or production operation occurred.