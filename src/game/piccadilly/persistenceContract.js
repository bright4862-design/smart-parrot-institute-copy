export const PICCADILLY_SHARED_PERSISTENCE_CONTRACTS = Object.freeze([
  'PlayerProgress',
  'MissionSession',
  'CheckpointUpdate',
  'DialogueSession',
  'GameplayEvent',
  'LevelConfiguration',
  'RecoveryResolution',
]);

export const PICCADILLY_PERSISTENCE_POLICY = Object.freeze({
  authority: 'shared-cloud-player-progress',
  adoptionStatus: 'awaiting-heathrow-reference-proof',
  piccadillySpecificSaveEntityAllowed: false,
  piccadillySpecificApiAllowed: false,
  piccadillySpecificAuthenticationAllowed: false,
  localStorage: Object.freeze({
    role: 'temporary-versioned-recovery-cache',
    authoritative: false,
    synchronized: false,
    deviceScoped: true,
    mayOverrideServerProgress: false,
  }),
  prohibitedPersistedState: Object.freeze([
    'character-coordinates',
    'camera-state',
    'animation-state',
    'webgl-state',
    'temporary-npc-movement',
    'render-profile-internals',
  ]),
});

export const PICCADILLY_PLATFORM_DEPENDENCIES = Object.freeze([
  Object.freeze({
    id: 'shared-level-registry-and-loader',
    owner: 'base44-cloud-devops',
    blocking: true,
    workaroundAllowed: false,
    requiredOutcome: 'Register the stable Piccadilly level ID and canonical route through the shared loader.',
  }),
  Object.freeze({
    id: 'authenticated-player-identity',
    owner: 'backend-base44',
    blocking: true,
    workaroundAllowed: false,
    requiredOutcome: 'Expose the same authenticated player identity used by Heathrow cloud progress.',
  }),
  Object.freeze({
    id: 'shared-persistence-client-adapter',
    owner: 'backend-base44',
    blocking: true,
    workaroundAllowed: false,
    requiredOutcome: 'Provide one frontend adapter for mission sessions, checkpoints, dialogue and recovery resolution.',
  }),
  Object.freeze({
    id: 'revision-idempotency-and-conflict-semantics',
    owner: 'backend-base44',
    blocking: true,
    workaroundAllowed: false,
    requiredOutcome: 'Adopt expected revision, server revision, idempotency keys, duplicate handling and stale-client responses.',
  }),
  Object.freeze({
    id: 'recovery-resolution-precedence',
    owner: 'backend-base44',
    blocking: true,
    workaroundAllowed: false,
    requiredOutcome: 'Define deterministic precedence between authoritative cloud progress and the unsynchronized local recovery cache.',
  }),
  Object.freeze({
    id: 'shared-dialogue-session-schema',
    owner: 'backend-base44',
    blocking: true,
    workaroundAllowed: false,
    requiredOutcome: 'Map station conversations and announcement responses into the shared DialogueSession contract.',
  }),
  Object.freeze({
    id: 'shared-level-configuration-and-asset-manifest',
    owner: 'base44-cloud-devops',
    blocking: true,
    workaroundAllowed: false,
    requiredOutcome: 'Resolve Piccadilly logical asset keys and runtime configuration through shared manifests.',
  }),
  Object.freeze({
    id: 'release-build-metadata',
    owner: 'cloud-devops',
    blocking: true,
    workaroundAllowed: false,
    requiredOutcome: 'Expose Git SHA, environment, release version and deployment revision on the served route.',
  }),
]);

export function getPiccadillyPersistenceReadiness() {
  return Object.freeze({
    authority: PICCADILLY_PERSISTENCE_POLICY.authority,
    adoptionStatus: PICCADILLY_PERSISTENCE_POLICY.adoptionStatus,
    sharedContractCount: PICCADILLY_SHARED_PERSISTENCE_CONTRACTS.length,
    blockingDependencies: PICCADILLY_PLATFORM_DEPENDENCIES.filter((dependency) => dependency.blocking).length,
    localStorageAuthoritative: PICCADILLY_PERSISTENCE_POLICY.localStorage.authoritative,
    localWorkaroundsAllowed: PICCADILLY_PLATFORM_DEPENDENCIES.some((dependency) => dependency.workaroundAllowed),
  });
}
