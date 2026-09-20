# Lesson Booking Build Progress

Last updated: 2026-09-20

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy`
- Working branch: `agent/lesson-booking-blueprint`
- Draft PR: #16
- Base branch: `main` at `210345bbe09bc46c468fb6a7e0eee0596e8d902b`
- `main` remains untouched.
- Nothing from this branch has been deployed/published or applied to a live Supabase, Stripe, Daily, Base44, or email environment.
- Stripe execution remains repository-locked to test-mode credentials/objects. Live Stripe objects/keys remain rejected by the payment boundary.

## Architecture lock

- Base44/React remains the app shell.
- Supabase Postgres/Auth/RLS/Edge Functions/Cron is authoritative for booking, identity, policy, evidence, timing, payment state, cancellation, settlement, and operational review state.
- The browser may read explicitly safe data and invoke authenticated functions, but browser time, identity, attendance time, tutor/price/policy fields, cancellation fees, payment transitions, compliance delivery, and admin evidence decisions are never authoritative.
- Stripe uses hold-before/capture-after. Near-term lessons authorize at Checkout; later lessons save the card and a secret-authenticated worker authorizes when due.
- Daily is the online attendance provider. Rooms are private and booking-scoped; meeting tokens carry the verified Supabase user UUID; signed/replay-safe webhook evidence remains separate from browser state.
- Marketplace / Stripe Connect remains explicitly out of scope until the single-school flow is stable.

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

## Phase 3B verification

Verified branch head before Phase 4A: `273288504ac70e634ae6b5f0d876686c9e36978d`.

- `Lesson booking foundation` run #109: passed.
- `Heathrow Piccadilly Compatibility` run #164: passed.
- `Game Smoke Test` run #235: passed.
- Browser cancellation adapter regression now scopes the read-only availability guard to the availability adapter while separately requiring authenticated cancellation to cross only through `cancel-booking`; browser-authored amount/time/policy/Stripe fields remain forbidden.

## Phase 4A — admin operations + purpose-limited evidence export — complete in repository, not deployed

Verified engineering checkpoint: `ea479cb24447b6c70476014596a2846e924fa7e8`.

Implemented:

- new admin-only review-case tables with a single active case per booking/kind, explicit priority/state constraints, and append-only review events.
- new append-only `admin_evidence_access_log` records every evidence export with booking, admin identity, purpose, field profile, and server timestamp.
- every admin RPC is granted only to authenticated callers and immediately re-checks the authoritative `profiles.role = 'admin'` inside a `SECURITY DEFINER` boundary. The new admin tables have no direct browser table grants.
- `admin_open_review_case(...)` is retry-idempotent for an existing active booking/kind case; `admin_resolve_review_case(...)` is retry-idempotent for the same final resolution and creates exactly one resolution event.
- `admin_review_queue(...)` combines manual cases with computed operational alerts for near-term `hold_failed` bookings, settlement errors, cancellation errors, and overdue/dead-lettered compliance acknowledgements. It returns minimized operator summaries rather than raw provider payloads.
- `admin_export_booking_evidence(...)` creates a versioned, purpose-limited evidence packet from immutable policy, consent, attendance, ledger, cancellation, and compliance state.
- the default/customer-support and quality-review evidence profile excludes raw Daily webhook payloads, IP addresses, user-agent strings, and provider correlation IDs.
- `payment_dispute` purpose may include Daily event IDs and Stripe ledger object references needed to correlate evidence with provider records, but still excludes raw webhook payloads/IP/user agents.
- `legal_compliance` purpose may include the withdrawal declaration contact and compliance provider message ID; those fields remain excluded from unrelated export purposes.
- Phase 4A intentionally does **not** submit Stripe dispute evidence, mutate provider disputes, send email, deploy an admin surface, or perform any live provider write.

### Phase 4A executable coverage

CI applies every booking migration to ephemeral PostgreSQL and now executes admin-operations scenarios covering:

- active review-case idempotency and exactly-one append-only `opened` event.
- combined queue visibility for a manual dispute case, an urgent near-term failed hold, and an urgent dead-lettered compliance acknowledgement.
- minimized customer-support evidence export with assertions that test raw webhook values, test IPs, user agents, Daily event IDs, and Stripe object IDs do not leak.
- payment-dispute evidence export with only the provider correlation IDs needed for dispute matching while raw/IP/user-agent data remains absent.
- mandatory audit logging for evidence export.
- non-admin authenticated callers failing closed for both the operations queue and evidence export.
- retry-idempotent case resolution with exactly one `resolved` event.
- append-only evidence-access audit rows rejecting mutation.

### Phase 4A verification

`Lesson booking foundation` run #111 passed on `ea479cb24447b6c70476014596a2846e924fa7e8`:

- existing Phase 2/3 Edge Function Deno typechecks: passed.
- database foundation, browser/auth, reservation/consent, Stripe Checkout/webhook, deferred hold/recovery, attendance/lesson access, settlement, cancellation/compliance, and Phase 3B regressions: passed.
- new Phase 4A admin operations static boundary regression: passed.
- all migrations + settlement + cancellation + compliance + new admin-operations PostgreSQL scenarios: passed.
- full Vite application build: passed.

Compatibility on the same engineering head:

- `Heathrow Piccadilly Compatibility` run #165: passed.
- `Game Smoke Test` run #236: passed.

## Research refreshed for Phase 4A on 2026-09-20

- Supabase's current Edge Function guidance distinguishes authenticated-user calls (`auth: 'user'`) from secret-authenticated service/worker calls and keeps secret/service-role credentials backend-only. Current Supabase key guidance also favors publishable browser keys and secret backend keys rather than exposing privileged credentials.
- Stripe's current Dispute object exposes evidence categories such as access activity, cancellation policy/disclosure, customer communication, receipt, service date, and service documentation. Phase 4A therefore builds a controlled evidence packet but deliberately stops before provider submission.
- Daily's current webhook configuration exposes an HMAC verification secret and retry behavior, and webhook events carry stable event identifiers plus an `event_ts`. Those provider IDs are treated as correlation evidence, not general customer-support data.
- Base44's current SDK guidance keeps the normal client user-scoped; elevated service-role access is a backend-only capability. Phase 4A therefore does not move authoritative admin review into a normal frontend entity write path.
- GDPR Article 5 principles include purpose limitation, data minimisation, storage limitation, integrity/confidentiality, and accountability. The evidence export is purpose-labelled, minimized, and audit logged in preparation for a later retention/DSAR policy slice.

## Next coherent slice

**Phase 4B — admin operations UX + provider-dispute intake + retention/alert hardening:**

1. add an authenticated admin-only operations page that reads only the safe `admin_review_queue(...)` / evidence RPCs and never grants direct table write access.
2. add explicit claim/note workflow for manual review cases with append-only operator events and stale-claim recovery.
3. add **test-only, signed Stripe dispute webhook intake** that can correlate a dispute to a booking/PaymentIntent and automatically open a review case; do not submit evidence or accept/close a dispute automatically.
4. add alert acknowledgement/escalation state so repeated settlement/cancellation/compliance failures cannot disappear after an operator reads them.
5. define and test retention/erasure policy boundaries for raw attendance/provider payloads vs immutable financial/legal evidence, including a DSAR/export design that does not erase records that must be retained for legal/accounting reasons.
6. keep all live provider writes, dispute submission, production cron/mail, Base44 publish, and production deployment behind explicit approval.

## External configuration still needed for provider E2E

Repository engineering can continue without these, but provider integration cannot:

- a dedicated Smart Parrot Supabase preview/test project, or explicit approval of an existing safe project.
- preview `VITE_SUPABASE_URL` and browser publishable key.
- a dedicated Supabase secret key for cron/service calls, stored server-side/Vault; do not introduce a browser service-role/secret key.
- Stripe test/sandbox secret key and webhook signing secret.
- Stripe public Terms of Service URL for Checkout terms collection.
- Daily test account/domain, API key, webhook HMAC secret, and one preview delivery to verify exact signature-header transport.
- before compliance launch: French consumer-law review, approved withdrawal classification/copy, consumer mediator details, and a real durable-medium delivery provider.
