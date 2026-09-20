# Lesson Booking Build Progress

Last updated: 2026-09-20

## Target

Repository: `bright4862-design/smart-parrot-institute-copy`

Working branch: `agent/lesson-booking-blueprint`

The default branch remains untouched. This work does not deploy, publish, configure live Stripe credentials, or make production data changes.

## Baseline refreshed before implementation

- Default branch: `main`
- Baseline commit: `210345bbe09bc46c468fb6a7e0eee0596e8d902b`
- Open PRs at start of work: #10 (Piccadilly platform foundation) and #11 (release hardening), both drafts and unrelated to lesson booking.
- Main commit had no combined status contexts reported through the GitHub status API.
- Existing repository code had Stripe browser packages installed but no booking implementation and no Supabase lesson-booking schema.
- Historical repository security work removed exposed proof artifacts from the current tree. No credentials are added by this branch.

## Research checkpoint

Current official documentation checked on 2026-09-20:

- Supabase RLS: exposed tables need RLS, permissive default grants should be revoked, and grants plus policies should be tested together.
  https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase API keys: browser code should use a publishable key; secret keys are backend-only and bypass RLS. Legacy `anon` / `service_role` keys are being deprecated by the end of 2026.
  https://supabase.com/docs/guides/getting-started/api-keys
- Stripe manual capture: `capture_method=manual` creates an authorization that must be captured before expiry; `payment_method_details.card.capture_before` is the authoritative deadline.
  https://docs.stripe.com/payments/place-a-hold-on-a-payment-method
- Base44 GitHub connector: repository-backed development remains supported. This slice deliberately does not move money or authority into Base44 entities.
  https://docs.base44.com/Integrations/github-connector

Daily/video attendance and French/EU withdrawal implementation are not part of this first schema/RLS slice; they remain required before those later phases are coded.

## Completed slice: Phase 0A — authoritative booking data boundary

Added:

- `supabase/migrations/20260920011000_lesson_booking_foundation.sql`
  - 11 booking/payment/evidence tables
  - `btree_gist` overlap protection
  - tutor and student double-booking exclusion constraints
  - append-only policy, attendance, consent, and ledger evidence
  - Supabase Auth profile creation trigger
  - RLS enabled on every exposed table
  - explicit revoke-first / grant-back least-privilege model
  - no browser write grants for bookings, attendance, consents, or ledger
  - Stripe identifiers and raw webhook records kept server-only
- `supabase/tests/lesson_booking_foundation_rls.test.sql`
  - pgTAP assertions for RLS, grants, overlap constraints, immutable evidence, and role-escalation protection
- `scripts/check-lesson-booking-foundation.mjs`
  - repository-level contract test that fails if the migration loses key security or authority invariants
- `.github/workflows/lesson-booking-foundation.yml`
  - narrow CI workflow for the booking foundation contract

### Checkpoint commits

- Schema/RLS migration: `4d79bb36e66deead4defe4902115f6aba35d7378`
- pgTAP security contract: `b17a71b84a3f750ae921d3ad352b5cdfdc75b1ca`
- Repository contract test: `7ace617a9690d883d1f9f14cbf2245345fbd8a01`
- CI workflow: `80fb9f4c37e3994eb14d11de5d259e9187160037`

## Verification

Local repository-contract verification:

`node scripts/check-lesson-booking-foundation.mjs`

Expected result:

`Lesson booking foundation contract passed (11 RLS tables, overlap guards, immutable evidence, least-privilege grants).`

The pgTAP suite is committed but cannot be executed until this branch is connected to a local/test Supabase stack or CI installs the Supabase CLI and boots Postgres. No production Supabase project was touched.

## Next coherent slice

Phase 0B / Phase 1 entry:

1. Add the Supabase browser client using `sb_publishable_...` configuration only.
2. Add Supabase Auth session integration without exposing a secret key.
3. Add the first server-authoritative `available_slots` RPC plus tests.
4. Then implement `create-booking` and the two Stripe Checkout paths (manual-capture hold now vs SetupIntent/card-save for 48h+ bookings), with webhook idempotency before any capture path is enabled.

## Blockers requiring external configuration later

Not blocking repository engineering yet:

- Supabase project URL and publishable key for test/preview.
- Supabase secret-key-backed Edge Function environment (never committed).
- Stripe test-mode secret/webhook keys.
- Daily test account/domain and webhook secret for attendance phase.
- French consumer-law review and mediator details before compliance launch.
