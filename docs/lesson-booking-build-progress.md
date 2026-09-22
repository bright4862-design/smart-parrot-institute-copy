# Lesson Booking Build Progress

Last updated: 2026-09-22

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute` without explicit instruction).
- Canonical integration branch: `agent/lesson-booking-blueprint`; draft PR #16.
- Default branch refreshed this run: `main` at `7f764e5c2b691874b6049e706f1c09026c1eafaf`.
- Verified engineering head: **`bcb8e3d87203128863db1cd80f51fdf1fe5a8eaf`** (`fix(booking): keep Phase AB identifiers distinct`).
- At that engineering head the branch is **209 commits ahead / 15 behind `main`** with merge base `210345bbe09bc46c468fb6a7e0eee0596e8d902b`.
- `main` remains untouched. No merge/rebase to default, live Stripe use, real customer billing, Stripe Connect, destructive cleanup, production Cron money transition, or production provider write is authorized.
- Approved Supabase PREVIEW/TEST project only: `mrzzbhqzxshtbqvxkcjn`, `eu-west-1`, `https://mrzzbhqzxshtbqvxkcjn.supabase.co`; status reverified **`ACTIVE_HEALTHY`**.
- Intended public frontend domain: `asmartparrot.com`. Current public-content mapping is now proven to the Base44 **`Parrot Institute`** app (`695940b9a789c24bcec383ab`), while the booking build sandbox is **`Smart Parrot Institute  (Copy)`** (`69c16c52c86d161e74940243`). Do not overwrite or reassign the serving site blindly; integrate booking additively into the serving app and preserve existing routes.

## Architecture lock

Base44/React remains the frontend. Supabase Postgres/Auth/RLS/Edge Functions/Cron remains the source of truth for identity, booking/payment state, policy/consent evidence, attendance, settlement, provider readiness, preview run state, reconciliation, retention and launch-blocker/notifier evidence. No browser-authoritative money, time, attendance, provider, cleanup, launch, notification or requeue transition is allowed. Stripe remains hold-before/capture-after: setup mode for bookings 48h+ ahead and manual authorization/capture workflow near-term. Daily remains server-evidence only. Marketplace/Stripe Connect is deferred.

## Coordination lanes

The build is serialized through one integration owner with three isolated implementation branches and one read-mostly release lane:

- Supabase/DB: `agent/smart-parrot-supabase-20260922` — migrations, RLS/RPCs, database regressions/advisors and server-authoritative state.
- Provider: `agent/smart-parrot-provider-20260922` — Stripe/Daily adapters, signed webhooks, provider-readiness and TEST-only integration contracts.
- Frontend/Base44: `agent/smart-parrot-frontend-20260922` — booking UI, Supabase browser auth/client boundary, route coexistence and Base44 compatibility.
- Release/Deploy: exact-head verification, preview deployment, Base44/domain mapping, rollback proof and post-deploy smoke evidence; it does not author product fixes.

Only reviewed non-overlapping lane commits may be integrated into `agent/lesson-booking-blueprint`. The three implementation branches were initialized from coordination checkpoint `393eaf78ae34344f2b466be6e3bf2614c8075313`; no lane implementation commit has yet been integrated in this refresh.

## Completed phase summary

- 0A–0C: schema/RLS/evidence foundation, bounded availability, browser-safe client, isolated booking preview.
- 1A–1C: atomic reservation/consent, Checkout/manual authorization, deferred holds and failed-hold recovery.
- 2A–2B: signed Daily attendance and deterministic settlement/capture/release.
- 3A–3B: cancellation/withdrawal, compliance delivery, My Lessons and immutable policy evidence.
- 4A–4C4: admin queue/evidence/disputes, launch health/readiness, retention/legal hold and provider staging.
- 4C5A–4C5Q: provider rehearsal/readiness, durable preview runs, resumable executor, terminal evidence/reconciliation/retention, cleanup review/attestation, launch-blocker snapshots and acknowledgement/handoff evidence.
- 4C5R–4C5S: notifier delivery evidence, trusted proof boundary and minimized escalation queue.
- 4C5T–4C5U: escalation claim/lease/retry/dead-letter lifecycle and bounded operator requeue review.
- 4C5V–4C5W: single-use requeue eligibility consumption, deterministic lineage and server-time activation.
- 4C5X–4C5Y: activation-scoped requeue claim/lease/terminal lifecycle and append-only expired-lease recovery evidence.
- 4C5Z: provider-neutral delivery-intent preparation tied to one exact current unexpired audited claim; no send or delivered assertion.
- 4C5AA: append-only terminal evidence when a prepared intent becomes unusable because its exact claim closes, lease expires, or blocker snapshot is superseded.
- **4C5AB (current): service-only no-send dispatch preflight plus exact stale-intent exclusion evidence.**

## Phase 4C5AB — complete and preview-applied

Verified engineering checkpoint: **`bcb8e3d87203128863db1cd80f51fdf1fe5a8eaf`**.

### Implemented

- Added `supabase/migrations/20260921173000_lesson_booking_phase4c5ab_requeue_dispatch_preflight.sql`.
- Added append-only, RLS-enabled, RPC-only evidence tables with collision-safe identifiers:
  - `lesson_booking_preview_requeue_dispatch_preflights`
  - `lesson_booking_preview_requeue_dispatch_exclusions`
- Added service-only RPC `service_prepare_booking_preview_launch_blocker_requeue_dispatch_preflight(bigint,text)`.
  - `SECURITY DEFINER`, `search_path=''`, direct grants revoked, EXECUTE only for `service_role`.
  - Revalidates the exact Phase Z intent and Phase X claim, later claim closure, PostgreSQL `statement_timestamp()` lease validity, Phase AA terminal evidence and the current authoritative blocker snapshot.
  - Stale evidence wins over replay. Exact safe replay converges; conflicting keys fail closed.
  - Ready state is explicitly `ready_no_send`; bounded exclusion reasons are `claim_closed`, `lease_expired`, and `snapshot_superseded`.
  - No external notifier HTTP, `delivered` assertion, provider/payment write, booking launch, blocker suppression, destructive cleanup or Cron-send authority is created.
- Added `scripts/lesson-booking-preview-requeue-dispatch-preflight.mjs`, `scripts/check-lesson-booking-preview-requeue-dispatch-preflight.mjs`, Phase AB SQL scenarios, and `.github/workflows/lesson-booking-phase4c5ab.yml`.
- Follow-up commits fixed identifier collisions in the Phase AB migration, regression and scenarios without weakening semantics.

### Verification

Exact-head GitHub Actions on `bcb8e3d87203128863db1cd80f51fdf1fe5a8eaf`:

- **Lesson booking Phase 4C5AB** run `35619219642`: **PASS**.
- **Lesson booking foundation** run `35619219647`: **PASS**.

The dedicated workflow rechecks the Phase AB JS boundary, Phase AA terminal-evidence boundary, applies the full migration chain to clean ephemeral PostgreSQL, runs the Phase AB SQL behavior scenarios, and builds the Vite application.

### Preview state

Supabase preview records the bounded migration as:

- **`20260921153119 / lesson_booking_phase4c5ab_requeue_dispatch_preflight`**

Post-apply read-only verification on `mrzzbhqzxshtbqvxkcjn`:

- Phase AB preflight rows: **0**.
- Phase AB exclusion rows: **0**.
- RLS enabled on both tables.
- Direct SELECT denied to both `authenticated` and `service_role` on both evidence tables.
- `authenticated` cannot execute the Phase AB RPC.
- `service_role` can execute the Phase AB RPC.
- RPC is `SECURITY DEFINER` with `search_path=""`.
- No synthetic preflight/exclusion row was inserted merely to exercise the shared preview database.

The existing 12 booking Edge Functions remain ACTIVE and were not redeployed for Phase AB: `create-booking`, `fix-payment`, `cancel-booking`, `create-video-token`, `check-in`, `booking-preview-readiness`, `booking-provider-preview-readiness`, `stripe-webhook`, `stripe-dispute-webhook`, `daily-webhook`, `place-holds`, `settle-lessons`.

## Supabase advisor refresh after Phase 4C5AB

Security advisor:

- **45** RLS-enabled/no-policy notices. The two Phase AB RPC-only evidence tables account for the expected increase from Phase AA. Direct table access is intentionally revoked; these notices are not being silenced blindly.
- **38** authenticated-callable `SECURITY DEFINER` findings, unchanged by Phase AB. These remain subject to role-check/intent review; Phase AB did not expand that surface.
- `btree_gist` remains installed in `public` and remains a review item.
- The previously corrected mutable `public.forbid_change()` search-path warning remains absent.

Performance advisor:

- **86** unindexed foreign-key opportunities.
- **32** unused-index notices.
- **1** multiple-permissive-policy warning on `profiles`.

The new Phase AB tables have zero rows and no production workload. Index/FK findings remain workload-driven hardening opportunities; no speculative index was added or removed merely to quiet the advisor.

## Base44 / `asmartparrot.com` mapping — proven

A fresh read of `https://asmartparrot.com/` returned the current Smart Parrot marketing homepage with the distinctive headline `Speak English. Unlock your future.` and the Programs / Locations / About / Admissions / Free Level Test navigation.

Connected Base44 source comparison:

- `Parrot Institute` (`695940b9a789c24bcec383ab`) contains the distinctive public phrase in `src/components/home/PremiumHomePage.jsx` (`titleAccent: "Unlock your future."`).
- `Smart Parrot Institute  (Copy)` (`69c16c52c86d161e74940243`) returned zero source matches for that phrase.

Therefore the current public `asmartparrot.com` content maps to **`Parrot Institute`**, not the Copy app. Full evidence is preserved in `docs/lesson-booking-base44-domain-map-2026-09-22.md`.

Release consequence: engineering remains in the user-selected GitHub copy repository, but public booking UI must be transplanted/integrated additively into the serving `Parrot Institute` Base44 app. Before publish, take a restorable Base44 checkpoint, prove the exact integrated production build and booking deep links, then smoke all existing homepage/navigation/language/program/location/admissions routes. Do not reassign the domain or publish the Copy app over the serving site. Stripe may remain disconnected at frontend publication, but the UI must fail closed and must not charge.

## External configuration still required for first provider-writing rehearsal

Actual provider-writing E2E remains fail-closed until the approved preview runtime has:

- runtime-only Supabase `sb_secret_...` backend credential;
- Stripe **TEST** secret key, exact expected test account ID, Checkout webhook signing secret and separate dispute-webhook signing secret, with accepted signed TEST deliveries;
- Daily preview API key, domain/webhook identity, room prefix, base64 HMAC and an ACTIVE signed webhook;
- safe short-lived preview student/admin sessions and explicit bounded provider/worker write gates.

A Stripe account connected inside Base44 does **not** transfer those server credentials to Supabase.

## Next integration slice

Do not extend the notification/requeue chain speculatively while parallel lanes are starting. The next serialized integration action is to ingest the first reviewed non-overlapping lane checkpoint in this order of practical launch value:

1. Frontend/Base44 compatibility against the now-proven serving `Parrot Institute` app, with additive route/publication readiness.
2. Provider secret-independent Stripe/Daily hardening/readiness contracts.
3. Supabase advisor/security hardening where a concrete semantic issue is proven.
4. Release lane exact-head deployability, serving-app checkpoint/rollback proof and public-route smoke plan.

After each lane integration, run focused regressions; once the integrated checkpoint is complete, require exact-head broad booking CI before any preview function deployment or Base44 publication.

## Release status

**NO DEFAULT-BRANCH MERGE. NO LIVE PAYMENT. NO COPY-APP OVERWRITE.** Phase 4C5AB is repository-complete, exact-head CI-verified and preview-applied. `asmartparrot.com` is now mapped to the serving `Parrot Institute` Base44 app, so the next release work can focus on an additive booking integration into that app rather than domain reassignment.