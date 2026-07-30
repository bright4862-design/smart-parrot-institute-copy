import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveHeathrowAudioProfile } from './heathrowAudioProfile';

const STORAGE_KEY = 'smart-parrot:heathrow-ambience-muted:v1';
const CAFE_POSITION = Object.freeze({ x: 22, z: 8.4 });
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function readMutedPreference() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeMutedPreference(muted) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(muted));
  } catch {
    // Embedded previews and private browsing can block storage.
  }
}

function createNoiseBuffer(context, seconds = 3) {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let index = 0; index < length; index += 1) {
    const white = Math.random() * 2 - 1;
    last = (last * 0.985) + (white * 0.015);
    data[index] = last * 3.1;
  }
  return buffer;
}

function createLoopingNoise(context, destination, { gain = 0.03, highpass = 0, lowpass = 1600 } = {}) {
  const source = context.createBufferSource();
  source.buffer = createNoiseBuffer(context);
  source.loop = true;
  const high = context.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = highpass;
  const low = context.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = lowpass;
  const level = context.createGain();
  level.gain.value = gain;
  source.connect(high).connect(low).connect(level).connect(destination);
  source.start();
  return { source, level, high, low };
}

function createCafeChatter(context, destination, voiceCount = 2) {
  const output = context.createGain();
  output.gain.value = 0;
  output.connect(destination);

  const voices = Array.from({ length: Math.max(1, voiceCount) }, (_, index) => {
    const source = context.createBufferSource();
    source.buffer = createNoiseBuffer(context, 2.4 + index * 0.35);
    source.loop = true;

    const speechBand = context.createBiquadFilter();
    speechBand.type = 'bandpass';
    speechBand.frequency.value = 520 + index * 260;
    speechBand.Q.value = 0.72 + index * 0.08;

    const presence = context.createBiquadFilter();
    presence.type = 'lowpass';
    presence.frequency.value = 2100 + index * 260;

    const voiceLevel = context.createGain();
    voiceLevel.gain.value = 0.0048 + index * 0.0006;

    const cadence = context.createOscillator();
    cadence.type = 'sine';
    cadence.frequency.value = 0.42 + index * 0.17;
    const cadenceDepth = context.createGain();
    cadenceDepth.gain.value = 0.0024;

    cadence.connect(cadenceDepth).connect(voiceLevel.gain);
    source.connect(speechBand).connect(presence).connect(voiceLevel).connect(output);
    source.start(context.currentTime + index * 0.04);
    cadence.start(context.currentTime + index * 0.06);

    return { source, cadence };
  });

  return {
    output,
    destroy() {
      voices.forEach(({ source, cadence }) => {
        try { source.stop(); } catch { /* already stopped */ }
        try { cadence.stop(); } catch { /* already stopped */ }
      });
    },
  };
}

function createAmbienceEngine({ performanceMode = false, cafeVoiceCount = 2 } = {}) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;

  const context = new AudioContext({ latencyHint: 'playback' });
  const master = context.createGain();
  master.gain.value = 0;
  master.connect(context.destination);

  const terminal = createLoopingNoise(context, master, {
    gain: performanceMode ? 0.022 : 0.034,
    highpass: 90,
    lowpass: performanceMode ? 720 : 1250,
  });
  const ventilation = createLoopingNoise(context, master, {
    gain: performanceMode ? 0.012 : 0.018,
    highpass: 35,
    lowpass: 220,
  });
  const cafe = createLoopingNoise(context, master, {
    gain: 0,
    highpass: performanceMode ? 620 : 520,
    lowpass: performanceMode ? 2200 : 3200,
  });
  const chatter = createCafeChatter(context, master, performanceMode ? 1 : cafeVoiceCount);

  const hum = context.createOscillator();
  hum.type = 'sine';
  hum.frequency.value = 58;
  const humGain = context.createGain();
  humGain.gain.value = performanceMode ? 0.004 : 0.006;
  hum.connect(humGain).connect(master);
  hum.start();

  let destroyed = false;
  let cafeProximity = 0;
  let chimeTimer = 0;
  let cafeTimer = 0;

  const playTone = (frequency, start, duration, volume) => {
    if (destroyed || context.state === 'closed') return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  };

  const scheduleChime = () => {
    if (destroyed || performanceMode) return;
    const delay = 18000 + Math.random() * 16000;
    chimeTimer = window.setTimeout(() => {
      if (context.state === 'running') {
        const now = context.currentTime + 0.05;
        playTone(659.25, now, 0.72, 0.018);
        playTone(783.99, now + 0.18, 0.78, 0.016);
        playTone(987.77, now + 0.38, 0.9, 0.014);
      }
      scheduleChime();
    }, delay);
  };

  const scheduleCafeClink = () => {
    if (destroyed || performanceMode) return;
    const delay = 5200 + Math.random() * 7200;
    cafeTimer = window.setTimeout(() => {
      if (context.state === 'running' && cafeProximity > 0.18) {
        const now = context.currentTime + 0.03;
        playTone(1760 + Math.random() * 260, now, 0.16, 0.006 * cafeProximity);
        playTone(2380 + Math.random() * 340, now + 0.045, 0.12, 0.0045 * cafeProximity);
      }
      scheduleCafeClink();
    }, delay);
  };

  scheduleChime();
  scheduleCafeClink();

  return {
    context,
    async resume() {
      if (destroyed) return;
      if (context.state === 'suspended') await context.resume();
    },
    setMuted(muted) {
      if (destroyed) return;
      const target = muted ? 0 : (performanceMode ? 0.52 : 0.72);
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setTargetAtTime(target, context.currentTime, 0.16);
    },
    setCafeProximity(value) {
      cafeProximity = clamp(value, 0, 1);
      cafe.level.gain.setTargetAtTime((performanceMode ? 0.008 : 0.018) * cafeProximity, context.currentTime, 0.28);
      cafe.low.frequency.setTargetAtTime(1500 + cafeProximity * 1800, context.currentTime, 0.3);
      chatter.output.gain.setTargetAtTime((performanceMode ? 0.32 : 0.58) * cafeProximity, context.currentTime, 0.34);
    },
    async suspend() {
      if (!destroyed && context.state === 'running') await context.suspend();
    },
    destroy() {
      destroyed = true;
      window.clearTimeout(chimeTimer);
      window.clearTimeout(cafeTimer);
      terminal.source.stop();
      ventilation.source.stop();
      cafe.source.stop();
      chatter.destroy();
      hum.stop();
      context.close().catch(() => {});
    },
  };
}

export default function useHeathrowAmbience({ playerPosition, renderSettings }) {
  const [muted, setMuted] = useState(readMutedPreference);
  const [started, setStarted] = useState(false);
  const [supported] = useState(() => (
    typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext)
  ));
  const engineRef = useRef(null);
  const audioProfile = resolveHeathrowAudioProfile(renderSettings);
  const performanceMode = audioProfile.performanceMode;
  const cafeVoiceCount = audioProfile.cafeVoiceCount;

  const ensureStarted = useCallback(async () => {
    if (!supported) return;
    if (!engineRef.current) {
      engineRef.current = createAmbienceEngine({ performanceMode, cafeVoiceCount });
    }
    await engineRef.current?.resume();
    engineRef.current?.setMuted(muted);
    setStarted(Boolean(engineRef.current));
  }, [cafeVoiceCount, muted, performanceMode, supported]);

  useEffect(() => {
    if (!supported || muted || started) return undefined;
    const unlock = () => {
      ensureStarted().catch(() => {});
    };
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('touchstart', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [ensureStarted, muted, started, supported]);

  useEffect(() => {
    if (!engineRef.current) return;
    engineRef.current.destroy();
    engineRef.current = null;
    setStarted(false);
    if (!muted) ensureStarted().catch(() => {});
  }, [cafeVoiceCount, performanceMode]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !playerPosition) return;
    const distance = Math.hypot(playerPosition.x - CAFE_POSITION.x, playerPosition.z - CAFE_POSITION.z);
    engine.setCafeProximity(1 - (distance / 14));
  }, [playerPosition]);

  useEffect(() => {
    engineRef.current?.setMuted(muted);
    writeMutedPreference(muted);
  }, [muted]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) engineRef.current?.suspend().catch(() => {});
      else if (!muted) engineRef.current?.resume().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [muted]);

  useEffect(() => () => {
    engineRef.current?.destroy();
    engineRef.current = null;
  }, []);

  const toggleMuted = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      if (!next) ensureStarted().catch(() => {});
      return next;
    });
  }, [ensureStarted]);

  return { muted, started, supported, toggleMuted };
}
