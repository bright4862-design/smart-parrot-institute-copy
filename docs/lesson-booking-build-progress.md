# Lesson Booking Build Progress

Last updated: 2026-09-20

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute` without explicit instruction).
- Working branch: `agent/lesson-booking-blueprint`.
- Draft PR: #16.
- Base/default branch refreshed at the start of this run: `main` at `210345bbe09bc46c468fb6a7e0eee0596e8d902b`.
- Active booking branch was refreshed from GitHub together with open PRs and CI before implementation. `main` remains untouched.
- Nothing from this branch has been merged, deployed, published, or applied to a live Supabase, Stripe, Daily, Base44, cron, or email environment.
- Stripe execution remains repository-locked to test/sandbox credentials and objects. Live Stripe credentials/objects remain inadmissible.
- Marketplace / Stripe Connect remains out of scope until the single-school path is stable.

## Architecture lock

- Base44/React is the application shell.
- Supabase Postgres/Auth/RLS/Edge Functions/Cron is authoritative for booking, identity, policy, evidence, time, payment state, cancellation, settlement, compliance, retention governance, provider-rehearsal readiness, and operations state.
- Browser time, identity, attendance time, tutor/price/policy fields, cancellation fees, payment transitions, compliance delivery, provider dispute state, retention decisions, provider-environment identity, provider-rehearsal readiness, and admin evidence decisions are never authoritative.
- Stripe uses hold-before/capture-after. Near-term lessons authorize at Checkout; later lessons save a payment method and a secret-authenticated worker authorizes when due.
- Daily supplies online attendance evidence. Rooms are private and booking-scoped; server/provider evidence remains separate from browser state.
- Preview/test orchestration must reuse the real authoritative server boundaries; a test driver is not allowed to recreate payment, attendance, settlement, or time logic in the browser or a side-channel script.

## Completed phases

- **Phase 0A–0C:** authoritative schema/RLS/evidence foundation, bounded availability, browser-safe Supabase client, isolated booking preview.
- **Phase 1A–1C:** atomic booking/consent, Stripe test-only Checkout + manual authorization, deferred off-session holds, failed-hold evidence and customer-present recovery.
- **Phase 2A–2B:** signed/replay-safe Daily/server attendance evidence and deterministic test-only settlement/capture/release.
- **Phase 3A–3B:** server-authoritative cancellation/withdrawal foundation, compliance acknowledgement outbox, My Lessons UX, immutable policy view, retry/dead-letter handling.
- **Phase 4A–4C3:** admin review/evidence operations, test-only dispute intake, out-of-order dispute hardening, launch health/readiness, retention/legal-hold controls, preview-project identity protection, and provider-write-disabled preview E2E gate.
- **Phase 4C4:** separate provider identity/readiness checks, disposable test-provider rehearsal with deterministic cleanup, and audited retention-duration approval/revocation hooks.
- **Phase 4C5A:** append-only preview-rehearsal evidence registry, cleanup-reconciliation signals, reviewed retention approval/revocation UI, and launch-health rehearsal signals.
- **Phase 4C5B1:** server-authoritative recent-rehearsal readiness and minimized admin rehearsal history, including fail-closed stale/failed/latest-run and unresolved-cleanup gates.
- **Phase 4C5B2:** authenticated operator rehearsal history/reconciliation UX plus a separately gated, read-only full-preview-path preflight.
- **Phase 4C5C (current checkpoint):** repository-only full-preview driver contract, scenario matrix, fail-closed execution gate, and append-only test-evidence/cleanup lifecycle contract.

## Phase 4C5C — disabled full-preview driver contract + test-evidence lifecycle — complete in repository, not deployed

Verified engineering checkpoint: `e98da81d2e8331c0deaccd34ce67dff63b30a1ba`.

### Implemented

- Added `scripts/lesson-booking-full-preview-driver-contract.mjs` as a repository-only contract for the future preview booking → Stripe test authorization → Daily/server attendance → deterministic settlement → terminal evidence/reconciliation journey.
- The contract explicitly requires an independent preview-only write gate (`SMART_PARROT_FULL_PREVIEW_EXECUTION_ENABLED=1`), the existing read-only preflight result `preflight_ready`, a recent successful provider rehearsal, zero unresolved provider-cleanup failures, verified Stripe/Daily identity, an approved non-production Supabase project ref, an exact matching Supabase project URL, and an `sk_test_...` Stripe key before any future execution shell may proceed.
- The planned stages deliberately delegate to the already-built authoritative server surfaces instead of duplicating business logic:
  - reservation via `create-booking` / Supabase;
  - authorization via the existing `create-booking`, signed Stripe webhook, `place-holds`, and `fix-payment` paths;
  - attendance via signed `daily-webhook` or authenticated server `check-in`;
  - settlement via the secret-authenticated `settle-lessons` worker;
  - terminal evidence/reconciliation from Supabase authority.
- The driver contract itself has `direct_provider_write: false` for every stage. It contains no direct Stripe PaymentIntent/capture call and no direct Daily room mutation.
- Added a bounded preview scenario matrix:
  - near-term manual-authorization success using Stripe's test `pm_card_visa` fixture;
  - near-term SCA/customer-present authentication as an explicit non-automated scenario;
  - deferred setup-mode success followed by the existing off-session hold worker;
  - deferred authorization failure followed by the existing customer-present `fix-payment` recovery path.
- Added an explicit evidence lifecycle. Booking state, consent evidence, payment ledger, attendance evidence, settlement evidence, and provider webhook evidence are preserved. Append-only financial/consent/attendance rows are never auto-deleted merely to clean up a test. Only genuinely disposable driver-owned infrastructure, such as a preview Daily room, is cleanup-eligible; an unknown or failed cleanup becomes `cleanup_incomplete` and requires reconciliation.
- Added authorization-observation helpers that reject `livemode`, recognize `requires_capture`, surface customer action for `requires_action`, and route the deferred failed-hold case into the existing recovery flow rather than inventing a second payment state machine.
- Added `scripts/check-lesson-booking-full-preview-driver-contract.mjs` with fail-closed regressions for the execution gate, stale/blocked preflight, unresolved cleanup, provider identity, Daily identity, production-project refusal, exact preview-URL identity, live Stripe-key refusal, scenario behavior, append-only evidence preservation, cleanup ambiguity, and live Stripe-object refusal.
- The regression also reads the real Edge Functions and proves the existing hold-before/capture-after, deferred hold, failed-hold recovery, signed Daily/server check-in, and deterministic idempotent settlement contracts remain the execution authority.
- Added a guard against raw payment-card numbers in the new preview contract/preflight scripts. Automated Stripe examples use test PaymentMethod IDs rather than server-side card numbers.
- Wired the Phase 4C5C regression and both new files into `.github/workflows/lesson-booking-foundation.yml`.
- No provider-writing full E2E driver was enabled or executed in this phase.

### Verification

All exact-head workflows passed on engineering SHA `e98da81d2e8331c0deaccd34ce67dff63b30a1ba`:

- `Lesson booking foundation` run **#155** — passed. The new Phase 4C5C contract/evidence lifecycle regression passed, as did every prior booking/payment/security boundary, all three preview gates in their normal closed state, Edge Function Deno checks, all migrations and executable PostgreSQL booking scenarios, and the Vite build.
- `Heathrow Piccadilly Compatibility` run **#193** — passed.
- `Game Smoke Test` run **#263** — passed, including application build and browser smoke coverage.

The CI proof is intentionally repository-only: no provider credential was supplied and no provider-writing preview path ran.

## Research refreshed for Phase 4C5C on 2026-09-20

### Stripe

- Stripe's current authorization/capture guidance still requires manual capture for a hold: Checkout or PaymentIntent uses `capture_method=manual`, the authorized PaymentIntent transitions to `requires_capture`, and `payment_method_details.card.capture_before` identifies authorization expiry. The future rehearsal must therefore observe and respect the provider's actual capture deadline rather than assume a fixed seven-day window.
- Stripe currently documents card-not-present authorization windows that vary by card brand and whether the transaction is merchant- or customer-initiated; for example Visa merchant-initiated authorizations are shorter than the common seven-day window. This reinforces the existing `capture_before` evidence boundary in `place-holds`.
- Stripe's testing guidance says sandbox transactions do not move funds, all test API calls must use test keys, and automated test code should use test PaymentMethods such as `pm_card_visa` rather than raw card numbers. 3DS/SCA is a first-class sandbox scenario and remains an explicit preview case before launch.
- References: https://docs.stripe.com/payments/place-a-hold-on-a-payment-method , https://docs.stripe.com/testing , https://docs.stripe.com/api/payment_intents/capture

### Supabase

- Current Supabase Edge Function guidance separates authenticated user calls (`auth: 'user'`), secret-authenticated worker/service calls (`auth: 'secret'`), and unauthenticated entry points intended for separately signed webhooks (`auth: 'none'`). This matches the current create-booking/check-in, settlement/hold-worker, and Daily/Stripe webhook boundaries.
- Publishable keys remain browser-safe only with RLS/least-privilege policies; secret keys bypass RLS and must remain backend-only. Supabase is deprecating legacy `anon` / `service_role` keys by the end of 2026 in favor of `sb_publishable_...` and `sb_secret_...` keys.
- Hosted Edge Functions expose `DENO_DEPLOYMENT_ID`, so the existing preview-project identity check remains appropriate before any future provider write is allowed.
- References: https://supabase.com/docs/guides/functions/auth , https://supabase.com/docs/guides/functions/secrets , https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys

### Daily

- Daily's webhook configuration response contains a webhook UUID, HMAC secret, state, retry configuration, failure count, and domain ID. The HMAC is explicitly a signature-verification secret, so preview/operator surfaces continue to expose only minimized verification status rather than raw webhook configuration.
- Daily provides an explicit authenticated room-delete operation. A future preview execution shell may clean up only the disposable room it created; an uncertain or failed delete must stay visible as a reconciliation problem rather than being silently treated as complete.
- References: https://docs.daily.co/reference/rest-api/webhooks/get-webhook , https://docs.daily.co/reference/rest-api/rooms/delete-room

### Base44

- Base44's current developer guidance positions backend functions as the place for secrets, external API calls, and sensitive business logic and provides row-level permissions. The Base44/React layer therefore remains the user/operator shell, not payment/time/provider authority.
- Reference: https://base44.com/developers

### France/EU / CNIL

- CNIL's 2 April 2026 retention guidance says personal data cannot be retained indefinitely and retention must be tied to the purpose that justified collection. If no law imposes a duration, the controller must define and justify a non-excessive one.
- CNIL's logging guidance recommends targeted logs, data minimisation, and retention appropriate to purpose; ordinary security logs are commonly recommended for a rolling six-to-twelve-month period, with longer periods justified only by a specific legal, litigation, internal-control, or incident-analysis need.
- Phase 4C5C therefore keeps the preview test evidence deliberately minimized and does not invent a booking/payment statutory retention duration or turn the general logging recommendation into a universal financial-evidence rule. Reviewed retention-class metadata and legal holds remain the launch gate.
- References: https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees , https://www.cnil.fr/fr/securite-tracer-les-operations , https://www.cnil.fr/fr/minimiser-les-donnees-collectees

## Next coherent slice

**Phase 4C5D — disabled preview execution shell + authoritative evidence observer:**

1. add a still-disabled execution shell that consumes the Phase 4C5C run contract and can only invoke the existing authoritative Supabase Edge Functions/RPCs; it must not contain direct Stripe capture/PaymentIntent state transitions or direct Daily attendance writes;
2. introduce disposable preview fixture metadata/namespacing for one student/tutor/lesson/run without weakening real RLS, consent, money, time, or attendance rules;
3. add a minimized server-authoritative run observer that checks booking/payment/attendance/settlement terminal evidence and returns statuses/counts rather than raw provider payloads or secrets;
4. preserve append-only evidence after the test and route any disposable-provider cleanup ambiguity into the existing rehearsal/reconciliation operations path;
5. add tests for duplicate execution requests, SCA/customer-action pause, failed-hold recovery pause/resume, settlement replay/idempotency, provider cleanup ambiguity, and refusal in an unknown/production project;
6. keep the execution shell inert in normal CI and do not run it until a dedicated approved preview environment and provider credentials are supplied.

## External configuration still needed for real provider rehearsal/E2E

Repository engineering can continue without these, but provider integration cannot be exercised until a safe preview environment is explicitly configured:

- dedicated Smart Parrot Supabase preview/test project (or explicit approval of an existing safe project);
- `SMART_PARROT_PREVIEW_PROJECT_REF`, preview `VITE_SUPABASE_URL`, browser `sb_publishable_...` key, and a short-lived preview admin/student test access path;
- modern backend `sb_secret_...` context stored only server-side/Vault;
- explicit preview-only execution gates only in the approved preview project;
- Stripe sandbox/test `STRIPE_SECRET_KEY`, expected Stripe test account ID, Checkout webhook signing secret, and separate dispute webhook signing secret;
- Daily preview API key, webhook ID/domain identity, preview-only room prefix, webhook HMAC secret, and a test webhook delivery;
- HTTPS `APP_URL` and public HTTPS `TERMS_OF_SERVICE_URL`;
- real durable-medium delivery provider for consumer-law acknowledgements;
- reviewed retention durations plus source authority/review reference for each mandatory class;
- before compliance launch: approved French consumer-law classification/copy and consumer mediator details.

## Release status

**NO DEPLOY / NO MERGE.** Phase 4C5C is repository-complete and verified at `e98da81d2e8331c0deaccd34ce67dff63b30a1ba`. The contract and tests prepare the real provider preview journey but do not execute it. PR #16 stays intentionally draft and unmerged until preview/provider/legal gates are explicitly approved and verified.
