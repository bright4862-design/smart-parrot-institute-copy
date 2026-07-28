# Smart Parrot Vertical Slice Design Lock

## Status

**Locked for prototype production.**

This document defines the first 15–20 minutes of Smart Parrot from Heathrow arrivals to Piccadilly Circus. New features may not enter the slice unless they directly improve clarity, emotion, language use, or playability.

## Core Promise

> The player should forget they are studying English and feel that they have successfully arrived in London.

The slice is not a lesson sequence with a 3D wrapper. It is a compact travel adventure in which understanding and using English is how the player moves forward.

## Player Profile

- first-time player
- CEFR A1 target
- understands basic English words but lacks confidence
- may use French or Arabic hints
- plays on mobile first, with keyboard and controller supported
- should complete the slice without external instructions

## Experience Pillars

1. **World first** — signs, people, sounds, and objects teach before UI explains.
2. **Intent before grammar** — dialogue choices represent what the player means.
3. **Help without embarrassment** — assistance is gradual, optional, and delivered by Pico.
4. **No punitive failure** — mistakes create understandable reactions and recovery.
5. **Emotional progression** — uncertainty becomes confidence, then wonder.
6. **One learning objective per beat** — never stack multiple new language demands at once.

## Slice at a Glance

| Beat | Target time | Emotion | Main player verb | Invisible learning goal | Proof of success |
|---|---:|---|---|---|---|
| 1. Arrival | 2:00 | curiosity | observe and collect | welcome language and object recognition | player identifies and collects the correct suitcase |
| 2. Meet Pico | 1:30 | delight | respond | greeting and origin | player completes a tiny social exchange |
| 3. Find the Underground | 3:00 | growing independence | read, ask, navigate | signs and directions | player reaches the Underground using environmental information |
| 4. Tap Through | 2:00 | practical confidence | select and use | transport vocabulary and procedural comprehension | player passes the contactless gate |
| 5. Find the Train | 2:30 | mild urgency | compare and confirm | platform, destination, direction | player boards the correct train |
| 6. Meet Sam | 3:00 | belonging | converse | introductions and recommendations | player completes a branching conversation |
| 7. Piccadilly Arrival | 2:30 | wonder and achievement | explore and meet | landmark identification and meeting language | player finds Maya and receives the passport stamp |

Target total: **16 minutes 30 seconds**, with a healthy completion range of **14–20 minutes**.

---

# Beat-by-Beat Design

## Beat 1 — Arrival and Suitcase

### Emotional purpose

The player should feel slightly disoriented but safe. London exists before the game explains itself.

### Opening

- fade in from aircraft cabin audio to Heathrow arrivals
- rain visible against large terminal windows
- distant aircraft movement
- clear airport announcement: “Welcome to London Heathrow.”
- no quest panel during the first five seconds
- player receives movement control while looking toward the luggage carousel

### Objective

**Find your suitcase.**

### World teaching

Three suitcases circulate. The player’s baggage tag and suitcase share one clear visual identifier.

The objective is communicated through:

1. camera framing toward the carousel
2. the player avatar checking a baggage tag
3. suitcase colour or symbol match
4. a short world-space prompt only when close

### Player actions

- move toward the carousel
- inspect luggage
- choose the correct suitcase
- recover naturally after selecting a wrong suitcase

### Language content

Ambient words only:

- arrivals
- baggage
- suitcase
- welcome

No translation prompt appears unless the player remains inactive or makes repeated errors.

### Failure and recovery

Wrong suitcase response:

> “That one isn’t yours.”

The suitcase returns to the carousel. No red screen, buzzer, lost currency, or accuracy score.

Pico help ladder:

1. lands near the correct suitcase
2. says, “Check the tag.”
3. optional French or Arabic hint explains that the symbol must match

### Completion moment

The correct suitcase rolls toward the player. Pico lands on the handle and looks directly at them.

---

## Beat 2 — Pico’s Introduction

### Emotional purpose

Convert uncertainty into charm and companionship.

### First exchange

Pico:

> “There you are! I’m Pico.”

The player chooses an intention:

- “Hi, Pico.”
- “Who are you?”
- “A talking parrot?”

All three continue the scene and produce distinct reactions.

Pico then asks:

> “Where are you from?”

The player selects or speaks a short answer using their profile country. For the first prototype, this may be choice-based with optional voice input later.

### Learning goal

- hello / hi
- I’m…
- I’m from…

### Design rule

This conversation must feel like meeting a character, not completing onboarding.

### Reward

No XP pop-up. Pico joins the player as a companion and the objective changes naturally.

Pico:

> “Maya’s waiting in central London. Let’s find the Underground.”

---

## Beat 3 — Find the Underground

### Emotional purpose

Let the player prove they can understand a real English-speaking environment.

### Space

A compact terminal concourse contains:

- Underground sign
- taxi sign
- bus sign
- toilets sign
- information desk
- coffee kiosk
- one optional traveller NPC

Only the Underground route progresses the mission, but the other signs create believable choice.

### Objective

**Find the Underground.**

### Supported solutions

The player may:

1. follow signs independently
2. ask airport staff
3. request a Pico hint

All are valid. Asking for help is not treated as failure.

### Staff conversation

Player intentions:

- “Where is the Underground?”
- “Can you help me?”
- “I’m going to central London.”

Staff response:

> “Go straight ahead, then turn left. Follow the Underground signs.”

The directions are reinforced through gesture and environmental composition.

### Invisible assessment

Track:

- whether the player read signs
- whether they asked staff
- hint tier reached
- wrong-route distance
- time to objective

Do not display a score.

### Optional delight

At the coffee kiosk, Pico briefly reads “flat white” and jokes that it sounds like furniture. This interaction is optional and must take under 15 seconds.

### Completion

The Underground roundel becomes fully visible. Music subtly develops as the player approaches.

---

## Beat 4 — Contactless Gate

### Emotional purpose

Make the player feel capable of performing an authentic London behaviour.

### Setup

The player sees commuters tap cards and phones on yellow readers. The gate opens with a clear light and sound response.

### Objective

**Tap in.**

### Travel wallet

The player has three visually distinct items:

- contactless bank card
- passport
- Heathrow baggage receipt

The player selects an item and uses it at the reader.

### Correct sequence

1. approach gate
2. open compact travel wallet
3. select contactless card
4. tap yellow reader
5. gate opens

### Failure states

**Passport selected:**

The reader flashes softly. Nearby staff says:

> “Use a contactless card.”

**Player walks away:**

Pico points at a commuter and says:

> “Watch what they do.”

### Language goal

- card
- contactless
- tap
- gate

The player learns through observation and action, not a definition panel.

### Design constraint

The wallet must not become a full inventory system in the vertical slice.

---

## Beat 5 — Find and Board the Piccadilly Line

### Emotional purpose

Introduce manageable urgency without punishing the learner.

### Space

Two possible platforms are visible. Information includes:

- line colour
- destination text
- direction text
- short audio announcement

### Objective

**Take the Piccadilly line toward central London.**

### Player reasoning

The player compares signs and may ask:

> “Does this train go to Piccadilly Circus?”

A nearby passenger or staff NPC confirms the direction.

### Timed event

The train arrives after the player enters the platform area. The apparent deadline is generous.

If the player misses it:

- no mission failure
- Pico makes a light joke
- another train arrives after a short interval

### Language goal

- platform
- train
- line
- destination
- Does this train go to…?

### Boarding

Crossing the door trigger begins a short cinematic transition into the carriage.

---

## Beat 6 — Train Conversation with Sam

### Emotional purpose

The player’s first sustained English interaction should feel warm and socially rewarding.

### Character

**Sam** is a friendly London commuter. Sam is curious but not intrusive, speaks clearly, and uses a light London accent.

### Conversation structure

Maximum duration: 2 minutes 30 seconds.

#### Node 1 — Greeting

Sam:

> “Hi. First time in London?”

Intentions:

- “Yes, it is.”
- “How did you know?”
- “No, I’ve been here before.”

#### Node 2 — Origin

Sam:

> “Where are you visiting from?”

Intentions adapt from the player profile.

#### Node 3 — Recommendation

Sam:

> “What would you like to see?”

Intentions:

- food
- music and theatre
- famous places

Sam gives one short recommendation based on the choice.

#### Optional local expression

Sam may say:

> “You’ll have a brilliant time.”

The journal may capture “brilliant” as “very good,” but only after the conversation.

### Assistance

- replay audio
- slow audio
- Pico facial reaction
- optional hint after hesitation

### Speech policy

For the first playable version, dialogue choices are required and voice is optional. Voice must never block progression until accent and noise testing are complete.

### Variation

On replay, Sam’s recommendation and one reaction line change.

### Completion

The train enters a tunnel. Pico briefly falls asleep. This gives the player a quiet emotional pause before the city reveal.

---

## Beat 7 — Piccadilly Circus Arrival

### Emotional purpose

Deliver the promise of a much larger world.

### Reveal sequence

- Underground arrival audio
- escalator or stylized transition
- controlled camera reveal of illuminated Piccadilly Circus
- layered traffic, footsteps, and distant theatre ambience
- Pico flies overhead rather than remaining on the shoulder

### Objective

**Find Maya.**

The player uses a short message:

> “I’m near the big screens.”

Maya replies:

> “Perfect. I’m by the fountain.”

### Player action

- identify the big screens
- locate the fountain or meeting point
- approach Maya

### Final exchange

Maya:

> “You made it! How was the journey?”

Intentions:

- “It was easy.”
- “I needed some help.”
- “It was an adventure.”

All answers are accepted and remembered as flavour state.

### Completion rewards

Delivered through a calm travel-journal sequence:

- London passport stamp
- Heathrow postcard
- first Pico scarf
- Piccadilly Circus unlocked
- encountered phrases added to journal

Do not show a multi-currency reward explosion.

### Final image

The player, Maya, and Pico take a travel photo. The camera widens to show the city beyond the slice boundary.

Pico:

> “Ready to see London?”

Fade to the Smart Parrot title and motto:

> **Don’t learn English. Live it.**

---

# Pico Companion Design for the Slice

## Role

Pico is:

- emotional companion
- diegetic guide
- source of humour
- visible hint system
- celebration feedback

Pico is not:

- a lecturer
- a constant narrator
- a floating quest marker
- a source of unsolicited translation

## Required states

- suitcase landing
- shoulder perch
- follow flight
- idle look-around
- gaze toward objective
- point with wing
- brief hover
- celebration loop
- concerned reaction
- train sleep
- Piccadilly flyover

## Help ladder

1. environmental framing
2. Pico gaze or gesture
3. short English hint
4. explicit English instruction
5. optional French or Arabic explanation

Each tier triggers only after inactivity, repeated mistakes, or direct player request.

---

# HUD and Mobile UX Lock

## Exploration HUD

Persistent elements are limited to:

- one-line current objective
- context-sensitive interaction control
- pause button
- optional Pico help button

No persistent minimap, mastery bars, streaks, currency totals, or vocabulary panels.

## Dialogue HUD

- subtitle line near speaker
- maximum three response intentions
- replay control
- slow replay control
- optional speak control when enabled

## Mobile controls

- left thumb movement zone
- right-side camera drag
- large contextual interaction button
- camera sensitivity and inversion settings
- touch targets at least 48dp
- controls fade when inactive during cinematics and dialogue

## Accessibility

Required before external playtesting:

- subtitles on by default
- scalable text
- reduced motion
- separate music, ambience, and speech volume
- replay and slow-audio controls
- high-contrast interaction prompt option
- no information conveyed only by colour

---

# Quest State Structure

The vertical slice should be authored as data rather than hard-coded scene progression.

```text
mission
  id
  title
  cefrLevel
  startNode
  completionNode
  checkpoints[]
  beats[]

beat
  id
  objective
  emotionalIntent
  skillTags[]
  lexicalTags[]
  allowedHelpTiers[]
  startConditions[]
  completionConditions[]
  failureResponses[]
  analyticsEvents[]
  nextBeat
```

## Required skill tags

- reception.listening
- reception.reading
- interaction.spoken
- production.spoken
- mediation.basic
- vocabulary.travel
- vocabulary.directions
- vocabulary.transport
- pragmatics.greeting
- pragmatics.requesting_help

The renderer must not own quest truth. Saveable mission state must live outside the 3D scene implementation.

---

# Analytics Plan

## Core funnel

- slice_started
- suitcase_area_entered
- suitcase_collected
- pico_introduction_completed
- underground_found
- contactless_gate_passed
- correct_platform_entered
- train_boarded
- sam_conversation_completed
- maya_found
- slice_completed

## Learning and assistance events

- sign_inspected
- dialogue_intent_selected
- audio_replayed
- slow_audio_used
- pico_help_requested
- pico_help_tier_triggered
- wrong_object_used
- wrong_route_taken
- objective_retry

## Experience metrics

Primary:

- completion rate
- median completion time
- help use by beat
- drop-off point
- restart rate
- average frame rate
- crash-free sessions

Qualitative playtest questions:

1. What did you think the game was about?
2. At any point, did it feel like a lesson?
3. When did you feel most confident?
4. When were you confused?
5. What do you remember about Pico, Sam, and Maya?
6. Would you continue exploring London?

## Vertical slice success thresholds

The slice may proceed to broader production when:

- at least 80% of representative testers complete it without developer intervention
- at least 70% correctly describe it as an adventure or travel game before describing it as a lesson app
- median completion time falls between 14 and 20 minutes
- no single beat accounts for more than 30% of all abandonment
- at least 60% of testers recall one useful English phrase after play
- at least 70% say they would like to continue into London
- mobile performance remains within the agreed device budget

---

# Production Scope

## Must ship in the slice

- one playable avatar placeholder
- Pico with required slice behaviours
- one Heathrow arrivals route
- luggage interaction
- airport staff NPC
- contactless gate sequence
- platform selection
- train transition
- Sam conversation
- Piccadilly arrival plaza
- Maya meeting
- checkpoint, pause, resume, restart
- keyboard, touch, and controller support
- analytics instrumentation
- English text and audio placeholders
- optional French and Arabic hints

## Explicitly cut from the slice

- character creator
- full inventory
- crafting
- housing
- open economy
- shops with purchasable stock
- unrestricted NPC AI conversation
- synchronous multiplayer
- asynchronous teams
- user-generated content
- seasonal events
- subscriptions or store checkout
- full speech grading
- additional London districts
- day/night cycle
- weather system beyond authored ambience

These remain future systems and must not delay proof of the core experience.

---

# Build Order

## Sprint A — Playable spine

1. locomotion and camera
2. interaction targeting
3. objective state machine
4. suitcase objective
5. Pico introduction
6. checkpoint and restart

## Sprint B — Language in the world

1. signage interactions
2. airport staff dialogue
3. Pico help ladder
4. Underground route
5. intent-based dialogue UI
6. audio replay and slow replay

## Sprint C — London travel loop

1. travel wallet
2. contactless reader
3. gate reactions
4. platform information
5. train arrival and boarding
6. carriage transition

## Sprint D — Emotional payoff

1. Sam conversation
2. train ambience
3. Piccadilly reveal
4. Maya interaction
5. passport stamp and photo
6. final title moment

## Sprint E — Validation

1. mobile optimization
2. accessibility pass
3. analytics verification
4. structured playtests
5. severity-ranked issue fixes
6. design-lock review

---

# Definition of Done

The vertical slice is complete only when:

- it runs as one uninterrupted experience
- first-time players can finish without verbal developer guidance
- the language interactions are necessary to the journey
- mistakes produce clear and kind recovery
- Pico is helpful without becoming intrusive
- the Piccadilly arrival feels like an emotional reward
- keyboard, touch, and controller all work
- pause, resume, restart, and checkpoints are stable
- essential dialogue has text and audio placeholders
- mobile UI preserves the playfield
- performance is measured and within budget
- analytics events are verified
- at least two structured playtest rounds are complete
- critical and high-severity issues are resolved

## Final design test

After playing, the ideal tester reaction is:

> “I forgot I was practising English. I was just trying to get to London.”
