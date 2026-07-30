import * as THREE from 'three';

// The preview injects dashed attributes (data-source-location, data-dynamic-content)
// into every JSX element. react-three-fiber resolves dashed prop names as nested
// property paths, so `data-source-location` becomes instance.data.source.location and
// crashes because `data` does not exist on three.js objects.
// Exposing a harmless sink object as `data` makes those writes no-ops.
const sink = new Proxy(
  {},
  {
    get: (_target, key) => (key === 'set' ? undefined : sink),
    set: () => true,
    has: () => true,
  },
);

const TARGETS = [
  THREE.Object3D,
  THREE.Material,
  THREE.BufferGeometry,
  THREE.Color,
  THREE.Fog,
  THREE.FogExp2,
  THREE.Texture,
];

TARGETS.forEach((Ctor) => {
  if (!Ctor || Object.prototype.hasOwnProperty.call(Ctor.prototype, 'data')) return;
  Object.defineProperty(Ctor.prototype, 'data', {
    configurable: true,
    get: () => sink,
    set: () => {},
  });
});

// Keep the adaptive renderer sharp enough to read signs and character silhouettes.
// Heathrow can still lower DPR when performance drops, but normal phones no longer
// fall to a visibly soft presentation. Constrained devices retain the safer 1.25 floor.
const PIXEL_RATIO_PATCH = Symbol.for('smart-parrot:adaptive-pixel-ratio-floor');
const rendererPrototype = THREE.WebGLRenderer?.prototype;

if (rendererPrototype && !rendererPrototype[PIXEL_RATIO_PATCH]) {
  const originalSetPixelRatio = rendererPrototype.setPixelRatio;

  const readPixelRatioFloor = () => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return 1;

    const compactViewport = Math.min(window.innerWidth, window.innerHeight) < 900;
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const saveData = Boolean(connection?.saveData);
    const memory = Number(navigator.deviceMemory || 4);
    const cores = Number(navigator.hardwareConcurrency || 6);
    const constrainedDevice = saveData || memory <= 2 || cores <= 4;

    if (!compactViewport) return 1.25;
    if (constrainedDevice) return 1.25;

    const deviceDpr = Number(window.devicePixelRatio || 1);
    return deviceDpr >= 2.5 ? 1.5 : 1.4;
  };

  rendererPrototype.setPixelRatio = function setSmartParrotPixelRatio(value) {
    const requestedRatio = Number.isFinite(Number(value)) ? Number(value) : 1;
    return originalSetPixelRatio.call(this, Math.max(requestedRatio, readPixelRatioFloor()));
  };

  Object.defineProperty(rendererPrototype, PIXEL_RATIO_PATCH, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });
}

export default sink;
