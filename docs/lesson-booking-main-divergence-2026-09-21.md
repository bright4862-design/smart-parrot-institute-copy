# Lesson Booking Branch Divergence Evidence — 2026-09-21

This is a read-only integration-risk record for `bright4862-design/smart-parrot-institute-copy`. It does not authorize a merge, rebase, Base44 publish, or production deployment.

## Compared refs

- Default branch: `main` at `7f764e5c2b691874b6049e706f1c09026c1eafaf`.
- Booking branch baseline before Phase 4C5I: `agent/lesson-booking-blueprint` at `e1a990f38095d5e2c4e4edc8f464495ea7a46d5c`.
- Merge base: `210345bbe09bc46c468fb6a7e0eee0596e8d902b`.
- GitHub comparison at the start of Phase 4C5I: `diverged`, booking branch **114 commits ahead / 15 commits behind** `main`.
- Draft PR #16 was still open, unmerged, and reported `mergeable: false` by GitHub.

## What changed on `main` since the merge base

The 15 `main` commits since the merge base modify only the following booking-adjacent/runtime files:

- `package.json`
- `package-lock.json`
- `src/App.jsx`
- `src/components/lesson/BookingProviderRehearsalPanel.jsx`
- `src/components/lesson/BookingRetentionControls.jsx`
- `src/lib/LessonBookingAuthContext.jsx`
- `src/lib/lessonBookingApi.js`
- `src/lib/lessonBookingRehearsalApi.js`
- `src/lib/lessonBookingSupabase.js`
- `src/pages/LessonBooking.jsx`
- `src/pages/LessonBookingAdmin.jsx`
- `src/pages/LessonBookingPolicy.jsx`
- `src/pages/MyLessons.jsx`

All of those paths are also present in the booking PR, so they are the integration-risk surface that must be reconciled deliberately before any future merge. This report does not assume which individual files have textual conflicts; GitHub's current `mergeable: false` result is the authoritative warning that automatic integration is not presently safe.

## Phase 4C5I isolation

Phase 4C5I is intentionally implemented in preview tooling and CI files under `scripts/`, `.github/workflows/`, and `docs/`. It does not edit the overlapping Base44/React booking frontend files above, does not alter Supabase schema or Edge Functions, and does not resolve the branch divergence by force.

## Required integration behavior later

Before any merge to `main`, refresh the comparison again, inspect the actual conflict set, preserve the current Base44 package/runtime updates from `main`, rerun the complete lesson-booking foundation suite after reconciliation, and obtain explicit user approval for the merge/publish step. Do not resolve this divergence by rebasing or merging during autonomous preview-build slices.
