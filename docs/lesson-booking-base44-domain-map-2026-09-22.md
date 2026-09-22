# Smart Parrot Base44 / `asmartparrot.com` mapping evidence

Verified: 2026-09-22

## Current public surface

A fresh public read of `https://asmartparrot.com/` returned the Smart Parrot Institute marketing homepage with the headline `Speak English. Unlock your future.`, navigation for Programs / Locations / About / Admissions / Free Level Test, and the current London / Paris / Brussels / Geneva / Makkah / Jeddah location set.

## Base44 app comparison

The connected Base44 account currently contains two relevant apps:

- `Parrot Institute` — app id `695940b9a789c24bcec383ab`.
- `Smart Parrot Institute  (Copy)` — app id `69c16c52c86d161e74940243`.

A source search for the distinctive public homepage phrase `Unlock your future` found it in:

- `Parrot Institute` → `src/components/home/PremiumHomePage.jsx` (`titleAccent: "Unlock your future."`).

The same source search returned zero matches in `Smart Parrot Institute  (Copy)`.

## Mapping conclusion

The current public content at `asmartparrot.com` matches the `Parrot Institute` Base44 app, not the `Smart Parrot Institute  (Copy)` build app. Treat `Parrot Institute` as the currently serving public-site source unless later Base44 domain metadata disproves this content-level mapping.

This does **not** change the user-selected GitHub source repository for the booking build: engineering continues in `bright4862-design/smart-parrot-institute-copy` on `agent/lesson-booking-blueprint` and its isolated lanes.

## Release consequence

Do not publish the Copy app over `asmartparrot.com` or reassign the domain blindly. The frontend/release path must instead:

1. preserve the existing `Parrot Institute` homepage, navigation, language routes, programs, locations, admissions and other unrelated public routes;
2. transplant or otherwise integrate only the reviewed additive booking frontend from the GitHub booking build into the serving Base44 app;
3. take a restorable Base44 checkpoint before the public change;
4. prove a clean production build and deep-link/reload behavior for booking routes;
5. keep Stripe disconnected/fail-closed until Supabase has independent TEST-mode server credentials and provider readiness is proven;
6. smoke the existing public homepage/routes after publication and retain a rollback path.

No Base44/public-domain publish was performed while producing this mapping record.