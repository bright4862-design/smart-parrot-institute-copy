# Lesson Booking Build Progress

Last updated: 2026-09-20

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute` without explicit instruction).
- Working branch: `agent/lesson-booking-blueprint`.
- Draft PR: #16.
- Default branch refreshed this run: `main` at `210345bbe09bc46c468fb6a7e0eee0596e8d902b`.
- Verified Phase 4C5F engineering checkpoint: `3e6d25c10a506c5c464d5d47f1f7672cabfed856`.
- Previous verified Phase 4C5E checkpoint: `29bc71b87eee0b3bd7ec02e959f2f4f94ca06abe`.
- `main` remains untouched. Nothing has been merged or published to Base44/production.
- Approved Supabase PREVIEW/TEST project: `mrzzbhqzxshtbqvxkcjn`, `eu-west-1`, `https://mrzzbhqzxshtbqvxkcjn.supabase.co`. It is not production.
- Preview project health was refreshed this run and is `ACTIVE_HEALTHY`; a default `sb_publishable_...` key exists. No server secret values were read, logged, or installed by this slice.
- Stripe execution remains test/sandbox-only. Live Stripe keys and live objects are inadmissible.
- Marketplace / Stripe Connect remains deferred until the single-school path is stable.

## Architecture lock

- Base44/React is the application shell.
- Supabase Postgres/Auth/RLS/Edge Functions/Cron is authoritative for booking, identity, policy, evidence, time, payment state, cancellation, settlement, compliance, retention governance, provider-rehearsal readiness, and preview-run continuation.
- Browser time, browser identity assertions, attendance time, price/policy inputs, money transitions, provider state, and preview continuation are never authoritative.
- Stripe uses hold-before/capture-after. Near-term lessons authorize using manual capture; later lessons save a payment method and the secret-authenticated worker authorizes when due.
- Daily supplies online attendance evidence. Private booking-scoped rooms/tokens and signed provider/server evidence remain separate from browser state.
- Preview orchestration may coordinate existing authoritative endpoints but may not recreate Stripe, Daily, settlement, attendance, or server-time logic client-side.

## Completed phases

- **Phase 0A–0C:** authoritative schema/RLS/evidence foundation, bounded availability, browser-safe Supabase client, isolated booking preview.
- **Phase 1A–1C:** atomic booking/consent, Stripe test-only Checkout + manual authorization, deferred off-session holds, failed-hold evidence and customer-present recovery.
- **Phase 2A–2B:** signed/replay-safe Daily/server attendance evidence and deterministic test-only settlement/capture/release.
- **Phase 3A–3B:** server-authoritative cancellation/withdrawal foundation, compliance acknowledgement outbox, My Lessons UX, immutable policy view, retry/dead-letter handling.
- **Phase 4A–4C4:** admin review/evidence operations, test-only dispute intake, launch health/readiness, retention/legal-hold controls, preview identity protection, provider staging, and reviewed retention approval hooks.
- **Phase 4C5A–4C5D:** append-only provider-rehearsal evidence, readiness/history, operator preflight, full-preview contract, disabled execution shell, disposable fixture namespace, and minimized authoritative booking observer.
- **Phase 4C5E:** exact-preview Supabase transport plus durable server-authoritative full-preview run/checkpoint registry; search-path hardening for `public.forbid_change()`.
- **Phase 4C5F (current):** resumable preview executor plus fail-closed redacted credential/readiness handoff.

## Phase 4C5F — resumable executor + credential/readiness handoff — complete in repository

Verified engineering checkpoint: `3e6d25c10a506c5c464d5d47f1f7672cabfed856`.

### Implemented

- Added `scripts/lesson-booking-full-preview-readiness-manifest.mjs`.
  - Hard-locks readiness to the approved Smart Parrot preview project identity.
  - Classifies the Supabase browser key as `sb_publishable_...` and the backend worker key as `sb_secret_...`; key-class confusion fails closed.
  - Validates short-lived student/admin session shape, expiry, subject presence, and separation without returning token values. JWT signature/role verification deliberately remains the authoritative endpoint's responsibility.
  - Refuses any `sk_live_...` Stripe key immediately and accepts only the test-key class for provider-write readiness.
  - Requires explicit Stripe test account identity plus separate Checkout and dispute webhook-secret presence.
  - Requires Daily preview API/webhook/domain identity inputs, safe non-production domain/room naming, and webhook HMAC presence.
  - Requires `https://asmartparrot.com`, an HTTPS terms URL, provider-E2E enablement, server-derived rehearsal readiness, and a clear provider-cleanup state.
  - Returns only boolean/status checks and blocker names; raw credentials, tokens, provider IDs, webhook secrets, and HMAC values are never emitted.
- Added `scripts/lesson-booking-full-preview-resumable-executor.mjs`.
  - Every resume begins with `refreshRun()` and therefore re-reads the durable server-authoritative preview registry before making any decision.
  - Optional expected revision implements optimistic continuation: stale callers stop before a write and must refresh/reconfirm.
  - Checkout completion, SCA/customer authentication, and failed-hold `fix-payment` recovery are explicit customer-present pause envelopes with `automation_may_execute=false`.
  - Attendance and pre-end-time states pause without inventing attendance or advancing server time.
  - Deferred-hold and settlement worker states produce a dry-run intent unless both the redacted provider-readiness manifest is fully ready and `SMART_PARROT_FULL_PREVIEW_WORKER_WRITES_ENABLED=1` is explicitly open.
  - Approved worker execution still calls only the existing Supabase Edge Function boundary (`place-holds` or `settle-lessons`), then refreshes authoritative state again. There is no direct Stripe or Daily API primitive in the executor.
  - Terminal runs replay without writes. Duplicate retries carrying an older revision stop as stale before a second worker write.
- Added `scripts/check-lesson-booking-full-preview-resumable-executor.mjs` with regressions for:
  - redaction/no credential leakage;
  - live Stripe refusal;
  - publishable/secret key-class confusion;
  - missing/expired student/admin sessions and same-principal misuse;
  - ambiguous provider cleanup;
  - repeated customer pause with zero server writes;
  - stale revision with zero write;
  - terminal replay with zero write;
  - provider-not-ready and worker-gate-closed dry-run behavior;
  - exactly one approved secret-worker invocation followed by authoritative refresh;
  - duplicate retry with old revision not causing a second write;
  - absence of direct Stripe/Daily API calls and browser-authoritative time decisions.
- Updated `.github/workflows/lesson-booking-foundation.yml` so future changes to the Phase 4C5F files trigger the booking workflow and the new regression is part of the full foundation gate.

### Verification

- Local isolated contract execution passed before push:
  - `node --check` for readiness manifest, resumable executor, and regression script;
  - `node scripts/check-lesson-booking-full-preview-resumable-executor.mjs` passed.
- GitHub Actions `Lesson booking foundation` run **#161** passed on exact engineering SHA `3e6d25c10a506c5c464d5d47f1f7672cabfed856`.
  - The Phase 4C5F resumable executor/credential-readiness regression passed.
  - Every prior booking/payment/security regression through Phase 4C5E passed.
  - Preview/provider/full-path execution gates remained closed in normal CI.
  - All booking migrations and PostgreSQL behavior scenarios passed.
  - Edge Function Deno checks passed.
  - The production Vite build passed.
- No database migration or Edge Function deployment was required for this repository-only slice, so the approved preview database was not mutated.
- Supabase project identity/health was rechecked against exact project `mrzzbhqzxshtbqvxkcjn`; it remains healthy and the publishable-key class is available.

## Research refreshed for Phase 4C5F on 2026-09-20

### Stripe

- Manual capture remains the correct hold primitive for this architecture. Stripe says `capture_before` on the underlying charge is the authoritative authorization deadline and the actual validity window varies by network/transaction classification; the application must not infer a universal seven-day deadline.
- Checkout supports authorization without capture by setting `payment_intent_data[capture_method]=manual`; an authorized PaymentIntent transitions to `requires_capture` before capture.
- Stripe recommends idempotency keys for POST mutations; the durable preview run/revision layer remains orchestration protection while existing server payment paths keep their own provider idempotency keys.
- References: https://docs.stripe.com/payments/place-a-hold-on-a-payment-method and https://docs.stripe.com/api/idempotent_requests

### Supabase

- Current Supabase guidance distinguishes `sb_publishable_...` for public/browser clients from `sb_secret_...` for trusted backends. Secret keys bypass RLS and must not be exposed client-side.
- New secret keys are sent on the `apikey` header rather than being treated as bearer JWTs. This matches the approved preview transport and secret-worker design.
- Scheduled Edge Function calls should keep backend credentials in a protected server/Vault path rather than client code.
- References: https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys , https://supabase.com/docs/guides/functions/secrets , https://supabase.com/docs/guides/functions/schedule-functions

### Daily

- Daily meeting tokens should be room-scoped for controlled access; Daily explicitly recommends setting `room_name` when tokens control room access.
- Daily webhooks remain provider/server evidence rather than browser authority; webhook signatures, timestamps, and event identity are the basis for verification/deduplication in the existing server path.
- References: https://docs.daily.co/reference/rest-api/meeting-tokens and https://docs.daily.co/reference/rest-api/webhooks

### Base44

- Base44 remains the frontend/application shell. Provider/server credentials remain outside the browser bundle and outside the Base44 client contract.
- Reference: https://docs.base44.com/

### France / EU consumer requirements

- France's current official consumer guidance states that distance service contracts generally carry at least a 14-day withdrawal period starting from contract conclusion, subject to statutory exceptions; the professional must inform the consumer of the right and its exercise conditions.
- The implementation therefore continues to preserve immutable policy/consent evidence and does not guess that a particular English-lesson product is exempt. Final French consumer-law classification/copy remains a launch-review item.
- Reference: https://www.economie.gouv.fr/particuliers/mes-droits-conso/bien-consommer/vente-distance-tout-savoir-sur-votre-droit-de-retractation

## External configuration still needed before real provider rehearsal/E2E

The repository and Supabase preview foundation can continue without these, but real provider-writing rehearsal remains fail-closed until all required preview inputs are installed and verified:

- safe short-lived Supabase preview **student** and **admin** sessions for the executor/rehearsal;
- backend `sb_secret_...` context only for the approved secret-worker path;
- Stripe **test-mode** `STRIPE_SECRET_KEY`, exact expected Stripe test account ID, Checkout webhook signing secret, and a separate dispute-webhook signing secret in Supabase preview Edge Function secrets;
- Daily preview API key, webhook ID/domain identity, safe preview domain/room prefix, webhook HMAC secret, and a successful signed preview webhook delivery;
- provider E2E gate deliberately enabled only for the controlled rehearsal;
- `APP_URL=https://asmartparrot.com` and a public HTTPS terms URL in provider configuration;
- durable-medium delivery provider for required consumer acknowledgements;
- reviewed retention durations/source authority and final French consumer-law wording/mediator details before compliance launch.

Connecting Stripe inside Base44 alone does **not** provide Stripe server/webhook secrets to Supabase Edge Functions.

## Next coherent slice

**Phase 4C5G — preview operator bootstrap + webhook/readiness proof:**

1. build a repository-only operator command that combines the existing read-only preflight, the redacted readiness manifest, and durable run lookup without printing secrets;
2. add short-lived session handoff validation that confirms authoritative server roles through safe preview endpoints instead of trusting decoded JWT claims;
3. add a webhook/readiness proof contract that verifies configured Stripe/Daily endpoint identity and signed-test evidence without enabling money/video writes;
4. add dry-run worker invocation output that shows exactly which server operation would run and why, while keeping the worker write gate closed by default;
5. add regressions for wrong admin role, wrong project/account/domain, webhook secret-class mixups, stale readiness, and repeated operator resume;
6. once the user supplies/authorizes the missing TEST provider configuration, use these gates to perform the first bounded real preview rehearsal — never with live Stripe credentials.

## Release status

**NO MERGE / NO BASE44 OR PRODUCTION PUBLISH.** Phase 4C5F is repository-complete and CI-verified at `3e6d25c10a506c5c464d5d47f1f7672cabfed856`. PR #16 remains intentionally draft. No provider-writing rehearsal, live Stripe operation, cron activation, production email, production migration, Base44 publication, or Stripe Connect work occurred in this slice.
