# Lesson Booking Build Progress

Last updated: 2026-09-20

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute` without explicit instruction).
- Working branch: `agent/lesson-booking-blueprint`.
- Draft PR: #16.
- Base/default branch: `main` at `210345bbe09bc46c468fb6a7e0eee0596e8d902b` at the start of this run.
- `main` remains untouched.
- Nothing from this branch has been merged, deployed, published, or applied to a live Supabase, Stripe, Daily, Base44, cron, or email environment.
- Stripe execution remains repository-locked to test-mode keys/objects. Live Stripe objects/keys remain rejected.
- Marketplace / Stripe Connect remains out of scope until the single-school path is stable.

## Architecture lock

- Base44/React is the app shell.
- Supabase Postgres/Auth/RLS/Edge Functions/Cron is authoritative for booking, identity, policy, evidence, time, payment state, cancellation, settlement, compliance, retention governance, and operations state.
- Browser time, identity, attendance time, tutor/price/policy fields, cancellation fees, payment transitions, compliance delivery, provider dispute state, retention decisions, and admin evidence decisions are never authoritative.
- Stripe uses hold-before/capture-after. Near-term lessons authorize at Checkout; later lessons save a payment method and a secret-authenticated worker authorizes when due.
- Daily provides online attendance evidence. Rooms are private and booking-scoped; server/provider evidence remains separate from browser state.

## Completed phases

- **Phase 0A–0C:** authoritative schema/RLS/evidence foundation, bounded availability, browser-safe Supabase client, isolated booking preview.
- **Phase 1A–1C:** atomic booking/consent, Stripe test-only Checkout + manual authorization, deferred off-session holds, failed-hold evidence and customer-present recovery.
- **Phase 2A–2B:** signed/replay-safe Daily/server attendance evidence and deterministic test-only settlement/capture/release.
- **Phase 3A–3B:** server-authoritative cancellation/withdrawal foundation, compliance acknowledgement outbox, My Lessons UX, immutable policy view, retry/dead-letter handling.
- **Phase 4A–4C2:** admin review/evidence operations, test-only Stripe dispute intake, out-of-order dispute hardening, launch-health/readiness, retention/legal-hold metadata, provider-write-disabled preview E2E gate.
- **Phase 4C3 (current checkpoint):** audited retention operations in the admin workflow, count-only retention-governance alerts, explicit Supabase preview-project identity guards, stronger preview-E2E target refusal, and preserved legacy dispute visibility.

## Phase 4C3 — retention operations + preview identity hardening — complete in repository, not deployed

Verified engineering checkpoint: `566f4c70d63adecf3374914aa01b8b1e0af85e2c`.

### Implemented

- Added admin-only `admin_booking_retention_options()` so React can offer only server-defined retention classes. It exposes safe metadata only and reports `approved_duration_required` until a class has an approved duration and documented source authority.
- Integrated per-booking retention governance into `/lesson-booking-admin`: operators can inspect classification, set a server-defined retention class, place/release a legal hold, provide a machine-readable reason code, and set a review date. Legal holds require a review date. All changes continue through the audited server RPC; the browser receives no secret/service-role credentials and performs no direct retention-table write.
- Added launch-health/queue signals for:
  - bookings with evidence but no retention classification;
  - overdue retention/legal-hold reviews;
  - retention classes still missing approved duration/source authority.
- Launch-health schema is now `smart_parrot_booking_launch_health_v2`. The result remains counts-only and explicitly grants no authority to move money, erase evidence, or mutate provider dispute state.
- Preserved both provider-current unmatched Stripe dispute signals and legacy pre-projection unmatched dispute evidence. Legacy records continue to appear as `provider refresh required` instead of disappearing during the Phase 4C3 queue upgrade.
- Hardened `booking-preview-readiness` with an explicit `SMART_PARROT_PREVIEW_PROJECT_REF`. The Edge Function verifies its `DENO_DEPLOYMENT_ID` belongs to that configured project and reports only a boolean/status result; it never returns the project ref or a secret value.
- Hardened `scripts/lesson-booking-preview-e2e.mjs`: when the gate is enabled it refuses an unknown target, refuses a ref explicitly marked as production, and requires `VITE_SUPABASE_URL` to exactly match `<approved-preview-ref>.supabase.co`. The current driver still performs no Stripe/Daily/provider write.
- Added Phase 4C3 static regressions and executable PostgreSQL behavior scenarios. Destructive retention primitives remain absent; automatic erasure remains disabled.

### Verification

Current verified engineering checkpoint: `566f4c70d63adecf3374914aa01b8b1e0af85e2c`.

`Lesson booking foundation` run **#132** passed completely on that SHA:

- Deno typechecking for booking Edge Functions, including preview readiness;
- all foundation/browser/reservation/Stripe/hold/attendance/settlement/cancellation/compliance/admin/dispute boundary regressions;
- Phase 4C2 and Phase 4C3 preview/retention boundary checks;
- the closed preview-E2E execution gate;
- every booking migration on ephemeral PostgreSQL;
- settlement, cancellation, compliance, admin, dispute, launch-hardening, preview-retention, and new retention-operations behavioral scenarios;
- full Vite application build.

CI also caught and drove two useful fixes during this slice:

1. run **#129** exposed that the first queue replacement omitted the pre-projection legacy unmatched Stripe-dispute fallback; the follow-up migration restores that operator visibility;
2. run **#130** exposed a stale Phase 4C behavioral assertion that still expected launch-health schema v1; the scenario was upgraded to assert schema v2 and the new retention-governance counts while retaining the no-provider/customer-leak checks.

Compatibility workflows on the same SHA were triggered after the final test correction; their final status is checked again at the beginning of the next run if they are still executing when this checkpoint is written.

## Research refreshed for Phase 4C3 on 2026-09-20

### Stripe

- Current Stripe guidance keeps secret keys server-side and distinguishes sandbox/test keys (`sk_test_...`) from live keys (`sk_live_...`). Webhook signing secrets are separate credentials. General Sandboxes isolate test data/configuration and do not move real money.
- The Smart Parrot preview path therefore remains test/sandbox-only; no live key is accepted or used.
- References: https://docs.stripe.com/keys , https://docs.stripe.com/testing-use-cases , https://docs.stripe.com/webhooks

### Supabase

- Supabase's current Edge Function environment exposes `DENO_DEPLOYMENT_ID`, whose value includes the project ref, function ID, and version. Phase 4C3 uses that server-side deployment identity to verify that an explicitly configured preview project is actually hosting the readiness function before future provider E2E can proceed.
- Browser publishable keys remain distinct from backend secret keys; secret/service credentials remain server-only and bypass RLS. Supabase continues its 2026 migration from legacy `anon`/`service_role` keys toward publishable/secret keys.
- References: https://supabase.com/docs/guides/functions/secrets , https://supabase.com/docs/guides/api/api-keys , https://supabase.com/docs/guides/platform/migrating-to-publishable-and-secret-api-keys

### Daily

- Daily webhook deliveries can be retried/duplicated and provider event IDs/timestamps are part of the delivery model. HMAC verification remains required. Existing booking code continues to treat provider webhook evidence as signed/idempotent server evidence rather than browser state.
- Reference: https://docs.daily.co/reference/rest-api/webhooks

### Base44

- Base44's user-facing client remains user-scoped; sensitive/elevated operations belong in server-side functions. The booking admin surface therefore consumes authenticated Supabase RPC/Edge Function results and never receives service-role credentials.
- Reference: https://docs.base44.com/developers/backend/client

### France/EU retention

- CNIL's 2026 retention guidance continues to require purpose-based retention rather than indefinite storage. Intermediate/evidentiary archiving can be justified separately for legal obligations or claims, should contain only necessary data, and should have restricted access. Where no statutory duration exists, the controller determines and documents the duration from purpose/necessity.
- Phase 4C3 therefore exposes governance gaps to operators but still does not invent French retention durations or run deletion automatically.
- References: https://www.cnil.fr/fr/les-durees-de-conservation-des-donnees , https://www.cnil.fr/fr/archivage-des-donnees

## Next coherent slice

**Phase 4C4 — provider E2E staging + retention approval hooks:**

1. add a second, separately gated provider-write preview driver that remains inert by default and refuses any target unless preview-project identity and test/sandbox provider identities are independently verified;
2. add Stripe sandbox/account identity assertions and Daily preview-domain/room-prefix assertions without logging secret values;
3. make provider-write tests create only disposable preview/test objects with deterministic cleanup/reconciliation evidence, while retaining hard live-mode refusal;
4. add a controlled retention-policy approval path that can accept durations/source authority only when an explicit reviewed configuration is supplied; continue to prohibit automatic erasure until deletion/anonymisation rules and legal holds are separately approved;
5. keep deploy, publish, cron activation, production email, live Stripe, automatic retention deletion, and Stripe Connect disabled.

## External configuration still needed for real provider E2E

Repository engineering can continue without these, but real provider integration cannot be exercised until a safe preview environment is explicitly configured:

- dedicated Smart Parrot Supabase preview/test project (or explicit approval of an existing safe project);
- `SMART_PARROT_PREVIEW_PROJECT_REF`, preview `VITE_SUPABASE_URL`, and browser `sb_publishable_...` key;
- modern backend `sb_secret_...` context stored only server-side/Vault (legacy `service_role` should be migrated before launch);
- Stripe sandbox/test `STRIPE_SECRET_KEY`, Checkout webhook signing secret, and separate dispute webhook signing secret;
- HTTPS `APP_URL` and public HTTPS `TERMS_OF_SERVICE_URL`;
- Daily test API key, webhook HMAC secret, and a preview webhook delivery;
- real durable-medium delivery provider for consumer-law acknowledgements;
- approved retention durations and documented legal/accounting/DPO source authority for each class;
- before compliance launch: approved French consumer-law classification/copy and consumer mediator details.

## Release status

**NO DEPLOY / NO MERGE.** Phase 4C3 is repository-complete and verified at `566f4c70d63adecf3374914aa01b8b1e0af85e2c`. Provider E2E, legal wording, retention-duration approval, and environment configuration remain gated. PR #16 stays intentionally draft and unmerged until those gates are explicitly approved and verified.
