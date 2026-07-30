import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { CAFE_SEATS, CAFE_TABLE_RADIUS, CAFE_TABLES, resolveCafePopulation } from './cafePopulation';

const SKIN = ['#F2C3A0', '#D89B74', '#A96F50', '#6F4635'];
const HAIR = ['#2A211E', '#4B3328', '#171515', '#704A31'];
const TOPS = ['#49647E', '#8B5E83', '#3D7B72', '#A96548'];
const BOTTOMS = ['#26364D', '#3F4654', '#57483F', '#2E4B5B'];

const normalizeAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const dampAngle = (current, target, smoothing, delta) => (
  current + normalizeAngle(target - current) * (1 - Math.exp(-smoothing * delta))
);

function CafeFace({ skin, hair, faceRef, eyesRef }) {
  return (
    <group ref={faceRef} position={[0, 1.47, 0]}>
      <RoundedBox args={[0.5, 0.52, 0.44]} radius={0.18} castShadow>
        <meshStandardMaterial color={skin} roughness={0.6} />
      </RoundedBox>
      <mesh position={[0, 0.21, -0.012]} scale={[1.04, 0.58, 1.04]} castShadow>
        <sphereGeometry args={[0.28, 14, 14]} />
        <meshStandardMaterial color={hair} roughness={0.88} />
      </mesh>
      <group ref={eyesRef}>
        {[-0.115, 0.115].map((x) => (
          <group key={x} position={[x, 0.03, 0.214]}>
            <mesh>
              <sphereGeometry args={[0.06, 12, 12]} />
              <meshStandardMaterial color="#fff" roughness={0.28} />
            </mesh>
            <mesh position={[0, 0, 0.041]}>
              <sphereGeometry args={[0.029, 10, 10]} />
              <meshStandardMaterial color="#211B19" roughness={0.25} />
            </mesh>
          </group>
        ))}
      </group>
      <mesh position={[0, -0.135, 0.218]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[0.055, 0.011, 7, 16, Math.PI]} />
        <meshStandardMaterial color="#8D4F3A" roughness={0.65} />
      </mesh>
    </group>
  );
}

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

function ActivityProp({ activity, propRef }) {
  if (activity === 'phone') {
    return (
      <mesh ref={propRef} position={[0, 1.0, 0.5]} rotation={[-0.5, 0, 0]}>
        <boxGeometry args={[0.18, 0.3, 0.035]} />
        <meshStandardMaterial color="#151A22" emissive="#6FD6FF" emissiveIntensity={0.28} roughness={0.28} />
      </mesh>
    );
  }

  if (activity === 'drink') {
    return (
      <group ref={propRef} position={[0.22, 1.02, 0.38]} rotation={[-0.2, 0, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.1, 0.085, 0.22, 12]} />
          <meshStandardMaterial color="#F6EFE5" roughness={0.44} />
        </mesh>
        <mesh position={[0.105, 0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.055, 0.015, 6, 12, Math.PI * 1.5]} />
          <meshStandardMaterial color="#F6EFE5" roughness={0.44} />
        </mesh>
      </group>
    );
  }

  if (activity === 'laptop') {
    return (
      <group ref={propRef} position={[0, 0.98, 0.62]}>
        <RoundedBox args={[0.48, 0.035, 0.34]} radius={0.025} rotation={[0.08, 0, 0]} castShadow>
          <meshStandardMaterial color="#2B313A" roughness={0.34} metalness={0.48} />
        </RoundedBox>
        <RoundedBox args={[0.48, 0.32, 0.035]} radius={0.025} position={[0, 0.17, -0.15]} rotation={[-0.36, 0, 0]} castShadow>
          <meshStandardMaterial color="#303945" emissive="#83D8F6" emissiveIntensity={0.2} roughness={0.3} />
        </RoundedBox>
      </group>
    );
  }

  return null;
}

function SeatedTraveler({ seat, playerPosition }) {
  const root = useRef();
  const face = useRef();
  const eyes = useRef();
  const leftArm = useRef();
  const rightArm = useRef();
  const activityProp = useRef();
  const blinkOffset = useMemo(() => seat.phase * 0.77, [seat.phase]);
  const skin = SKIN[seat.palette % SKIN.length];
  const hair = HAIR[seat.palette % HAIR.length];
  const top = TOPS[seat.palette % TOPS.length];
  const bottoms = BOTTOMS[seat.palette % BOTTOMS.length];

  useFrame(({ clock }, delta) => {
    const time = clock.elapsedTime + seat.phase;
    const activityPulse = Math.sin(time * (seat.activity === 'drink' ? 0.85 : 1.8));
    const dx = playerPosition ? playerPosition.x - seat.position[0] : 0;
    const dz = playerPosition ? playerPosition.z - seat.position[2] : 0;
    const nearPlayer = Boolean(playerPosition) && Math.hypot(dx, dz) < 6.5;
    const desiredWorldYaw = nearPlayer ? Math.atan2(dx, dz) : seat.rotation;
    const localHeadYaw = normalizeAngle(desiredWorldYaw - seat.rotation);

    if (face.current) {
      face.current.rotation.y = dampAngle(
        face.current.rotation.y,
        nearPlayer ? THREE.MathUtils.clamp(localHeadYaw, -0.52, 0.52) : Math.sin(time * 0.36) * 0.08,
        nearPlayer ? 7.5 : 3.5,
        delta,
      );
      face.current.rotation.x = THREE.MathUtils.damp(face.current.rotation.x, nearPlayer ? -0.035 : 0, 6, delta);
    }

    if (eyes.current) {
      const cycle = (time + blinkOffset) % 4.8;
      eyes.current.scale.y = THREE.MathUtils.damp(eyes.current.scale.y, cycle < 0.1 ? 0.08 : 1, 26, delta);
    }

    const typing = seat.activity === 'laptop' ? Math.sin(time * 7.2) * 0.08 : 0;
    const phoneLift = seat.activity === 'phone' ? -0.88 + Math.sin(time * 1.1) * 0.035 : -0.42;
    const drinkLift = seat.activity === 'drink' ? -0.48 - Math.max(0, activityPulse) * 0.42 : -0.42;
    if (leftArm.current) {
      leftArm.current.rotation.x = THREE.MathUtils.damp(
        leftArm.current.rotation.x,
        seat.activity === 'phone' ? phoneLift : seat.activity === 'laptop' ? -0.62 + typing : drinkLift,
        8,
        delta,
      );
      leftArm.current.rotation.z = THREE.MathUtils.damp(leftArm.current.rotation.z, seat.activity === 'phone' ? -0.16 : 0.06, 8, delta);
    }
    if (rightArm.current) {
      rightArm.current.rotation.x = THREE.MathUtils.damp(
        rightArm.current.rotation.x,
        seat.activity === 'phone' ? phoneLift : seat.activity === 'laptop' ? -0.62 - typing : -0.68,
        8,
        delta,
      );
      rightArm.current.rotation.z = THREE.MathUtils.damp(rightArm.current.rotation.z, seat.activity === 'phone' ? 0.16 : -0.06, 8, delta);
    }
    if (activityProp.current) {
      if (seat.activity === 'drink') {
        activityProp.current.position.y = 1.02 + Math.max(0, activityPulse) * 0.18;
        activityProp.current.rotation.x = -0.2 + activityPulse * 0.2;
      } else if (seat.activity === 'phone') {
        activityProp.current.rotation.z = Math.sin(time * 0.9) * 0.025;
      } else if (seat.activity === 'laptop') {
        activityProp.current.position.y = 0.98 + Math.sin(time * 1.3) * 0.004;
      }
    }
    if (root.current) root.current.position.y = Math.sin(time * 1.1) * 0.008;
  });

  return (
    <group position={seat.position} rotation={[0, seat.rotation, 0]}>
      <group ref={root}>
        <RoundedBox args={[0.6, 0.78, 0.38]} radius={0.13} position={[0, 1.08, 0]} castShadow>
          <meshStandardMaterial color={top} roughness={0.74} />
        </RoundedBox>

        <group ref={leftArm} position={[-0.37, 1.28, 0.02]}>
          <mesh position={[0, -0.27, 0]} castShadow>
            <capsuleGeometry args={[0.08, 0.36, 5, 8]} />
            <meshStandardMaterial color={top} roughness={0.74} />
          </mesh>
        </group>
        <group ref={rightArm} position={[0.37, 1.28, 0.02]}>
          <mesh position={[0, -0.27, 0]} castShadow>
            <capsuleGeometry args={[0.08, 0.36, 5, 8]} />
            <meshStandardMaterial color={top} roughness={0.74} />
          </mesh>
        </group>

        {[-0.16, 0.16].map((x) => (
          <group key={x} position={[x, 0.73, 0.08]}>
            <mesh position={[0, 0, 0.2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <capsuleGeometry args={[0.09, 0.3, 5, 8]} />
              <meshStandardMaterial color={bottoms} roughness={0.82} />
            </mesh>
            <mesh position={[0, -0.25, 0.42]} castShadow>
              <capsuleGeometry args={[0.085, 0.34, 5, 8]} />
              <meshStandardMaterial color={bottoms} roughness={0.82} />
            </mesh>
            <RoundedBox args={[0.2, 0.1, 0.32]} radius={0.045} position={[0, -0.48, 0.49]} castShadow>
              <meshStandardMaterial color="#ECEEF2" roughness={0.58} />
            </RoundedBox>
          </group>
        ))}

        <CafeFace skin={skin} hair={hair} faceRef={face} eyesRef={eyes} />
        <ActivityProp activity={seat.activity} propRef={activityProp} />
      </group>
    </group>
  );
}

export default function CafePopulation({ decorationDensity = 'balanced', playerPosition }) {
  const profile = resolveCafePopulation(decorationDensity);
  const occupiedSeats = CAFE_SEATS.slice(0, profile.travelerCount);

  return (
    <group>
      {CAFE_TABLES.map((table) => <CafeTable key={table.id} position={table.position} />)}
      {CAFE_SEATS.map((seat) => <CafeChair key={`chair:${seat.id}`} position={seat.position} rotation={seat.rotation} />)}
      {occupiedSeats.map((seat) => (
        <SeatedTraveler key={seat.id} seat={seat} playerPosition={playerPosition} />
      ))}
    </group>
  );
}
