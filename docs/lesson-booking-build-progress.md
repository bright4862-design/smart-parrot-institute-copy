# Lesson Booking Build Progress

Last updated: 2026-09-21

## Target and release boundary

- Repository: `bright4862-design/smart-parrot-institute-copy` (user-selected target; do not switch to `bright4862-design/parrot-institute` without explicit instruction).
- Working branch: `agent/lesson-booking-blueprint`; draft PR #16.
- Default branch refreshed this run: `main` at `7f764e5c2b691874b6049e706f1c09026c1eafaf`.
- Phase 4C5T verified engineering checkpoint: **`b4c3beb2a4e2307e2c23f6cb3aa20ad85d093e36`**.
- At the engineering checkpoint the branch is **170 commits ahead / 15 behind `main`**, merge base `210345bbe09bc46c468fb6a7e0eee0596e8d902b`.
- `main` remains untouched. No merge/rebase, Base44 publication, production deployment, external notifier send, Stripe/Daily write, Cron sender, or destructive cleanup occurred.
- Approved Supabase PREVIEW/TEST project only: `mrzzbhqzxshtbqvxkcjn`, region `eu-west-1`, URL `https://mrzzbhqzxshtbqvxkcjn.supabase.co`.
- Applied preview migration: **`20260921093114 / lesson_booking_phase4c5t_escalation_claim_lease_retry_dead_letter`**.
- Existing 12 booking Edge Functions remain unchanged by Phase 4C5T.
- Stripe remains TEST/SANDBOX only; live keys/objects are inadmissible and Stripe Connect remains deferred.

## Architecture lock

Base44/React remains the frontend. Supabase Postgres/Auth/RLS/Edge Functions/Cron remains source of truth for identity, booking/payment state, policy/consent evidence, attendance, settlement, provider readiness, preview run state, reconciliation, retention and launch-blocker evidence. No browser-authoritative money, time, attendance, provider, cleanup, launch or notification transition is allowed. Stripe remains hold-before/capture-after with setup mode for bookings 48h+ ahead and manual capture near-term. Daily remains server-evidence only.

## Completed phase summary

- 0A–0C: schema/RLS/evidence foundation, bounded availability, browser-safe client, isolated booking preview.
- 1A–1C: atomic reservation/consent, Checkout/manual authorization, deferred holds and failed-hold recovery.
- 2A–2B: signed Daily attendance and deterministic settlement/capture/release.
- 3A–3B: cancellation/withdrawal, compliance delivery, My Lessons and immutable policy evidence.
- 4A–4C4: admin queue/evidence/disputes, launch health/readiness, retention/legal hold and provider staging.
- 4C5A–4C5Q: provider rehearsal/readiness, durable preview runs, resumable executor, operator/fixture/session hardening, terminal evidence/reconciliation/retention, cleanup review/attestation, launch-blocker snapshots and acknowledgement/handoff evidence.
- 4C5R: append-only notifier delivery-attempt/receipt evidence plus server-time escalation observation; general receipt path cannot claim `delivered` without trusted proof.
- 4C5S: trusted notifier proof adapter contract plus minimized escalation work queue.
- **4C5T (current): minimized escalation claim/lease + retry/dead-letter evidence.**

## Phase 4C5T — complete

Verified engineering checkpoint: **`b4c3beb2a4e2307e2c23f6cb3aa20ad85d093e36`**.

### Implemented

- Added `supabase/migrations/20260921090000_lesson_booking_phase4c5t_escalation_claim_lease_retry_dead_letter.sql`.
- Added append-only, RLS-enabled, RPC-only `lesson_booking_preview_launch_blocker_escalation_work_events`.
  - Records only `claimed`, `released`, `retry_scheduled`, or `dead_lettered` work events.
  - Claims use a caller-generated 32-hex opaque claim key and a PostgreSQL-server-time lease bounded to **30–300 seconds**.
  - Exact active-claim retries replay; concurrent active leases, closed claim keys, stale leases and stale-snapshot queue items are rejected.
  - Attempts increment deterministically from durable server evidence rather than browser state.
  - Retry eligibility is server-derived with bounded deterministic backoff: 30, 60, 120, 240, 480, then 900 seconds.
  - `attempts_exhausted` dead-lettering is rejected before attempt 5; dead-lettered work cannot be reclaimed.
  - Release records only `observed_no_send`; it does not imply notification delivery.
- Added service-only RPCs:
  - `service_claim_booking_preview_launch_blocker_escalation_work(bigint,text,integer)`
  - `service_transition_booking_preview_launch_blocker_escalation_work(bigint,text,text,text)`
  - `service_list_booking_preview_launch_blocker_escalation_work(integer)`
  - All are `SECURITY DEFINER`, pin `search_path=''`, use the Phase T advisory lock and grant EXECUTE only to `service_role`.
  - The inspection RPC returns minimized current work state without claim keys, blocker codes, actor/customer/provider ids, raw notifier ids, secrets or payment data.
- Added `scripts/lesson-booking-preview-escalation-lease.mjs` plus `scripts/check-lesson-booking-preview-escalation-lease.mjs`.
  - Client normalization strips unrecognized/sensitive fields and rejects any authority flag that is not fail-closed.
  - Approved preview service RPC transport continues to use modern `sb_secret_...` only via `apikey`, never `Authorization: Bearer`.
  - Caller-authoritative timestamps are not accepted.
- Added `supabase/tests/lesson_booking_preview_launch_blocker_escalation_claim_lease_scenarios.sql`.
  - Covers exact claim replay, concurrent-claim refusal, retry replay/backoff, closed claim-key refusal, fifth-attempt dead-lettering, no dead-letter reclaim, release/reclaim, minimized inspection, stale-snapshot refusal, append-only mutation refusal and service-only grants.
- Added dedicated `.github/workflows/lesson-booking-phase4c5t.yml`, which also re-runs the Phase 4C5S boundary, full ephemeral PostgreSQL migrations/scenario and the production Vite build.
- Updated `scripts/lesson-booking-full-preview-supabase-transport.mjs` with the three service-only Phase T RPC targets.

### Verification

- GitHub Actions **Lesson booking Phase 4C5T run `35583031806` passed** on exact engineering SHA `b4c3beb2a4e2307e2c23f6cb3aa20ad85d093e36`.
- Full **Lesson booking foundation run `35583031859` passed** on the same SHA.
- All workflows triggered on the engineering checkpoint completed successfully; no workflow remained in progress or failed.
- The Phase T migration was applied only to `mrzzbhqzxshtbqvxkcjn`; Supabase recorded **`20260921093114 / lesson_booking_phase4c5t_escalation_claim_lease_retry_dead_letter`**.
- Post-apply preview verification: work-event rows **0**; RLS enabled; direct SELECT denied to both `authenticated` and `service_role`; all three Phase T RPCs denied to `authenticated` and executable by `service_role` only.
- No fake escalation claim, retry, release or dead-letter evidence was inserted into preview.

## Research refreshed for Phase 4C5T

- Supabase current guidance continues to recommend pinning `search_path` for `SECURITY DEFINER` functions and explicitly controlling function EXECUTE grants; Phase T follows that pattern.
- Stripe still treats retried POST mutations as idempotency-sensitive and requires raw-body, endpoint-specific signature verification for webhooks. Phase T makes no Stripe mutation and does not reinterpret provider delivery state.
- Daily continues to document signed webhooks with retry/duplicate-delivery behavior. Phase T therefore leases internal operational work separately from provider truth and makes no Daily mutation.
- Base44 privileged/service behavior stays off the React/browser path; Phase T is a server-only Supabase contract.
- CNIL guidance says development/test should use fictitious data rather than production personal data where possible and personal data must have purpose-bound retention. Phase T stores only minimized operational identifiers/status, not customer/provider payloads.

## Supabase advisor status after Phase 4C5T

- Security advisor now shows **34 RLS-enabled/no-policy notices**; the new Phase T RPC-only event table is expected in this set because direct Data API access is revoked.
- Authenticated-callable `SECURITY DEFINER` findings remain **35**; the three Phase T RPCs do not expand that surface because EXECUTE is revoked from `authenticated` and granted only to `service_role`.
- The prior mutable `public.forbid_change()` `search_path` warning remains absent.
- `btree_gist` in `public` remains a review item; it was not moved blindly.
- Performance advisor flags the new Phase T foreign keys (`alert_id`, `queue_item_id`, `snapshot_id`) as unindexed and reports the queue/event index as unused while the table has zero preview rows. These are hardening candidates, not a reason to add speculative indexes before workload/query evidence.

## External configuration still required for first provider-writing rehearsal

Actual provider E2E remains fail-closed until the approved preview runtime has: a runtime-only `sb_secret_...`; Stripe **TEST** secret key, exact expected test account id, Checkout webhook signing secret and separate dispute-webhook signing secret, plus one valid signed TEST delivery through each endpoint; Daily preview API key, domain/webhook identity, room prefix, base64 HMAC and an `ACTIVE` signed webhook; and safe short-lived preview student/admin sessions plus explicit bounded provider/worker write gates. Connecting Stripe in Base44 does **not** transfer those server secrets to Supabase.

## Next coherent slice

**Phase 4C5U — dead-letter operator review + bounded requeue evidence.** Add immutable service/admin review evidence bound to the exact latest dead-lettered escalation work item, with fixed decisions such as `preserve`, `retry_after_review`, and `invalid_work_item_confirmed`; server-time and stale-snapshot protections; conflict-safe idempotent replay; and a separate append-only requeue-eligibility generation for an explicitly reviewed retry. Keep external notifier sending, automatic Cron delivery, provider/payment writes, booking launch, destructive cleanup, Base44 publication, default-branch merge and production changes disabled.

## Release status

**NO MERGE / NO BASE44 OR PRODUCTION PUBLISH.** Phase 4C5T is repository-complete and CI-verified at `b4c3beb2a4e2307e2c23f6cb3aa20ad85d093e36`; its bounded migration is applied only to the approved Supabase preview project. PR #16 remains draft. No external notification was sent and no Stripe/Daily/provider/production write occurred.
