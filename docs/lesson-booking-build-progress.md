# Lesson Booking Build Progress

Last updated: 2026-09-20

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy`.
- Working branch: `agent/lesson-booking-blueprint`.
- Draft PR: #16.
- Base branch: `main` at `210345bbe09bc46c468fb6a7e0eee0596e8d902b`.
- `main` remains untouched.
- Nothing from this branch has been merged, deployed, published, or applied to a live Supabase, Stripe, Daily, Base44, cron, or email environment.
- Stripe execution remains repository-locked to test-mode keys/objects. Live Stripe objects/keys remain rejected by the payment boundary.
- Marketplace / Stripe Connect remains out of scope until the single-school path is stable.

## Architecture lock

- Base44/React is the app shell.
- Supabase Postgres/Auth/RLS/Edge Functions/Cron is authoritative for booking, identity, policy, evidence, time, payment state, cancellation, settlement, compliance, and operations state.
- The browser may read explicitly safe data and invoke authenticated functions, but browser time, identity, attendance time, tutor/price/policy fields, cancellation fees, payment transitions, compliance delivery, provider dispute state, retention decisions, and admin evidence decisions are never authoritative.
- Stripe uses hold-before/capture-after. Near-term lessons authorize at Checkout; later lessons save the card and a secret-authenticated worker authorizes when due.
- Daily provides online attendance evidence. Rooms are private and booking-scoped; server/provider evidence remains separate from browser state.

## Completed phases

- **Phase 0A:** authoritative booking/payment/evidence schema, overlap exclusions, append-only evidence, RLS/least privilege, server-only Stripe identifiers/events.
- **Phase 0B:** immutable-evidence hardening, project-specific Auth trigger, bounded `available_slots(...)` RPC backed by a private helper.
- **Phase 0C:** browser-safe Supabase publishable-key client, booking-scoped Auth, read-only availability adapter, isolated `/book-lessons` preview, frontend secret scanning.
- **Phase 1A:** atomic/idempotent server-authoritative reservation + consent; server-owned tutor/price/duration/currency/policy/hold strategy; database race protection.
- **Phase 1B:** Stripe test-only Checkout + signed/idempotent webhook. Near-term bookings authorize with manual capture; later bookings save the card with SetupIntent.
- **Phase 1C:** deferred test-only off-session holds, failed-hold evidence, customer-present recovery/3DS Checkout, policy-deadline cancellation, and Stripe-aware stale Checkout cleanup. Cron activation remains documented but disabled.
- **Phase 2A:** signed/replay-safe Daily evidence, server-time fallback/QR check-in, private booking-scoped rooms/tokens, and no browser-authoritative attendance time.
- **Phase 2B:** deterministic settlement derived from immutable policy + attendance evidence; retry-safe worker claims; exact test-only capture/release; atomic settlement ledger evidence and tutor-no-show credit.
- **Phase 3A:** server-authoritative cancellation, test-only exact capture/release, immutable cancellation/withdrawal evidence, fail-closed France/EU withdrawal mode, and a durable-medium acknowledgement outbox contract.
- **Phase 3B:** authenticated My Lessons cancellation/withdrawal UX, server-side action preview, explicit withdrawal declaration evidence, immutable versioned policy view, safe acknowledgement status, and leased delivery retries/dead-letter alerts.
- **Phase 4A:** admin review queue, append-only operator/audit evidence, purpose-limited booking evidence export, admin-only authority checks, and no provider-dispute write.
- **Phase 4B:** authenticated lesson-operations UI, leased case claiming/stale recovery, append-only notes, temporary alert acknowledgement/escalation, signed test-only Stripe dispute intake, minimized dispute correlation evidence, and DSAR/retention triage boundaries.
- **Phase 4C:** out-of-order Stripe dispute hardening plus launch-health metrics. Current dispute state is refreshed from Stripe's test API rather than inferred from webhook order; terminal-state regressions fail closed into an operator reconciliation signal; old event-only service-role intake is revoked; pre-4C unmatched evidence remains visible as legacy refresh-required work; operator health exposes counts only.
- **Phase 4C2 (current checkpoint):** admin-only preview-readiness reporting, operations-UI launch health/readiness panels, a provider-write-disabled preview E2E gate, and configurable retention/legal-hold governance metadata with no automatic erasure.

## Phase 4C2 — preview readiness + retention/legal-hold governance — complete in repository, not deployed

Verified engineering checkpoint: `588bbac2b15198dd086c68df7cbb928ca94a3099`.

### Implemented

- Added authenticated/admin-only `booking-preview-readiness` Edge Function. It re-checks `profiles.role='admin'` server-side and returns only readiness booleans/status codes, blocker names, warning names, and the expected preview flow. It never returns secret values and does not call Stripe, Daily, email, Base44, or any other provider.
- Readiness fails closed unless Stripe is configured with a `sk_test_` key, the normal and dispute webhook secrets are valid-looking and distinct, `APP_URL` and `TERMS_OF_SERVICE_URL` are HTTPS, Daily API/HMAC settings are present, a real durable-medium delivery provider is configured, and retention periods have an approved authority.
- Added support for Supabase's current publishable/secret key transition. A modern `sb_secret_` backend context is ready; a legacy `SUPABASE_SERVICE_ROLE_KEY` is reported as a migration warning rather than silently treated as the preferred final state.
- Surfaced authoritative `admin_booking_launch_health(...)` counts and the no-secret readiness result in `/lesson-booking-admin`. The browser still receives no service-role/secret key and cannot move money or mutate provider disputes.
- Added `lesson_booking_retention_classes`, `booking_retention_controls`, and append-only `booking_retention_control_events`.
- Seeded purpose classes for booking operations, payment evidence, consumer compliance, and legal-claim archive, but deliberately left retention durations `NULL`. The database refuses a duration unless an approval timestamp and source authority are supplied.
- Added audited admin-only retention/legal-hold RPCs. A booking can be classified, placed on/released from a legal hold, and assigned a review date; every change produces append-only evidence. Direct authenticated table access is revoked.
- Retention/legal-hold records and classes cannot be deleted through ordinary table operations. No purge, deletion, anonymization, or automatic erasure worker exists in this phase.
- Added `scripts/lesson-booking-preview-e2e.mjs`. In normal CI it is a closed execution gate and performs no provider calls. When an operator explicitly enables it with preview-only credentials, it only verifies the admin readiness endpoint and expected end-to-end flow contract; it still does not create a booking, Stripe object, Daily room, charge, email, or deployment.
- Added browser/static regressions that fail if secret markers leak into the admin React/API surface or if destructive retention primitives are introduced.

### Executable regression coverage

`supabase/tests/lesson_booking_preview_retention_scenarios.sql` verifies:

- unclassified retention state fails closed and reports automatic erasure disabled;
- legal-hold/classification changes are audited;
- legal-hold release is separately audited;
- retention audit events are append-only;
- retention controls cannot be deleted;
- an unapproved retention duration violates the database constraint;
- authenticated browser roles have no direct retention-table read access;
- a non-admin cannot call the retention admin RPCs.

`scripts/check-lesson-booking-preview-readiness-boundary.mjs` verifies:

- the readiness endpoint uses authenticated user mode and re-checks admin role;
- only Stripe test-key configuration is admissible;
- separate Checkout/dispute webhook secrets, Terms URL, Daily configuration, delivery provider, Supabase secret context, and retention approval gates exist;
- the readiness endpoint makes no external provider call;
- the browser admin surface contains none of the backend secret names/value prefixes;
- retention migration contains no destructive erasure/purge primitive;
- the preview E2E probe is disabled unless explicitly gated.

### Phase 4C2 verification

`Lesson booking foundation` run **#126** passed on `588bbac2b15198dd086c68df7cbb928ca94a3099`.

That run passed:

- Deno typechecking for the Phase 2/3/4 Edge Functions including the new readiness endpoint;
- all earlier database/browser/reservation/Stripe/hold/attendance/settlement/cancellation/compliance/admin/dispute boundary regressions;
- the new Phase 4C2 preview-readiness/retention static regression;
- the closed preview-E2E execution gate;
- every booking migration on ephemeral PostgreSQL;
- all settlement, cancellation, compliance, admin, dispute, launch-hardening, and Phase 4C2 retention behavior scenarios;
- the full Vite application build.

Compatibility on the same engineering checkpoint also passed:

- `Heathrow Piccadilly Compatibility` run **#175**: passed.
- `Game Smoke Test` run **#245**: passed.

## Research refreshed for Phase 4C2 on 2026-09-20

### Stripe

Current Stripe Checkout documentation continues to use server-created Checkout Sessions. `payment` mode is the one-time payment path and `setup` mode is the save-payment-details path. The existing Smart Parrot implementation retains its stricter test-only boundary and manual-capture/hold-before-capture behavior; Phase 4C2 only checks whether test configuration is present and performs no provider write.

- https://docs.stripe.com/api/checkout/sessions/create
- https://docs.stripe.com/payments/checkout
- https://docs.stripe.com/webhooks

### Supabase

Current Supabase guidance separates browser-safe publishable keys from backend secret keys. Secret keys are backend-only and bypass RLS; user-facing Edge Functions should authenticate a user and privileged server-to-server functions should use a secret context. Supabase is also moving projects away from legacy `anon`/`service_role` keys toward publishable/secret keys, so the readiness endpoint reports a legacy backend key as a migration warning rather than exposing it or treating it as browser configuration.

- https://supabase.com/docs/guides/api/api-keys
- https://supabase.com/docs/guides/platform/migrating-to-publishable-and-secret-api-keys
- https://supabase.com/docs/guides/functions/secrets
- https://supabase.com/docs/guides/functions/auth

### Daily

Daily webhook configuration exposes an HMAC secret and retry behavior, and webhook deliveries have provider event IDs/timestamps. The readiness endpoint therefore checks only that the required Daily server-side configuration is present; the HMAC/API values never cross to React. The existing webhook remains signature-verified and idempotent.

- https://docs.daily.co/reference/rest-api/webhooks

### Base44

Base44's normal frontend client is user-scoped; elevated/service-role behavior belongs in backend functions rather than React. The booking admin page therefore consumes only authenticated Supabase RPC/Edge Function results, not Base44 or Supabase service credentials.

- https://docs.base44.com/developers/backend/client

### France/EU retention

CNIL's April 2, 2026 retention guidance reiterates that personal data cannot be kept indefinitely: duration follows the purpose, with separately controlled intermediate/evidentiary archiving when a legal obligation or litigation/legal-claim need justifies it. GDPR Article 5 likewise requires purpose limitation, data minimisation, storage limitation, security, and accountability. Phase 4C2 therefore does not invent one universal French statutory period: duration fields remain unset until the school has a documented legal/accounting/DPO authority for each class.

- https://www.cnil.fr/fr/les-durees-de-conservation-des-donnees
- https://www.cnil.fr/fr/archivage-des-donnees
- https://eur-lex.europa.eu/eli/reg/2016/679/art_5/oj

## Next coherent slice

**Phase 4C3 — retention operations + preview E2E driver hardening:**

1. surface per-booking retention class/legal-hold state in the admin case/evidence workflow, with audited class/hold/review-date controls and no direct table writes;
2. add count-only launch-health/queue signals for unclassified evidence, overdue legal-hold reviews, and retention classes still missing approved durations/source authority;
3. add explicit preview-environment identity guards so a future provider E2E driver refuses unknown/project-production Supabase targets before any provider write is possible;
4. extend the provider-E2E driver contract so, once an explicitly approved preview environment exists, it can test booking → test Checkout/save-card → test hold/recovery → Daily/server attendance → deterministic test settlement/cancellation → ledger/evidence graph while retaining hard live-mode rejection;
5. keep deploy, publish, cron activation, production email, live Stripe, automatic retention deletion, and Stripe Connect disabled.

## External configuration still needed for real provider E2E

Repository engineering can continue without these, but the real provider path cannot be exercised until they are configured in a safe preview environment:

- a dedicated Smart Parrot Supabase preview/test project, or explicit approval of an existing safe project;
- preview `VITE_SUPABASE_URL` and browser `sb_publishable_...` key;
- a dedicated modern Supabase backend `sb_secret_...` key/secret context stored only server-side/Vault; if the preview project still uses legacy `service_role`, migrate it before launch;
- Stripe **test/sandbox** `STRIPE_SECRET_KEY`, normal Checkout `STRIPE_WEBHOOK_SECRET`, and a separate `STRIPE_DISPUTE_WEBHOOK_SECRET`;
- HTTPS `APP_URL` and a public HTTPS `TERMS_OF_SERVICE_URL`;
- Daily test API key, webhook HMAC secret, and at least one preview webhook delivery to confirm the target environment transport;
- a real durable-medium delivery provider for consumer-law acknowledgements;
- approved retention durations and their legal/accounting/DPO source authority for each configured retention class;
- before compliance launch: approved French consumer-law classification/copy and consumer mediator details.

## Release status

**NO DEPLOY / NO MERGE.** Phase 4C2 is repository-complete and CI-verified at `588bbac2b15198dd086c68df7cbb928ca94a3099`. Provider E2E, legal wording, retention-duration approval, and environment configuration remain gated. The draft PR stays intentionally unmerged until those gates are explicitly approved and verified.
