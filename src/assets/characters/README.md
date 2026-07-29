# Smart Parrot Character Assets

This directory is the production home for all playable characters, companions, NPCs, shared rigs, animations, and character-facing cinematic assets.

## Structure

- `hero/` — Main traveler character
- `pico/` — Pico companion character
- `npc/` — Reusable and location-specific non-player characters
- `shared/` — Shared skeletons, materials, shaders, animation conventions, and UI portraits
- `cinematics/` — Character-specific cinematic exports and shot packages

## Source vs runtime assets

Authoring files such as `.blend`, high-resolution textures, and sculpt files belong in the appropriate source folders. Runtime-ready browser assets should be exported as optimized `.glb` files with compressed textures.

Do not commit temporary renders, autosaves, cache files, or local export folders.