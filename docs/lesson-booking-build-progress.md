# Lesson Booking Build Progress

Last updated: 2026-09-22

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute` without explicit instruction).
- Canonical serialized integration branch: `agent/lesson-booking-blueprint`; draft PR #16.
- Verified integrated engineering head: **`0d04cb16c2f6fce21060cdf0f420731472b8f9ab`** (`test(db): route Phase AB scenarios through stable RPC`).
- Default branch refreshed during this run: **`main` advanced to `ce30e4d5aff73d44ce330247d389fb27fcd6793c`** via Base44 bot `Update base44 packages`; the one new commit changes only `package.json` / `package-lock.json`. It was observed, not merged/rebased into the booking branch.
- Current compare at the verified engineering head: **223 commits ahead / 16 behind `main`**, merge base `210345bbe09bc46c468fb6a7e0eee0596e8d902b`.
- No merge/rebase to default branch, live Stripe use, real customer billing, Stripe Connect, destructive cleanup, production Cron money transition, or production provider write occurred.
- Approved Supabase PREVIEW/TEST project only: `mrzzbhqzxshtbqvxkcjn`, `eu-west-1`, `https://mrzzbhqzxshtbqvxkcjn.supabase.co`; status after this run: **`ACTIVE_HEALTHY`**.
- Intended public frontend domain: `asmartparrot.com`. Public-content mapping remains proven to Base44 **`Parrot Institute`** app `695940b9a789c24bcec383ab`; the booking build sandbox remains **`Smart Parrot Institute (Copy)`** app `69c16c52c86d161e74940243`. Do not overwrite or reassign the serving site; integrate booking additively and preserve all existing public routes.

## Architecture lock

Base44/React remains the frontend. Supabase Postgres/Auth/RLS/Edge Functions/Cron remains source of truth for identity, booking/payment state, policy/consent evidence, attendance, settlement, provider readiness, reconciliation, retention and launch/ops evidence. No browser-authoritative money, time, attendance, provider, cleanup, launch or notification transition is allowed. Stripe remains hold-before/capture-after: setup mode for bookings 48h+ ahead and manual authorization/capture for near-term bookings. Daily remains server-evidence only. Marketplace/Stripe Connect remains deferred.

## Coordinated lane integration — 2026-09-22

This run serialized three independently verified, non-overlapping implementation lanes into `agent/lesson-booking-blueprint`.

### Provider lane integrated

Source lane: `agent/smart-parrot-provider-20260922` at **`09afbdcf771f76c7012520f83afb879af5f67ebb`**, PR #18.

- Exact-head lane foundation run `35721847664`: **PASS**.
- Reviewed scope was provider-only and contained no DB migration or frontend changes.
- Hardened Daily preview readiness now requires:
  - a valid local `DAILY_WEBHOOK_SECRET`;
  - exact HMAC equality against the remote Daily webhook configuration;
  - `participant.joined` and `participant.left` attendance subscriptions;
  - a supported Daily retry mode (`circuit-breaker` or `exponential`);
  - existing preview project/domain/room-prefix/provider gate checks.
- No provider write path was enabled.
- PR #18 was squash-integrated into the booking branch as **`0e6c394284dda235fc7ba871c0abbc47c138c354`**.

After the final integrated engineering SHA was green, `booking-provider-preview-readiness` alone was deployed to the approved preview project from the integrated source. It is now **ACTIVE version 2**, `verify_jwt=true`, deployment SHA-256 `bfaa3a49c4739d76b319731774d00c0795c5f6f972271bc90e16d874f65eac74`. No Stripe or Daily write was made.

### Frontend/Base44 lane integrated

Source lane: `agent/smart-parrot-frontend-20260922` at **`b4948aebee57ce855abd778e0b39982a0d988a09`**, PR #19.

- Exact-head lane foundation run `35722689027`: **PASS**.
- The lane was based on the prior integration head, so the reviewed non-overlapping files were transplanted serially rather than merging a stale branch wholesale.
- Added additive `/lesson-booking` hub route and `LessonBookingHub.jsx` without changing `/`, `/learn`, `/london`, `/level-4-cafe`, `/book-lessons` or `/my-lessons` semantics.
- Hub is visibly `TEST / preview`, states `Payments are not connected yet`, collects no card details, performs no Stripe/Daily/function write, and reports only browser-safe Supabase publishable-key configuration state.
- `scripts/check-lesson-booking-browser-boundary.mjs` now proves route coexistence, fail-closed payment messaging and absence of browser secrets/provider authority.
- Integration commits: `827f884270319938f65cf57dc2343f9c8bf44a70`, `5fe163456b9bee78159aa39d277ca06f6d184411`, `a985967e63a794d10034efc39561a067a159cba3`.

The GitHub frontend is ready as an additive booking surface, but **no public Base44 publication occurred in this run**. The serving `Parrot Institute` app must receive a restorable checkpoint and compatibility transplant/smoke pass before `asmartparrot.com` is changed.

### Supabase/DB lane integrated

Source lane: `agent/smart-parrot-supabase-20260922` at **`00d6d9fc9e4b9258c789466bfe26ca0d94791a47`**, PR #17.

- Exact-head lane foundation run `35726135848`: **PASS**.
- Reviewed scope remained migrations/tests only.
- Added stable <=63-byte service RPC alias `service_prepare_booking_preview_requeue_dispatch(bigint,text)` for Phase AB because PostgreSQL truncates identifiers beyond 63 bytes.
  - Alias is `SECURITY DEFINER`, `search_path=''`, EXECUTE only for `service_role`.
  - Direct `service_role` execution of the historical overlong/truncated RPC identifier is revoked.
  - The stable alias delegates to the existing authoritative Phase AB implementation; semantics remain fail-closed/no-send.
- Consolidated `profiles` SELECT RLS policies without changing visibility:
  - anon: tutor profiles only;
  - authenticated: own profile OR tutor profiles OR students booked with the signed-in tutor;
  - existing authenticated update-own policy remains separate.
- Added ephemeral behavioral regressions for exact visibility and RPC grants/forwarding.
- The two migrations are already present on preview as:
  - `20260922111940 / lesson_booking_phase4c5ab1_stable_dispatch_rpc`
  - `20260922121722 / lesson_booking_profiles_select_policy_consolidation`

The integrator also updated the Phase AB JS transport to call the stable alias and repaired the older Phase AB SQL scenario so service-facing behavior uses the alias while asserting the legacy overlong function is not directly executable by `service_role`.

## Exact integrated verification

First integrated attempt `68f0b2eef27260583fe3f5a8064f3586e14b6e93` correctly failed the dedicated Phase AB workflow because the historical SQL scenario still expected direct service-role access to the now-revoked overlong RPC. The JS boundary and migration application were already green. The failure was not bypassed; the stale scenario was updated to the intended short alias.

Final verified engineering SHA: **`0d04cb16c2f6fce21060cdf0f420731472b8f9ab`**.

- **Lesson booking Phase 4C5AB** run `35727122069`: **PASS**.
  - stable-alias JS boundary: pass;
  - Phase AA regression: pass;
  - full clean migration chain: pass;
  - Phase AB SQL behavior through the stable service RPC: pass;
  - application build: pass.
- **Lesson booking foundation** run `35727122070`: **PASS**.
  - Edge Function typechecks: pass;
  - all booking boundary checks: pass;
  - full clean migration + behavioral scenario suite: pass;
  - application build: pass.

This is the exact integrated source used for the provider-readiness v2 preview deployment.

## Supabase preview/advisor state after integration

Project `mrzzbhqzxshtbqvxkcjn` remains `ACTIVE_HEALTHY`.

Security advisor remains intentionally reviewed rather than silenced:

- **45** RLS-enabled/no-policy notices on server-only/RPC-only tables where direct browser/table access is intentionally revoked.
- **38** authenticated-callable `SECURITY DEFINER` findings; the integrated DB/provider/frontend work did not expand that count.
- `btree_gist` in `public` remains a review item.
- The prior mutable `public.forbid_change()` search-path warning remains absent.

Performance advisor after the profile-policy migration:

- **86** unindexed foreign-key opportunities.
- **32** unused-index notices.
- The previous `profiles` multiple-permissive-policy warning is **gone** after the policy consolidation.

No speculative indexes were added to empty evidence tables merely to silence advisor output.

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
- 4C5Z–4C5AA: provider-neutral delivery-intent preparation and immutable terminal evidence.
- 4C5AB/AB1: no-send dispatch preflight, exact stale-intent exclusions and stable external service RPC identifier.

## Base44 / `asmartparrot.com` release boundary

The public domain mapping remains proven:

- `asmartparrot.com` serves the `Parrot Institute` Base44 app `695940b9a789c24bcec383ab`.
- The GitHub build/source sandbox is the separate `Smart Parrot Institute (Copy)` app `69c16c52c86d161e74940243`.

Therefore do **not** point the domain to the Copy app or overwrite the serving app. Public booking launch sequence remains:

1. Refresh serving-app source and take a restorable Base44 checkpoint.
2. Transplant only the reviewed additive booking UI/config required by the serving app.
3. Verify a production build and no secret/provider-authority leakage.
4. Smoke the existing homepage/navigation/language/program/location/admissions routes plus booking deep links/reload/auth.
5. Publish only if those checks are green; keep payment UI fail-closed while Stripe/Daily provider readiness is blocked.

## External configuration still required for provider-writing E2E

Actual provider-writing E2E remains fail-closed until the approved preview runtime has:

- runtime-only Supabase `sb_secret_...` backend credential where required by the harness;
- Stripe **TEST** secret key, exact expected test account ID, Checkout webhook signing secret and separate dispute-webhook signing secret, with accepted signed TEST deliveries;
- Daily preview API key, domain/webhook identity, room prefix, exact base64 HMAC and an ACTIVE signed webhook;
- safe short-lived preview student/admin sessions and explicit bounded provider/worker write gates.

A Stripe account connected inside Base44 does **not** transfer these server credentials to Supabase. No live key is permitted.

## Next serialized integration slice

1. Let the release lane prepare the restorable checkpoint + exact compatibility diff for the **serving `Parrot Institute` app**, not the Copy app.
2. Integrate any new provider/DB/frontend lane commits only if they are based on/refreshed against this coordinated source and remain inside ownership boundaries.
3. Before public Base44 publication, require another exact integrated production build plus serving-app route smoke evidence.
4. Provider-writing rehearsal remains separately gated by TEST credentials/configuration; it does not block publishing the payment-disabled frontend.

## Release status

**INTEGRATED PREVIEW SOURCE GREEN. SUPABASE PREVIEW UPDATED. NO DEFAULT-BRANCH MERGE. NO PUBLIC BASE44 CHANGE. NO LIVE PAYMENT.** The next useful work is the additive serving-app Base44 compatibility/checkpoint path, not another speculative notifier phase.