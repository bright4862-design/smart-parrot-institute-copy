import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const playable = read('src/game/heathrow/HeathrowPlayableSpine.jsx');
const sections = read('src/game/heathrow/AirportSections.jsx');
const expansion = read('src/game/heathrow/TerminalExpansion.jsx');
const signs = read('src/game/heathrow/AirportSigns.jsx');
const collision = read('src/game/heathrow/collisionMap.js');
const cafe = read('src/game/heathrow/CanonicalCafe.jsx');

assert.match(playable, /import AirportSections from '.\/AirportSections';/);
assert.equal((playable.match(/<AirportSections\b/g) ?? []).length, 1, 'Playable Heathrow renders one shared airport-section layer');

assert.match(playable, /boxGeometry args=\{\[76, 0\.2, 66\]\}/, 'Terminal floor is expanded beyond the former 68×48 footprint');
assert.match(playable, /const UNDERGROUND = Object\.freeze\(\{ x: 0, z: 36\.2 \}\)/, 'Underground is moved to the far transport end');
assert.match(expansion, /position: Object\.freeze\(\{ x: 0, z: 25\.5 \}\)/, 'Ticket machines are separated from the central concourse');
assert.match(collision, /maxZ: 44/, 'World navigation bounds include the enlarged terminal');

assert.match(sections, /name="heathrow-baggage-claim-section"/);
assert.match(sections, /name="heathrow-baggage-passage"/);
assert.match(sections, /name="heathrow-underground-section"/);
assert.match(sections, /name="heathrow-underground-tunnel"/);
assert.match(sections, /decorationDensity === 'reduced'/, 'Performance mode explicitly reduces section detail');
assert.match(sections, /!reduced && \(/, 'Decorative lights and props are gated outside Performance mode');

assert.doesNotMatch(sections, /BAGGAGE RECLAIM|LONDON TRANSPORT|UNDERGROUND · CENTRAL LONDON/, 'Architectural sections do not duplicate mission signage');
assert.doesNotMatch(expansion, /TRAINS · UNDERGROUND/, 'Central concourse does not render a duplicate Underground header');
assert.equal((signs.match(/label: 'BAGGAGE RECLAIM'/g) ?? []).length, 1, 'Exactly one interactive Baggage Reclaim sign remains');

const flippedCafeText = cafe.match(/rotation=\{\[0, Math\.PI, 0\]\}/g) ?? [];
assert.ok(flippedCafeText.length >= 4, 'Canonical café title and menu text face the player instead of rendering mirrored');

console.log('Heathrow terminal expansion acceptance: enlarged footprint, separated passages, unique signs, Performance scaling, and café orientation passed');
