# Lesson Booking Build Progress

Last updated: 2026-09-21

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute` without explicit instruction).
- Working branch: `agent/lesson-booking-blueprint`; draft PR #16.
- Default branch refreshed this run: `main` at `7f764e5c2b691874b6049e706f1c09026c1eafaf`.
- Phase 4C5W verified engineering checkpoint: **`8fcfabfacc9c724f17497591bdb0d2e76c34d5a4`**.
- At the engineering checkpoint the branch is **183 commits ahead / 15 behind `main`**, merge base `210345bbe09bc46c468fb6a7e0eee0596e8d902b`.
- `main` remains untouched. No merge/rebase, Base44 publication, production deployment, external notifier send, Stripe/Daily write, Cron sender, requeue execution, provider/payment mutation, or destructive cleanup occurred.
- Approved Supabase PREVIEW/TEST project only: `mrzzbhqzxshtbqvxkcjn`, region `eu-west-1`, URL `https://mrzzbhqzxshtbqvxkcjn.supabase.co`; current project status verified `ACTIVE_HEALTHY`.
- Applied preview migration: **`20260921112625 / lesson_booking_phase4c5w_requeue_lineage_activation`**.
- Existing 12 booking Edge Functions remain unchanged by Phase 4C5W.
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
- **4C5W (current): service-only/server-time activation of one exact prepared requeue lineage into internal claim eligibility evidence only.**

## Phase 4C5W — complete

Verified engineering checkpoint: **`8fcfabfacc9c724f17497591bdb0d2e76c34d5a4`**.

### Implemented

- Added `supabase/migrations/20260921123000_lesson_booking_phase4c5w_requeue_lineage_activation.sql`.
- Added append-only, RLS-enabled, RPC-only `lesson_booking_preview_launch_blocker_requeue_work_activations`.
  - One exact Phase V `prepared` work generation can cross the activation boundary exactly once.
  - Exact retry with the same non-zero 32-hex `activation_key` is idempotent; conflicting keys and reuse across work generations are rejected.
  - The activation record binds the exact consumption, eligibility generation, dead-letter review, queue item, launch-blocker snapshot/alert, dead-letter event, work-generation number and deterministic `rqg:<snapshot>:<queue>:<eligibility_generation>:<work_generation_no>` lineage.
- Added service-only RPC `service_activate_booking_preview_launch_blocker_requeue_lineage(bigint,text)`.
  - `SECURITY DEFINER`, `search_path=''`, shared advisory transaction lock with the Phase T/U/V requeue family, PostgreSQL `statement_timestamp()` authority, direct table privileges revoked, EXECUTE granted only to `service_role`.
  - Revalidates the latest launch-blocker snapshot, exact consumed Phase V lineage, active/latest unexpired Phase U eligibility generation, exact `retry_after_review` decision, latest `dead_lettered / attempts_exhausted` event and latest prepared work generation before activation.
  - Stale snapshots, expired/superseded eligibility, stale dead-letter lineage and stale work generations fail closed.
- Activation establishes **internal lease eligibility evidence only**: `lease_handoff_state='eligible_for_internal_claim'`, `claim_scope='internal_preview_escalation_lease'`, `claim_eligible=true`.
  - This does **not** reopen or mutate the already exhausted Phase T queue attempt history and does not itself execute a claim. A separate activation-scoped lease lifecycle is required next.
  - `requeue_execution_authorized=false`, `automatic_notification_authorized=false`, `notifier_send_authorized=false`, `outcome_suppresses_blocker=false`, `provider_write_authorized=false`, `booking_launch_authorized=false`, and `destructive_cleanup_authorized=false` are all structurally enforced.
- Added `scripts/lesson-booking-preview-requeue-activation.mjs` and `scripts/check-lesson-booking-preview-requeue-activation.mjs`.
  - Strict output allowlisting reconstructs the deterministic lineage and strips activation keys plus unexpected provider/customer/identity fields.
  - Caller-controlled timestamps are rejected by construction.
  - Modern `sb_secret_...` transport remains backend-only through the `apikey` header, not `Authorization: Bearer`.
- Added `supabase/tests/lesson_booking_preview_launch_blocker_requeue_lineage_activation_scenarios.sql`.
  - Covers the full synthetic snapshot -> alert -> escalation -> dead-letter -> review -> eligibility -> consumption -> prepared lineage -> activation path, exact replay, conflicting-key denial, append-only mutation denial and role/table privilege boundaries inside a transaction that rolls back.
- Added `.github/workflows/lesson-booking-phase4c5w.yml`, running the Phase W JS contract, Phase V regression, clean PostgreSQL bootstrap/all-migration/scenario verification and the production Vite build.
- Updated `scripts/lesson-booking-full-preview-supabase-transport.mjs` only to whitelist the new Phase W service RPC; existing booking/payment/provider authentication boundaries remain unchanged.

### Verification

- GitHub Actions **Lesson booking Phase 4C5W run `35593725140` passed** on exact engineering SHA `8fcfabfacc9c724f17497591bdb0d2e76c34d5a4`.
- Full **Lesson booking foundation run `35593725137` passed** on the same engineering SHA.
- The bounded Phase W migration was applied only to `mrzzbhqzxshtbqvxkcjn`; Supabase recorded **`20260921112625 / lesson_booking_phase4c5w_requeue_lineage_activation`**.
- Post-apply preview verification: activation rows **0**; RLS enabled; direct SELECT denied to both `authenticated` and `service_role`; Phase W RPC denied to `authenticated` and executable by `service_role`; function is `SECURITY DEFINER`; function `proconfig` is `search_path=""`.
- Supabase project identity/status rechecked after migration: exact project `mrzzbhqzxshtbqvxkcjn`, name `Smart Parrot Supabase project`, region `eu-west-1`, status **`ACTIVE_HEALTHY`**.
- No synthetic activation row was inserted into preview simply to exercise the schema.

## Research refreshed for Phase 4C5W

- Supabase current database-function guidance continues to recommend a pinned `search_path` for `SECURITY DEFINER` functions and deliberate EXECUTE grants. Phase W follows that pattern and keeps the privileged RPC service-role only.
- Supabase current API-key guidance states modern `sb_secret_...` credentials are backend-only API keys and are not JWTs; they should be sent via the `apikey` header and never exposed to browser/source code.
- Stripe current guidance continues to recommend idempotency keys for retried POST mutations and endpoint-specific raw-body webhook signature verification. Phase W performs no Stripe mutation and cannot convert internal requeue evidence into payment/provider authority.
- Daily current webhook guidance retains HMAC verification and configurable retry behavior, supporting durable idempotent server evidence rather than browser or single-delivery conclusions.
- Base44 elevated service-role behavior remains restricted to trusted backend functions; none of the Phase W service authority is exposed through React/browser code.
- CNIL guidance continues to recommend fictitious/non-production personal data for development/test environments and purpose-bound data retention. Phase W stores minimized operational lineage rather than provider/customer payloads.

## Supabase advisor status after Phase 4C5W

- Security advisor shows **39 RLS-enabled/no-policy notices**. The new Phase W evidence table is intentionally in that set because direct Data API access is revoked and access is through the service-only RPC.
- Authenticated-callable `SECURITY DEFINER` findings remain **38**; Phase W did **not** expand that authenticated surface because its new RPC is denied to `authenticated` and granted only to `service_role`.
- The prior mutable `public.forbid_change()` `search_path` warning remains absent.
- `btree_gist` in `public` remains a review item and was not moved blindly.
- Performance advisor reports **61 unindexed foreign-key opportunities**, **26 unused-index notices**, and the existing single multiple-permissive-policy notice on `profiles`. The Phase W table is empty and its new FKs/index therefore contribute expected no-workload findings; no speculative indexes were added or removed without workload/query evidence.
- Relevant advisor remediation references remain the Supabase database-linter pages for `rls_enabled_no_policy`, `authenticated_security_definer_function_executable`, `extension_in_public`, `unindexed_foreign_keys`, `unused_index`, and `multiple_permissive_policies`.

## External configuration still required for first provider-writing rehearsal

Actual provider E2E remains fail-closed until the approved preview runtime has: a runtime-only `sb_secret_...`; Stripe **TEST** secret key, exact expected test account id, Checkout webhook signing secret and separate dispute-webhook signing secret, plus one valid signed TEST delivery through each endpoint; Daily preview API key, domain/webhook identity, room prefix, base64 HMAC and an `ACTIVE` signed webhook; and safe short-lived preview student/admin sessions plus explicit bounded provider/worker write gates. Connecting Stripe in Base44 does **not** transfer those server secrets to Supabase.

## Next coherent slice

**Phase 4C5X — requeue-specific claim/lease generation + terminal transition evidence.** Add a distinct activation-scoped, server-time claim/lease lifecycle tied to the exact Phase W `activation_id` and deterministic lineage. It must not reopen or mutate the exhausted/dead-lettered Phase T queue attempt history. Add append-only claim/lease/transition evidence, bounded lease duration, stale/superseded activation refusal, exact replay/conflict handling and minimized inspection. Keep actual outbound notification sending, provider/payment writes, booking launch, destructive cleanup, Cron delivery, Base44 publication, default-branch merge and production changes disabled.

## Release status

**NO MERGE / NO BASE44 OR PRODUCTION PUBLISH.** Phase 4C5W is repository-complete and CI-verified at `8fcfabfacc9c724f17497591bdb0d2e76c34d5a4`; its bounded migration is applied only to the approved Supabase preview project. PR #16 remains draft. No external notification was sent, no actual requeue claim was executed, and no Stripe/Daily/provider/payment/production write occurred.
