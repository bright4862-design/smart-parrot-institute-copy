# Smart Parrot — Research Integration Decisions

## Status

Accepted product and architecture decisions derived from the deep-research report supplied on 29 July 2026.

This document translates research into concrete choices. It does not automatically expand scope. The current Heathrow browser vertical slice remains the immediate proof-of-fun milestone.

## Product Thesis

Smart Parrot is a **language life-sim adventure**, not an education application decorated with game mechanics.

The player progresses by communicating, interpreting, helping, exploring, and shaping the world. English is the operating language of the adventure. French and Arabic are optional support layers, never the default gameplay language.

## Decision 1 — Single-Player-First Persistent World

### Adopt

Build a personal persistent world with lightweight social overlays.

### V1 social scope

- asynchronous team objectives
- visitable player spaces
- curated postcards and preset messages
- shared creative challenges
- ghost data and leaderboard comparisons
- resource gifting with strict limits

### Explicitly defer

- full synchronous MMO world
- unrestricted voice chat
- unrestricted free-text chat
- permanent shared-world simulation
- complex player trading economy

### Reason

A personal world protects narrative pacing, mobile performance, moderation cost, and learning progression. Social features should strengthen motivation without making language mastery dependent on other players being online.

## Decision 2 — Browser Prototype Now, Unity Production Gate Later

The existing React/Three.js experience remains the fastest route to validating:

- third-person movement
- camera feel
- Heathrow mission flow
- world-first interaction prompts
- Pico guidance
- language tasks inside exploration
- mobile HUD hierarchy

React Three Fiber is the preferred browser architecture because the project already uses React and needs DOM-based HUD and accessibility surfaces.

### Engine review gate

Do not migrate immediately. Conduct a formal Unity-versus-web production review only after the Heathrow-to-Piccadilly vertical slice proves the core loop.

Unity becomes the likely production choice when the project requires most of the following:

- native iOS and Android packaging at scale
- large streamed 3D biomes
- robust animation tooling
- mature device profiling
- Addressables-style content delivery
- deep mobile platform integrations
- managed game LiveOps
- a larger multidisciplinary production team

The browser prototype is therefore not throwaway work. Its quest schemas, dialogue formats, mastery tags, analytics taxonomy, interaction rules, camera findings, and content pipeline must remain engine-independent.

## Decision 3 — Server-Authoritative Progression

The client must never be authoritative for:

- XP and mastery changes
- quest completion
- friendship progression
- currencies and inventories
- reward grants
- streaks
- premium entitlements
- social gifting

### Domain boundaries

1. **Client runtime** — rendering, input, animation, local cache, accessibility UI.
2. **Quest service** — objective state and validation.
3. **Learning engine** — mastery, CEFR tags, spaced-repetition scheduling, adaptation.
4. **Economy service** — items, cosmetics, grants, sinks, entitlements.
5. **Content service** — quests, dialogue, localization, audio references, live content versions.
6. **Analytics pipeline** — gameplay, learning, performance, safety, and economy events.

For the current prototype, these boundaries should be represented by interfaces and serializable data even before remote services exist.

## Decision 4 — CEFR Is the Content Backbone

Content is structured across:

- reception
- production
- interaction
- mediation
- online interaction

Every meaningful quest step should include metadata for:

- CEFR range
- skill domain
- lexical domain
- grammar or language function
- expected player intent
- support level
- assessment method
- mastery impact
- replay interval

Vocabulary count alone is not a progression metric.

## Decision 5 — World-Embedded Learning

Spaced repetition and adaptation live inside the world rather than in a separate review dashboard.

Examples:

- old travel phrases reappear in later city journeys
- an NPC remembers a previous misunderstanding
- Pico asks the player to recall an expression while navigating
- a Memory Garden surfaces due review items
- crafting recipes reuse quantities and procedural verbs
- signs and announcements vary while targeting the same mastery cluster

### Core lesson archetypes

1. Foraging Lexicon Walk
2. Crafting Grammar Bench
3. Echo Pronunciation Quest
4. Listening Fetch Chain
5. Bazaar Barter Roleplay
6. Noticeboard Reading Mystery
7. Postcard Writing Task
8. Memory Garden Review
9. Adaptive Story Expedition
10. Mediation Messenger Quest

The vertical slice should prove at least three archetypes before additional cities are built.

## Decision 6 — Speech Is Selective and Forgiving

Speech is used only where it creates meaningful learning value.

### V1 speech rules

- short utterances
- push-to-talk rather than always listening
- reference-based pronunciation tasks where appropriate
- semantic-intent matching for open answers
- confidence thresholds before marking failure
- retry and slower-audio options
- tap/choice fallback when recognition is unreliable
- no punishment for accent variation
- ephemeral voice processing by default

### Vendor evaluation criteria

- learner-facing pronunciation detail
- latency on mobile networks
- accent fairness
- supported language variants
- cost per completed lesson
- privacy and retention controls
- graceful failure behaviour

Azure Speech, Google Cloud Speech, and Deepgram should be tested with the same learner corpus before selection.

## Decision 7 — Content Is a Production System

The largest long-term risk is not rendering. It is producing, reviewing, localizing, testing, and tuning enough high-quality language-rich quests.

### Required content pipeline

1. narrative and pedagogy brief
2. structured quest and dialogue authoring
3. CEFR and mastery tagging
4. pedagogical review
5. narrative review
6. localization and terminology review
7. audio, TTS, and subtitle linking
8. asset linking
9. gameplay and linguistic QA
10. content packaging and versioning
11. telemetry review and tuning

Quest content must be data-driven. Hard-coded dialogue and learning rules are temporary prototype debt and should not become production architecture.

## Decision 8 — World First, Task Second, Metadata Third

During active play, the UI priority is:

1. readable world
2. current interaction
3. optional support
4. rewards and analytics feedback after the action

### HUD budget

Persistent HUD should contain only:

- current objective
- contextual interaction prompt
- optional Pico hint state
- minimal progression indicator

CEFR labels, mastery graphs, detailed correctness explanations, and economy summaries belong in post-action or journal surfaces.

Touch targets should be at least approximately 48 device-independent pixels, with safe-area support and scalable captions.

## Decision 9 — Cosmetics-First Monetization

Acceptable monetization:

- avatar fashion
- Pico accessories
- housing and world decoration
- seasonal cosmetic passes
- premium narrative expansions
- optional advanced pronunciation coaching
- optional additional AI conversation allowances
- family or teacher dashboards where sustained value exists

Not acceptable:

- paid answers
- pay-to-skip language mastery
- purchasable mastery boosts
- aggressive energy gating
- gacha learning advantages
- monetized failure recovery

The complete core learning path must remain coherent without payment.

## Decision 10 — Privacy and Social Safety by Design

### Launch stance

- target 13+ for the initial public version
- anonymous guest onboarding with later account upgrade
- high-privacy defaults
- geolocation off by default
- minimal profile discoverability
- ephemeral voice processing by default
- strict report and block tools before social expansion
- asynchronous, preset, or constrained communication before open chat

A child-focused mode is a separate product milestone requiring dedicated compliance, parental controls, moderation, and age-assurance design.

## Analytics North Star

**Weekly Active Learners Achieving Meaningful Progress**

A qualifying learner:

- completes at least two meaningful sessions in a week, and
- improves at least one tracked mastery cluster or successfully retrieves previously learned material.

### Required event families

- onboarding and route entry
- quest start, step, completion, abandonment
- dialogue choice and repair
- hint tier usage
- listening replay and slow replay
- speech latency, confidence, retry, fallback
- mastery update and review scheduling
- reward grant
- client performance, crashes, context loss
- social participation and safety reports

## Mobile Performance Principles

- authored compact zones rather than empty open worlds
- streamed biome and audio bundles
- GLB/glTF assets with stable manifest keys in the web prototype
- consistent scale, pivots, collision proxies, LODs, and naming
- device-tier quality settings
- strict texture and draw-call budgets
- no expensive post-processing until measured on target phones
- DOM overlays for text-heavy and accessibility-sensitive UI in the web prototype

## Revised 18-Month Product Shape

### Q1 — Pre-production and proof of fun

- Heathrow greybox
- one NPC dialogue
- one listening task
- one speaking-task technical bake-off
- engine-independent quest schema
- analytics taxonomy
- performance baseline

### Q2 — Vertical slice

- Heathrow to Piccadilly journey
- three NPCs
- three lesson archetypes
- inventory/crafting prototype
- SRS v1 embedded in the world
- localization pipeline
- formal engine production review

### Q3 — Alpha

- two or three compact biomes
- eight NPCs
- 30–50 authored learning experiences
- production content tools
- pronunciation, reading, writing, and mediation tasks

### Q4 — Closed beta

- asynchronous teams
- seasonal event framework
- cosmetics economy
- accessibility pass
- privacy and moderation operations

### Q5 — Soft launch

- cohort tuning
- mastery and retention balancing
- speech-cost controls
- content-authoring hardening
- economy validation

### Q6 — Launch

- three production biomes
- ten reusable lesson archetypes
- live-content calendar
- optional subscription only where recurring value is proven

## Immediate Roadmap Changes

The next implementation sequence is now:

1. validate the current Heathrow build and capture defects
2. separate objective simulation from 3D scene rendering
3. define an engine-independent quest-step schema
4. add suitcase collection as the first world-embedded task
5. add airport staff dialogue with intention-based responses
6. tag both tasks with CEFR and mastery metadata
7. add event instrumentation for attempts, hints, retries, and completion
8. improve mobile camera and touch controls
9. prototype one short listening instruction
10. design the first speech bake-off without binding to one vendor

## Scope Lock

Until the first vertical slice passes playtesting:

- no MMO architecture
- no unrestricted chat
- no additional city production
- no large-scale economy
- no final social platform
- no premature Unity migration
- no expensive final art production

The research strengthens the vision, but the immediate job remains proving that walking through Heathrow, understanding English, talking to a character, and reaching the Underground is genuinely enjoyable.