import { RoundedBox } from '@react-three/drei';

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

function PassageFrame({ position, width, accent = '#91B8D6', strong = false }) {
  const postColor = strong ? '#344B5C' : '#607786';
  return (
    <group position={position}>
      {[-width / 2, width / 2].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 2.7, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.28, 5.4, 0.32]} />
            <meshStandardMaterial color={postColor} roughness={0.34} metalness={0.48} />
          </mesh>
          <RoundedBox args={[0.72, 0.28, 0.72]} radius={0.08} position={[0, 0.14, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#465666" roughness={0.46} metalness={0.28} />
          </RoundedBox>
        </group>
      ))}
      <mesh position={[0, 5.25, 0]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.3, 0.36, 0.36]} />
        <meshStandardMaterial color={postColor} emissive={accent} emissiveIntensity={strong ? 0.28 : 0.14} roughness={0.34} metalness={0.42} />
      </mesh>
      <mesh position={[0, 4.84, 0.03]}>
        <boxGeometry args={[width - 0.45, 0.08, 0.08]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
    </group>
  );
}

function BaggageClaimSection({ reduced }) {
  const passageFrames = reduced ? [-4.4, -7] : [-2.2, -4.6, -7];

  return (
    <group name="heathrow-baggage-claim-section">
      <mesh position={[-11.8, 0.018, -9.1]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[19.5, 15.4]} />
        <meshStandardMaterial color="#718394" roughness={0.76} metalness={0.04} />
      </mesh>

      <mesh position={[-11.8, 0.035, -2.02]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[17.2, 0.34]} />
        <meshStandardMaterial color="#E8C14C" emissive="#6F4A00" emissiveIntensity={0.22} roughness={0.56} />
      </mesh>

      <group name="heathrow-baggage-passage">
        {passageFrames.map((x, index) => (
          <group key={x} position={[x, 0, -8.35]} rotation={[0, Math.PI / 2, 0]}>
            <PassageFrame position={[0, 0, 0]} width={4.8} accent="#91D5FF" strong={index === passageFrames.length - 1} />
          </group>
        ))}
      </group>

      <mesh position={[-20.95, 2.7, -9.1]} castShadow receiveShadow>
        <boxGeometry args={[0.28, 5.4, 14.8]} />
        <meshStandardMaterial color="#607786" roughness={0.38} metalness={0.38} />
      </mesh>

      <LuggageProp position={[-17.1, 0, -5.35]} color="#486C8A" />
      <LuggageProp position={[-7.4, 0, -5.15]} color="#805A78" scale={0.92} />
      {!reduced && <LuggageProp position={[-5.8, 0, -12.4]} color="#C17A4F" scale={0.84} />}

      {!reduced && (
        <pointLight position={[-11.5, 5.8, -8.6]} color="#D9EEFF" intensity={2.1} distance={15} decay={2} />
      )}
    </group>
  );
}

function UndergroundSection({ reduced, mobileRenderer }) {
  const tunnelFrames = reduced ? [29.4, 36.4, 42] : [28.6, 32.8, 37, 41.2];

  return (
    <group name="heathrow-underground-section">
      <mesh position={[0, 0.02, 35.4]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[15.5, 20.8]} />
        <meshStandardMaterial color="#777382" roughness={0.78} metalness={0.03} />
      </mesh>

      <mesh position={[0, 0.045, 35.2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[4.4, 20.2]} />
        <meshStandardMaterial color="#E9C846" emissive="#785200" emissiveIntensity={0.24} roughness={0.54} />
      </mesh>

      <group name="heathrow-underground-tunnel">
        {tunnelFrames.map((z, index) => (
          <PassageFrame
            key={z}
            position={[0, 0, z]}
            width={12.8}
            accent={index % 2 === 0 ? '#E74753' : '#4B79C8'}
            strong={index === 0}
          />
        ))}

        {[-7.15, 7.15].map((x) => (
          <group key={x}>
            <mesh position={[x, 1.35, 35.4]} castShadow receiveShadow>
              <boxGeometry args={[0.22, 2.7, 19.6]} />
              <meshStandardMaterial color="#354857" roughness={0.44} metalness={0.32} />
            </mesh>
            <mesh position={[x * 0.994, 2.78, 35.4]}>
              <boxGeometry args={[0.08, 0.12, 18.8]} />
              <meshBasicMaterial color={x < 0 ? '#E74753' : '#4B79C8'} toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>

      <group position={[0, 0, 43.4]}>
        <RoundedBox args={[9.2, 0.24, 1.2]} radius={0.1} position={[0, 0.12, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#31404D" roughness={0.42} metalness={0.34} />
        </RoundedBox>
        {!reduced && [-4, 4].map((x) => (
          <mesh key={x} position={[x, 1.45, 0]} castShadow>
            <boxGeometry args={[0.18, 2.9, 0.18]} />
            <meshStandardMaterial color="#AAB4BD" roughness={0.28} metalness={0.62} />
          </mesh>
        ))}
      </group>

      {!reduced && (
        <pointLight
          position={[0, 5.8, 36.4]}
          color="#FFE6A1"
          intensity={mobileRenderer ? 1.8 : 3}
          distance={17}
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
