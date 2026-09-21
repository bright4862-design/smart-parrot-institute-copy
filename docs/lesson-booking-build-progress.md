# Lesson Booking Build Progress

Last updated: 2026-09-21

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute` without explicit instruction).
- Working branch: `agent/lesson-booking-blueprint`.
- Draft PR: #16.
- Default branch refreshed this run: `main` at `7f764e5c2b691874b6049e706f1c09026c1eafaf`.
- Phase 4C5P verified engineering checkpoint: **`af4b04068c5bf6967db715c353da3b6d6837fea4`**.
- GitHub comparison at the engineering checkpoint: **diverged, 151 commits ahead / 15 behind `main`**, merge base `210345bbe09bc46c468fb6a7e0eee0596e8d902b`.
- `main` remains untouched. Nothing has been merged, rebased, published to Base44, or deployed to production.
- Approved Supabase PREVIEW/TEST project only: `mrzzbhqzxshtbqvxkcjn`, region `eu-west-1`, URL `https://mrzzbhqzxshtbqvxkcjn.supabase.co`.
- Supabase project status after Phase 4C5P apply: **ACTIVE_HEALTHY**.
- Applied preview migration: **`20260921062835 / lesson_booking_phase4c5p_launch_blocker_snapshot_alerts`**.
- All 12 previously deployed booking Edge Functions remain unchanged in Phases 4C5L–4C5P.
- Stripe remains TEST/SANDBOX only. Live Stripe keys/objects remain inadmissible. Stripe Connect remains deferred.

## Architecture lock

- Base44/React remains the frontend shell; app id `69c16c52c86d161e74940243`.
- Supabase Postgres/Auth/RLS/Edge Functions/Cron remains authoritative for identity, booking, policy, evidence, time, payment state, attendance, cancellation, settlement, compliance, provider readiness, preview continuation, terminal evidence, reconciliation, retention review, cleanup-review planning, non-executable cleanup attestation, and launch-blocker evidence.
- No browser-authoritative money, provider-state, attendance, identity, cleanup, retention, reconciliation, launch, or time transition is allowed.
- Stripe remains hold-before/capture-after: setup mode for bookings 48h+ ahead, manual capture for near-term bookings, server-side idempotency/evidence, capture/release only from trusted worker boundaries.
- Daily remains server-evidence only with booking-scoped private rooms/tokens and signed webhook evidence.
- Preview tooling may coordinate existing server boundaries but may not call Stripe/Daily directly or recreate settlement/attendance/time logic in the browser.

## Completed phase summary

- **0A–0C:** schema/RLS/evidence foundation, bounded availability, browser-safe Supabase client, isolated booking preview.
- **1A–1C:** atomic reservation/consent, Stripe Checkout/manual authorization, deferred holds, failed-hold recovery.
- **2A–2B:** signed Daily attendance evidence and deterministic settlement/capture/release.
- **3A–3B:** cancellation/withdrawal, compliance delivery, My Lessons, immutable policy evidence.
- **4A–4C4:** admin queue/evidence/disputes, launch health/readiness, retention/legal hold, provider staging.
- **4C5A–4C5G:** provider rehearsal evidence/readiness, full-preview contracts, durable run registry, resumable executor, exact preview transport, read-only operator bootstrap, signed webhook proof, Daily HMAC correction.
- **4C5H–4C5I:** synthetic preview fixture principals, evidence-aware cleanup, ephemeral fixture sessions, redacted provider-test transcript, branch-divergence evidence.
- **4C5J–4C5L:** failure-safe terminal cleanup evidence, deterministic transcript hashing, terminal reconciliation queue, retention status, reconciliation-resolution evidence, immutable retention-review decisions.
- **4C5M–4C5O:** bounded cleanup-review plan lifecycle, immutable manifest preview, service-role-only non-executable cleanup attestation, minimized impact inventory, corrected modern `sb_secret_...` transport.
- **4C5P (current):** immutable, service-only preview launch-blocker snapshots plus append-only blocker-transition alert evidence. Advisory readiness cannot authorize launch/provider writes/cleanup.

## Phase 4C5P — immutable launch-blocker snapshot + operational alert evidence — complete

Verified engineering checkpoint: **`af4b04068c5bf6967db715c353da3b6d6837fea4`**.

### Implemented

- Added `supabase/migrations/20260921061000_lesson_booking_phase4c5p_launch_blocker_snapshot_alerts.sql`.
- Added RLS-enabled, append-only `lesson_booking_preview_launch_blocker_snapshots` and `lesson_booking_preview_launch_blocker_alerts`.
  - All direct table privileges are revoked from `public`, `anon`, `authenticated`, and `service_role`.
  - UPDATE/DELETE are blocked by the existing `forbid_change()` trigger boundary.
  - Durable rows contain only readiness booleans, counts, canonical blocker codes, transition state, and server timestamps; no Stripe/Daily identifiers, fixture identity, payment data, tokens, webhook payloads, or secrets are stored.
- Added `service_record_booking_preview_launch_blocker_snapshot(...)`.
  - `SECURITY DEFINER`, `set search_path=''`, schema-qualified reads, and EXECUTE granted only to `service_role`.
  - PostgreSQL derives time-sensitive facts with `statement_timestamp()`; no caller/browser `p_now` is accepted.
  - Server-derived checks cover required schema/functions, recent accepted Stripe main/dispute webhook evidence, latest passed provider rehearsal, unresolved provider cleanup, unresolved terminal reconciliation, and terminal preview runs missing terminal evidence after a 15-minute grace period.
  - Trusted-runtime booleans cover provider-secret bundle readiness, approved preview identity, expected Stripe account identity, Daily webhook identity/signed-endpoint readiness, fixture/session availability, provider-E2E gate, and worker-write gate.
  - Canonical blocker codes identify the exact failed boundary without serializing credential values or provider/customer identifiers.
  - `pg_advisory_xact_lock(...)` serializes the latest-state transition so concurrent retries cannot create alert spam.
  - Exact identical retries return the existing snapshot as `replay=true` with alert kind `unchanged`; transitions append `initial_state`, `became_ready`, `became_blocked`, or `blockers_changed` evidence.
  - Results permanently return `provider_write_authorized=false`, `booking_launch_authorized=false`, and `destructive_cleanup_authorized=false`.
- Added `scripts/lesson-booking-preview-launch-blocker-snapshot.mjs`.
  - Strictly validates the fixed snapshot schema and whitelists only expected fields.
  - Unknown injected provider IDs, tokens, webhook secrets, fixture IDs, and payment material are discarded.
- Updated `scripts/lesson-booking-full-preview-supabase-transport.mjs` with the new service RPC target.
  - Modern `sb_secret_...` continues to travel only in the `apikey` header for direct service Data API RPCs, never `Authorization: Bearer` and never React/browser state.
- Added `scripts/check-lesson-booking-preview-launch-blocker-snapshot.mjs`, `supabase/tests/lesson_booking_preview_launch_blocker_snapshot_scenarios.sql`, and `.github/workflows/lesson-booking-phase4c5p.yml`.
  - Regressions cover stale vs fresh signed-provider proof, provider rehearsal staleness, missing secret readiness, blocked->ready->blocked transitions, identical replay idempotency, closed worker gate, redaction, append-only enforcement, RPC/table ACLs, no caller-time injection, and no advisory-readiness authority escalation.

### Verification

- GitHub Actions **Lesson booking Phase 4C5P run `35568235873` passed** on exact engineering SHA `af4b04068c5bf6967db715c353da3b6d6837fea4`.
- Full **Lesson booking foundation run `35568235769` passed** on the same exact SHA.
- Earlier lifecycle workflows re-triggered by the shared transport/migration surface also passed on the same SHA, including Phase 4C5J run `35568235775`, Phase 4C5L run `35568235784`, Phase 4C5M run `35568235831`, Phase 4C5N run `35568235785`, and Phase 4C5O run `35568235758`.
- Dedicated CI passed the Phase 4C5P JavaScript boundary, re-verified the Phase 4C5O service attestation boundary, applied every migration to ephemeral PostgreSQL, ran the Phase P SQL scenarios, and completed the production Vite build.
- Preview migration application succeeded and Supabase recorded **`20260921062835 / lesson_booking_phase4c5p_launch_blocker_snapshot_alerts`**.
- Post-apply preview verification:
  - project: **ACTIVE_HEALTHY**;
  - launch-blocker snapshot rows: **0**;
  - launch-blocker alert rows: **0**;
  - RLS enabled on both new tables: **true**;
  - `authenticated` direct SELECT on both tables: **false**;
  - `service_role` direct SELECT on both tables: **false**;
  - `authenticated` RPC EXECUTE: **false**;
  - `service_role` RPC EXECUTE: **true**;
  - RPC is `SECURITY DEFINER`: **true**;
  - RPC config pins empty `search_path`.
- No fake readiness snapshot was written to preview; durable operational evidence will begin only when trusted runtime readiness can be measured honestly.
- No synthetic user/session, Stripe object, Daily object, Edge Function deployment, Cron activation, Base44 publication, merge, deletion, provider write, or production mutation occurred.

## Research refreshed for Phase 4C5P on 2026-09-21

### Supabase

- Current Supabase guidance keeps `sb_secret_...` on trusted backend components and on the `apikey` header; modern secret keys are not JWT Bearer tokens.
- Current database-function guidance says `SECURITY DEFINER` functions should pin `search_path` and explicitly control EXECUTE grants. Phase P follows this boundary with a service-role-only RPC and no direct table grant.
- References:
  - https://supabase.com/docs/guides/getting-started/api-keys
  - https://supabase.com/docs/guides/database/functions

### Stripe

- Stripe continues to recommend idempotency keys for POST mutations so retries replay the first result instead of duplicating writes, and recommends keeping sensitive data out of idempotency keys.
- Webhook verification still requires the unmodified raw body, `Stripe-Signature`, and the endpoint-specific `whsec_...` secret. Phase P consumes only already-accepted server evidence; it does not call Stripe.
- References:
  - https://docs.stripe.com/api/idempotent_requests
  - https://docs.stripe.com/webhooks

### Daily

- Daily continues to sign webhooks with its base64-encoded HMAC secret, documents duplicate/retry delivery, and expects the signed verification request to receive a prompt `200`. Phase P records only a trusted runtime boolean for signed-endpoint readiness and stores no Daily identifiers or HMAC material.
- Reference: https://docs.daily.co/reference/rest-api/webhooks

### Base44

- Base44 documentation keeps elevated service-role behavior in trusted backend functions rather than the React/browser client. Phase P remains entirely on the trusted Supabase/tooling side.
- Reference: https://docs.base44.com/sdk-getting-started/client

### France / EU privacy/testing

- CNIL guidance continues to favor separate test/development environments and fictitious/anonymized data rather than production personal data. Phase P follows minimization by persisting booleans/counts/canonical blocker codes instead of customer/provider identity.
- References:
  - https://www.cnil.fr/fr/tester-vos-applications
  - https://www.cnil.fr/sites/default/files/2024-03/cnil_guide_securite_personnelle_2024.pdf

## Supabase preview/advisor status after Phase 4C5P

- Project `mrzzbhqzxshtbqvxkcjn` is **ACTIVE_HEALTHY**.
- Security advisor reports **27** RLS-enabled/no-policy tables. The two Phase P evidence tables account for the increase and are intentionally RPC-only/server-only with direct API privileges revoked.
  - Remediation reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Security advisor reports **35** authenticated-callable `SECURITY DEFINER` functions, **unchanged from Phase 4C5O**. The new Phase P RPC does not increase this warning because authenticated EXECUTE is revoked; only `service_role` has EXECUTE.
  - Remediation/reference: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- The prior mutable `public.forbid_change()` search-path finding remains absent.
- `btree_gist` remains in `public` as the existing documented extension warning; it was not moved blindly during this bounded slice.
  - Remediation/reference: https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public
- Performance advisor remains at **30** unindexed-FK suggestions; no speculative FK index was added without query/workload evidence.
- Unused-index notices are now **20**, with the new empty alert predecessor index accounting for the increase; it was not removed before any production-like workload exists.
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

**Phase 4C5Q — launch-blocker acknowledgement/runbook evidence + alert-delivery handoff:**

1. add append-only acknowledgement evidence that can reference one exact blocker snapshot/alert without mutating or suppressing the authoritative blocker itself;
2. add immutable runbook-decision evidence (`investigate`, `provider_configuration_required`, `rehearsal_required`, `hold_launch`) that cannot authorize provider writes or launch;
3. produce a minimized redacted alert-delivery handoff suitable for a future trusted notifier, containing only snapshot/alert ids, canonical blocker codes, severity, and server timestamps;
4. make duplicate acknowledgements and repeated delivery preparation idempotent, use PostgreSQL server time, and reject stale/superseded snapshot claims;
5. add regressions for unauthorized callers, acknowledgement-as-bypass attempts, duplicate delivery, stale blocker identity, sensitive-field leakage, and attempts to turn the handoff into launch/provider authority;
6. keep provider writes, destructive cleanup, Cron purge, Base44 publication, default-branch merge, and production changes disabled.

## Release status

**NO MERGE / NO BASE44 OR PRODUCTION PUBLISH.** Phase 4C5P is repository-complete and CI-verified at `af4b04068c5bf6967db715c353da3b6d6837fea4` and its bounded migration is applied only to the approved Supabase preview project. PR #16 remains draft. No provider-writing rehearsal, destructive cleanup, or production operation occurred.