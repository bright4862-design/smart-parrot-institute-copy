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
- The browser may read explicitly safe data and invoke authenticated functions, but browser time, identity, attendance time, tutor/price/policy fields, cancellation fees, payment transitions, compliance delivery, provider dispute state, and admin evidence decisions are never authoritative.
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
- **Phase 4C (current checkpoint):** out-of-order Stripe dispute hardening plus launch-health metrics. Current dispute state is now refreshed from Stripe's test API rather than inferred from webhook order; terminal-state regressions fail closed into an operator reconciliation signal; old event-only service-role intake is revoked; pre-4C unmatched evidence remains visible as legacy refresh-required work; operator health exposes counts only.

## Phase 4C — launch hardening — complete in repository, not deployed

Verified engineering checkpoint: `b8d632a44375520795de1eeb50bd8349daea7beb`.

Primary implementation checkpoint: `199e0f115e3a6e25836ca9109dd19704e0f55ebc`.

Compatibility follow-up: `b8d632a44375520795de1eeb50bd8349daea7beb`.

### Implemented

- Added server-only `stripe_dispute_current_state` as a mutable operational projection while retaining `stripe_dispute_events` as the append-only evidence stream.
- Updated the signed `stripe-dispute-webhook` so, after raw-body signature validation and live-event rejection, it retrieves the current dispute from Stripe using the repository's test-key-only Stripe client.
- Added `record_stripe_dispute_event_v2(...)`, which stores the signed event evidence but updates operator current state only from the freshly retrieved Stripe dispute snapshot. Webhook arrival order and `event.created` do not define current state.
- Revoked `service_role` execution of the Phase 4B event-only `record_stripe_dispute_event(...)` pathway so external dispute intake cannot bypass the provider refresh.
- Provider snapshot updates are monotonic by server fetch time. Same-fetch conflicts are flagged for reconciliation rather than silently overwriting state.
- Once the projected dispute is terminal (`warning_closed`, `won`, `lost`, or `prevented`), a later contradictory/non-terminal snapshot does not downgrade it. The projection remains terminal and sets `needs_reconciliation=true` for operator review.
- Booking correlation prefers payment identifiers from the freshly retrieved provider object. Existing server-owned booking/ledger evidence remains the authority for the booking link.
- Dispute-open/dispute-close ledger evidence uses explicit duplicate guards. No provider dispute update, acceptance, closure, evidence submission, or live Stripe write was added.
- Rebuilt the unmatched-dispute queue to use provider-refreshed current state instead of webhook receipt ordering.
- Added a compatibility migration so unmatched evidence created by the pre-4C event-only path remains visible as urgent `provider refresh required` work until a provider-refreshed projection exists.
- Added `admin_booking_launch_health(...)`, an admin-only count summary for near-term failed holds, stale settlement claims, settlement errors, cancellation errors, overdue/dead-lettered compliance notices, unmatched disputes, disputes needing reconciliation, open cases, active claims, and stale claims. It returns no customer IDs, provider IDs, raw evidence, or secrets.

### Executable regression coverage

`supabase/tests/lesson_booking_launch_hardening_scenarios.sql` verifies:

- a webhook snapshot cannot override a different current status retrieved from Stripe;
- an older event arriving later stays in the append-only evidence stream without downgrading current state;
- replay of the same Stripe event ID is idempotent;
- a provider terminal state creates one terminal ledger entry;
- a later contradictory provider snapshot cannot regress the terminal state and instead creates a reconciliation signal;
- the deprecated Phase 4B event-only function is no longer executable by `service_role`;
- launch-health output is admin-only and count-only, without Stripe/customer identifiers;
- unmatched provider-refreshed disputes remain visible in the operations queue;
- non-admin launch-health access fails closed.

The workflow now executes the Phase 4C SQL behavior scenario after all migrations and all earlier settlement/cancellation/compliance/admin/dispute scenarios. The existing Deno typecheck also covers the updated Stripe dispute webhook.

### Phase 4C verification

`Lesson booking foundation` run **#123** passed on `b8d632a44375520795de1eeb50bd8349daea7beb`.

The green run covered:

- Deno typechecking for Phase 2/3/4 Edge Functions, including the provider-refreshing Stripe dispute webhook;
- database foundation and browser/auth boundaries;
- reservation/consent, Stripe Checkout/webhook, deferred hold/recovery, attendance/lesson access, settlement, cancellation/compliance, Phase 3B, Phase 4A, and Phase 4B regressions;
- every booking migration on ephemeral PostgreSQL;
- settlement, cancellation, compliance, admin-operations, Phase 4B dispute, and new Phase 4C launch-hardening behavioral scenarios;
- the full Vite application build.

`Heathrow Piccadilly Compatibility` run **#173** passed on the same engineering checkpoint. `Game Smoke Test` run **#243** was still running when this document checkpoint was prepared; it had already completed dependency installation, application build, Playwright installation, and app startup successfully before entering its browser smoke step.

## Research refreshed for Phase 4C on 2026-09-20

### Stripe

Official Stripe webhook guidance says event delivery order is not guaranteed and that distinct events may share the same `created` timestamp, so `event.created` should not be used to establish delivery order or deduplicate events. Stripe recommends event IDs for duplicate handling and supports retrieving the API resource when current object state is needed. Phase 4C therefore treats signed webhook snapshots as append-only evidence while retrieving the current **test-mode** dispute before changing the operational projection.

- https://docs.stripe.com/webhooks
- https://docs.stripe.com/api/disputes/retrieve

### Supabase

Current Supabase guidance continues to separate browser publishable keys from backend secret/service-role credentials. Edge Function environment/secrets checks can expose configuration presence as booleans without returning secret values. External-provider webhooks can use an unauthenticated platform entry point only when provider authentication/signature verification is enforced inside the function. This remains the boundary for the planned preview-readiness endpoint.

- https://supabase.com/docs/guides/functions/secrets
- https://supabase.com/docs/guides/api/api-keys
- https://supabase.com/docs/guides/functions

### Daily

Daily webhook guidance says webhook events are roughly but not strictly ordered and may be duplicated; event IDs should be used for idempotency, and participant join/leave evidence may require session-aware duplicate handling. Daily also signs webhook deliveries and retries failures. The existing attendance boundary already follows this provider-evidence model; preview readiness will validate configuration without exposing the HMAC secret.

- https://docs.daily.co/reference/rest-api/webhooks

### Base44

Base44's frontend remains user-scoped and elevated/service-role behavior is backend-only. Phase 4C does not put configuration secrets, payment authority, dispute authority, or launch-health source data into Base44 browser state.

### France/EU retention

CNIL guidance requires personal data to be kept identifiable no longer than necessary for the purpose and supports case-by-case intermediate/evidentiary archiving where litigation or legal-claim risk justifies it. Phase 4C therefore does **not** invent a statutory number of years or add destructive automatic deletion. Retention classes and legal holds remain configurable policy metadata pending French legal/accounting approval.

- https://www.cnil.fr/fr/les-durees-de-conservation-des-donnees

## Next coherent slice

**Phase 4C2 — preview integration readiness + retention/legal-hold policy metadata:**

1. add an authenticated/admin-only readiness endpoint that returns booleans/status codes only for required preview configuration: Supabase browser config, backend secret context, Stripe test key, Checkout webhook secret, dispute webhook secret, Terms URL, Daily API/HMAC config, and durable-medium delivery provider; never return a secret value;
2. surface `admin_booking_launch_health(...)` and readiness status in the lesson-operations UI without making the browser authoritative;
3. add a preview-only E2E harness contract for booking → Checkout authorization/save-card → hold/recovery → attendance → deterministic settlement/cancellation → ledger/evidence graph, with provider calls disabled unless explicitly safe preview credentials are present;
4. add configurable retention classes and per-record legal-hold metadata, with no automatic erasure and no hard-coded French statutory periods until legal/accounting approval;
5. preserve all existing live/deploy/provider-write gates.

## External configuration still needed for provider E2E

Repository engineering can continue without these, but real provider integration cannot:

- a dedicated Smart Parrot Supabase preview/test project, or explicit approval of an existing safe project;
- preview `VITE_SUPABASE_URL` and browser publishable key;
- a dedicated Supabase backend secret key for cron/service calls, stored server-side/Vault and never in browser code;
- Stripe **test/sandbox** secret key, normal Checkout webhook signing secret, and separate dispute-webhook signing secret;
- a public Terms of Service URL for Stripe Checkout terms collection;
- Daily test account/domain, API key, webhook HMAC secret, and one preview webhook delivery to verify exact transport in the target environment;
- before compliance launch: approved French consumer-law classification/copy, consumer mediator details, and a real durable-medium delivery provider.

## Release status

**NO DEPLOY / NO MERGE.** Phase 4C is repository-complete and CI-verified at the engineering checkpoint, but preview provider E2E and legal/configuration gates remain open. The draft PR stays intentionally unmerged until those gates are explicitly approved and verified.
