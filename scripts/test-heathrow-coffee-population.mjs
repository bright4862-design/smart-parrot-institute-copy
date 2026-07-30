import assert from 'node:assert/strict';
import {
  CAFE_SEATS,
  CAFE_TABLE_RADIUS,
  CAFE_TABLES,
  resolveCafePopulation,
} from '../src/game/heathrow/cafePopulation.js';
import { HEATHROW_COLLIDERS } from '../src/game/heathrow/collisionMap.js';

const performance = resolveCafePopulation('reduced');
const auto = resolveCafePopulation('balanced');
const hd = resolveCafePopulation('full');

assert.deepEqual(performance.workerRoles, ['barista', 'service']);
assert.equal(performance.travelerCount, 2);
assert.equal(performance.chatterVoices, 1);

assert.deepEqual(auto.workerRoles, ['barista', 'service']);
assert.equal(auto.travelerCount, 3);
assert.equal(auto.chatterVoices, 2);

assert.deepEqual(hd.workerRoles, ['barista', 'service', 'cashier']);
assert.equal(hd.travelerCount, 4);
assert.equal(hd.chatterVoices, 3);

const tables = new Map(CAFE_TABLES.map((table) => [table.id, table]));
CAFE_SEATS.forEach((seat) => {
  const table = tables.get(seat.tableId);
  assert.ok(table, `Seat ${seat.id} references a table`);
  const centerDistance = Math.hypot(
    seat.position[0] - table.position[0],
    seat.position[2] - table.position[2],
  );
  assert.ok(
    centerDistance - CAFE_TABLE_RADIUS >= 0.5,
    `Seat ${seat.id} keeps legs and props clear of the table edge`,
  );
});

const colliderIds = new Set(HEATHROW_COLLIDERS.map((collider) => collider.id));
assert.equal(colliderIds.has('cafe-seating-west'), true);
assert.equal(colliderIds.has('cafe-seating-east'), true);

console.log('Heathrow coffee population acceptance: profiles, furniture clearance, and collision passed');
