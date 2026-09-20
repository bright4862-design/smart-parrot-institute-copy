# Lesson Booking Build Progress

Last updated: 2026-09-20

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy`
- Working branch: `agent/lesson-booking-blueprint`
- Draft PR: #16
- Base branch: `main` at `210345bbe09bc46c468fb6a7e0eee0596e8d902b`
- `main` is untouched by this work.
- Nothing in this branch has been deployed, published, migrated into a live Supabase project, or connected to live Stripe credentials.

## Architecture being implemented

- Base44/React remains the application shell.
- Supabase Postgres/Auth/RLS/Edge Functions/Cron is the authoritative booking, evidence, timing, and settlement layer.
- Browser code may read safe catalog/availability data and call authenticated Edge Functions; it never owns money/time transitions.
- Stripe will use hold-before/capture-after, but Stripe Checkout/PaymentIntent creation is deliberately not enabled until the reservation/consent boundary is stable.
- Attendance evidence and settlement remain later phases.

## Phase 0A — authoritative data boundary — complete

Implemented:

- 11 booking/payment/evidence tables.
- `btree_gist` tutor and student overlap exclusions.
- append-only policy, attendance, consent, and ledger evidence.
- RLS across exposed booking tables.
- revoke-first/grant-back client privileges.
- server-only Stripe identifiers and raw webhook records.
- pgTAP and repository-level security/invariant checks.

Key commits:

- `4d79bb36e66deead4defe4902115f6aba35d7378` — base schema/RLS.
- `b17a71b84a3f750ae921d3ad352b5cdfdc75b1ca` — initial pgTAP contract.
- `7ace617a9690d883d1f9f14cbf2245345fbd8a01` — repository invariant checker.

## Phase 0B — evidence hardening + safe slot discovery — complete

Implemented:

- `ON DELETE RESTRICT` for attendance/consent/ledger booking evidence.
- project-specific Supabase Auth trigger and private `SECURITY DEFINER` helper.
- bounded public `available_slots(...)` RPC with a private privileged helper.
- 31-day query cap, 2-hour booking lead, full availability containment, and non-cancelled-overlap filtering.
- anonymous users still cannot select booking or Stripe rows directly.

Key commits:

- `dffdeb5707130d87d3b303a8ad83fab00222127c` — Phase 0B migration.
- `8ebed74b45fe07e3bcbe3f7c65daaad7c24336ed` — pgTAP extension.
- `ef7b35c06a282d2b48f901bc151ffbe4cd9bd590` — repository contract extension.

## Phase 0C — browser-safe Supabase/Auth boundary — complete

Implemented:

- `@supabase/supabase-js` pinned to `2.109.0`, with resolved lockfile synced, because the repository still has a Node 20 smoke path and newer Supabase JS releases dropped Node 20 support.
- browser client reads only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` and fails closed unless the key is an `sb_publishable_...` key.
- booking-only Supabase Auth provider using `getSession`, `onAuthStateChange`, email magic links, and sign-out.
- existing Base44 auth remains untouched for pre-existing Smart Parrot routes.
- read-only availability adapter.
- isolated `/book-lessons` preview route that can authenticate/read availability but cannot create bookings or charge cards.
- browser credential scanner rejects secret/service-role Supabase references in frontend source.

Key commits:

- `f3e7dd2f694af8cd77ccc0f56752e496f1d2e523` — Supabase SDK dependency.
- `5f934f3a5a0eb45e3cd11d49554f01449e0a594d` — browser-safe client.
- `cb6dd2e6b4b677d1489f8cb1447c520af9b757be` — booking auth provider.
- `925deb6ab6fa82938442d9932f2ce6833199e6a2` — availability adapter.
- `8ba61af34ac57a590d109d4b4681cb939299f534` — preview page.
- `9bf7f74783a0fd877aec2ce4c3cf5bbf6b6d6d32` — `/book-lessons` route.
- `27560a6ae87f8f3a61a60e1e55af35c0cfaeb25d` — browser security regression.
- `0fd67fdb438191a550863fad79912bf24628ab85` — resolved lockfile sync.
- `dfca14bac17b47f40c963abaa3d31b201cb9f174` — CI returned to read-only permissions after lockfile generation.

## Phase 1A — server-authoritative reservation + consent boundary — complete in repository, not deployed

Implemented:

### Database transaction boundary

`supabase/migrations/20260920052500_lesson_booking_phase1a_reservation_rpc.sql` now:

- adds `bookings.client_request_id uuid`.
- adds a partial unique `(student_id, client_request_id)` index for idempotency.
- adds private response shaping so Stripe/payment identifiers are not returned.
- adds service-role-only `public.create_booking_reservation(...)` as a pinned-search-path `SECURITY DEFINER` RPC.
- re-reads active lesson type and latest policy from Postgres; browser-provided tutor, price, duration, currency, or policy values are never accepted.
- re-checks an exact slot against the private availability authority.
- relies on database exclusion constraints for the final concurrent tutor/student overlap race.
- converts overlap races to `slot_taken`.
- computes the standard/max price from server-owned lesson price + policy surcharge.
- chooses `at_checkout` vs `deferred` hold strategy from the server-owned policy.
- enforces the express-start acknowledgement for lessons within 14 days.
- writes the booking and immutable consent inside one Postgres function transaction.
- returns the original reservation for an exact idempotent retry and rejects reuse of the same key for different intent.
- does not call Stripe.

### Authenticated Edge Function

`supabase/functions/create-booking/index.ts` now:

- uses the current `@supabase/server` `withSupabase({ auth: 'user' })` pattern.
- derives `student_id` only from verified `ctx.userClaims.id`.
- validates only user-owned request inputs: lesson type id, start time, request id, and express-start acknowledgement.
- delegates the privileged atomic write to `ctx.supabaseAdmin.rpc('create_booking_reservation', ...)`.
- maps slot races/unavailability to HTTP 409, missing express-start acknowledgement to 422, missing lesson type to 404, and policy configuration failures to a sanitized 503.
- contains no Stripe code and does not split booking/consent into separate Edge Function writes.
- `supabase/config.toml` explicitly keeps `verify_jwt = true` for `create-booking`.

### Regression coverage

- pgTAP plan expanded to 26 assertions, including idempotency column/index and server-only reservation RPC privileges.
- `scripts/check-lesson-booking-reservation-boundary.mjs` verifies atomic consent, idempotency, server-authoritative price/policy/tutor identity, auth gating, stable error mapping, and absence of Stripe.
- booking CI runs database invariants, browser boundary, reservation boundary, and the full Vite build.

Key Phase 1A commits:

- `b5a9f844853b105b2f826ff1334d29e30a8316c0` / `92681da5241c8f104bb131080ac242f328a6a30a` / `d54ee0228ff2b3939eb79dce9976f79e80acf27a` — reservation migration and SQL corrections.
- `01651790c6b572cea43e7e4551f275f2ad964e43` — authenticated `create-booking` Edge Function.
- `f5ee283c097ab8f9d3084dd367a6317508642830` — explicit JWT verification config.
- `f4ba11c9b0bdedc654ed853a8e08242d17e2ef2e` — pgTAP reservation coverage.
- `cd06d906f130c7c14d4bd1e05eb7a621ac284f8e` / `663deba6a75b31c5cba897c31bbb2a4afd3a9e7c` — reservation regression checker.
- `d6edd9b439fac5976ce14b6da7a62d7f0b21f904` — booking CI adds reservation verification.
- `ad118988f09646dce1211602b10fed472db83fe2` — foundation checker extended through Phase 1A.

## CI status

On engineering head `d54ee0228ff2b3939eb79dce9976f79e80acf27a`:

- `Lesson booking foundation` run #46 passed dependency install, database invariant checks, browser/auth checks, reservation/consent checks, and the full Vite build.
- `Heathrow Piccadilly Compatibility` run #126 passed.
- The repository-wide game smoke harness previously failed because local Base44 emitted `HTTPException: App not found` while no Base44 app id is configured in CI. The harness was patched on this branch to ignore that specific expected local Base44 condition while still failing on other browser errors; its rerun was still in progress when this checkpoint was written.

The SQL pgTAP suite is committed but still requires a booted local/test Supabase Postgres project before it can be executed. No existing connected Supabase project was repurposed because none can safely be identified as Smart Parrot.

## Research applied this run

Current Supabase documentation was rechecked on 2026-09-20:

- authenticated Edge Functions should use `@supabase/server` with `withSupabase({ auth: 'user' })`; `ctx.supabaseAdmin` is the privileged service-role client.
- browser function invocation uses the signed-in user JWT and keeps platform JWT verification enabled.
- `withSupabase` handles browser CORS/preflight automatically.
- publishable keys are browser-safe; secret/service-role keys remain server-only.

Stripe manual capture remains the approved next payment design, but no Stripe payment path was added in Phase 1A.

## Next coherent slice

Phase 1B — Stripe test-mode Checkout and hold setup, after a safe Smart Parrot test Supabase target exists:

1. create Checkout in `payment` mode with `capture_method: manual` for lessons inside the hold-lead window.
2. create Checkout in `setup` mode for later lessons.
3. create/reuse Stripe Customer server-side and keep all Stripe identifiers server-only.
4. persist Checkout session id and mandate/consent evidence with idempotency.
5. add signed Stripe webhook handling for `checkout.session.completed` / expired events before any capture logic.
6. add failed-hold recovery only after webhook idempotency tests are green.

## External configuration still needed before live integration tests

Repository engineering can continue without these, but end-to-end payment testing cannot:

- a dedicated Smart Parrot Supabase preview/test project, or an explicit instruction naming which existing Supabase project is safe to use.
- preview `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- server-side Supabase secret context for deployed Edge Functions.
- Stripe **test-mode** secret + webhook signing secret.
- Daily test account/domain + webhook secret for the attendance phase.
- French consumer-law review and consumer mediator details before compliance launch.
