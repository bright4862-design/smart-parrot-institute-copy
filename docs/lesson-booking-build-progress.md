# Lesson Booking Build Progress

Last updated: 2026-09-20

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy`
- Working branch: `agent/lesson-booking-blueprint`
- Draft PR: #16
- Base branch: `main` at `210345bbe09bc46c468fb6a7e0eee0596e8d902b`
- `main` is untouched by this work.
- Nothing on this branch has been deployed, published, migrated into a live Supabase project, connected to live Stripe credentials, or allowed to capture funds.

## Architecture being implemented

- Base44/React remains the application shell.
- Supabase Postgres/Auth/RLS/Edge Functions/Cron is the authoritative booking, evidence, timing, payment-state, and later settlement layer.
- Browser code may read safe catalog/availability data and call authenticated Edge Functions; browser time and browser-supplied money fields never own a payment transition.
- Stripe is repository-locked to test mode. Near-term lessons authorize at Checkout; later lessons save the card and now have a cron/service path that places the manual-capture authorization when due.
- Signed Stripe webhooks remain the authority for customer-present Checkout completion.
- Capture/settlement still does not exist. Phase 2 will add attendance evidence first, then deterministic settlement.

## Completed foundations

### Phase 0A — authoritative data boundary

- 11 booking/payment/evidence tables.
- tutor/student overlap exclusions using `btree_gist`.
- append-only policy, attendance, consent, and ledger evidence.
- RLS and revoke-first/least-privilege grants.
- server-only Stripe identifiers and raw webhook records.

### Phase 0B — evidence hardening + safe availability

- booking evidence FKs use `ON DELETE RESTRICT`.
- project-specific Supabase Auth trigger moved into a private schema.
- bounded public `available_slots(...)` RPC backed by a private helper.
- 31-day query cap, two-hour booking lead, full availability containment, and overlap filtering.

### Phase 0C — browser-safe Supabase/Auth boundary

- `@supabase/supabase-js` pinned and lockfile resolved.
- browser client accepts only `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` and rejects non-`sb_publishable_...` keys.
- booking-only Supabase Auth provider; existing Base44 auth is untouched.
- read-only availability adapter and isolated `/book-lessons` preview route.
- browser secret scanner rejects secret/service-role Supabase material in frontend source.

## Phase 1A — server-authoritative reservation + consent — complete in repository

Implemented:

- per-student UUID request idempotency.
- service-role-only `create_booking_reservation(...)` transaction.
- server re-reads active lesson type and current policy; client cannot choose tutor, price, duration, currency, policy, or hold strategy.
- exact slot recheck plus exclusion constraints for the final race.
- server-owned `at_checkout` versus `deferred` hold strategy.
- express-start acknowledgement inside the EU 14-day window.
- booking + immutable consent written atomically.
- authenticated `create-booking` derives student identity from verified Supabase claims.

## Phase 1B — Stripe test Checkout + signed webhook — complete in repository

Engineering checkpoint: `418630aa19b027c77dfbdfd8d9f04a7e26325316`.

Implemented:

- Stripe helper requires an `sk_test_...` secret and rejects live Stripe objects/events independently.
- Stripe Customer creation/reuse remains server-only and idempotent.
- near-term bookings use Checkout `payment` mode with `capture_method: manual` and `setup_future_usage: off_session`.
- deferred bookings use Checkout `setup` mode to save the payment method.
- Checkout requires terms acceptance and carries the server-owned policy/authorization text.
- signed raw-body Stripe webhook is idempotent through `stripe_events`.
- payment-mode completion must produce a non-live PaymentIntent in `requires_capture` before transition to `hold_placed`.
- setup-mode completion must produce a non-live successful SetupIntent before transition to `card_saved`.
- Checkout consent and hold ledger evidence are written once.
- initial abandoned Checkout expiry cancels only the matching still-pending reservation.
- no capture path exists.

## Phase 1C — deferred off-session holds + failed-hold recovery — complete in repository, not deployed

Engineering head: `08d9bb16ce716d933fa3244e2989cd3ca953b21c`.

### Database recovery state

Migration `20260920070500_lesson_booking_phase1c_deferred_holds.sql` adds:

- `hold_recovery_checkout_session_id` and server-recorded expiry.
- monotonic `hold_recovery_attempts`, used as the recovery Checkout idempotency generation.
- latest hold error code/time as operational state; immutable failure detail remains in the append-only ledger.
- a database check that refuses non-`cs_test_...` recovery Checkout IDs.
- service-role-only `attach_hold_recovery_checkout(...)` and exact compare-and-clear `clear_expired_hold_recovery_checkout(...)` RPCs.

### Cron/service hold worker

`supabase/functions/place-holds/index.ts` now:

- is service-to-service only: `withSupabase({ auth: 'secret' })` with platform JWT verification disabled for the function.
- selects only due `card_saved` bookings whose server-owned `hold_due_at` has passed.
- creates a Stripe PaymentIntent with the saved Customer/payment method using `off_session: true`, `confirm: true`, card-only payment method, and `capture_method: manual`.
- uses deterministic idempotency key `smart-parrot-deferred-hold-<booking>-<attempt>` so overlapping cron runs converge on one Stripe intent.
- independently rejects live PaymentIntents.
- verifies `requires_capture`, exact amount, currency, customer, and Stripe `capture_before` before marking the booking `hold_placed`.
- writes one `hold_placed` ledger entry for the successful authorization.
- maps declined/authentication-required/integrity failures to `hold_failed`, increments the attempt, stores operational error state, cancels any test PaymentIntent that should not remain active, and writes one append-only `hold_failed` evidence row.
- keeps concurrent workers safe with status + attempt compare-and-update guards.
- cancels still-unresolved `hold_failed` bookings only after the policy version's `hold_fix_deadline_hours` deadline.
- refuses to cancel behind a completed customer-present recovery Checkout; it leaves that case for the signed webhook retry.
- checks stale initial Checkout Sessions against Stripe before freeing the slot, avoiding a database-only timeout that could cancel behind a completed Checkout.

### Customer-present recovery

`supabase/functions/fix-payment/index.ts` now:

- requires a verified signed-in student.
- exposes recovery only for that student's `deferred` booking in `hold_failed`.
- reuses an existing open recovery Checkout and returns 202 for a completed one awaiting webhook processing.
- clears an expired recovery attachment before creating a replacement.
- creates test-only Checkout `payment` mode with manual capture, `setup_future_usage: off_session`, card-only payment method, policy/TOS text, and explicit `hold_recovery=true` metadata.
- uses `hold_recovery_attempts` in the Stripe idempotency key so an expired recovery Checkout can be replaced without reusing the old Stripe idempotency result.
- attaches the recovery session through the service-role-only database RPC.

### Recovery webhook hardening

The signed Stripe webhook now distinguishes the original Checkout attachment from a hold-recovery attachment:

- recovery completion requires the exact attached test Checkout, `payment` mode, `deferred` hold strategy, and `hold_recovery=true` metadata.
- Checkout customer identity is checked against server-side `stripe_links`.
- manual authorization verifies non-live `requires_capture`, exact amount/currency, and `capture_before`.
- successful recovery moves `hold_failed -> hold_placed`, stores the new PaymentIntent/payment method/deadline, clears operational error state, and appends one `hold_placed` ledger row.
- expired recovery Checkout clears only that recovery attachment so the student can retry; it does not cancel the booking by itself.
- initial expired Checkout retains the earlier pending-reservation cancellation behavior.
- no `PaymentIntent.capture(...)` exists anywhere in Phase 1C.

### Cron activation is deliberately gated

`supabase/cron/lesson_booking_phase1c.sql.example` documents the deploy-time activation without embedding credentials:

- `pg_cron` + `pg_net` invoke `place-holds` once per minute.
- project URL and Supabase secret key are read from Vault.
- the secret key is sent in the `apikey` header to match Supabase service-to-service `auth: 'secret'`.
- the example is not an automatically executed migration and must not be activated until a dedicated Smart Parrot preview/test Supabase project is explicitly approved.

### Phase 1C regression coverage

`scripts/check-lesson-booking-hold-recovery-boundary.mjs` enforces:

- service-role-only recovery RPCs and test-only recovery Checkout IDs.
- secret-authenticated cron worker and user-authenticated recovery function boundaries.
- off-session + confirm + manual-capture Stripe parameters.
- deterministic hold/recovery idempotency keys.
- state/attempt guards, successful/failure ledger evidence, deadline cancellation, and completed-Checkout safety checks.
- live-object rejection and exact Stripe amount checks.
- webhook recovery identity/state checks.
- Vault-based cron activation with no literal key.
- explicit absence of any Stripe capture call.

`Lesson booking foundation` run #68 passed on `08d9bb16ce716d933fa3244e2989cd3ca953b21c`, including foundation, browser/auth, reservation/consent, Stripe Checkout/webhook, Phase 1C deferred-hold recovery, and the full Vite build.

## Research applied for Phase 1C

Official documentation was refreshed on 2026-09-20 before implementation:

- Stripe manual capture: a PaymentIntent configured with `capture_method=manual` authorizes without capture and transitions to `requires_capture`; the authoritative card authorization deadline is `payment_method_details.card.capture_before`.
- Stripe authorization windows vary by network and transaction classification; Visa merchant-initiated card-not-present authorization is documented as 4 days 18 hours, reinforcing why the code persists Stripe's actual `capture_before` rather than assuming a fixed duration.
- Stripe future/off-session payments: SetupIntent/Checkout setup flows are appropriate for saving payment details for a later amount, and merchants must keep explicit consent covering timing and amount determination.
- Supabase: cron/worker calls should use service-to-service secret authentication; external webhooks remain provider-signature authenticated.
- Supabase: scheduled Edge Function invocation is supported through `pg_cron` + `pg_net`, with URL/credentials stored in Vault rather than job text.
- No Daily or Base44 runtime changes were required for this payment slice; their integration remains deferred until attendance/UI work.
- No new French/EU policy term was introduced by this slice. Existing launch gate remains lawyer review of withdrawal/no-show/late-cancellation wording and consumer-mediator details.

## CI status

Current verified booking engineering head:

- `08d9bb16ce716d933fa3244e2989cd3ca953b21c`
- `Lesson booking foundation` run #68: **passed**.
- all Phase 1C repository contract steps and Vite build: **passed**.

The pgTAP SQL suite remains committed but still needs a booted local/test Supabase Postgres project before it can execute. No existing connected Supabase project has been repurposed because none is explicitly approved as the Smart Parrot booking test environment.

## Next coherent slice

Phase 2A — attendance evidence + lesson access, before settlement:

1. add private Daily room/token creation for confirmed (`hold_placed`) bookings only.
2. add signed Daily webhook ingestion for participant join/leave evidence with replay deduplication.
3. add authenticated server-time `check-in` fallback and rotating signed QR check-in for in-person lessons.
4. enforce the evidence window (start - 30 minutes through lesson end) and actor/booking identity server-side.
5. add repository regressions for Daily signature verification, replay safety, QR expiry, server timestamps, and no browser-authored attendance time.
6. still do **not** capture or settle money in Phase 2A.

## External configuration still needed before end-to-end integration testing

Repository engineering can continue without these, but live service testing cannot:

- a dedicated Smart Parrot Supabase preview/test project, or an explicit instruction naming an existing safe project.
- preview `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- a dedicated Supabase secret API key for cron/service calls, stored in Vault.
- Stripe test/sandbox secret key and webhook signing secret.
- Stripe public Terms of Service URL for Checkout terms collection.
- Daily test account/domain, API key, and webhook signing secret for Phase 2A.
- before compliance launch: French consumer-law review and consumer mediator details.
