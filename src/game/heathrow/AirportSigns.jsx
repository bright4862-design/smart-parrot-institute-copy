import { Float, RoundedBox, Text } from '@react-three/drei';

export const AIRPORT_SIGNS = Object.freeze([
  Object.freeze({
    id: 'baggage',
    label: 'BAGGAGE RECLAIM',
    shortLabel: 'Baggage Reclaim',
    position: Object.freeze([-10.5, 4.15, -6.25]),
    interactionPosition: Object.freeze({ x: -10.5, z: -4.25 }),
    width: 5.8,
    fontSize: 0.34,
    cameraSide: -1,
    learningCopy: 'Baggage reclaim is where arriving passengers collect their checked luggage.',
    hint: 'Look for the suitcase symbol and the word “baggage”.',
  }),
  Object.freeze({
    id: 'gate',
    label: 'GATE A12  →',
    shortLabel: 'Gate A12',
    position: Object.freeze([-21, 5.1, 1.4]),
    interactionPosition: Object.freeze({ x: -21, z: 3.45 }),
    width: 4.2,
    fontSize: 0.34,
    cameraSide: 1,
    learningCopy: 'A gate is where passengers board a flight. A12 identifies this boarding area.',
    hint: 'Read the letter and number together: “Gate A twelve”.',
  }),
  Object.freeze({
    id: 'restrooms',
    label: 'RESTROOMS  →',
    shortLabel: 'Restrooms',
    position: Object.freeze([21, 5.05, 2.4]),
    interactionPosition: Object.freeze({ x: 21, z: 4.45 }),
    width: 4.4,
    fontSize: 0.3,
    cameraSide: -1,
    learningCopy: '“Restrooms” means toilets. The arrow shows which direction to walk.',
    hint: 'Follow the arrow beside the word “restrooms”.',
  }),
]);

export function getAirportSign(signId) {
  return AIRPORT_SIGNS.find((sign) => sign.id === signId) ?? null;
}

export function findNearbyAirportSign(position, radius = 3.1) {
  let nearest = null;
  let nearestDistance = radius;

  AIRPORT_SIGNS.forEach((sign) => {
    const signDistance = Math.hypot(
      position.x - sign.interactionPosition.x,
      position.z - sign.interactionPosition.z,
    );
    if (signDistance < nearestDistance) {
      nearest = sign;
      nearestDistance = signDistance;
    }
  });

  return nearest;
}

export default function AirportSigns({
  missionActive = false,
  inspectedIds = [],
  focusedId = null,
}) {
  const inspected = new Set(inspectedIds);

  return (
    <group>
      {AIRPORT_SIGNS.map((sign) => {
        const isInspected = inspected.has(sign.id);
        const isFocused = focusedId === sign.id;
        const shouldHighlight = missionActive && !isInspected;
        const faceColor = isInspected ? '#1f6f5f' : '#17365f';
        const glowColor = isInspected ? '#5ee6bd' : '#79c8ff';

        return (
          <group key={sign.id} position={sign.position}>
            <RoundedBox
              args={[sign.width + 0.18, 1.38, 0.18]}
              radius={0.16}
              position={[0, 0, -0.06]}
            >
              <meshBasicMaterial
                color={glowColor}
                transparent
                opacity={shouldHighlight || isFocused ? 0.55 : 0.12}
                toneMapped={false}
              />
            </RoundedBox>
            <RoundedBox args={[sign.width, 1.2, 0.24]} radius={0.14} castShadow>
              <meshStandardMaterial
                color={faceColor}
                emissive={glowColor}
                emissiveIntensity={shouldHighlight || isFocused ? 0.82 : isInspected ? 0.28 : 0.16}
                metalness={0.08}
                roughness={0.34}
              />
            </RoundedBox>
            <Text
              position={[0, 0, 0.15]}
              fontSize={sign.fontSize}
              color="#ffffff"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.012}
              outlineColor="#081d38"
            >
              {sign.label}
            </Text>
            {shouldHighlight && (
              <Float speed={1.15} floatIntensity={0.12}>
                <Text
                  position={[0, 1.02, 0.1]}
                  fontSize={0.2}
                  color="#fff3a8"
                  anchorX="center"
                  outlineWidth={0.015}
                  outlineColor="#17213b"
                >
                  INSPECT
                </Text>
              </Float>
            )}
          </group>
        );
      })}
    </group>
  );
}
