import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';

const P = {
  hoodie: '#806CFF',
  hoodieDeep: '#5C48E8',
  jacket: '#2D466F',
  jacketDeep: '#172842',
  denim: '#31547B',
  shoe: '#F7F7FB',
  sole: '#B9BEC8',
  leather: '#7B4B2F',
  leatherLight: '#9A623D',
  skin: '#F0BD99',
  hair: '#3A2A20',
  ink: '#182039',
  hardware: '#272B36',
};

/**
 * Stylised Smart Parrot traveler — matches the hero colour palette
 * (purple hoodie, navy jacket, denim, leather backpack).
 */
export default function TravelerAvatar({ moving = false }) {
  const legLeft = useRef();
  const legRight = useRef();
  const armLeft = useRef();
  const armRight = useRef();
  const body = useRef();

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const swing = moving ? Math.sin(t * 9) * 0.55 : Math.sin(t * 1.6) * 0.04;
    if (legLeft.current) legLeft.current.rotation.x = swing;
    if (legRight.current) legRight.current.rotation.x = -swing;
    if (armLeft.current) armLeft.current.rotation.x = -swing * 0.7;
    if (armRight.current) armRight.current.rotation.x = swing * 0.7;
    if (body.current) body.current.position.y = moving ? Math.abs(Math.sin(t * 9)) * 0.06 : Math.sin(t * 1.6) * 0.02;
  });

  return (
    <group ref={body}>
      {/* torso — hoodie */}
      <RoundedBox args={[0.78, 0.9, 0.48]} radius={0.16} position={[0, 0.42, 0]} castShadow>
        <meshStandardMaterial color={P.hoodie} roughness={0.78} />
      </RoundedBox>
      {/* open jacket panels */}
      <RoundedBox args={[0.28, 0.86, 0.2] } radius={0.08} position={[-0.36, 0.44, 0.14]} castShadow>
        <meshStandardMaterial color={P.jacket} roughness={0.58} />
      </RoundedBox>
      <RoundedBox args={[0.28, 0.86, 0.2]} radius={0.08} position={[0.36, 0.44, 0.14]} castShadow>
        <meshStandardMaterial color={P.jacketDeep} roughness={0.58} />
      </RoundedBox>

      {/* backpack */}
      <group position={[0, 0.5, -0.34]}>
        <RoundedBox args={[0.6, 0.74, 0.32]} radius={0.14} castShadow>
          <meshStandardMaterial color={P.leather} roughness={0.72} />
        </RoundedBox>
        <mesh position={[0, 0.12, -0.18]} castShadow>
          <boxGeometry args={[0.52, 0.1, 0.02]} />
          <meshStandardMaterial color={P.leatherLight} roughness={0.6} />
        </mesh>
      </group>

      {/* arms */}
      <group ref={armLeft} position={[-0.48, 0.76, 0]}>
        <mesh position={[0, -0.32, 0]} castShadow>
          <capsuleGeometry args={[0.12, 0.44, 6, 12]} />
          <meshStandardMaterial color={P.hoodieDeep} roughness={0.78} />
        </mesh>
      </group>
      <group ref={armRight} position={[0.48, 0.76, 0]}>
        <mesh position={[0, -0.32, 0]} castShadow>
          <capsuleGeometry args={[0.12, 0.44, 6, 12]} />
          <meshStandardMaterial color={P.hoodieDeep} roughness={0.78} />
        </mesh>
      </group>

      {/* legs */}
      <group ref={legLeft} position={[-0.19, -0.02, 0]}>
        <mesh position={[0, -0.34, 0]} castShadow>
          <capsuleGeometry args={[0.14, 0.5, 6, 12]} />
          <meshStandardMaterial color={P.denim} roughness={0.85} />
        </mesh>
        <RoundedBox args={[0.24, 0.14, 0.44]} radius={0.06} position={[0, -0.68, 0.08]} castShadow>
          <meshStandardMaterial color={P.shoe} roughness={0.6} />
        </RoundedBox>
        <mesh position={[0, -0.75, 0.08]} castShadow>
          <boxGeometry args={[0.25, 0.05, 0.45]} />
          <meshStandardMaterial color={P.sole} roughness={0.7} />
        </mesh>
      </group>
      <group ref={legRight} position={[0.19, -0.02, 0]}>
        <mesh position={[0, -0.34, 0]} castShadow>
          <capsuleGeometry args={[0.14, 0.5, 6, 12]} />
          <meshStandardMaterial color={P.denim} roughness={0.85} />
        </mesh>
        <RoundedBox args={[0.24, 0.14, 0.44]} radius={0.06} position={[0, -0.68, 0.08]} castShadow>
          <meshStandardMaterial color={P.shoe} roughness={0.6} />
        </RoundedBox>
        <mesh position={[0, -0.75, 0.08]} castShadow>
          <boxGeometry args={[0.25, 0.05, 0.45]} />
          <meshStandardMaterial color={P.sole} roughness={0.7} />
        </mesh>
      </group>

      {/* head */}
      <group position={[0, 1.12, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.34, 24, 24]} />
          <meshStandardMaterial color={P.skin} roughness={0.56} />
        </mesh>
        <mesh position={[0, 0.16, 0]} scale={[1.1, 0.66, 1.1]} castShadow>
          <sphereGeometry args={[0.34, 20, 20]} />
          <meshStandardMaterial color={P.hair} roughness={0.82} />
        </mesh>
        <mesh position={[-0.12, 0.02, 0.3]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshStandardMaterial color={P.ink} roughness={0.2} />
        </mesh>
        <mesh position={[0.12, 0.02, 0.3]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshStandardMaterial color={P.ink} roughness={0.2} />
        </mesh>
      </group>

      {/* hood collar */}
      <mesh position={[0, 0.86, -0.08]} rotation={[0.4, 0, 0]} castShadow>
        <torusGeometry args={[0.26, 0.09, 10, 20]} />
        <meshStandardMaterial color={P.hoodieDeep} roughness={0.8} />
      </mesh>
    </group>
  );
}