export const PICCADILLY_LEVEL_ID = 'piccadilly-line';
export const PICCADILLY_LEVEL_VERSION = 1;
export const PICCADILLY_CANONICAL_ROUTE = '/piccadilly-line';
export const PICCADILLY_PREVIEW_ALIASES = Object.freeze(['/level-2-piccadilly']);

export const PICCADILLY_REGISTRY_POLICY = Object.freeze({
  status: 'awaiting-shared-level-registry',
  registryOwner: 'shared-platform',
  loaderOwner: 'shared-platform',
  localRegistryAllowed: false,
  bespokeBase44ProductionRouteAllowed: false,
  canonicalRouteMayBeUsedForPreviewSmokeTests: true,
});

export const PICCADILLY_DEPLOYMENT_POLICY = Object.freeze({
  owner: 'cloud-devops',
  featureBranchProductionDeployAllowed: false,
  separateDeploymentPipelineAllowed: false,
  productionReleaseRequiresSharedPipeline: true,
  productionReleaseRequiresProtectedMain: true,
  requiredBuildMetadata: Object.freeze([
    'gitSha',
    'gitRef',
    'buildTimestamp',
    'environment',
    'releaseVersion',
    'repository',
    'deploymentRevision',
  ]),
});

export const PICCADILLY_REQUIRED_ASSETS = Object.freeze([
  Object.freeze({ key: 'environment.piccadilly.ticket-hall', category: 'environment', owner: 'piccadilly-map', requiredForSmoke: true }),
  Object.freeze({ key: 'environment.piccadilly.ticket-barriers', category: 'environment', owner: 'piccadilly-map', requiredForSmoke: true }),
  Object.freeze({ key: 'environment.piccadilly.platform', category: 'environment', owner: 'piccadilly-map', requiredForSmoke: true }),
  Object.freeze({ key: 'vehicle.piccadilly.train', category: 'vehicle', owner: 'piccadilly-map', requiredForSmoke: true }),
  Object.freeze({ key: 'ui.piccadilly.line-map', category: 'ui', owner: 'piccadilly-map', requiredForSmoke: true }),
  Object.freeze({ key: 'character.player.traveller', category: 'character', owner: 'shared-platform', requiredForSmoke: true }),
  Object.freeze({ key: 'character.npc.station-staff', category: 'character', owner: 'shared-platform', requiredForSmoke: true }),
  Object.freeze({ key: 'audio.station.ambience', category: 'audio', owner: 'shared-platform', requiredForSmoke: true }),
  Object.freeze({ key: 'audio.station.announcement', category: 'audio', owner: 'shared-platform', requiredForSmoke: true }),
  Object.freeze({ key: 'audio.train.arrival-and-doors', category: 'audio', owner: 'shared-platform', requiredForSmoke: true }),
]);

export const PICCADILLY_MINIMUM_SMOKE_TEST = Object.freeze([
  Object.freeze({ id: 'route-load', action: `Open ${PICCADILLY_CANONICAL_ROUTE}`, expected: 'Piccadilly shell loads without redirecting to Heathrow.' }),
  Object.freeze({ id: 'build-identity', action: 'Read runtime build metadata.', expected: 'Served Git SHA and environment are present and match the deployment.' }),
  Object.freeze({ id: 'shared-runtime-boot', action: 'Start the map with the shared runtime.', expected: 'Shared camera, controls, rendering profile, NPC, interaction and audio systems initialize.' }),
  Object.freeze({ id: 'barrier-interaction', action: 'Use contactless or a ticket at the barrier.', expected: 'The barrier interaction advances the mission exactly once.' }),
  Object.freeze({ id: 'map-and-platform', action: 'Read the line map and confirm the platform.', expected: 'The mission records stable objective IDs without persisting renderer state.' }),
  Object.freeze({ id: 'announcement', action: 'Trigger and answer the platform announcement.', expected: 'Dialogue and announcement state uses the shared dialogue session boundary.' }),
  Object.freeze({ id: 'board-train', action: 'Board the correct train and react to the doors.', expected: 'The checkpoint advances without a soft lock or duplicate submission.' }),
  Object.freeze({ id: 'reload-recovery', action: 'Reload after the latest acknowledged checkpoint.', expected: 'Shared cloud progress wins; a valid local recovery cache is used only when recovery resolution permits it.' }),
  Object.freeze({ id: 'performance-profile', action: 'Repeat the route in Performance mode.', expected: 'Essential gameplay NPCs remain and crowd density is reduced.' }),
]);

export function getPiccadillyReleaseReadiness() {
  return Object.freeze({
    levelId: PICCADILLY_LEVEL_ID,
    levelVersion: PICCADILLY_LEVEL_VERSION,
    canonicalRoute: PICCADILLY_CANONICAL_ROUTE,
    registryStatus: PICCADILLY_REGISTRY_POLICY.status,
    requiredAssetCount: PICCADILLY_REQUIRED_ASSETS.length,
    smokeStepCount: PICCADILLY_MINIMUM_SMOKE_TEST.length,
    productionDeployAllowedFromFeatureBranch: PICCADILLY_DEPLOYMENT_POLICY.featureBranchProductionDeployAllowed,
  });
}
