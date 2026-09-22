import { PICCADILLY_LEVEL_ID } from './levelDefinition.js';

export const PICCADILLY_STEPS = Object.freeze({
  ENTER_UNDERGROUND: 'enter_underground',
  USE_TICKET_BARRIER: 'use_ticket_barrier',
  READ_LINE_MAP: 'read_line_map',
  ASK_FOR_PLATFORM: 'ask_for_platform',
  FOLLOW_PLATFORM_SIGNS: 'follow_platform_signs',
  IDENTIFY_TRAIN: 'identify_train',
  UNDERSTAND_ANNOUNCEMENT: 'understand_announcement',
  BOARD_TRAIN: 'board_train',
  COMPLETE: 'complete',
});

export const PICCADILLY_SEQUENCE = Object.freeze([
  PICCADILLY_STEPS.ENTER_UNDERGROUND,
  PICCADILLY_STEPS.USE_TICKET_BARRIER,
  PICCADILLY_STEPS.READ_LINE_MAP,
  PICCADILLY_STEPS.ASK_FOR_PLATFORM,
  PICCADILLY_STEPS.FOLLOW_PLATFORM_SIGNS,
  PICCADILLY_STEPS.IDENTIFY_TRAIN,
  PICCADILLY_STEPS.UNDERSTAND_ANNOUNCEMENT,
  PICCADILLY_STEPS.BOARD_TRAIN,
  PICCADILLY_STEPS.COMPLETE,
]);

export const PICCADILLY_RECOVERY_CACHE_VERSION = 1;
export const PICCADILLY_RECOVERY_CACHE_KEY = 'smart-parrot:recovery-cache:piccadilly-line:v1';
export const PICCADILLY_LEGACY_CHECKPOINT_KEY = 'smart-parrot:piccadilly-checkpoint:v1';

// Compatibility alias only. This is a recovery cache key, not a cloud-save key.
export const PICCADILLY_CHECKPOINT_KEY = PICCADILLY_RECOVERY_CACHE_KEY;

export const INITIAL_PICCADILLY_STATE = Object.freeze({
  step: PICCADILLY_STEPS.ENTER_UNDERGROUND,
  undergroundEntered: false,
  barrierPassed: false,
  lineMapRead: false,
  platformConfirmed: false,
  platformSignsFollowed: false,
  trainIdentified: false,
  announcementUnderstood: false,
  trainBoarded: false,
});

const COMPLETION_FLAGS = Object.freeze([
  'undergroundEntered',
  'barrierPassed',
  'lineMapRead',
  'platformConfirmed',
  'platformSignsFollowed',
  'trainIdentified',
  'announcementUnderstood',
  'trainBoarded',
]);

const TRANSITIONS = Object.freeze({
  [PICCADILLY_STEPS.ENTER_UNDERGROUND]: Object.freeze({
    event: 'ENTER_UNDERGROUND',
    nextStep: PICCADILLY_STEPS.USE_TICKET_BARRIER,
    completionFlag: 'undergroundEntered',
  }),
  [PICCADILLY_STEPS.USE_TICKET_BARRIER]: Object.freeze({
    event: 'PASS_TICKET_BARRIER',
    nextStep: PICCADILLY_STEPS.READ_LINE_MAP,
    completionFlag: 'barrierPassed',
  }),
  [PICCADILLY_STEPS.READ_LINE_MAP]: Object.freeze({
    event: 'READ_LINE_MAP',
    nextStep: PICCADILLY_STEPS.ASK_FOR_PLATFORM,
    completionFlag: 'lineMapRead',
  }),
  [PICCADILLY_STEPS.ASK_FOR_PLATFORM]: Object.freeze({
    event: 'CONFIRM_PLATFORM',
    nextStep: PICCADILLY_STEPS.FOLLOW_PLATFORM_SIGNS,
    completionFlag: 'platformConfirmed',
  }),
  [PICCADILLY_STEPS.FOLLOW_PLATFORM_SIGNS]: Object.freeze({
    event: 'REACH_PLATFORM',
    nextStep: PICCADILLY_STEPS.IDENTIFY_TRAIN,
    completionFlag: 'platformSignsFollowed',
  }),
  [PICCADILLY_STEPS.IDENTIFY_TRAIN]: Object.freeze({
    event: 'IDENTIFY_CORRECT_TRAIN',
    nextStep: PICCADILLY_STEPS.UNDERSTAND_ANNOUNCEMENT,
    completionFlag: 'trainIdentified',
  }),
  [PICCADILLY_STEPS.UNDERSTAND_ANNOUNCEMENT]: Object.freeze({
    event: 'UNDERSTAND_ANNOUNCEMENT',
    nextStep: PICCADILLY_STEPS.BOARD_TRAIN,
    completionFlag: 'announcementUnderstood',
  }),
  [PICCADILLY_STEPS.BOARD_TRAIN]: Object.freeze({
    event: 'BOARD_TRAIN',
    nextStep: PICCADILLY_STEPS.COMPLETE,
    completionFlag: 'trainBoarded',
  }),
});

const OBJECTIVE_COPY = Object.freeze({
  [PICCADILLY_STEPS.ENTER_UNDERGROUND]: 'Enter the London Underground station.',
  [PICCADILLY_STEPS.USE_TICKET_BARRIER]: 'Use contactless or a ticket to pass the barriers.',
  [PICCADILLY_STEPS.READ_LINE_MAP]: 'Read the map and find the Piccadilly Line to South Kensington.',
  [PICCADILLY_STEPS.ASK_FOR_PLATFORM]: 'Ask a station employee which platform to use.',
  [PICCADILLY_STEPS.FOLLOW_PLATFORM_SIGNS]: 'Follow the eastbound signs to the correct platform.',
  [PICCADILLY_STEPS.IDENTIFY_TRAIN]: 'Identify the Piccadilly Line train towards Cockfosters.',
  [PICCADILLY_STEPS.UNDERSTAND_ANNOUNCEMENT]: 'Listen to the station announcement and confirm the platform.',
  [PICCADILLY_STEPS.BOARD_TRAIN]: 'Board the train before the doors close.',
  [PICCADILLY_STEPS.COMPLETE]: 'Map complete — you are travelling into London.',
});

export function reducePiccadillyMission(state, event) {
  if (event?.type === 'RESET') return { ...INITIAL_PICCADILLY_STATE };

  const transition = TRANSITIONS[state.step];
  if (!transition || event?.type !== transition.event) return state;

  return {
    ...state,
    step: transition.nextStep,
    [transition.completionFlag]: true,
  };
}

export function piccadillyObjectiveCopy(step) {
  return OBJECTIVE_COPY[step] ?? '';
}

function restoreMissionState(savedState) {
  const stepIndex = PICCADILLY_SEQUENCE.indexOf(savedState?.step);
  if (stepIndex === -1) return { ...INITIAL_PICCADILLY_STATE };

  return {
    ...INITIAL_PICCADILLY_STATE,
    step: savedState.step,
    ...Object.fromEntries(
      COMPLETION_FLAGS.map((flag, flagIndex) => [flag, flagIndex < stepIndex]),
    ),
  };
}

export function createPiccadillyRecoveryEnvelope(state, savedAt = new Date().toISOString()) {
  return Object.freeze({
    cacheVersion: PICCADILLY_RECOVERY_CACHE_VERSION,
    levelId: PICCADILLY_LEVEL_ID,
    authority: 'local-recovery-only',
    synchronized: false,
    deviceScoped: true,
    serverRevision: null,
    savedAt,
    state: { ...state },
  });
}

export function loadPiccadillyRecoveryCache() {
  if (typeof window === 'undefined') return { ...INITIAL_PICCADILLY_STATE };

  try {
    const currentRaw = window.localStorage.getItem(PICCADILLY_RECOVERY_CACHE_KEY);
    const legacyRaw = window.localStorage.getItem(PICCADILLY_LEGACY_CHECKPOINT_KEY);
    const parsed = JSON.parse(currentRaw ?? legacyRaw);

    if (parsed?.cacheVersion !== undefined) {
      if (parsed.cacheVersion !== PICCADILLY_RECOVERY_CACHE_VERSION) return { ...INITIAL_PICCADILLY_STATE };
      if (parsed.levelId !== PICCADILLY_LEVEL_ID) return { ...INITIAL_PICCADILLY_STATE };
      if (parsed.authority !== 'local-recovery-only' || parsed.synchronized !== false) return { ...INITIAL_PICCADILLY_STATE };
      return restoreMissionState(parsed.state);
    }

    // One-way compatibility with the original local checkpoint shape.
    return restoreMissionState(parsed);
  } catch {
    return { ...INITIAL_PICCADILLY_STATE };
  }
}

export function savePiccadillyRecoveryCache(state) {
  if (typeof window === 'undefined') return;
  const envelope = createPiccadillyRecoveryEnvelope(state);
  window.localStorage.setItem(PICCADILLY_RECOVERY_CACHE_KEY, JSON.stringify(envelope));
  window.localStorage.removeItem(PICCADILLY_LEGACY_CHECKPOINT_KEY);
}

export function clearPiccadillyRecoveryCache() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PICCADILLY_RECOVERY_CACHE_KEY);
  window.localStorage.removeItem(PICCADILLY_LEGACY_CHECKPOINT_KEY);
}

// Temporary aliases while callers migrate to explicit recovery-cache naming.
export const loadPiccadillyCheckpoint = loadPiccadillyRecoveryCache;
export const savePiccadillyCheckpoint = savePiccadillyRecoveryCache;
export const clearPiccadillyCheckpoint = clearPiccadillyRecoveryCache;
