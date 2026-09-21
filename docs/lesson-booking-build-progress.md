# Lesson Booking Build Progress

Last updated: 2026-09-21

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute` without explicit instruction).
- Working branch: `agent/lesson-booking-blueprint`; draft PR #16.
- Default branch refreshed this run: `main` at `7f764e5c2b691874b6049e706f1c09026c1eafaf`.
- Phase 4C5U verified engineering checkpoint: **`b0bd402a5e35ee54079c10eaceb472cc034a5245`**.
- At the engineering checkpoint the branch is **178 commits ahead / 15 behind `main`**, merge base `210345bbe09bc46c468fb6a7e0eee0596e8d902b`.
- `main` remains untouched. No merge/rebase, Base44 publication, production deployment, external notifier send, Stripe/Daily write, Cron sender, requeue execution, or destructive cleanup occurred.
- Approved Supabase PREVIEW/TEST project only: `mrzzbhqzxshtbqvxkcjn`, region `eu-west-1`, URL `https://mrzzbhqzxshtbqvxkcjn.supabase.co`.
- Applied preview migration: **`20260921103123 / lesson_booking_phase4c5u_dead_letter_review_requeue`**.
- Existing 12 booking Edge Functions remain unchanged by Phase 4C5U.
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
- **4C5U (current): dead-letter operator review + bounded requeue-eligibility evidence.**

## Phase 4C5U — complete

Verified engineering checkpoint: **`b0bd402a5e35ee54079c10eaceb472cc034a5245`**.

### Implemented

- Added `supabase/migrations/20260921101500_lesson_booking_phase4c5u_dead_letter_review_requeue.sql`.
- Added append-only, RLS-enabled, RPC-only `lesson_booking_preview_launch_blocker_dead_letter_reviews`.
  - Reviews bind to the exact latest `dead_lettered` Phase T work event and latest launch-blocker snapshot.
  - Fixed decisions are `preserve`, `retry_after_review`, and `invalid_work_item_confirmed`.
  - `retry_after_review` is valid only for `attempts_exhausted`; `invalid_work_item_confirmed` is valid only for `invalid_work_item`.
  - Exact replay is idempotent; conflicting review decisions are rejected.
- Added append-only, RLS-enabled, RPC-only `lesson_booking_preview_launch_blocker_requeue_eligibility_generations`.
  - Eligibility is created only from an admin `retry_after_review` decision against still-current dead-letter work.
  - Generation lifetime is exactly **900 seconds / 15 minutes**, measured from PostgreSQL server time.
  - An active generation is replayed idempotently; stale snapshots or changed work state are rejected.
  - Eligibility does **not** authorize a requeue: `requeue_execution_authorized=false` is structurally enforced.
- Added admin RPCs:
  - `admin_list_booking_preview_launch_blocker_dead_letter_review_queue(integer)`
  - `admin_record_booking_preview_launch_blocker_dead_letter_review(bigint,text)`
  - `admin_generate_booking_preview_launch_blocker_requeue_eligibility(bigint)`
  - All are `SECURITY DEFINER`, pin `search_path=''`, execute the existing server-side admin role guard, use PostgreSQL server time and share the Phase T advisory lock where mutation occurs.
  - Direct table reads remain revoked from `authenticated` and `service_role`; the RPCs are callable only by signed-in users and immediately enforce admin authorization.
- Added `scripts/lesson-booking-preview-dead-letter-review.mjs` and `scripts/check-lesson-booking-preview-dead-letter-review.mjs`.
  - Client normalization allowlists minimized fields, strips actor/customer/provider/claim/secrets, rejects invalid decision/reason combinations and rejects any authority flag that becomes true.
  - Caller-supplied review/generation timestamps are not accepted.
- Added `supabase/tests/lesson_booking_preview_launch_blocker_dead_letter_review_requeue_scenarios.sql`.
  - Covers invalid-work preservation, exhausted-attempt review, exact replay, conflict rejection, generation replay, 15-minute lifetime, stale snapshot rejection, non-admin denial, minimized queue output, append-only mutation denial and grant boundaries.
- Added `.github/workflows/lesson-booking-phase4c5u.yml`, which runs the Phase U contract, Phase T regression, a clean PostgreSQL migration/scenario pass, and the production Vite build.
- Updated `scripts/lesson-booking-full-preview-supabase-transport.mjs` with the three Phase U `admin_rpc` targets while preserving the existing secret-worker source-contract formatting.

### Verification

- GitHub Actions **Lesson booking Phase 4C5U run `35588905673` passed** on exact engineering SHA `b0bd402a5e35ee54079c10eaceb472cc034a5245`.
- Full **Lesson booking foundation run `35588905690` passed** on the same SHA.
- The first full-foundation run on the intermediate compacted transport source failed an existing source-contract assertion about `apikey`-only secret-worker authentication. That was a formatting/source-regression in the transport edit, not a provider call; it was corrected before the Phase U preview migration was applied. Final Phase U and full-foundation runs are green on the final engineering SHA.
- The bounded Phase U migration was applied only to `mrzzbhqzxshtbqvxkcjn`; Supabase recorded **`20260921103123 / lesson_booking_phase4c5u_dead_letter_review_requeue`**.
- Post-apply preview verification: review rows **0**; eligibility-generation rows **0**; RLS enabled on both tables; direct SELECT denied to both `authenticated` and `service_role`; all three Phase U RPCs executable by `authenticated` and denied to `service_role`; all three are `SECURITY DEFINER` with an empty `search_path` and immediately enforce the admin role guard.
- No fake dead-letter review or requeue-eligibility evidence was inserted into preview.

## Research refreshed for Phase 4C5U

- Supabase current guidance continues to recommend a pinned `search_path` for `SECURITY DEFINER` functions and deliberate EXECUTE grants. Phase U follows that pattern and relies on the existing server-side admin authorization check rather than table policies for the RPC-only evidence tables.
- Stripe continues to require server-side secret keys and idempotency discipline for retried POST mutations. Phase U does not make any Stripe request and does not convert an internal review into a payment/provider transition.
- Daily continues to document signed HMAC webhooks and retry/duplicate-delivery behavior. Phase U never treats an internal dead-letter decision as Daily/provider truth.
- Base44 elevated service-role behavior stays on trusted backend surfaces; no Phase U privileged logic was put in React/browser code.
- CNIL guidance continues to recommend fictitious/non-production data for development/testing and purpose-bound minimization. Phase U stores only minimized operational correlation and review evidence.

## Supabase advisor status after Phase 4C5U

- Security advisor shows **36 RLS-enabled/no-policy notices**. The two new Phase U evidence tables are intentionally in that set because direct Data API access is revoked and all access is through guarded RPCs.
- Authenticated-callable `SECURITY DEFINER` findings are **38**, up by the three Phase U admin RPCs. This is intentional: each function pins `search_path=''`, exposes only a bounded RPC shape and calls `private.smart_parrot_require_admin(auth.uid())` before returning or mutating evidence.
- The prior mutable `public.forbid_change()` `search_path` warning remains absent.
- `btree_gist` in `public` remains a review item and was not moved blindly.
- Performance advisor now reports **47 unindexed foreign-key opportunities**, **24 unused-index notices**, and the existing single multiple-permissive-policy notice on `profiles`. The new Phase U tables are empty and some new FKs/indexes are therefore flagged; no speculative indexing/removal was done without workload/query evidence.

## External configuration still required for first provider-writing rehearsal

Actual provider E2E remains fail-closed until the approved preview runtime has: a runtime-only `sb_secret_...`; Stripe **TEST** secret key, exact expected test account id, Checkout webhook signing secret and separate dispute-webhook signing secret, plus one valid signed TEST delivery through each endpoint; Daily preview API key, domain/webhook identity, room prefix, base64 HMAC and an `ACTIVE` signed webhook; and safe short-lived preview student/admin sessions plus explicit bounded provider/worker write gates. Connecting Stripe in Base44 does **not** transfer those server secrets to Supabase.

## Next coherent slice

**Phase 4C5V — service-only requeue generation consumption + lineage evidence.** Add a single-use, PostgreSQL-server-time consumption boundary for an active Phase U eligibility generation, producing append-only lineage into a new deterministic requeue/work generation while refusing expired, stale, already-consumed or conflicting generations. Keep actual outbound notifier sending, automatic Cron delivery, provider/payment writes, booking launch, destructive cleanup, Base44 publication, default-branch merge and production changes disabled; consuming review evidence must not itself imply provider delivery or launch authority.

## Release status

**NO MERGE / NO BASE44 OR PRODUCTION PUBLISH.** Phase 4C5U is repository-complete and CI-verified at `b0bd402a5e35ee54079c10eaceb472cc034a5245`; its bounded migration is applied only to the approved Supabase preview project. PR #16 remains draft. No external notification was sent, no requeue was executed, and no Stripe/Daily/provider/production write occurred.