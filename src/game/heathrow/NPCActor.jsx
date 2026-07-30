import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, RoundedBox, Text } from '@react-three/drei';
import * as THREE from 'three';

const SKIN = ['#F2C3A0', '#D89B74', '#A96F50', '#6F4635'];
const HAIR = ['#2A211E', '#4B3328', '#171515', '#704A31'];
const TOPS = ['#49647E', '#8B5E83', '#3D7B72', '#A96548', '#5C5B91', '#315A78'];
const BOTTOMS = ['#26364D', '#3F4654', '#57483F', '#2E4B5B'];

const normalizeAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const dampAngle = (current, target, smoothing, delta) => (
  current + normalizeAngle(target - current) * (1 - Math.exp(-smoothing * delta))
);

function ActorProp({ activity, propRef }) {
  if (activity === 'phone') {
    return (
      <mesh ref={propRef} position={[0, 0.83, 0.5]} rotation={[-0.48, 0, 0]}>
        <boxGeometry args={[0.16, 0.27, 0.032]} />
        <meshStandardMaterial color="#151A22" emissive="#6FD6FF" emissiveIntensity={0.24} roughness={0.3} />
      </mesh>
    );
  }
  if (activity === 'tablet' || activity === 'scanner' || activity === 'clipboard') {
    return (
      <RoundedBox ref={propRef} args={[0.34, 0.24, 0.04]} radius={0.035} position={[0, 0.78, 0.48]} rotation={[-0.35, 0, 0]} castShadow>
        <meshStandardMaterial
          color={activity === 'clipboard' ? '#E7D4AF' : '#1C2734'}
          emissive={activity === 'clipboard' ? '#000000' : '#64CFF2'}
          emissiveIntensity={activity === 'clipboard' ? 0 : 0.25}
          roughness={0.34}
        />
      </RoundedBox>
    );
  }
  if (activity === 'tray') {
    return (
      <group ref={propRef} position={[0, 0.82, 0.52]}>
        <RoundedBox args={[0.6, 0.05, 0.34]} radius={0.04} castShadow>
          <meshStandardMaterial color="#303A46" roughness={0.35} metalness={0.46} />
        </RoundedBox>
        {[-0.18, 0.18].map((x) => (
          <mesh key={x} position={[x, 0.11, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.06, 0.15, 10]} />
            <meshStandardMaterial color="#F7F1E8" roughness={0.45} />
          </mesh>
        ))}
      </group>
    );
  }
  if (activity === 'laptop') {
    return (
      <group ref={propRef} position={[0, 0.88, 0.62]}>
        <RoundedBox args={[0.46, 0.035, 0.32]} radius={0.025} castShadow>
          <meshStandardMaterial color="#2B313A" roughness={0.34} metalness={0.48} />
        </RoundedBox>
        <RoundedBox args={[0.46, 0.3, 0.035]} radius={0.025} position={[0, 0.16, -0.14]} rotation={[-0.36, 0, 0]} castShadow>
          <meshStandardMaterial color="#303945" emissive="#83D8F6" emissiveIntensity={0.18} roughness={0.3} />
        </RoundedBox>
      </group>
    );
  }
  if (activity === 'suitcase') {
    return (
      <group ref={propRef} position={[-0.52, 0.02, 0.12]}>
        <RoundedBox args={[0.34, 0.52, 0.22]} radius={0.07} castShadow>
          <meshStandardMaterial color="#365B7B" roughness={0.48} />
        </RoundedBox>
        <mesh position={[0, 0.34, 0]}>
          <boxGeometry args={[0.17, 0.21, 0.035]} />
          <meshStandardMaterial color="#30343C" metalness={0.5} roughness={0.35} />
        </mesh>
      </group>
    );
  }
  return null;
}

function ReactionBubble({ line }) {
  if (!line) return null;
  return (
    <Billboard follow position={[0, 2.52, 0]}>
      <RoundedBox args={[2.35, 0.5, 0.11]} radius={0.14}>
        <meshStandardMaterial color="#F8FAFC" roughness={0.45} />
      </RoundedBox>
      <Text
        position={[0, 0, 0.065]}
        maxWidth={2.0}
        fontSize={0.13}
        lineHeight={1.12}
        color="#17213B"
        anchorX="center"
        anchorY="middle"
      >
        {line}
      </Text>
    </Billboard>
  );
}

export default function NPCActor({ actor, profile, playerPosition, engaged = false, children = null }) {
  const root = useRef();
  const body = useRef();
  const face = useRef();
  const eyes = useRef();
  const leftArm = useRef();
  const rightArm = useRef();
  const leftLeg = useRef();
  const rightLeg = useRef();
  const prop = useRef();
  const base = useMemo(() => ({ x: actor.position[0], y: actor.position[1], z: actor.position[2] }), [actor.position]);
  const [reactionLine, setReactionLine] = useState('');
  const wasNearRef = useRef(false);
  const reactionTimerRef = useRef(0);
  const reactionIndexRef = useRef(0);
  const palette = actor.palette ?? 0;
  const skin = SKIN[palette % SKIN.length];
  const hair = HAIR[palette % HAIR.length];
  const top = actor.role === 'staff' || actor.role === 'security' ? '#17365F' : TOPS[palette % TOPS.length];
  const bottoms = BOTTOMS[palette % BOTTOMS.length];
  const seated = actor.animation === 'seated';
  const walking = actor.animation === 'walk';
  const working = actor.animation === 'work';
  const followsPath = Boolean(actor.path) && (walking || working);
  const phase = actor.phase ?? 0;
  const complexityScale = profile.animationComplexity === 'low' ? 0.58 : profile.animationComplexity === 'high' ? 1 : 0.78;

  const playerDistance = playerPosition
    ? Math.hypot(playerPosition.x - actor.position[0], playerPosition.z - actor.position[2])
    : Infinity;

  useEffect(() => {
    const near = playerDistance < profile.awarenessRadius;
    if (
      near
      && !wasNearRef.current
      && profile.reactionsEnabled
      && actor.lines?.length
      && !engaged
    ) {
      const nextLine = actor.lines[reactionIndexRef.current % actor.lines.length];
      reactionIndexRef.current += 1;
      setReactionLine(nextLine);
      window.clearTimeout(reactionTimerRef.current);
      reactionTimerRef.current = window.setTimeout(() => setReactionLine(''), profile.reactionDurationMs);
    }
    wasNearRef.current = near;
  }, [actor.lines, engaged, playerDistance, profile.awarenessRadius, profile.reactionDurationMs, profile.reactionsEnabled]);

  useEffect(() => () => window.clearTimeout(reactionTimerRef.current), []);

  useFrame(({ clock }, delta) => {
    if (!root.current || !body.current) return;
    const time = clock.elapsedTime + phase;
    const awareness = playerPosition && playerDistance < profile.awarenessRadius;
    const interactionLook = engaged || awareness;
    const desiredWorldYaw = interactionLook
      ? Math.atan2(playerPosition.x - root.current.position.x, playerPosition.z - root.current.position.z)
      : actor.rotation ?? 0;

    if (followsPath) {
      const travel = Math.sin(time * actor.path.speed) * actor.path.range;
      if (actor.path.axis === 'x') {
        root.current.position.x = base.x + travel;
        root.current.position.z = base.z;
        body.current.rotation.y = Math.cos(time * actor.path.speed) >= 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        root.current.position.x = base.x;
        root.current.position.z = base.z + travel;
        body.current.rotation.y = Math.cos(time * actor.path.speed) >= 0 ? 0 : Math.PI;
      }
    } else {
      root.current.position.x = base.x;
      root.current.position.z = base.z;
      body.current.rotation.y = dampAngle(
        body.current.rotation.y,
        engaged ? desiredWorldYaw : actor.rotation ?? 0,
        engaged ? 5.8 : 3.0,
        delta,
      );
    }

    const stepPulse = walking ? Math.sin(time * 5.1) : 0;
    const workPulse = working ? Math.sin(time * 2.25) : 0;
    const idlePulse = Math.sin(time * 1.2);
    root.current.position.y = base.y + (
      followsPath ? Math.abs(stepPulse) * 0.018 : idlePulse * 0.01 * complexityScale
    );

    if (face.current) {
      const bodyYaw = body.current.rotation.y;
      const remaining = normalizeAngle(desiredWorldYaw - bodyYaw);
      face.current.rotation.y = dampAngle(
        face.current.rotation.y,
        interactionLook ? THREE.MathUtils.clamp(remaining, -0.52, 0.52) : Math.sin(time * 0.38) * 0.07 * complexityScale,
        interactionLook ? 7.4 : 3.2,
        delta,
      );
      face.current.rotation.x = THREE.MathUtils.damp(face.current.rotation.x, interactionLook ? -0.03 : 0, 6, delta);
    }

    if (eyes.current && profile.animationComplexity !== 'low') {
      const blinkCycle = (time + phase * 0.7) % 4.8;
      eyes.current.scale.y = THREE.MathUtils.damp(eyes.current.scale.y, blinkCycle < 0.1 ? 0.08 : 1, 26, delta);
    }

    const seatedArm = actor.activity === 'laptop' ? -0.62 : actor.activity === 'phone' ? -0.84 : -0.48;
    const leftTarget = seated ? seatedArm + (actor.activity === 'laptop' ? Math.sin(time * 7) * 0.07 * complexityScale : 0)
      : working ? -0.62 + workPulse * 0.16 * complexityScale
        : walking ? -stepPulse * 0.62
          : -0.1 + idlePulse * 0.025 * complexityScale;
    const rightTarget = seated ? seatedArm - (actor.activity === 'laptop' ? Math.sin(time * 7) * 0.07 * complexityScale : 0)
      : working ? -0.58 - workPulse * 0.14 * complexityScale
        : walking ? stepPulse * 0.62
          : -0.1 - idlePulse * 0.025 * complexityScale;

    if (leftArm.current) leftArm.current.rotation.x = THREE.MathUtils.damp(leftArm.current.rotation.x, leftTarget, 8, delta);
    if (rightArm.current) rightArm.current.rotation.x = THREE.MathUtils.damp(rightArm.current.rotation.x, rightTarget, 8, delta);
    if (leftLeg.current) leftLeg.current.rotation.x = THREE.MathUtils.damp(leftLeg.current.rotation.x, seated ? Math.PI / 2 : stepPulse * 0.38, 8, delta);
    if (rightLeg.current) rightLeg.current.rotation.x = THREE.MathUtils.damp(rightLeg.current.rotation.x, seated ? Math.PI / 2 : -stepPulse * 0.38, 8, delta);

    if (prop.current && profile.animationComplexity !== 'low') {
      if (actor.activity === 'phone') prop.current.rotation.z = Math.sin(time * 0.9) * 0.025;
      if (actor.activity === 'tablet' || actor.activity === 'scanner' || actor.activity === 'clipboard') {
        prop.current.rotation.z = Math.sin(time * 0.7) * 0.035 * complexityScale;
      }
      if (actor.activity === 'tray') prop.current.position.y = 0.82 + Math.sin(time * 1.4) * 0.012;
      if (actor.activity === 'laptop') prop.current.position.y = 0.88 + Math.sin(time * 1.2) * 0.004;
    }
  });

  return (
    <group ref={root} position={actor.position}>
      <group ref={body} rotation={[0, actor.rotation ?? 0, 0]} scale={actor.scale ?? 1.04}>
        <RoundedBox args={[0.6, seated ? 0.76 : 0.84, 0.38]} radius={0.13} position={[0, seated ? 1.06 : 0.58, 0]} castShadow>
          <meshStandardMaterial color={top} roughness={0.74} />
        </RoundedBox>

        <group ref={leftArm} position={[-0.38, seated ? 1.26 : 0.78, 0]}>
          <mesh position={[0, -0.28, 0]} castShadow>
            <capsuleGeometry args={[0.085, 0.38, 5, 8]} />
            <meshStandardMaterial color={top} roughness={0.74} />
          </mesh>
          <mesh position={[0, -0.57, 0]} castShadow>
            <sphereGeometry args={[0.095, 10, 10]} />
            <meshStandardMaterial color={skin} roughness={0.6} />
          </mesh>
        </group>
        <group ref={rightArm} position={[0.38, seated ? 1.26 : 0.78, 0]}>
          <mesh position={[0, -0.28, 0]} castShadow>
            <capsuleGeometry args={[0.085, 0.38, 5, 8]} />
            <meshStandardMaterial color={top} roughness={0.74} />
          </mesh>
          <mesh position={[0, -0.57, 0]} castShadow>
            <sphereGeometry args={[0.095, 10, 10]} />
            <meshStandardMaterial color={skin} roughness={0.6} />
          </mesh>
        </group>

        {[-0.16, 0.16].map((x, index) => (
          <group key={x} ref={index === 0 ? leftLeg : rightLeg} position={[x, seated ? 0.72 : 0.08, seated ? 0.08 : 0]}>
            <mesh position={[0, seated ? 0 : -0.31, seated ? 0.2 : 0]} castShadow>
              <capsuleGeometry args={[0.095, seated ? 0.3 : 0.44, 5, 8]} />
              <meshStandardMaterial color={bottoms} roughness={0.82} />
            </mesh>
            <RoundedBox args={[0.2, 0.1, 0.32]} radius={0.045} position={[0, seated ? -0.25 : -0.59, seated ? 0.48 : 0.07]} castShadow>
              <meshStandardMaterial color="#ECEEF2" roughness={0.58} />
            </RoundedBox>
          </group>
        ))}

        <group ref={face} position={[0, seated ? 1.45 : 1.28, 0]}>
          <RoundedBox args={[0.5, 0.52, 0.44]} radius={0.18} castShadow>
            <meshStandardMaterial color={skin} roughness={0.6} />
          </RoundedBox>
          <mesh position={[0, 0.21, -0.012]} scale={[1.04, 0.58, 1.04]} castShadow>
            <sphereGeometry args={[0.28, 14, 14]} />
            <meshStandardMaterial color={hair} roughness={0.88} />
          </mesh>
          <group ref={eyes}>
            {[-0.115, 0.115].map((x) => (
              <group key={x} position={[x, 0.03, 0.214]}>
                <mesh><sphereGeometry args={[0.06, 10, 10]} /><meshStandardMaterial color="#fff" roughness={0.28} /></mesh>
                <mesh position={[0, 0, 0.041]}><sphereGeometry args={[0.029, 8, 8]} /><meshStandardMaterial color="#211B19" roughness={0.25} /></mesh>
              </group>
            ))}
          </group>
        </group>

        <ActorProp activity={actor.activity} propRef={prop} />
        <ReactionBubble line={reactionLine} />
        {children}
      </group>
    </group>
  );
}
