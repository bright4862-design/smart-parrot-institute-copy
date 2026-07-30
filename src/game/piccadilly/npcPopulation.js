export const PICCADILLY_CROWD_BUDGETS = Object.freeze({
  performance: 12,
  auto: 24,
  hd: 36,
});

export const PICCADILLY_NPC_ACTIVITIES = Object.freeze({
  ASSIST_TICKET_MACHINE: 'assist-ticket-machine',
  TAP_BARRIER: 'tap-barrier',
  READ_MAP: 'read-map',
  WAIT_PLATFORM: 'wait-platform',
  REACT_ANNOUNCEMENT: 'react-announcement',
  BOARD_TRAIN: 'board-train',
  REACT_TRAIN_DOORS: 'react-train-doors',
  CLEAN_STATION: 'clean-station',
  MOVE_THROUGH_STATION: 'move-through-station',
});

export const PICCADILLY_FEATURED_NPCS = Object.freeze([
  Object.freeze({ id: 'ticket-hall-staff', role: 'Station assistant', zone: 'ticket-hall', activity: PICCADILLY_NPC_ACTIVITIES.ASSIST_TICKET_MACHINE, position: Object.freeze([5.8, 0, -8.4]), rotation: -2.35, palette: 0, interactive: true, reactsToAnnouncements: true, performanceEssential: true }),
  Object.freeze({ id: 'lost-tourist', role: 'Lost tourist', zone: 'ticket-hall', activity: PICCADILLY_NPC_ACTIVITIES.READ_MAP, position: Object.freeze([-6.4, 0, -6.2]), rotation: 0.65, palette: 1, interactive: true, reactsToAnnouncements: true, performanceEssential: true }),
  Object.freeze({ id: 'gate-commuter', role: 'Rushing commuter', zone: 'barriers', activity: PICCADILLY_NPC_ACTIVITIES.TAP_BARRIER, position: Object.freeze([2.3, 0, -1.2]), rotation: Math.PI, palette: 2, interactive: false, reactsToAnnouncements: false, performanceEssential: true }),
  Object.freeze({ id: 'family-parent', role: 'Parent', zone: 'barriers', activity: PICCADILLY_NPC_ACTIVITIES.READ_MAP, position: Object.freeze([-4.7, 0, 0.8]), rotation: 0.25, palette: 3, interactive: true, reactsToAnnouncements: true, performanceEssential: true }),
  Object.freeze({ id: 'family-child', role: 'Child', zone: 'barriers', activity: PICCADILLY_NPC_ACTIVITIES.REACT_ANNOUNCEMENT, position: Object.freeze([-3.8, 0, 1.25]), rotation: -0.3, palette: 4, interactive: false, reactsToAnnouncements: true, performanceEssential: true, scale: 0.72 }),
  Object.freeze({ id: 'station-cleaner', role: 'Station cleaner', zone: 'corridor', activity: PICCADILLY_NPC_ACTIVITIES.CLEAN_STATION, position: Object.freeze([7.2, 0, 7.8]), rotation: -1.45, palette: 5, interactive: true, reactsToAnnouncements: false, performanceEssential: false }),
  Object.freeze({ id: 'busker', role: 'Musician', zone: 'corridor', activity: PICCADILLY_NPC_ACTIVITIES.REACT_ANNOUNCEMENT, position: Object.freeze([-7.6, 0, 9.5]), rotation: 1.3, palette: 6, interactive: true, reactsToAnnouncements: true, performanceEssential: false }),
  Object.freeze({ id: 'platform-staff', role: 'Platform staff', zone: 'platform', activity: PICCADILLY_NPC_ACTIVITIES.REACT_TRAIN_DOORS, position: Object.freeze([5.5, 0, 18.3]), rotation: -2.6, palette: 7, interactive: true, reactsToAnnouncements: true, performanceEssential: true }),
  Object.freeze({ id: 'elderly-passenger', role: 'Passenger', zone: 'platform', activity: PICCADILLY_NPC_ACTIVITIES.WAIT_PLATFORM, position: Object.freeze([-5.4, 0, 17.1]), rotation: 0.45, palette: 8, interactive: true, reactsToAnnouncements: true, performanceEssential: false }),
  Object.freeze({ id: 'student-passenger', role: 'Student', zone: 'platform', activity: PICCADILLY_NPC_ACTIVITIES.BOARD_TRAIN, position: Object.freeze([0.4, 0, 20.2]), rotation: Math.PI, palette: 9, interactive: true, reactsToAnnouncements: true, performanceEssential: false }),
]);

const CROWD_LANES = Object.freeze([
  Object.freeze({ zone: 'ticket-hall', start: [-10.5, -10.4], end: [10.5, -10.4], axis: 'x', activities: Object.freeze([PICCADILLY_NPC_ACTIVITIES.MOVE_THROUGH_STATION, PICCADILLY_NPC_ACTIVITIES.READ_MAP, PICCADILLY_NPC_ACTIVITIES.ASSIST_TICKET_MACHINE]) }),
  Object.freeze({ zone: 'ticket-hall', start: [-9.5, -5.2], end: [9.5, -5.2], axis: 'x', activities: Object.freeze([PICCADILLY_NPC_ACTIVITIES.READ_MAP, PICCADILLY_NPC_ACTIVITIES.MOVE_THROUGH_STATION]) }),
  Object.freeze({ zone: 'barriers', start: [-8.5, -0.6], end: [8.5, -0.6], axis: 'x', activities: Object.freeze([PICCADILLY_NPC_ACTIVITIES.TAP_BARRIER, PICCADILLY_NPC_ACTIVITIES.MOVE_THROUGH_STATION]) }),
  Object.freeze({ zone: 'corridor', start: [-4.8, 4.2], end: [-4.8, 13.8], axis: 'z', activities: Object.freeze([PICCADILLY_NPC_ACTIVITIES.MOVE_THROUGH_STATION, PICCADILLY_NPC_ACTIVITIES.REACT_ANNOUNCEMENT]) }),
  Object.freeze({ zone: 'corridor', start: [4.8, 4.2], end: [4.8, 13.8], axis: 'z', activities: Object.freeze([PICCADILLY_NPC_ACTIVITIES.MOVE_THROUGH_STATION, PICCADILLY_NPC_ACTIVITIES.REACT_ANNOUNCEMENT]) }),
  Object.freeze({ zone: 'platform', start: [-10.2, 17.2], end: [10.2, 17.2], axis: 'x', activities: Object.freeze([PICCADILLY_NPC_ACTIVITIES.WAIT_PLATFORM, PICCADILLY_NPC_ACTIVITIES.REACT_ANNOUNCEMENT, PICCADILLY_NPC_ACTIVITIES.BOARD_TRAIN]) }),
  Object.freeze({ zone: 'platform', start: [-9.4, 21.1], end: [9.4, 21.1], axis: 'x', activities: Object.freeze([PICCADILLY_NPC_ACTIVITIES.WAIT_PLATFORM, PICCADILLY_NPC_ACTIVITIES.REACT_TRAIN_DOORS, PICCADILLY_NPC_ACTIVITIES.BOARD_TRAIN]) }),
]);

function seededUnit(seed) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

function normalizeProfile(profile) {
  return profile === 'performance' || profile === 'hd' ? profile : 'auto';
}

function resolveActivity(lane, index) {
  return lane.activities[index % lane.activities.length];
}

export function buildPiccadillyAmbientCrowd(profile = 'auto') {
  const resolvedProfile = normalizeProfile(profile);
  const count = PICCADILLY_CROWD_BUDGETS[resolvedProfile];

  return Array.from({ length: count }, (_, index) => {
    const lane = CROWD_LANES[index % CROWD_LANES.length];
    const laneProgress = seededUnit(index + 11);
    const lateralJitter = (seededUnit(index + 91) - 0.5) * 1.15;
    const x = lerp(lane.start[0], lane.end[0], laneProgress) + (lane.axis === 'z' ? lateralJitter : 0);
    const z = lerp(lane.start[1], lane.end[1], laneProgress) + (lane.axis === 'x' ? lateralJitter : 0);
    const activity = resolveActivity(lane, index);
    const waitsInPlace = activity === PICCADILLY_NPC_ACTIVITIES.WAIT_PLATFORM
      || activity === PICCADILLY_NPC_ACTIVITIES.READ_MAP
      || activity === PICCADILLY_NPC_ACTIVITIES.REACT_ANNOUNCEMENT;

    return Object.freeze({
      id: `ambient-${index + 1}`,
      zone: lane.zone,
      activity,
      position: Object.freeze([x, 0, z]),
      axis: lane.axis,
      range: waitsInPlace ? 0.08 : 0.8 + seededUnit(index + 137) * 2.4,
      speed: waitsInPlace ? 0.08 : 0.16 + seededUnit(index + 173) * 0.2,
      phase: seededUnit(index + 211) * Math.PI * 2,
      palette: index % 10,
      scale: 0.9 + seededUnit(index + 257) * 0.22,
      suitcase: index % 7 === 0,
      phone: activity === PICCADILLY_NPC_ACTIVITIES.READ_MAP || index % 5 === 0,
      reactsToAnnouncements: lane.zone === 'platform' || index % 4 === 0,
      reactsToTrainDoors: lane.zone === 'platform' && index % 3 !== 0,
      boardingPriority: lane.zone === 'platform' ? seededUnit(index + 313) : 0,
    });
  });
}

export function getPiccadillyFeaturedNPCs(profile = 'auto') {
  const resolvedProfile = normalizeProfile(profile);
  if (resolvedProfile !== 'performance') return PICCADILLY_FEATURED_NPCS;
  return PICCADILLY_FEATURED_NPCS.filter((npc) => npc.performanceEssential);
}

export function getPiccadillyPopulationSummary(profile = 'auto') {
  const resolvedProfile = normalizeProfile(profile);
  return Object.freeze({
    profile: resolvedProfile,
    featured: getPiccadillyFeaturedNPCs(resolvedProfile).length,
    ambient: PICCADILLY_CROWD_BUDGETS[resolvedProfile],
    total: getPiccadillyFeaturedNPCs(resolvedProfile).length + PICCADILLY_CROWD_BUDGETS[resolvedProfile],
  });
}
