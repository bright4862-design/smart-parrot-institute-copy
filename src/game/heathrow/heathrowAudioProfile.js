import { resolveCafePopulation } from './cafePopulation.js';

export function resolveHeathrowAudioProfile(renderSettings = {}) {
  const decorationDensity = renderSettings.decorationDensity ?? 'balanced';
  const cafeProfile = resolveCafePopulation(decorationDensity);
  const performanceMode = renderSettings.id === 'performance' || decorationDensity === 'reduced';

  return Object.freeze({
    id: performanceMode ? 'performance' : decorationDensity === 'full' ? 'hd' : 'auto',
    performanceMode,
    cafeVoiceCount: performanceMode ? 1 : cafeProfile.chatterVoices,
    masterGain: performanceMode ? 0.52 : 0.72,
    cafeGain: performanceMode ? 0.008 : 0.018,
    chatterGain: performanceMode ? 0.32 : 0.58,
    airportChimes: !performanceMode,
  });
}
