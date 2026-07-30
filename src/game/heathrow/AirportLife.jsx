import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Float, RoundedBox, Text } from '@react-three/drei';
import * as THREE from 'three';

const SKIN = ['#F2C3A0', '#D89B74', '#A96F50', '#6F4635'];
const HAIR = ['#2A211E', '#4B3328', '#171515', '#704A31'];
const TRAVEL_TOPS = ['#49647E', '#8B5E83', '#3D7B72', '#A96548', '#5C5B91'];
const TRAVEL_BOTTOMS = ['#26364D', '#3F4654', '#57483F', '#2E4B5B'];
const CAFE_POSITION = Object.freeze({ x: 22, z: 8.4 });

const normalizeAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const dampAngle = (current, target, smoothing, delta) => (
  current + normalizeAngle(target - current) * (1 - Math.exp(-smoothing * delta))
);

function SimpleFace({ skin, hair, faceRef }) {
  const eyes = useRef();
  const blinkOffset = useMemo(() => Math.random() * 3.5, []);

  useFrame(({ clock }, delta) => {
    if (!eyes.current) return;
    const cycle = (clock.elapsedTime + blinkOffset) % 4.6;
    const target = cycle < 0.11 ? 0.08 : 1;
    eyes.current.scale.y = THREE.MathUtils.damp(eyes.current.scale.y, target, 26, delta);
  });

  return (
    <group ref={faceRef} position={[0, 1.32, 0]}>
      <RoundedBox args={[0.52, 0.54, 0.46]} radius={0.19} castShadow>
        <meshStandardMaterial color={skin} roughness={0.6} />
      </RoundedBox>
      <mesh position={[0, 0.22, -0.015]} scale={[1.04, 0.58, 1.04]} castShadow>
        <sphereGeometry args={[0.29, 14, 14]} />
        <meshStandardMaterial color={hair} roughness={0.88} />
      </mesh>
      <group ref={eyes}>
        {[-0.12, 0.12].map((x) => (
          <group key={x} position={[x, 0.03, 0.225]}>
            <mesh>
              <sphereGeometry args={[0.064, 12, 12]} />
              <meshStandardMaterial color="#fff" roughness={0.28} />
            </mesh>
            <mesh position={[0, 0, 0.044]}>
              <sphereGeometry args={[0.031, 10, 10]} />
              <meshStandardMaterial color="#211B19" roughness={0.25} />
            </mesh>
          </group>
        ))}
      </group>
      <mesh position={[0, -0.14, 0.23]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[0.058, 0.012, 7, 16, Math.PI]} />
        <meshStandardMaterial color="#8D4F3A" roughness={0.65} />
      </mesh>
    </group>
  );
}

function CoffeeWorker({ position, rotation = Math.PI, phase = 0, role = 'barista', playerPosition }) {
  const root = useRef();
  const facing = useRef();
  const face = useRef();
  const leftArm = useRef();
  const rightArm = useRef();
  const tool = useRef();

  useFrame(({ clock }, delta) => {
    const time = clock.elapsedTime + phase;
    if (root.current) {
      root.current.position.y = Math.sin(time * 1.55) * 0.014;
      root.current.rotation.z = Math.sin(time * 0.72) * 0.012;
    }
    if (!facing.current) return;

    const dx = playerPosition ? playerPosition.x - position[0] : 0;
    const dz = playerPosition ? playerPosition.z - position[2] : 0;
    const nearPlayer = playerPosition && Math.hypot(dx, dz) < 7.5;
    const desiredYaw = nearPlayer ? Math.atan2(dx, dz) : rotation;
    facing.current.rotation.y = dampAngle(facing.current.rotation.y, desiredYaw, nearPlayer ? 4.6 : 2.5, delta);

    if (face.current) {
      const remainder = normalizeAngle(desiredYaw - facing.current.rotation.y);
      face.current.rotation.y = dampAngle(
        face.current.rotation.y,
        nearPlayer ? THREE.MathUtils.clamp(remainder * 1.35, -0.45, 0.45) : Math.sin(time * 0.42) * 0.08,
        7,
        delta,
      );
      face.current.rotation.x = THREE.MathUtils.damp(face.current.rotation.x, nearPlayer ? -0.025 : 0, 6, delta);
    }

    const workingPulse = Math.sin(time * (role === 'barista' ? 2.7 : 2.1));
    if (leftArm.current) {
      leftArm.current.rotation.x = THREE.MathUtils.damp(
        leftArm.current.rotation.x,
        role === 'barista' ? -0.72 + workingPulse * 0.18 : -0.28 + workingPulse * 0.08,
        8,
        delta,
      );
      leftArm.current.rotation.z = THREE.MathUtils.damp(leftArm.current.rotation.z, role === 'barista' ? -0.18 : 0.08, 8, delta);
    }
    if (rightArm.current) {
      rightArm.current.rotation.x = THREE.MathUtils.damp(
        rightArm.current.rotation.x,
        role === 'barista' ? -0.48 - workingPulse * 0.16 : -0.65 + workingPulse * 0.12,
        8,
        delta,
      );
      rightArm.current.rotation.z = THREE.MathUtils.damp(rightArm.current.rotation.z, role === 'barista' ? 0.22 : -0.1, 8, delta);
    }
    if (tool.current) {
      tool.current.rotation.z = role === 'barista' ? workingPulse * 0.14 : 0;
      tool.current.position.y = role === 'barista' ? 0.63 + Math.abs(workingPulse) * 0.035 : 0.68;
    }
  });

  const skin = role === 'cashier' ? SKIN[1] : role === 'runner' ? SKIN[3] : SKIN[0];
  const hair = role === 'cashier' ? HAIR[2] : role === 'runner' ? HAIR[0] : HAIR[1];
  const apron = role === 'runner' ? '#315A78' : '#3D5A4A';

  return (
    <group ref={facing} position={position} rotation={[0, rotation, 0]} scale={1.08}>
      <group ref={root}>
        <RoundedBox args={[0.68, 0.88, 0.4]} radius={0.14} position={[0, 0.61, 0]} castShadow>
          <meshStandardMaterial color="#F2E7D8" roughness={0.7} />
        </RoundedBox>
        <RoundedBox args={[0.56, 0.72, 0.045]} radius={0.08} position={[0, 0.55, 0.225]} castShadow>
          <meshStandardMaterial color={apron} roughness={0.76} />
        </RoundedBox>
        <Text position={[0, 0.63, 0.255]} fontSize={0.075} color="#FFF4D8" anchorX="center">T5 CAFÉ</Text>

        <group ref={leftArm} position={[-0.41, 0.84, 0]}>
          <mesh position={[0, -0.3, 0]} castShadow>
            <capsuleGeometry args={[0.09, 0.42, 5, 8]} />
            <meshStandardMaterial color="#F2E7D8" roughness={0.72} />
          </mesh>
          <mesh position={[0, -0.6, 0]} castShadow>
            <sphereGeometry args={[0.1, 12, 12]} />
            <meshStandardMaterial color={skin} roughness={0.6} />
          </mesh>
        </group>
        <group ref={rightArm} position={[0.41, 0.84, 0]}>
          <mesh position={[0, -0.3, 0]} castShadow>
            <capsuleGeometry args={[0.09, 0.42, 5, 8]} />
            <meshStandardMaterial color="#F2E7D8" roughness={0.72} />
          </mesh>
          <mesh position={[0, -0.6, 0]} castShadow>
            <sphereGeometry args={[0.1, 12, 12]} />
            <meshStandardMaterial color={skin} roughness={0.6} />
          </mesh>
        </group>

        {[-0.17, 0.17].map((x) => (
          <group key={x} position={[x, 0.08, 0]}>
            <mesh position={[0, -0.32, 0]} castShadow>
              <capsuleGeometry args={[0.1, 0.48, 5, 8]} />
              <meshStandardMaterial color="#2D3747" roughness={0.82} />
            </mesh>
            <RoundedBox args={[0.22, 0.11, 0.34]} radius={0.05} position={[0, -0.62, 0.06]} castShadow>
              <meshStandardMaterial color="#202632" roughness={0.7} />
            </RoundedBox>
          </group>
        ))}

        <SimpleFace skin={skin} hair={hair} faceRef={face} />

        <group ref={tool} position={[role === 'barista' ? 0.28 : -0.22, 0.66, 0.48]}>
          {role === 'barista' ? (
            <>
              <mesh castShadow>
                <cylinderGeometry args={[0.12, 0.1, 0.22, 12]} />
                <meshStandardMaterial color="#F7F1E8" roughness={0.45} />
              </mesh>
              <mesh position={[0.12, 0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.07, 0.018, 6, 12, Math.PI * 1.45]} />
                <meshStandardMaterial color="#F7F1E8" roughness={0.45} />
              </mesh>
            </>
          ) : (
            <RoundedBox args={[0.32, 0.2, 0.045]} radius={0.04} castShadow>
              <meshStandardMaterial color="#1B2734" emissive="#77D4F1" emissiveIntensity={0.35} roughness={0.3} />
            </RoundedBox>
          )}
        </group>
      </group>
    </group>
  );
}

function AmbientTraveler({ position, rotation = 0, phase = 0, axis = 'x', range = 1.5, palette = 0, moving = true }) {
  const root = useRef();
  const face = useRef();
  const leftLeg = useRef();
  const rightLeg = useRef();
  const leftArm = useRef();
  const rightArm = useRef();
  const base = useMemo(() => ({ x: position[0], y: position[1], z: position[2] }), [position]);
  const skin = SKIN[palette % SKIN.length];
  const hair = HAIR[palette % HAIR.length];
  const top = TRAVEL_TOPS[palette % TRAVEL_TOPS.length];
  const bottoms = TRAVEL_BOTTOMS[palette % TRAVEL_BOTTOMS.length];

  useFrame(({ clock }, delta) => {
    if (!root.current) return;
    const time = clock.elapsedTime + phase;
    const stride = moving ? Math.sin(time * 4.6) * 0.36 : Math.sin(time * 0.9) * 0.025;
    if (leftLeg.current) leftLeg.current.rotation.x = stride;
    if (rightLeg.current) rightLeg.current.rotation.x = -stride;
    if (leftArm.current) leftArm.current.rotation.x = -stride * 0.6;
    if (rightArm.current) rightArm.current.rotation.x = stride * 0.6;
    root.current.position.y = base.y + (moving ? Math.abs(Math.sin(time * 4.6)) * 0.03 : Math.sin(time) * 0.012);

    if (moving) {
      const travel = Math.sin(time * 0.22) * range;
      if (axis === 'x') {
        root.current.position.x = base.x + travel;
        root.current.rotation.y = Math.cos(time * 0.22) >= 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        root.current.position.z = base.z + travel;
        root.current.rotation.y = Math.cos(time * 0.22) >= 0 ? 0 : Math.PI;
      }
    } else {
      root.current.rotation.y = dampAngle(root.current.rotation.y, rotation + Math.sin(time * 0.32) * 0.08, 3, delta);
      if (face.current) face.current.rotation.y = THREE.MathUtils.damp(face.current.rotation.y, Math.sin(time * 0.52) * 0.12, 4, delta);
    }
  });

  return (
    <group ref={root} position={position} rotation={[0, rotation, 0]} scale={1.02}>
      <RoundedBox args={[0.58, 0.82, 0.36]} radius={0.13} position={[0, 0.57, 0]} castShadow>
        <meshStandardMaterial color={top} roughness={0.76} />
      </RoundedBox>
      <group ref={leftArm} position={[-0.36, 0.76, 0]}>
        <mesh position={[0, -0.3, 0]} castShadow><capsuleGeometry args={[0.08, 0.4, 5, 8]} /><meshStandardMaterial color={top} roughness={0.76} /></mesh>
      </group>
      <group ref={rightArm} position={[0.36, 0.76, 0]}>
        <mesh position={[0, -0.3, 0]} castShadow><capsuleGeometry args={[0.08, 0.4, 5, 8]} /><meshStandardMaterial color={top} roughness={0.76} /></mesh>
      </group>
      <group ref={leftLeg} position={[-0.15, 0.08, 0]}>
        <mesh position={[0, -0.31, 0]} castShadow><capsuleGeometry args={[0.095, 0.45, 5, 8]} /><meshStandardMaterial color={bottoms} roughness={0.84} /></mesh>
      </group>
      <group ref={rightLeg} position={[0.15, 0.08, 0]}>
        <mesh position={[0, -0.31, 0]} castShadow><capsuleGeometry args={[0.095, 0.45, 5, 8]} /><meshStandardMaterial color={bottoms} roughness={0.84} /></mesh>
      </group>
      <SimpleFace skin={skin} hair={hair} faceRef={face} />
    </group>
  );
}

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
  const full = decorationDensity === 'full' && !mobileRenderer;
  const reduced = decorationDensity === 'reduced';
  const ambientTravelers = reduced
    ? []
    : full
      ? [
          { position: [-20, 0.7, -5.2], phase: 0.4, axis: 'z', range: 2.1, palette: 0 },
          { position: [20, 0.7, -3.2], phase: 1.7, axis: 'x', range: 1.8, palette: 1 },
          { position: [-10.5, 0.7, 12.8], phase: 2.8, axis: 'x', range: 2.2, palette: 2 },
          { position: [11.5, 0.7, 15.5], phase: 3.9, axis: 'z', range: 1.8, palette: 3 },
          { position: [28.2, 0.7, 3.1], phase: 5.1, axis: 'z', range: 1.6, palette: 4 },
          { position: [-28, 0.7, 3.8], phase: 6.2, axis: 'x', range: 1.5, palette: 1 },
        ]
      : [
          { position: [-20, 0.7, -5.2], phase: 0.4, axis: 'z', range: 1.8, palette: 0 },
          { position: [20, 0.7, -3.2], phase: 1.7, axis: 'x', range: 1.5, palette: 1 },
        ];

  return (
    <group>
      <CoffeeWorker position={[19.2, 0.72, 9.35]} role="barista" phase={0.2} playerPosition={playerPosition} />
      <CoffeeWorker position={[23.1, 0.72, 9.35]} role="cashier" phase={1.4} playerPosition={playerPosition} />
      {full && <CoffeeWorker position={[26.2, 0.72, 9.3]} role="runner" phase={2.5} playerPosition={playerPosition} />}
      <CoffeeSteam enabled={!reduced} />

      {ambientTravelers.map((traveler) => (
        <AmbientTraveler key={`${traveler.position[0]}:${traveler.position[2]}`} {...traveler} />
      ))}

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
