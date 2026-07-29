import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Float, RoundedBox, Text } from '@react-three/drei';
import { Select } from '@react-three/postprocessing';
import * as THREE from 'three';

export const AIRPORT_EMPLOYEE_POSITION = Object.freeze({ x: 5.8, z: 1.6 });
export const QUESTION_NPC_POSITIONS = Object.freeze({
  gate: Object.freeze({ x: -3.8, z: -2.7 }),
  restroom: Object.freeze({ x: 8.7, z: -1.1 }),
});

const SKIN_TONES = ['#F2C3A0', '#D89B74', '#A96F50', '#6F4635'];
const TOPS = ['#556B8C', '#8B5E83', '#3D7B72', '#B06C4E', '#4B5E7A', '#6F5B91'];
const BOTTOMS = ['#27364C', '#3A4655', '#57483F', '#2F4A5B'];
const HAIR = ['#564033', '#30231F', '#211915', '#704A31'];

const normalizeAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const dampAngle = (current, target, smoothing, delta) => (
  current + normalizeAngle(target - current) * (1 - Math.exp(-smoothing * delta))
);

function Face({ skin, hair, friendly = true, faceRef }) {
  return (
    <group ref={faceRef} position={[0, 1.28, 0]}>
      <RoundedBox args={[0.56, 0.55, 0.5]} radius={0.2} castShadow>
        <meshStandardMaterial color={skin} roughness={0.58} />
      </RoundedBox>

      <mesh position={[0, 0.21, -0.02]} scale={[1.04, 0.58, 1.04]} castShadow>
        <sphereGeometry args={[0.31, 18, 18]} />
        <meshStandardMaterial color={hair} roughness={0.86} />
      </mesh>

      {[-0.13, 0.13].map((x) => (
        <group key={x} position={[x, 0.02, 0.245]}>
          <mesh>
            <sphereGeometry args={[0.075, 16, 16]} />
            <meshStandardMaterial color="#FFFFFF" roughness={0.3} />
          </mesh>
          <mesh position={[0, 0, 0.052]}>
            <sphereGeometry args={[0.038, 14, 14]} />
            <meshStandardMaterial color="#2A211E" roughness={0.22} />
          </mesh>
        </group>
      ))}

      {[-0.13, 0.13].map((x) => (
        <mesh key={`b-${x}`} position={[x, 0.135, 0.24]} rotation={[0, 0, x < 0 ? 0.12 : -0.12]}>
          <boxGeometry args={[0.13, 0.028, 0.025]} />
          <meshStandardMaterial color={hair} roughness={0.8} />
        </mesh>
      ))}

      <mesh position={[0, -0.035, 0.275]}>
        <sphereGeometry args={[0.035, 12, 12]} />
        <meshStandardMaterial color={skin} roughness={0.58} />
      </mesh>

      <mesh position={[0, -0.145, 0.245]} rotation={[0, 0, friendly ? Math.PI : 0]}>
        <torusGeometry args={[0.064, 0.014, 8, 18, Math.PI]} />
        <meshStandardMaterial color="#8D4F3A" roughness={0.6} />
      </mesh>
    </group>
  );
}

function QuestionMarker({ questionId, highlighted }) {
  const copy = questionId === 'gate' ? 'GATE?' : 'RESTROOM?';
  return (
    <Float speed={1.8} floatIntensity={0.1}>
      <group position={[0, 2.45, 0]}>
        <RoundedBox args={[1.05, 0.38, 0.12]} radius={0.12} castShadow>
          <meshStandardMaterial
            color={highlighted ? '#F8D65C' : '#FFFFFF'}
            emissive={highlighted ? '#7C5C00' : '#000000'}
            emissiveIntensity={highlighted ? 0.6 : 0}
            roughness={0.35}
          />
        </RoundedBox>
        <Text position={[0, 0, 0.075]} fontSize={0.13} color="#17213B" anchorX="center" anchorY="middle">
          {copy}
        </Text>
      </group>
    </Float>
  );
}

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
  questionId = null,
  questionHighlighted = false,
  engaged = false,
  playerPosition = null,
}) {
  const root = useRef();
  const face = useRef();
  const leftLeg = useRef();
  const rightLeg = useRef();
  const leftArm = useRef();
  const rightArm = useRef();
  const base = useMemo(() => ({ x: position[0], y: position[1], z: position[2] }), [position]);
  const skin = SKIN_TONES[paletteIndex % SKIN_TONES.length];
  const top = TOPS[paletteIndex % TOPS.length];
  const bottoms = BOTTOMS[paletteIndex % BOTTOMS.length];
  const hair = HAIR[paletteIndex % HAIR.length];

  useFrame(({ clock }, delta) => {
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
    } else {
      const desiredYaw = engaged && playerPosition
        ? Math.atan2(playerPosition.x - root.current.position.x, playerPosition.z - root.current.position.z)
        : rotation;
      root.current.rotation.y = dampAngle(root.current.rotation.y, desiredYaw, engaged ? 5.6 : 3.2, delta);

      if (face.current) {
        const remainingYaw = normalizeAngle(desiredYaw - root.current.rotation.y);
        const headYaw = engaged ? THREE.MathUtils.clamp(remainingYaw * 1.45, -0.52, 0.52) : 0;
        face.current.rotation.y = dampAngle(face.current.rotation.y, headYaw, 8.5, delta);
        face.current.rotation.x = THREE.MathUtils.damp(
          face.current.rotation.x,
          engaged ? -0.025 + Math.sin(t * 1.7) * 0.018 : 0,
          7,
          delta,
        );
      }
    }
  });

  return (
    <group ref={root} position={position} rotation={[0, rotation, 0]} scale={1.14}>
      <RoundedBox args={[0.66, 0.86, 0.4]} radius={0.15} position={[0, 0.58, 0]} castShadow>
        <meshStandardMaterial color={top} roughness={0.72} />
      </RoundedBox>

      <group ref={leftArm} position={[-0.42, 0.78, 0]}>
        <mesh position={[0, -0.3, 0]} castShadow>
          <capsuleGeometry args={[0.095, 0.42, 6, 10]} />
          <meshStandardMaterial color={top} roughness={0.72} />
        </mesh>
        <mesh position={[0, -0.62, 0]} castShadow>
          <sphereGeometry args={[0.105, 14, 14]} />
          <meshStandardMaterial color={skin} roughness={0.58} />
        </mesh>
      </group>

      <group ref={rightArm} position={[0.42, 0.78, 0]}>
        <mesh position={[0, -0.3, 0]} castShadow>
          <capsuleGeometry args={[0.095, 0.42, 6, 10]} />
          <meshStandardMaterial color={top} roughness={0.72} />
        </mesh>
        <mesh position={[0, -0.62, 0]} castShadow>
          <sphereGeometry args={[0.105, 14, 14]} />
          <meshStandardMaterial color={skin} roughness={0.58} />
        </mesh>
        {phone && (
          <mesh position={[0, -0.57, -0.08]} rotation={[0.5, 0, 0]}>
            <boxGeometry args={[0.12, 0.2, 0.025]} />
            <meshStandardMaterial color="#141923" metalness={0.35} roughness={0.28} />
          </mesh>
        )}
      </group>

      <group ref={leftLeg} position={[-0.17, 0.08, 0]}>
        <mesh position={[0, -0.32, 0]} castShadow>
          <capsuleGeometry args={[0.105, 0.46, 6, 10]} />
          <meshStandardMaterial color={bottoms} roughness={0.82} />
        </mesh>
        <RoundedBox args={[0.23, 0.12, 0.36]} radius={0.05} position={[0, -0.62, 0.07]} castShadow>
          <meshStandardMaterial color="#F7F7FB" roughness={0.55} />
        </RoundedBox>
      </group>

      <group ref={rightLeg} position={[0.17, 0.08, 0]}>
        <mesh position={[0, -0.32, 0]} castShadow>
          <capsuleGeometry args={[0.105, 0.46, 6, 10]} />
          <meshStandardMaterial color={bottoms} roughness={0.82} />
        </mesh>
        <RoundedBox args={[0.23, 0.12, 0.36]} radius={0.05} position={[0, -0.62, 0.07]} castShadow>
          <meshStandardMaterial color="#F7F7FB" roughness={0.55} />
        </RoundedBox>
      </group>

      <Face skin={skin} hair={hair} faceRef={face} />

      {suitcase && (
        <group position={[-0.56, 0.04, 0.14]}>
          <RoundedBox args={[0.36, 0.54, 0.22]} radius={0.07} castShadow>
            <meshStandardMaterial color={paletteIndex % 2 ? '#B15E5E' : '#365B7B'} roughness={0.48} />
          </RoundedBox>
          <mesh position={[0, 0.36, 0]}>
            <boxGeometry args={[0.18, 0.22, 0.035]} />
            <meshStandardMaterial color="#30343C" metalness={0.5} roughness={0.35} />
          </mesh>
        </group>
      )}

      {questionId && <QuestionMarker questionId={questionId} highlighted={questionHighlighted} />}
    </group>
  );
}

function AirportEmployee({ active, engaged, playerPosition }) {
  const root = useRef();
  const facing = useRef();
  const face = useRef();
  const baseRotation = -2.45;

  useFrame(({ clock }, delta) => {
    if (root.current) root.current.position.y = Math.sin(clock.elapsedTime * 1.6) * 0.018;
    if (!facing.current) return;

    const desiredYaw = engaged && playerPosition
      ? Math.atan2(
          playerPosition.x - AIRPORT_EMPLOYEE_POSITION.x,
          playerPosition.z - AIRPORT_EMPLOYEE_POSITION.z,
        )
      : baseRotation;
    facing.current.rotation.y = dampAngle(facing.current.rotation.y, desiredYaw, engaged ? 5.8 : 3.2, delta);

    if (face.current) {
      const remainingYaw = normalizeAngle(desiredYaw - facing.current.rotation.y);
      face.current.rotation.y = dampAngle(
        face.current.rotation.y,
        engaged ? THREE.MathUtils.clamp(remainingYaw * 1.5, -0.5, 0.5) : 0,
        8.5,
        delta,
      );
      face.current.rotation.x = THREE.MathUtils.damp(
        face.current.rotation.x,
        engaged ? -0.03 + Math.sin(clock.elapsedTime * 1.55) * 0.016 : 0,
        7,
        delta,
      );
    }
  });

  return (
    <group ref={facing} position={[AIRPORT_EMPLOYEE_POSITION.x, 0.68, AIRPORT_EMPLOYEE_POSITION.z]} rotation={[0, baseRotation, 0]} scale={1.12}>
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
          <group key={x} position={[x, 0.76, 0]}>
            <mesh position={[0, -0.28, 0]} castShadow>
              <capsuleGeometry args={[0.1, 0.48, 6, 10]} />
              <meshStandardMaterial color="#17365F" roughness={0.58} />
            </mesh>
            <mesh position={[0, -0.62, 0]} castShadow>
              <sphereGeometry args={[0.105, 14, 14]} />
              <meshStandardMaterial color="#D89B74" roughness={0.58} />
            </mesh>
          </group>
        ))}

        {[-0.18, 0.18].map((x) => (
          <group key={x} position={[x, 0.08, 0]}>
            <mesh position={[0, -0.32, 0]} castShadow>
              <capsuleGeometry args={[0.11, 0.54, 6, 10]} />
              <meshStandardMaterial color="#27364C" roughness={0.8} />
            </mesh>
            <RoundedBox args={[0.24, 0.12, 0.36]} radius={0.05} position={[0, -0.64, 0.06]} castShadow>
              <meshStandardMaterial color="#1A2433" roughness={0.7} />
            </RoundedBox>
          </group>
        ))}

        <Face skin="#D89B74" hair="#2A211E" faceRef={face} />
      </group>

      {active && (
        <Float speed={2} floatIntensity={0.14}>
          <group position={[0, 2.35, 0]}>
            <Select enabled={engaged}>
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.28, 0.42, 32]} />
                <meshBasicMaterial color="#F8D65C" transparent opacity={0.88} toneMapped={false} />
              </mesh>
            </Select>
            <Text position={[0, 0.45, 0]} fontSize={0.18} color="#17213B" anchorX="center" outlineWidth={0.018} outlineColor="#FFFFFF">ASK FOR HELP</Text>
          </group>
        </Float>
      )}
    </group>
  );
}

export default function AirportNPCs({
  employeeActive = false,
  employeeEngaged = false,
  questionActiveId = null,
  playerPosition = null,
}) {
  return (
    <group>
      <AirportEmployee active={employeeActive} engaged={employeeEngaged} playerPosition={playerPosition} />

      <Passenger
        position={[QUESTION_NPC_POSITIONS.gate.x, 0.7, QUESTION_NPC_POSITIONS.gate.z]}
        rotation={Math.PI}
        phase={0.4}
        paletteIndex={0}
        suitcase
        questionId="gate"
        questionHighlighted={questionActiveId === 'gate'}
        engaged={questionActiveId === 'gate'}
        playerPosition={playerPosition}
      />
      <Passenger
        position={[QUESTION_NPC_POSITIONS.restroom.x, 0.7, QUESTION_NPC_POSITIONS.restroom.z]}
        rotation={-Math.PI / 2}
        phase={1.3}
        paletteIndex={3}
        phone
        questionId="restroom"
        questionHighlighted={questionActiveId === 'restroom'}
        engaged={questionActiveId === 'restroom'}
        playerPosition={playerPosition}
      />

      <Passenger position={[-7.2, 0.7, -3.5]} phase={0.2} walking axis="z" range={2.2} suitcase paletteIndex={2} />
      <Passenger position={[12.2, 0.7, -5.4]} phase={1.1} walking axis="x" range={1.7} phone paletteIndex={1} />
      <Passenger position={[-14.2, 0.7, 1.6]} rotation={1.2} phase={2.3} phone paletteIndex={2} />
      <Passenger position={[13.5, 0.7, 3.8]} rotation={-1.1} phase={0.8} suitcase paletteIndex={3} />
      <Passenger position={[-4.8, 0.7, 7.3]} phase={3.2} walking axis="x" range={2.1} paletteIndex={4} />
      <Passenger position={[9.3, 0.7, 7.8]} rotation={2.6} phase={2.7} phone paletteIndex={5} />
      <Passenger position={[-16.8, 0.7, -8.8]} phase={4.2} walking axis="x" range={1.8} suitcase paletteIndex={2} />
      <Passenger position={[16.2, 0.7, -9.5]} rotation={-2.4} phase={5.1} paletteIndex={1} />
    </group>
  );
}
