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
];

const allowedFiles = new Set([
  'mapContract.js',
  'missionState.js',
  'npcPopulation.js',
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
const forbiddenPlayableImports = [
  '@react-three/fiber',
  '@react-three/postprocessing',
  "from 'three'",
  'game/heathrow',
];
for (const marker of forbiddenPlayableImports) {
  assert(!playableSource.includes(marker), `PiccadillyPlayableSpine must not implement or import a local/shared-runtime workaround: ${marker}`);
}

const requiredPlayableMarkers = [
  'data-shared-runtime-status="awaiting-integration"',
  'data-ios-status',
  'data-android-status',
  'localRuntimeDuplicatesAllowed',
];
for (const marker of requiredPlayableMarkers) {
  assert(playableSource.includes(marker), `PiccadillyPlayableSpine is missing integration marker: ${marker}`);
}

const populationModule = await import(pathToFileURL(path.join(PICCADILLY_ROOT, 'npcPopulation.js')).href);
const contractModule = await import(pathToFileURL(path.join(PICCADILLY_ROOT, 'mapContract.js')).href);

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

notes.push(`Validated ${piccadillyFiles.length} Piccadilly source files.`);
notes.push(`Crowd budgets: Performance ${budgets.performance}, Auto ${budgets.auto}, HD ${budgets.hd}.`);
notes.push(`Configured ${configuredActivities.size} station activity types.`);
notes.push('iOS and Android remain correctly marked pending runtime integration and device validation.');

const summary = [
  '# Piccadilly map contract',
  '',
  ...notes.map((note) => `- ${note}`),
  '',
  failures.length === 0 ? '✅ Piccadilly map contract passed.' : '❌ Piccadilly map contract failed.',
  ...(failures.length ? ['', '## Required follow-up', ...failures.map((failure) => `- ${failure}`)] : []),
  '',
].join('\n');

console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
if (failures.length) process.exit(1);
