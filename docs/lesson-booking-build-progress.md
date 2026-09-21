# Lesson Booking Build Progress

Last updated: 2026-09-21

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute` without explicit instruction).
- Working branch: `agent/lesson-booking-blueprint`; draft PR #16.
- Default branch refreshed this run: `main` at `7f764e5c2b691874b6049e706f1c09026c1eafaf`.
- Phase 4C5S verified engineering checkpoint: **`04a9f9cae1c163725f2c86d52c0ad85e2f8c272a`**.
- At the engineering checkpoint the branch is **168 commits ahead / 15 behind `main`**, merge base `210345bbe09bc46c468fb6a7e0eee0596e8d902b`.
- `main` remains untouched. No merge/rebase, Base44 publication, production deployment, external notifier send, Stripe/Daily write, Cron sender, or destructive cleanup occurred.
- Approved Supabase PREVIEW/TEST project only: `mrzzbhqzxshtbqvxkcjn`, region `eu-west-1`, URL `https://mrzzbhqzxshtbqvxkcjn.supabase.co`.
- Supabase remains **ACTIVE_HEALTHY**.
- Applied preview migration: **`20260921082326 / lesson_booking_phase4c5s_notifier_proof_escalation_queue`**.
- Existing 12 booking Edge Functions remain unchanged by Phase 4C5S.
- Stripe remains TEST/SANDBOX only; live keys/objects are inadmissible and Stripe Connect remains deferred.

## Architecture lock

Base44/React remains the frontend. Supabase Postgres/Auth/RLS/Edge Functions/Cron remains source of truth for identity, booking/payment state, policy/consent evidence, attendance, settlement, provider readiness, preview run state, reconciliation, retention and launch-blocker evidence. No browser-authoritative money, time, attendance, provider, cleanup, launch or notification transition is allowed. Stripe remains hold-before/capture-after with setup mode for bookings 48h+ ahead and manual capture near-term. Daily remains server-evidence only.

## Completed phase summary

- 0A–0C: schema/RLS/evidence foundation, bounded availability, browser-safe client, isolated booking preview.
- 1A–1C: atomic reservation/consent, Checkout/manual authorization, deferred holds and failed-hold recovery.
- 2A–2B: signed Daily attendance and deterministic settlement/capture/release.
- 3A–3B: cancellation/withdrawal, compliance delivery, My Lessons and immutable policy evidence.
- 4A–4C4: admin queue/evidence/disputes, launch health/readiness, retention/legal hold and provider staging.
- 4C5A–4C5Q: provider rehearsal/readiness, durable preview runs, resumable executor, operator/fixture/session hardening, terminal evidence/reconciliation/retention, cleanup review/attestation, launch-blocker snapshots and acknowledgement/handoff evidence.
- 4C5R: service-only append-only notifier delivery-attempt/receipt evidence plus server-time escalation observation. `delivered` remains impossible through the general receipt path without a trusted proof adapter.
- **4C5S (current): trusted notifier proof adapter contract + minimized escalation work queue.**

## Phase 4C5S — complete

Verified engineering checkpoint: **`04a9f9cae1c163725f2c86d52c0ad85e2f8c272a`**.

### Implemented

- Added `supabase/migrations/20260921081000_lesson_booking_phase4c5s_notifier_proof_escalation_queue.sql`.
- Added append-only, RLS-enabled `lesson_booking_preview_launch_blocker_notifier_proofs`.
  - Binds one exact current Phase R prepared delivery to one immutable trusted notifier proof.
  - Accepts only a SHA-256-shaped hash of a trusted notifier receipt/message id, never the raw provider id.
  - Requires the exact deterministic Phase R `delivery_key`, current snapshot/handoff and prior `prepared` receipt.
  - Exact retries replay; a different proof for the same handoff conflicts.
  - Only after the trusted proof is accepted does the service-only RPC create the Phase R terminal `delivered` receipt.
  - Existing terminal `delivered`, `failed`, or `deferred` outcomes block conflicting proof ingestion.
- Added append-only, RLS-enabled `lesson_booking_preview_launch_blocker_escalation_queue`.
  - Uses the existing Phase R PostgreSQL-server-time observer.
  - Persists only minimized work identity: handoff/snapshot/alert/observation ids, deterministic delivery key, severity, age class, escalation class, blocker count and server timestamp.
  - Fresh/non-escalated blockers create no durable queue row; aging/overdue review/urgent work is idempotent.
  - It stores no blocker codes, actor/customer/provider ids, provider payload, message id, receipt id, token, secret or payment data.
- Added service-only RPCs `service_record_booking_preview_launch_blocker_trusted_delivery_proof(bigint,text,text,text)` and `service_prepare_booking_preview_launch_blocker_escalation_queue(bigint)`.
  - Both are `SECURITY DEFINER`, pin `search_path=''`, use the existing launch-blocker advisory lock and grant EXECUTE only to `service_role`.
  - PostgreSQL server time is authoritative; caller/browser time is not accepted.
  - All notification/launch/provider/cleanup authority flags remain fail-closed.
- Added `scripts/lesson-booking-preview-notifier-proof-escalation-queue.mjs`, its contract regression, PostgreSQL scenario regression and dedicated `.github/workflows/lesson-booking-phase4c5s.yml`.
- Updated the approved preview Supabase transport with the two service RPC targets. Modern `sb_secret_...` continues to travel only in `apikey`, never `Authorization: Bearer`.

### Verification

- GitHub Actions **Lesson booking Phase 4C5S run `35577478349` passed** on exact engineering SHA `04a9f9cae1c163725f2c86d52c0ad85e2f8c272a`.
- Full **Lesson booking foundation run `35577478187` passed** on the same SHA, including the existing booking/payment/security regression set, full ephemeral PostgreSQL migration/scenario execution, Edge Function checks and the production Vite build.
- All ten booking workflows triggered by the engineering checkpoint completed successfully, including Phases J/L/M/N/O/P/Q/R/S and the full foundation suite.
- The Phase S migration was applied only to `mrzzbhqzxshtbqvxkcjn`; Supabase recorded **`20260921082326 / lesson_booking_phase4c5s_notifier_proof_escalation_queue`**.
- Post-apply preview verification: proof rows **0**; escalation queue rows **0**; RLS enabled on both; direct SELECT denied to both `authenticated` and `service_role`; both RPCs denied to `authenticated` and executable by `service_role` only.
- No fake notifier proof or escalation item was inserted into preview.

## Research refreshed for Phase 4C5S

- Supabase current guidance continues to require an explicit/pinned `search_path` for `SECURITY DEFINER` functions and tight EXECUTE grants. Modern `sb_secret_...` credentials are opaque backend keys, not JWTs, and belong in the `apikey` header.
- Stripe continues to recommend idempotency keys for retried POST mutations, warns against embedding sensitive/PII material in those keys, and keeps test/live secret keys server-side. Phase S makes no Stripe mutation.
- Daily continues to document signed webhook processing plus retry/duplicate-delivery behavior; Phase S therefore treats notifier/provider evidence as idempotent server evidence rather than a browser claim. It makes no Daily mutation.
- Base44 continues to reserve elevated service-role behavior for trusted backend functions rather than React/browser code.
- GDPR/CNIL guidance continues to support data minimisation, purpose-bound retention and fictitious/non-production data in testing. Phase S stores only a proof hash and minimized operational queue metadata.

## Supabase advisor status after Phase 4C5S

- The two new server-only/RPC-only Phase S tables appear in the expected RLS-enabled/no-policy findings. This is intentional: direct Data API table access is revoked.
- The two Phase S RPCs do **not** add authenticated-callable `SECURITY DEFINER` findings because EXECUTE is revoked from `authenticated` and granted only to `service_role`.
- The prior mutable `public.forbid_change()` `search_path` warning remains absent.
- The existing `btree_gist`-in-`public` extension warning remains a review item; it was not moved blindly.
- Performance advisor currently reports **39 unindexed foreign-key opportunities**, **20 unused-index notices**, and the existing multiple-permissive-policy finding on `profiles`. No speculative index was added without workload/query evidence.

## External configuration still required for first provider-writing rehearsal

Actual provider E2E remains fail-closed until the approved preview runtime has: a runtime-only `sb_secret_...`; Stripe **TEST** secret key, exact expected test account id, Checkout webhook signing secret and separate dispute-webhook signing secret, plus one valid signed TEST delivery through each endpoint; Daily preview API key, domain/webhook identity, room prefix, base64 HMAC and an `ACTIVE` signed webhook; and safe short-lived preview student/admin sessions plus explicit bounded provider/worker write gates. Connecting Stripe in Base44 does **not** transfer those server secrets to Supabase.

## Next coherent slice

**Phase 4C5T — minimized escalation claim/lease + retry/dead-letter evidence.** Add a service-only PostgreSQL-server-time bounded claim/lease for queue work, append-only claim/release/retry/dead-letter audit evidence, deterministic replay/stale-lease protections and minimized operator inspection. Keep actual external notifier sending, automatic Cron delivery, provider/payment writes, booking launch, destructive cleanup, Base44 publication, default-branch merge and production changes disabled.

## Release status

**NO MERGE / NO BASE44 OR PRODUCTION PUBLISH.** Phase 4C5S is repository-complete and CI-verified at `04a9f9cae1c163725f2c86d52c0ad85e2f8c272a`; its bounded migration is applied only to the approved Supabase preview project. PR #16 remains draft. No external notification was sent and no Stripe/Daily/provider/production write occurred.
