import * as THREE from 'three';
import * as POSTPROCESSING from 'postprocessing';

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

export default sink;