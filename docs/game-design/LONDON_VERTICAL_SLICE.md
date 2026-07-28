# London Vertical Slice — Heathrow to Piccadilly Circus

## Purpose

This is the first production-quality proof of Smart Parrot's core promise. It should be a compact, replayable 15–20 minute adventure—not a collection of lesson cards.

## Success Criteria

The slice succeeds when a player can:

- move through a believable 3D space
- understand what to do without a large tutorial panel
- interact with Pico and at least three NPCs
- complete language-driven objectives
- reach Piccadilly Circus and feel genuine progression
- replay the mission without the experience feeling identical

## Story Premise

The player has just landed at Heathrow Terminal 5. Their phone battery is low and they must reach central London, where a host named Maya is waiting near Piccadilly Circus.

Pico travels with the player and helps only when needed.

## Mission Flow

### Beat 1 — Arrival

**Fantasy:** First steps in London.

World events:

- aircraft visible through terminal windows
- travellers moving toward arrivals
- luggage carousel ambience
- airport announcement in clear A1 English
- Pico lands on the player's suitcase

Language goals:

- welcome phrases
- countries and origins
- simple listening comprehension

Player action:

- collect the correct suitcase
- answer Pico's first question

### Beat 2 — Find the Underground

**Fantasy:** Read the world instead of opening a lesson.

World events:

- multiple overhead signs
- airport staff available for help
- visible Underground roundel in the distance

Language goals:

- signs
- directions
- “Where is…?”
- left, right, straight ahead

Player action:

- inspect signs
- ask an NPC for directions if needed
- walk to the Underground entrance

### Beat 3 — Contactless Gate

**Fantasy:** Use a real London behaviour.

World events:

- passengers tap through gates
- yellow reader glows subtly
- gate gives visual and audio feedback

Language goals:

- contactless
- card
- tap in
- fare

Player action:

- select the correct item from the travel wallet
- tap the reader
- respond to a short staff interaction if the first attempt fails

### Beat 4 — Piccadilly Line

**Fantasy:** Navigate the network.

World events:

- two platforms with distinct line colours
- train arrival announcement
- NPCs board and leave

Language goals:

- line names
- destination
- platform
- “Does this train go to…?”

Player action:

- identify the Piccadilly line
- confirm direction toward central London
- board before departure

### Beat 5 — Train Conversation

**Fantasy:** First natural social exchange.

NPC: Sam, a friendly London commuter.

Language goals:

- introductions
- where the player is from
- simple recommendations
- listening to a light London accent

Player action:

- complete a branching conversation
- learn one optional local expression

### Beat 6 — Piccadilly Circus

**Fantasy:** The world opens.

World events:

- evening city lighting
- traffic and pedestrians
- theatre signs and large illuminated displays
- Pico circles above the player

Language goals:

- meeting someone
- identifying landmarks
- simple confirmation messages

Player action:

- locate Maya
- take a first travel photo
- receive the London passport stamp

## Interaction Design

### World-first prompts

Prompts should appear near the relevant object and disappear when the player moves away.

Examples:

- `E / Tap — Read sign`
- `E / Tap — Speak to staff`
- `E / Tap — Use contactless card`

### Dialogue

- one short line per bubble at A1
- maximum three response choices
- choices should represent intention, not merely right/wrong grammar
- audio replay always available
- slower replay available through an unobtrusive control

### Help

Pico offers graduated help:

1. gesture or gaze toward the objective
2. short English hint
3. optional French or Arabic explanation

## Camera

- third-person follow camera
- slightly elevated shoulder view
- soft camera collision near walls
- limited rotation during dialogue
- cinematic camera moments only for arrival, train departure, and mission completion

## Environment Zones

1. arrivals hall
2. luggage area
3. terminal concourse
4. Underground entrance
5. ticket gate hall
6. platform
7. train carriage
8. Piccadilly Circus arrival plaza

Each zone should be small, dense, and authored rather than large and empty.

## Pico Behaviour Set

- idle shoulder perch
- short hover
- fly toward objective
- land on suitcase
- point with wing
- celebrate with loop and confetti feathers
- worried reaction after repeated mistakes
- sleep briefly during train ride

## Rewards

- London passport stamp
- 40–60 XP based on optional interactions
- first Pico scarf
- Heathrow postcard
- Piccadilly Circus unlocked
- vocabulary journal entries collected from actual interactions

## Replay Variation

On replay, vary:

- one overhead announcement
- luggage carousel position
- one NPC route
- Sam's recommendation
- one optional object interaction

## Definition of Done

The vertical slice is not complete until:

- keyboard, touch, and controller input work
- the player can finish without opening help
- mobile layout preserves the 3D playfield
- average frame rate meets the project's mobile performance budget
- all essential dialogue has text and audio placeholders
- loading, restart, pause, and resume states work
- one structured playtest has been completed and issues recorded
