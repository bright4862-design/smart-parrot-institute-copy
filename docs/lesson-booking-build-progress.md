# Lesson Booking Build Progress

Last updated: 2026-09-20

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute` without explicit instruction).
- Working branch: `agent/lesson-booking-blueprint`.
- Draft PR: #16.
- Default branch refreshed at the start of this run: `main` at `210345bbe09bc46c468fb6a7e0eee0596e8d902b`.
- Engineering checkpoint for this run: `c49da882fbe625049e0f9d75bdc2df373159d27f`.
- `main` remains untouched. Nothing from this branch has been merged, deployed, published, or applied to a live Supabase, Stripe, Daily, Base44, cron, or email environment.
- Stripe execution remains repository-locked to test/sandbox credentials and objects. Live Stripe credentials/objects remain inadmissible.
- Marketplace / Stripe Connect remains out of scope until the single-school path is stable.

## Architecture lock

- Base44/React is the application shell.
- Supabase Postgres/Auth/RLS/Edge Functions/Cron is authoritative for booking, identity, policy, evidence, time, payment state, cancellation, settlement, compliance, retention governance, provider-rehearsal readiness, and operations state.
- Browser time, identity, attendance time, tutor/price/policy fields, cancellation fees, payment transitions, compliance delivery, provider dispute state, retention decisions, provider-environment identity, provider-rehearsal readiness, and admin evidence decisions are never authoritative.
- Stripe uses hold-before/capture-after. Near-term lessons authorize at Checkout; later lessons save a payment method and a secret-authenticated worker authorizes when due.
- Daily supplies online attendance evidence. Rooms are private and booking-scoped; signed provider/server evidence remains separate from browser state.
- Preview/test orchestration must reuse the real authoritative server boundaries. A preview driver is not allowed to recreate payment, attendance, settlement, or time logic in the browser or in an independent provider script.

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
- **Phase 4C5C:** repository-only full-preview driver contract, scenario matrix, fail-closed execution gate, and append-only test-evidence/cleanup lifecycle contract.
- **Phase 4C5D (current checkpoint):** still-disabled preview execution shell, disposable fixture namespace, and minimized server-authoritative evidence observer.

## Phase 4C5D — disabled preview execution shell + authoritative evidence observer — complete in repository, not deployed

Verified engineering checkpoint: `c49da882fbe625049e0f9d75bdc2df373159d27f`.

### Implemented

- Added `supabase/migrations/20260920210500_lesson_booking_phase4c5d_preview_observer.sql` with admin-only `admin_observe_booking_preview_run(...)`.
  - It reads the authoritative booking row plus consent, ledger, attendance, and settlement evidence.
  - It returns only minimized statuses, booleans, timestamps, and counts needed to drive the preview state machine.
  - It does **not** return Stripe Customer/PaymentMethod/PaymentIntent/Checkout/SetupIntent IDs, Daily room names, webhook IDs, raw webhook/provider payloads, secrets, IP addresses, user agents, card details, or evidence hashes.
  - Authorization is server-side via the existing `private.smart_parrot_require_admin(auth.uid())` boundary.
- Added `scripts/lesson-booking-full-preview-observer.mjs`.
  - It validates an allowlisted observer schema and rejects unknown or provider-sensitive fields.
  - It fail-closes on unsupported schema versions, invalid booking IDs/statuses, invalid counts/booleans, or invalid timestamps.
- Added `scripts/lesson-booking-full-preview-execution-shell.mjs`.
  - It consumes the Phase 4C5C run contract and adds a second explicit shell gate: `SMART_PARROT_FULL_PREVIEW_SHELL_ENABLED=1`.
  - It can address only an allowlisted set of existing authoritative server operations: `create-booking`, the admin observer RPC, `place-holds`, `fix-payment`, `settle-lessons`, and the existing cleanup-reconciliation RPC.
  - It contains no direct Stripe API URL, PaymentIntent creation/capture primitive, Daily API URL, room API call, or attendance mutation.
  - When invoked directly in CI it remains inert. Even if both preview gates are set, no network transport is auto-configured; an approved preview adapter is still required before execution.
- Added deterministic disposable fixture namespacing (`sp-preview-*`) for run/student/tutor/lesson/room references without customer PII.
- Added server-state progress classification:
  - `pending_checkout` pauses for Checkout/customer action rather than faking completion;
  - `card_saved` routes to the existing deferred-hold worker;
  - `hold_failed` pauses for the existing customer-present `fix-payment` recovery;
  - `hold_placed` waits for authoritative attendance evidence and server time;
  - `awaiting_settlement` routes to the existing settlement worker;
  - `settled` is terminal.
- Duplicate reservation attempts deliberately reuse the same full-preview run UUID as the existing booking `request_id`, so the existing reservation/Checkout idempotency boundary remains the source of truth rather than a second client-side lock.
- Cleanup ambiguity still becomes reconciliation work. The shell explicitly forbids blind/automatic provider retry after an ambiguous Daily-room cleanup outcome.
- Added `scripts/check-lesson-booking-full-preview-execution-shell.mjs` covering:
  - closed shell gate and production-project refusal;
  - duplicate execution request identity;
  - SCA/customer-action pause;
  - deferred-hold and failed-hold recovery routing;
  - attendance and settlement state progression;
  - settlement server-operation allowlisting;
  - rejection of direct Stripe capture/provider-write primitives;
  - minimized observer field enforcement;
  - cleanup ambiguity/reconciliation behavior.
- Added executable PostgreSQL scenario `supabase/tests/lesson_booking_full_preview_observer_scenarios.sql`.
  - It seeds deliberately sensitive Stripe IDs, Checkout IDs, IP/user-agent data, raw Daily evidence, and notes in an ephemeral transaction.
  - The admin observer must return the correct minimized counts/statuses while proving none of those sensitive values escape.
  - A non-admin observer call must fail with insufficient privilege.
- Updated `.github/workflows/lesson-booking-foundation.yml` to run the Phase 4C5D static regression, verify the execution-shell gate remains closed, apply the new migration, and execute the new PostgreSQL observer scenario.

### Verification

All exact-head workflows passed on engineering SHA `c49da882fbe625049e0f9d75bdc2df373159d27f`:

- `Lesson booking foundation` run **#158** — passed. The Phase 4C5D execution-shell/minimized-observer regression passed, all earlier booking/payment/security regressions passed, all preview/provider/full-path gates remained closed in CI, every migration and PostgreSQL booking scenario including the new observer scenario passed, Deno checks passed, and the Vite build passed.
- `Heathrow Piccadilly Compatibility` run **#195** — passed.
- `Game Smoke Test` run **#265** — passed.

No provider credentials were supplied to CI and no provider-writing full-preview journey ran.

## Research refreshed for Phase 4C5D on 2026-09-20

### Stripe

- Stripe's current idempotency guidance continues to support idempotency keys on POST requests so retry-safe server operations do not accidentally duplicate provider mutations. The preview shell therefore keeps the existing server-owned booking/Checkout/settlement idempotency keys rather than creating a second money-transition implementation.
- Manual authorization/capture remains the correct hold primitive for near-term bookings, and the real authorization `capture_before` evidence must remain authoritative rather than assuming a universal fixed hold lifetime.
- Test/sandbox credentials and objects remain mandatory for preview execution.
- References: https://docs.stripe.com/api/idempotent_requests , https://docs.stripe.com/payments/place-a-hold-on-a-payment-method , https://docs.stripe.com/testing

### Supabase

- Current Edge Function guidance distinguishes authenticated user calls (`auth: 'user'`), secret-authenticated service/worker calls (`auth: 'secret'`), and unauthenticated entry points for independently signed webhooks (`auth: 'none'`). The new shell preserves those existing function boundaries instead of bypassing them.
- Publishable keys remain suitable for browser/client use only with RLS; secret keys bypass RLS and must remain controlled backend credentials. Hosted functions expose deployment identity through `DENO_DEPLOYMENT_ID`, which remains part of preview-project identity protection.
- Supabase continues its 2026 migration from legacy `anon`/`service_role` keys toward `sb_publishable_...`/`sb_secret_...` keys.
- References: https://supabase.com/docs/guides/functions/auth , https://supabase.com/docs/guides/functions/secrets , https://supabase.com/docs/guides/getting-started/api-keys , https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys

### Daily

- Daily webhook evidence includes a provider event ID/timestamp and signed webhook configuration; provider event identity remains useful for replay-safe evidence while the HMAC stays secret and out of browser/operator surfaces.
- Disposable preview rooms may be deleted by an authenticated server operation, but an unknown delete outcome must be reconciled rather than blindly retried as if no public/provider-side mutation occurred.
- References: https://docs.daily.co/reference/rest-api/webhooks/get-webhook , https://docs.daily.co/reference/rest-api/rooms/delete-room , https://docs.daily.co/reference/webhooks/events

### Base44

- Base44 remains the frontend/application shell. Sensitive secrets, external-provider calls, and authoritative business logic stay server-side; browser-facing permissions stay least-privilege.
- Reference: https://base44.com/developers

### France/EU / CNIL

- CNIL guidance updated in April 2026 continues to require purpose-based, non-indefinite retention and data minimisation. Logging/evidence should be targeted to the operational/legal purpose rather than collected wholesale.
- The new observer therefore exposes only the minimum state/count information necessary to operate a preview run and keeps raw/provider identifiers out of that surface.
- No French booking/payment retention duration has been guessed or hard-coded; reviewed retention classes and legal holds remain the launch authority.
- References: https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees , https://www.cnil.fr/fr/securite-tracer-les-operations , https://www.cnil.fr/fr/minimiser-les-donnees-collectees

## Next coherent slice

**Phase 4C5E — approved-preview transport contract + durable run checkpointing:**

1. add a dedicated preview transport adapter contract that maps the shell's user/admin/secret operation classes to the approved Supabase preview endpoint without ever embedding provider credentials in the shell;
2. add a server-authoritative full-preview run/checkpoint registry keyed by run UUID and booking ID, so repeated orchestration requests resume a known run instead of creating parallel bookings or trusting browser state;
3. persist only minimized stage/checkpoint metadata, pause reasons, and reconciliation state — no raw provider payloads, payment-method IDs, card data, or webhook secrets;
4. formalize continuation behavior for customer Checkout/SCA, failed-hold recovery, real attendance evidence, settlement replay, and terminal completion;
5. add fail-closed regressions for conflicting run IDs/bookings, stale checkpoints, duplicate execution attempts, invalid project identity, and unauthorized transport classes;
6. keep the adapter and run driver inert in normal CI and do not perform provider writes until the approved preview environment and test credentials are explicitly configured.

## External configuration still needed for real provider rehearsal/E2E

Repository engineering can continue without these, but the real provider integration cannot be exercised until a safe preview environment is explicitly configured:

- dedicated Smart Parrot Supabase preview/test project (or explicit approval of an existing safe project);
- `SMART_PARROT_PREVIEW_PROJECT_REF`, preview `VITE_SUPABASE_URL`, browser `sb_publishable_...` key, and short-lived preview student/admin access paths;
- modern backend `sb_secret_...` context stored only server-side/Vault;
- explicit preview-only execution gates only in the approved preview project;
- Stripe sandbox/test `STRIPE_SECRET_KEY`, expected Stripe test account ID, Checkout webhook signing secret, and separate dispute webhook signing secret;
- Daily preview API key, webhook ID/domain identity, preview-only room prefix, webhook HMAC secret, and a test webhook delivery;
- HTTPS `APP_URL` and public HTTPS `TERMS_OF_SERVICE_URL`;
- real durable-medium delivery provider for consumer-law acknowledgements;
- reviewed retention durations plus source authority/review reference for each mandatory class;
- before compliance launch: approved French consumer-law classification/copy and consumer mediator details.

## Release status

**NO DEPLOY / NO MERGE.** Phase 4C5D is repository-complete and verified at `c49da882fbe625049e0f9d75bdc2df373159d27f`. The execution shell is still inert and has no approved preview network transport. PR #16 remains intentionally draft and unmerged until preview/provider/legal gates are explicitly approved and verified.
