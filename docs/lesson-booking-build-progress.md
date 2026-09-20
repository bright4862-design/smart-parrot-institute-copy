# Lesson Booking Build Progress

Last updated: 2026-09-20

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy`
- Working branch: `agent/lesson-booking-blueprint`
- Draft PR: #16
- Base branch: `main` at `210345bbe09bc46c468fb6a7e0eee0596e8d902b`
- `main` remains untouched.
- Nothing from this branch has been deployed/published or applied to a live Supabase/Stripe/Daily environment.
- Stripe execution remains repository-locked to test-mode credentials/objects. `getStripe()` rejects non-`sk_test_` secrets, and payment workers reject live Stripe objects.

## Architecture

- Base44/React remains the app shell.
- Supabase Postgres/Auth/RLS/Edge Functions/Cron owns booking, evidence, timing, payment state and settlement.
- Browser code may read safe catalog/availability data and invoke authenticated functions, but browser time, identity, attendance time, tutor/price/policy fields, cancellation fees and payment transitions are never authoritative.
- Stripe uses hold-before/capture-after. Near-term lessons authorize at Checkout; later lessons save the card and a secret-authenticated worker authorizes when due.
- Daily is the online attendance provider. Rooms are private and booking-scoped; meeting tokens carry the verified Supabase user UUID.

## Completed phases

- **Phase 0A:** authoritative booking/payment/evidence schema, overlap exclusions, append-only evidence, RLS/least privilege, server-only Stripe identifiers/events.
- **Phase 0B:** immutable-evidence hardening, project-specific Auth trigger, bounded `available_slots(...)` RPC backed by a private helper.
- **Phase 0C:** browser-safe Supabase publishable-key client, booking-scoped Auth, read-only availability adapter, isolated `/book-lessons` preview, frontend secret scanning.
- **Phase 1A:** atomic/idempotent server-authoritative reservation + consent; server-owned tutor/price/duration/currency/policy/hold strategy; database race protection.
- **Phase 1B:** Stripe test-only Checkout + signed/idempotent webhook. Near-term bookings authorize with manual capture; later bookings save the card with SetupIntent.
- **Phase 1C:** deferred test-only off-session holds, failed-hold evidence, customer-present recovery/3DS Checkout, policy-deadline cancellation and Stripe-aware stale Checkout cleanup. Cron activation remains documented but disabled.
- **Phase 2A:** signed/replay-safe Daily evidence, server-time fallback/QR check-in, private booking-scoped rooms/tokens, and no browser-authoritative attendance time.
- **Phase 2B:** deterministic settlement derived from immutable policy + attendance evidence; retry-safe worker claims; exact test-only capture/release; atomic settlement ledger evidence and tutor-no-show credit.

## Phase 3A — cancellation + withdrawal/compliance foundation — complete in repository, not deployed

Verified engineering checkpoint: `5fdcbcc84fb5922193b10702651749f7212411d2`.

Implemented:

- `booking_cancellation_requests` is append-only server evidence containing actor, server request time, accepted policy version/hash, computed outcome/amount and payment action.
- `compliance_notice_outbox` queues the exact cancellation/withdrawal acknowledgement payload without pretending that an undelivered outbox row is itself a durable-medium acknowledgement.
- `prepare_booking_cancellation(...)` locks the booking and derives the student/tutor actor from the booking. It never accepts browser-supplied role, fee, policy, price or timing.
- student contractual cancellation reads the accepted policy version's `free_cancel_hours`, `late_cancel_hours` and `late_cancel_pct` and computes free / percentage / full standard-rate cancellation amounts server-side.
- tutor cancellation is zero-charge to the student.
- cancellation requests are idempotent; a different actor/kind cannot replace an existing cancellation request.
- `cancel-booking` is authenticated with `withSupabase({ auth: 'user' })` and uses only `ctx.userClaims.id` for identity.
- before freezing a cancellation amount, the server synchronizes an attached initial/recovery Stripe Checkout Session: an open session is expired, while a completed session returns a retry response so the signed Stripe webhook can first update authoritative payment state.
- zero due with an existing authorization releases it; positive due captures exactly the database-computed amount with `amount_to_capture` and `final_capture: true`; all Stripe execution remains test-mode-only.
- Stripe PaymentIntent ID, original amount, currency, booking metadata and non-live mode are re-verified before capture/release.
- provider result is verified before `finalize_booking_cancellation(...)`; database finalization checks the exact captured/released amounts, writes terminal ledger evidence and moves the booking to `cancelled` atomically.
- end-of-lesson settlement claims now exclude rows with `cancellation_requested_at`, preventing settlement and cancellation from racing for ownership.
- terminal `captured` / `hold_released` ledger entries are unique per booking/kind to prevent duplicate money evidence on retries.

### Withdrawal / France-EU fail-closed design

Current law was rechecked before implementation and recorded in `docs/lesson-booking-france-withdrawal-notes-2026-09-20.md`.

- the backend does **not** decide that a fixed-date English lesson definitely has, or definitely lacks, a 14-day withdrawal right.
- `withdrawal` is enabled only when the immutable accepted policy explicitly sets `withdrawal_mode: "service_14d"`; every other/default value (including `review_required`) fails closed with `withdrawal_not_enabled_for_policy`.
- `withdrawal_window_days` is policy-versioned (14 by default when that mode is deliberately enabled).
- Phase 3A supports only pre-start withdrawal. It deliberately does not implement the proportional post-start amount described by Code de la consommation L221-25.
- public withdrawal wording, classification under L221-28, consumer-mediator details and production acknowledgement delivery remain blocked on French consumer-law review.
- for online contracts where a withdrawal right applies, the June 19, 2026 L221-21/D221-5 online withdrawal-function requirement is treated as a launch requirement, not as optional UI polish.

### Phase 3A executable coverage

CI applies all booking migrations to ephemeral PostgreSQL 16 and runs real cancellation scenarios covering:

- student cancellation more than 24h ahead -> zero capture + full hold release.
- student cancellation 2–24h ahead -> 50% of standard rate captured + remainder released.
- student cancellation under 2h -> full standard rate captured.
- tutor cancellation -> zero charge + full hold release.
- explicitly policy-enabled withdrawal inside the window -> zero charge + release, idempotent request/finalization and exactly one withdrawal acknowledgement outbox row.
- expired withdrawal window -> rejected.
- policy still marked `review_required` -> withdrawal rejected fail-closed.
- exactly-once terminal ledger and cancellation acknowledgement evidence.

### Phase 3A verification

`Lesson booking foundation` run #104 passed on `5fdcbcc84fb5922193b10702651749f7212411d2`:

- Phase 2/3 Edge Function Deno typecheck, including `cancel-booking`: passed.
- database, browser/auth, reservation/consent, Stripe Checkout/webhook, deferred-hold/recovery, attendance/lesson-access and settlement regressions: passed.
- new cancellation/compliance boundary regression: passed.
- all migrations + executable settlement and cancellation PostgreSQL scenarios: passed.
- full Vite application build: passed.

`Heathrow Piccadilly Compatibility` run #161 also passed on the same engineering head. `Game Smoke Test` run #232 was still running when this checkpoint note was written; it does not gate the Phase 3A database/payment contract.

## Research refreshed for Phase 3A on 2026-09-20

- Stripe's current PaymentIntent API requires an uncaptured intent in `requires_capture`; `amount_to_capture` must not exceed the original amount and final capture releases the remainder. Canceling a `requires_capture` PaymentIntent releases its remaining capturable authorization.
- Supabase's current `@supabase/server` guidance keeps browser-invoked authenticated functions on `verify_jwt = true` + `auth: 'user'`; privileged worker calls use secret authentication and signed external webhooks use `auth: 'none'` with provider-signature verification.
- French Code de la consommation L221-25 requires an express request when a paid service starts within the withdrawal period and specifies proportional payment if withdrawal occurs after performance begins under the applicable conditions.
- L221-28 includes a fixed-date leisure-activity exception; whether a Smart Parrot English lesson falls inside that exception is treated as a legal classification question, not an engineering assumption.
- L221-21 and D221-5 have, since 19 June 2026, required an online withdrawal function for relevant online distance contracts, with visible/direct access, an unambiguous label, confirmation flow and durable-medium acknowledgement requirements.

## Next coherent slice

**Phase 3B — cancellation/withdrawal UX + policy/acknowledgement boundary:**

1. add authenticated “My lessons” data/UX with policy-derived cancellation preview from server data, never a browser-computed fee.
2. add a confirmation step for normal cancellation and a separately labelled withdrawal flow that only renders when the accepted policy explicitly enables it.
3. add a public versioned policy page sourced from immutable `policy_versions`.
4. expose acknowledgement status without marking a notice delivered until a real durable-medium provider confirms delivery.
5. add a delivery-worker contract, retry/alert state and tests without sending production email.
6. keep final France wording, mediator details and `service_14d` policy activation blocked on French consumer-law review.

## External configuration still needed for provider E2E

Repository engineering can continue without these, but provider integration cannot:

- a dedicated Smart Parrot Supabase preview/test project, or explicit approval of an existing safe project.
- preview `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- dedicated Supabase secret key for cron/service calls, stored in Vault.
- Stripe test/sandbox secret key and webhook signing secret.
- Stripe public Terms of Service URL for Checkout terms collection.
- Daily test account/domain, API key, webhook HMAC secret, and one preview delivery to verify the exact signature-header transport.
- before compliance launch: French consumer-law review, approved withdrawal classification/copy and consumer mediator details.
