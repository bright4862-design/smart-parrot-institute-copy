export const PICCADILLY_SHARED_SYSTEMS = Object.freeze({
  rendering: Object.freeze({
    owner: 'shared-engine',
    dependency: 'Heathrow rendering profiles and adaptive DPR runtime',
    requiredCapabilities: Object.freeze(['auto-profile', 'hd-profile', 'performance-profile', 'adaptive-dpr', 'renderer-fallback']),
  }),
  camera: Object.freeze({
    owner: 'shared-engine',
    dependency: 'Shared follow, conversation and contextual camera rig',
    requiredCapabilities: Object.freeze(['follow-camera', 'conversation-camera', 'contextual-focus', 'mobile-recentering']),
  }),
  npc: Object.freeze({
    owner: 'shared-engine',
    dependency: 'Shared NPC renderer, engagement, look-at and animation runtime',
    requiredCapabilities: Object.freeze(['featured-npc-rendering', 'instanced-crowd-rendering', 'turn-to-player', 'head-tracking', 'profile-aware-density']),
  }),
  interaction: Object.freeze({
    owner: 'shared-engine',
    dependency: 'Shared proximity, prompt and dialogue interaction runtime',
    requiredCapabilities: Object.freeze(['proximity-detection', 'touch-interaction', 'keyboard-interaction', 'dialogue-focus']),
  }),
  audio: Object.freeze({
    owner: 'shared-engine',
    dependency: 'Shared ambience, event cue and mobile audio-resume runtime',
    requiredCapabilities: Object.freeze(['ambient-zones', 'announcement-events', 'train-event-cues', 'visibility-resume', 'user-gesture-unlock']),
  }),
  mobilePerformance: Object.freeze({
    owner: 'shared-engine',
    dependency: 'Shared device detection and mobile performance controls',
    requiredCapabilities: Object.freeze(['ios-safe-area', 'android-viewport', 'orientation-recovery', 'context-loss-recovery', 'performance-crowd-budget']),
  }),
});

export const PICCADILLY_EXPERIENCE_FOCUS = Object.freeze([
  'ticket-machines-and-barriers',
  'passengers-reading-maps',
  'platform-waiting-behaviour',
  'train-boarding-and-door-reactions',
  'announcement-responses',
  'reduced-performance-mode-crowds',
]);

export const PICCADILLY_MOBILE_ACCEPTANCE = Object.freeze({
  ios: Object.freeze({
    status: 'pending-runtime-integration',
    viewports: Object.freeze(['iPhone portrait', 'iPhone landscape', 'iPad portrait', 'iPad landscape']),
    checks: Object.freeze([
      'safe-area-controls-visible',
      'touch-interaction-reliable',
      'audio-resumes-after-backgrounding',
      'camera-restores-after-orientation-change',
      'performance-profile-maintains-crowd-budget',
      'webgl-context-recovery',
    ]),
  }),
  android: Object.freeze({
    status: 'pending-runtime-integration',
    viewports: Object.freeze(['Android phone portrait', 'Android phone landscape', 'Android tablet']),
    checks: Object.freeze([
      'dynamic-viewport-controls-visible',
      'touch-interaction-reliable',
      'audio-resumes-after-backgrounding',
      'camera-restores-after-orientation-change',
      'performance-profile-maintains-crowd-budget',
      'webgl-context-recovery',
    ]),
  }),
});

export function getPiccadillyDependencySummary() {
  const systems = Object.entries(PICCADILLY_SHARED_SYSTEMS);
  return Object.freeze({
    total: systems.length,
    sharedOwned: systems.filter(([, system]) => system.owner === 'shared-engine').length,
    localRuntimeDuplicatesAllowed: 0,
    iosStatus: PICCADILLY_MOBILE_ACCEPTANCE.ios.status,
    androidStatus: PICCADILLY_MOBILE_ACCEPTANCE.android.status,
  });
}
