import { RoundedBox } from '@react-three/drei';
import NPCActor from './NPCActor';
import {
  CAFE_SEATS,
  CAFE_TABLE_RADIUS,
  CAFE_TABLES,
  resolveCafePopulation,
} from './cafePopulation';
import { resolveNPCPerformanceProfile } from './npcSystem';

function CafeChair({ position, rotation }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <RoundedBox args={[0.68, 0.16, 0.68]} radius={0.08} position={[0, 0.55, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#6F523D" roughness={0.66} />
      </RoundedBox>
      <RoundedBox args={[0.68, 0.78, 0.14]} radius={0.07} position={[0, 0.92, -0.29]} castShadow>
        <meshStandardMaterial color="#795A43" roughness={0.68} />
      </RoundedBox>
      {[-0.25, 0.25].map((x) => (
        <mesh key={x} position={[x, 0.25, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.045, 0.5, 8]} />
          <meshStandardMaterial color="#3D4249" roughness={0.42} metalness={0.55} />
        </mesh>
      ))}
    </group>
  );
}

function CafeLuggage({ position, color }) {
  return (
    <group position={position}>
      <RoundedBox args={[0.42, 0.68, 0.3]} radius={0.08} position={[0, 0.36, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.5} />
      </RoundedBox>
      <mesh position={[0, 0.82, 0]} castShadow>
        <torusGeometry args={[0.11, 0.025, 8, 12, Math.PI]} />
        <meshStandardMaterial color="#303842" metalness={0.55} roughness={0.36} />
      </mesh>
    </group>
  );
}

function CafeTable({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[CAFE_TABLE_RADIUS, CAFE_TABLE_RADIUS, 0.12, 24]} />
        <meshStandardMaterial color="#C6A57E" roughness={0.48} />
      </mesh>
      <mesh position={[0, 0.46, 0]} castShadow>
        <cylinderGeometry args={[0.11, 0.16, 0.82, 12]} />
        <meshStandardMaterial color="#4B535D" roughness={0.34} metalness={0.56} />
      </mesh>
      <mesh position={[0, 0.08, 0]} castShadow>
        <cylinderGeometry args={[0.45, 0.45, 0.08, 18]} />
        <meshStandardMaterial color="#4B535D" roughness={0.36} metalness={0.54} />
      </mesh>
    </group>
  );
}

export default function CafePopulation({ decorationDensity = 'balanced', playerPosition, npcProfile = null }) {
  const cafeProfile = resolveCafePopulation(decorationDensity);
  const sharedProfile = npcProfile ?? resolveNPCPerformanceProfile(decorationDensity, false);
  const occupiedSeats = CAFE_SEATS.slice(0, cafeProfile.travelerCount);

  return (
    <group>
      {CAFE_TABLES.map((table) => <CafeTable key={table.id} position={table.position} />)}
      {CAFE_SEATS.map((seat) => <CafeChair key={`chair:${seat.id}`} position={seat.position} rotation={seat.rotation} />)}
      <CafeLuggage position={[16.85, 0, 5.38]} color="#486C8A" />
      {cafeProfile.id !== 'reduced' && <CafeLuggage position={[26.55, 0, 3.92]} color="#805A78" />}
      {occupiedSeats.map((seat) => (
        <NPCActor
          key={seat.id}
          actor={{
            ...seat,
            role: 'traveler',
            animation: 'seated',
            lines: seat.activity === 'laptop'
              ? ['I am finishing some work.', 'The Wi-Fi is quite good.']
              : seat.activity === 'drink'
                ? ['This coffee is warm.', 'I needed a quick break.']
                : ['I am checking my messages.', 'My gate has not opened yet.'],
          }}
          profile={sharedProfile}
          playerPosition={playerPosition}
        />
      ))}
    </group>
  );
}
