import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const PICCADILLY_ROOT = path.join(ROOT, 'src/game/piccadilly');
const failures = [];
const notes = [];

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing required file: ${relativePath}`);
    return '';
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const localRuntimePatterns = [
  /camera/i,
  /render(?:er|ing)?/i,
  /input/i,
  /controls?/i,
  /audio/i,
  /ambience/i,
  /interaction/i,
  /NPCPopulation/i,
  /auth/i,
  /api/i,
  /deploy/i,
];

const allowedFiles = new Set([
  'levelDefinition.js',
  'mapContract.js',
  'missionState.js',
  'npcPopulation.js',
  'persistenceContract.js',
  'PiccadillyPlayableSpine.jsx',
]);

const piccadillyFiles = fs.readdirSync(PICCADILLY_ROOT, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name);

for (const fileName of piccadillyFiles) {
  if (allowedFiles.has(fileName)) continue;
  if (localRuntimePatterns.some((pattern) => pattern.test(fileName))) {
    failures.push(`Piccadilly contains a forbidden map-specific runtime duplicate: src/game/piccadilly/${fileName}`);
  }
}

const playableSource = read('src/game/piccadilly/PiccadillyPlayableSpine.jsx');
const missionSource = read('src/game/piccadilly/missionState.js');
const appSource = read('src/App.jsx');

const forbiddenPlayableImports = [
  '@react-three/fiber',
  '@react-three/postprocessing',
  "from 'three'",
  'game/heathrow',
];
for (const marker of forbiddenPlayableImports) {
  assert(!playableSource.includes(marker), `PiccadillyPlayableSpine must not implement or import a local/shared-runtime workaround: ${marker}`);
}

const forbiddenImplementationMarkers = [
  'fetch(',
  'axios',
  'base44.entities',
  'base44.functions',
  'Authorization',
  '/api/piccadilly',
  'signIn(',
  'login(',
];
for (const source of [playableSource, missionSource]) {
  for (const marker of forbiddenImplementationMarkers) {
    assert(!source.includes(marker), `Piccadilly must not implement a map-specific API or authentication flow: ${marker}`);
  }
}

const requiredPlayableMarkers = [
  'data-level-id',
  'data-canonical-route',
  'data-registry-status',
  'data-shared-runtime-status="awaiting-integration"',
  'data-persistence-authority',
  'data-local-cache-authoritative',
  'data-feature-branch-production-deploy="blocked"',
  'data-ios-status',
  'data-android-status',
  'localRuntimeDuplicatesAllowed',
];
for (const marker of requiredPlayableMarkers) {
  assert(playableSource.includes(marker), `PiccadillyPlayableSpine is missing integration marker: ${marker}`);
}

const populationModule = await import(pathToFileURL(path.join(PICCADILLY_ROOT, 'npcPopulation.js')).href);
const contractModule = await import(pathToFileURL(path.join(PICCADILLY_ROOT, 'mapContract.js')).href);
const definitionModule = await import(pathToFileURL(path.join(PICCADILLY_ROOT, 'levelDefinition.js')).href);
const persistenceModule = await import(pathToFileURL(path.join(PICCADILLY_ROOT, 'persistenceContract.js')).href);
const missionModule = await import(pathToFileURL(path.join(PICCADILLY_ROOT, 'missionState.js')).href);

const budgets = populationModule.PICCADILLY_CROWD_BUDGETS;
assert(budgets.performance < budgets.auto, 'Performance crowd budget must be lower than Auto.');
assert(budgets.auto < budgets.hd, 'Auto crowd budget must be lower than HD.');

const requiredActivities = [
  'assist-ticket-machine',
  'tap-barrier',
  'read-map',
  'wait-platform',
  'react-announcement',
  'board-train',
  'react-train-doors',
];
const configuredActivities = new Set([
  ...Object.values(populationModule.PICCADILLY_NPC_ACTIVITIES),
  ...populationModule.PICCADILLY_FEATURED_NPCS.map((npc) => npc.activity),
]);
for (const activity of requiredActivities) {
  assert(configuredActivities.has(activity), `Piccadilly is missing required transport NPC activity: ${activity}`);
}

const performancePopulation = populationModule.getPiccadillyPopulationSummary('performance');
const autoPopulation = populationModule.getPiccadillyPopulationSummary('auto');
const hdPopulation = populationModule.getPiccadillyPopulationSummary('hd');
assert(performancePopulation.total < autoPopulation.total, 'Performance total NPC population must be lower than Auto.');
assert(autoPopulation.total < hdPopulation.total, 'Auto total NPC population must be lower than HD.');

const dependencySummary = contractModule.getPiccadillyDependencySummary();
assert(dependencySummary.localRuntimeDuplicatesAllowed === 0, 'Piccadilly must allow zero local shared-runtime duplicates.');
assert(dependencySummary.sharedOwned === dependencySummary.total, 'Every declared runtime system must remain shared-engine owned.');

const requiredSharedSystems = ['rendering', 'camera', 'npc', 'interaction', 'audio', 'mobilePerformance'];
for (const system of requiredSharedSystems) {
  assert(Boolean(contractModule.PICCADILLY_SHARED_SYSTEMS[system]), `Missing shared-system dependency: ${system}`);
}

for (const platform of ['ios', 'android']) {
  const acceptance = contractModule.PICCADILLY_MOBILE_ACCEPTANCE[platform];
  assert(Boolean(acceptance), `Missing ${platform} mobile acceptance contract.`);
  assert(acceptance.status === 'pending-runtime-integration', `${platform} compatibility must remain pending until runtime and device evidence are recorded.`);
  assert(acceptance.checks.includes('touch-interaction-reliable'), `${platform} acceptance must cover touch interaction.`);
  assert(acceptance.checks.includes('camera-restores-after-orientation-change'), `${platform} acceptance must cover camera orientation recovery.`);
  assert(acceptance.checks.includes('performance-profile-maintains-crowd-budget'), `${platform} acceptance must cover performance crowd density.`);
}

assert(definitionModule.PICCADILLY_LEVEL_ID === 'piccadilly-line', 'Piccadilly stable level ID must remain piccadilly-line.');
assert(definitionModule.PICCADILLY_LEVEL_VERSION >= 1, 'Piccadilly level version must be explicit.');
assert(definitionModule.PICCADILLY_CANONICAL_ROUTE === '/piccadilly-line', 'Piccadilly canonical route must remain /piccadilly-line.');
assert(appSource.includes(`path="${definitionModule.PICCADILLY_CANONICAL_ROUTE}"`), 'App router must expose the canonical Piccadilly preview route.');
for (const alias of definitionModule.PICCADILLY_PREVIEW_ALIASES) {
  assert(appSource.includes(`path="${alias}"`), `App router is missing declared Piccadilly preview alias: ${alias}`);
}

const registryPolicy = definitionModule.PICCADILLY_REGISTRY_POLICY;
assert(registryPolicy.status === 'awaiting-shared-level-registry', 'Piccadilly must remain registered as awaiting the shared level registry.');
assert(registryPolicy.localRegistryAllowed === false, 'Piccadilly must not create a local level registry.');
assert(registryPolicy.bespokeBase44ProductionRouteAllowed === false, 'Piccadilly must not create a bespoke Base44 production route.');

const deploymentPolicy = definitionModule.PICCADILLY_DEPLOYMENT_POLICY;
assert(deploymentPolicy.owner === 'cloud-devops', 'Cloud/DevOps must own Piccadilly deployment.');
assert(deploymentPolicy.featureBranchProductionDeployAllowed === false, 'Piccadilly feature branch must never deploy directly to production.');
assert(deploymentPolicy.separateDeploymentPipelineAllowed === false, 'Piccadilly must not create a separate deployment pipeline.');
for (const field of ['gitSha', 'gitRef', 'buildTimestamp', 'environment', 'releaseVersion', 'repository', 'deploymentRevision']) {
  assert(deploymentPolicy.requiredBuildMetadata.includes(field), `Piccadilly release contract is missing build metadata field: ${field}`);
}

const assetKeys = definitionModule.PICCADILLY_REQUIRED_ASSETS.map((asset) => asset.key);
assert(assetKeys.length >= 8, 'Piccadilly must publish a meaningful required-asset list.');
assert(new Set(assetKeys).size === assetKeys.length, 'Piccadilly required-asset keys must be unique.');
for (const asset of definitionModule.PICCADILLY_REQUIRED_ASSETS) {
  assert(!asset.key.includes('/'), `Asset manifest entries must use logical keys rather than filenames: ${asset.key}`);
  assert(['piccadilly-map', 'shared-platform'].includes(asset.owner), `Asset ${asset.key} has an invalid owner.`);
}

const smokeIds = new Set(definitionModule.PICCADILLY_MINIMUM_SMOKE_TEST.map((step) => step.id));
for (const smokeId of ['route-load', 'build-identity', 'shared-runtime-boot', 'barrier-interaction', 'map-and-platform', 'announcement', 'board-train', 'reload-recovery', 'performance-profile']) {
  assert(smokeIds.has(smokeId), `Piccadilly minimum smoke test is missing: ${smokeId}`);
}

const sharedPersistenceContracts = new Set(persistenceModule.PICCADILLY_SHARED_PERSISTENCE_CONTRACTS);
for (const contractName of ['PlayerProgress', 'MissionSession', 'CheckpointUpdate', 'DialogueSession', 'GameplayEvent', 'LevelConfiguration', 'RecoveryResolution']) {
  assert(sharedPersistenceContracts.has(contractName), `Piccadilly persistence adoption is missing shared contract: ${contractName}`);
}

const persistencePolicy = persistenceModule.PICCADILLY_PERSISTENCE_POLICY;
assert(persistencePolicy.authority === 'shared-cloud-player-progress', 'Shared cloud PlayerProgress must be authoritative.');
assert(persistencePolicy.piccadillySpecificSaveEntityAllowed === false, 'Piccadilly-specific save entities are forbidden.');
assert(persistencePolicy.piccadillySpecificApiAllowed === false, 'Piccadilly-specific APIs are forbidden.');
assert(persistencePolicy.piccadillySpecificAuthenticationAllowed === false, 'Piccadilly-specific authentication is forbidden.');
assert(persistencePolicy.localStorage.role === 'temporary-versioned-recovery-cache', 'LocalStorage must be classified as a temporary recovery cache.');
assert(persistencePolicy.localStorage.authoritative === false, 'LocalStorage must never be authoritative.');
assert(persistencePolicy.localStorage.synchronized === false, 'LocalStorage recovery cache must remain unsynchronized.');
assert(persistencePolicy.localStorage.mayOverrideServerProgress === false, 'Local recovery cache must never override server progress without RecoveryResolution.');

for (const dependency of persistenceModule.PICCADILLY_PLATFORM_DEPENDENCIES) {
  assert(dependency.blocking === true, `Platform dependency must be explicitly classified as blocking: ${dependency.id}`);
  assert(dependency.workaroundAllowed === false, `Local workaround must be forbidden for dependency: ${dependency.id}`);
  assert(dependency.owner !== 'piccadilly', `Shared platform dependency cannot be owned locally: ${dependency.id}`);
}

const recoveryEnvelope = missionModule.createPiccadillyRecoveryEnvelope(
  missionModule.INITIAL_PICCADILLY_STATE,
  '2026-07-30T00:00:00.000Z',
);
assert(recoveryEnvelope.levelId === definitionModule.PICCADILLY_LEVEL_ID, 'Recovery cache must be scoped to the stable Piccadilly level ID.');
assert(recoveryEnvelope.authority === 'local-recovery-only', 'Recovery envelope must identify itself as non-authoritative.');
assert(recoveryEnvelope.synchronized === false, 'Recovery envelope must identify itself as unsynchronized.');
assert(recoveryEnvelope.deviceScoped === true, 'Recovery envelope must identify itself as device-scoped.');
assert(recoveryEnvelope.serverRevision === null, 'Local recovery cache must not invent a server revision.');
assert(missionModule.PICCADILLY_RECOVERY_CACHE_KEY.includes('recovery-cache'), 'Recovery cache key must not be presented as a cloud-save key.');

const persistedStateKeys = Object.keys(recoveryEnvelope.state);
for (const forbiddenKey of ['x', 'z', 'coordinates', 'camera', 'animation', 'webgl', 'npcMovement', 'renderProfile']) {
  assert(!persistedStateKeys.includes(forbiddenKey), `Recovery state must not persist transient renderer state: ${forbiddenKey}`);
}

const workflowsRoot = path.join(ROOT, '.github/workflows');
if (fs.existsSync(workflowsRoot)) {
  const forbiddenDeployCommands = ['gcloud run deploy', 'base44 deploy', 'firebase deploy', 'vercel deploy', 'environment: production'];
  for (const entry of fs.readdirSync(workflowsRoot, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const workflowSource = fs.readFileSync(path.join(workflowsRoot, entry.name), 'utf8');
    if (!workflowSource.toLowerCase().includes('piccadilly')) continue;
    for (const command of forbiddenDeployCommands) {
      assert(!workflowSource.toLowerCase().includes(command), `Piccadilly workflow must not deploy the feature branch directly: ${entry.name} contains ${command}`);
    }
  }
}

notes.push(`Validated ${piccadillyFiles.length} Piccadilly source files.`);
notes.push(`Level ${definitionModule.PICCADILLY_LEVEL_ID} uses canonical preview route ${definitionModule.PICCADILLY_CANONICAL_ROUTE}.`);
notes.push(`Required assets: ${assetKeys.length}; minimum smoke actions: ${smokeIds.size}.`);
notes.push(`Crowd budgets: Performance ${budgets.performance}, Auto ${budgets.auto}, HD ${budgets.hd}.`);
notes.push(`Configured ${configuredActivities.size} station activity types.`);
notes.push(`Shared persistence contracts declared: ${sharedPersistenceContracts.size}.`);
notes.push(`Blocking shared-platform dependencies: ${persistenceModule.PICCADILLY_PLATFORM_DEPENDENCIES.length}.`);
notes.push('LocalStorage is correctly constrained to a versioned, unsynchronized recovery cache.');
notes.push('iOS and Android remain correctly marked pending runtime integration and device validation.');
notes.push('Feature-branch production deployment and bespoke Base44 routing remain forbidden.');

const summary = [
  '# Piccadilly map and platform contract',
  '',
  ...notes.map((note) => `- ${note}`),
  '',
  failures.length === 0 ? '✅ Piccadilly map and platform contract passed.' : '❌ Piccadilly map and platform contract failed.',
  ...(failures.length ? ['', '## Required follow-up', ...failures.map((failure) => `- ${failure}`)] : []),
  '',
].join('\n');

console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
if (failures.length) process.exit(1);
