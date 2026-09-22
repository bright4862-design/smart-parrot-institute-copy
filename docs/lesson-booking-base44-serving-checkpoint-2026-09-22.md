# Smart Parrot Base44 serving-app checkpoint — 2026-09-22

## Serving identity

- Intended public domain: `asmartparrot.com`.
- Proven serving Base44 app: **`Parrot Institute`**, app id **`695940b9a789c24bcec383ab`**.
- Booking build/sandbox app remains separate: **`Smart Parrot Institute (Copy)`**, app id **`69c16c52c86d161e74940243`**.
- Do not reassign the public domain to the Copy app and do not overwrite the serving homepage/routes.

## Restorable checkpoint

Before any booking transplant, the serving app was checkpointed through Base44:

- Checkpoint id: **`6ab2752665c1001d5395d9aa`**
- Checkpoint name: `Pre-booking integration checkpoint 2026-09-22 — preserve asmartparrot.com serving routes`
- Base44 checkpoint commit hash: **`ee404c2ece6ebd4ac63f2589e07660388e682a81`**

This is the rollback anchor for the first additive booking integration.

## Baseline build and source fingerprints

A clean baseline production build was run in the serving Base44 sandbox before any booking change:

```text
npm run build
vite build
exit_code=0
```

Only maintenance warnings were emitted for old `baseline-browser-mapping` / Browserslist data; there was no build failure.

Pre-change file SHA-256 fingerprints captured from the serving sandbox:

- `package.json`: `ab244c5097760facf51ba8eea227822ae6971504863bde4b93092ad5bb5bcdd3`
- `package-lock.json`: `277b2ee8174f80f2cfc4d3c7e4620b005e6b1912abb0bb79de74449506208e27`
- `src/App.jsx`: `2fbbdff94df530c257a69d0ce6a69ba12029e3f2ac89220cc727032765e0ec87`

## Serving route architecture

The serving app is not route-compatible with the Copy app by file replacement. It uses generated-style `src/pages.config.js` plus `src/App.jsx` to enumerate Base44 pages. Existing route families include:

- localized home/about/contact/programs/locations pages for EN/FR/AR;
- localized city pages for London, Paris, Brussels, Geneva, Makkah and Jeddah;
- localized placement-test routes plus legacy placement-test aliases;
- locale-detecting `/` through `src/pages/index.jsx`;
- existing Base44 auth/layout/navigation wrappers.

Therefore the GitHub Copy app's `src/App.jsx` must **not** be copied wholesale into the serving app. Booking must be transplanted additively through serving-app page registration while preserving `pagesConfig`, `NavigationTracker`, locale routing, auth handling, layouts and placement-test aliases.

## Next safe release step

Frontend/Base44 lane should produce a serving-app-specific additive transplant from the verified GitHub booking UI. Minimum first slice:

1. Add booking page/components without replacing the serving `src/App.jsx` architecture.
2. Register booking routes/pages in `src/pages.config.js` or the current Base44-supported page mechanism.
3. Keep Stripe/Daily/payment actions unavailable unless trusted Supabase provider readiness says otherwise; no browser secret material.
4. Run `npm run build`, lint/typecheck where applicable, and route/deep-link checks against the sandbox.
5. Compare existing route/source fingerprints and smoke localized home/program/location/placement-test pages.
6. Publish only after the additive diff is green and rollback checkpoint `6ab2752665c1001d5395d9aa` remains available.

No public Base44 publication and no live payment change was made while creating this checkpoint.