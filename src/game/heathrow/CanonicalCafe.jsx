import { RoundedBox, Text } from '@react-three/drei';

export const CANONICAL_CAFE_ID = 'heathrow-terminal-cafe';

function CoffeeCup({ position, scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      <mesh castShadow>
        <cylinderGeometry args={[0.1, 0.085, 0.22, 12]} />
        <meshStandardMaterial color="#F7F2E8" roughness={0.5} />
      </mesh>
      <mesh position={[0.1, 0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.065, 0.018, 8, 14, Math.PI * 1.35]} />
        <meshStandardMaterial color="#F7F2E8" roughness={0.5} />
      </mesh>
    </group>
  );
}

function MenuBoard({ x, label, price }) {
  return (
    <group position={[x, 3.08, 2.35]} rotation={[0, Math.PI, 0]}>
      <RoundedBox args={[2.25, 1.15, 0.12]} radius={0.08} castShadow>
        <meshStandardMaterial color="#19372F" roughness={0.58} />
      </RoundedBox>
      <Text position={[0, 0.18, -0.07]} fontSize={0.19} color="#FFF4D6" anchorX="center" anchorY="middle">
        {label}
      </Text>
      <Text position={[0, -0.2, -0.07]} fontSize={0.13} color="#BEE5D2" anchorX="center" anchorY="middle">
        {price}
      </Text>
    </group>
  );
}

function PastryDisplay({ reduced }) {
  return (
    <group position={[-3.25, 1.42, -0.05]}>
      <RoundedBox args={[2.2, 0.5, 0.72]} radius={0.08} castShadow receiveShadow>
        <meshPhysicalMaterial color="#DDEAF0" transparent opacity={0.62} roughness={0.12} transmission={0.2} />
      </RoundedBox>
      {!reduced && [-0.68, -0.22, 0.24, 0.7].map((x, index) => (
        <mesh key={x} position={[x, -0.12, -0.22 + (index % 2) * 0.18]} castShadow>
          <sphereGeometry args={[0.13, 10, 8]} />
          <meshStandardMaterial color={index % 2 === 0 ? '#D99B55' : '#B8703D'} roughness={0.72} />
        </mesh>
      ))}
    </group>
  );
}

function CoffeeMachine({ x, reduced }) {
  return (
    <group position={[x, 1.76, 2.08]} rotation={[0, Math.PI, 0]}>
      <RoundedBox args={[1.2, 0.88, 0.6]} radius={0.1} castShadow>
        <meshStandardMaterial color="#27313B" roughness={0.28} metalness={0.58} />
      </RoundedBox>
      <mesh position={[0, 0.08, -0.33]}>
        <planeGeometry args={[0.62, 0.3]} />
        <meshStandardMaterial color="#86D8F2" emissive="#318AB0" emissiveIntensity={0.5} roughness={0.24} />
      </mesh>
      {!reduced && (
        <>
          <mesh position={[-0.28, -0.48, -0.22]} castShadow>
            <cylinderGeometry args={[0.055, 0.055, 0.36, 8]} />
            <meshStandardMaterial color="#C7D0D6" metalness={0.78} roughness={0.22} />
          </mesh>
          <mesh position={[0.28, -0.48, -0.22]} castShadow>
            <cylinderGeometry args={[0.055, 0.055, 0.36, 8]} />
            <meshStandardMaterial color="#C7D0D6" metalness={0.78} roughness={0.22} />
          </mesh>
        </>
      )}
    </group>
  );
}

export default function CanonicalCafe({ decorationDensity = 'balanced', mobileRenderer = false }) {
  const reduced = decorationDensity === 'reduced';
  const full = decorationDensity === 'full' && !mobileRenderer;

  return (
    <group name={CANONICAL_CAFE_ID} position={[22, 0, 8]}>
      <mesh position={[0, 0.025, -1.8]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[15, 9]} />
        <meshStandardMaterial color="#887764" roughness={0.78} metalness={0.02} />
      </mesh>

      <RoundedBox args={[10.8, 1.08, 1.25]} radius={0.18} position={[0, 0.54, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#6D4936" roughness={0.58} />
      </RoundedBox>
      <RoundedBox args={[11.1, 0.16, 1.48]} radius={0.08} position={[0, 1.08, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#D7C7B2" roughness={0.28} metalness={0.08} />
      </RoundedBox>

      {[-4.1, -2.05, 0, 2.05, 4.1].map((x) => (
        <mesh key={x} position={[x, 0.52, -0.64]} castShadow>
          <boxGeometry args={[0.065, 0.78, 0.03]} />
          <meshStandardMaterial color="#3E2B22" roughness={0.62} />
        </mesh>
      ))}

      <PastryDisplay reduced={reduced} />

      <group position={[3.55, 1.43, -0.03]}>
        <RoundedBox args={[0.82, 0.46, 0.48]} radius={0.07} castShadow>
          <meshStandardMaterial color="#28323B" roughness={0.34} metalness={0.44} />
        </RoundedBox>
        <mesh position={[0, 0.08, -0.25]}>
          <planeGeometry args={[0.48, 0.24]} />
          <meshStandardMaterial color="#9DE7F5" emissive="#44B8D4" emissiveIntensity={0.62} roughness={0.2} />
        </mesh>
      </group>

      <RoundedBox args={[10.4, 0.18, 0.72]} radius={0.08} position={[0, 1.26, 2.28]} castShadow receiveShadow>
        <meshStandardMaterial color="#35434A" roughness={0.42} metalness={0.34} />
      </RoundedBox>
      <CoffeeMachine x={-2.7} reduced={reduced} />
      {!reduced && <CoffeeMachine x={-0.95} reduced={false} />}
      <CoffeeCup position={[1.2, 1.45, 2.22]} />
      <CoffeeCup position={[1.48, 1.45, 2.22]} scale={0.94} />
      {!reduced && <CoffeeCup position={[1.75, 1.45, 2.22]} scale={0.9} />}

      <group position={[0, 4.15, 0.55]} rotation={[0, Math.PI, 0]}>
        <RoundedBox args={[8.8, 1.15, 0.16]} radius={0.12} castShadow>
          <meshStandardMaterial color="#25483C" emissive="#17342B" emissiveIntensity={0.42} roughness={0.46} />
        </RoundedBox>
        <Text position={[0, 0.12, -0.095]} fontSize={0.44} color="#FFF2CF" anchorX="center" anchorY="middle" outlineWidth={0.01} outlineColor="#12251F">
          TERMINAL CAFÉ
        </Text>
        <Text position={[0, -0.3, -0.095]} fontSize={0.14} color="#BFE2D2" anchorX="center" anchorY="middle">
          COFFEE · TEA · PASTRIES
        </Text>
      </group>

      {!reduced && (
        <>
          <MenuBoard x={-2.55} label="COFFEE" price="ESPRESSO · LATTE · TEA" />
          <MenuBoard x={0} label="FOOD" price="PASTRIES · SANDWICHES" />
          <MenuBoard x={2.55} label="READY" price="COLLECT AT THE COUNTER" />
          {[-3.2, 0, 3.2].map((x) => (
            <group key={x} position={[x, 4.9, -0.3]}>
              <mesh position={[0, -0.62, 0]} castShadow>
                <cylinderGeometry args={[0.22, 0.34, 0.34, 12]} />
                <meshStandardMaterial color="#D7B56E" emissive="#8A5B16" emissiveIntensity={0.35} roughness={0.4} />
              </mesh>
              <mesh position={[0, -0.02, 0]}>
                <cylinderGeometry args={[0.025, 0.025, 0.9, 8]} />
                <meshStandardMaterial color="#4A545C" metalness={0.66} roughness={0.3} />
              </mesh>
            </group>
          ))}
        </>
      )}

      {!reduced && (
        <pointLight
          position={[0, 4.6, -1.2]}
          color="#FFD89A"
          intensity={mobileRenderer ? 2.4 : 3.8}
          distance={10}
          decay={2}
        />
      )}

      {full && (
        <>
          <mesh position={[-5.4, 2.4, 0.2]} castShadow>
            <boxGeometry args={[0.2, 4.8, 0.2]} />
            <meshStandardMaterial color="#31424C" metalness={0.56} roughness={0.32} />
          </mesh>
          <mesh position={[5.4, 2.4, 0.2]} castShadow>
            <boxGeometry args={[0.2, 4.8, 0.2]} />
            <meshStandardMaterial color="#31424C" metalness={0.56} roughness={0.32} />
          </mesh>
        </>
      )}
    </group>
  );
}
