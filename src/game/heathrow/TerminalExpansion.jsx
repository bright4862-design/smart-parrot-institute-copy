import { RoundedBox, Text } from '@react-three/drei';

const BENCH_POSITIONS = [
  [-25, -2],
  [-19, -2],
  [19, -1],
  [25, -1],
  [-24, 10],
  [24, 10],
];

const PLANTER_POSITIONS = [
  [-29, 7],
  [-15, 9],
  [15, 9],
  [29, 7],
];

function ZoneFloor({ position, size, color }) {
  return (
    <mesh position={[position[0], 0.015, position[1]]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.5} metalness={0.05} />
    </mesh>
  );
}

function ConcourseHeader({ position, label, accent }) {
  return (
    <group position={position}>
      <RoundedBox args={[9.8, 1.35, 0.3]} radius={0.16} castShadow>
        <meshStandardMaterial
          color="#153b68"
          emissive={accent}
          emissiveIntensity={0.38}
          roughness={0.3}
          metalness={0.12}
        />
      </RoundedBox>
      <Text
        position={[0, 0, 0.18]}
        fontSize={0.38}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.012}
        outlineColor="#07192f"
      >
        {label}
      </Text>
    </group>
  );
}

function Bench({ position }) {
  return (
    <group position={[position[0], 0.48, position[1]]}>
      <RoundedBox args={[3.8, 0.28, 1.05]} radius={0.12} castShadow receiveShadow>
        <meshStandardMaterial color="#315a78" roughness={0.42} metalness={0.3} />
      </RoundedBox>
      {[-1.45, 1.45].map((x) => (
        <mesh key={x} position={[x, -0.34, 0]} castShadow>
          <boxGeometry args={[0.18, 0.68, 0.7]} />
          <meshStandardMaterial color="#8a96a3" roughness={0.3} metalness={0.72} />
        </mesh>
      ))}
    </group>
  );
}

function Planter({ position }) {
  return (
    <group position={[position[0], 0, position[1]]}>
      <mesh position={[0, 0.52, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.78, 0.92, 1.05, 16]} />
        <meshStandardMaterial color="#d7dce1" roughness={0.5} metalness={0.12} />
      </mesh>
      <mesh position={[0, 1.5, 0]} castShadow>
        <icosahedronGeometry args={[0.95, 1]} />
        <meshStandardMaterial color="#278764" roughness={0.78} />
      </mesh>
    </group>
  );
}

function TicketMachine({ x }) {
  return (
    <group position={[x, 1.18, 0]}>
      <RoundedBox args={[1.5, 2.4, 0.85]} radius={0.16} castShadow receiveShadow>
        <meshStandardMaterial color="#2d547b" roughness={0.36} metalness={0.28} />
      </RoundedBox>
      <mesh position={[0, 0.28, 0.45]}>
        <planeGeometry args={[1.05, 0.92]} />
        <meshStandardMaterial
          color="#bcecff"
          emissive="#4db9e8"
          emissiveIntensity={0.72}
          roughness={0.22}
        />
      </mesh>
      <Text position={[0, -0.62, 0.46]} fontSize={0.15} color="#ffffff" anchorX="center">
        TICKETS
      </Text>
    </group>
  );
}

export default function TerminalExpansion({ mobileRenderer = false }) {
  const visibleBenches = mobileRenderer ? BENCH_POSITIONS.slice(0, 4) : BENCH_POSITIONS;
  const visiblePlanters = mobileRenderer ? PLANTER_POSITIONS.filter((_, index) => index % 2 === 0) : PLANTER_POSITIONS;

  return (
    <group>
      <ZoneFloor position={[-23, 3.5]} size={[18, 22]} color="#c7d6e2" />
      <ZoneFloor position={[23, 4]} size={[18, 22]} color="#d4ddd8" />
      <ZoneFloor position={[0, 13]} size={[15, 18]} color="#d8d2e3" />

      <ConcourseHeader position={[-22, 6.4, -2]} label="GATES A · A12" accent="#4aa3ff" />
      <ConcourseHeader position={[22, 6.4, -1]} label="SERVICES · RESTROOMS" accent="#48d6ba" />
      <ConcourseHeader position={[0, 6.4, 14.5]} label="TRAINS · UNDERGROUND" accent="#f05b65" />

      <group position={[-22, 0, 8]}>
        <RoundedBox args={[13, 0.38, 0.9]} radius={0.12} position={[0, 0.35, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#8fa0af" roughness={0.32} metalness={0.55} />
        </RoundedBox>
        {[-5.8, 5.8].map((x) => (
          <mesh key={x} position={[x, 2.8, 0]} castShadow>
            <boxGeometry args={[0.35, 5.6, 0.35]} />
            <meshStandardMaterial color="#f0f3f6" roughness={0.25} metalness={0.62} />
          </mesh>
        ))}
      </group>

      <group position={[22, 0, 8]}>
        <RoundedBox args={[13, 3.2, 1.7]} radius={0.22} position={[0, 1.6, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#6a4f3c" roughness={0.48} />
        </RoundedBox>
        <Text position={[0, 3.55, 0.9]} fontSize={0.46} color="#fff1d7" anchorX="center">
          CAFÉ · SERVICES
        </Text>
      </group>

      <group position={[0, 0, 10.5]}>
        <RoundedBox args={[8.6, 0.25, 4.8]} radius={0.2} position={[0, 0.12, 0]} receiveShadow>
          <meshStandardMaterial color="#bac5d1" roughness={0.38} metalness={0.22} />
        </RoundedBox>
        {[-2.2, 0, 2.2].map((x) => <TicketMachine key={x} x={x} />)}
      </group>

      {visibleBenches.map(([x, z]) => <Bench key={`${x}:${z}`} position={[x, z]} />)}
      {visiblePlanters.map(([x, z]) => <Planter key={`${x}:${z}`} position={[x, z]} />)}

      {!mobileRenderer && (
        <>
          <mesh position={[-11, 3.2, 5]} castShadow receiveShadow>
            <boxGeometry args={[0.22, 6.4, 16]} />
            <meshPhysicalMaterial color="#b9d7e8" transparent opacity={0.32} roughness={0.16} transmission={0.22} />
          </mesh>
          <mesh position={[11, 3.2, 5]} castShadow receiveShadow>
            <boxGeometry args={[0.22, 6.4, 16]} />
            <meshPhysicalMaterial color="#b9d7e8" transparent opacity={0.32} roughness={0.16} transmission={0.22} />
          </mesh>
        </>
      )}
    </group>
  );
}
