export const CAFE_TABLE_RADIUS = 0.72;

export const CAFE_TABLES = Object.freeze([
  Object.freeze({ id: 'west', position: Object.freeze([18.4, 0, 4.65]) }),
  Object.freeze({ id: 'east', position: Object.freeze([25.0, 0, 4.65]) }),
]);

export const CAFE_SEATS = Object.freeze([
  Object.freeze({
    id: 'west-phone',
    tableId: 'west',
    position: Object.freeze([17.15, 0, 4.65]),
    rotation: Math.PI / 2,
    activity: 'phone',
    palette: 0,
    phase: 0.2,
  }),
  Object.freeze({
    id: 'east-drink',
    tableId: 'east',
    position: Object.freeze([26.25, 0, 4.65]),
    rotation: -Math.PI / 2,
    activity: 'drink',
    palette: 1,
    phase: 1.3,
  }),
  Object.freeze({
    id: 'west-laptop',
    tableId: 'west',
    position: Object.freeze([19.65, 0, 4.65]),
    rotation: -Math.PI / 2,
    activity: 'laptop',
    palette: 2,
    phase: 2.4,
  }),
  Object.freeze({
    id: 'east-laptop',
    tableId: 'east',
    position: Object.freeze([23.75, 0, 4.65]),
    rotation: Math.PI / 2,
    activity: 'laptop',
    palette: 3,
    phase: 3.7,
  }),
]);

export const CAFE_POPULATION_PROFILES = Object.freeze({
  reduced: Object.freeze({
    id: 'reduced',
    workerRoles: Object.freeze(['barista', 'service']),
    travelerCount: 2,
    chatterVoices: 1,
  }),
  balanced: Object.freeze({
    id: 'balanced',
    workerRoles: Object.freeze(['barista', 'service']),
    travelerCount: 3,
    chatterVoices: 2,
  }),
  full: Object.freeze({
    id: 'full',
    workerRoles: Object.freeze(['barista', 'service', 'cashier']),
    travelerCount: 4,
    chatterVoices: 3,
  }),
});

export function resolveCafePopulation(decorationDensity = 'balanced') {
  return CAFE_POPULATION_PROFILES[decorationDensity]
    ?? CAFE_POPULATION_PROFILES.balanced;
}
