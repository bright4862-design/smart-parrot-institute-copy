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

## Completed through Phase 1C

- Phase 0A: authoritative Supabase booking/payment/evidence schema, overlap exclusions, append-only evidence, RLS/least privilege, server-only Stripe identifiers/events.
- Phase 0B: immutable evidence hardening, project-specific Auth trigger, bounded `available_slots(...)` RPC backed by a private helper.
- Phase 0C: browser-safe Supabase publishable-key client, booking-scoped Auth, read-only availability adapter, isolated `/book-lessons` preview, frontend secret scanning.
- Phase 1A: atomic/idempotent server-authoritative reservation + consent; server-owned tutor/price/duration/currency/policy/hold strategy; database race protection.
- Phase 1B: Stripe test-only Checkout + signed/idempotent webhook. Near-term bookings authorize with manual capture; later bookings save the card with SetupIntent. No capture path.
- Phase 1C: deferred test-only off-session holds, failed-hold evidence, customer-present recovery/3DS Checkout, policy-deadline cancellation and Stripe-aware stale Checkout cleanup. Cron activation remains documented but disabled.

## Phase 2A — attendance evidence + lesson access — complete in repository, not deployed

Verified engineering checkpoint: `e6c4f6fec791f6fc763b4cbff1cd8e9153089d2e`.

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

`Lesson booking foundation` run #91 passed on `e6c4f6fec791f6fc763b4cbff1cd8e9153089d2e`:

- Deno typecheck of all new Phase 2A Edge Functions and their imports: passed.
- database foundation invariants: passed.
- browser/auth boundary: passed.
- reservation/consent boundary: passed.
- Stripe Checkout/webhook boundary: passed.
- deferred hold/recovery boundary: passed.
- attendance/lesson-access boundary: passed.
- full Vite application build: passed.

`Heathrow Piccadilly Compatibility` run #153 also passed on the same engineering head. The Deno check was deliberately scoped to the Phase 2A Edge Functions because the repository's unrelated Base44 dependency graph currently includes a non-npm dependency that Deno refuses to auto-install; the first all-function attempt correctly exposed that tooling incompatibility rather than an application type error.

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
