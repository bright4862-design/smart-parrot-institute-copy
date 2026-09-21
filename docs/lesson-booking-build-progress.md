# Lesson Booking Build Progress

Last updated: 2026-09-21

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute` without explicit instruction).
- Working branch: `agent/lesson-booking-blueprint`; draft PR #16.
- Default branch refreshed this run: `main` at `7f764e5c2b691874b6049e706f1c09026c1eafaf`.
- Phase 4C5Y verified engineering checkpoint: **`4dd1ac4c06fcfcb1369de2f2dc6dfd2d1dd9f243`**.
- At that engineering checkpoint the branch was **196 commits ahead / 15 behind `main`**, merge base `210345bbe09bc46c468fb6a7e0eee0596e8d902b`.
- `main` remains untouched. No merge/rebase, Base44 publication, production deployment, external notifier send, Stripe/Daily write, Cron sender, provider/payment mutation, booking launch, or destructive cleanup occurred.
- Approved Supabase PREVIEW/TEST project only: `mrzzbhqzxshtbqvxkcjn`, region `eu-west-1`, URL `https://mrzzbhqzxshtbqvxkcjn.supabase.co`; status reverified **`ACTIVE_HEALTHY`**.
- Applied preview migration: **`20260921130048 / lesson_booking_phase4c5y_requeue_lease_expiry_recovery`**.
- Existing 12 booking Edge Functions remain unchanged by Phase 4C5Y.
- Stripe remains TEST/SANDBOX only; live keys/objects are inadmissible and Stripe Connect remains deferred.

## Architecture lock

Base44/React remains the frontend. Supabase Postgres/Auth/RLS/Edge Functions/Cron remains source of truth for identity, booking/payment state, policy/consent evidence, attendance, settlement, provider readiness, preview run state, reconciliation, retention and launch-blocker evidence. No browser-authoritative money, time, attendance, provider, cleanup, launch, notification or requeue transition is allowed. Stripe remains hold-before/capture-after with setup mode for bookings 48h+ ahead and manual capture near-term. Daily remains server-evidence only.

## Completed phase summary

- 0A–0C: schema/RLS/evidence foundation, bounded availability, browser-safe client, isolated booking preview.
- 1A–1C: atomic reservation/consent, Checkout/manual authorization, deferred holds and failed-hold recovery.
- 2A–2B: signed Daily attendance and deterministic settlement/capture/release.
- 3A–3B: cancellation/withdrawal, compliance delivery, My Lessons and immutable policy evidence.
- 4A–4C4: admin queue/evidence/disputes, launch health/readiness, retention/legal hold and provider staging.
- 4C5A–4C5Q: provider rehearsal/readiness, durable preview runs, resumable executor, operator/fixture/session hardening, terminal evidence/reconciliation/retention, cleanup review/attestation, launch-blocker snapshots and acknowledgement/handoff evidence.
- 4C5R: append-only notifier delivery-attempt/receipt evidence plus server-time escalation observation; general receipt path cannot claim `delivered` without trusted proof.
- 4C5S: trusted notifier proof adapter contract plus minimized escalation work queue.
- 4C5T: minimized escalation claim/lease + retry/dead-letter evidence.
- 4C5U: dead-letter operator review + bounded requeue-eligibility evidence.
- 4C5V: service-only single-use requeue eligibility consumption + deterministic prepared lineage evidence.
- 4C5W: service-only/server-time activation of one exact prepared requeue lineage into internal claim eligibility evidence only.
- 4C5X: activation-scoped requeue claim/lease generations + terminal transition evidence, independent of exhausted Phase T attempts.
- **4C5Y (current): stale Phase X lease recovery/watchdog + immutable server-time expiry evidence, enforced before follow-on claims.**

## Phase 4C5Y — complete

Verified engineering checkpoint: **`4dd1ac4c06fcfcb1369de2f2dc6dfd2d1dd9f243`**.

### Implemented

- Added `supabase/migrations/20260921143000_lesson_booking_phase4c5y_requeue_lease_expiry_recovery.sql`.
- Added append-only, RLS-enabled, RPC-only `lesson_booking_preview_launch_blocker_requeue_lease_expiries`.
  - One immutable row per exact expired Phase X claim event (`claim_event_id` is unique).
  - Evidence is constrained to `expiry_reason='lease_timeout'` and `observed_at >= lease_expires_at`.
  - Stores operational lineage only: activation/work/queue/snapshot/alert IDs, lineage reference, lease generation and server timestamps; it stores no claim key, customer/provider identifier, token, secret or payment material.
  - All external authority flags are constrained false: requeue execution, automatic notification, notifier send, blocker suppression, provider write, booking launch and destructive cleanup.
- Added service-only RPC `service_observe_booking_preview_launch_blocker_requeue_expired_leases(integer)`.
  - Uses PostgreSQL `statement_timestamp()` and the shared requeue-family advisory transaction lock.
  - Observes only the latest launch-blocker snapshot and latest activation per queue item.
  - Records only unclosed `claimed` leases whose authoritative deadline has elapsed.
  - `ON CONFLICT (claim_event_id) DO NOTHING` makes exact re-observation converge on one durable expiry row.
  - Returns a minimized allowlisted observation; no claim keys or provider/customer payloads are returned.
- Added service-only audited claim entrypoint `service_claim_booking_preview_launch_blocker_requeue_work_audited(bigint,text,integer)`.
  - Before delegating to the Phase X claim generator, it durably records any unclosed expired prior claim for the activation.
  - This closes the audit gap where a timed-out claim could previously be replaced by a later generation without immutable expiry evidence.
  - The original Phase X `service_claim_booking_preview_launch_blocker_requeue_work(...)` EXECUTE grant is revoked from `service_role`, so Data API callers cannot bypass the Phase Y audit wrapper.
- Both Phase Y RPCs are `SECURITY DEFINER`, `search_path=''`, denied to `public`/`anon`/`authenticated`, and granted only where required to `service_role`.
- Updated the requeue client/transport boundary so the exported claim path routes through the audited Phase Y RPC; modern `sb_secret_...` transport remains backend-only on the `apikey` header and is never mirrored into `Authorization`.
- Added `scripts/lesson-booking-preview-requeue-lease-recovery.mjs` and `scripts/check-lesson-booking-preview-requeue-lease-recovery.mjs`.
  - Regression checks assert server-time-only expiry, append-only/RPC-only semantics, legacy claim-path revocation, authority flags remaining false, destructive SQL/external-call/Cron absence, output allowlisting and secret/PII stripping.
- Added `supabase/tests/lesson_booking_preview_launch_blocker_requeue_lease_expiry_recovery_scenarios.sql`.
  - Transactional scenarios prove an expired generation-1 claim is evidenced exactly once before audited generation 2 can be issued.
  - Observer replay is idempotent; expiry cannot be observed before the lease deadline; the evidence table rejects mutation.
  - The follow-on lease can still be safely closed with `release/observed_no_send`, while exhausted Phase T history remains unchanged.
  - Role/grant scenarios verify `authenticated` cannot call the Phase Y RPCs or read the evidence table, `service_role` can call the intended Phase Y RPCs, and `service_role` can no longer directly execute the legacy Phase X claim RPC.
- Added `.github/workflows/lesson-booking-phase4c5y.yml`, which runs the Phase Y JS boundary, re-verifies Phase X behavior, boots clean ephemeral PostgreSQL, applies the booking migration chain, executes Phase Y SQL scenarios and builds the production Vite app.

### Verification

- GitHub Actions **Lesson booking Phase 4C5Y run `35602647873` passed** on exact engineering SHA `4dd1ac4c06fcfcb1369de2f2dc6dfd2d1dd9f243`.
- Full **Lesson booking foundation run `35602647870` passed** on the same engineering SHA.
- The bounded Phase Y migration is applied only to `mrzzbhqzxshtbqvxkcjn`; Supabase records **`20260921130048 / lesson_booking_phase4c5y_requeue_lease_expiry_recovery`**.
- Supabase project identity/status rechecked after migration: exact project `mrzzbhqzxshtbqvxkcjn`, name `Smart Parrot Supabase project`, region `eu-west-1`, status **`ACTIVE_HEALTHY`**.
- Post-apply preview verification: expiry rows **0**; RLS enabled; direct SELECT denied to both `authenticated` and `service_role`.
- `service_observe_booking_preview_launch_blocker_requeue_expired_leases(integer)` and the audited claim RPC are `SECURITY DEFINER`, have `search_path=""`, are denied to `authenticated`, and executable by `service_role`.
- The legacy Phase X claim RPC is no longer executable by `service_role`, proving the expiry-evidence audit wrapper cannot be bypassed through the exposed Data API path.
- No synthetic expiry/claim row was inserted into preview merely to exercise the schema.

## Research refreshed for Phase 4C5Y

- Supabase current API-key guidance states modern `sb_secret_...` keys are elevated backend-only keys, bypass RLS, are not JWTs, and should be supplied through the `apikey` header rather than treated as `Authorization: Bearer` JWTs: https://supabase.com/docs/guides/getting-started/api-keys
- Supabase current database-function guidance says `SECURITY DEFINER` functions should pin `search_path`, and function execution should be explicitly revoked/granted to the intended roles. Phase Y follows that pattern: https://supabase.com/docs/guides/database/functions
- Stripe current API guidance continues to support idempotency keys for safely retried POST mutations and keeping secret API keys server-side. Phase Y performs no Stripe mutation: https://docs.stripe.com/api/idempotent_requests
- Daily current webhook API exposes an HMAC verification secret and explicit retry strategy (`circuit-breaker` or `exponential`), reinforcing durable server-side evidence rather than browser conclusions. Phase Y performs no Daily call: https://docs.daily.co/reference/rest-api/webhooks/get-webhook
- Base44 current SDK/security documentation keeps service-role privileges and secrets on Base44-hosted backend functions, not browser React code: https://docs.base44.com/sdk-getting-started/client and https://base44.com/blog/application-security
- CNIL development guidance says production personal data should not be reused for development/test and recommends fictitious test data; its security guidance also reinforces minimisation and purpose-based retention. Phase Y preview verification therefore creates no fake customer/provider objects and stores only minimized operational evidence: https://www.cnil.fr/fr/tester-vos-applications and https://www.cnil.fr/fr/securite-des-donnees-les-regles-essentielles

## Supabase advisor status after Phase 4C5Y

- Security advisor shows **41 RLS-enabled/no-policy notices**. The new Phase Y expiry table is intentionally in that set because direct Data API table access is revoked and access is through service-only RPCs.
- Authenticated-callable `SECURITY DEFINER` findings remain **38**; Phase Y did **not** expand that signed-in-user surface.
- The prior mutable `public.forbid_change()` `search_path` warning remains absent.
- `btree_gist` in `public` remains a review item and was not moved blindly.
- Performance advisor reports **69 unindexed foreign-key opportunities**, **28 unused-index notices**, and the existing **1** multiple-permissive-policy finding on `profiles`.
- The new expiry table is empty and its evidence-query index has no production workload, so no speculative index was added or removed merely to silence the advisor.
- Remediation references: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy ; https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable ; https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public ; https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys ; https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index ; https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies

## External configuration still required for first provider-writing rehearsal

Actual provider E2E remains fail-closed until the approved preview runtime has: a runtime-only `sb_secret_...`; Stripe **TEST** secret key, exact expected test account ID, Checkout webhook signing secret and separate dispute-webhook signing secret, plus one valid signed TEST delivery through each endpoint; Daily preview API key, domain/webhook identity, room prefix, base64 HMAC and an `ACTIVE` signed webhook; and safe short-lived preview student/admin sessions plus explicit bounded provider/worker write gates. Connecting Stripe in Base44 does **not** transfer those server secrets to Supabase.

## Next coherent slice

**Phase 4C5Z — lease-safe notifier delivery-intent preparation + expiry/recovery exclusion.** Add an append-only, service-only provider-neutral delivery-intent record tied to one exact current Phase Y audited requeue claim. Preparation must require the claim lease to still be active according to PostgreSQL server time, reject any claim that has immutable Phase Y expiry evidence or terminal closure, use a deterministic intent key with exact replay/conflict protection, and expose only minimized correlation evidence. This phase must still stop before any external notifier HTTP call or `delivered` assertion: notifier sending, provider/payment writes, booking launch, destructive cleanup, Cron delivery, Base44 publication, default-branch merge and production changes remain disabled.

## Release status

**NO MERGE / NO BASE44 OR PRODUCTION PUBLISH.** Phase 4C5Y is repository-complete and CI-verified at `4dd1ac4c06fcfcb1369de2f2dc6dfd2d1dd9f243`; its bounded migration is applied only to the approved Supabase preview project. PR #16 remains draft. No external notification was sent, no actual preview requeue lease/expiry was created, and no Stripe/Daily/provider/payment/production write occurred.