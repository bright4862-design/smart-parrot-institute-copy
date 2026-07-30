export const RENDER_PROFILE_MODES = Object.freeze({
  AUTO: 'auto',
  HD: 'hd',
  PERFORMANCE: 'performance',
});

export const RENDER_PROFILE_STORAGE_KEY = 'smart-parrot:heathrow-render-profile:v1';

export const RENDER_PROFILE_LABELS = Object.freeze({
  [RENDER_PROFILE_MODES.AUTO]: 'Auto',
  [RENDER_PROFILE_MODES.HD]: 'HD',
  [RENDER_PROFILE_MODES.PERFORMANCE]: 'Performance',
});

export const RENDER_PROFILE_OPTIONS = Object.freeze([
  Object.freeze({ id: RENDER_PROFILE_MODES.AUTO, label: 'Auto', description: 'Balances clarity and frame rate for this device.' }),
  Object.freeze({ id: RENDER_PROFILE_MODES.HD, label: 'HD', description: 'Sharper edges, signs, characters, and lighting.' }),
  Object.freeze({ id: RENDER_PROFILE_MODES.PERFORMANCE, label: 'Performance', description: 'Prioritises smooth play and battery life.' }),
]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finiteOr = (value, fallback) => (Number.isFinite(value) ? value : fallback);

export function readRenderCapabilities(source = {}) {
  const windowLike = source.windowLike ?? (typeof window !== 'undefined' ? window : null);
  const navigatorLike = source.navigatorLike ?? (typeof navigator !== 'undefined' ? navigator : null);
  const userAgent = navigatorLike?.userAgent || '';
  const ipadDesktopMode = navigatorLike?.platform === 'MacIntel' && navigatorLike?.maxTouchPoints > 1;
  const ios = /iPhone|iPad|iPod/i.test(userAgent) || ipadDesktopMode;
  const android = /Android/i.test(userAgent);
  const compactViewport = windowLike
    ? Math.min(finiteOr(windowLike.innerWidth, 1280), finiteOr(windowLike.innerHeight, 720)) < 900
    : false;
  const coarsePointer = windowLike?.matchMedia?.('(pointer: coarse)').matches ?? false;
  const mobile = ios || android || (coarsePointer && compactViewport);
  const deviceMemory = finiteOr(navigatorLike?.deviceMemory, 4);
  const hardwareConcurrency = finiteOr(navigatorLike?.hardwareConcurrency, 4);
  const deviceDpr = clamp(finiteOr(windowLike?.devicePixelRatio, 1), 1, 3);
  const saveData = Boolean(navigatorLike?.connection?.saveData);
  const reducedMotion = windowLike?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let embeddedPreview = false;
  try {
    embeddedPreview = Boolean(windowLike && windowLike.top !== windowLike.self);
  } catch {
    embeddedPreview = true;
  }
  const constrained = saveData || deviceMemory <= 3 || hardwareConcurrency <= 3;
  const strong = !constrained
    && deviceMemory >= 6
    && hardwareConcurrency >= 6
    && deviceDpr >= 1.75;

  return Object.freeze({
    mobile,
    ios,
    android,
    compactViewport,
    coarsePointer,
    deviceMemory,
    hardwareConcurrency,
    deviceDpr,
    saveData,
    reducedMotion,
    embeddedPreview,
    constrained,
    strong,
  });
}

export function resolveRenderProfile(mode = RENDER_PROFILE_MODES.AUTO, capabilities = readRenderCapabilities()) {
  const requestedMode = Object.values(RENDER_PROFILE_MODES).includes(mode)
    ? mode
    : RENDER_PROFILE_MODES.AUTO;
  const mobile = Boolean(capabilities.mobile);
  const strong = Boolean(capabilities.strong);
  const constrained = Boolean(capabilities.constrained);
  const deviceDpr = clamp(finiteOr(capabilities.deviceDpr, 1), 1, 3);

  if (requestedMode === RENDER_PROFILE_MODES.PERFORMANCE) {
    const maxDpr = Math.min(deviceDpr, mobile ? 1.4 : 1.6);
    return Object.freeze({
      id: requestedMode,
      label: RENDER_PROFILE_LABELS[requestedMode],
      dynamic: true,
      minDpr: Math.min(maxDpr, 1.25),
      initialDpr: Math.min(maxDpr, mobile ? 1.25 : 1.35),
      maxDpr,
      precision: 'mediump',
      antialias: false,
      smaa: false,
      bloom: false,
      shadows: false,
      environment: false,
      decorationDensity: 'reduced',
      lighting: 'simplified',
      performanceBias: 'speed',
      sampleSeconds: 2.25,
      lowFps: mobile ? 34 : 42,
      highFps: mobile ? 48 : 54,
      dprStepDown: 0.15,
      dprStepUp: 0.08,
    });
  }

  if (requestedMode === RENDER_PROFILE_MODES.HD) {
    const capableForHd = !constrained && (strong || !mobile || deviceDpr >= 2);
    const maxDpr = Math.min(deviceDpr, mobile ? 2 : 2.25);
    const initialTarget = mobile ? 1.75 : 1.85;
    return Object.freeze({
      id: requestedMode,
      label: RENDER_PROFILE_LABELS[requestedMode],
      dynamic: true,
      minDpr: Math.min(maxDpr, constrained ? 1.25 : 1.5),
      initialDpr: Math.min(maxDpr, constrained ? 1.4 : initialTarget),
      maxDpr,
      precision: capableForHd ? 'highp' : 'mediump',
      antialias: capableForHd,
      smaa: true,
      bloom: !mobile || strong,
      shadows: !mobile || strong,
      environment: !mobile || strong,
      decorationDensity: constrained ? 'balanced' : 'full',
      lighting: capableForHd ? 'cinematic' : 'balanced',
      performanceBias: 'quality',
      sampleSeconds: 2.75,
      lowFps: mobile ? 44 : 50,
      highFps: mobile ? 57 : 59,
      dprStepDown: 0.12,
      dprStepUp: 0.08,
    });
  }

  const autoMax = mobile
    ? (strong ? 1.9 : constrained ? 1.5 : 1.75)
    : (strong ? 2.1 : 2);
  const maxDpr = Math.min(deviceDpr, autoMax);
  const minTarget = constrained ? 1.25 : mobile ? 1.4 : 1.15;
  const initialTarget = constrained ? 1.3 : 1.5;

  return Object.freeze({
    id: RENDER_PROFILE_MODES.AUTO,
    label: RENDER_PROFILE_LABELS[RENDER_PROFILE_MODES.AUTO],
    dynamic: true,
    minDpr: Math.min(maxDpr, minTarget),
    initialDpr: Math.min(maxDpr, initialTarget),
    maxDpr,
    precision: strong || !mobile ? 'highp' : 'mediump',
    antialias: !mobile || strong,
    smaa: strong,
    bloom: !mobile,
    shadows: !mobile,
    environment: !mobile,
    decorationDensity: constrained ? 'reduced' : 'balanced',
    lighting: constrained ? 'simplified' : 'balanced',
    performanceBias: 'balanced',
    sampleSeconds: 2.5,
    lowFps: mobile ? 42 : 50,
    highFps: mobile ? 55 : 58,
    dprStepDown: 0.15,
    dprStepUp: 0.1,
  });
}

export function loadRenderProfilePreference(storage = typeof window !== 'undefined' ? window.localStorage : null) {
  try {
    const saved = storage?.getItem(RENDER_PROFILE_STORAGE_KEY);
    return Object.values(RENDER_PROFILE_MODES).includes(saved)
      ? saved
      : RENDER_PROFILE_MODES.AUTO;
  } catch {
    return RENDER_PROFILE_MODES.AUTO;
  }
}

export function saveRenderProfilePreference(mode, storage = typeof window !== 'undefined' ? window.localStorage : null) {
  const nextMode = Object.values(RENDER_PROFILE_MODES).includes(mode)
    ? mode
    : RENDER_PROFILE_MODES.AUTO;
  try {
    storage?.setItem(RENDER_PROFILE_STORAGE_KEY, nextMode);
  } catch {
    // Storage can be unavailable in private browsing or embedded previews.
  }
  return nextMode;
}
