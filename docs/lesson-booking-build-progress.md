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
- Supabase Postgres/Auth/RLS/Edge Functions/Cron is authoritative for booking, identity, policy, evidence, time, payment state, cancellation, settlement, compliance, retention governance, and operations state.
- Browser time, identity, attendance time, tutor/price/policy fields, cancellation fees, payment transitions, compliance delivery, provider dispute state, retention decisions, provider-environment identity, and admin evidence decisions are never authoritative.
- Stripe uses hold-before/capture-after. Near-term lessons authorize at Checkout; later lessons save a payment method and a secret-authenticated worker authorizes when due.
- Daily provides online attendance evidence. Rooms are private and booking-scoped; server/provider evidence remains separate from browser state.

## Completed phases

- **Phase 0A–0C:** authoritative schema/RLS/evidence foundation, bounded availability, browser-safe Supabase client, isolated booking preview.
- **Phase 1A–1C:** atomic booking/consent, Stripe test-only Checkout + manual authorization, deferred off-session holds, failed-hold evidence and customer-present recovery.
- **Phase 2A–2B:** signed/replay-safe Daily/server attendance evidence and deterministic test-only settlement/capture/release.
- **Phase 3A–3B:** server-authoritative cancellation/withdrawal foundation, compliance acknowledgement outbox, My Lessons UX, immutable policy view, retry/dead-letter handling.
- **Phase 4A–4C3:** admin review/evidence operations, test-only dispute intake, out-of-order dispute hardening, launch health/readiness, retention/legal-hold controls, preview-project identity protection, and provider-write-disabled preview E2E gate.
- **Phase 4C4 (current checkpoint):** separately gated provider identity/readiness checks, a disposable provider-write preview rehearsal with deterministic cleanup evidence, and audited retention-duration approval/revocation hooks.

## Phase 4C4 — provider E2E staging + retention approval hooks — complete in repository, not deployed

Verified engineering checkpoint: `dfb2537f1ba9e8e78b5b35a33392ac56a3f71d55`.

### Implemented

- Added authenticated/admin-only `booking-provider-preview-readiness` as a **separate** provider identity gate. The existing `booking-preview-readiness` remains no-network and continues to verify local/configuration readiness only.
- Provider readiness stays blocked unless `SMART_PARROT_PROVIDER_E2E_ENABLED=1` and the deployed Supabase function identity matches the explicitly configured Smart Parrot preview project.
- Stripe provider identity is read-only and fail-closed: only a `sk_test_...` secret is accepted, `GET /v1/account` is used to verify the current account against `SMART_PARROT_STRIPE_TEST_ACCOUNT_ID`, and no account ID or provider response body is returned.
- Daily provider identity is read-only and fail-closed: the configured preview webhook is retrieved from Daily and its `uuid`/`domainId` must match the expected preview values. FAILED/INACTIVE webhook state is rejected. A preview-only Daily domain name and `sp-preview-*` room namespace are also required.
- Added `scripts/lesson-booking-provider-preview-e2e.mjs` as a second, separately gated provider-write rehearsal. Normal CI exits without any provider call. Running it requires both `SMART_PARROT_PROVIDER_PREVIEW_E2E=1` and `SMART_PARROT_PROVIDER_WRITES_CONFIRMED=preview-only`, exact preview Supabase identity, short-lived admin auth, test Stripe identity, and Daily preview identity.
- The provider-write rehearsal deliberately creates only two disposable provider objects: a Stripe **test** Customer and a short-lived private Daily preview room. It creates no booking, PaymentIntent, charge, capture, refund, payout, email, deployment, or publish action.
- Disposable objects are cleaned up in `finally`; a local mode-0600 JSON artifact records non-secret run/correlation IDs, provider identity pass/fail, created/deleted booleans, and cleanup completeness. Incomplete cleanup fails the run so it cannot be mistaken for a successful rehearsal.
- Added reviewed retention-policy approval metadata: `approved_by` and `approval_reference` are now required alongside duration/source authority before a class can be considered approved.
- Added admin-only `admin_approve_booking_retention_class(...)` and `admin_revoke_booking_retention_class_approval(...)`. Approval requires explicit positive duration(s), documented source authority, review reference, and reason code; revocation returns the class to fail-closed/unapproved state.
- Added append-only `lesson_booking_retention_approval_events` so approval and revocation are independently auditable. No automatic deletion, anonymisation, or archive mover was introduced.
- Base preview readiness now requires each mandatory retention class to have duration, source authority, approver identity, review reference, and approval timestamp. Direct table edits that do not satisfy the reviewed-approval constraint fail closed.
- Added Phase 4C4 static boundary coverage, executable PostgreSQL approval/revocation scenarios, Deno typechecking of the new provider-readiness function, closed provider-write E2E gate coverage, and CI wiring.

### Verification

All three workflows passed on engineering SHA `dfb2537f1ba9e8e78b5b35a33392ac56a3f71d55`:

- `Lesson booking foundation` run **#136** — passed. It completed Deno checks, all prior booking/payment/security regressions, the new Phase 4C4 provider-staging boundary regression, both closed E2E gates, every migration on ephemeral PostgreSQL, all behavior scenarios including new retention approval/revocation tests, and the Vite build.
- `Heathrow Piccadilly Compatibility` run **#181** — passed.
- `Game Smoke Test` run **#251** — passed, including build, app startup, browser smoke execution, and evidence upload.

No provider-write rehearsal was executed because the repository does not currently have an explicitly approved Smart Parrot preview Supabase project and preview/test provider credentials. CI verifies that the provider-write gate remains closed without them.

## Research refreshed for Phase 4C4 on 2026-09-20

### Stripe

- Stripe test/sandbox calls remain isolated from live money movement; test API keys are the required boundary for preview provider calls.
- Stripe exposes `GET /v1/account` for the account associated with the current API credentials. Phase 4C4 uses that read-only call before any disposable provider object can be created.
- The staging rehearsal creates only a test Customer and deletes it during deterministic cleanup; it does not create a PaymentIntent or charge.
- References: https://docs.stripe.com/api/accounts/retrieve , https://docs.stripe.com/testing , https://docs.stripe.com/keys

### Supabase

- Hosted Edge Functions expose `DENO_DEPLOYMENT_ID`, which contains the project reference and remains the server-side project-identity signal used before provider rehearsal.
- Separate staging/preview and production projects remain the intended environment model. Publishable browser keys stay separate from backend secret credentials.
- References: https://supabase.com/docs/guides/functions/secrets , https://supabase.com/docs/guides/deployment/managing-environments , https://supabase.com/docs/guides/api/api-keys

### Daily

- Daily exposes `GET /webhooks/{id}` with the webhook UUID, state, and associated `domainId`. The response can also contain the webhook HMAC, so Phase 4C4 compares only the necessary identity fields and never returns/logs the provider payload or HMAC.
- Existing Smart Parrot room creation already uses Daily private rooms; the preview rehearsal uses a separately namespaced `sp-preview-*` room and deletes it after verification.
- Reference: https://docs.daily.co/reference/rest-api/webhooks/get-webhook

### Base44

- Base44 remains the React/app shell. Elevated provider, money, retention, and environment-identity authority stays server-side rather than in the user-facing Base44 client.
- Reference: https://docs.base44.com/developers/backend/client

### France/EU retention

- CNIL guidance continues to require retention periods to be purpose-based and documented. Where a legal duration is not prescribed, the controller must determine and justify one; intermediate/legal-claim archiving is a distinct restricted purpose.
- Phase 4C4 therefore adds an auditable approval/revocation mechanism but still does **not** invent a duration or enable erasure automatically.
- References: https://www.cnil.fr/fr/les-durees-de-conservation-des-donnees , https://www.cnil.fr/fr/archivage-des-donnees

## Next coherent slice

**Phase 4C5 — launch-rehearsal evidence + operator approval UX:**

1. add an append-only preview-rehearsal registry that can ingest the non-secret provider rehearsal artifact/hash and surface incomplete cleanup/reconciliation to the admin review queue;
2. expose reviewed retention-class approval/revocation in the admin operations UI through the existing authenticated RPC boundary, with explicit source/reference/reason inputs and no direct table writes;
3. add count-only launch-health signals for missing provider rehearsal, failed cleanup, and retention approvals approaching their review date without exposing provider/customer identifiers;
4. prepare (but keep disabled) the full preview booking → Stripe test authorization → Daily attendance → deterministic settlement evidence driver, reusing the two independent readiness gates before any test payment object is created;
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

**NO DEPLOY / NO MERGE.** Phase 4C4 is repository-complete and verified at `dfb2537f1ba9e8e78b5b35a33392ac56a3f71d55`. The new provider-write driver remains inert by default and was not executed. PR #16 stays intentionally draft and unmerged until preview/provider/legal gates are explicitly approved and verified.
