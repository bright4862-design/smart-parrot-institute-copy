import { RoundedBox, Text } from '@react-three/drei';

function SectionHeader({ position, width, label, subtitle, accent, textColor = '#FFFFFF' }) {
  return (
    <group position={position}>
      <RoundedBox args={[width, 1.08, 0.18]} radius={0.12} castShadow>
        <meshStandardMaterial
          color="#173552"
          emissive={accent}
          emissiveIntensity={0.34}
          roughness={0.38}
          metalness={0.12}
        />
      </RoundedBox>
      <Text
        position={[0, 0.16, 0.105]}
        fontSize={0.34}
        color={textColor}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.01}
        outlineColor="#07192F"
      >
        {label}
      </Text>
      <Text
        position={[0, -0.24, 0.105]}
        fontSize={0.12}
        color="#DCEBFA"
        anchorX="center"
        anchorY="middle"
      >
        {subtitle}
      </Text>
    </group>
  );
}

function LuggageProp({ position, color, scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      <RoundedBox args={[0.52, 0.74, 0.34]} radius={0.08} position={[0, 0.38, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.48} />
      </RoundedBox>
      <mesh position={[0, 0.88, 0]} castShadow>
        <torusGeometry args={[0.13, 0.028, 8, 14, Math.PI]} />
        <meshStandardMaterial color="#303842" metalness={0.58} roughness={0.34} />
      </mesh>
    </group>
  );
}

function BaggageClaimSection({ reduced }) {
  return (
    <group name="heathrow-baggage-claim-section">
      <mesh position={[-10.5, 0.018, -8]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[16, 8.6]} />
        <meshStandardMaterial color="#718394" roughness={0.76} metalness={0.04} />
      </mesh>

      <mesh position={[-10.5, 0.035, -4.05]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[13.8, 0.34]} />
        <meshStandardMaterial color="#E8C14C" emissive="#6F4A00" emissiveIntensity={0.22} roughness={0.56} />
      </mesh>

      <SectionHeader
        position={[-10.5, 5.05, -4.45]}
        width={8.6}
        label="BAGGAGE RECLAIM"
        subtitle="ARRIVALS · CAROUSEL 5"
        accent="#4AA3FF"
      />

      {[-16.9, -4.1].map((x) => (
        <group key={x} position={[x, 0, -4.45]}>
          <mesh position={[0, 2.42, 0]} castShadow>
            <boxGeometry args={[0.2, 4.84, 0.2]} />
            <meshStandardMaterial color="#D8DEE5" roughness={0.28} metalness={0.62} />
          </mesh>
          <mesh position={[0, 0.42, 0.15]} castShadow>
            <boxGeometry args={[0.38, 0.84, 0.38]} />
            <meshStandardMaterial color="#465666" roughness={0.46} metalness={0.28} />
          </mesh>
        </group>
      ))}

      <LuggageProp position={[-15.1, 0, -5.4]} color="#486C8A" />
      <LuggageProp position={[-6.2, 0, -5.25]} color="#805A78" scale={0.92} />
      {!reduced && <LuggageProp position={[-4.8, 0, -9.8]} color="#C17A4F" scale={0.84} />}

      {!reduced && (
        <pointLight position={[-10.5, 5.6, -6.5]} color="#D9EEFF" intensity={2.2} distance={13} decay={2} />
      )}
    </group>
  );
}

function UndergroundSection({ reduced, mobileRenderer }) {
  return (
    <group name="heathrow-underground-section">
      <mesh position={[0, 0.02, 18.1]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[15, 10.8]} />
        <meshStandardMaterial color="#817A8D" roughness={0.76} metalness={0.03} />
      </mesh>

      <mesh position={[0, 0.045, 17.1]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[4.2, 9.8]} />
        <meshStandardMaterial color="#E9C846" emissive="#785200" emissiveIntensity={0.28} roughness={0.54} />
      </mesh>

      <SectionHeader
        position={[0, 5.45, 15.55]}
        width={9.4}
        label="LONDON TRANSPORT"
        subtitle="UNDERGROUND · CENTRAL LONDON"
        accent="#E43C4A"
      />

      {[-6.7, 6.7].map((x) => (
        <group key={x} position={[x, 0, 15.55]}>
          <mesh position={[0, 2.62, 0]} castShadow>
            <boxGeometry args={[0.24, 5.24, 0.24]} />
            <meshStandardMaterial color="#D8DEE5" roughness={0.28} metalness={0.64} />
          </mesh>
          <RoundedBox args={[0.72, 0.34, 0.72]} radius={0.08} position={[0, 0.18, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#465666" roughness={0.46} metalness={0.3} />
          </RoundedBox>
        </group>
      ))}

      <group position={[0, 0, 22.2]}>
        <RoundedBox args={[8.6, 0.24, 1.2]} radius={0.1} position={[0, 0.12, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#31404D" roughness={0.42} metalness={0.34} />
        </RoundedBox>
        {!reduced && [-3.7, 3.7].map((x) => (
          <mesh key={x} position={[x, 1.45, 0]} castShadow>
            <boxGeometry args={[0.18, 2.9, 0.18]} />
            <meshStandardMaterial color="#AAB4BD" roughness={0.28} metalness={0.62} />
          </mesh>
        ))}
      </group>

      {!reduced && (
        <pointLight
          position={[0, 5.7, 18.8]}
          color="#FFE6A1"
          intensity={mobileRenderer ? 2 : 3.2}
          distance={14}
          decay={2}
        />
      )}
    </group>
  );
}

export default function AirportSections({ decorationDensity = 'balanced', mobileRenderer = false }) {
  const reduced = decorationDensity === 'reduced';

  return (
    <group>
      <BaggageClaimSection reduced={reduced} />
      <UndergroundSection reduced={reduced} mobileRenderer={mobileRenderer} />
    </group>
  );
}
