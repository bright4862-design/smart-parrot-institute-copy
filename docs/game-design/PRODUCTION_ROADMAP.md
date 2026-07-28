# Smart Parrot Production Roadmap

## North Star

Build a cozy third-person adventure game in which English is the language of the world—not a layer of quizzes placed on top of it.

The project advances only when the current slice is playable, understandable, performant, and enjoyable.

## Milestone 0 — Foundation Audit

### Goal
Confirm that the existing React and Three.js foundation can support a production-quality browser and mobile experience.

### Work
- verify production build and route boot
- confirm WebGL renderer fallback behaviour
- document supported desktop and mobile browsers
- establish performance budgets
- separate simulation state from visual rendering
- define input actions rather than binding gameplay directly to keys
- add a debug overlay for position, active objective, interaction target, and frame rate

### Exit gate
- clean production build
- Heathrow route loads without console errors
- keyboard and touch input are functional
- stable restart behaviour
- performance baseline recorded on desktop and one mobile device

## Milestone 1 — Heathrow First Playable

### Goal
Create a complete greybox mission from arrival to the Underground entrance.

### Player journey
1. enter arrivals
2. find and collect the correct suitcase
3. meet Pico
4. read terminal signs
5. ask airport staff for directions
6. reach the Underground entrance

### Systems
- third-person locomotion
- follow camera with obstruction handling
- interaction targeting
- objective state machine
- dialogue state machine
- Pico follow, point, perch, and celebrate states
- checkpoint and restart system
- lightweight DOM HUD

### Content
- arrivals hall
- luggage carousel
- information desk
- coffee kiosk silhouette
- terminal signs
- Underground entrance
- one staff NPC
- one optional traveller NPC

### Exit gate
- a new player can finish without developer instructions
- no persistent HUD panel blocks the playfield
- all objectives can be completed with keyboard and touch
- camera does not enter walls or lose the player
- one full playtest is documented

## Milestone 2 — London Travel Loop

### Goal
Complete the journey from Heathrow Underground entrance to the Piccadilly Line train.

### Player journey
1. approach ticket gates
2. choose a travel payment method
3. tap the yellow reader
4. recover from one understandable failure state
5. identify the correct platform
6. confirm the train direction
7. board before departure

### Systems
- inventory-lite travel wallet
- gate interaction and feedback
- timed train arrival event
- platform navigation
- contextual audio announcements
- cinematic transition into the carriage

### Exit gate
- player understands contactless behaviour through the world
- wrong actions provide useful feedback rather than punishment
- train sequence works after restart and resume
- platform scene remains within the performance budget

## Milestone 3 — Conversation That Feels Alive

### Goal
Prove that language interaction can be fun without resembling a classroom exercise.

### Features
- short branching conversation with Sam
- response choices based on intention
- audio replay and slower replay
- optional vocabulary journal capture
- Pico help ladder: gesture, English hint, French or Arabic explanation
- light variation between playthroughs

### Exit gate
- conversation can be understood by an A1 learner
- player choices produce distinct reactions
- no response screen resembles a multiple-choice test
- optional help never interrupts fluent players

## Milestone 4 — Piccadilly Circus Showcase

### Goal
Deliver the first near-production-quality destination and establish the visual benchmark for the wider game.

### Environment
- Underground exit
- compact Piccadilly arrival plaza
- traffic silhouettes
- pedestrians with simple routines
- illuminated signs and theatre ambience
- Maya meeting point
- first photo interaction

### Presentation
- authored evening lighting
- polished materials
- environmental audio layers
- Pico flyover
- London passport stamp sequence

### Exit gate
- final arrival creates a clear emotional payoff
- destination feels dense rather than large and empty
- lighting and materials define the approved art benchmark
- scene remains readable on a small mobile screen

## Milestone 5 — Vertical Slice Alpha

### Goal
Join Heathrow, the Underground, train conversation, and Piccadilly Circus into one uninterrupted 15–20 minute experience.

### Required states
- first load
- pause and resume
- checkpoint recovery
- full restart
- route reload
- loss of WebGL context or graceful fallback
- reduced-motion UI option

### Quality gates
- keyboard, touch, and controller input
- essential text and audio placeholders complete
- no blocking console errors
- structured desktop and mobile playtests
- issue list ranked by severity
- analytics events defined for starts, completions, help usage, retries, and exits

## Milestone 6 — Art and Asset Pipeline

### Goal
Replace greybox elements without destabilising gameplay.

### Pipeline
- modular GLB environment kit
- consistent real-world scale
- shared material library
- texture compression and size limits
- collision proxies separated from render meshes
- LOD policy for characters and props
- animation naming and retargeting conventions
- asset validation checklist before merge

### First production assets
- player placeholder replacement
- Pico model and core animations
- airport staff character
- suitcase set
- luggage carousel kit
- terminal signage kit
- ticket gate kit
- Piccadilly Line carriage section

## Milestone 7 — Soft Launch Readiness

### Goal
Prepare the vertical slice for external learners and early partners.

### Work
- onboarding without heavy tutorials
- accessibility review
- localisation review for French and Arabic hints
- privacy-safe analytics
- crash and performance logging
- low-end-device quality settings
- feedback capture
- content moderation rules for future open dialogue systems

### Exit gate
- invited testers can begin and finish independently
- critical and high-severity playtest issues resolved
- stable deployment and rollback procedure
- measurable completion and help-use data

## Immediate Sprint — Next 10 Tasks

1. run a build and route smoke test
2. add a minimal debug overlay behind a development flag
3. formalise the objective state machine
4. add suitcase interaction and completion feedback
5. add one airport staff NPC trigger
6. add world-space interaction prompts
7. improve camera obstruction handling
8. test touch controls at narrow mobile width
9. record first performance baseline
10. document findings before expanding the environment

## Rules Against Scope Creep

- Do not add more London districts before the vertical slice is complete.
- Do not purchase or produce final assets before scale and camera tests pass.
- Do not add complex AI NPC behaviour before authored interactions feel good.
- Do not add large open-world terrain to solve a content-density problem.
- Do not treat vocabulary count as the primary measure of progress.
- Do not hide weak gameplay behind rewards, streaks, or excessive UI.

## Research Integration Process

Every external insight should be logged with:

- source or game studied
- observed design principle
- reason it works
- adaptation for Smart Parrot
- implementation cost
- prototype needed
- decision: adopt, test, defer, or reject

Research should influence the roadmap through explicit decisions, not by continuously adding features.
