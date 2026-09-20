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
- **Phase 4A:** admin review queue, append-only operator/audit evidence, purpose-limited booking evidence export, admin-only authority checks, and no provider-dispute write.
- **Phase 4B:** authenticated lesson-operations UI, leased case claiming/stale recovery, append-only notes, temporary alert acknowledgement/escalation, signed test-only Stripe dispute intake, minimized dispute correlation evidence, and DSAR/retention triage boundaries.

## Phase 3B verification

Verified branch head before Phase 4A: `273288504ac70e634ae6b5f0d876686c9e36978d`.

- `Lesson booking foundation` run #109: passed.
- `Heathrow Piccadilly Compatibility` run #164: passed.
- `Game Smoke Test` run #235: passed.
- Browser cancellation adapter regression now scopes the read-only availability guard to the availability adapter while separately requiring authenticated cancellation to cross only through `cancel-booking`; browser-authored amount/time/policy/Stripe fields remain forbidden.

## Phase 4A — admin operations + purpose-limited evidence export — complete in repository, not deployed

Verified engineering checkpoint: `ea479cb24447b6c70476014596a2846e924fa7e8`.

Implemented:

- admin-only review-case tables with a single active case per booking/kind, explicit priority/state constraints, and append-only review events.
- append-only `admin_evidence_access_log` records every evidence export with booking, admin identity, purpose, field profile, and server timestamp.
- every admin RPC is granted only to authenticated callers and immediately re-checks the authoritative `profiles.role = 'admin'` inside a `SECURITY DEFINER` boundary. The admin tables have no direct browser table grants.
- `admin_open_review_case(...)` is retry-idempotent for an existing active booking/kind case; `admin_resolve_review_case(...)` is retry-idempotent for the same final resolution and creates exactly one resolution event.
- `admin_review_queue(...)` combines manual cases with computed operational alerts for near-term `hold_failed` bookings, settlement errors, cancellation errors, and overdue/dead-lettered compliance acknowledgements. It returns minimized operator summaries rather than raw provider payloads.
- `admin_export_booking_evidence(...)` creates a versioned, purpose-limited evidence packet from immutable policy, consent, attendance, ledger, cancellation, and compliance state.
- default/customer-support and quality-review evidence excludes raw Daily webhook payloads, IP addresses, user-agent strings, and provider correlation IDs.
- `payment_dispute` purpose may include Daily event IDs and Stripe ledger object references needed to correlate evidence with provider records, but still excludes raw webhook payloads/IP/user agents.
- `legal_compliance` purpose may include the withdrawal declaration contact and compliance provider message ID; those fields remain excluded from unrelated export purposes.
- Phase 4A intentionally does **not** submit Stripe dispute evidence, mutate provider disputes, send email, deploy an admin surface, or perform any live provider write.

### Phase 4A verification

`Lesson booking foundation` run #111 passed on `ea479cb24447b6c70476014596a2846e924fa7e8`:

- existing Phase 2/3 Edge Function Deno typechecks: passed.
- database foundation, browser/auth, reservation/consent, Stripe Checkout/webhook, deferred hold/recovery, attendance/lesson access, settlement, cancellation/compliance, and Phase 3B regressions: passed.
- Phase 4A admin operations static boundary regression: passed.
- all migrations + settlement + cancellation + compliance + admin-operations PostgreSQL scenarios: passed.
- full Vite application build: passed.

Compatibility on the same engineering head:

- `Heathrow Piccadilly Compatibility` run #165: passed.
- `Game Smoke Test` run #236: passed.

## Phase 4B — admin operations UX + test-only Stripe dispute intake + alert/retention hardening — complete in repository, not deployed

Verified engineering checkpoint: `3336d3e338476a802e27f7b7263807765df309b9`.

Implemented:

- new authenticated `/lesson-booking-admin` React operations surface using the same browser-safe Supabase client and magic-link auth boundary. It reads/writes only through explicit admin RPCs; no service-role/secret key is present in browser code.
- queue cards for manual review cases and computed payment/settlement/cancellation/compliance alerts, with purpose-limited evidence viewing. The UI explicitly cannot submit, accept, update, or close a Stripe dispute.
- `admin_claim_review_case(...)` adds a short lease to a case. Another admin cannot steal an active lease; an expired lease can be reclaimed. Claim operations are append-only audited.
- `admin_add_review_note(...)` appends operator notes without mutating historical events.
- `admin_acknowledge_alert(...)` creates append-only temporary snooze evidence. Persistent conditions automatically reappear after the acknowledgement window; older/retried failures escalate to urgent rather than disappearing permanently.
- new `stripe-dispute-webhook` is a dedicated external-provider endpoint with JWT verification disabled only at the platform boundary; it verifies Stripe's signature against the unmodified raw body using a separate `STRIPE_DISPUTE_WEBHOOK_SECRET`.
- the dispute endpoint rejects live events and live disputes, accepts only `charge.dispute.created`, `charge.dispute.updated`, and `charge.dispute.closed`, and passes a minimized field set into the database. It contains no Stripe dispute write/update/close/evidence-submission primitive.
- new append-only `stripe_dispute_events` stores provider event ID, dispute ID/status/reason, amount/currency, correlation IDs, evidence deadline and provider event timestamp, but never stores the raw Stripe webhook payload.
- `record_stripe_dispute_event(...)` is service-only and retry-idempotent on Stripe event ID. It correlates to an existing booking through server-owned payment evidence, opens one internal dispute review case for a matched dispute, appends provider status changes as review events, and records dispute-open/dispute-close ledger evidence. A Stripe `closed` event deliberately does **not** automatically resolve the human review case.
- unmatched Stripe disputes remain unlinked and surface as urgent operator alerts; the system does not invent a booking association.
- `admin_data_subject_inventory(...)` is an admin-only DSAR triage inventory. It returns category counts rather than third-party/provider detail, excludes raw provider payloads/IPs/user agents/secrets/tutor attendance, performs no erasure itself, and explicitly blocks automatic deletion assumptions for evidence needed for active disputes or legal claims.
- Phase 4B still performs no provider dispute submission/acceptance/closure, live Stripe write, production email, Base44 publish, cron activation, or deployment.

### Phase 4B executable coverage

CI now covers:

- Deno typechecking of the dedicated Stripe dispute webhook.
- static regression requiring raw-body signature verification, test/live rejection, the dedicated webhook secret, and the absence of dispute-write/live-key primitives.
- browser secret scanning across the new admin API/page.
- idempotent dispute-event intake and one internal review case per active booking/dispute workflow.
- update/closed provider events append internal notes but do not auto-resolve the operator case.
- active case leases cannot be stolen; stale leases can be reclaimed.
- DSAR inventory remains minimized and does not leak tutor/provider identifiers.
- unmatched dispute events surface as urgent queue items without a fabricated booking relationship.
- non-admin DSAR/admin access fails closed.
- every booking migration still applies to ephemeral PostgreSQL, followed by settlement, cancellation, compliance, Phase 4A admin, and Phase 4B dispute scenarios.
- full Vite application build.

### Phase 4B verification

`Lesson booking foundation` run #118 passed on `3336d3e338476a802e27f7b7263807765df309b9` after CI caught and we fixed two defects in the new **test scenario file** (an ambiguous PL/pgSQL identifier and a top-level `PERFORM`). The production migration/Edge Function static checks were already passing; the final run passed every migration, every behavioral scenario, Deno checks, boundary regressions, and the Vite build.

Compatibility on the same engineering head:

- `Heathrow Piccadilly Compatibility` run #170: passed.
- `Game Smoke Test` run #240: passed.

## Research refreshed for Phase 4B on 2026-09-20

- Stripe's current webhook guidance requires signature verification over the original raw request body and the endpoint signing secret. The dedicated dispute endpoint follows that boundary before parsing or writing evidence.
- Stripe's current Dispute/Event model exposes discrete dispute IDs/status/reason/amount/currency/payment correlations/evidence deadlines and the `charge.dispute.created`, `charge.dispute.updated`, and `charge.dispute.closed` event lifecycle. Phase 4B stores only the minimized fields needed for review and deliberately performs no Dispute update/evidence submission.
- Supabase's current guidance keeps publishable keys browser-side with RLS and privileged secret/service-role credentials backend-only. External signed webhooks are authenticated by the provider signature inside the handler rather than by a browser JWT.
- Base44's standard frontend client remains user-scoped; elevated service-role authority is backend-only. The admin UI therefore remains an RPC client over Supabase authority rather than a browser-authoritative admin datastore.
- GDPR Articles 5, 15 and 17 require purpose limitation/data minimisation and support access/erasure rights subject to applicable retention/legal-claim boundaries. Phase 4B therefore adds a minimized DSAR inventory and explicit erasure boundaries instead of automatically deleting financial/legal/dispute evidence.

## Next coherent slice

**Phase 4C — launch hardening + preview integration readiness:**

1. harden out-of-order/late Stripe dispute-event handling so an older provider event cannot downgrade the operator's current dispute context, while preserving the immutable event stream.
2. add explicit readiness/health checks for required Supabase, Stripe test, Daily test, Terms URL and durable-medium delivery configuration without exposing secret values.
3. add a preview-only E2E harness that exercises booking → test authorization/save-card → attendance evidence → deterministic settlement/cancellation and verifies the resulting ledger/evidence graph once safe provider credentials exist.
4. add operator metrics/readiness summaries for stuck holds, stale settlement/cancellation leases, undelivered compliance notices, unmatched disputes and claimed cases without moving authority into the browser.
5. formalize configurable retention classes and legal-hold flags; do not guess French statutory retention periods or enable destructive erasure until legal/accounting review approves the schedule.
6. keep live payments, production webhook/cron/mail activation, Base44 publish, Stripe dispute writes, merge and deployment behind explicit user approval.

## External configuration still needed for provider E2E

Repository engineering can continue without these, but provider integration cannot:

- a dedicated Smart Parrot Supabase preview/test project, or explicit approval of an existing safe project.
- preview `VITE_SUPABASE_URL` and browser publishable key.
- a dedicated Supabase secret key for cron/service calls, stored server-side/Vault; do not introduce a browser service-role/secret key.
- Stripe **test/sandbox** secret key, normal Checkout webhook signing secret, and separate dispute-webhook signing secret.
- Stripe public Terms of Service URL for Checkout terms collection.
- Daily test account/domain, API key, webhook HMAC secret, and one preview delivery to verify exact signature-header transport.
- before compliance launch: French consumer-law review, approved withdrawal classification/copy, consumer mediator details, and a real durable-medium delivery provider.
