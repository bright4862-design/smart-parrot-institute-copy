import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Float, Text } from '@react-three/drei';
import NPCActor from './NPCActor';
import CafePopulation from './CafePopulation';
import { resolveCafePopulation } from './cafePopulation';
import { resolveNPCPerformanceProfile } from './npcSystem';

const CAFE_POSITION = Object.freeze({ x: 22, z: 8.4 });

const CAFE_WORKERS = Object.freeze({
  barista: Object.freeze({
    id: 'cafe-barista',
    position: Object.freeze([19.25, 0.72, 9.3]),
    rotation: Math.PI,
    animation: 'work',
    activity: 'coffee',
    role: 'staff',
    palette: 0,
    phase: 0.2,
    lines: Object.freeze(['Your coffee will be ready shortly.', 'Next order, please.']),
  }),
  service: Object.freeze({
    id: 'cafe-service',
    position: Object.freeze([23.2, 0.72, 9.3]),
    rotation: Math.PI,
    animation: 'work',
    activity: 'tray',
    role: 'staff',
    palette: 3,
    phase: 1.4,
    path: Object.freeze({ axis: 'x', range: 0.62, speed: 0.3 }),
    lines: Object.freeze(['I will clear this table.', 'Fresh cups coming through.']),
  }),
  cashier: Object.freeze({
    id: 'cafe-cashier',
    position: Object.freeze([26.0, 0.72, 9.3]),
    rotation: Math.PI,
    animation: 'work',
    activity: 'tablet',
    role: 'staff',
    palette: 1,
    phase: 2.5,
    lines: Object.freeze(['Card or cash?', 'The queue starts here.']),
  }),
});

function CoffeeSteam({ enabled }) {
  const steam = useRef();
  useFrame(({ clock }) => {
    if (!steam.current || !enabled) return;
    steam.current.children.forEach((puff, index) => {
      const time = clock.elapsedTime * (0.42 + index * 0.04) + index * 1.7;
      puff.position.y = 1.15 + ((time % 1.8) * 0.72);
      puff.position.x = Math.sin(time * 2.2) * 0.08;
      puff.material.opacity = Math.max(0, 0.18 - ((time % 1.8) * 0.08));
    });
  });

  if (!enabled) return null;
  return (
    <group ref={steam} position={[19.2, 1.95, 7.05]}>
      {[0, 1, 2].map((index) => (
        <mesh key={index} position={[0, 1.15 + index * 0.2, 0]}>
          <sphereGeometry args={[0.1 + index * 0.025, 8, 8]} />
          <meshBasicMaterial color="#FFFFFF" transparent opacity={0.14} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

export default function AirportLife({ decorationDensity = 'balanced', mobileRenderer = false, playerPosition }) {
  const cafeProfile = resolveCafePopulation(decorationDensity);
  const npcProfile = resolveNPCPerformanceProfile(decorationDensity, mobileRenderer);
  const reduced = npcProfile.id === 'reduced';

  return (
    <group>
      {cafeProfile.workerRoles.map((role) => (
        <NPCActor
          key={role}
          actor={CAFE_WORKERS[role]}
          profile={npcProfile}
          playerPosition={playerPosition}
        />
      ))}
      <CoffeeSteam enabled={!reduced} />
      <CafePopulation
        decorationDensity={npcProfile.id}
        playerPosition={playerPosition}
        npcProfile={npcProfile}
      />

      {!reduced && (
        <Float speed={1.25} floatIntensity={0.035} rotationIntensity={0}>
          <Text
            position={[CAFE_POSITION.x, 4.25, CAFE_POSITION.z + 0.15]}
            fontSize={0.19}
            color="#FFE8B0"
            anchorX="center"
            outlineWidth={0.012}
            outlineColor="#382518"
          >
            FRESH COFFEE · ORDERS READY
          </Text>
        </Float>
      )}
    </group>
  );
}
