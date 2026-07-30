import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/game/heathrow/CanonicalCafe.jsx', import.meta.url), 'utf8');

assert.equal((source.match(/TERMINAL CAFÉ/g) ?? []).length, 1, 'TERMINAL CAFÉ must have exactly one text mesh');
assert.equal((source.match(/label="COFFEE"/g) ?? []).length, 1, 'COFFEE menu board must exist exactly once');
assert.equal((source.match(/label="FOOD"/g) ?? []).length, 1, 'FOOD menu board must exist exactly once');

assert.match(source, /import \* as THREE from 'three';/);
assert.match(source, /position=\{\[0, 0\.12, -0\.095\]\} rotation=\{\[0, Math\.PI, 0\]\} material-side=\{THREE\.FrontSide\}/);
assert.match(source, /position=\{\[0, -0\.3, -0\.095\]\} rotation=\{\[0, Math\.PI, 0\]\} material-side=\{THREE\.FrontSide\}/);

const menuFrontFaces = source.match(/position=\{\[0, (?:0\.18|-0\.2), -0\.07\]\} rotation=\{\[0, Math\.PI, 0\]\} material-side=\{THREE\.FrontSide\}/g) ?? [];
assert.equal(menuFrontFaces.length, 2, 'Menu labels and subtitles must render only on the public-facing side');

assert.doesNotMatch(source, /position=\{\[0, (?:0\.18|-0\.2), 0\.07\]\} rotation=\{\[0, Math\.PI, 0\]\}/);
assert.doesNotMatch(source, /position=\{\[0, (?:0\.12|-0\.3), 0\.095\]\} rotation=\{\[0, Math\.PI, 0\]\}/);

console.log('Heathrow café signage acceptance: TERMINAL CAFÉ, COFFEE, FOOD, and all menu text are single-mesh, public-facing, and front-side-only');
