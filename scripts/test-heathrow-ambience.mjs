import assert from 'node:assert/strict';
import { resolveHeathrowAudioProfile } from '../src/game/heathrow/heathrowAudioProfile.js';

const performance = resolveHeathrowAudioProfile({ id: 'performance', decorationDensity: 'reduced' });
const auto = resolveHeathrowAudioProfile({ id: 'auto', decorationDensity: 'balanced' });
const hd = resolveHeathrowAudioProfile({ id: 'hd', decorationDensity: 'full' });

assert.equal(performance.performanceMode, true);
assert.equal(performance.cafeVoiceCount, 1);
assert.equal(performance.airportChimes, false);
assert.ok(performance.chatterGain < auto.chatterGain);

assert.equal(auto.performanceMode, false);
assert.equal(auto.cafeVoiceCount, 2);
assert.equal(auto.airportChimes, true);

assert.equal(hd.performanceMode, false);
assert.equal(hd.cafeVoiceCount, 3);
assert.equal(hd.airportChimes, true);

console.log('Heathrow ambience acceptance: airport/café layers and profile scaling passed');
