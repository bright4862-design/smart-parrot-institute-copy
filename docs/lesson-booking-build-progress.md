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
- Stripe Checkout is now implemented repository-side in **test mode only**: near-term reservations use `payment` mode with manual capture, later reservations use `setup` mode, and signed webhooks own the state transition into `hold_placed` or `card_saved`.
- No capture/settlement path exists yet. Attendance evidence and deterministic settlement remain later phases.

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

- `@supabase/supabase-js` pinned to `2.109.0`, with resolved lockfile synced.
- browser client reads only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` and fails closed unless the key is `sb_publishable_...`.
- booking-only Supabase Auth provider using `getSession`, `onAuthStateChange`, email magic links, and sign-out.
- existing Base44 auth remains untouched for pre-existing Smart Parrot routes.
- read-only availability adapter.
- isolated `/book-lessons` preview route.
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
- `dfca14bac17b47f40c963abaa3d31b201cb9f174` — CI returned to read-only permissions.

## Phase 1A — server-authoritative reservation + consent boundary — complete in repository, not deployed

Implemented:

- `bookings.client_request_id uuid` plus partial unique `(student_id, client_request_id)` idempotency index.
- service-role-only `public.create_booking_reservation(...)`, `SECURITY DEFINER`, pinned empty `search_path`.
- server re-reads active lesson type and latest policy; browser tutor/price/duration/currency/policy values are not accepted.
- exact slot recheck plus database exclusion constraints for the final concurrency race.
- server-owned maximum price and `at_checkout` vs `deferred` hold strategy.
- express-start acknowledgement for lessons inside 14 days.
- booking and immutable consent written in one Postgres transaction.
- exact retry returns the same reservation; request-id reuse for different intent is rejected.
- authenticated `create-booking` Edge Function derives `student_id` from verified claims and delegates privileged writes to the RPC.

Key Phase 1A commits:

- `b5a9f844853b105b2f826ff1334d29e30a8316c0` / `92681da5241c8f104bb131080ac242f328a6a30a` / `d54ee0228ff2b3939eb79dce9976f79e80acf27a` — reservation migration and SQL corrections.
- `01651790c6b572cea43e7e4551f275f2ad964e43` — authenticated `create-booking` Edge Function.
- `f5ee283c097ab8f9d3084dd367a6317508642830` — explicit JWT verification config.
- `f4ba11c9b0bdedc654ed853a8e08242d17e2ef2e` — pgTAP reservation coverage.
- `cd06d906f130c7c14d4bd1e05eb7a621ac284f8e` / `663deba6a75b31c5cba897c31bbb2a4afd3a9e7c` — reservation regression checker.
- `d6edd9b439fac5976ce14b6da7a62d7f0b21f904` — booking CI adds reservation verification.
- `ad118988f09646dce1211602b10fed472db83fe2` — foundation checker extended through Phase 1A.

## Phase 1B — Stripe test Checkout + signed webhook boundary — complete in repository, not deployed

Engineering checkpoint: `418630aa19b027c77dfbdfd8d9f04a7e26325316`.

Implemented:

### Checkout attachment and database safety

- adds `stripe_setup_intent_id`, `stripe_checkout_mode`, and `checkout_expires_at` to bookings.
- unique SetupIntent, Checkout-consent, and ledger Stripe-object boundaries prevent duplicate evidence/money-event rows.
- service-role-only `attach_booking_checkout(...)` attaches a Checkout Session to an existing reservation.
- the RPC derives the required mode from the server-owned hold strategy: `at_checkout -> payment`, `deferred -> setup`.
- the database refuses non-`cs_test_...` Checkout Session IDs, so enabling live payments requires a later explicit code change rather than a secret swap.

### Stripe server helper

- Stripe client is created only from `STRIPE_SECRET_KEY` and currently requires an `sk_test_...` key.
- Stripe Customers are created/reused server-side and linked in the private `stripe_links` table.
- Customer and Checkout creation use deterministic Stripe idempotency keys.
- no literal Stripe secret is committed.
- `APP_URL` and webhook-secret configuration fail closed when absent or malformed.

### Authenticated Checkout creation

`create-booking` now:

- still performs the atomic reservation transaction before any Stripe object is created.
- re-reads the reservation server-side before constructing Checkout.
- reuses an already-attached open Checkout Session instead of creating duplicates.
- uses `payment` mode + `capture_method: manual` + `setup_future_usage: off_session` for `at_checkout` bookings.
- uses `setup` mode for deferred holds so the payment method can be charged off-session later.
- limits the current implementation to cards.
- requires Stripe terms-of-service consent and records the specific policy/authorization text in server-created metadata/custom text.
- rejects any Stripe object that reports `livemode=true`.

### Signed/idempotent Stripe webhook

`stripe-webhook` now:

- runs with Supabase JWT verification disabled because Stripe authenticates the endpoint with `Stripe-Signature`.
- verifies the raw request body with Stripe before dispatching an event.
- rejects live Stripe events.
- stores raw event IDs in `stripe_events` and processes each successful event once; failed events retain `processed_at = null` for safe Stripe retry.
- validates Checkout booking/session/mode/policy identity against the server-owned booking row.
- requires recorded Stripe TOS acceptance and writes immutable Checkout consent evidence once.
- for completed payment-mode Checkout, requires a non-live PaymentIntent in `requires_capture`, records the manual authorization and `capture_before`, and transitions the booking to `hold_placed`.
- for completed setup-mode Checkout, requires a non-live successful SetupIntent, stores the saved payment method, and transitions the booking to `card_saved`.
- for expired Checkout, cancels only the matching still-pending reservation.
- does **not** capture funds; settlement is intentionally a later phase.

### Regression coverage

- `scripts/check-lesson-booking-stripe-boundary.mjs` enforces test-only Stripe configuration, manual authorization, server-owned mode selection, idempotency, raw-body signature verification, webhook state guards, and the explicit absence of capture logic.
- reservation regression coverage was retained while removing only the obsolete Phase 1A “no Stripe code” assertion.
- `Lesson booking foundation` CI now runs foundation, browser/auth, reservation/consent, Stripe Checkout/webhook, and full Vite-build checks.

## CI status

On Stripe engineering head `418630aa19b027c77dfbdfd8d9f04a7e26325316`:

- `Lesson booking foundation` push run #50 passed.
- `Lesson booking foundation` PR run #51 passed all stages, including the new Stripe Checkout/webhook boundary and full build.
- `Heathrow Piccadilly Compatibility` run #130 passed.
- `Game Smoke Test` run #201 reached the responsive-mobile evidence screenshot and timed out while taking a **full-page** WebGL screenshot; the application build, startup, desktop checks, canvas visibility, and artifact upload had already succeeded. This was a harness/evidence-capture failure, not a booking failure.

Harness repair commit `e6e40a9363c943adc4743d7f8e909b7d0dffc76c` changes smoke evidence to viewport-only WebGL screenshots, disables screenshot animations, and gives the smoke test a 60-second test budget. Its replacement smoke run #202 is the verification target for that harness repair.

The SQL pgTAP suite is committed but still requires a booted local/test Supabase Postgres project before it can be executed. No existing connected Supabase project has been repurposed because none can safely be identified as Smart Parrot.

## Research applied this run

Current official documentation was refreshed on 2026-09-20 before implementing Phase 1B:

- Supabase: authenticated browser-called Edge Functions should keep user auth/JWT verification; externally signed webhooks may disable Supabase JWT verification and verify the provider signature in code; Stripe webhook verification must use the raw request body.
- Supabase: server secrets remain Edge-Function-only; browser code continues to use only the publishable key.
- Stripe Checkout: `payment` mode supports one-time PaymentIntents, `setup` mode saves payment details for future charges, and `payment_intent_data.setup_future_usage = off_session` records future off-session intent.
- Stripe: Checkout exposes consent, PaymentIntent/SetupIntent, status, expiry, and livemode metadata needed for server verification and replay-safe webhook handling.
- France/EU: official French guidance still treats online service contracts as generally subject to a 14-day withdrawal period beginning at contract conclusion. The exact treatment of scheduled English lessons, no-shows, late-cancellation fees, and any exception remains lawyer-review territory before launch.

## Next coherent slice

Phase 1C — deferred off-session holds + failed-hold recovery:

1. add a cron-authenticated `place-holds` Edge Function for due `card_saved` bookings.
2. create test-mode off-session PaymentIntents with saved Customer/payment method, `confirm: true`, `off_session: true`, and manual capture.
3. persist `capture_before`, transition successful authorizations to `hold_placed`, and write one idempotent `hold_placed` ledger row.
4. map authentication-required/declined holds to `hold_failed` with one evidence row and no silent retry loop.
5. add authenticated `fix-payment` Checkout so the student can re-authorize with 3DS when needed.
6. auto-cancel still-unresolved `hold_failed` bookings at the policy deadline and clean abandoned pending Checkouts.
7. keep capture/settlement out of Phase 1C.

## External configuration still needed before end-to-end payment testing

Repository engineering can continue without these, but real Stripe/Supabase test-mode integration cannot:

- a dedicated Smart Parrot Supabase preview/test project, or an explicit instruction naming which existing Supabase project is safe to use.
- preview `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- server-side Supabase secret context for deployed Edge Functions.
- Stripe **test-mode** secret key and webhook signing secret.
- Stripe Dashboard public Terms of Service URL for Checkout terms collection.
- later: Daily test account/domain + webhook secret for attendance.
- before compliance launch: French consumer-law review and consumer mediator details.
