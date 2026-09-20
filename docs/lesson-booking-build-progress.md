# Lesson Booking Build Progress

Last updated: 2026-09-20

## Target

Repository: `bright4862-design/smart-parrot-institute-copy`

Working branch: `agent/lesson-booking-blueprint`

Draft PR: #16 — `Lesson booking foundation: Supabase schema, RLS and evidence contracts`

The default branch remains untouched. This work does not deploy, publish, configure live Stripe credentials, or make production data changes.

## Baseline refreshed this run

- Default branch: `main`
- Current `main`: `210345bbe09bc46c468fb6a7e0eee0596e8d902b`
- Booking branch is ahead of `main` and not behind it.
- Other open PRs remain #10 (Piccadilly platform foundation) and #11 (release hardening); both are drafts and unrelated to lesson booking.
- The booking branch continues to use its own narrow CI workflow and remains isolated from production.

## Research checkpoint

Official documentation checked on 2026-09-20 before Phase 0B:

- Supabase RLS: grants and policies must both be least-privilege; RLS should be enabled on exposed tables.
  https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Database Functions: prefer SECURITY INVOKER; when SECURITY DEFINER is required, pin `search_path` and schema-qualify relations. Function execution privileges should be explicitly revoked/granted.
  https://supabase.com/docs/guides/database/functions
- Supabase Auth user management: profile rows can be populated from an `auth.users` trigger, and trigger code must be tested because a failed trigger can block signups.
  https://supabase.com/docs/guides/auth/managing-user-data
- Supabase schemas/API security: custom schemas such as `private` are not reachable through the Data API unless explicitly exposed; internal helpers should stay outside the exposed API surface.
  https://supabase.com/docs/guides/database/tables
  https://supabase.com/docs/guides/api/securing-your-api
- Supabase frontend security: browser code should use a publishable key with RLS; secret/service-role keys must never be exposed in the frontend.
  https://supabase.com/docs/guides/database/secure-data
- Stripe manual capture remains the planned payment model for Phase 1: authorization now, deterministic partial capture later, with `capture_before` treated as the authoritative authorization deadline.
  https://docs.stripe.com/payments/place-a-hold-on-a-payment-method

Daily/video attendance and French/EU withdrawal implementation are later phases and were not changed in this run.

## Completed slice: Phase 0A — authoritative booking data boundary

Added:

- `supabase/migrations/20260920011000_lesson_booking_foundation.sql`
  - 11 booking/payment/evidence tables
  - `btree_gist` overlap protection
  - tutor and student double-booking exclusion constraints
  - append-only policy, attendance, consent and ledger evidence
  - Supabase Auth profile creation trigger
  - RLS enabled on every exposed table
  - explicit revoke-first / grant-back least-privilege model
  - no browser write grants for bookings, attendance, consents or ledger
  - Stripe identifiers and raw webhook records kept server-only
- `supabase/tests/lesson_booking_foundation_rls.test.sql`
- `scripts/check-lesson-booking-foundation.mjs`
- `.github/workflows/lesson-booking-foundation.yml`

### Phase 0A checkpoint commits

- Schema/RLS migration: `4d79bb36e66deead4defe4902115f6aba35d7378`
- pgTAP security contract: `b17a71b84a3f750ae921d3ad352b5cdfdc75b1ca`
- Repository contract test: `7ace617a9690d883d1f9f14cbf2245345fbd8a01`
- CI workflow: `80fb9f4c37e3994eb14d11de5d259e9187160037`

## Completed slice: Phase 0B — evidence hardening and safe slot discovery

Added `supabase/migrations/20260920033000_lesson_booking_phase0b_hardening_and_slots.sql`.

Hardening:

- Replaces cascading booking deletes on `attendance_events`, `consents`, and `ledger_entries` with `ON DELETE RESTRICT`, so dispute evidence cannot disappear because a booking is deleted.
- Replaces the generic `on_auth_user_created` trigger with `smart_parrot_booking_user_created`.
- Moves the trigger-only privileged signup helper into `private.smart_parrot_booking_handle_new_user()` with `SECURITY DEFINER` and `search_path = ''`.
- Removes the generic public `handle_new_user()` helper from the final schema state.

Slot discovery:

- Adds `private.smart_parrot_available_slots(...)`, a schema-qualified privileged helper that can inspect bookings without granting anonymous users direct booking-table access.
- Adds `public.available_slots(...)` as the exposed `SECURITY INVOKER` RPC.
- Bounds public slot queries to a maximum 31-day window to limit resource abuse.
- Keeps the 2-hour minimum booking lead time from the blueprint.
- Returns only slots fully contained in tutor availability.
- Excludes every slot overlapping a non-cancelled booking.
- Keeps anonymous users unable to select from `bookings` or Stripe tables directly.

Tests/verification were strengthened:

- pgTAP plan expanded from 15 to 21 assertions.
- Added explicit checks for evidence `ON DELETE RESTRICT` foreign keys.
- Added checks that the generic Auth trigger is gone and the project-specific trigger exists.
- Added checks that the privileged Auth helper and slot helper live in `private`.
- Added checks that the public slot RPC is `SECURITY INVOKER` and executable by `anon`/`authenticated`.
- Repository invariant checker now validates both migrations and the Phase 0B security boundary.

### Phase 0B checkpoint commits

- Hardening + slot migration: `dffdeb5707130d87d3b303a8ad83fab00222127c`
- pgTAP extension: `8ebed74b45fe07e3bcbe3f7c65daaad7c24336ed`
- Repository contract extension: `ef7b35c06a282d2b48f901bc151ffbe4cd9bd590`

## Verification

GitHub Actions `Lesson booking foundation` passed on branch head `ef7b35c06a282d2b48f901bc151ffbe4cd9bd590` (run #8). The job checked out the PR merge ref and successfully ran `node scripts/check-lesson-booking-foundation.mjs`.

The repository-wide `Game Smoke Test` is unrelated to the booking SQL slice. A previous run on the booking PR timed out during the Heathrow Playwright keyboard interaction even though install/build/start all passed; the current run is being observed separately and does not indicate a booking-schema failure.

The pgTAP suite is committed but still has not been executed against a booted local/test Supabase Postgres instance. No production Supabase project was touched.

## Next coherent slice

Phase 0C / Phase 1 entry:

1. Add the Supabase browser client using only `VITE_SUPABASE_URL` plus a publishable key environment variable; no secret key in frontend code.
2. Add Supabase Auth session integration for the booking routes while leaving the existing Smart Parrot site behavior intact.
3. Add a minimal booking-page data adapter that calls `available_slots` through `supabase.rpc` and contains no booking/payment mutation logic.
4. Add tests that fail if secret/service-role credentials are referenced in browser code.
5. After the browser/auth boundary is green, implement server-authoritative `create-booking`, consent capture, and the two Stripe Checkout paths with webhook idempotency before any capture path is enabled.

## Blockers requiring external configuration later

Not blocking repository engineering yet:

- Supabase test/preview project URL and publishable key.
- Supabase backend secret key for Edge Functions, stored only as a secret.
- Stripe test-mode secret and webhook signing secret.
- Daily test account/domain and webhook secret for attendance phase.
- French consumer-law review and consumer mediator details before compliance launch.
