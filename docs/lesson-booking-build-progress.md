# Lesson Booking Build Progress

Last updated: 2026-09-21

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute` without explicit instruction).
- Working branch: `agent/lesson-booking-blueprint`.
- Draft PR: #16.
- Default branch refreshed this run: `main` at `7f764e5c2b691874b6049e706f1c09026c1eafaf`.
- Phase 4C5M verified engineering checkpoint: **`ab492bc1777f62b8587b7c722eb56f38285d1e71`**.
- GitHub comparison at the verified engineering checkpoint: **diverged, 142 commits ahead / 15 behind `main`**, merge base `210345bbe09bc46c468fb6a7e0eee0596e8d902b`.
- `main` remains untouched. Nothing has been merged, rebased, published to Base44, or deployed to production.
- Approved Supabase PREVIEW/TEST project only: `mrzzbhqzxshtbqvxkcjn`, region `eu-west-1`, URL `https://mrzzbhqzxshtbqvxkcjn.supabase.co`.
- Applied preview migrations now include **`20260921035310 / lesson_booking_phase4c5l_reconciliation_resolution_retention_audit`** and **`20260921035334 / lesson_booking_phase4c5m_cleanup_review_plan`**.
- All 12 previously deployed booking Edge Functions remain unchanged in Phases 4C5L/4C5M.
- Stripe remains TEST/SANDBOX only. Live Stripe keys/objects remain inadmissible. Stripe Connect remains deferred.

## Architecture lock

- Base44/React remains the frontend shell; app id `69c16c52c86d161e74940243`.
- Supabase Postgres/Auth/RLS/Edge Functions/Cron remains authoritative for identity, booking, policy, evidence, time, payment state, attendance, cancellation, settlement, compliance, provider readiness, preview continuation, terminal rehearsal evidence, reconciliation, retention review, and cleanup-review planning.
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
- **4C5M (current):** server-validated cleanup-review candidate queue and bounded, expiring, dry-run-only cleanup review plans. No deletion executor exists.

## Phase 4C5L — reconciliation resolution + retention-review audit — complete

- Added append-only `lesson_booking_full_preview_reconciliation_resolutions` and `lesson_booking_full_preview_retention_reviews` records.
- `service_record_booking_full_preview_reconciliation_resolution(...)` is service-role only, anchored to immutable terminal-evidence correlation SHA-256, replay-safe for identical evidence, and conflict-rejecting.
- Admin retention review can record `preserve` or `eligible_for_cleanup_review`, but the latter is accepted only when the server-derived retention window is due and no unresolved reconciliation hold remains.
- Reconciliation resolution restarts the 30-day preview troubleshooting review window from trusted server `resolved_at`; a newly resolved cleanup cannot become immediately cleanup-review eligible.
- `admin_booking_full_preview_terminal_retention_status(...)` uses PostgreSQL server time and always reports `destructive_cleanup_authorized=false` and `cleanup_execution_enabled=false`.
- Preview migration applied as **`20260921035310 / lesson_booking_phase4c5l_reconciliation_resolution_retention_audit`**.

## Phase 4C5M — cleanup-review queue + bounded dry-run plans — complete

Verified engineering checkpoint: **`ab492bc1777f62b8587b7c722eb56f38285d1e71`**.

### Implemented

- Added `supabase/migrations/20260921033000_lesson_booking_phase4c5m_cleanup_review_plan.sql`.
  - Adds append-only, RLS-enabled `lesson_booking_full_preview_cleanup_review_plans`.
  - Direct `anon`, `authenticated`, and `service_role` table privileges are revoked.
  - A plan is tied to an immutable `eligible_for_cleanup_review` retention review and is always `plan_state='dry_run_only'`.
  - Plans are generated from PostgreSQL `statement_timestamp()` and expire after 24 hours.
- Added `admin_booking_full_preview_cleanup_review_queue(p_limit)`.
  - Admin-only through the existing server-side admin check.
  - Includes only immutable retention reviews with decision `eligible_for_cleanup_review` and basis `retention_review_due`.
  - Reconciliation-required evidence is included only after trusted `cleanup_verified`; `preserve` is excluded.
  - Returns a minimized operational shape and always returns `destructive_cleanup_authorized=false` and `cleanup_execution_enabled=false`.
- Added `admin_prepare_booking_full_preview_cleanup_review_plan(p_run_id,p_expected_reviewed_at)`.
  - Revalidates retention eligibility server-side instead of trusting a prior browser observation.
  - Rejects a stale immutable retention-review timestamp.
  - Rejects unresolved reconciliation and preserved evidence.
  - Recomputes the post-evidence/post-resolution 30-day review window with server time.
  - Replays an identical plan idempotently; conflicting state is rejected.
  - Produces only a 24-hour dry-run review artifact. It does not delete evidence/fixtures, mutate Stripe/Daily, or move booking/payment state.
- Both new `SECURITY DEFINER` RPCs use `set search_path=''`, schema-qualified relations, and the existing admin guard.
- Added `scripts/lesson-booking-full-preview-cleanup-review.mjs` and transport mappings.
  - Strict normalization strips unknown provider/identity/hash/token fields.
  - Any payload claiming destructive or execution authority is rejected.
  - No browser-supplied clock is accepted.
- Added `scripts/check-lesson-booking-full-preview-cleanup-review.mjs`.
  - Verifies minimization, false authority flags, no `p_now/current_time`, and statically rejects destructive SQL/provider call paths in the migration.
- Added `supabase/tests/lesson_booking_full_preview_cleanup_review_plan_scenarios.sql` and `.github/workflows/lesson-booking-phase4c5m.yml`.
  - Scenarios cover active/unprepared/expired plans, idempotent replay, stale review rejection, preserved reconciliation exclusion, direct-table denial, and non-admin denial.
  - The first CI attempt exposed a test-modeling error: the scenario recorded a new `cleanup_verified` resolution and immediately expected retention to be due. Phase 4C5L correctly restarts the 30-day review window from `resolved_at`. The regression was corrected to model a genuinely aged trusted resolution rather than weakening production logic.

### Verification

- GitHub Actions **Lesson booking Phase 4C5M run `35558855727` passed** on exact engineering SHA `ab492bc1777f62b8587b7c722eb56f38285d1e71`.
- Full **Lesson booking foundation run `35558855729` passed** on the same engineering SHA.
- The dedicated workflow re-ran the Phase 4C5L boundary, applied all booking migrations into ephemeral PostgreSQL, executed both L/M SQL scenarios, and completed the production Vite build.
- Preview migration application:
  - **`20260921035310 / lesson_booking_phase4c5l_reconciliation_resolution_retention_audit`**
  - **`20260921035334 / lesson_booking_phase4c5m_cleanup_review_plan`**
- Post-apply preview verification:
  - reconciliation resolution rows: **0**;
  - retention review rows: **0**;
  - cleanup review plan rows: **0**;
  - RLS enabled on all three tables;
  - `authenticated` has **no direct SELECT** privilege on any of them;
  - authenticated users cannot execute the service-only reconciliation-resolution RPC;
  - `service_role` can execute that service RPC;
  - authenticated callers can reach the intentionally guarded admin retention/cleanup-review RPCs, whose server-side admin check remains authoritative.
- No synthetic user/session, Stripe object, Daily object, Edge Function deployment, Cron activation, Base44 publication, merge, deletion, or production mutation occurred.

## Research refreshed for Phase 4C5M on 2026-09-21

### Supabase

- Current Supabase guidance says `SECURITY DEFINER` functions must pin `search_path`; with `search_path=''`, referenced relations must be schema-qualified. It also recommends explicit function privilege revocation/grants rather than relying on defaults.
- Phase 4C5M uses that pattern and retains the internal admin-role check for intentionally authenticated admin RPCs.
- References:
  - https://supabase.com/docs/guides/database/functions
  - https://supabase.com/docs/guides/database/postgres/row-level-security

### Stripe

- Stripe currently recommends idempotency keys for create/update POST requests so network retries do not duplicate mutations; reused keys return the saved outcome, and the same key with changed parameters is rejected. Stripe also says not to put personal data in idempotency keys.
- Stripe webhook verification still requires the raw body, the `Stripe-Signature` header, and the endpoint-specific `whsec_...` secret, with a quick 2xx response before complex work.
- Phase 4C5M performs no Stripe request; these constraints remain locked for the future provider executor.
- References:
  - https://docs.stripe.com/api/idempotent_requests
  - https://docs.stripe.com/webhooks

### Daily

- Daily's current webhook interface remains a signed/retryable provider-evidence boundary. A cleanup/reconciliation artifact therefore cannot treat a single browser observation as authoritative provider state.
- Phase 4C5M stores no Daily room/token/provider identifier and performs no Daily mutation.
- Reference: https://docs.daily.co/reference/rest-api/webhooks

### Base44

- Base44's current backend guidance places secret-bearing external API operations in server-side backend functions; secrets are not appropriate in the browser bundle or source control.
- Smart Parrot therefore keeps this privileged cleanup/reconciliation logic in Supabase and exposes only minimized admin results to the Base44/React shell.
- References:
  - https://base44.com/developers
  - https://doc-sdk.base44.app/FunctionsDocs

### France / EU privacy/testing

- CNIL guidance dated **2 April 2026** reiterates that personal data cannot be retained indefinitely; retention must be tied to the processing purpose and documented.
- CNIL testing guidance says production personal data should not normally be reused for development/test and recommends fictitious test datasets.
- CNIL minimization guidance recommends defining retention for logs and implementing deletion/review mechanisms, while keeping purge actions auditable.
- Phase 4C5M therefore creates a review artifact only. It does not infer that a technical 30-day review window is itself a legal retention rule and does not activate deletion automatically.
- References:
  - https://cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees
  - https://www.cnil.fr/fr/tester-vos-applications
  - https://www.cnil.fr/fr/minimiser-les-donnees-collectees

## Supabase preview/advisor status after Phase 4C5M

- Project `mrzzbhqzxshtbqvxkcjn` remains the only approved Smart Parrot preview project.
- Security advisor reports **22** RLS-enabled/no-policy tables. The three L/M tables account for the increase and are intentional server-only/audit tables with direct table access revoked.
  - Remediation reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Security advisor reports **32** authenticated-callable `SECURITY DEFINER` functions. The L/M admin RPC additions are intentional exposed admin entry points; each pins `search_path=''` and applies the existing role check before returning minimized data. The L service reconciliation RPC is not authenticated-callable.
  - Remediation/reference: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- The previous mutable `public.forbid_change()` search-path finding remains absent.
- `btree_gist` remains in `public` as a documented existing warning and was not moved blindly during this bounded slice.
  - Remediation/reference: https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public
- Performance advisor reports **30** unindexed-FK suggestions, **16** currently-unused indexes, and the existing multiple-permissive-policy warning on `profiles`. L/M added covering indexes for their admin-user foreign keys, so no additional FK warning was introduced there. No speculative index removal or RLS rewrite was applied without workload evidence.
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

**Phase 4C5N — cleanup-plan renewal/revocation + execution-manifest boundary:**

1. add an append-only server audit for cleanup-plan expiry/renewal/revocation so a stale plan cannot silently regain authority;
2. produce a minimized immutable **execution-manifest preview** that references only trusted retention/reconciliation/plan artifacts and still reports `cleanup_execution_enabled=false`;
3. keep actual deletion disabled: no DELETE/TRUNCATE/provider-mutation RPC and no Cron purge executor in this phase;
4. add regressions for expired plans, review changes, preserve overrides, duplicate renewal, stale manifest replay, browser-clock injection, non-admin access, and sensitive-field leakage;
5. continue to keep Stripe/Daily provider writes and Base44 publication disabled until the missing TEST credentials are explicitly installed and bounded gates are opened.

## Release status

**NO MERGE / NO BASE44 OR PRODUCTION PUBLISH.** Phase 4C5M is repository-complete and CI-verified at `ab492bc1777f62b8587b7c722eb56f38285d1e71`. Phases 4C5L/4C5M are applied only to the approved Supabase preview project. PR #16 remains draft. No provider-writing rehearsal, destructive cleanup, or production operation occurred.