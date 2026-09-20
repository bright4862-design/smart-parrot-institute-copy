# Lesson Booking Build Progress

Last updated: 2026-09-20

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy`
- Working branch: `agent/lesson-booking-blueprint`
- Draft PR: #16
- Base branch: `main` at `210345bbe09bc46c468fb6a7e0eee0596e8d902b`
- `main` remains untouched.
- Nothing from this branch has been deployed/published or applied to a live Supabase/Stripe/Daily environment.
- No live Stripe key/object is allowed and no `PaymentIntent.capture(...)` path exists yet.

## Architecture

- Base44/React remains the app shell.
- Supabase Postgres/Auth/RLS/Edge Functions/Cron owns booking, evidence, timing, payment state and later settlement.
- Browser code may read safe catalog/availability data and invoke authenticated functions, but browser time, user identity, attendance time, tutor/price/policy fields and payment transitions are never authoritative.
- Stripe is repository-locked to test mode. Near-term lessons authorize at Checkout; later lessons save the card and use a secret-authenticated worker to authorize when due.
- Daily is the Phase 2 online attendance provider. Rooms are private and booking-scoped; meeting tokens carry the verified Supabase user UUID.

## Completed

### Phase 0A — authoritative data boundary

- 11 booking/payment/evidence tables.
- tutor/student overlap exclusions with `btree_gist`.
- append-only policy, attendance, consent and ledger evidence.
- RLS + revoke-first least privilege.
- server-only Stripe identifiers and webhook records.

### Phase 0B — evidence hardening + availability

- dispute evidence FKs use `ON DELETE RESTRICT`.
- project-specific Auth trigger lives in the private schema.
- bounded public `available_slots(...)` RPC backed by a private helper.
- 31-day query cap, two-hour lead time, full availability containment and overlap filtering.

### Phase 0C — browser-safe Supabase/Auth boundary

- `@supabase/supabase-js` pinned.
- browser accepts only `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`.
- booking-only Supabase Auth provider leaves existing Base44 auth untouched.
- read-only availability adapter and isolated `/book-lessons` preview route.
- frontend secret scanner rejects service/secret credentials.

### Phase 1A — server-authoritative reservation + consent

- per-student UUID idempotency.
- service-role-only atomic reservation + consent RPC.
- server owns tutor, duration, price, currency, policy and hold strategy.
- exact slot recheck plus database overlap constraints.
- EU express-start acknowledgement captured when required.

### Phase 1B — Stripe test Checkout + signed webhook

- Stripe helper refuses live secrets/objects/events.
- server-only Stripe Customer creation/reuse.
- near-term Checkout uses payment mode + manual capture authorization.
- later Checkout uses setup mode for a future off-session hold.
- signed raw-body webhook is idempotent and records consent/hold state.
- no capture path.

### Phase 1C — deferred holds + failed-hold recovery

- secret-authenticated `place-holds` worker creates test-only off-session manual-capture PaymentIntents.
- Stripe idempotency + database status/attempt guards converge overlapping workers.
- success requires exact server-owned amount/currency/customer, `requires_capture`, and Stripe `capture_before`.
- failed/authentication-required holds become `hold_failed` with append-only evidence.
- authenticated `fix-payment` provides customer-present recovery/3DS Checkout.
- recovery completion is owned by the signed Stripe webhook.
- policy-deadline cancellation and Stripe-aware stale Checkout cleanup are implemented.
- cron activation is documented but deliberately not enabled.

## Phase 2A — attendance evidence + lesson access — complete in repository, not deployed

Engineering checkpoint: `3cc4651c270a06a043e7e820c9ca4e36fa237e3c`.

Implemented:

- migration `20260920080500_lesson_booking_phase2a_attendance_evidence.sql` adds service-role-only attendance writers and a booking-scoped room identity constraint.
- Daily and fallback evidence is admitted only for confirmed `hold_placed` lessons and only from `start - 30 minutes` through lesson end.
- actor identity is derived from the booking's student/tutor UUIDs; callers cannot choose an actor label.
- Daily event replay is deduplicated on provider event id and conflicting reuse of an event id is rejected.
- `record_server_check_in(...)` uses PostgreSQL `clock_timestamp()`; no browser-authored attendance time is accepted.
- app-button and QR check-ins use a deterministic 30-second replay bucket; QR evidence is student-only.
- `create-video-token` is authenticated-user-only and available only to a participant in a confirmed booking during the lesson access window.
- Daily rooms are private, named exactly by booking UUID, bounded by lesson times, and configured to eject at expiry.
- Daily meeting tokens carry the verified Supabase `user_id`, room name, role (`is_owner` for tutor), not-before and expiry times.
- `daily-webhook` is externally reachable only because Daily cannot send a Supabase JWT; it authenticates the raw request with the configured HMAC before JSON parsing.
- participant.joined uses Daily `joined_at`; participant.left derives provider event time from `joined_at + duration`.
- rotating QR tokens are HMAC-SHA256 signed, booking-bound, 30-second scoped, and accept only the current/previous window.
- `create-video-token` and `check-in` keep Supabase JWT verification enabled; `daily-webhook` uses provider-HMAC authentication.
- no settlement or Stripe capture is introduced by Phase 2A.

### Phase 2A verification

`Lesson booking foundation` run #83 passed on `3cc4651c270a06a043e7e820c9ca4e36fa237e3c`:

- database foundation invariants: passed.
- browser/auth boundary: passed.
- reservation/consent boundary: passed.
- Stripe Checkout/webhook boundary: passed.
- deferred hold/recovery boundary: passed.
- attendance/lesson-access boundary: passed.
- full Vite application build: passed.

## Research refreshed for Phase 2A on 2026-09-20

- Daily's current meeting-token API supports `room_name`, `user_id`, `user_name`, `is_owner`, `nbf`, `exp` and `eject_at_token_exp`; Phase 2A uses those fields to bind access to the verified booking participant and lesson window.
- Daily's room API supports private rooms with `nbf`, `exp` and `eject_at_room_exp`; room name is fixed to the booking UUID.
- Daily's current participant webhook payloads expose the booking room, token-provided `user_id`, provider `session_id`, `joined_at`, and (for participant.left) `duration`.
- Daily's webhook API accepts an `hmac` secret used to verify webhook signatures. The public reference confirms the HMAC facility but does not currently document the exact delivery-header encoding in the same detail as the event schemas. The repository follows the blueprint's `X-Webhook-Timestamp` + `X-Webhook-Signature` / HMAC-SHA256 contract and keeps deployment gated until a Daily preview webhook confirms the exact transport format.
- Supabase's current Edge Function guidance says authenticated user functions should use `withSupabase({ auth: 'user' })` with JWT verification, while external signed webhooks use `auth: 'none'`, `verify_jwt = false`, and provider signature verification inside the handler.

## Next coherent slice

Phase 2B — deterministic settlement, still test-only:

1. implement deterministic `compute_settlement(...)` from immutable attendance + accepted policy version.
2. cover on-time, grace-edge, late, no-show, tutor-late, tutor-no-show/early-leave and cancellation outcomes with executable database scenarios.
3. claim finished `hold_placed` lessons safely and compute the final amount exactly once.
4. add a Stripe **test-mode-only** capture/release boundary using the already-authorized PaymentIntent and exact computed amount.
5. write captured/released/credit ledger evidence once and preserve retry safety.
6. keep production deployment/live keys blocked.

## External configuration still needed for end-to-end integration testing

Repository engineering can continue without these, but provider integration cannot:

- a dedicated Smart Parrot Supabase preview/test project, or explicit approval of an existing safe project.
- preview `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- dedicated Supabase secret key for cron/service calls, stored in Vault.
- Stripe test/sandbox secret key and webhook signing secret.
- Stripe public Terms of Service URL for Checkout terms collection.
- Daily test account/domain, API key, webhook HMAC secret, and one preview delivery to verify the exact signature-header transport.
- before compliance launch: French consumer-law review and consumer mediator details.
