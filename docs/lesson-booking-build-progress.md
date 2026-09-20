# Lesson Booking Build Progress

Last updated: 2026-09-20

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute` without explicit instruction).
- Working branch: `agent/lesson-booking-blueprint`.
- Draft PR: #16.
- Default branch refreshed at the start of this run: `main` at `210345bbe09bc46c468fb6a7e0eee0596e8d902b`.
- Verified Phase 4C5E engineering checkpoint: `29bc71b87eee0b3bd7ec02e959f2f4f94ca06abe`.
- `main` remains untouched. Nothing has been merged or published to Base44/production.
- The approved Supabase PREVIEW/TEST project is `mrzzbhqzxshtbqvxkcjn` (`eu-west-1`, `https://mrzzbhqzxshtbqvxkcjn.supabase.co`). It is not production.
- Stripe execution remains locked to test/sandbox credentials and objects. Live Stripe credentials/objects are inadmissible.
- Marketplace / Stripe Connect remains out of scope until the single-school path is stable.

## Architecture lock

- Base44/React is the application shell.
- Supabase Postgres/Auth/RLS/Edge Functions/Cron is authoritative for booking, identity, policy, evidence, time, payment state, cancellation, settlement, compliance, retention governance, provider-rehearsal readiness, and preview-run continuation state.
- Browser time, identity, attendance time, tutor/price/policy fields, cancellation fees, payment transitions, provider state, retention decisions, and preview checkpoints are never authoritative.
- Stripe uses hold-before/capture-after. Near-term lessons authorize at Checkout; later lessons save a payment method and a secret-authenticated worker authorizes when due.
- Daily supplies online attendance evidence. Rooms are private and booking-scoped; signed provider/server evidence remains separate from browser state.
- Preview/test orchestration must reuse the real authoritative server boundaries. The driver may coordinate approved endpoints but may not recreate payment, attendance, settlement, or time logic client-side.

## Completed phases

- **Phase 0A–0C:** authoritative schema/RLS/evidence foundation, bounded availability, browser-safe Supabase client, isolated booking preview.
- **Phase 1A–1C:** atomic booking/consent, Stripe test-only Checkout + manual authorization, deferred off-session holds, failed-hold evidence and customer-present recovery.
- **Phase 2A–2B:** signed/replay-safe Daily/server attendance evidence and deterministic test-only settlement/capture/release.
- **Phase 3A–3B:** server-authoritative cancellation/withdrawal foundation, compliance acknowledgement outbox, My Lessons UX, immutable policy view, retry/dead-letter handling.
- **Phase 4A–4C4:** admin review/evidence operations, test-only dispute intake, launch health/readiness, retention/legal-hold controls, preview identity protection, provider staging and reviewed retention approval hooks.
- **Phase 4C5A–4C5D:** append-only provider-rehearsal evidence, rehearsal readiness/history, operator preflight, full-preview contract, disabled execution shell, disposable fixture namespace, and minimized authoritative booking observer.
- **Phase 4C5E (current checkpoint):** approved Supabase preview transport contract + durable server-authoritative full-preview run/checkpoint registry.

## Phase 4C5E — approved preview transport + durable continuation — complete

Verified engineering checkpoint: `29bc71b87eee0b3bd7ec02e959f2f4f94ca06abe`.

### Implemented

- Added `supabase/migrations/20260920221000_lesson_booking_phase4c5e_preview_run_registry.sql`.
  - Added server-only `lesson_booking_full_preview_runs` keyed by the immutable run UUID, with optional unique booking binding, bounded scenario/state/pause values, monotonic revision, server observation time, and terminal state.
  - Added append-only `lesson_booking_full_preview_run_checkpoints` keyed by `(run_id, revision)`.
  - Both tables are RLS-enabled with direct `anon` / `authenticated` table access revoked. They are intentionally server/RPC-only; the Supabase `rls_enabled_no_policy` advisor notice is expected for this boundary.
  - No Stripe object ID, payment method, Checkout ID, Daily room name, raw provider payload, webhook secret, IP, user-agent, card detail, or evidence hash is stored in the run registry.
  - Added admin-only, `SECURITY DEFINER`, empty-search-path RPCs:
    - `admin_begin_booking_full_preview_run(...)` — idempotent run creation; conflicting scenario reuse fails closed.
    - `admin_bind_booking_full_preview_run(...)` — binds only a booking whose authoritative `bookings.client_request_id` exactly equals the run UUID; conflicting/ambiguous booking bindings fail closed.
    - `admin_refresh_booking_full_preview_run(...)` — derives the next minimized checkpoint from authoritative booking state, attendance evidence, and server time. Browser-supplied state cannot advance a run.
  - Repeated unchanged refreshes are replay-safe and do not append duplicate checkpoints. Real state transitions increment the revision and append a checkpoint.
  - Terminal `settled`/`cancelled` states cannot regress through the preview registry.
- Hardened existing append-only trigger helper `public.forbid_change()` by pinning `search_path=''`. The function only raises an exception and references no schema objects, so this is behavior-preserving and directly addresses the Supabase mutable-search-path advisor warning rather than silencing it.
- Added `scripts/lesson-booking-full-preview-run-registry.mjs`.
  - Strict allowlist validator for minimized run snapshots.
  - Unknown/provider-sensitive fields, bad UUIDs, invalid revisions, malformed timestamps, and terminal/completion inconsistencies fail closed.
- Added `scripts/lesson-booking-full-preview-supabase-transport.mjs`.
  - Hard-locks network identity to the approved Smart Parrot preview project ref `mrzzbhqzxshtbqvxkcjn` and exact Supabase URL.
  - Maps existing operation classes to the correct Supabase surfaces without embedding provider credentials:
    - `student_user` → Edge Function with `sb_publishable_...` + short-lived student JWT;
    - `admin_rpc` → PostgREST RPC with `sb_publishable_...` + short-lived admin JWT;
    - `secret_worker` → Edge Function with backend `sb_secret_...` on `apikey` and no secret-as-user-JWT shortcut.
  - Target/auth mismatches and unapproved targets fail closed. Stripe/Daily webhook endpoints are not invokable through this adapter.
  - The module is inert when executed directly; it does not auto-load or send credentials.
- Extended `scripts/lesson-booking-full-preview-execution-shell.mjs`.
  - Reservation now begins a durable run, calls the existing `create-booking` boundary using the same run UUID as `request_id`, then binds the returned booking to the run and validates the server snapshot.
  - Added server-authoritative `refreshRun({runId})`; continuation no longer depends on a browser-local checkpoint.
  - Existing payment/attendance/settlement operations remain delegated to their authoritative Edge Functions. The shell still contains no Stripe PaymentIntent creation/capture or Daily room mutation primitive.
- Added regressions in `scripts/check-lesson-booking-full-preview-run-registry.mjs` and extended the Phase 4C5D shell regression.
  - Exact approved project identity is enforced.
  - Student/admin/secret auth classes are mapped separately and tested.
  - Secret worker credentials are never sent as a bearer user token.
  - Duplicate reservation attempts reuse the same run/request identity.
  - Direct webhook/unauthorized target calls fail closed.
  - Provider-sensitive fields are rejected from the durable registry contract.
- Added executable PostgreSQL scenario `supabase/tests/lesson_booking_full_preview_run_registry_scenarios.sql`.
  - Tests run creation/replay, conflicting scenario rejection, booking/request identity mismatch rejection, pending Checkout, deferred hold, failed-hold recovery, attendance wait, in-progress lesson, settlement wait, terminal completion, stable terminal replay, append-only revision count, search-path hardening, and non-admin denial.
- Updated `.github/workflows/lesson-booking-foundation.yml` so every booking build now runs the 4C5E transport/registry regression and PostgreSQL scenario.

### Verification

- `Lesson booking foundation` run **#160** passed on exact engineering SHA `29bc71b87eee0b3bd7ec02e959f2f4f94ca06abe`.
  - Phase 4C5E JS transport/run-registry regression passed.
  - All prior booking/payment/security regressions passed.
  - All preview/provider/full-path execution gates remained closed in normal CI.
  - Every migration and PostgreSQL booking scenario, including the new 4C5E registry scenario, passed.
  - Edge Function Deno checks and the Vite production build passed.
- The Phase 4C5E migration was first transactionally dry-run against the approved Supabase preview project and rolled back successfully.
- After CI passed, `lesson_booking_phase4c5e_preview_run_registry` was applied successfully to preview project `mrzzbhqzxshtbqvxkcjn` as migration version `20260920202213`.
- Post-apply catalog verification confirms:
  - both new tables exist with RLS enabled and zero preview rows;
  - all three new RPCs are `SECURITY DEFINER` with an empty `search_path`;
  - `public.forbid_change()` now has an empty `search_path`.
- A second attempt to run the full CI fixture directly through the Supabase connector was stopped by the connector database role's lack of write permission on the `auth` schema. This did **not** alter preview data; the same scenario already passed in ephemeral PostgreSQL CI. No production/provider write was attempted.

## Supabase advisor review after Phase 4C5E

Security advisor was rerun after applying the migration:

- The previous mutable-search-path warning for `public.forbid_change` is gone.
- `btree_gist` remains in `public`; this is unchanged and should be handled only with a dedicated extension-move compatibility test, not by blind relocation.
- RLS-with-no-policy notices remain for server-only tables, including the two new preview registry tables. These are intentional because direct client table privileges are revoked and access is via guarded admin RPCs.
- Supabase flags authenticated-callable `SECURITY DEFINER` RPCs, including the three new admin RPCs. That is intentional for the current API shape: each new RPC immediately calls `private.smart_parrot_require_admin(auth.uid())`, has an empty `search_path`, and has executable access granted only so authenticated admins can reach the server-side role check. Non-admin denial is covered by the SQL scenario.

Performance advisor was also rerun:

- Unindexed-FK notices remain, including three on the new registry (`created_by`, checkpoint `booking_id`, checkpoint `recorded_by`). No indexes were added blindly because the current continuation path is keyed by run PK / unique booking binding and there is no query evidence that those FK-side indexes are needed yet.
- Existing unused-index notices are expected in a nearly empty preview database and are not evidence that launch-critical indexes should be removed.

Advisor references:
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

## Research refreshed for Phase 4C5E on 2026-09-20

### Stripe

- Stripe's current idempotency guidance supports idempotency keys on POST mutations; the full-preview run UUID continues to anchor the existing booking idempotency instead of inventing a second money state machine.
- Manual capture remains the correct hold primitive. The real provider `capture_before` deadline remains authoritative because authorization windows vary.
- Preview execution remains sandbox/test only; no live key or live object is admissible.
- References: https://docs.stripe.com/api/idempotent_requests , https://docs.stripe.com/payments/place-a-hold-on-a-payment-method , https://docs.stripe.com/testing

### Supabase

- Current Edge Function authentication guidance keeps user JWT, backend secret-key, and independently signed webhook entry points separate. The new transport adapter preserves those classes rather than reusing one credential everywhere.
- Publishable keys are client-safe only with RLS/least privilege; `sb_secret_...` keys are backend-only and bypass RLS. The adapter therefore never exposes the backend secret to the browser contract.
- Supabase's current scheduling guidance uses Cron/pg_net with secrets kept outside client code; the existing worker boundaries remain the place to add preview scheduling once provider credentials are present.
- References: https://supabase.com/docs/guides/functions/auth , https://supabase.com/docs/guides/functions/secrets , https://supabase.com/docs/guides/getting-started/api-keys , https://supabase.com/docs/guides/functions/schedule-functions

### Daily

- Daily's current REST/webhook model continues to support server-authenticated disposable rooms plus signed webhook evidence. Unknown provider cleanup outcomes remain reconciliation work rather than a reason for blind automatic retries.
- References: https://docs.daily.co/reference/rest-api/rooms/delete-room , https://docs.daily.co/reference/rest-api/webhooks/get-webhook , https://docs.daily.co/reference/webhooks/events

### Base44

- Base44 remains the browser/application shell. The Supabase transport contract deliberately keeps backend secrets and provider mutations outside the Base44 browser bundle.
- Reference: https://docs.base44.com/

### France/EU / CNIL

- CNIL's 2026 retention guidance continues to require purpose-based, non-indefinite retention and data minimisation.
- The durable preview registry therefore stores operational state only and deliberately excludes raw Stripe/Daily payloads and customer/payment identifiers.
- No legal retention period or French consumer-law wording has been guessed; reviewed retention classes and approved legal copy remain separate launch gates.
- References: https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees , https://www.cnil.fr/fr/securite-tracer-les-operations , https://www.cnil.fr/fr/minimiser-les-donnees-collectees

## Next coherent slice

**Phase 4C5F — resumable preview executor + credential/readiness handoff:**

1. build a repository-only resumable preview executor that composes the approved Supabase transport and durable run registry, and always resumes from server state rather than browser/local state;
2. add explicit pause/resume envelopes for customer Checkout/SCA and failed-hold `fix-payment` so unattended automation cannot fake customer-present steps;
3. add a fail-closed credential/readiness manifest that verifies only presence/class/preview identity — never logs credential values — for publishable key, short-lived student/admin sessions, backend `sb_secret_...`, Stripe test account/webhooks, and Daily preview identity;
4. add a preview-safe worker invocation contract for hold/settlement cron calls without enabling provider writes in CI;
5. add regressions for credential-class confusion, expired/missing auth sessions, duplicate resume, stale run revision, terminal replay, provider cleanup ambiguity, and live Stripe refusal;
6. keep all provider-writing execution disabled until the missing Stripe/Daily TEST secrets are installed in Supabase preview and the user explicitly starts the real rehearsal.

## External configuration still needed for real provider rehearsal/E2E

The Supabase preview project itself is now configured and migrated. Remaining external requirements are:

- browser `sb_publishable_...` key plus a safe short-lived preview student/admin authentication path for the executor;
- backend `sb_secret_...` context available only to the approved preview executor/worker path;
- Stripe **test-mode** `STRIPE_SECRET_KEY`, expected Stripe test account ID, Checkout webhook signing secret, and separate dispute webhook signing secret stored in Supabase preview Edge Function secrets;
- Daily preview API key, webhook ID/domain identity, preview-only room prefix, webhook HMAC secret, and a successful signed test webhook delivery;
- HTTPS `APP_URL=https://asmartparrot.com` and public HTTPS `TERMS_OF_SERVICE_URL` in the preview provider configuration;
- real durable-medium delivery provider for consumer-law acknowledgements;
- reviewed retention durations/source authority for each mandatory class;
- before compliance launch: approved French consumer-law classification/copy and consumer mediator details.

Connecting Stripe in Base44 alone does not satisfy the Supabase Edge Function secret requirements.

## Release status

**NO MERGE / NO BASE44 OR PRODUCTION PUBLISH.** Phase 4C5E is engineering-complete at `29bc71b87eee0b3bd7ec02e959f2f4f94ca06abe`, CI-verified, and its bounded migration is installed only in the approved Supabase PREVIEW/TEST project. The approved transport contract exists but no Stripe/Daily provider-writing rehearsal was run because those test provider secrets are still absent. PR #16 remains intentionally draft and unmerged.
