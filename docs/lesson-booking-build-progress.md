# Lesson Booking Build Progress

Last updated: 2026-09-21

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute` without explicit instruction).
- Working branch: `agent/lesson-booking-blueprint`; draft PR #16.
- Default branch refreshed this run: `main` at `7f764e5c2b691874b6049e706f1c09026c1eafaf`; merge base `210345bbe09bc46c468fb6a7e0eee0596e8d902b`.
- Phase 4C5AA verified engineering checkpoint: **`d09acfc8f3f50a6bb036b1348e86e503162270d1`**.
- At that engineering checkpoint the branch was **200 commits ahead / 15 behind `main`**.
- `main` remains untouched. No merge/rebase, Base44 publication, production deployment, external notifier send, Stripe/Daily write, Cron sender, provider/payment mutation, booking launch, or destructive cleanup occurred.
- Approved Supabase PREVIEW/TEST project only: `mrzzbhqzxshtbqvxkcjn`, region `eu-west-1`, URL `https://mrzzbhqzxshtbqvxkcjn.supabase.co`; status reverified **`ACTIVE_HEALTHY`**.
- Applied preview migration: **`20260921144925 / lesson_booking_phase4c5aa_requeue_delivery_intent_terminal_evidence`**.
- Existing 12 booking Edge Functions remain unchanged by Phase 4C5AA.
- Stripe remains TEST/SANDBOX only; live keys/objects are inadmissible and Stripe Connect remains deferred.

## Architecture lock

Base44/React remains the frontend. Supabase Postgres/Auth/RLS/Edge Functions/Cron remains source of truth for identity, booking/payment state, policy/consent evidence, attendance, settlement, provider readiness, preview run state, reconciliation, retention and launch-blocker evidence. No browser-authoritative money, time, attendance, provider, cleanup, launch, notification or requeue transition is allowed. Stripe remains hold-before/capture-after with setup mode for bookings 48h+ ahead and manual capture near-term. Daily remains server-evidence only.

## Completed phase summary

- 0A–0C: schema/RLS/evidence foundation, bounded availability, browser-safe client, isolated booking preview.
- 1A–1C: atomic reservation/consent, Checkout/manual authorization, deferred holds and failed-hold recovery.
- 2A–2B: signed Daily attendance and deterministic settlement/capture/release.
- 3A–3B: cancellation/withdrawal, compliance delivery, My Lessons and immutable policy evidence.
- 4A–4C4: admin queue/evidence/disputes, launch health/readiness, retention/legal hold and provider staging.
- 4C5A–4C5Q: provider rehearsal/readiness, durable preview runs, resumable executor, terminal evidence/reconciliation/retention, cleanup review/attestation, launch-blocker snapshots and acknowledgement/handoff evidence.
- 4C5R–4C5S: notifier delivery evidence, trusted proof boundary and minimized escalation queue.
- 4C5T–4C5U: escalation claim/lease/retry/dead-letter lifecycle and bounded operator requeue review.
- 4C5V–4C5W: single-use requeue eligibility consumption, deterministic lineage and server-time activation.
- 4C5X–4C5Y: activation-scoped requeue claim/lease/terminal lifecycle and append-only expired-lease recovery evidence.
- 4C5Z: provider-neutral delivery-intent preparation tied to one exact current unexpired audited claim; no send or delivered assertion.
- **4C5AA (current): append-only terminal evidence for a Phase Z intent that becomes unusable because its exact claim closes, its lease expires, or its blocker snapshot is superseded.**

## Phase 4C5AA — complete

Verified engineering checkpoint: **`d09acfc8f3f50a6bb036b1348e86e503162270d1`**.

### Implemented

- Added `supabase/migrations/20260921163000_lesson_booking_phase4c5aa_requeue_delivery_intent_terminal_evidence.sql`.
- Added append-only, RLS-enabled, RPC-only `lesson_booking_preview_launch_blocker_requeue_delivery_intent_terminals`.
  - One immutable terminal row per exact Phase Z `intent_id`.
  - Bounded terminal reasons: `claim_closed`, `lease_expired`, `snapshot_superseded`.
  - `lease_expired` evidence is constrained so `observed_at >= lease_expires_at`.
  - Evidence stores minimized operational lineage only: intent/claim/activation/work/queue/snapshot/alert IDs, lineage reference, lease generation/expiry, deterministic intent key, terminal reason and server timestamp.
  - It stores no claim key, Stripe/Daily/customer identifier, provider payload, notifier receipt, token, secret or payment material.
  - All authority flags remain constrained false: external notification HTTP, delivery assertion, requeue execution, automatic notification, notifier send, blocker suppression, provider write, booking launch and destructive cleanup.
- Added service-only RPC `service_observe_booking_preview_launch_blocker_requeue_delivery_intent_terminals(integer)`.
  - `SECURITY DEFINER`, `search_path=''`, direct grants revoked and EXECUTE granted only to `service_role`.
  - Uses PostgreSQL `statement_timestamp()` and the shared requeue-family advisory transaction lock `pg_advisory_xact_lock(20260921,40520)`.
  - Reads the latest blocker snapshot server-side; caller/browser time is not accepted.
  - Deterministic precedence is explicit claim closure first, then server-time lease expiry, then snapshot supersession.
  - A claim is considered closed only from a later terminal Phase X event (`released`, `retry_scheduled`, or `dead_lettered`) for the same internal claim lineage.
  - `ON CONFLICT(intent_id) DO NOTHING` makes repeated observation idempotent.
  - Returns aggregate counts by terminal reason plus server time and fail-closed authority flags; it does not return the internal claim key or provider/customer payloads.
- Added `scripts/check-lesson-booking-preview-requeue-delivery-intent-terminal.mjs`.
  - Verifies RLS, append-only/RPC-only semantics, server-time-only observation, shared advisory locking, bounded terminal reasons, exact claim-order checks, idempotency, minimized stored fields, service-only EXECUTE and absence of external HTTP/Cron/destructive SQL/caller time.
- Added `supabase/tests/lesson_booking_preview_launch_blocker_requeue_delivery_intent_terminal_scenarios.sql`.
  - Proves a current active intent is not terminalized.
  - Proves exact claim release produces one immutable `claim_closed` terminal row.
  - Proves a formerly valid but now-expired intent produces `lease_expired` only after server time reaches the lease deadline.
  - Proves a still-unexpired intent becomes `snapshot_superseded` after a newer authoritative blocker snapshot exists.
  - Proves observer replay inserts zero additional evidence, evidence mutation is blocked, `authenticated` cannot execute/read, and `service_role` can execute only the RPC.
- Added `.github/workflows/lesson-booking-phase4c5aa.yml`, which runs the Phase AA contract, re-verifies Phase Z, applies the entire migration chain to clean ephemeral PostgreSQL, executes Phase Z/AA SQL scenarios and builds the Vite application.

### Verification

- GitHub Actions **Lesson booking Phase 4C5AA run `35614538020` passed** on exact engineering SHA `d09acfc8f3f50a6bb036b1348e86e503162270d1`.
- Full **Lesson booking foundation run `35614537961` passed** on the same engineering SHA.
- Dedicated Phase AA workflow passed its JS boundary check, Phase Z regression, clean ephemeral PostgreSQL migration chain, Phase Z/AA behavior scenarios and production Vite build.
- The bounded Phase AA migration is applied only to `mrzzbhqzxshtbqvxkcjn`; Supabase records **`20260921144925 / lesson_booking_phase4c5aa_requeue_delivery_intent_terminal_evidence`**.
- Supabase project identity/status remains exact project `mrzzbhqzxshtbqvxkcjn`, name `Smart Parrot Supabase project`, region `eu-west-1`, status **`ACTIVE_HEALTHY`**.
- Post-apply preview verification: Phase Z intent rows **0**; Phase AA terminal rows **0**; RLS enabled; direct SELECT denied to both `authenticated` and `service_role`.
- `service_observe_booking_preview_launch_blocker_requeue_delivery_intent_terminals(integer)` is `SECURITY DEFINER`, has `search_path=""`, is denied to `authenticated`, and executable by `service_role`.
- No synthetic intent/terminal row was inserted into preview merely to exercise the schema.

## Research refreshed for Phase 4C5AA

- Supabase current database-function guidance says privileged `SECURITY DEFINER` functions should pin `search_path` and function EXECUTE access should be explicitly restricted: https://supabase.com/docs/guides/database/functions
- Supabase current API-key guidance says modern `sb_secret_...` keys are backend-only elevated keys, are not JWTs, and belong on the `apikey` header rather than being mirrored into `Authorization: Bearer`: https://supabase.com/docs/guides/getting-started/api-keys
- Stripe current API guidance continues to require idempotency discipline for retried POST mutations and raw-body, endpoint-specific webhook signature verification; Phase AA performs no Stripe request: https://docs.stripe.com/api/idempotent_requests and https://docs.stripe.com/webhooks/signature
- Daily webhook configuration exposes an HMAC verification secret and retry strategy, reinforcing durable server evidence rather than browser conclusions; Phase AA performs no Daily request: https://docs.daily.co/reference/rest-api/webhooks/get-webhook
- Base44 current security/backend guidance keeps secret-bearing external API calls and elevated business logic on trusted server surfaces rather than React/browser code: https://docs.base44.com and https://base44.com/blog/application-security
- CNIL guidance recommends fictitious data instead of production personal data in development/testing, minimization of logs/data and purpose-bound retention. Phase AA therefore stores only minimized operational evidence and creates no fake provider/customer objects in the real preview project: https://www.cnil.fr/fr/tester-vos-applications and https://www.cnil.fr/fr/minimiser-les-donnees-collectees

## Supabase advisor status after Phase 4C5AA

- Security advisor reports **43 RLS-enabled/no-policy notices**. The new Phase AA terminal table accounts for the expected +1 and is intentionally server-only/RPC-only with direct Data API access revoked.
- Authenticated-callable `SECURITY DEFINER` findings remain **38**; Phase AA did **not** expand that signed-in-user privileged surface.
- The prior mutable `public.forbid_change()` `search_path` warning remains absent.
- `btree_gist` in `public` remains one review item and was not moved blindly.
- Performance advisor reports **78 unindexed foreign-key opportunities**, **30 unused-index notices**, and the existing **1** multiple-permissive-policy finding on `profiles`.
- The new Phase AA table is empty; its queue index has no workload and several new foreign keys are flagged. These remain workload-driven hardening opportunities, so no speculative index was added or removed merely to silence the advisor.
- Remediation references: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy ; https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable ; https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public ; https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys ; https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index ; https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies

## External configuration still required for first provider-writing rehearsal

Actual provider E2E remains fail-closed until the approved preview runtime has: a runtime-only `sb_secret_...`; Stripe **TEST** secret key, exact expected test account ID, Checkout webhook signing secret and separate dispute-webhook signing secret, plus one valid signed TEST delivery through each endpoint; Daily preview API key, domain/webhook identity, room prefix, base64 HMAC and an `ACTIVE` signed webhook; and safe short-lived preview student/admin sessions plus explicit bounded provider/worker write gates. Connecting Stripe in Base44 does **not** transfer those server secrets to Supabase.

## Next coherent slice

**Phase 4C5AB — service-only notifier dispatch preflight + exact stale-intent exclusion evidence.** Add a minimized, append-only preflight bound to one exact Phase Z intent only after revalidating that no Phase AA terminal evidence exists, the exact claim is still current and unclosed, the PostgreSQL lease is still live, and the blocker snapshot is still authoritative. Exact retries should converge; conflicting/stale attempts must fail closed. This phase must still stop before any external notifier HTTP call or `delivered` assertion: external notification sending, provider/payment writes, booking launch, destructive cleanup, Cron delivery, Base44 publication, default-branch merge and production changes remain disabled.

## Release status

**NO MERGE / NO BASE44 OR PRODUCTION PUBLISH.** Phase 4C5AA is repository-complete and CI-verified at `d09acfc8f3f50a6bb036b1348e86e503162270d1`; its bounded migration is applied only to the approved Supabase preview project. PR #16 remains draft. No external notification was sent, no actual preview delivery intent/terminal evidence was created, and no Stripe/Daily/provider/payment/production write occurred.