# Lesson Booking Build Progress

Last updated: 2026-09-21

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute` without explicit instruction).
- Working branch: `agent/lesson-booking-blueprint`.
- Draft PR: #16.
- Default branch refreshed this run: `main` at `7f764e5c2b691874b6049e706f1c09026c1eafaf` (`base44-builder[bot]`, `Update base44 packages`).
- Booking branch deliberately remains unrebased. Current comparison with `main`: **diverged, 113 commits ahead / 15 behind**, merge base `210345bbe09bc46c468fb6a7e0eee0596e8d902b`.
- Verified Phase 4C5H engineering checkpoint: **`e5e7c8e2f583e830a73ecc0607873a1e2ef71811`**.
- Previous full booking-foundation checkpoint: `944f65572db9679c1e59538007903238306da85b` (Phase 4C5G, foundation run #162 green).
- `main` remains untouched. Nothing has been merged or published to Base44/production.
- Approved Supabase PREVIEW/TEST project only: `mrzzbhqzxshtbqvxkcjn`, region `eu-west-1`, URL `https://mrzzbhqzxshtbqvxkcjn.supabase.co`.
- Preview project health refreshed this run: `ACTIVE_HEALTHY`, Postgres 17.6.1.166.
- Preview migrations remain applied through `20260920222136 / lesson_booking_phase4c5g_operator_bootstrap`. Phase 4C5H required no database migration.
- The 12 booking Edge Functions remain ACTIVE; `daily-webhook` remains version 2 and the other booking functions remain version 1. Phase 4C5H deployed no function.
- Stripe remains TEST/SANDBOX only. Live Stripe keys/objects are inadmissible. Marketplace / Stripe Connect remains deferred.

## Architecture lock

- Base44/React is the frontend shell; app id remains `69c16c52c86d161e74940243`.
- Supabase Postgres/Auth/RLS/Edge Functions/Cron remains authoritative for identity, booking, policy, evidence, time, payment state, cancellation, settlement, compliance, provider readiness, and preview-run continuation.
- No browser-authoritative money, attendance, identity, provider-state, or time transition is allowed.
- Stripe continues to use hold-before/capture-after: near-term manual authorization and later setup-mode/payment-method storage followed by secret-worker authorization when due.
- Daily supplies signed/server-side attendance evidence. Private booking-scoped rooms/tokens remain required.
- Preview orchestration may call existing authoritative server boundaries but may not recreate Stripe, Daily, settlement, attendance, or server-time logic client-side.

## Completed phases

- **Phase 0A–0C:** schema/RLS/evidence foundation, bounded availability, browser-safe Supabase client, isolated booking preview.
- **Phase 1A–1C:** atomic booking/consent, Stripe test-only Checkout/manual authorization, deferred holds, failed-hold recovery.
- **Phase 2A–2B:** signed/replay-safe Daily/server attendance and deterministic settlement/capture/release.
- **Phase 3A–3B:** cancellation/withdrawal foundation, compliance acknowledgement delivery, My Lessons UX, immutable policy view.
- **Phase 4A–4C4:** admin queue/evidence, test dispute intake, launch health/readiness, retention/legal hold, provider staging.
- **Phase 4C5A–4C5D:** provider-rehearsal evidence/readiness, operator preflight, full-preview contract, disabled execution shell, minimized observer.
- **Phase 4C5E:** exact-preview Supabase transport and durable server-authoritative preview run/checkpoint registry; `public.forbid_change()` search-path hardening.
- **Phase 4C5F:** resumable executor and redacted credential/readiness manifest.
- **Phase 4C5G:** authoritative operator/session-role bootstrap, recent signed Stripe webhook proof, Daily base64-HMAC correction and signed test fast path.
- **Phase 4C5H (current):** synthetic preview fixture-principal lifecycle plus bounded signed-provider rehearsal preparation.

## Phase 4C5H — synthetic preview fixture principals + bounded signed-provider preparation — complete

Verified engineering checkpoint: **`e5e7c8e2f583e830a73ecc0607873a1e2ef71811`**.

### Implemented

- Added `scripts/lesson-booking-full-preview-fixture-principals.mjs`.
  - Hard-locks every fixture plan to project ref `mrzzbhqzxshtbqvxkcjn` and the exact approved preview URL.
  - Requires a UUID preview run id and creates exactly two deterministic fixture identities: `student` and `admin`.
  - Uses the reserved synthetic `example.invalid` email namespace and stores only fixture/run/role metadata; no real names or production identities are accepted by the plan.
  - Fixture leases are bounded to 15–120 minutes (90-minute default).
  - Provisioning requires a separate explicit write gate, `SMART_PARROT_PREVIEW_FIXTURE_WRITES_ENABLED=1`, plus an `sb_secret_...` backend key. Publishable/JWT-style key classes fail closed.
  - Runtime passwords are high entropy and never appear in returned summaries. Public output also omits fixture user IDs and emails.
  - User IDs are deterministically derived from the preview run and role. Re-running the same plan reuses only an exact metadata/email match; an ID collision with a non-fixture or another run fails closed and is never deleted.
  - Partial provisioning performs compensating deletion only for users created by that invocation. If compensating cleanup itself fails, the result becomes reconciliation-required rather than silently continuing.
  - Cleanup first probes authoritative booking/consent/Stripe-link references. A principal linked to financial/booking evidence is preserved so append-only evidence and foreign-key integrity cannot be destroyed by test cleanup.
- Added `scripts/lesson-booking-preview-fixture-principals.mjs`.
  - Trusted Node-only runner using `@supabase/supabase-js` with `persistSession=false`, `autoRefreshToken=false`, and `detectSessionInUrl=false`.
  - Uses the Supabase Auth Admin API only after the fixture write gate is explicitly open.
  - Applies authoritative `profiles.role` through the preview backend and re-reads the role before declaring a fixture ready.
  - Supports only `provision` or evidence-aware `cleanup` actions.
  - With the gate closed (the default and CI state), exits successfully without creating/deleting a user or touching provider state.
- Added a bounded signed-provider preparation contract.
  - Requires synthetic fixtures plus recent proof for both independent Stripe webhook boundaries and a verified ACTIVE Daily signed-test webhook.
  - Even a completely green preparation returns `provider_writes_enabled=false`; the separate full-preview write gates remain mandatory.
- Added `scripts/check-lesson-booking-full-preview-fixture-principals.mjs` with regressions for:
  - exact preview identity and TTL enforcement;
  - deterministic two-role synthetic identities and `example.invalid` namespace;
  - backend-key/write-gate enforcement and wrong key-class rejection;
  - secret/password/user-id/email redaction from operator output;
  - idempotent rerun with no duplicate fixture creation;
  - collision refusal without deleting a pre-existing user;
  - compensating cleanup after partial provisioning failure;
  - evidence-aware cleanup that preserves linked student evidence while removing an unlinked admin fixture;
  - signed Stripe/Daily proof requirements with provider writes still hard-closed.
- Added `.github/workflows/lesson-booking-phase4c5h.yml` to make the Phase 4C5H regression, closed fixture-write gate, and production Vite build executable CI evidence.

### Verification

- Local isolated Node verification before push passed syntax plus the Phase 4C5H lifecycle regression.
- GitHub Actions **`Lesson booking Phase 4C5H` run #1** passed on exact engineering SHA `e5e7c8e2f583e830a73ecc0607873a1e2ef71811`.
  - Synthetic fixture principal lifecycle / signed-provider preparation regression: passed.
  - Fixture principal write gate closed in CI: passed.
  - Production Vite build: passed.
- Previous full `Lesson booking foundation` run **#162** remains green at Phase 4C5G SHA `944f65572db9679c1e59538007903238306da85b`; Phase 4C5H changes are isolated to preview tooling/workflow and did not modify migrations, Edge Functions, frontend runtime, or payment logic.
- No real fixture principals were provisioned this run because no approved preview `sb_secret_...` credential was supplied to the runner. This is the intended fail-closed state, not a repository blocker.
- No Supabase mutation, Stripe mutation, Daily mutation, Base44 deployment, default-branch merge/rebase, cron activation, or production operation occurred.

## Research refreshed for Phase 4C5H on 2026-09-21

### Stripe

- Stripe still requires webhook verification using the exact raw request body, `Stripe-Signature` header, and that endpoint's own `whsec_...` secret. Dashboard endpoint secrets and Stripe CLI listener secrets are distinct even though both use the same prefix.
- Stripe recommends idempotency keys for POST mutations; retries with the same key replay the first stored result and idempotency keys must not contain sensitive data. The fixture/rehearsal contract therefore derives identity from a run UUID rather than email/PII and still requires separate signed-delivery proof before provider rehearsal.
- References: https://docs.stripe.com/webhooks/signature and https://docs.stripe.com/api/idempotent_requests

### Supabase

- Supabase Auth Admin operations such as `auth.admin.createUser()` are server-only. New `sb_secret_...` keys are elevated backend credentials, bypass RLS through `service_role`, and must never be exposed to a browser or committed to source.
- Supabase's server guidance recommends a separate admin client with session persistence/auto-refresh/URL session detection disabled; the Phase 4C5H trusted runner uses that pattern.
- References: https://supabase.com/docs/reference/javascript/auth-admin-createuser , https://supabase.com/docs/guides/getting-started/api-keys , https://supabase.com/docs/guides/troubleshooting/performing-administration-tasks-on-the-server-side-with-the-servicerole-secret-BYM4Fa

### Daily

- Daily's current webhook reference still requires the signed endpoint-verification `{"test":"test"}` request to receive HTTP 200 within eight seconds.
- Its HMAC value is base64-encoded and must be decoded before computing HMAC-SHA256; duplicate deliveries are possible and should be deduplicated using event identifiers (or participant event type + session id where documented).
- Reference: https://docs.daily.co/reference/rest-api/webhooks

### Base44

- Base44's current SDK guidance keeps elevated/service-role operations in Base44-hosted backend functions; frontend clients operate with user-level permissions. This remains consistent with the architecture decision not to place Supabase secret/admin fixture operations in the Base44/React browser shell.
- Reference: https://docs.base44.com/sdk-getting-started/client

### France / EU privacy/testing

- CNIL guidance says development/testing should be performed in an environment distinct from production and on fictitious or anonymized data whenever possible; it also warns against placing authentication/encryption secrets in version control.
- Phase 4C5H therefore uses the dedicated Supabase preview project, synthetic `.invalid` identities, bounded fixture leases, and runtime-only backend credentials rather than production users/data.
- References: https://www.cnil.fr/fr/securite-encadrer-les-developpements-informatiques and https://www.cnil.fr/fr/tester-vos-applications

## Supabase preview/advisor status

- Project `mrzzbhqzxshtbqvxkcjn` is `ACTIVE_HEALTHY`.
- Applied migrations remain unchanged through Phase 4C5G; Phase 4C5H required no schema change.
- Existing intentional server-only RLS/no-policy notices, authenticated-callable SECURITY DEFINER RPC review items, `btree_gist` in `public`, and unindexed-FK performance suggestions remain review items. No warning was silenced or speculative index added in this slice.
- The prior `public.forbid_change()` mutable-search-path warning remains resolved.

## External configuration still needed before the first real provider-writing rehearsal

Repository work can continue without these, but the actual provider rehearsal stays fail-closed until all are present in the approved preview environment:

- an approved preview backend `sb_secret_...` key made available to the trusted fixture/session runner at runtime (never committed or sent to the browser);
- Stripe **TEST-mode** `STRIPE_SECRET_KEY`, exact expected test account ID, Checkout webhook signing secret, and separate dispute-webhook signing secret installed for the Supabase preview Edge Functions;
- at least one correctly signed TEST delivery accepted by each Stripe webhook endpoint so the signed-delivery proof is green;
- Daily preview API key, webhook ID/domain identity, safe preview room prefix, base64 webhook HMAC, and an `ACTIVE` webhook after its signed test handshake;
- provider E2E/write gates enabled only for the bounded rehearsal window;
- `APP_URL=https://asmartparrot.com`, public HTTPS terms URL, durable-medium acknowledgement delivery, final French consumer wording/mediator details, and reviewed retention durations before launch.

Connecting Stripe in Base44 alone still does **not** transfer Stripe server/webhook credentials into Supabase Edge Functions.

## Next coherent slice

**Phase 4C5I — ephemeral fixture sessions + bounded rehearsal handoff:**

1. add an in-memory synthetic fixture-session issuer that signs the deterministic preview fixtures in through the approved publishable/Auth boundary, feeds short-lived student/admin JWTs directly into the existing operator bootstrap, and never writes tokens/passwords to stdout, files, GitHub, Base44, or the run registry;
2. bind fixture lease expiry and evidence-aware cleanup state into the operator readiness result so an expired or cleanup-ambiguous fixture cannot start a provider rehearsal;
3. add a redacted provider-test transcript contract that records only expected signed Stripe/Daily evidence states and idempotency/run identifiers, never provider secrets or customer data;
4. add regressions for stale sessions, wrong fixture role, fixture/session subject mismatch, token leakage, duplicate session/rehearsal retry, and cleanup ambiguity;
5. produce a separate `main` divergence/conflict evidence report for the current 113-ahead/15-behind branch without merging or rebasing;
6. once the missing TEST credentials are installed, use the Phase 4C5G/H/I gates for the first bounded provider rehearsal. Never use live Stripe credentials.

## Release status

**NO MERGE / NO BASE44 OR PRODUCTION PUBLISH.** Phase 4C5H is repository-complete and CI-verified at `e5e7c8e2f583e830a73ecc0607873a1e2ef71811`. The approved Supabase preview project was inspected but not mutated in this slice. PR #16 remains intentionally draft. No provider-writing rehearsal, live Stripe operation, cron activation, production email, production migration, Base44 publication, or Stripe Connect work occurred.