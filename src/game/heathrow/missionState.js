export const HEATHROW_STEPS = Object.freeze({
  COLLECT_SUITCASE: 'collect_suitcase',
  MEET_PICO: 'meet_pico',
  ASK_EMPLOYEE: 'ask_employee',
  FIND_UNDERGROUND: 'find_underground',
  COMPLETE: 'complete',
});

export const HEATHROW_CHECKPOINT_KEY = 'smart-parrot:heathrow-checkpoint:v2';

export const INITIAL_MISSION_STATE = Object.freeze({
  step: HEATHROW_STEPS.COLLECT_SUITCASE,
  suitcaseCollected: false,
  picoMet: false,
  phraseAnswered: false,
  undergroundFound: false,
});

export function reduceMission(state, event) {
  switch (event.type) {
    case 'COLLECT_SUITCASE':
      if (state.step !== HEATHROW_STEPS.COLLECT_SUITCASE) return state;
      return {
        ...state,
        step: HEATHROW_STEPS.MEET_PICO,
        suitcaseCollected: true,
      };
    case 'MEET_PICO':
      if (state.step !== HEATHROW_STEPS.MEET_PICO) return state;
      return {
        ...state,
        step: HEATHROW_STEPS.ASK_EMPLOYEE,
        picoMet: true,
      };
    case 'ANSWER_PHRASE':
      if (state.step !== HEATHROW_STEPS.ASK_EMPLOYEE) return state;
      return {
        ...state,
        step: HEATHROW_STEPS.FIND_UNDERGROUND,
        phraseAnswered: true,
      };
    case 'FIND_UNDERGROUND':
      if (state.step !== HEATHROW_STEPS.FIND_UNDERGROUND) return state;
      return {
        ...state,
        step: HEATHROW_STEPS.COMPLETE,
        undergroundFound: true,
      };
    case 'RESET':
      return { ...INITIAL_MISSION_STATE };
    default:
      return state;
  }
}

export function objectiveCopy(step) {
  switch (step) {
    case HEATHROW_STEPS.COLLECT_SUITCASE:
      return 'Find your purple suitcase at the luggage carousel.';
    case HEATHROW_STEPS.MEET_PICO:
      return 'Say hello to the little parrot on your suitcase.';
    case HEATHROW_STEPS.ASK_EMPLOYEE:
      return 'Find an airport employee and ask for directions.';
    case HEATHROW_STEPS.FIND_UNDERGROUND:
      return 'Follow Pico and the yellow route to the Underground.';
    case HEATHROW_STEPS.COMPLETE:
      return 'Route unlocked — continue toward the Underground.';
    default:
      return '';
  }
}

export function loadCheckpoint() {
  if (typeof window === 'undefined') return { ...INITIAL_MISSION_STATE };
  try {
    const saved = JSON.parse(window.localStorage.getItem(HEATHROW_CHECKPOINT_KEY));
    if (!saved || !Object.values(HEATHROW_STEPS).includes(saved.step)) {
      return { ...INITIAL_MISSION_STATE };
    }
    return { ...INITIAL_MISSION_STATE, ...saved };
  } catch {
    return { ...INITIAL_MISSION_STATE };
  }
}

export function saveCheckpoint(state) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(HEATHROW_CHECKPOINT_KEY, JSON.stringify(state));
}

export function clearCheckpoint() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(HEATHROW_CHECKPOINT_KEY);
}
