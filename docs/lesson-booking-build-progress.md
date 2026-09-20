# Lesson Booking Build Progress

Last updated: 2026-09-20

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute` without explicit instruction).
- Working branch: `agent/lesson-booking-blueprint`.
- Draft PR: #16.
- Base/default branch: `main` at `210345bbe09bc46c468fb6a7e0eee0596e8d902b` at the start of this run.
- `main` remains untouched.
- Nothing from this branch has been merged, deployed, published, or applied to a live Supabase, Stripe, Daily, Base44, cron, or email environment.
- Stripe execution remains repository-locked to test/sandbox credentials and objects. Live Stripe credentials/objects remain inadmissible.
- Marketplace / Stripe Connect remains out of scope until the single-school path is stable.

## Architecture lock

- Base44/React is the app shell.
- Supabase Postgres/Auth/RLS/Edge Functions/Cron is authoritative for booking, identity, policy, evidence, time, payment state, cancellation, settlement, compliance, retention governance, provider-rehearsal readiness, and operations state.
- Browser time, identity, attendance time, tutor/price/policy fields, cancellation fees, payment transitions, compliance delivery, provider dispute state, retention decisions, provider-environment identity, provider-rehearsal readiness, and admin evidence decisions are never authoritative.
- Stripe uses hold-before/capture-after. Near-term lessons authorize at Checkout; later lessons save a payment method and a secret-authenticated worker authorizes when due.
- Daily provides online attendance evidence. Rooms are private and booking-scoped; server/provider evidence remains separate from browser state.

## Completed phases

- **Phase 0A–0C:** authoritative schema/RLS/evidence foundation, bounded availability, browser-safe Supabase client, isolated booking preview.
- **Phase 1A–1C:** atomic booking/consent, Stripe test-only Checkout + manual authorization, deferred off-session holds, failed-hold evidence and customer-present recovery.
- **Phase 2A–2B:** signed/replay-safe Daily/server attendance evidence and deterministic test-only settlement/capture/release.
- **Phase 3A–3B:** server-authoritative cancellation/withdrawal foundation, compliance acknowledgement outbox, My Lessons UX, immutable policy view, retry/dead-letter handling.
- **Phase 4A–4C3:** admin review/evidence operations, test-only dispute intake, out-of-order dispute hardening, launch health/readiness, retention/legal-hold controls, preview-project identity protection, and provider-write-disabled preview E2E gate.
- **Phase 4C4:** separate provider identity/readiness checks, disposable test-provider rehearsal with deterministic cleanup, and audited retention-duration approval/revocation hooks.
- **Phase 4C5A:** append-only preview-rehearsal evidence registry, cleanup-reconciliation signals, reviewed retention approval/revocation UI, and launch-health rehearsal signals.
- **Phase 4C5B1 (current checkpoint):** server-authoritative recent-rehearsal readiness and minimized admin rehearsal history, including fail-closed stale/failed/latest-run and unresolved-cleanup gates.

## Phase 4C5A — launch-rehearsal evidence + operator approval UX — complete in repository, not deployed

Verified engineering checkpoint: `b9a8ca938f7923106b0df489f231276a30cc6f5a`.

### Implemented

- Added append-only `lesson_booking_provider_rehearsals` for minimized provider rehearsal evidence. It persists only timestamps, preview/Stripe/Daily verification booleans, disposable-object created/deleted booleans, cleanup completeness, a machine-readable failure code, SHA-256 evidence hash, and admin ingestion metadata. It does **not** persist Stripe Customer IDs, Daily room names, webhook IDs/HMACs, raw provider payloads, secrets, card/payment data, customer data, or raw failure messages.
- Added admin-only, idempotent `admin_ingest_booking_provider_rehearsal(...)`. Identical replays are accepted as replays; conflicting evidence for the same run ID is rejected. Status is derived server-side as `passed`, `failed`, or `cleanup_incomplete`.
- The separately gated provider preview rehearsal hashes its mode-0600 local evidence artifact and ingests only the minimized evidence/hash through the authenticated RPC boundary. Registry persistence failure fails the rehearsal rather than silently discarding operational evidence.
- Added append-only `lesson_booking_provider_rehearsal_reconciliations` plus `admin_reconcile_booking_provider_rehearsal_cleanup(...)`. Reconciliation records an admin, reason code, and evidence reference after independent cleanup verification; it does not call Stripe or Daily or mutate the original rehearsal evidence.
- Admin review queue emits an urgent generic `provider_rehearsal_cleanup` item for unreconciled cleanup-incomplete preview runs without exposing provider/run identifiers through the queue surface.
- Launch health advanced to `smart_parrot_booking_launch_health_v3`, retaining prior counts and adding `provider_rehearsal_missing`, `provider_rehearsal_latest_failed`, `unreconciled_provider_cleanup_failures`, and `retention_reviews_due_next_30d`. The endpoint remains count-only and returns no customer/provider identifiers, evidence bodies, legal-hold reasons, or secrets.
- Retention governance UI exposes reviewed class approval/revocation RPCs. Approval requires positive whole-day active retention, optional archive retention, source authority, review reference, and machine-readable reason; revocation returns the class to fail-closed/unapproved status. The browser performs no direct retention-table writes and cannot enable automatic erasure.

## Phase 4C5B1 — provider rehearsal readiness/history — complete in repository, not deployed

Verified engineering checkpoint: `6f8141cda24189b74f877c59a493e654ca1a8d4d`.

### Implemented

- Added admin-only `admin_provider_rehearsal_history(...)`, returning only minimized internal run/timing/status fields, a combined provider-identity-verification boolean, reconciliation status/time, and a server-computed seven-day recency flag.
- The history surface deliberately excludes evidence hashes, Stripe Customer IDs, Daily room names, webhook IDs/HMACs, provider payloads, secrets, payment data, and customer data. It performs no provider call and no mutation.
- Added admin-only `admin_provider_rehearsal_readiness(...)`. A future full provider preview path is now considered ready only when the **latest** rehearsal passed, completed within seven days of server time, and there are zero unreconciled cleanup-incomplete rehearsals.
- An older passing rehearsal cannot mask a newer failed rehearsal. A manually reconciled cleanup failure clears the unresolved-cleanup count but still requires a later passing rehearsal before readiness returns to `ready`.
- Future-dated rehearsal rows beyond a five-minute clock-skew allowance are excluded from history/latest-run readiness selection; browser time is never accepted as authority.
- Added executable PostgreSQL scenarios for missing, stale, failed-latest, fresh-pass, cleanup-incomplete, reconciliation, post-reconciliation pass, minimized-history leakage checks, and non-admin denial.
- Added a static Phase 4C5B1 boundary regression and CI wiring. Both existing preview E2E drivers remain closed by default and no provider call was made in CI.

### Verification

All three workflows passed on engineering SHA `6f8141cda24189b74f877c59a493e654ca1a8d4d`:

- `Lesson booking foundation` run **#148** — passed. This included Deno typechecking, every prior booking/payment/security boundary, the new Phase 4C5B1 static boundary, both closed preview-E2E gates, every migration, all executable PostgreSQL behavior scenarios including the new rehearsal-readiness suite, and the Vite build.
- `Heathrow Piccadilly Compatibility` run **#188** — passed.
- `Game Smoke Test` run **#258** — passed, including application build, browser smoke execution, and evidence upload.

## Research refreshed for Phase 4C5B1 on 2026-09-20

### Stripe

- Stripe's current testing guidance says sandbox transactions do not move funds, test API keys must be used for test API calls, and automated test code should use test PaymentMethods such as `pm_card_visa` rather than real card details.
- Stripe's current PaymentIntent capture contract still requires an uncaptured intent to be in `requires_capture`; capture remains bounded by the amount originally authorized. The future full preview driver must therefore keep the existing manual-capture server boundary rather than inventing a browser payment transition.
- References: https://docs.stripe.com/testing , https://docs.stripe.com/api/payment_intents/capture

### Supabase

- Current Supabase guidance keeps publishable keys browser-safe only with RLS and keeps secret keys backend-only because they bypass RLS. Hosted Edge Functions expose deployment identity through `DENO_DEPLOYMENT_ID`, which remains part of the preview-project guard.
- Supabase is deprecating legacy `anon` / `service_role` keys by the end of 2026, so preview readiness continues to prefer `sb_publishable_...` and modern backend secret context.
- Authenticated admin operations continue to use user identity plus server-side role checks rather than a browser-held secret/service-role credential.
- References: https://supabase.com/docs/guides/functions/secrets , https://supabase.com/docs/guides/functions/auth , https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys

### Daily

- Daily's current webhook configuration surface includes webhook/domain identity and sensitive HMAC material, while disposable preview rooms can be deleted through the room API. The rehearsal-history/readiness RPCs therefore collapse provider identity to a boolean and return none of those identifiers or secrets.
- References: https://docs.daily.co/reference/rest-api/webhooks/get-webhook , https://docs.daily.co/reference/rest-api/rooms/delete-room

### Base44

- Base44's current backend guidance keeps secrets, external API calls, and sensitive business logic server-side and supports row-level permissions. Base44/React remains the UI shell rather than authority for money, provider identity, or rehearsal readiness.
- Reference: https://base44.com/backend

### France/EU retention

- CNIL guidance dated 2 April 2026 continues to require purpose-based retention rather than indefinite storage and separates active retention from restricted intermediate archiving.
- This slice introduced no new retention duration, erasure worker, or legal assumption; existing reviewed approval/legal-hold controls remain fail closed.
- Reference: https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees

## Next coherent slice

**Phase 4C5B2 — rehearsal operator UX + disabled full-preview-path preflight:**

1. wire the minimized rehearsal history/readiness RPCs into the authenticated lesson-operations UI;
2. let an authorized admin attach an existing cleanup reconciliation reason/reference from that minimized history view without exposing provider object IDs, raw evidence, or hashes;
3. add API/UI regressions showing stale/failed/latest-run states and cleanup reconciliation correctly remain server-authoritative;
4. scaffold a separately gated, still-disabled full preview booking → Stripe test authorization → Daily attendance → deterministic settlement driver that refuses to start unless Phase 4C5B1 readiness is `ready` and the existing Supabase/Stripe/Daily preview identities are independently verified;
5. keep deploy, publish, cron activation, production email, live Stripe, automatic retention deletion, and Stripe Connect disabled.

## External configuration still needed for real provider rehearsal/E2E

Repository engineering can continue without these, but provider integration cannot be exercised until a safe preview environment is explicitly configured:

- dedicated Smart Parrot Supabase preview/test project (or explicit approval of an existing safe project);
- `SMART_PARROT_PREVIEW_PROJECT_REF`, preview `VITE_SUPABASE_URL`, browser `sb_publishable_...` key, and a short-lived preview admin access token;
- modern backend `sb_secret_...` context stored only server-side/Vault;
- `SMART_PARROT_PROVIDER_E2E_ENABLED=1` only in the approved preview project;
- Stripe test/sandbox `STRIPE_SECRET_KEY`, `SMART_PARROT_STRIPE_TEST_ACCOUNT_ID`, Checkout webhook signing secret, and separate dispute webhook signing secret;
- Daily test API key, preview webhook ID, preview domain ID/name, preview-only room prefix, webhook HMAC secret, and a test webhook delivery;
- HTTPS `APP_URL` and public HTTPS `TERMS_OF_SERVICE_URL`;
- real durable-medium delivery provider for consumer-law acknowledgements;
- reviewed retention durations plus source authority and review reference for each mandatory class;
- before compliance launch: approved French consumer-law classification/copy and consumer mediator details.

## Release status

**NO DEPLOY / NO MERGE.** Phase 4C5B1 is repository-complete and verified at `6f8141cda24189b74f877c59a493e654ca1a8d4d`. The provider-write driver remains inert by default and was not executed. PR #16 stays intentionally draft and unmerged until preview/provider/legal gates are explicitly approved and verified.
