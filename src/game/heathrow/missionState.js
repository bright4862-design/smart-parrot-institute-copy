export const HEATHROW_STEPS = Object.freeze({
  COLLECT_SUITCASE: 'collect_suitcase',
  MEET_PICO: 'meet_pico',
  INSPECT_SIGNS: 'inspect_signs',
  HELP_GATE_TRAVELER: 'help_gate_traveler',
  ASK_EMPLOYEE: 'ask_employee',
  USE_TICKET_MACHINE: 'use_ticket_machine',
  HELP_RESTROOM_TRAVELER: 'help_restroom_traveler',
  FOLLOW_YELLOW_ROUTE: 'follow_yellow_route',
  REACH_UNDERGROUND: 'reach_underground',
  COMPLETE: 'complete',
});

export const HEATHROW_SEQUENCE = Object.freeze([
  HEATHROW_STEPS.COLLECT_SUITCASE,
  HEATHROW_STEPS.MEET_PICO,
  HEATHROW_STEPS.INSPECT_SIGNS,
  HEATHROW_STEPS.HELP_GATE_TRAVELER,
  HEATHROW_STEPS.ASK_EMPLOYEE,
  HEATHROW_STEPS.USE_TICKET_MACHINE,
  HEATHROW_STEPS.HELP_RESTROOM_TRAVELER,
  HEATHROW_STEPS.FOLLOW_YELLOW_ROUTE,
  HEATHROW_STEPS.REACH_UNDERGROUND,
  HEATHROW_STEPS.COMPLETE,
]);

export const HEATHROW_CHECKPOINT_KEY = 'smart-parrot:heathrow-checkpoint:v3';

export const INITIAL_MISSION_STATE = Object.freeze({
  step: HEATHROW_STEPS.COLLECT_SUITCASE,
  suitcaseCollected: false,
  picoMet: false,
  signsInspected: false,
  gateTravelerHelped: false,
  employeeDirectionsAnswered: false,
  ticketPurchased: false,
  restroomTravelerHelped: false,
  yellowRouteFollowed: false,
  undergroundReached: false,
});

const MISSION_TRANSITIONS = Object.freeze({
  [HEATHROW_STEPS.COLLECT_SUITCASE]: Object.freeze({
    event: 'COLLECT_SUITCASE',
    nextStep: HEATHROW_STEPS.MEET_PICO,
    completionFlag: 'suitcaseCollected',
  }),
  [HEATHROW_STEPS.MEET_PICO]: Object.freeze({
    event: 'MEET_PICO',
    nextStep: HEATHROW_STEPS.INSPECT_SIGNS,
    completionFlag: 'picoMet',
  }),
  [HEATHROW_STEPS.INSPECT_SIGNS]: Object.freeze({
    event: 'INSPECT_SIGNS',
    nextStep: HEATHROW_STEPS.HELP_GATE_TRAVELER,
    completionFlag: 'signsInspected',
  }),
  [HEATHROW_STEPS.HELP_GATE_TRAVELER]: Object.freeze({
    event: 'HELP_GATE_TRAVELER',
    nextStep: HEATHROW_STEPS.ASK_EMPLOYEE,
    completionFlag: 'gateTravelerHelped',
  }),
  [HEATHROW_STEPS.ASK_EMPLOYEE]: Object.freeze({
    event: 'ANSWER_EMPLOYEE',
    nextStep: HEATHROW_STEPS.USE_TICKET_MACHINE,
    completionFlag: 'employeeDirectionsAnswered',
  }),
  [HEATHROW_STEPS.USE_TICKET_MACHINE]: Object.freeze({
    event: 'COMPLETE_TICKET_MACHINE',
    nextStep: HEATHROW_STEPS.HELP_RESTROOM_TRAVELER,
    completionFlag: 'ticketPurchased',
  }),
  [HEATHROW_STEPS.HELP_RESTROOM_TRAVELER]: Object.freeze({
    event: 'HELP_RESTROOM_TRAVELER',
    nextStep: HEATHROW_STEPS.FOLLOW_YELLOW_ROUTE,
    completionFlag: 'restroomTravelerHelped',
  }),
  [HEATHROW_STEPS.FOLLOW_YELLOW_ROUTE]: Object.freeze({
    event: 'FOLLOW_YELLOW_ROUTE',
    nextStep: HEATHROW_STEPS.REACH_UNDERGROUND,
    completionFlag: 'yellowRouteFollowed',
  }),
  [HEATHROW_STEPS.REACH_UNDERGROUND]: Object.freeze({
    event: 'REACH_UNDERGROUND',
    nextStep: HEATHROW_STEPS.COMPLETE,
    completionFlag: 'undergroundReached',
  }),
});

const OBJECTIVE_COPY = Object.freeze({
  [HEATHROW_STEPS.COLLECT_SUITCASE]: 'Find and collect your purple suitcase at Baggage Reclaim.',
  [HEATHROW_STEPS.MEET_PICO]: 'Meet Pico beside your suitcase.',
  [HEATHROW_STEPS.INSPECT_SIGNS]: 'Inspect the airport signs to learn where to go.',
  [HEATHROW_STEPS.HELP_GATE_TRAVELER]: 'Read the Gate A12 sign and help the traveller.',
  [HEATHROW_STEPS.ASK_EMPLOYEE]: 'Ask the airport employee for directions.',
  [HEATHROW_STEPS.USE_TICKET_MACHINE]: 'Use the ticket machine to buy a ticket to Central London.',
  [HEATHROW_STEPS.HELP_RESTROOM_TRAVELER]: 'Help the traveller find the airport restrooms.',
  [HEATHROW_STEPS.FOLLOW_YELLOW_ROUTE]: 'Follow the yellow route through the terminal.',
  [HEATHROW_STEPS.REACH_UNDERGROUND]: 'Reach the Underground entrance.',
  [HEATHROW_STEPS.COMPLETE]: 'Chapter complete — collect your in-world reward.',
});

export function reduceMission(state, event) {
  if (event?.type === 'RESET') return { ...INITIAL_MISSION_STATE };

  const transition = MISSION_TRANSITIONS[state.step];
  if (!transition || event?.type !== transition.event) return state;

  return {
    ...state,
    step: transition.nextStep,
    [transition.completionFlag]: true,
  };
}

export function objectiveCopy(step) {
  return OBJECTIVE_COPY[step] ?? '';
}

export function loadCheckpoint() {
  if (typeof window === 'undefined') return { ...INITIAL_MISSION_STATE };
  try {
    const saved = JSON.parse(window.localStorage.getItem(HEATHROW_CHECKPOINT_KEY));
    if (!saved || !HEATHROW_SEQUENCE.includes(saved.step)) {
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
