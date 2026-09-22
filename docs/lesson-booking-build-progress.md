# Lesson Booking Build Progress

Last updated: 2026-09-22

## Current source and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute`).
- Canonical serialized integration branch: `agent/lesson-booking-blueprint`; draft PR #16.
- **Verified integrated engineering SHA:** `0d04cb16c2f6fce21060cdf0f420731472b8f9ab`.
- Default branch refreshed during this run: `main` advanced to `ce30e4d5aff73d44ce330247d389fb27fcd6793c` via Base44 bot `Update base44 packages`. That one new commit changes only `package.json` / `package-lock.json`; it was observed, not merged/rebased into the booking branch.
- At the verified engineering SHA the integration branch is **223 commits ahead / 16 behind `main`**, merge base `210345bbe09bc46c468fb6a7e0eee0596e8d902b`.
- Approved Supabase PREVIEW/TEST project: `Smart Parrot Supabase project`, ref `mrzzbhqzxshtbqvxkcjn`, `eu-west-1`, `https://mrzzbhqzxshtbqvxkcjn.supabase.co`; current state `ACTIVE_HEALTHY`.
- No default-branch merge/rebase, live Stripe key, real customer billing, Stripe Connect, destructive cleanup, production Cron money transition, or production provider write occurred.

## Architecture lock

Base44/React remains the frontend. Supabase Postgres/Auth/RLS/Edge Functions/Cron remains authoritative for identity, booking/payment state, policy/consent evidence, attendance, settlement, provider readiness, reconciliation, retention and operations evidence. No browser-authoritative money, time, attendance, provider, cleanup or launch transition is allowed. Stripe remains hold-before/capture-after: setup mode for bookings 48h+ ahead and manual authorization/capture for near-term bookings. Daily remains server-evidence only. Marketplace/Stripe Connect remains deferred.

## Coordinated lanes integrated this run

### Provider lane

Source `agent/smart-parrot-provider-20260922` at `09afbdcf771f76c7012520f83afb879af5f67ebb`, PR #18.

- Exact-head foundation run `35721847664`: PASS.
- Daily preview readiness now requires a valid local `DAILY_WEBHOOK_SECRET`, exact HMAC equality with Daily's webhook configuration, `participant.joined` + `participant.left`, supported retry mode (`circuit-breaker` or `exponential`), preview project/domain identity and preview-only room namespace.
- No provider write path was enabled.
- Squash-integrated into `agent/lesson-booking-blueprint` as `0e6c394284dda235fc7ba871c0abbc47c138c354`.

After the final integrated source was green, only `booking-provider-preview-readiness` was deployed to preview. It is now **ACTIVE version 2**, `verify_jwt=true`, deployment SHA-256 `bfaa3a49c4739d76b319731774d00c0795c5f6f972271bc90e16d874f65eac74`. No Stripe/Daily mutation was performed.

### Frontend/Base44 lane

Source `agent/smart-parrot-frontend-20260922` at `b4948aebee57ce855abd778e0b39982a0d988a09`, PR #19.

- Exact-head foundation run `35722689027`: PASS.
- Because the lane base was stale, reviewed non-overlapping files were transplanted serially rather than merging the branch wholesale.
- Added additive `/lesson-booking` hub, preserved existing Copy-app routes, and expanded browser-boundary checks.
- Hub is visibly `TEST / preview`, states `Payments are not connected yet`, collects no card details, performs no provider write, and exposes only browser-safe Supabase configuration status.
- Integration commits: `827f884270319938f65cf57dc2343f9c8bf44a70`, `5fe163456b9bee78159aa39d277ca06f6d184411`, `a985967e63a794d10034efc39561a067a159cba3`.

### Supabase/DB lane

Source `agent/smart-parrot-supabase-20260922` at `00d6d9fc9e4b9258c789466bfe26ca0d94791a47`, PR #17.

- Exact-head foundation run `35726135848`: PASS.
- Added stable <=63-byte service RPC `service_prepare_booking_preview_requeue_dispatch(bigint,text)` because PostgreSQL truncates longer identifiers.
- Alias is `SECURITY DEFINER`, `search_path=''`, service-role-only, delegates to the historical authoritative Phase AB implementation, and leaves the overlong/truncated function internal rather than service-callable.
- Consolidated `profiles` SELECT RLS without changing visibility: anon sees tutors; authenticated sees self, tutors, or students booked with the signed-in tutor; update-own remains separate.
- Added SQL regressions for exact visibility, forwarding and grants.
- Preview already contains:
  - `20260922111940 / lesson_booking_phase4c5ab1_stable_dispatch_rpc`
  - `20260922121722 / lesson_booking_profiles_select_policy_consolidation`

Integrator then updated the Phase AB JS client and historical SQL scenarios to use the stable RPC surface. The first integrated attempt correctly failed because the old SQL scenario still expected direct service-role access to the revoked overlong RPC; the stale regression was fixed rather than bypassed.

## Exact integrated verification

Final verified engineering SHA: **`0d04cb16c2f6fce21060cdf0f420731472b8f9ab`**.

- `Lesson booking Phase 4C5AB` run `35727122069`: **PASS**.
  - stable alias JS boundary: pass;
  - Phase AA regression: pass;
  - clean full migration chain: pass;
  - Phase AB SQL behavior through stable RPC: pass;
  - application production build: pass.
- `Lesson booking foundation` run `35727122070`: **PASS**.
  - Edge Function typechecks: pass;
  - booking boundary checks: pass;
  - clean migration + behavioral scenarios: pass;
  - application production build: pass.

This exact integrated source was used for the preview `booking-provider-preview-readiness` v2 deployment.

## Supabase advisor state

Security advisor after integration:

- 45 RLS-enabled/no-policy notices on intentionally server/RPC-only tables where direct access is revoked.
- 38 authenticated-callable `SECURITY DEFINER` findings; this checkpoint did not expand the count.
- `btree_gist` in `public` remains a review item.
- The previously corrected mutable `public.forbid_change()` search-path warning remains absent.

Performance advisor:

- 86 unindexed-FK opportunities.
- 32 unused-index notices.
- The former `profiles` multiple-permissive-policy warning is now **gone** after the RLS consolidation.

No speculative indexes were added merely to silence advisor output.

## Base44 / `asmartparrot.com` serving release state

The public domain mapping remains proven:

- `asmartparrot.com` serves Base44 **`Parrot Institute`** app `695940b9a789c24bcec383ab`.
- The GitHub booking build/sandbox is the separate **`Smart Parrot Institute (Copy)`** app `69c16c52c86d161e74940243`.

Release preparation advanced this run without publishing:

- Created restorable Base44 checkpoint **`6ab2752665c1001d5395d9aa`**.
- Checkpoint commit hash: **`ee404c2ece6ebd4ac63f2589e07660388e682a81`**.
- Checkpoint name: `Pre-booking integration checkpoint 2026-09-22 — preserve asmartparrot.com serving routes`.
- Serving app baseline `npm run build` passed (`vite build`, exit 0).
- Captured pre-change fingerprints:
  - `package.json`: `ab244c5097760facf51ba8eea227822ae6971504863bde4b93092ad5bb5bcdd3`
  - `package-lock.json`: `277b2ee8174f80f2cfc4d3c7e4620b005e6b1912abb0bb79de74449506208e27`
  - `src/App.jsx`: `2fbbdff94df530c257a69d0ce6a69ba12029e3f2ac89220cc727032765e0ec87`
- Serving app uses `src/pages.config.js` plus its own auth/layout/navigation routing. Therefore the Copy app's `src/App.jsx` must **not** be copied wholesale. Booking must be registered additively while preserving locale routing, `NavigationTracker`, auth behavior and placement-test aliases.
- Detailed rollback/compatibility evidence: `docs/lesson-booking-base44-serving-checkpoint-2026-09-22.md`.

No public Base44 code change or publish occurred in this run.

## Completed phase summary

- 0A–0C: schema/RLS/evidence foundation, bounded availability, browser-safe client, isolated booking preview.
- 1A–1C: reservation/consent, Checkout/manual authorization, deferred holds, failed-hold recovery.
- 2A–2B: signed Daily attendance and deterministic settlement/capture/release.
- 3A–3B: cancellation/withdrawal, compliance delivery, My Lessons, immutable policy evidence.
- 4A–4C4: admin/evidence/disputes, launch readiness, retention/legal hold, provider staging.
- 4C5A–4C5Q: provider rehearsal/readiness, preview executor, terminal/reconciliation/retention, cleanup attestation, launch-blocker evidence.
- 4C5R–4C5U: notifier proof/escalation and escalation lease/retry/dead-letter/review.
- 4C5V–4C5Y: requeue eligibility/lineage/activation/lease/expiry recovery.
- 4C5Z–4C5AA: provider-neutral delivery-intent preparation and immutable terminal evidence.
- 4C5AB/AB1: no-send dispatch preflight, exact stale-intent exclusion and stable external service RPC identifier.

## Provider-writing configuration still missing

Real provider-writing E2E remains fail-closed until preview has the required runtime server credential for the harness, Stripe **TEST** secret + expected test account ID + separate Checkout/dispute webhook signing secrets with accepted signed TEST deliveries, Daily preview API/domain/webhook/room-prefix/exact base64-HMAC configuration, safe short-lived preview sessions and explicit bounded provider/worker write gates. A Stripe account connected inside Base44 does not transfer those secrets to Supabase. Never use live keys.

## Next serialized slice

1. Frontend/Base44 lane should produce a **serving-app-specific** additive transplant based on checkpoint `6ab2752665c1001d5395d9aa`; do not replace the serving `src/App.jsx` architecture.
2. Integrate booking pages/config into `Parrot Institute` sandbox, then run build + no-secret checks + localized route/deep-link smoke tests against the checkpoint fingerprints.
3. Only after that compatibility pass may the release lane publish the payment-disabled booking frontend to `asmartparrot.com`.
4. Provider-writing rehearsal remains independently blocked on TEST credentials/configuration and does not block payment-disabled frontend publication.
5. Continue to ingest new lane commits only when refreshed against this coordinated source and inside ownership boundaries.

## Release status

**INTEGRATED PREVIEW SOURCE GREEN. SUPABASE PREVIEW UPDATED. BASE44 ROLLBACK CHECKPOINT CREATED. NO DEFAULT-BRANCH MERGE. NO PUBLIC BASE44 CHANGE. NO LIVE PAYMENT.**