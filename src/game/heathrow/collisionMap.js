export const HEATHROW_PLAYER_RADIUS = 0.62;

export const HEATHROW_WORLD_BOUNDS = Object.freeze({
  minX: -31,
  maxX: 31,
  minZ: -21,
  maxZ: 23,
});

const rectangle = (id, minX, maxX, minZ, maxZ, desktopOnly = false) => Object.freeze({
  id,
  minX,
  maxX,
  minZ,
  maxZ,
  desktopOnly,
});

export const HEATHROW_COLLIDERS = Object.freeze([
  rectangle('baggage-claim', -16, -5, -9.6, -6.4),
  rectangle('coffee-counter', 8.4, 15.6, -8.1, -5.9),
  rectangle('gate-barrier', -28.5, -15.5, 7.55, 8.45),
  rectangle('services-counter', 15.5, 28.5, 7.15, 8.85),
  rectangle('ticket-machine-island', -4.3, 4.3, 8.1, 12.9),

  rectangle('left-glass-divider', -11.11, -10.89, -3, 13, true),
  rectangle('right-glass-divider', 10.89, 11.11, -3, 13, true),

  rectangle('bench-arrivals-west', -26.9, -23.1, -2.525, -1.475),
  rectangle('bench-arrivals-midwest', -20.9, -17.1, -2.525, -1.475),
  rectangle('bench-arrivals-east', 17.1, 20.9, -1.525, -0.475),
  rectangle('bench-arrivals-far-east', 23.1, 26.9, -1.525, -0.475),
  rectangle('bench-gates', -25.9, -22.1, 9.475, 10.525, true),
  rectangle('bench-services', 22.1, 25.9, 9.475, 10.525, true),

  rectangle('planter-gates', -29.92, -28.08, 6.08, 7.92),
  rectangle('planter-midwest', -15.92, -14.08, 8.08, 9.92, true),
  rectangle('planter-services', 14.08, 15.92, 8.08, 9.92),
  rectangle('planter-far-east', 28.08, 29.92, 6.08, 7.92, true),
  rectangle('underground-sign-post', -2.32, -2.08, 17.08, 17.32),
]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function findBlockingCollider(x, z, { mobileRenderer, radius }) {
  return HEATHROW_COLLIDERS.find((collider) => (
    (!collider.desktopOnly || !mobileRenderer)
    && x > collider.minX - radius
    && x < collider.maxX + radius
    && z > collider.minZ - radius
    && z < collider.maxZ + radius
  ));
}

export function isHeathrowPositionBlocked(
  x,
  z,
  { mobileRenderer = false, radius = HEATHROW_PLAYER_RADIUS } = {},
) {
  return Boolean(findBlockingCollider(x, z, { mobileRenderer, radius }));
}

function depenetrateHeathrowPosition(x, z, options) {
  let resolvedX = x;
  let resolvedZ = z;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const collider = findBlockingCollider(resolvedX, resolvedZ, options);
    if (!collider) break;

    const minX = collider.minX - options.radius;
    const maxX = collider.maxX + options.radius;
    const minZ = collider.minZ - options.radius;
    const maxZ = collider.maxZ + options.radius;
    const pushes = [
      { axis: 'x', value: minX - 0.001, distance: Math.abs(resolvedX - minX) },
      { axis: 'x', value: maxX + 0.001, distance: Math.abs(maxX - resolvedX) },
      { axis: 'z', value: minZ - 0.001, distance: Math.abs(resolvedZ - minZ) },
      { axis: 'z', value: maxZ + 0.001, distance: Math.abs(maxZ - resolvedZ) },
    ].sort((a, b) => a.distance - b.distance);

    const smallestPush = pushes[0];
    if (smallestPush.axis === 'x') {
      resolvedX = smallestPush.value;
    } else {
      resolvedZ = smallestPush.value;
    }
  }

  return {
    x: clamp(resolvedX, HEATHROW_WORLD_BOUNDS.minX, HEATHROW_WORLD_BOUNDS.maxX),
    z: clamp(resolvedZ, HEATHROW_WORLD_BOUNDS.minZ, HEATHROW_WORLD_BOUNDS.maxZ),
  };
}

export function resolveHeathrowMovement(
  current,
  requested,
  { mobileRenderer = false, radius = HEATHROW_PLAYER_RADIUS } = {},
) {
  const options = { mobileRenderer, radius };
  const start = depenetrateHeathrowPosition(
    clamp(current.x, HEATHROW_WORLD_BOUNDS.minX, HEATHROW_WORLD_BOUNDS.maxX),
    clamp(current.z, HEATHROW_WORLD_BOUNDS.minZ, HEATHROW_WORLD_BOUNDS.maxZ),
    options,
  );
  const startX = start.x;
  const startZ = start.z;
  let nextX = clamp(requested.x, HEATHROW_WORLD_BOUNDS.minX, HEATHROW_WORLD_BOUNDS.maxX);
  let nextZ = clamp(requested.z, HEATHROW_WORLD_BOUNDS.minZ, HEATHROW_WORLD_BOUNDS.maxZ);

  if (isHeathrowPositionBlocked(nextX, startZ, options)) {
    nextX = startX;
  }
  if (isHeathrowPositionBlocked(nextX, nextZ, options)) {
    nextZ = startZ;
  }

  return { x: nextX, z: nextZ };
}
