# Lesson Booking Build Progress

Last updated: 2026-09-21

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute` without explicit instruction).
- Working branch: `agent/lesson-booking-blueprint`; draft PR #16.
- Default branch refreshed this run: `main` at `7f764e5c2b691874b6049e706f1c09026c1eafaf`.
- Phase 4C5X verified engineering checkpoint: **`dccba062d868bb67e72171fb3f43031a554c521b`**.
- At that engineering checkpoint the branch was **185 commits ahead / 15 behind `main`**, merge base `210345bbe09bc46c468fb6a7e0eee0596e8d902b`.
- `main` remains untouched. No merge/rebase, Base44 publication, production deployment, external notifier send, Stripe/Daily write, Cron sender, provider/payment mutation, booking launch, or destructive cleanup occurred.
- Approved Supabase PREVIEW/TEST project only: `mrzzbhqzxshtbqvxkcjn`, region `eu-west-1`, URL `https://mrzzbhqzxshtbqvxkcjn.supabase.co`; project status verified `ACTIVE_HEALTHY` after the migration.
- Applied preview migration: **`20260921124259 / lesson_booking_phase4c5x_requeue_claim_lease_terminal`**.
- Existing 12 booking Edge Functions remain unchanged by Phase 4C5X.
- Stripe remains TEST/SANDBOX only; live keys/objects are inadmissible and Stripe Connect remains deferred.

## Architecture lock

Base44/React remains the frontend. Supabase Postgres/Auth/RLS/Edge Functions/Cron remains source of truth for identity, booking/payment state, policy/consent evidence, attendance, settlement, provider readiness, preview run state, reconciliation, retention and launch-blocker evidence. No browser-authoritative money, time, attendance, provider, cleanup, launch, notification or requeue transition is allowed. Stripe remains hold-before/capture-after with setup mode for bookings 48h+ ahead and manual capture near-term. Daily remains server-evidence only.

## Completed phase summary

- 0A–0C: schema/RLS/evidence foundation, bounded availability, browser-safe client, isolated booking preview.
- 1A–1C: atomic reservation/consent, Checkout/manual authorization, deferred holds and failed-hold recovery.
- 2A–2B: signed Daily attendance and deterministic settlement/capture/release.
- 3A–3B: cancellation/withdrawal, compliance delivery, My Lessons and immutable policy evidence.
- 4A–4C4: admin queue/evidence/disputes, launch health/readiness, retention/legal hold and provider staging.
- 4C5A–4C5Q: provider rehearsal/readiness, durable preview runs, resumable executor, operator/fixture/session hardening, terminal evidence/reconciliation/retention, cleanup review/attestation, launch-blocker snapshots and acknowledgement/handoff evidence.
- 4C5R: append-only notifier delivery-attempt/receipt evidence plus server-time escalation observation; general receipt path cannot claim `delivered` without trusted proof.
- 4C5S: trusted notifier proof adapter contract plus minimized escalation work queue.
- 4C5T: minimized escalation claim/lease + retry/dead-letter evidence.
- 4C5U: dead-letter operator review + bounded requeue-eligibility evidence.
- 4C5V: service-only single-use requeue eligibility consumption + deterministic prepared lineage evidence.
- 4C5W: service-only/server-time activation of one exact prepared requeue lineage into internal claim eligibility evidence only.
- **4C5X (current): activation-scoped requeue claim/lease generations and terminal transition evidence, independent of exhausted Phase T attempts.**

## Phase 4C5X — complete

Verified engineering checkpoint: **`dccba062d868bb67e72171fb3f43031a554c521b`**.

### Implemented

- Added `supabase/migrations/20260921133000_lesson_booking_phase4c5x_requeue_claim_lease_terminal.sql`.
- Added append-only, RLS-enabled, RPC-only `lesson_booking_preview_launch_blocker_requeue_lease_events`.
  - Event kinds are `claimed`, `released`, `retry_scheduled`, and `dead_lettered` only.
  - Claim keys are non-zero 32-hex values, unique for claims and terminal closure.
  - Requeue lease generations are independently bounded to **3** per exact Phase W activation; they do not reopen or mutate exhausted Phase T attempt history.
  - Lease durations are bounded to **30–300 seconds** and expiry/retry timing comes only from PostgreSQL server time.
- Added service-only RPC `service_claim_booking_preview_launch_blocker_requeue_work(bigint,text,integer)`.
  - `SECURITY DEFINER`, `search_path=''`, service-role-only EXECUTE, shared advisory transaction lock with the Phase T/U/V/W family.
  - Revalidates latest launch-blocker snapshot, exact Phase W activation, exact prepared work generation, current/unexpired Phase U eligibility generation, and latest original dead-letter lineage before issuing a lease.
  - Exact active replay is idempotent; conflicting keys, stale/superseded activation/work/eligibility/dead-letter lineage, active competing leases, retry windows, exhausted requeue generations, and expired same-key leases fail closed.
- Added service-only RPC `service_transition_booking_preview_launch_blocker_requeue_work(bigint,text,text,text)`.
  - Supports only `release/observed_no_send`, `retry/transient_worker_failure`, or bounded `dead_letter` reasons.
  - Retry backoff is server-derived (60 seconds after generation 1, 180 seconds after generation 2).
  - `requeue_attempts_exhausted` is rejected before generation 3; retry is rejected at generation 3.
  - Exact terminal replay is idempotent and conflicting terminal outcomes are rejected.
- Added service-only RPC `service_list_booking_preview_launch_blocker_requeue_work(integer)`.
  - Returns minimized current state for the latest snapshot only: available/leased/retry-wait/dead-lettered plus lineage and server timestamps.
  - It omits claim keys, provider/customer identifiers, secrets, tokens and payment material.
- All Phase X outputs structurally retain `requeue_execution_authorized=false`, `automatic_notification_authorized=false`, `notifier_send_authorized=false`, `outcome_suppresses_blocker=false`, `provider_write_authorized=false`, `booking_launch_authorized=false`, and `destructive_cleanup_authorized=false`.
- Added `scripts/lesson-booking-preview-requeue-lease.mjs` plus `scripts/check-lesson-booking-preview-requeue-lease.mjs`.
  - Strict output allowlisting prevents unexpected provider/customer/identity fields from crossing the contract.
  - Caller-controlled timestamps are rejected by construction.
  - Modern `sb_secret_...` transport remains backend-only through the `apikey` header, not `Authorization: Bearer`.
- Added `supabase/tests/lesson_booking_preview_launch_blocker_requeue_claim_lease_terminal_scenarios.sql` with synthetic transactional coverage for claim/replay/conflict, transition/retry/dead-letter bounds, stale lineage guards, append-only mutation denial and role/table privilege boundaries.
- Added `.github/workflows/lesson-booking-phase4c5x.yml`, which runs the Phase X JS contract, re-verifies the Phase W boundary, boots clean ephemeral PostgreSQL, applies every booking migration, executes the Phase X SQL scenarios and builds the production Vite app.
- Updated `scripts/lesson-booking-full-preview-supabase-transport.mjs` only to whitelist the three new service RPCs; browser/payment/provider authority did not expand.

### Verification

- GitHub Actions **Lesson booking Phase 4C5X run `35599412891` passed** on exact engineering SHA `dccba062d868bb67e72171fb3f43031a554c521b`.
- Full **Lesson booking foundation run `35599412688` passed** on the same engineering SHA.
- All prior phase workflows triggered by that checkpoint also completed successfully.
- The bounded Phase X migration was applied only to `mrzzbhqzxshtbqvxkcjn`; Supabase recorded **`20260921124259 / lesson_booking_phase4c5x_requeue_claim_lease_terminal`**.
- Post-apply preview verification: lease-event rows **0**; RLS enabled; direct SELECT denied to both `authenticated` and `service_role`.
- All three Phase X RPCs are `SECURITY DEFINER`, have `search_path=""`, are denied to `authenticated`, and are executable by `service_role`.
- Supabase project identity/status rechecked after migration: exact project `mrzzbhqzxshtbqvxkcjn`, name `Smart Parrot Supabase project`, region `eu-west-1`, status **`ACTIVE_HEALTHY`**.
- No synthetic claim/lease/transition row was inserted into preview merely to exercise the schema.

## Research refreshed for Phase 4C5X

- Supabase current database-function guidance still requires a pinned `search_path` when `SECURITY DEFINER` is used and recommends explicit EXECUTE grants. Phase X follows that pattern and keeps all three privileged RPCs service-role only.
- Supabase current API-key guidance states `sb_secret_...` keys are backend-only, bypass RLS, are not JWTs, and should be sent via the `apikey` header rather than as `Authorization: Bearer`.
- Stripe current guidance continues to recommend idempotency keys for safely retried POST mutations and warns against embedding personal/sensitive data in idempotency keys. Stripe webhook truth still requires the exact raw request body, `Stripe-Signature`, and the endpoint-specific `whsec_...` secret. Phase X performs no Stripe mutation.
- Daily current webhook configuration exposes an HMAC secret plus explicit retry policy (`circuit-breaker` or `exponential`), supporting durable server-side retry/idempotency evidence rather than browser conclusions. Phase X performs no Daily write.
- Base44 current documentation keeps service-role privileges and secret-bearing external API logic inside Base44-hosted backend functions rather than browser code. Phase X exposes no privileged boundary to React.
- CNIL guidance continues to require data minimisation and purpose-bound retention, recommends fictitious test data rather than production personal data during development/testing, and emphasizes that front-end protections must be reinforced by back-end controls. Phase X stores minimized operational lineage and server timestamps only.

## Supabase advisor status after Phase 4C5X

- Security advisor shows **40 RLS-enabled/no-policy notices**. The new Phase X lease-event table is intentionally in that set because direct Data API access is revoked and the only access path is through service-only RPCs.
- Authenticated-callable `SECURITY DEFINER` findings remain **38**; Phase X did **not** expand that authenticated surface because its three RPCs are denied to `authenticated` and granted only to `service_role`.
- The prior mutable `public.forbid_change()` `search_path` warning remains absent.
- `btree_gist` in `public` remains a review item and was not moved blindly.
- Performance advisor reports **65 unindexed foreign-key opportunities**, **27 unused-index notices**, and the existing single multiple-permissive-policy notice on `profiles`. The Phase X table is empty, so its new foreign keys/index contribute expected no-workload findings; no speculative indexes were added or removed without query evidence.
- Relevant remediation references remain the Supabase database-linter pages for `rls_enabled_no_policy`, `authenticated_security_definer_function_executable`, `extension_in_public`, `unindexed_foreign_keys`, `unused_index`, and `multiple_permissive_policies`.

## External configuration still required for first provider-writing rehearsal

Actual provider E2E remains fail-closed until the approved preview runtime has: a runtime-only `sb_secret_...`; Stripe **TEST** secret key, exact expected test account id, Checkout webhook signing secret and separate dispute-webhook signing secret, plus one valid signed TEST delivery through each endpoint; Daily preview API key, domain/webhook identity, room prefix, base64 HMAC and an `ACTIVE` signed webhook; and safe short-lived preview student/admin sessions plus explicit bounded provider/worker write gates. Connecting Stripe in Base44 does **not** transfer those server secrets to Supabase.

## Next coherent slice

**Phase 4C5Y — stale requeue lease recovery/watchdog + immutable expiry evidence.** Add a service-only, PostgreSQL-time observer that records expired Phase X claims as append-only recovery evidence before they are treated as abandoned, with exact replay, latest-snapshot/activation guards, minimized inspection, and explicit stale/superseded refusal. Harden subsequent requeue claims so an expired prior lease cannot disappear from the audit trail. Keep outbound notification sending, provider/payment writes, booking launch, destructive cleanup, Cron delivery, Base44 publication, default-branch merge and production changes disabled.

## Release status

**NO MERGE / NO BASE44 OR PRODUCTION PUBLISH.** Phase 4C5X is repository-complete and CI-verified at `dccba062d868bb67e72171fb3f43031a554c521b`; its bounded migration is applied only to the approved Supabase preview project. PR #16 remains draft. No external notification was sent, no actual requeue claim/transition was executed, and no Stripe/Daily/provider/payment/production write occurred.
