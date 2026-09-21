# Lesson Booking Build Progress

Last updated: 2026-09-21

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute` without explicit instruction).
- Working branch: `agent/lesson-booking-blueprint`.
- Draft PR: #16.
- Default branch refreshed this run: `main` at `7f764e5c2b691874b6049e706f1c09026c1eafaf`.
- Phase 4C5Q verified engineering checkpoint: **`0adde4afda6f052cb5e169845bd88459b3b5c336`**.
- GitHub comparison at the engineering checkpoint: **diverged, 160 commits ahead / 15 behind `main`**, merge base `210345bbe09bc46c468fb6a7e0eee0596e8d902b`.
- `main` remains untouched. Nothing has been merged, rebased, published to Base44, or deployed to production.
- Approved Supabase PREVIEW/TEST project only: `mrzzbhqzxshtbqvxkcjn`, region `eu-west-1`, URL `https://mrzzbhqzxshtbqvxkcjn.supabase.co`.
- Supabase project status after Phase 4C5Q apply: **ACTIVE_HEALTHY**.
- Applied preview migration: **`20260921064723 / lesson_booking_phase4c5q_launch_blocker_ack_runbook_handoff`**.
- All 12 previously deployed booking Edge Functions remain unchanged in Phases 4C5L–4C5Q.
- Stripe remains TEST/SANDBOX only. Live Stripe keys/objects remain inadmissible. Stripe Connect remains deferred.

## Architecture lock

- Base44/React remains the frontend shell; app id `69c16c52c86d161e74940243`.
- Supabase Postgres/Auth/RLS/Edge Functions/Cron remains authoritative for identity, booking, policy, evidence, time, payment state, attendance, cancellation, settlement, compliance, provider readiness, preview continuation, terminal evidence, reconciliation, retention review, cleanup-review planning, non-executable cleanup attestation, launch-blocker evidence, and operational acknowledgement evidence.
- No browser-authoritative money, provider-state, attendance, identity, cleanup, retention, reconciliation, launch, alert, or time transition is allowed.
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
- **4C5P:** immutable, service-only preview launch-blocker snapshots plus append-only blocker-transition alert evidence.
- **4C5Q (current):** append-only launch-blocker acknowledgement/runbook evidence and a minimized service-only alert-delivery handoff; neither surface can suppress blockers, authorize launch/provider writes, authorize notification delivery, or authorize cleanup.

## Phase 4C5Q — blocker acknowledgement/runbook evidence + alert-delivery handoff — complete

Verified engineering checkpoint: **`0adde4afda6f052cb5e169845bd88459b3b5c336`**.

### Implemented

- Added `supabase/migrations/20260921063500_lesson_booking_phase4c5q_launch_blocker_ack_runbook_handoff.sql`.
- Added RLS-enabled, append-only `lesson_booking_preview_launch_blocker_acknowledgements`.
  - Each acknowledgement is bound to one exact Phase P snapshot and alert.
  - Allowed runbook decisions are fixed to `investigate`, `provider_configuration_required`, `rehearsal_required`, or `hold_launch`.
  - Provider-configuration and rehearsal decisions are rejected unless the authoritative blocker set actually supports that decision.
  - Exact duplicate acknowledgement retries replay the original durable row; a different decision for the same snapshot is rejected as a conflict.
  - Durable evidence permanently records `acknowledgement_suppresses_blocker=false`, `provider_write_authorized=false`, `booking_launch_authorized=false`, and `destructive_cleanup_authorized=false`.
- Added RLS-enabled, append-only `lesson_booking_preview_launch_blocker_delivery_handoffs`.
  - The handoff is a preparation artifact for a future trusted notifier only; it does not deliver a notification.
  - Returned data is minimized to exactly: snapshot id, alert id, canonical blocker codes, severity, snapshot timestamp, alert timestamp, and preparation timestamp.
  - It does not expose actor identity, provider/customer identifiers, provider objects, payment data, webhook payloads, tokens, secrets, or authority flags.
- Added service-only RPCs `service_record_booking_preview_launch_blocker_acknowledgement(bigint,text)` and `service_prepare_booking_preview_launch_blocker_alert_handoff(bigint)`.
  - Both are `SECURITY DEFINER`, pin `search_path=''`, and grant EXECUTE only to `service_role`.
  - Both use the same PostgreSQL advisory-lock identity as Phase P so acknowledgement/handoff preparation cannot race a superseding authoritative snapshot transition.
  - Both reject stale/superseded snapshot ids.
  - PostgreSQL server time remains authoritative; neither RPC accepts caller/browser time.
- Added `scripts/lesson-booking-preview-launch-blocker-ack-handoff.mjs` and wired the two RPC targets into `scripts/lesson-booking-full-preview-supabase-transport.mjs`.
  - Modern `sb_secret_...` service RPCs continue to use only the `apikey` header, never `Authorization: Bearer`.
  - JavaScript normalization whitelists the minimized output fields and rejects authority escalation.
- Added `scripts/check-lesson-booking-preview-launch-blocker-ack-handoff.mjs`, `supabase/tests/lesson_booking_preview_launch_blocker_ack_handoff_scenarios.sql`, and `.github/workflows/lesson-booking-phase4c5q.yml`.
  - Regressions cover RLS/RPC ACLs, append-only evidence, supported runbook decisions, conflicting duplicates, exact replay, stale snapshot claims, no caller-time injection, sensitive-field redaction, service-key transport, minimized handoff shape, and attempts to turn acknowledgement/handoff into launch/provider/cleanup authority.

### Debugging and verification

- The first Phase Q CI run exposed a test-harness issue: an async rejection assertion used `assert.throws` instead of awaiting `assert.rejects`. The implementation was not changed to hide the failure; the regression was corrected and re-run.
- The second run then exposed a PostgreSQL error in `pg_catalog.coalesce(...)`. `COALESCE` is SQL syntax rather than a schema-qualified ordinary function, so the null-normalization expression was corrected to `pg_catalog.btrim(coalesce(p_decision,''::text))` before any preview migration was applied.
- GitHub Actions **Lesson booking Phase 4C5Q run `35569865063` passed** on exact engineering SHA `0adde4afda6f052cb5e169845bd88459b3b5c336`.
- Full **Lesson booking foundation run `35569865046` passed** on the same exact SHA, including Deno Edge Function typechecks, all prior booking/payment/security regressions, every migration/scenario on ephemeral PostgreSQL, and the production Vite build.
- Preview migration application succeeded and Supabase recorded **`20260921064723 / lesson_booking_phase4c5q_launch_blocker_ack_runbook_handoff`**.
- Post-apply preview verification:
  - project: **ACTIVE_HEALTHY**;
  - acknowledgement rows: **0**;
  - delivery-handoff rows: **0**;
  - RLS enabled on both new tables: **true**;
  - `authenticated` direct SELECT on both tables: **false**;
  - `service_role` direct SELECT on both tables: **false**;
  - `authenticated` EXECUTE on both new RPCs: **false**;
  - `service_role` EXECUTE on both new RPCs: **true**.
- No synthetic acknowledgement/handoff row was written to preview because there is not yet a trusted runtime snapshot to acknowledge or notify from.
- No synthetic user/session, Stripe object, Daily object, Edge Function deployment, Cron activation, notifier delivery, Base44 publication, merge, deletion, provider write, or production mutation occurred.

## Research refreshed for Phase 4C5Q on 2026-09-21

### Supabase

- Current database-function guidance continues to recommend pinning `search_path` for `SECURITY DEFINER` functions and explicitly restricting function EXECUTE grants. Phase Q keeps both RPCs service-role-only and the tables RPC-only.
- Current Data API/RLS guidance reinforces that table and function grants remain separate from RLS itself; Phase Q revokes direct table access in addition to enabling RLS.
- References:
  - https://supabase.com/docs/guides/database/functions
  - https://supabase.com/docs/guides/database/hardening-data-api

### Stripe

- Stripe continues to recommend idempotency keys for POST mutations, with retries returning the first result rather than duplicating a mutation, and warns against putting sensitive data in idempotency keys.
- Webhook verification still requires the unmodified raw body, `Stripe-Signature`, and the endpoint-specific `whsec_...` secret. Phase Q consumes only prior server evidence; it makes no Stripe call.
- References:
  - https://docs.stripe.com/api/idempotent_requests
  - https://docs.stripe.com/webhooks

### Daily

- Daily continues to document duplicate/retried webhook delivery and recommends idempotent processing/deduplication; its webhook signing secret is base64 encoded and signed verification must receive a prompt successful response. Phase Q does not call Daily and stores no Daily identifiers or HMAC material.
- References:
  - https://docs.daily.co/reference/rest-api/webhooks
  - https://docs.daily.co/guides/products/live-streaming/handling-webhooks

### Base44

- Base44 continues to reserve elevated/service-role access for trusted backend surfaces rather than React/browser code. Phase Q privileged acknowledgement/handoff logic remains in Supabase/service tooling only.
- Reference: https://docs.base44.com/sdk-getting-started/client

### France / EU privacy/testing

- CNIL guidance continues to recommend separate development/test environments and fictitious or anonymized test data, plus data minimization. Phase Q persists only canonical operational state and server timestamps rather than customer/provider identity or payloads.
- References:
  - https://www.cnil.fr/fr/tester-vos-applications
  - https://www.cnil.fr/fr/definition/minimisation

## Supabase preview/advisor status after Phase 4C5Q

- Project `mrzzbhqzxshtbqvxkcjn` is **ACTIVE_HEALTHY**.
- Security advisor reports **29** RLS-enabled/no-policy tables. The two Phase Q server-only/RPC-only evidence tables account for the increase and intentionally have no browser policy; all direct API privileges remain revoked.
  - Remediation/reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Security advisor reports **35** authenticated-callable `SECURITY DEFINER` functions, **unchanged from Phase P**. The two new Phase Q RPCs do not increase this warning because authenticated EXECUTE is revoked; only `service_role` can execute them.
  - Remediation/reference: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- The prior mutable `public.forbid_change()` search-path finding remains absent.
- `btree_gist` remains in `public` as the existing documented extension warning; it was not moved blindly during this bounded slice.
  - Remediation/reference: https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public
- Performance advisor remains at **30** unindexed-FK suggestions; no speculative FK index was added without query/workload evidence.
- Unused-index notices remain **20** and the existing multiple-permissive-policy warning on `profiles` remains unchanged.
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

**Phase 4C5R — trusted notifier delivery receipt + escalation-policy evidence:**

1. add service-only append-only delivery-attempt/receipt evidence tied to the exact current Phase Q handoff, without yet calling any external notification provider;
2. derive an opaque deterministic delivery idempotency key from non-sensitive handoff identity so duplicate notifier retries can converge without embedding customer/provider data;
3. define a fixed delivery outcome contract such as `prepared`, `delivered`, `failed`, or `deferred`, while ensuring a delivery claim can never acknowledge/suppress the authoritative blocker or authorize launch/provider writes/cleanup;
4. add a server-time escalation observer for unresolved blocker alerts with bounded severity/age classes, but keep any scheduled/automatic notification sender disabled until a trusted delivery provider is explicitly selected and configured;
5. add regressions for duplicate receipts, stale/superseded handoffs, forged delivery success, caller-time injection, sensitive-field leakage, and authority escalation;
6. keep provider writes, destructive cleanup, Cron notification delivery, Base44 publication, default-branch merge, and production changes disabled.

## Release status

**NO MERGE / NO BASE44 OR PRODUCTION PUBLISH.** Phase 4C5Q is repository-complete and CI-verified at `0adde4afda6f052cb5e169845bd88459b3b5c336`, and its bounded migration is applied only to the approved Supabase preview project. PR #16 remains draft. No provider-writing rehearsal, notification delivery, destructive cleanup, or production operation occurred.
