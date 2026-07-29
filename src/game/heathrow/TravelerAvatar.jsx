import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';

const P = {
  jacket: '#2D466F',
  jacketDeep: '#172842',
  hoodie: '#806CFF',
  hoodieDeep: '#5C48E8',
  denim: '#31547B',
  denimDeep: '#2B4C73',
  shoe: '#F7F7FB',
  sole: '#B9BEC8',
  strap: '#7B4B2F',
  strapLight: '#9A623D',
  skin: '#F3C49B',
  hair: '#2B1A16',
  hairLight: '#5A3427',
  ink: '#2A1D18',
  mouth: '#8D4F3A',
};

/**
 * 3D version of the illustrated Smart Parrot traveler:
 * navy jacket over a purple hoodie, leather backpack straps,
 * denim jeans, white trainers and big cartoon eyes.
 */
export default function TravelerAvatar({ moving = false }) {
  const root = useRef();
  const legL = useRef();
  const legR = useRef();
  const armL = useRef();
  const armR = useRef();

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const swing = moving ? Math.sin(t * 9) * 0.6 : Math.sin(t * 1.5) * 0.05;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (armL.current) armL.current.rotation.x = -swing * 0.75;
    if (armR.current) armR.current.rotation.x = swing * 0.75;
    if (root.current) root.current.position.y = moving ? Math.abs(Math.sin(t * 9)) * 0.06 : Math.sin(t * 1.5) * 0.025;
  });

  return (
    <group ref={root}>
      {/* ---- torso: navy jacket ---- */}
      <RoundedBox args={[0.82, 0.95, 0.5]} radius={0.17} position={[0, 0.45, 0]} castShadow>
        <meshStandardMaterial color={P.jacket} roughness={0.6} />
      </RoundedBox>
      {/* jacket side panel shading */}
      <RoundedBox args={[0.2, 0.9, 0.46]} radius={0.12} position={[0.34, 0.45, 0]} castShadow>
        <meshStandardMaterial color={P.jacketDeep} roughness={0.6} />
      </RoundedBox>

      {/* purple hoodie chest panel + collar */}
      <RoundedBox args={[0.34, 0.62, 0.14]} radius={0.07} position={[0, 0.58, 0.24]} castShadow>
        <meshStandardMaterial color={P.hoodie} roughness={0.8} />
      </RoundedBox>
      <mesh position={[0, 0.9, 0.05]} rotation={[0.32, 0, 0]} castShadow>
        <torusGeometry args={[0.27, 0.08, 10, 22]} />
        <meshStandardMaterial color={P.hoodieDeep} roughness={0.82} />
      </mesh>

      {/* ---- backpack straps + pack ---- */}
      <mesh position={[-0.23, 0.6, 0.22]} rotation={[0.06, 0, 0.05]} castShadow>
        <boxGeometry args={[0.11, 0.72, 0.06]} />
        <meshStandardMaterial color={P.strapLight} roughness={0.72} />
      </mesh>
      <mesh position={[0.23, 0.6, 0.22]} rotation={[0.06, 0, -0.05]} castShadow>
        <boxGeometry args={[0.11, 0.72, 0.06]} />
        <meshStandardMaterial color={P.strapLight} roughness={0.72} />
      </mesh>
      <RoundedBox args={[0.58, 0.72, 0.28]} radius={0.13} position={[0, 0.52, -0.33]} castShadow>
        <meshStandardMaterial color={P.strap} roughness={0.74} />
      </RoundedBox>

      {/* ---- arms with skin hands ---- */}
      <group ref={armL} position={[-0.5, 0.82, 0]}>
        <mesh position={[0, -0.3, 0]} castShadow>
          <capsuleGeometry args={[0.12, 0.42, 6, 12]} />
          <meshStandardMaterial color={P.jacketDeep} roughness={0.6} />
        </mesh>
        <mesh position={[0, -0.64, 0]} castShadow>
          <sphereGeometry args={[0.14, 18, 18]} />
          <meshStandardMaterial color={P.skin} roughness={0.55} />
        </mesh>
      </group>
      <group ref={armR} position={[0.5, 0.82, 0]}>
        <mesh position={[0, -0.3, 0]} castShadow>
          <capsuleGeometry args={[0.12, 0.42, 6, 12]} />
          <meshStandardMaterial color={P.jacketDeep} roughness={0.6} />
        </mesh>
        <mesh position={[0, -0.64, 0]} castShadow>
          <sphereGeometry args={[0.14, 18, 18]} />
          <meshStandardMaterial color={P.skin} roughness={0.55} />
        </mesh>
      </group>

      {/* ---- legs ---- */}
      {[
        { ref: legL, x: -0.2, color: P.denim },
        { ref: legR, x: 0.2, color: P.denimDeep },
      ].map((leg, i) => (
        <group key={i} ref={leg.ref} position={[leg.x, 0.0, 0]}>
          <RoundedBox args={[0.28, 0.62, 0.3]} radius={0.1} position={[0, -0.32, 0]} castShadow>
            <meshStandardMaterial color={leg.color} roughness={0.88} />
          </RoundedBox>
          <RoundedBox args={[0.3, 0.16, 0.46]} radius={0.07} position={[0, -0.68, 0.08]} castShadow>
            <meshStandardMaterial color={P.shoe} roughness={0.55} />
          </RoundedBox>
          <mesh position={[0, -0.76, 0.08]} castShadow>
            <boxGeometry args={[0.31, 0.05, 0.47]} />
            <meshStandardMaterial color={P.sole} roughness={0.7} />
          </mesh>
        </group>
      ))}

      {/* ---- head ---- */}
      <group position={[0, 1.2, 0]}>
        <RoundedBox args={[0.62, 0.6, 0.56]} radius={0.22} castShadow>
          <meshStandardMaterial color={P.skin} roughness={0.55} />
        </RoundedBox>
        {/* hair cap */}
        <mesh position={[0, 0.22, -0.02]} scale={[1.06, 0.62, 1.06]} castShadow>
          <sphereGeometry args={[0.34, 22, 22]} />
          <meshStandardMaterial color={P.hair} roughness={0.85} />
        </mesh>
        <mesh position={[-0.12, 0.24, 0.16]} scale={[0.5, 0.32, 0.4]}>
          <sphereGeometry args={[0.3, 16, 16]} />
          <meshStandardMaterial color={P.hairLight} roughness={0.85} />
        </mesh>
        {/* eyes: white + pupil */}
        {[-0.14, 0.14].map((x) => (
          <group key={x} position={[x, 0.0, 0.28]}>
            <mesh>
              <sphereGeometry args={[0.095, 18, 18]} />
              <meshStandardMaterial color="#ffffff" roughness={0.3} />
            </mesh>
            <mesh position={[0, 0, 0.062]}>
              <sphereGeometry args={[0.055, 16, 16]} />
              <meshStandardMaterial color={P.ink} roughness={0.2} />
            </mesh>
          </group>
        ))}
        {/* eyebrows */}
        {[-0.14, 0.14].map((x) => (
          <mesh key={`b${x}`} position={[x, 0.15, 0.27]} rotation={[0, 0, x < 0 ? 0.16 : -0.16]}>
            <boxGeometry args={[0.15, 0.035, 0.03]} />
            <meshStandardMaterial color={P.hair} roughness={0.8} />
          </mesh>
        ))}
        {/* smile */}
        <mesh position={[0, -0.13, 0.27]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.075, 0.018, 8, 20, Math.PI]} />
          <meshStandardMaterial color={P.mouth} roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
}