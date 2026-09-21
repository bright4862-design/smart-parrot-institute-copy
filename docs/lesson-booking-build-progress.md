# Lesson Booking Build Progress

Last updated: 2026-09-21

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute` without explicit instruction).
- Working branch: `agent/lesson-booking-blueprint`; draft PR #16.
- Default branch refreshed this run: `main` at `7f764e5c2b691874b6049e706f1c09026c1eafaf`.
- Phase 4C5V verified engineering checkpoint: **`d23c5e65adfeb90c6714a28195e650cf1aeb6bc2`**.
- At the engineering checkpoint the branch is **180 commits ahead / 15 behind `main`**, merge base `210345bbe09bc46c468fb6a7e0eee0596e8d902b`.
- `main` remains untouched. No merge/rebase, Base44 publication, production deployment, external notifier send, Stripe/Daily write, Cron sender, requeue execution, provider/payment mutation, or destructive cleanup occurred.
- Approved Supabase PREVIEW/TEST project only: `mrzzbhqzxshtbqvxkcjn`, region `eu-west-1`, URL `https://mrzzbhqzxshtbqvxkcjn.supabase.co`; current project status verified `ACTIVE_HEALTHY`.
- Applied preview migration: **`20260921104625 / lesson_booking_phase4c5v_requeue_generation_consumption_lineage`**.
- Existing 12 booking Edge Functions remain unchanged by Phase 4C5V.
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
- **4C5V (current): service-only single-use requeue eligibility consumption + deterministic prepared lineage evidence.**

## Phase 4C5V — complete

Verified engineering checkpoint: **`d23c5e65adfeb90c6714a28195e650cf1aeb6bc2`**.

### Implemented

- Added `supabase/migrations/20260921113000_lesson_booking_phase4c5v_requeue_generation_consumption_lineage.sql`.
- Added append-only, RLS-enabled, RPC-only `lesson_booking_preview_launch_blocker_requeue_consumptions`.
  - One active Phase U eligibility generation can be consumed exactly once.
  - Exact retry using the same non-zero 32-hex `consumption_key` is idempotent; a different key after consumption and reuse of one key across generations are rejected.
  - Consumption revalidates the current launch-blocker snapshot, the exact `retry_after_review` review, the latest `dead_lettered / attempts_exhausted` work event, the latest eligibility generation and PostgreSQL server-time expiry before writing evidence.
- Added append-only, RLS-enabled, RPC-only `lesson_booking_preview_launch_blocker_requeue_work_generations`.
  - Each accepted consumption atomically creates a deterministic lineage reference `rqg:<snapshot>:<queue_item>:<eligibility_generation>:<work_generation_no>`.
  - Work remains structurally `prepared` and **claim-ineligible**; `requeue_execution_authorized=false`, `automatic_notification_authorized=false`, `notifier_send_authorized=false`, `outcome_suppresses_blocker=false`, `provider_write_authorized=false`, `booking_launch_authorized=false`, and `destructive_cleanup_authorized=false` are all enforced.
  - No outbound notifier delivery, queue activation, provider/payment mutation, booking launch, Cron send or cleanup authority is created by consumption.
- Added service-only RPC `service_consume_booking_preview_launch_blocker_requeue_eligibility(bigint,text)`.
  - `SECURITY DEFINER`, `search_path=''`, shared advisory transaction lock with the Phase T/U requeue family, PostgreSQL server-time authority, direct table privileges revoked, and EXECUTE granted only to `service_role`.
- Added `scripts/lesson-booking-preview-requeue-lineage.mjs` and `scripts/check-lesson-booking-preview-requeue-lineage.mjs`.
  - Strict output allowlisting strips the consumption key and unexpected provider/customer/identity fields.
  - The client verifies deterministic lineage, fixed `prepared` state, `claim_eligible=false`, server-time authority and every fail-closed authority flag.
  - Modern `sb_secret_...` transport remains backend-only via the `apikey` header; it is never mirrored into `Authorization: Bearer`.
- Added `supabase/tests/lesson_booking_preview_launch_blocker_requeue_generation_consumption_lineage_scenarios.sql`.
  - Covers successful single consumption, exact replay, conflicting-key denial, expired generation denial, superseded generation denial, stale-snapshot denial, deterministic lineage, one-row atomicity, append-only mutation denial and role/table privilege boundaries.
- Added `.github/workflows/lesson-booking-phase4c5v.yml`, running the new JS contract, Phase U regression, a clean PostgreSQL bootstrap/all-migration/scenario pass and the production Vite build.
- Updated `scripts/lesson-booking-full-preview-supabase-transport.mjs` with the Phase V service RPC target only; existing booking/payment/provider authentication boundaries remain unchanged.

### Verification

- GitHub Actions **Lesson booking Phase 4C5V run `35590204148` passed** on exact engineering SHA `d23c5e65adfeb90c6714a28195e650cf1aeb6bc2`.
- Full **Lesson booking foundation run `35590204195` passed** on the same SHA.
- All **13 workflows** triggered by the engineering checkpoint completed successfully, including the Phase J–V booking workflows and the full foundation suite.
- The bounded Phase V migration was applied only to `mrzzbhqzxshtbqvxkcjn`; Supabase recorded **`20260921104625 / lesson_booking_phase4c5v_requeue_generation_consumption_lineage`**.
- Post-apply preview verification: consumption rows **0**; work-generation rows **0**; RLS enabled on both tables; direct SELECT denied to both `authenticated` and `service_role`; Phase V RPC denied to `authenticated` and executable by `service_role`; RPC `proconfig` is `search_path=""`.
- Supabase project identity/status rechecked after migration: exact project `mrzzbhqzxshtbqvxkcjn`, name `Smart Parrot Supabase project`, region `eu-west-1`, status **`ACTIVE_HEALTHY`**.
- No synthetic requeue consumption or prepared lineage row was inserted into preview just to exercise the schema.

## Research refreshed for Phase 4C5V

- Supabase current database-function guidance continues to recommend a pinned `search_path` for `SECURITY DEFINER` functions and deliberate EXECUTE grants. Phase V follows that pattern and keeps its privileged RPC service-role only.
- Supabase current API-key guidance treats modern `sb_secret_...` credentials as backend-only API keys sent through `apikey`, not JWT bearer tokens; the shared preview transport preserves that boundary.
- Stripe continues to require idempotency keys for safely retried POST mutations and raw-body, endpoint-specific signature verification for webhooks. Phase V performs no Stripe request and does not turn internal requeue lineage into payment/provider authority.
- Daily continues to document signed webhook evidence and retry/duplicate-delivery behavior, reinforcing durable idempotent server evidence rather than browser or single-delivery conclusions.
- Base44 privileged/provider secrets remain backend-only; none of the Phase V service authority is exposed through React/browser code.
- CNIL/GDPR minimization and non-production testing guidance continues to support the isolated preview environment and minimized operational evidence; Phase V stores correlation/lineage state rather than provider/customer payloads.

## Supabase advisor status after Phase 4C5V

- Security advisor shows **38 RLS-enabled/no-policy notices**. The two new Phase V evidence tables are intentionally in that set because direct Data API access is revoked and all access is through the service-only RPC.
- Authenticated-callable `SECURITY DEFINER` findings remain **38**; Phase V did **not** expand that surface because its new RPC is denied to `authenticated` and granted only to `service_role`.
- The prior mutable `public.forbid_change()` `search_path` warning remains absent.
- `btree_gist` in `public` remains a review item and was not moved blindly.
- Performance advisor reports **55 unindexed foreign-key opportunities**, **25 unused-index notices**, and the existing single multiple-permissive-policy notice on `profiles`. The Phase V tables are empty and several new FKs/indexes are therefore flagged; no speculative indexes were added or removed without workload/query evidence.
- Relevant advisor remediation references remain the Supabase database-linter pages for `rls_enabled_no_policy`, `authenticated_security_definer_function_executable`, `extension_in_public`, `unindexed_foreign_keys`, `unused_index`, and `multiple_permissive_policies`.

## External configuration still required for first provider-writing rehearsal

Actual provider E2E remains fail-closed until the approved preview runtime has: a runtime-only `sb_secret_...`; Stripe **TEST** secret key, exact expected test account id, Checkout webhook signing secret and separate dispute-webhook signing secret, plus one valid signed TEST delivery through each endpoint; Daily preview API key, domain/webhook identity, room prefix, base64 HMAC and an `ACTIVE` signed webhook; and safe short-lived preview student/admin sessions plus explicit bounded provider/worker write gates. Connecting Stripe in Base44 does **not** transfer those server secrets to Supabase.

## Next coherent slice

**Phase 4C5W — bounded requeue lineage activation evidence + lease-safe eligibility handoff.** Add a separate service-only/server-time activation boundary that can mark one exact current Phase V `prepared` lineage as internally eligible for the existing claim/lease machinery only after revalidating current snapshot, dead-letter/review lineage and generation freshness. Preserve single-use/idempotent replay, stale-lineage refusal and append-only audit evidence. Activation must still keep `notifier_send_authorized=false`, `automatic_notification_authorized=false`, provider/payment writes, booking launch, destructive cleanup, Base44 publication, default-branch merge and production changes disabled; internal claim eligibility must not itself mean an external notification was delivered.

## Release status

**NO MERGE / NO BASE44 OR PRODUCTION PUBLISH.** Phase 4C5V is repository-complete and CI-verified at `d23c5e65adfeb90c6714a28195e650cf1aeb6bc2`; its bounded migration is applied only to the approved Supabase preview project. PR #16 remains draft. No external notification was sent, no actual requeue was executed, and no Stripe/Daily/provider/payment/production write occurred.