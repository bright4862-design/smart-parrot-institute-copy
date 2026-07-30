# London Café — Platform Integration Handoff

## Stable identity
- Level ID: `london-cafe`
- Primary route: `/level-4-cafe`
- Alias route: `/london-cafe`
- Current Base44 app: `69c16c52c86d161e74940243`

## Shared-platform boundaries
- No Café-specific backend schema.
- No Café-specific cloud-save implementation.
- No independent deployment pipeline.
- `smart-parrot:london-cafe:v1` is a temporary, versioned recovery cache only.
- Authoritative persistence must migrate to the shared `PlayerProgress`, `MissionSession`, `CheckpointUpdate`, `DialogueSession`, and `RecoveryResolution` contracts after Heathrow validates the reference integration.
- Adopt the shared level registry and loader when available.

## Required runtime assets
Current playable foundation uses procedural R3F geometry and text, with no mandatory external binary assets.
Future production assets expected through shared pipelines:
- Barista character and work-animation set
- Customer character variants and seated/queueing animation set
- Café counter, menu, coffee machine, trays, cups, food props, tables and chairs
- Spatial café ambience, chatter, coffee machine, crockery, payment and order-call audio
- Shared player avatar, camera, interaction, dialogue and NPC engagement assets

## Minimum smoke test
1. Open `/level-4-cafe`.
2. Confirm the 3D café loads without a renderer fallback.
3. Tap the menu board.
4. Select one drink and one food item.
5. Answer the clarification question.
6. Choose eat-in or takeaway.
7. Verify insufficient payment is rejected.
8. Pay by valid card or exact cash.
9. Select a wrong tray and confirm non-fatal corrective feedback.
10. Select the correct tray and confirm mission completion.
11. Reload mid-mission and confirm the local recovery cache does not present itself as a cloud save.
12. Repeat in Auto, HD and Performance modes.
13. Validate on iOS Safari and Android Chrome.

## Open dependencies
- Shared level registry and loader contract
- Heathrow reference persistence integration
- Shared NPC movement, engagement and density controls
- Shared camera/player controller
- Shared dialogue and audio services
- Shared build metadata and deployment verification
- iOS and Android device-test execution and evidence capture
