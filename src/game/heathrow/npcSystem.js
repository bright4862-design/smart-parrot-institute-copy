export const NPC_PERFORMANCE_PROFILES = Object.freeze({
  reduced: Object.freeze({
    id: 'reduced',
    animationComplexity: 'low',
    awarenessRadius: 5.2,
    reactionDurationMs: 1600,
    reactionsEnabled: true,
    zoneCounts: Object.freeze({ checkin: 1, security: 1, gates: 1, concourse: 1 }),
  }),
  balanced: Object.freeze({
    id: 'balanced',
    animationComplexity: 'medium',
    awarenessRadius: 6.2,
    reactionDurationMs: 2200,
    reactionsEnabled: true,
    zoneCounts: Object.freeze({ checkin: 2, security: 2, gates: 2, concourse: 3 }),
  }),
  full: Object.freeze({
    id: 'full',
    animationComplexity: 'high',
    awarenessRadius: 7.2,
    reactionDurationMs: 2600,
    reactionsEnabled: true,
    zoneCounts: Object.freeze({ checkin: 3, security: 3, gates: 3, concourse: 5 }),
  }),
});

export function resolveNPCPerformanceProfile(decorationDensity = 'balanced', mobileRenderer = false) {
  const requested = NPC_PERFORMANCE_PROFILES[decorationDensity]
    ?? NPC_PERFORMANCE_PROFILES.balanced;
  if (mobileRenderer && requested.id === 'full') return NPC_PERFORMANCE_PROFILES.balanced;
  return requested;
}

export const AIRPORT_ZONE_ACTORS = Object.freeze({
  checkin: Object.freeze([
    Object.freeze({
      id: 'checkin-agent',
      zone: 'checkin',
      position: Object.freeze([-24.2, 0.7, -11.8]),
      rotation: 0.2,
      animation: 'work',
      activity: 'tablet',
      role: 'staff',
      palette: 0,
      phase: 0.2,
      lines: Object.freeze(['Passports ready, please.', 'Bag drop is just ahead.']),
    }),
    Object.freeze({
      id: 'checkin-traveler',
      zone: 'checkin',
      position: Object.freeze([-20.3, 0.7, -13.7]),
      rotation: 2.5,
      animation: 'idle',
      activity: 'suitcase',
      role: 'traveler',
      palette: 2,
      phase: 1.1,
      lines: Object.freeze(['I think this is the right queue.', 'Have you checked the screen?']),
    }),
    Object.freeze({
      id: 'checkin-walker',
      zone: 'checkin',
      position: Object.freeze([-27.2, 0.7, -7.2]),
      rotation: 0,
      animation: 'walk',
      activity: 'suitcase',
      role: 'traveler',
      palette: 4,
      phase: 2.4,
      path: Object.freeze({ axis: 'z', range: 2.0, speed: 0.22 }),
      lines: Object.freeze(['Excuse me.', 'The queue starts over there.']),
    }),
  ]),
  security: Object.freeze([
    Object.freeze({
      id: 'security-officer',
      zone: 'security',
      position: Object.freeze([-4.8, 0.7, -2.4]),
      rotation: 0.1,
      animation: 'work',
      activity: 'scanner',
      role: 'security',
      palette: 1,
      phase: 0.7,
      lines: Object.freeze(['Laptops out, please.', 'Liquids stay in the clear bag.']),
    }),
    Object.freeze({
      id: 'security-traveler',
      zone: 'security',
      position: Object.freeze([0.2, 0.7, -3.8]),
      rotation: -0.6,
      animation: 'idle',
      activity: 'phone',
      role: 'traveler',
      palette: 3,
      phase: 1.9,
      lines: Object.freeze(['Is this the fast-track lane?', 'I nearly forgot my laptop.']),
    }),
    Object.freeze({
      id: 'security-walker',
      zone: 'security',
      position: Object.freeze([5.1, 0.7, -1.8]),
      rotation: 0,
      animation: 'walk',
      activity: 'none',
      role: 'traveler',
      palette: 5,
      phase: 3.0,
      path: Object.freeze({ axis: 'z', range: 1.5, speed: 0.24 }),
      lines: Object.freeze(['Security looks quiet.', 'This way, I think.']),
    }),
  ]),
  gates: Object.freeze([
    Object.freeze({
      id: 'gate-agent',
      zone: 'gates',
      position: Object.freeze([-23.4, 0.7, 4.0]),
      rotation: Math.PI,
      animation: 'work',
      activity: 'clipboard',
      role: 'staff',
      palette: 1,
      phase: 0.4,
      lines: Object.freeze(['Gate A12 opens shortly.', 'Please keep your boarding pass ready.']),
    }),
    Object.freeze({
      id: 'gate-seated',
      zone: 'gates',
      position: Object.freeze([-18.5, 0.7, 3.1]),
      rotation: -Math.PI / 2,
      animation: 'idle',
      activity: 'phone',
      role: 'traveler',
      palette: 4,
      phase: 1.5,
      lines: Object.freeze(['Still waiting for boarding.', 'The gate changed once already.']),
    }),
    Object.freeze({
      id: 'gate-walker',
      zone: 'gates',
      position: Object.freeze([-28.0, 0.7, 12.2]),
      rotation: 0,
      animation: 'walk',
      activity: 'suitcase',
      role: 'traveler',
      palette: 2,
      phase: 2.8,
      path: Object.freeze({ axis: 'x', range: 1.3, speed: 0.2 }),
      lines: Object.freeze(['A12 is this direction.', 'Boarding soon.']),
    }),
  ]),
  concourse: Object.freeze([
    Object.freeze({
      id: 'concourse-guide',
      zone: 'concourse',
      position: Object.freeze([-7.0, 0.7, 3.0]),
      rotation: 0.8,
      animation: 'work',
      activity: 'tablet',
      role: 'staff',
      palette: 0,
      phase: 0.1,
      lines: Object.freeze(['Underground signs are ahead.', 'Can I help with directions?']),
    }),
    Object.freeze({
      id: 'concourse-phone',
      zone: 'concourse',
      position: Object.freeze([6.8, 0.7, 3.4]),
      rotation: -1.1,
      animation: 'idle',
      activity: 'phone',
      role: 'traveler',
      palette: 3,
      phase: 1.2,
      lines: Object.freeze(['I am checking the train times.', 'The Wi-Fi is working now.']),
    }),
    Object.freeze({
      id: 'concourse-walker-west',
      zone: 'concourse',
      position: Object.freeze([-6.2, 0.7, 7.2]),
      rotation: 0,
      animation: 'walk',
      activity: 'suitcase',
      role: 'traveler',
      palette: 5,
      phase: 2.3,
      path: Object.freeze({ axis: 'x', range: 2.0, speed: 0.22 }),
      lines: Object.freeze(['Mind your step.', 'It is busy today.']),
    }),
    Object.freeze({
      id: 'concourse-walker-east',
      zone: 'concourse',
      position: Object.freeze([12.8, 0.7, 1.5]),
      rotation: 0,
      animation: 'walk',
      activity: 'none',
      role: 'traveler',
      palette: 1,
      phase: 3.6,
      path: Object.freeze({ axis: 'z', range: 1.8, speed: 0.19 }),
      lines: Object.freeze(['Excuse me.', 'Services are on the right.']),
    }),
    Object.freeze({
      id: 'concourse-seated',
      zone: 'concourse',
      position: Object.freeze([18.8, 0, -0.9]),
      rotation: Math.PI,
      animation: 'seated',
      activity: 'laptop',
      role: 'traveler',
      palette: 2,
      phase: 4.5,
      lines: Object.freeze(['Just finishing an email.', 'My flight is delayed.']),
    }),
  ]),
});

export function selectAirportZoneActors(profile) {
  return Object.entries(AIRPORT_ZONE_ACTORS).flatMap(([zone, actors]) => (
    actors.slice(0, profile.zoneCounts[zone] ?? 0)
  ));
}

export function sampleActorPath(actor, samples = 9) {
  if (!actor.path) return [actor.position];
  return Array.from({ length: samples }, (_, index) => {
    const progress = samples === 1 ? 0 : (index / (samples - 1)) * 2 - 1;
    const point = [...actor.position];
    const axisIndex = actor.path.axis === 'x' ? 0 : 2;
    point[axisIndex] += progress * actor.path.range;
    return point;
  });
}
