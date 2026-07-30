import assert from 'node:assert/strict';
import {
  AIRPORT_ZONE_ACTORS,
  resolveNPCPerformanceProfile,
  sampleActorPath,
  selectAirportZoneActors,
} from '../src/game/heathrow/npcSystem.js';
import { HEATHROW_COLLIDERS, isHeathrowPositionBlocked } from '../src/game/heathrow/collisionMap.js';

const reduced = resolveNPCPerformanceProfile('reduced', true);
const balanced = resolveNPCPerformanceProfile('balanced', false);
const full = resolveNPCPerformanceProfile('full', false);
const mobileHdFallback = resolveNPCPerformanceProfile('full', true);

assert.equal(reduced.animationComplexity, 'low');
assert.equal(balanced.animationComplexity, 'medium');
assert.equal(full.animationComplexity, 'high');
assert.equal(mobileHdFallback.id, 'balanced');

const reducedActors = selectAirportZoneActors(reduced);
const balancedActors = selectAirportZoneActors(balanced);
const fullActors = selectAirportZoneActors(full);
assert.ok(reducedActors.length < balancedActors.length);
assert.ok(balancedActors.length < fullActors.length);

const allActors = Object.values(AIRPORT_ZONE_ACTORS).flat();
assert.equal(new Set(allActors.map((actor) => actor.id)).size, allActors.length);
assert.deepEqual(new Set(allActors.map((actor) => actor.zone)), new Set(['checkin', 'security', 'gates', 'concourse']));
assert.ok(allActors.every((actor) => actor.lines?.length >= 1));
assert.ok(allActors.some((actor) => actor.animation === 'walk'));
assert.ok(allActors.some((actor) => actor.animation === 'work'));
assert.ok(allActors.some((actor) => actor.animation === 'seated'));

allActors.forEach((actor) => {
  if (actor.animation === 'seated') {
    const supportingSeat = HEATHROW_COLLIDERS.find((collider) => (
      collider.id.startsWith('bench-')
      && actor.position[0] >= collider.minX
      && actor.position[0] <= collider.maxX
      && actor.position[2] >= collider.minZ
      && actor.position[2] <= collider.maxZ
    ));
    assert.ok(supportingSeat, `${actor.id} is aligned to a real bench instead of floating or clipping`);
    return;
  }

  sampleActorPath(actor, 13).forEach(([x, , z]) => {
    assert.equal(
      isHeathrowPositionBlocked(x, z, { radius: 0.35 }),
      false,
      `${actor.id} path stays clear of airport colliders at ${x.toFixed(2)},${z.toFixed(2)}`,
    );
  });
});

for (let left = 0; left < allActors.length; left += 1) {
  for (let right = left + 1; right < allActors.length; right += 1) {
    const a = allActors[left];
    const b = allActors[right];
    const spacing = Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]);
    assert.ok(spacing >= 1.35, `${a.id} and ${b.id} maintain safe spacing`);
  }
}

console.log('Heathrow shared NPC system acceptance: density, zones, reactions, paths, and spacing passed');
