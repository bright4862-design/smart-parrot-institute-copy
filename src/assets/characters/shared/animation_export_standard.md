# Smart Parrot Animation Naming & Export Standard v1.0

Status: Approved production foundation

This document defines how character animations are named, authored, reviewed, exported, and consumed by the Smart Parrot browser game.

## Goals

- Keep every animation discoverable and predictable.
- Make hero, Pico, and NPC clips easy to reuse.
- Prevent duplicate or ambiguous names.
- Ensure GLB exports behave consistently in Three.js.
- Preserve browser and mobile performance.

## Canonical clip naming

Use lowercase snake_case only.

Format:

`<character>_<category>_<action>_<variant>`

Examples:

- `hero_locomotion_idle_neutral`
- `hero_locomotion_walk_forward`
- `hero_locomotion_run_forward`
- `hero_social_wave_right`
- `hero_learning_listen_attentive`
- `hero_travel_suitcase_pull`
- `pico_flight_hover_idle`
- `pico_social_celebrate_spin`

Rules:

- Do not use spaces, hyphens, capitals, or version numbers in runtime clip names.
- Use semantic names rather than software defaults such as `Action.001`.
- Variants are optional only when the action is unambiguous.
- Left/right variants describe the character's side, not the camera's side.

## Categories

### Hero

- `locomotion`
- `travel`
- `social`
- `learning`
- `interaction`
- `emotion`
- `cinematic`

### Pico

- `flight`
- `perch`
- `social`
- `guidance`
- `emotion`
- `cinematic`

### NPCs

- `locomotion`
- `social`
- `work`
- `interaction`
- `emotion`
- `cinematic`

## Required first-pass hero clips

- `hero_locomotion_idle_neutral`
- `hero_locomotion_walk_forward`
- `hero_locomotion_run_forward`
- `hero_locomotion_turn_left_90`
- `hero_locomotion_turn_right_90`
- `hero_locomotion_jump`
- `hero_locomotion_land`
- `hero_social_wave_right`
- `hero_social_nod_yes`
- `hero_social_shake_no`
- `hero_social_clap`
- `hero_learning_listen_attentive`
- `hero_learning_repeat_phrase`
- `hero_learning_read_sign`
- `hero_learning_celebrate_success`
- `hero_travel_suitcase_pull`
- `hero_travel_suitcase_lift`
- `hero_travel_suitcase_open`
- `hero_travel_backpack_adjust`
- `hero_interaction_high_five_pico`

## Required first-pass Pico clips

- `pico_flight_hover_idle`
- `pico_flight_takeoff`
- `pico_flight_land`
- `pico_perch_idle`
- `pico_guidance_point_objective`
- `pico_social_celebrate_spin`
- `pico_emotion_encourage`
- `pico_emotion_confused`
- `pico_interaction_high_five_hero`

## Source file naming

Blender source:

`<character>_<rig>_<purpose>_v###.blend`

Examples:

- `hero_rig_animation_master_v001.blend`
- `pico_rig_animation_master_v001.blend`

Runtime export:

`<character>_<asset>_v###.glb`

Examples:

- `hero_game_ready_v001.glb`
- `pico_game_ready_v001.glb`

Version numbers belong in file names and manifests, not animation clip names.

## Coordinate and scale standard

- Units: metres.
- Up axis: Y in runtime.
- Forward axis: character faces positive Z in source authoring unless the exporter requires conversion; the final GLB must face the agreed Three.js forward direction.
- Hero root must stand at world origin on the ground plane.
- Character scale must be applied before export.
- Rotation must be applied before export.
- No negative scale on any exported node.

## Root motion policy

Default browser gameplay clips are in-place.

Use in-place animation for:

- idle
- walk
- run
- turn
- social gestures
- learning gestures

Use root motion only for authored cinematics or tightly controlled interactions. Root-motion clips must include `_root` in the file-level review notes, but the runtime clip name remains semantic.

## Skeleton rules

- One canonical hero skeleton.
- One canonical Pico skeleton.
- Shared NPC skeletons should be reused whenever body proportions allow.
- Bone names must remain stable after the first approved game-ready rig.
- Do not rename bones after animation production begins without migration notes.
- Do not export control rigs, IK helpers, hidden guide meshes, cameras, or lights.

## Loop policy

Looping clips:

- idle
- walk
- run
- hover
- perch idle

One-shot clips:

- jump
- land
- wave
- nod
- clap
- suitcase interactions
- learning reactions
- celebrations

Looping clips must have matching first and last poses with no visible pop.

## Frame rate and timing

- Author at 30 fps.
- Export keyframes at 30 fps.
- Keep clip duration intentional; do not leave empty frames before or after an action.
- Remove redundant keys where visual quality is unaffected.
- Preserve timing markers in source notes even if they are not exported to GLB.

## Export format

Primary runtime format: GLB 2.0.

Required export settings:

- Selected objects only.
- Meshes and armature only.
- Animations enabled.
- NLA strips or actions exported according to the approved clip set.
- Skinning enabled.
- Shape keys enabled when required for facial animation.
- Cameras disabled.
- Lights disabled.
- Apply modifiers where safe.
- Embed textures only for final runtime packages.

## Animation separation strategy

Preferred first implementation:

- One game-ready character GLB containing the rigged mesh and approved core clips.
- Separate GLBs may be used for later animation packs if bundle size or production workflow requires it.
- The runtime loader must map clips by canonical clip name, never by array index.

## Three.js runtime contract

The game should resolve clips using exact names.

Example:

```js
const clip = THREE.AnimationClip.findByName(
  gltf.animations,
  "hero_locomotion_idle_neutral"
);
```

Runtime code must fail gracefully when a clip is missing and report the missing canonical name.

## Performance targets

Initial target for each primary character runtime package:

- Hero GLB: ideally under 8 MB compressed.
- Pico GLB: ideally under 3 MB compressed.
- Avoid unnecessary animation key density.
- Reuse materials and textures.
- Prefer mesh compression only after runtime compatibility testing.
- Use texture compression after the visual baseline is approved.

These are production targets, not permission to damage silhouette, facial readability, or animation quality.

## Review checklist

Before approval, confirm:

- Clip name follows the canonical format.
- Action begins immediately with no dead frames.
- Character starts at the origin.
- Feet do not visibly slide in in-place locomotion.
- Looping clips loop cleanly.
- Hands do not intersect the body or props.
- Suitcase and backpack contact points remain stable.
- Pico interaction timing matches the hero counterpart.
- No control bones, cameras, lights, or hidden meshes are exported.
- GLB opens successfully in a clean Three.js test scene.
- Mobile performance remains acceptable.

## Folder placement

Source files:

`src/assets/characters/<character>/animations/source/`

Review previews:

`src/assets/characters/<character>/animations/previews/`

Runtime exports:

`src/assets/characters/<character>/animations/runtime/`

Documentation:

`src/assets/characters/<character>/docs/`

## Change control

Any change to naming, axes, scale, skeleton structure, or root-motion policy must update this document and the relevant asset manifest in the same pull request.