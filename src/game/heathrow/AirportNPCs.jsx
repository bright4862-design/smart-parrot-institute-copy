import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Float, RoundedBox, Text } from '@react-three/drei';

export const AIRPORT_EMPLOYEE_POSITION = Object.freeze({ x: 5.8, z: 1.6 });

const SKIN_TONES = ['#F2C3A0', '#D89B74', '#A96F50', '#6F4635'];
const TOPS = ['#556B8C', '#8B5E83', '#3D7B72', '#B06C4E', '#4B5E7A', '#6F5B91'];
const BOTTOMS = ['#27364C', '#3A4655', '#57483F', '#2F4A5B'];

function Passenger({
  position,
  rotation = 0,
  phase = 0,
  walking = false,
  axis = 'x',
  range = 1.4,
  speed = 0.28,
  suitcase = false,
  phone = false,
  paletteIndex = 0,
}) {
  const root = useRef();
  const leftLeg = useRef();
  const rightLeg = useRef();
  const leftArm = useRef();
  const rightArm = useRef();
  const base = useMemo(() => ({ x: position[0], y: position[1], z: position[2] }), [position]);
  const skin = SKIN_TONES[paletteIndex % SKIN_TONES.length];
  const top = TOPS[paletteIndex % TOPS.length];
  const bottoms = BOTTOMS[paletteIndex % BOTTOMS.length];

  useFrame(({ clock }) => {
    if (!root.current) return;
    const t = clock.elapsedTime + phase;
    const stride = walking ? Math.sin(t * 5.2) * 0.42 : Math.sin(t * 1.5) * 0.025;

    if (leftLeg.current) leftLeg.current.rotation.x = stride;
    if (rightLeg.current) rightLeg.current.rotation.x = -stride;
    if (leftArm.current) leftArm.current.rotation.x = -stride * 0.65;
    if (rightArm.current) rightArm.current.rotation.x = stride * 0.65;

    root.current.position.y = base.y + (walking ? Math.abs(Math.sin(t * 5.2)) * 0.035 : Math.sin(t * 1.5) * 0.015);
    if (walking) {
      const travel = Math.sin(t * speed) * range;
      if (axis === 'x') {
        root.current.position.x = base.x + travel;
        root.current.rotation.y = Math.cos(t * speed) >= 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        root.current.position.z = base.z + travel;
        root.current.rotation.y = Math.cos(t * speed) >= 0 ? 0 : Math.PI;
      }
    }
  });

  return (
    <group ref={root} position={position} rotation={[0, rotation, 0]} scale={0.88}>
      <RoundedBox args={[0.62, 0.82, 0.38]} radius={0.14} position={[0, 0.58, 0]} castShadow>
        <meshStandardMaterial color={top} roughness={0.72} />
      </RoundedBox>

      <group ref={leftArm} position={[-0.39, 0.76, 0]}>
        <mesh position={[0, -0.28, 0]} castShadow>
          <capsuleGeometry args={[0.09, 0.38, 6, 10]} />
          <meshStandardMaterial color={top} roughness={0.72} />
        </mesh>
      </group>
      <group ref={rightArm} position={[0.39, 0.76, 0]}>
        <mesh position={[0, -0.28, 0]} castShadow>
          <capsuleGeometry args={[0.09, 0.38, 6, 10]} />
          <meshStandardMaterial color={top} roughness={0.72} />
        </mesh>
        {phone && (
          <mesh position={[0, -0.53, -0.08]} rotation={[0.5, 0, 0]}>
            <boxGeometry args={[0.12, 0.2, 0.025]} />
            <meshStandardMaterial color="#141923" metalness={0.35} roughness={0.28} />
          </mesh>
        )}
      </group>

      <group ref={leftLeg} position={[-0.16, 0.08, 0]}>
        <mesh position={[0, -0.3, 0]} castShadow>
          <capsuleGeometry args={[0.1, 0.42, 6, 10]} />
          <meshStandardMaterial color={bottoms} roughness={0.82} />
        </mesh>
      </group>
      <group ref={rightLeg} position={[0.16, 0.08, 0]}>
        <mesh position={[0, -0.3, 0]} castShadow>
          <capsuleGeometry args={[0.1, 0.42, 6, 10]} />
          <meshStandardMaterial color={bottoms} roughness={0.82} />
        </mesh>
      </group>

      <mesh position={[0, 1.25, 0]} castShadow>
        <sphereGeometry args={[0.27, 16, 16]} />
        <meshStandardMaterial color={skin} roughness={0.58} />
      </mesh>
      <mesh position={[0, 1.42, -0.01]} scale={[1.03, 0.5, 1.04]} castShadow>
        <sphereGeometry args={[0.28, 14, 14]} />
        <meshStandardMaterial color={paletteIndex % 2 ? '#30231F' : '#564033'} roughness={0.85} />
      </mesh>

      {suitcase && (
        <group position={[-0.55, 0.05, 0.12]}>
          <RoundedBox args={[0.36, 0.54, 0.22]} radius={0.07} castShadow>
            <meshStandardMaterial color={paletteIndex % 2 ? '#B15E5E' : '#365B7B'} roughness={0.48} />
          </RoundedBox>
          <mesh position={[0, 0.36, 0]}>
            <boxGeometry args={[0.18, 0.22, 0.035]} />
            <meshStandardMaterial color="#30343C" metalness={0.5} roughness={0.35} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function AirportEmployee({ active }) {
  const root = useRef();

  useFrame(({ clock }) => {
    if (!root.current) return;
    root.current.position.y = Math.sin(clock.elapsedTime * 1.6) * 0.018;
  });

  return (
    <group position={[AIRPORT_EMPLOYEE_POSITION.x, 0.02, AIRPORT_EMPLOYEE_POSITION.z]} rotation={[0, -2.45, 0]}>
      <group ref={root}>
        <RoundedBox args={[0.72, 0.9, 0.42]} radius={0.14} position={[0, 0.62, 0]} castShadow>
          <meshStandardMaterial color="#17365F" roughness={0.58} />
        </RoundedBox>
        <mesh position={[0, 0.78, 0.23]}>
          <boxGeometry args={[0.42, 0.16, 0.03]} />
          <meshStandardMaterial color="#F2C94C" roughness={0.55} />
        </mesh>
        <Text position={[0, 0.78, 0.255]} fontSize={0.07} color="#17213B" anchorX="center">STAFF</Text>

        {[-0.45, 0.45].map((x) => (
          <mesh key={x} position={[x, 0.55, 0]} castShadow>
            <capsuleGeometry args={[0.1, 0.48, 6, 10]} />
            <meshStandardMaterial color="#17365F" roughness={0.58} />
          </mesh>
        ))}
        {[-0.18, 0.18].map((x) => (
          <mesh key={x} position={[x, -0.03, 0]} castShadow>
            <capsuleGeometry args={[0.11, 0.54, 6, 10]} />
            <meshStandardMaterial color="#27364C" roughness={0.8} />
          </mesh>
        ))}
        <mesh position={[0, 1.3, 0]} castShadow>
          <sphereGeometry args={[0.3, 18, 18]} />
          <meshStandardMaterial color="#D89B74" roughness={0.58} />
        </mesh>
        <mesh position={[0, 1.48, -0.01]} scale={[1.04, 0.48, 1.04]} castShadow>
          <sphereGeometry args={[0.31, 16, 16]} />
          <meshStandardMaterial color="#2A211E" roughness={0.86} />
        </mesh>
      </group>

      {active && (
        <Float speed={2} floatIntensity={0.14}>
          <group position={[0, 2.05, 0]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.28, 0.42, 32]} />
              <meshBasicMaterial color="#F8D65C" transparent opacity={0.88} toneMapped={false} />
            </mesh>
            <Text position={[0, 0.45, 0]} fontSize={0.18} color="#17213B" anchorX="center" outlineWidth={0.018} outlineColor="#FFFFFF">ASK FOR HELP</Text>
          </group>
        </Float>
      )}
    </group>
  );
}

export default function AirportNPCs({ employeeActive = false }) {
  return (
    <group>
      <AirportEmployee active={employeeActive} />
      <Passenger position={[-7.2, 0.02, -3.5]} phase={0.2} walking axis="z" range={2.2} suitcase paletteIndex={0} />
      <Passenger position={[8.8, 0.02, -5.4]} phase={1.1} walking axis="x" range={2.5} phone paletteIndex={1} />
      <Passenger position={[-14.2, 0.02, 1.6]} rotation={1.2} phase={2.3} phone paletteIndex={2} />
      <Passenger position={[13.5, 0.02, 2.4]} rotation={-1.1} phase={0.8} suitcase paletteIndex={3} />
      <Passenger position={[-4.8, 0.02, 7.3]} phase={3.2} walking axis="x" range={2.1} paletteIndex={4} />
      <Passenger position={[9.3, 0.02, 7.8]} rotation={2.6} phase={2.7} phone paletteIndex={5} />
      <Passenger position={[-16.8, 0.02, -8.8]} phase={4.2} walking axis="x" range={1.8} suitcase paletteIndex={2} />
      <Passenger position={[16.2, 0.02, -9.5]} rotation={-2.4} phase={5.1} paletteIndex={1} />
    </group>
  );
}
