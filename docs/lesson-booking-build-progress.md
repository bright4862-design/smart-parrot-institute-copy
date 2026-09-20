# Lesson Booking Build Progress

Last updated: 2026-09-20

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute` without explicit instruction).
- Working branch: `agent/lesson-booking-blueprint`.
- Draft PR: #16.
- Base/default branch at the start of this run: `main` at `210345bbe09bc46c468fb6a7e0eee0596e8d902b`.
- `main` remains untouched.
- Nothing from this branch has been merged, deployed, published, or applied to a live Supabase, Stripe, Daily, Base44, cron, or email environment.
- Stripe execution remains repository-locked to test/sandbox credentials and objects. Live Stripe credentials/objects remain inadmissible.
- Marketplace / Stripe Connect remains out of scope until the single-school path is stable.

## Architecture lock

- Base44/React is the application shell.
- Supabase Postgres/Auth/RLS/Edge Functions/Cron is authoritative for booking, identity, policy, evidence, time, payment state, cancellation, settlement, compliance, retention governance, provider-rehearsal readiness, and operations state.
- Browser time, identity, attendance time, tutor/price/policy fields, cancellation fees, payment transitions, compliance delivery, provider dispute state, retention decisions, provider-environment identity, provider-rehearsal readiness, and admin evidence decisions are never authoritative.
- Stripe uses hold-before/capture-after. Near-term lessons authorize at Checkout; later lessons save a payment method and a secret-authenticated worker authorizes when due.
- Daily supplies online attendance evidence. Rooms are private and booking-scoped; server/provider evidence remains separate from browser state.

## Completed phases

- **Phase 0A–0C:** authoritative schema/RLS/evidence foundation, bounded availability, browser-safe Supabase client, isolated booking preview.
- **Phase 1A–1C:** atomic booking/consent, Stripe test-only Checkout + manual authorization, deferred off-session holds, failed-hold evidence and customer-present recovery.
- **Phase 2A–2B:** signed/replay-safe Daily/server attendance evidence and deterministic test-only settlement/capture/release.
- **Phase 3A–3B:** server-authoritative cancellation/withdrawal foundation, compliance acknowledgement outbox, My Lessons UX, immutable policy view, retry/dead-letter handling.
- **Phase 4A–4C3:** admin review/evidence operations, test-only dispute intake, out-of-order dispute hardening, launch health/readiness, retention/legal-hold controls, preview-project identity protection, and provider-write-disabled preview E2E gate.
- **Phase 4C4:** separate provider identity/readiness checks, disposable test-provider rehearsal with deterministic cleanup, and audited retention-duration approval/revocation hooks.
- **Phase 4C5A:** append-only preview-rehearsal evidence registry, cleanup-reconciliation signals, reviewed retention approval/revocation UI, and launch-health rehearsal signals.
- **Phase 4C5B1:** server-authoritative recent-rehearsal readiness and minimized admin rehearsal history, including fail-closed stale/failed/latest-run and unresolved-cleanup gates.
- **Phase 4C5B2 (current checkpoint):** authenticated operator rehearsal history/reconciliation UX plus a separately gated, read-only full-preview-path preflight.

## Phase 4C5B2 — rehearsal operator UX + full-preview-path preflight — complete in repository, not deployed

Verified engineering checkpoint: `0317beee964104aa0b570cd186471f433d323a10`.

### Implemented

- Added `src/lib/lessonBookingRehearsalApi.js` as the browser-safe client adapter for the existing admin-only rehearsal RPCs. It can list minimized rehearsal history, read server-authoritative rehearsal readiness, and attach a cleanup reconciliation reason/reference. UUID, reason-code, evidence-reference, and result boundaries are validated client-side for UX, while Supabase still re-checks admin authority and all business rules server-side.
- Added `BookingProviderRehearsalPanel` to the authenticated `/lesson-booking-admin` operations page. It shows only internal run ID, server timestamps, status/failure code, a collapsed provider-identity verification boolean, server-computed recency, cleanup/reconciliation state, and readiness blockers.
- The operator surface deliberately does **not** expose evidence hashes, Stripe Customer IDs, Daily room names, webhook IDs/HMACs, raw provider payloads, API keys, payment-method/card data, or customer data.
- Cleanup reconciliation remains append-only and server-authoritative. The browser can provide only a machine-readable reason code and internal evidence reference; it cannot mutate the original rehearsal, call Stripe/Daily, or make a failed rehearsal count as a passing one.
- Added `scripts/lesson-booking-full-preview-preflight.mjs`, a separately gated **read-only** preflight for the future full preview path. Normal CI exits immediately with the gate closed.
- When explicitly enabled later in an approved preview environment, the preflight refuses an unknown/production Supabase project, refuses non-test Stripe credentials, requires Phase 4C5B1 rehearsal readiness to be `ready`, requires the existing base/provider readiness functions to be ready, and independently re-reads Stripe account identity and Daily webhook/domain identity.
- The preflight contains an explicit future-stage contract for booking reservation → Stripe test authorization → Daily attendance → deterministic settlement → terminal evidence/reconciliation, but every stage is marked `write_enabled: false`. It creates no booking, PaymentIntent, Customer, charge, capture, refund, Daily room, attendance event, settlement row, email, deployment, or publication.
- Added a static Phase 4C5B2 boundary regression that checks the admin integration, minimized-field contract, reconciliation RPC boundary, closed preflight gate, test-only Stripe guard, identity checks, and absence of provider-write primitives.
- Extended booking CI paths and steps so changes to the new API, rehearsal panel, boundary regression, and full-preview preflight are covered automatically.

### Verification

All three workflows passed on engineering SHA `0317beee964104aa0b570cd186471f433d323a10`:

- `Lesson booking foundation` run **#151** — passed. It exercised all prior booking/payment/security boundaries, the new Phase 4C5B2 rehearsal UX/preflight boundary, all three preview gates in their normal closed state, every migration and PostgreSQL behavior scenario, Deno Edge Function checks, and the Vite application build.
- `Heathrow Piccadilly Compatibility` run **#190** — passed.
- `Game Smoke Test` run **#260** — passed.

No provider credentials were present in CI, and no provider-writing path ran.

## Research refreshed for Phase 4C5B2 on 2026-09-20

### Stripe

- Stripe's current testing documentation states that sandbox transactions do not move funds and test API keys must be used for test API calls. Stripe also recommends test `PaymentMethod` IDs such as `pm_card_visa` in automated test code rather than sending card numbers from server-side code.
- European payment tests should include SCA/3DS scenarios before a future provider-writing preview driver is treated as complete; Stripe's testing documentation explicitly calls out SCA for EEA online payments.
- The current preflight therefore performs identity/readiness checks only. It does not yet create a PaymentIntent or perform capture.
- References: https://docs.stripe.com/testing and https://docs.stripe.com/api/payment_intents/capture

### Supabase

- Current Supabase guidance keeps publishable keys browser-safe only with RLS and keeps secret/service credentials backend-only because they bypass RLS. Authenticated user-facing functions should validate a user JWT and apply server-side authorization; backend workers should use secret-authenticated paths.
- Hosted functions expose deployment identity through `DENO_DEPLOYMENT_ID`, which remains part of the preview-project identity guard.
- References: https://supabase.com/docs/guides/functions/secrets , https://supabase.com/docs/guides/functions/auth , https://supabase.com/docs/guides/database/secure-data

### Daily

- Daily's webhook configuration API returns provider/domain identity alongside sensitive webhook configuration, while room deletion is an explicit server API operation. The admin UX therefore receives only the collapsed verification boolean already produced by Supabase and never the Daily identifiers/HMAC.
- The future provider-writing full preview path must keep Daily room creation/deletion server-side and preserve signed/replay-safe attendance evidence already implemented in Phase 2.
- References: https://docs.daily.co/reference/rest-api/webhooks/get-webhook and https://docs.daily.co/reference/rest-api/rooms/delete-room

### Base44

- Base44's current developer/backend guidance keeps secrets, external API calls, and sensitive business logic server-side. The Base44/React surface remains an authenticated UI shell over server-authoritative Supabase operations rather than a payment/time/provider authority.
- Reference: https://base44.com/developers

### France/EU / CNIL

- CNIL's April 2026 retention guidance continues to require purpose-based retention rather than indefinite storage, and its minimisation guidance applies the same discipline to logging/evidence data.
- This slice reduces operator exposure by showing only the rehearsal fields necessary to decide readiness/reconciliation. It introduces no new retention duration, automatic erasure, or legal assumption.
- References: https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees and CNIL data-minimisation guidance.

## Next coherent slice

**Phase 4C5C — disabled full-preview driver contract + test-evidence lifecycle:**

1. build a repository-only driver contract for the complete preview booking → Stripe test authorization → Daily attendance → deterministic settlement path, reusing the existing authoritative Edge Functions/RPCs instead of duplicating money/time logic;
2. keep the real provider-writing stage disabled unless Phase 4C5B2 preflight is `preflight_ready`, the approved preview project/provider identities still match, and an explicit preview-only write gate is present;
3. define disposable preview student/tutor/lesson fixtures and a deterministic cleanup/reconciliation plan that never deletes append-only financial/consent/attendance evidence merely to make a test pass;
4. add regression coverage for test PaymentMethod/SCA cases, hold-before/capture-after behavior, failed-hold recovery, Daily attendance evidence, settlement idempotency, cleanup ambiguity, and refusal against production/unknown provider identities;
5. keep deploy, publish, cron activation, production email, live Stripe, automatic retention deletion, and Stripe Connect disabled.

## External configuration still needed for real provider rehearsal/E2E

Repository engineering can continue without these, but provider integration cannot be exercised until a safe preview environment is explicitly configured:

- dedicated Smart Parrot Supabase preview/test project (or explicit approval of an existing safe project);
- `SMART_PARROT_PREVIEW_PROJECT_REF`, preview `VITE_SUPABASE_URL`, browser `sb_publishable_...` key, and a short-lived preview admin access token;
- modern backend `sb_secret_...` context stored only server-side/Vault;
- explicit preview-only execution gates only in the approved preview project;
- Stripe test/sandbox `STRIPE_SECRET_KEY`, `SMART_PARROT_STRIPE_TEST_ACCOUNT_ID`, Checkout webhook signing secret, and separate dispute webhook signing secret;
- Daily test API key, preview webhook ID, preview domain ID/name, preview-only room prefix, webhook HMAC secret, and a test webhook delivery;
- HTTPS `APP_URL` and public HTTPS `TERMS_OF_SERVICE_URL`;
- real durable-medium delivery provider for consumer-law acknowledgements;
- reviewed retention durations plus source authority and review reference for each mandatory class;
- before compliance launch: approved French consumer-law classification/copy and consumer mediator details.

## Release status

**NO DEPLOY / NO MERGE.** Phase 4C5B2 is repository-complete and verified at `0317beee964104aa0b570cd186471f433d323a10`. The full provider-writing booking path is still absent/disabled; only the read-only preflight was added. PR #16 stays intentionally draft and unmerged until preview/provider/legal gates are explicitly approved and verified.
