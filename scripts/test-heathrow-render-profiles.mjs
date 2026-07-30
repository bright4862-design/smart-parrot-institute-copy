import assert from 'node:assert/strict';
import {
  RENDER_PROFILE_MODES,
  resolveRenderProfile,
} from '../src/game/heathrow/renderProfiles.js';

const strongPhone = Object.freeze({
  mobile: true,
  strong: true,
  constrained: false,
  deviceDpr: 3,
});
const olderPhone = Object.freeze({
  mobile: true,
  strong: false,
  constrained: true,
  deviceDpr: 2,
});
const strongLaptop = Object.freeze({
  mobile: false,
  strong: true,
  constrained: false,
  deviceDpr: 2.5,
});

const auto = resolveRenderProfile(RENDER_PROFILE_MODES.AUTO, strongPhone);
assert.equal(auto.initialDpr, 1.5);
assert.equal(auto.maxDpr, 1.9);
assert.equal(auto.dynamic, true);

const hdMobile = resolveRenderProfile(RENDER_PROFILE_MODES.HD, strongPhone);
assert.equal(hdMobile.maxDpr, 2);
assert.equal(hdMobile.precision, 'highp');
assert.equal(hdMobile.antialias, true);
assert.equal(hdMobile.smaa, true);

const hdDesktop = resolveRenderProfile(RENDER_PROFILE_MODES.HD, strongLaptop);
assert.equal(hdDesktop.maxDpr, 2.25);
assert.equal(hdDesktop.shadows, true);
assert.equal(hdDesktop.decorationDensity, 'full');

const performance = resolveRenderProfile(RENDER_PROFILE_MODES.PERFORMANCE, olderPhone);
assert.equal(performance.minDpr, 1.25);
assert.equal(performance.bloom, false);
assert.equal(performance.smaa, false);
assert.equal(performance.environment, false);
assert.equal(performance.decorationDensity, 'reduced');
assert.equal(performance.lighting, 'simplified');

const constrainedHd = resolveRenderProfile(RENDER_PROFILE_MODES.HD, olderPhone);
assert.equal(constrainedHd.minDpr, 1.25);
assert.equal(constrainedHd.precision, 'mediump');
assert.equal(constrainedHd.decorationDensity, 'balanced');

console.log('Render profile acceptance: 5/5 passed');
