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
- Booking branch remains ahead of `main` and not behind it.
- Draft PR #16 remains open and mergeable.
- Other open booking-unrelated draft work is left untouched.
- The booking branch continues to use its own CI workflow and remains isolated from production.

## Research checkpoint

Official/current references checked on 2026-09-20:

- Supabase API keys: browser code should use a publishable key; secret/service-role keys must stay server-side. Supabase is deprecating legacy anon/service-role keys by the end of 2026.
  https://supabase.com/docs/guides/getting-started/api-keys
- Supabase Auth: the browser client persists sessions by default; `getSession()` initializes the current session and `onAuthStateChange()` keeps UI state synchronized.
  https://supabase.com/docs/reference/javascript/auth-getsession
  https://supabase.com/docs/reference/javascript/auth-onauthstatechange
- Supabase Auth client initialization automatically handles redirect-based auth flows such as magic links when URL session detection is enabled.
  https://supabase.com/docs/reference/javascript/auth-initialize
- Current `@supabase/supabase-js` is newer than the repository's Node 20 smoke-test runtime. Supabase states Node 20 support ended after `2.109.0`, so this branch pins `2.109.0` instead of taking a newer incompatible SDK while the existing smoke workflow remains on Node 20.
  https://www.npmjs.com/package/@supabase/supabase-js
- Stripe manual capture remains the planned Phase 1 payment model; no Stripe secret, PaymentIntent creation, or capture path is added in Phase 0C.
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
- Repository invariant checker validates both migrations and the Phase 0B security boundary.

### Phase 0B checkpoint commits

- Hardening + slot migration: `dffdeb5707130d87d3b303a8ad83fab00222127c`
- pgTAP extension: `8ebed74b45fe07e3bcbe3f7c65daaad7c24336ed`
- Repository contract extension: `ef7b35c06a282d2b48f901bc151ffbe4cd9bd590`

## Completed slice: Phase 0C — browser-safe Supabase/Auth boundary

Added a booking-only browser integration without replacing or weakening the existing Base44 auth used by the rest of Smart Parrot.

### Browser client

- Added `@supabase/supabase-js` pinned to `2.109.0` for compatibility with the repository's existing Node 20 smoke workflow.
- Added `src/lib/lessonBookingSupabase.js`.
- Reads only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Fails closed if the key is missing or does not use the modern `sb_publishable_` format.
- Allows HTTPS hosted projects and localhost/127.0.0.1 HTTP only for local development.
- Enables session persistence, token refresh, and redirect-session detection.
- Does not expose a secret/service-role key path in browser code.

### Booking-only Supabase Auth

- Added `src/lib/LessonBookingAuthContext.jsx`.
- Initializes from `supabase.auth.getSession()`.
- Subscribes to `supabase.auth.onAuthStateChange()` and unsubscribes on teardown.
- Supports email magic-link sign-in via `signInWithOtp()` and Supabase sign-out.
- The provider is mounted only inside the `/book-lessons` subtree; the existing Base44 `AuthProvider` remains unchanged for all pre-existing app routes.

### Read-only availability adapter + preview route

- Added `src/lib/lessonBookingApi.js`.
- Validates lesson type UUID and date range before calling `rpc('available_slots', ...)`.
- Enforces the same 31-day maximum request window as the database.
- Contains no insert/update/upsert/delete, Edge Function invocation, Stripe, booking creation, or payment logic.
- Added `/book-lessons` as an isolated lazy-loaded preview route.
- The route can show Supabase auth state and available slots but explicitly cannot create a booking or charge a card.
- If preview Supabase environment variables are absent, the route fails closed with a configuration message instead of affecting the existing application.

### Regression guard and CI

Added `scripts/check-lesson-booking-browser-boundary.mjs`.

It verifies:

- the Supabase SDK stays pinned to the Node-20-compatible version while the smoke workflow remains on Node 20;
- only the publishable Vite environment variables are used in the browser client;
- session initialization, auth-state subscription, magic-link auth, and sign-out remain present;
- the availability adapter remains read-only and calls only `available_slots`;
- the `/book-lessons` route remains isolated from existing Base44 auth behavior;
- all `src/**/*.{js,jsx,ts,tsx}` files are scanned for browser references to `sb_secret_`, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or `VITE_*SECRET/SERVICE_ROLE*` credentials.

The `Lesson booking foundation` workflow now installs dependencies, runs both booking contract checkers, and builds the complete Vite application on Node 22. Run #18 passed all of those steps on branch head `1ee7946c66339aa370a6c7ecfd3c86167a5ef9fc`.

### Phase 0C checkpoint commits

- Supabase SDK dependency: `f3e7dd2f694af8cd77ccc0f56752e496f1d2e523`
- Browser-safe Supabase client: `5f934f3a5a0eb45e3cd11d49554f01449e0a594d`
- Booking-only auth provider: `cb6dd2e6b4b677d1489f8cb1447c520af9b757be`
- Read-only availability adapter: `925deb6ab6fa82938442d9932f2ce6833199e6a2`
- Isolated booking preview page: `8ba61af34ac57a590d109d4b4681cb939299f534`
- Booking route wiring: `9bf7f74783a0fd877aec2ce4c3cf5bbf6b6d6d32`
- Browser security regression guard: `27560a6ae87f8f3a61a60e1e55af35c0cfaeb25d`
- CI build + browser-boundary verification: `1ee7946c66339aa370a6c7ecfd3c86167a5ef9fc`

## Verification

- `Lesson booking foundation` run #18: passed database invariant checker, browser/auth boundary checker, and full Vite build.
- `Heathrow Piccadilly Compatibility` run #110 on the same head: passed.
- Repository-wide `Game Smoke Test` is still monitored separately because it exercises the pre-existing Heathrow Playwright interaction path rather than booking functionality.
- pgTAP remains committed but still needs execution against a booted local/test Supabase Postgres instance. No production Supabase project was touched.

Connected Supabase inspection found projects named `fixlist-testlab`, `bright4862-design's Project` (inactive), and `community-agent`; none can safely be assumed to be Smart Parrot. No project was created or repurposed.

## Next coherent slice

Phase 1A — server-authoritative booking creation and consent capture:

1. Add a Supabase Edge Function for `create-booking` using authenticated Supabase identity and an elevated server client only inside the function.
2. Re-read lesson type and latest policy server-side; never trust browser-provided prices, tutor id, duration, or policy version.
3. Re-check `available_slots`/overlap protection at write time and convert exclusion violations into a stable `slot_taken` response.
4. Persist the booking plus consent evidence before starting payment setup.
5. Add idempotency so repeated browser submits cannot create duplicate bookings.
6. Keep Stripe Checkout creation separate until the database booking/consent transaction has behavioral tests.
7. After that boundary is green, add Stripe test-mode Checkout: manual-capture payment flow for lessons inside 48 hours and Setup mode for later lessons.

## Blockers requiring external configuration later

Not blocking repository engineering yet:

- A dedicated Smart Parrot Supabase preview/test project, or an explicit instruction naming which existing Supabase project is safe to use.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the preview environment.
- Supabase backend secret key for Edge Functions, stored only as a server secret.
- Stripe test-mode secret and webhook signing secret.
- Daily test account/domain and webhook secret for attendance phase.
- French consumer-law review and consumer mediator details before compliance launch.
