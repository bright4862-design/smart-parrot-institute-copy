# Smart Parrot — Browser 3D Technical Architecture

## Decision

The first playable 3D version will remain inside the existing React and Vite application and use React Three Fiber.

Recommended runtime packages:

- `three`
- `@react-three/fiber`
- `@react-three/drei`
- `@react-three/rapier`
- `@react-three/postprocessing`

The existing DOM application remains responsible for text-heavy and accessibility-sensitive UI.

## Architecture Principles

1. Gameplay state is separate from rendering.
2. The 3D scene does not own progression or save data.
3. Input actions are defined once and mapped to keyboard, touch, and controller.
4. Shipped 3D assets use GLB or glTF 2.0.
5. The HUD remains minimal and outside the canvas.
6. Mobile performance is a design constraint from the first prototype.

## Proposed Source Structure

```text
src/
  game/
    london/
      LondonGame.jsx
      LondonScene.jsx
      zones/
        ArrivalsZone.jsx
        ConcourseZone.jsx
        UndergroundZone.jsx
        PlatformZone.jsx
        TrainZone.jsx
        PiccadillyZone.jsx
      characters/
        PlayerCharacter.jsx
        PicoCompanion.jsx
        AirportStaff.jsx
        CommuterNPC.jsx
      props/
        ContactlessGate.jsx
        UndergroundSign.jsx
        LuggageCarousel.jsx
        PiccadillyTrain.jsx
      camera/
        ThirdPersonCamera.jsx
        CinematicCamera.jsx
      systems/
        interactionSystem.js
        objectiveSystem.js
        dialogueSystem.js
        audioSystem.js
        saveSystem.js
      input/
        actionMap.js
        useGameInput.js
      state/
        londonMissionState.js
        londonSaveSchema.js
      ui/
        LondonHUD.jsx
        InteractionPrompt.jsx
        DialoguePanel.jsx
        PicoHint.jsx
        PauseMenu.jsx
      assets/
        londonAssetManifest.js
  pages/
    LondonMission.jsx
```

## State Boundaries

### Simulation state

Serializable state only:

- player position and current zone
- active objective
- completed quest steps
- dialogue flags
- collected vocabulary
- rewards
- help usage
- settings relevant to gameplay

### Renderer state

Not saved directly:

- animation mixer instances
- Three.js objects
- camera interpolation
- particles
- temporary highlight effects
- loaded texture and model references

### UI state

- open dialogue
- active help panel
- paused state
- subtitle visibility
- current input method

## Input Action Map

Logical actions:

- `move-forward`
- `move-backward`
- `move-left`
- `move-right`
- `look`
- `interact`
- `confirm`
- `cancel`
- `pause`
- `open-journal`
- `request-hint`

Bindings:

### Keyboard

- WASD or arrow keys: move
- mouse: look
- E or Enter: interact
- Escape: cancel or pause
- H: request hint

### Touch

- left virtual stick: move
- right drag region: look
- contextual action button: interact
- compact menu button: pause

### Controller

- left stick: move
- right stick: look
- south face button: interact or confirm
- east face button: cancel
- menu button: pause

## Asset Policy

### Formats

- models: GLB
- textures: WebP or KTX2 where supported
- audio: compressed browser-safe formats with fallback
- dialogue data: JSON or typed JavaScript modules

### Naming

```text
character_pico_base.glb
environment_heathrow_gate_a.glb
prop_luggage_red_small.glb
vehicle_piccadilly_train.glb
animation_pico_point.glb
```

### Manifest keys

Runtime code refers to stable semantic keys, not raw filenames.

```js
export const londonAssets = {
  pico: '/assets/london/characters/character_pico_base.glb',
  contactlessGate: '/assets/london/props/environment_heathrow_gate_a.glb',
  piccadillyTrain: '/assets/london/vehicles/vehicle_piccadilly_train.glb',
};
```

## Performance Budget

Initial browser targets:

- stable play on modern mobile Safari and Chrome
- 30 FPS minimum on supported mid-range mobile devices
- 60 FPS target on desktop
- restrained post-processing on mobile
- compressed assets and lazy-loaded zones
- limited dynamic lights
- baked or simplified environment lighting where possible
- background NPC density adjusted by device tier

## Scene Loading

The vertical slice loads in zones rather than as one giant scene.

1. Load shared player, Pico, UI, and audio.
2. Load the current zone and the next transition zone.
3. Unload distant heavy assets after a safe transition.
4. Display an in-world transition whenever possible.

The train ride can hide the loading transition between Heathrow and Piccadilly Circus.

## Collision and Physics

Use Rapier for:

- player ground and walls
- interaction triggers
- simple moving barriers
- optional luggage push reactions

Do not simulate physics for decorative background props unless gameplay requires it.

## Dialogue System

Dialogue records should contain:

- stable dialogue ID
- speaker
- CEFR level
- display text
- audio reference
- response choices
- next-node rules
- vocabulary tags
- optional French and Arabic help
- world action triggered by completion

## Accessibility

- subtitles on by default
- audio replay
- slower playback
- text size setting
- reduced motion mode
- colour-independent objective indicators
- keyboard-complete interaction path
- DOM-based dialogue and menus for screen-reader compatibility where practical

## Debug Surfaces

Development-only overlay:

- FPS
- active zone
- player coordinates
- active objective
- current dialogue ID
- loaded asset count
- collision visualisation toggle
- reset mission button

## Delivery Sequence

### Milestone 1 — Greybox

- third-person movement
- camera
- one terminal room
- Pico placeholder
- one interactable sign
- one objective

### Milestone 2 — Interaction slice

- contactless gate
- NPC dialogue
- objective transitions
- touch controls
- save and restart

### Milestone 3 — Art pass

- authored Heathrow environment
- animated Pico
- lighting and materials
- airport ambience
- Piccadilly train transition

### Milestone 4 — Vertical slice

- all mission beats
- Piccadilly Circus arrival
- rewards and replay variation
- performance and accessibility pass
- structured playtest

## Current Page Migration

The existing `LondonMission` page should not receive another large cosmetic rewrite. It should become the route-level shell for:

- loading state
- error boundary
- `LondonGame` scene root
- DOM HUD
- pause and accessibility settings

The flat illustrated mission can remain temporarily as a fallback until the first greybox is playable.
