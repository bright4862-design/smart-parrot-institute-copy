import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const SHOULD_CHECK_DRIFT = process.env.CHECK_BRANCH_DRIFT === 'true';
const HEATHROW_REF = process.env.HEATHROW_REF || 'origin/main';
const PICCADILLY_REF = process.env.PICCADILLY_REF || 'origin/codex/piccadilly-line-level-2';

const monitoredPaths = [
  'src/game/heathrow',
  'src/game/shared',
  'src/pages/LondonMission.jsx',
  'src/game/r3fSafeDataProps.js',
  'package.json',
  'package-lock.json',
];

const sourceContracts = [
  {
    file: 'src/game/heathrow/HeathrowPlayableSpine.jsx',
    markers: [
      'function useRenderCapabilities()',
      'function useInput(',
      'function Player(',
      'cameraFollowEnabled',
      'conversationTarget',
      'mobileRenderer',
      'GameCanvasBoundary',
      'RendererFallback',
      'EffectComposer',
      'SMAA',
      'readRenderCapabilities',
      'resolveRenderProfile',
      'loadRenderProfilePreference',
      'saveRenderProfilePreference',
      "window.addEventListener('orientationchange'",
    ],
  },
  {
    file: 'src/game/heathrow/renderProfiles.js',
    markers: [
      "AUTO: 'auto'",
      "HD: 'hd'",
      "PERFORMANCE: 'performance'",
      'export function readRenderCapabilities',
      'export function resolveRenderProfile',
      'export function loadRenderProfilePreference',
      'export function saveRenderProfilePreference',
      'precision:',
      "'highp'",
      "'mediump'",
      'antialias:',
      'smaa:',
      'bloom:',
      'shadows:',
      'minDpr:',
      'initialDpr:',
      'maxDpr,',
    ],
  },
  {
    file: 'src/game/heathrow/AirportNPCs.jsx',
    markers: [
      'playerPosition',
      'engaged',
      'dampAngle',
      'useFrame',
    ],
  },
  {
    file: 'src/game/heathrow/collisionMap.js',
    markers: [
      'resolveHeathrowMovement',
    ],
  },
];

const failures = [];
const notes = [];

function readProjectFile(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing monitored file: ${relativePath}`);
    return '';
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function runGit(args, { optional = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', optional ? 'ignore' : 'pipe'],
    }).trim();
  } catch (error) {
    if (optional) return null;
    throw error;
  }
}

function refExists(ref) {
  return runGit(['rev-parse', '--verify', '--quiet', ref], { optional: true }) !== null;
}

for (const contract of sourceContracts) {
  const source = readProjectFile(contract.file);
  if (!source) continue;

  for (const marker of contract.markers) {
    if (!source.includes(marker)) {
      failures.push(`${contract.file} no longer exposes expected contract marker: ${marker}`);
    }
  }
}

notes.push(`Validated ${sourceContracts.length} Heathrow source contracts.`);

if (SHOULD_CHECK_DRIFT) {
  if (!refExists(HEATHROW_REF)) {
    failures.push(`Cannot resolve Heathrow reference: ${HEATHROW_REF}`);
  }
  if (!refExists(PICCADILLY_REF)) {
    failures.push(`Cannot resolve Piccadilly reference: ${PICCADILLY_REF}`);
  }

  if (refExists(HEATHROW_REF) && refExists(PICCADILLY_REF)) {
    const behindCount = Number(runGit(['rev-list', '--count', `${PICCADILLY_REF}..${HEATHROW_REF}`]) || 0);
    const driftOutput = runGit([
      'diff',
      '--name-only',
      `${PICCADILLY_REF}..${HEATHROW_REF}`,
      '--',
      ...monitoredPaths,
    ]);
    const driftFiles = driftOutput ? driftOutput.split('\n').filter(Boolean) : [];

    notes.push(`Piccadilly is ${behindCount} commit(s) behind ${HEATHROW_REF}.`);

    if (driftFiles.length > 0) {
      failures.push(
        `Piccadilly has not absorbed ${driftFiles.length} monitored Heathrow/shared-engine change(s):\n- ${driftFiles.join('\n- ')}`,
      );
    }
  }
} else {
  notes.push('Branch drift comparison skipped for this event; source contracts still ran.');
}

const summaryLines = [
  '# Heathrow ↔ Piccadilly compatibility',
  '',
  ...notes.map((note) => `- ${note}`),
  '',
  failures.length === 0 ? '✅ Compatibility guard passed.' : '❌ Compatibility guard failed.',
];

if (failures.length > 0) {
  summaryLines.push('', '## Required follow-up');
  for (const failure of failures) summaryLines.push(`- ${failure.replaceAll('\n', '\n  ')}`);
}

const summary = `${summaryLines.join('\n')}\n`;
console.log(summary);

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}

if (failures.length > 0) process.exit(1);
