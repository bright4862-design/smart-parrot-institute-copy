# Lesson Booking Build Progress

Last updated: 2026-09-20

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy`
- Working branch: `agent/lesson-booking-blueprint`
- Draft PR: #16
- Base branch: `main` at `210345bbe09bc46c468fb6a7e0eee0596e8d902b`
- `main` remains untouched.
- Nothing from this branch has been deployed/published or applied to a live Supabase/Stripe/Daily environment.
- Stripe execution remains repository-locked to test-mode credentials/objects. Phase 2B introduces the first capture/release path, but `getStripe()` rejects non-`sk_test_` secrets and the worker rejects live Stripe objects.

## Architecture

- Base44/React remains the app shell.
- Supabase Postgres/Auth/RLS/Edge Functions/Cron owns booking, evidence, timing, payment state and settlement.
- Browser code may read safe catalog/availability data and invoke authenticated functions, but browser time, user identity, attendance time, tutor/price/policy fields and payment transitions are never authoritative.
- Stripe uses hold-before/capture-after. Near-term lessons authorize at Checkout; later lessons save the card and a secret-authenticated worker authorizes when due.
- Daily is the Phase 2 online attendance provider. Rooms are private and booking-scoped; meeting tokens carry the verified Supabase user UUID.

## Completed through Phase 2A

- Phase 0A: authoritative Supabase booking/payment/evidence schema, overlap exclusions, append-only evidence, RLS/least privilege, server-only Stripe identifiers/events.
- Phase 0B: immutable evidence hardening, project-specific Auth trigger, bounded `available_slots(...)` RPC backed by a private helper.
- Phase 0C: browser-safe Supabase publishable-key client, booking-scoped Auth, read-only availability adapter, isolated `/book-lessons` preview, frontend secret scanning.
- Phase 1A: atomic/idempotent server-authoritative reservation + consent; server-owned tutor/price/duration/currency/policy/hold strategy; database race protection.
- Phase 1B: Stripe test-only Checkout + signed/idempotent webhook. Near-term bookings authorize with manual capture; later bookings save the card with SetupIntent.
- Phase 1C: deferred test-only off-session holds, failed-hold evidence, customer-present recovery/3DS Checkout, policy-deadline cancellation and Stripe-aware stale Checkout cleanup. Cron activation remains documented but disabled.
- Phase 2A: signed/replay-safe Daily evidence, server-time fallback/QR check-in, private booking-scoped rooms/tokens, and no browser-authoritative attendance time.

## Phase 2B — deterministic settlement + test-only capture/release — complete in repository, not deployed

Verified engineering checkpoint: `0a941c90d01833550d06ecb38d519fda15b635b2`.

Implemented:

- migration `20260920090500_lesson_booking_phase2b_settlement.sql` adds a settlement lease/attempt/error state to bookings.
- `compute_lesson_settlement(...)` deterministically derives the outcome and amount from the booking's immutable policy version plus immutable attendance evidence.
- policy cases implemented: on-time, grace-edge, student late, student no-show, tutor late with pro-rata price, tutor no-show, tutor early-leave, and tutor leave-then-rejoin before the decision point.
- finished `hold_placed` lessons are claimed only after their policy's `capture_delay_minutes`; `FOR UPDATE SKIP LOCKED` prevents overlapping workers from claiming the same row at once.
- an `awaiting_settlement` lease older than ten minutes can be reclaimed so a crashed worker does not permanently strand the lesson.
- each claim increments `settlement_attempts`; finalization must present the matching attempt and stale attempts are rejected.
- `settle-lessons` is secret-authenticated and test-mode-only. It re-retrieves the PaymentIntent, verifies booking metadata, amount, currency and non-live mode before touching money.
- amount due `0`: cancel the uncaptured PaymentIntent and treat the full authorization as released.
- positive amount due: capture exactly the database-computed amount with `amount_to_capture` and `final_capture: true`; Stripe releases any unused authorization.
- Stripe calls use stable per-booking idempotency keys, while database lease/attempt guards and Stripe-state verification provide retry safety even beyond Stripe's idempotency cache lifetime.
- database finalization recomputes the amount after Stripe succeeds, verifies captured/released cents, writes captured/released/credit ledger evidence, and atomically moves the booking to `settled`.
- tutor no-show credit evidence is unique per booking.
- cron activation is documented in `supabase/cron/lesson_booking_phase2b.sql.example` but deliberately not activated.

### Executable behavioral coverage

CI now starts an ephemeral PostgreSQL 16 instance, applies every lesson-booking migration in order, and executes real SQL settlement scenarios. The scenario pack covers:

- student exactly at +5 minutes -> on-time price.
- student at +6 minutes -> late/standard price.
- absent student -> no-show/standard price.
- tutor at +6 minutes -> tutor-late pro-rata price.
- absent tutor -> zero charge.
- tutor leaves before student arrives -> tutor no-show/zero charge.
- tutor leaves then rejoins before student arrival -> normal student-late result.
- student exactly at the 15-minute cutoff -> late rather than no-show.
- tutor exactly at the 15-minute cutoff -> tutor-late rather than tutor no-show.
- claim/finalize path for a zero-charge tutor no-show -> full hold release + one service credit.
- repeated finalization -> idempotent and no duplicate settlement ledger evidence.

### Phase 2B verification

`Lesson booking foundation` run #98 passed on `0a941c90d01833550d06ecb38d519fda15b635b2`:

- Deno typecheck of Phase 2 Edge Functions, including `settle-lessons`: passed.
- database foundation invariants: passed.
- browser/auth boundary: passed.
- reservation/consent boundary: passed.
- Stripe Checkout/webhook boundary: passed.
- deferred hold/recovery boundary: passed.
- attendance/lesson-access boundary: passed.
- settlement boundary: passed.
- all migrations + executable PostgreSQL settlement scenarios: passed.
- full Vite application build: passed.

`Heathrow Piccadilly Compatibility` run #157 also passed on the same engineering head.

The first Phase 2B CI attempt used a Postgres service container and spent too long initializing it. The workflow was hardened to start the runner's ephemeral PostgreSQL directly. A second attempt then exposed two overly specific static string assertions; those assertions were corrected without weakening the behavioral test. Run #98 is the resulting green checkpoint.

## Research refreshed for Phase 2B on 2026-09-20

- Stripe's current manual-capture guidance requires an uncaptured PaymentIntent in `requires_capture`; partial `amount_to_capture` capture releases the remaining authorization, and most card payments permit one capture. The worker therefore computes once from database evidence, performs a final capture, and never tries to add a later surcharge.
- Stripe supports idempotency keys on POST operations, but the implementation does not rely on idempotency alone: it re-reads the PaymentIntent state and uses database settlement attempts because provider idempotency records are not a permanent database.
- Supabase currently documents scheduled Edge Function invocation with `pg_cron` + `pg_net`, and recommends keeping credentials in Vault. The repository ships activation examples only; no remote cron has been scheduled.
- Supabase secret keys remain server-only and never enter the browser bundle.

## Next coherent slice

Phase 3A — cancellation + withdrawal/compliance foundation:

1. add one server-authoritative cancellation function for student cancellation, tutor cancellation and voluntary withdrawal flows.
2. compute cancellation outcome/amount from the accepted policy version and server time; never trust a browser-supplied fee.
3. capture or release only the exact computed cancellation amount using the existing test-only Stripe boundary and retry-safe ledger pattern.
4. add policy page / acknowledgement evidence and durable-medium notification hooks without sending production mail.
5. verify the current France/EU legal basis for the 14-day service withdrawal flow and the scope of the newer online withdrawal-function requirement before encoding a legal claim in UI copy.
6. keep mediator details and final policy copy blocked on French consumer-law review.

## External configuration still needed for end-to-end integration testing

Repository engineering can continue without these, but provider integration cannot:

- a dedicated Smart Parrot Supabase preview/test project, or explicit approval of an existing safe project.
- preview `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- dedicated Supabase secret key for cron/service calls, stored in Vault.
- Stripe test/sandbox secret key and webhook signing secret.
- Stripe public Terms of Service URL for Checkout terms collection.
- Daily test account/domain, API key, webhook HMAC secret, and one preview delivery to verify the exact signature-header transport.
- before compliance launch: French consumer-law review and consumer mediator details.
