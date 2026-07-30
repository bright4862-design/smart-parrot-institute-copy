import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const playable = read('src/game/heathrow/HeathrowPlayableSpine.jsx');
const sections = read('src/game/heathrow/AirportSections.jsx');
const cafe = read('src/game/heathrow/CanonicalCafe.jsx');

assert.match(playable, /import AirportSections from '.\/AirportSections';/);
assert.equal((playable.match(/<AirportSections\b/g) ?? []).length, 1, 'Playable Heathrow renders one shared airport-section layer');

assert.match(sections, /name="heathrow-baggage-claim-section"/);
assert.match(sections, /BAGGAGE RECLAIM/);
assert.match(sections, /ARRIVALS · CAROUSEL 5/);
assert.match(sections, /name="heathrow-underground-section"/);
assert.match(sections, /LONDON TRANSPORT/);
assert.match(sections, /UNDERGROUND · CENTRAL LONDON/);
assert.match(sections, /decorationDensity === 'reduced'/, 'Performance mode explicitly reduces section detail');
assert.match(sections, /!reduced && \(/, 'Decorative lights and props are gated outside Performance mode');

const flippedCafeText = cafe.match(/rotation=\{\[0, Math\.PI, 0\]\}/g) ?? [];
assert.ok(flippedCafeText.length >= 4, 'Canonical café title and menu text face the player instead of rendering mirrored');

console.log('Heathrow airport sections acceptance: baggage claim, Underground zoning, Performance scaling, and café sign orientation passed');
