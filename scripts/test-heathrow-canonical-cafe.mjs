import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  HEATHROW_COLLIDERS,
  isHeathrowPositionBlocked,
} from '../src/game/heathrow/collisionMap.js';
import { resolveCafePopulation } from '../src/game/heathrow/cafePopulation.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const playable = read('src/game/heathrow/HeathrowPlayableSpine.jsx');
const expansion = read('src/game/heathrow/TerminalExpansion.jsx');
const canonicalCafe = read('src/game/heathrow/CanonicalCafe.jsx');
const greybox = read('src/game/heathrow/HeathrowGreybox.jsx');
const airportLife = read('src/game/heathrow/AirportLife.jsx');

assert.equal((expansion.match(/<CanonicalCafe\b/g) ?? []).length, 1, 'Terminal expansion renders exactly one canonical café');
assert.match(canonicalCafe, /CANONICAL_CAFE_ID = 'heathrow-terminal-cafe'/);
assert.match(canonicalCafe, /TERMINAL CAFÉ/);
assert.match(canonicalCafe, /COFFEE · TEA · PASTRIES/);
assert.doesNotMatch(playable, />COFFEE<\/Text>/, 'Arrivals placeholder is no longer labelled as coffee');
assert.doesNotMatch(greybox, />COFFEE<\/Text>/, 'Greybox cannot reintroduce a duplicate café');
assert.match(playable, /ARRIVALS HELP/);
assert.doesNotMatch(expansion, /args=\{\[13, 3\.2, 1\.7\]\}/, 'Oversized placeholder services counter is removed');
assert.match(canonicalCafe, /args=\{\[10\.8, 1\.08, 1\.25\]\}/, 'Canonical café uses a believable service-counter scale');

const colliderIds = new Set(HEATHROW_COLLIDERS.map((collider) => collider.id));
assert.equal(colliderIds.has('canonical-cafe-counter'), true);
assert.equal(colliderIds.has('arrivals-help-kiosk'), true);
assert.equal(colliderIds.has('coffee-counter'), false);
assert.equal(colliderIds.has('services-counter'), false);
assert.equal(colliderIds.has('bench-services'), false, 'Former café staff-lane bench is removed');

assert.equal(isHeathrowPositionBlocked(22, 8, { radius: 0.2 }), true, 'Player cannot walk through the canonical counter');
assert.equal(isHeathrowPositionBlocked(22, 9.3, { radius: 0.2 }), false, 'Staff lane behind the canonical counter remains clear');
assert.equal(isHeathrowPositionBlocked(12, -7, { radius: 0.2 }), true, 'Repurposed arrivals-help kiosk has collision');

const performance = resolveCafePopulation('reduced');
const auto = resolveCafePopulation('balanced');
const hd = resolveCafePopulation('full');
assert.equal(performance.travelerCount, 2);
assert.equal(auto.travelerCount, 3);
assert.equal(hd.travelerCount, 4);
assert.equal(performance.workerRoles.length, 2);
assert.equal(hd.workerRoles.length, 3);
assert.match(airportLife, /activity: 'coffee'/, 'Barista has a dedicated coffee-working prop');
assert.match(airportLife, /activity: 'tray'/, 'Service employee retains the tray/restocking loop');

assert.match(playable, /data-testid="heathrow-ready"/);
assert.match(playable, /data-heathrow-ready=\{rendererFailure \? 'false' : 'true'\}/);
assert.match(playable, /data-testid="heathrow-touch-controls"/);
assert.match(playable, /data-testid="heathrow-interact"/);

console.log('Heathrow canonical café acceptance: single café, repurposed duplicate, geometry, staging, collision, performance scaling, and readiness selector passed');
