# Lesson Booking Build Progress

Last updated: 2026-09-21

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute` without explicit instruction).
- Working branch: `agent/lesson-booking-blueprint`.
- Draft PR: #16.
- Default branch refreshed this run: `main` at `7f764e5c2b691874b6049e706f1c09026c1eafaf`.
- Phase 4C5K verified engineering checkpoint: **`dbebbb86790e6e53a0e4ab668a0e85c10b44b6e1`**.
- GitHub comparison at the engineering checkpoint: **diverged, 131 commits ahead / 15 behind `main`**, merge base `210345bbe09bc46c468fb6a7e0eee0596e8d902b`.
- `main` remains untouched. Nothing has been merged, rebased, published to Base44, or deployed to production.
- Approved Supabase PREVIEW/TEST project only: `mrzzbhqzxshtbqvxkcjn`, `eu-west-1`, `https://mrzzbhqzxshtbqvxkcjn.supabase.co`.
- Applied migrations now run through **`20260921021637 / lesson_booking_phase4c5k_terminal_reconciliation_retention`**.
- All 12 previously deployed booking Edge Functions remain unchanged this slice; Phase 4C5K deploys no Edge Function.
- Stripe remains TEST/SANDBOX only. Live Stripe keys/objects remain inadmissible. Stripe Connect remains deferred.

## Architecture lock

- Base44/React remains the frontend shell; app id `69c16c52c86d161e74940243`.
- Supabase Postgres/Auth/RLS/Edge Functions/Cron remains authoritative for identity, booking, policy, evidence, time, payment state, attendance, cancellation, settlement, compliance, provider readiness, preview continuation, terminal rehearsal evidence, and reconciliation/retention status.
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
- **4C5K (current):** read-only terminal reconciliation queue, missing-evidence detection, and server-time preview evidence retention review status.

## Phase 4C5K — terminal reconciliation queue + expiry/retention hardening — complete

Verified engineering checkpoint: **`dbebbb86790e6e53a0e4ab668a0e85c10b44b6e1`**.

### Implemented

- Added `supabase/migrations/20260921030000_lesson_booking_phase4c5k_terminal_reconciliation_retention.sql`.
  - Adds a partial index for `reconciliation_required=true` terminal evidence.
  - Adds `admin_booking_full_preview_reconciliation_queue(p_limit)` as an admin-only, minimized, read-only RPC.
  - The queue surfaces both explicit reconciliation-required terminal evidence and terminal preview runs whose evidence is still absent after a **server-computed 15-minute grace window**.
  - Severity is server-computed from `statement_timestamp()`; no browser-supplied clock or `p_now` parameter exists.
  - Queue rows contain only run id, terminal state, generic reason/severity, occurrence time, and retention-hold status. They do not expose provider IDs, fixture identities, webhook bodies, transcript/correlation hashes, tokens, secrets, or payment data.
  - Adds `admin_booking_full_preview_terminal_retention_status(p_run_id)` as an admin-only, server-time observer.
  - Reconciliation-required evidence stays on `reconciliation_hold` with no cleanup deadline.
  - Non-reconciliation evidence uses a **30-day technical preview troubleshooting review window** and becomes `retention_review_due` after that window. This is an operational preview choice, **not a legal retention period**.
  - The RPC always returns `destructive_cleanup_authorized=false`; it does not delete anything or authorize a purge.
  - Both RPCs pin `search_path=''`, immediately perform the existing server-side admin-role check, revoke `public`/`anon`, and expose only the intentionally authenticated admin RPC surface.
- Added `scripts/lesson-booking-full-preview-reconciliation.mjs`.
  - Provides a narrow `admin_rpc` reader for the reconciliation queue and retention status.
  - Strips unknown/sensitive fields from server responses and rejects any payload that claims deletion authority or a non-server-authoritative clock.
  - Never sends time inputs and contains no provider-write or destructive-cleanup path.
- Added `scripts/check-lesson-booking-full-preview-reconciliation.mjs`.
  - Verifies sensitive-looking injected fields do not survive normalization.
  - Verifies only `p_limit` and `p_run_id` cross the transport boundary, never `p_now`.
  - Statically rejects terminal-evidence deletion, provider-write identifiers, or Daily room/token handling from this slice.
- Added `supabase/tests/lesson_booking_full_preview_reconciliation_retention_scenarios.sql`.
  - Covers ambiguous session/fixture cleanup evidence, missing terminal evidence after the grace window, fresh retained evidence, review-due evidence, direct-table privilege denial, and non-admin RPC denial.
  - Proves missing terminal evidence is surfaced to reconciliation but cannot be given a fabricated retention status.
- Added `.github/workflows/lesson-booking-phase4c5k.yml`.
  - Runs the Phase 4C5K JS boundary regression and re-verifies Phase 4C5J.
  - Applies every booking migration into ephemeral PostgreSQL, runs the new SQL scenarios, and builds the production Vite bundle.

### Verification

- GitHub Actions **Lesson booking Phase 4C5K run `35553579037` passed** on exact engineering SHA `dbebbb86790e6e53a0e4ab668a0e85c10b44b6e1`.
  - Phase 4C5K reconciliation/retention JS regression: passed.
  - Phase 4C5J terminal-evidence regression: passed.
  - Ephemeral PostgreSQL startup and complete migration application: passed.
  - Phase 4C5J + Phase 4C5K SQL scenarios: passed.
  - Production Vite build: passed.
- Full **Lesson booking foundation run `35553579079` passed** on the same exact engineering SHA `dbebbb86790e6e53a0e4ab668a0e85c10b44b6e1`.
- The bounded Phase 4C5K migration was applied only to approved preview project `mrzzbhqzxshtbqvxkcjn`; Supabase recorded it as **`20260921021637 / lesson_booking_phase4c5k_terminal_reconciliation_retention`**.
- Post-apply preview verification:
  - `lesson_booking_full_preview_runs`: **0 rows**.
  - `lesson_booking_full_preview_terminal_evidence`: **0 rows**.
  - reconciliation-required terminal evidence: **0 rows**.
  - `authenticated` still has **no direct SELECT** privilege on terminal evidence.
  - reconciliation partial index is present.
  - both new admin RPCs are present.
- No synthetic user/session, Stripe object, Daily object, Edge Function deployment, Base44 publication, cron activation, merge, or production mutation occurred.

## Research refreshed for Phase 4C5K on 2026-09-21

### Supabase

- Current Supabase Database Functions guidance recommends pinning `search_path` on `SECURITY DEFINER` functions and restricting `EXECUTE` to intended roles. Phase 4C5K follows that pattern and keeps the internal admin-role guard as the actual authorization check.
- Supabase Cron uses `pg_cron` and records job runs, but no cron or automatic deletion job was introduced here because the retention policy is still an observer/review boundary rather than purge authority.
- References:
  - https://supabase.com/docs/guides/database/functions
  - https://supabase.com/docs/guides/cron
  - https://supabase.com/docs/guides/database/secure-data

### Stripe

- Stripe test Events can be listed for up to 30 days. Phase 4C5K uses a matching 30-day **technical preview troubleshooting review window** for minimized rehearsal evidence to keep evidence correlation practical; this is not treated as a statutory retention period.
- Stripe POST idempotency remains the model for retry-safe provider mutations, but Phase 4C5K performs no Stripe mutation.
- References:
  - https://docs.stripe.com/api/events/list
  - https://docs.stripe.com/api/idempotent_requests

### Daily

- Daily webhook delivery remains at-least-once/retry-oriented, so duplicate or incomplete provider evidence must continue to converge through deterministic server-side reconciliation rather than browser assertions.
- Phase 4C5K performs no Daily mutation and stores no Daily identifiers or webhook bodies.
- Reference: https://docs.daily.co/reference/rest-api/webhooks

### Base44

- Elevated backend/service credentials remain inappropriate for the React browser bundle. Phase 4C5K therefore adds only server-side Supabase RPCs plus a minimized reader contract; no privileged cleanup or retention decision is moved into Base44 frontend code.
- Reference: https://docs.base44.com/sdk-getting-started/client

### France / EU privacy/testing

- CNIL guidance requires retention periods to be purpose-based and non-excessive; personal data should not be retained indefinitely and should be deleted or anonymized once no longer necessary.
- The 30-day Phase 4C5K preview window is therefore documented as a bounded operational troubleshooting interval, not a legal conclusion. Reconciliation-required evidence is held until a later explicit server-verified reconciliation decision rather than being deleted blindly.
- References:
  - https://www.cnil.fr/fr/cnil-direct/question/dois-je-fixer-une-duree-de-conservation-des-donnees-dans-mon-fichier
  - https://www.cnil.fr/fr/tester-vos-applications

## Supabase preview/advisor status after Phase 4C5K

- Project `mrzzbhqzxshtbqvxkcjn` remains the only approved Smart Parrot preview project.
- Security advisor still reports **19** RLS-enabled/no-policy tables. These include intentional server-only evidence/operations tables with direct authenticated table access revoked.
- Security advisor now reports **29** authenticated-callable `SECURITY DEFINER` functions; the two Phase 4C5K observer RPCs account for the increase from 27. Both pin `search_path=''`, immediately enforce `private.smart_parrot_require_admin(auth.uid())`, and return minimized read-only data.
- The previous mutable `public.forbid_change()` search-path finding remains absent.
- `btree_gist` remains in `public` as an existing review item and was not moved blindly during this bounded slice.
- Performance advisor still reports **30** unindexed-FK suggestions, **14** currently-unused indexes, and the existing multiple-permissive-policy warning on `profiles`. No speculative FK index, index removal, or RLS rewrite was applied without workload evidence.

## External configuration still required for first provider-writing rehearsal

Repository work can continue without these, but actual provider writes remain fail-closed until the approved preview environment has:

- runtime-only preview `sb_secret_...` credential for synthetic fixture/session administration;
- Stripe **TEST** secret key, exact expected test account id, Checkout webhook signing secret, and separate dispute-webhook signing secret installed for the Supabase Edge Functions;
- one correctly signed TEST delivery accepted by each Stripe webhook endpoint;
- Daily preview API key, webhook/domain identity, room prefix, base64 HMAC, and an `ACTIVE` webhook after signed endpoint verification;
- explicit provider-E2E/write gates opened only for the bounded rehearsal window.

Connecting Stripe inside Base44 still does **not** transfer Stripe secret/webhook credentials to Supabase.

## Next coherent slice

**Phase 4C5L — server-verified reconciliation resolution + retention review audit:**

1. add append-only reconciliation-resolution evidence so a queue item can be resolved only from a trusted server-verified outcome, never a browser assertion;
2. add immutable retention-review audit records for `preserve` / `eligible_for_cleanup_review` decisions, with server-derived timestamps and reconciliation-hold precedence;
3. keep actual deletion disabled: any future purge executor remains separately gated and cannot be introduced as an implicit consequence of a retention review;
4. add regressions for duplicate/stale resolution, missing terminal evidence, non-admin access, browser-clock injection, retention-hold precedence, and conflicting replay;
5. continue to keep all Stripe/Daily provider writes and Base44 publication disabled until the missing TEST credentials are explicitly installed and bounded gates are opened.

## Release status

**NO MERGE / NO BASE44 OR PRODUCTION PUBLISH.** Phase 4C5K is repository-complete and CI-verified at `dbebbb86790e6e53a0e4ab668a0e85c10b44b6e1`. The bounded migration is present only in the approved Supabase preview project. PR #16 remains draft. No provider-writing rehearsal or production operation occurred.
