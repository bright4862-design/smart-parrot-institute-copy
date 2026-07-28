import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float, RoundedBox, Text } from '@react-three/drei';
import * as THREE from 'three';
import { HelpCircle, RotateCcw, Sparkles } from 'lucide-react';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function useKeyboard(inputRef) {
  useEffect(() => {
    const map = {
      KeyW: 'forward', ArrowUp: 'forward',
      KeyS: 'backward', ArrowDown: 'backward',
      KeyA: 'left', ArrowLeft: 'left',
      KeyD: 'right', ArrowRight: 'right',
    };
    const update = (event, value) => {
      const action = map[event.code];
      if (!action) return;
      event.preventDefault();
      inputRef.current[action] = value;
    };
    const down = (event) => update(event, true);
    const up = (event) => update(event, false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [inputRef]);
}

function TerminalShell() {
  const columns = useMemo(() => Array.from({ length: 8 }, (_, index) => -21 + index * 6), []);
  return (
    <group>
      <mesh receiveShadow position={[0, -0.12, 0]}>
        <boxGeometry args={[48, 0.2, 34]} />
        <meshStandardMaterial color="#d9dde4" roughness={0.34} metalness={0.12} />
      </mesh>
      <mesh position={[0, 7.8, -15.5]} receiveShadow>
        <boxGeometry args={[48, 16, 0.45]} />
        <meshStandardMaterial color="#b7d7e7" transparent opacity={0.64} roughness={0.1} metalness={0.25} />
      </mesh>
      {columns.map((x) => (
        <mesh key={x} position={[x, 4, -14.9]} castShadow>
          <boxGeometry args={[0.45, 8, 0.45]} />
          <meshStandardMaterial color="#f7f8fa" metalness={0.6} roughness={0.24} />
        </mesh>
      ))}
      <mesh position={[0, 8.5, 0]} receiveShadow>
        <boxGeometry args={[48, 0.35, 34]} />
        <meshStandardMaterial color="#eef1f5" roughness={0.55} />
      </mesh>
      {[-14, -7, 0, 7, 14].map((x) => (
        <mesh key={x} position={[x, 8.25, 0]}>
          <boxGeometry args={[0.3, 0.3, 31]} />
          <meshStandardMaterial color="#9aa3ad" metalness={0.8} roughness={0.2} />
        </mesh>
      ))}
      <RoundedBox args={[10, 2.6, 2.2]} radius={0.25} position={[-12, 1.3, -8]} castShadow>
        <meshStandardMaterial color="#f5f1e9" roughness={0.45} />
      </RoundedBox>
      <Text position={[-12, 2.8, -6.85]} fontSize={0.72} color="#17233d" anchorX="center">ARRIVALS</Text>
      <RoundedBox args={[7.2, 3.2, 2.2]} radius={0.25} position={[12, 1.6, -7]} castShadow>
        <meshStandardMaterial color="#8f5f3f" roughness={0.5} />
      </RoundedBox>
      <Text position={[12, 3.45, -5.8]} fontSize={0.58} color="#fff7e7" anchorX="center">COFFEE</Text>
      <mesh position={[0, 0.03, 4]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.2, 16]} />
        <meshStandardMaterial color="#f5c84b" roughness={0.52} />
      </mesh>
    </group>
  );
}

function UndergroundSign({ active }) {
  return (
    <group position={[0, 3.4, 11.4]}>
      <mesh castShadow>
        <torusGeometry args={[1.45, 0.34, 20, 48]} />
        <meshStandardMaterial color={active ? '#ff4c55' : '#db2c37'} emissive={active ? '#7a0910' : '#230000'} emissiveIntensity={active ? 1.8 : 0.5} />
      </mesh>
      <mesh position={[0, 0, 0.2]} castShadow>
        <boxGeometry args={[4.2, 0.62, 0.35]} />
        <meshStandardMaterial color="#163f8f" emissive="#09245a" emissiveIntensity={active ? 1.1 : 0.35} />
      </mesh>
      <Text position={[0, 0, 0.41]} fontSize={0.42} color="white" anchorX="center" anchorY="middle">UNDERGROUND</Text>
      <mesh position={[0, -2.45, 0]} castShadow>
        <boxGeometry args={[0.35, 3.7, 0.35]} />
        <meshStandardMaterial color="#39414c" metalness={0.65} roughness={0.28} />
      </mesh>
    </group>
  );
}

function Pico({ target }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.lerp(new THREE.Vector3(target.x - 1.2, 2.15 + Math.sin(clock.elapsedTime * 3) * 0.16, target.z - 1.1), 0.045);
    ref.current.rotation.y = Math.sin(clock.elapsedTime * 1.2) * 0.15;
  });
  return (
    <group ref={ref}>
      <mesh castShadow scale={[0.72, 0.9, 0.72]}>
        <sphereGeometry args={[0.7, 24, 24]} />
        <meshStandardMaterial color="#28b67a" roughness={0.5} />
      </mesh>
      <mesh position={[0.58, 0.08, 0]} rotation={[0, 0, -0.2]} castShadow>
        <coneGeometry args={[0.34, 0.75, 18]} />
        <meshStandardMaterial color="#f3bd37" roughness={0.45} />
      </mesh>
      <mesh position={[0.22, 0.28, 0.55]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color="#121722" />
      </mesh>
      <mesh position={[-0.45, -0.1, 0]} rotation={[0, 0, 0.55]} castShadow>
        <capsuleGeometry args={[0.22, 0.8, 6, 12]} />
        <meshStandardMaterial color="#148f68" />
      </mesh>
    </group>
  );
}

function Player({ inputRef, onNearSign, resetToken }) {
  const ref = useRef();
  const velocity = useRef(new THREE.Vector3());
  const { camera } = useThree();
  const [position, setPosition] = useState({ x: 0, z: -9 });

  useEffect(() => {
    if (!ref.current) return;
    ref.current.position.set(0, 0.95, -9);
    setPosition({ x: 0, z: -9 });
  }, [resetToken]);

  useFrame((_, delta) => {
    if (!ref.current) return;
    const input = inputRef.current;
    const move = new THREE.Vector3(
      (input.right ? 1 : 0) - (input.left ? 1 : 0),
      0,
      (input.backward ? 1 : 0) - (input.forward ? 1 : 0),
    );
    if (move.lengthSq() > 0) move.normalize();
    const targetVelocity = move.multiplyScalar(5.2);
    velocity.current.lerp(targetVelocity, 1 - Math.pow(0.001, delta));
    ref.current.position.addScaledVector(velocity.current, delta);
    ref.current.position.x = clamp(ref.current.position.x, -20, 20);
    ref.current.position.z = clamp(ref.current.position.z, -13, 12);
    if (velocity.current.lengthSq() > 0.04) ref.current.rotation.y = Math.atan2(velocity.current.x, velocity.current.z);

    const current = ref.current.position;
    const near = current.distanceTo(new THREE.Vector3(0, current.y, 10.5)) < 3.4;
    onNearSign(near);
    setPosition({ x: current.x, z: current.z });

    const cameraTarget = new THREE.Vector3(current.x, 6.2, current.z + 8.5);
    camera.position.lerp(cameraTarget, 1 - Math.pow(0.002, delta));
    camera.lookAt(current.x, 1.3, current.z - 2.2);
  });

  return (
    <>
      <group ref={ref} position={[0, 0.95, -9]}>
        <mesh castShadow>
          <capsuleGeometry args={[0.48, 1.2, 8, 16]} />
          <meshStandardMaterial color="#7c5ce7" roughness={0.5} />
        </mesh>
        <mesh position={[0, 1.05, 0]} castShadow>
          <sphereGeometry args={[0.43, 24, 24]} />
          <meshStandardMaterial color="#f0bd99" roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.28, 0]} scale={[1.08, 0.55, 1.08]} castShadow>
          <sphereGeometry args={[0.45, 20, 20]} />
          <meshStandardMaterial color="#493225" roughness={0.75} />
        </mesh>
      </group>
      <Pico target={position} />
    </>
  );
}

function Scene({ inputRef, onNearSign, resetToken }) {
  const [near, setNear] = useState(false);
  const updateNear = (value) => {
    setNear(value);
    onNearSign(value);
  };
  return (
    <>
      <color attach="background" args={['#a7d7ef']} />
      <fog attach="fog" args={['#cfe6f2', 28, 62]} />
      <ambientLight intensity={1.55} />
      <directionalLight position={[-9, 16, -8]} intensity={2.8} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <hemisphereLight args={['#e7f6ff', '#b99b74', 1.1]} />
      <TerminalShell />
      <UndergroundSign active={near} />
      <Player inputRef={inputRef} onNearSign={updateNear} resetToken={resetToken} />
      <Float speed={1.4} rotationIntensity={0.08} floatIntensity={0.25}>
        <Text position={[0, 6.7, 11]} fontSize={0.58} color="#13213b" anchorX="center">Follow the yellow path</Text>
      </Float>
    </>
  );
}

function DirectionButton({ label, action, inputRef, className = '' }) {
  const set = (value) => { inputRef.current[action] = value; };
  return (
    <button
      aria-label={label}
      onPointerDown={(event) => { event.preventDefault(); set(true); }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onPointerLeave={() => set(false)}
      className={`grid h-14 w-14 select-none place-items-center rounded-2xl border border-white/40 bg-slate-950/55 text-xl font-black text-white shadow-xl backdrop-blur active:scale-95 ${className}`}
    >{label}</button>
  );
}

export default function HeathrowGreybox() {
  const inputRef = useRef({ forward: false, backward: false, left: false, right: false });
  const [nearSign, setNearSign] = useState(false);
  const [objectiveComplete, setObjectiveComplete] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  useKeyboard(inputRef);

  const restart = () => {
    inputRef.current = { forward: false, backward: false, left: false, right: false };
    setNearSign(false);
    setObjectiveComplete(false);
    setResetToken((value) => value + 1);
  };

  return (
    <main className="relative h-screen min-h-[640px] overflow-hidden bg-slate-950 text-white">
      <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 6.2, 0], fov: 48, near: 0.1, far: 120 }} gl={{ antialias: true, powerPreference: 'high-performance' }}>
        <Scene inputRef={inputRef} onNearSign={setNearSign} resetToken={resetToken} />
      </Canvas>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/25 via-transparent to-slate-950/30" />

      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4 sm:p-6">
        <div className="pointer-events-auto max-w-sm rounded-[24px] border border-white/35 bg-slate-950/68 p-4 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-2 text-xs font-black tracking-[.18em] text-amber-300"><Sparkles className="h-4 w-4" /> LONDON · A1</div>
          <h1 className="mt-1 text-xl font-black">Heathrow Terminal 5</h1>
          <p className="mt-2 text-sm font-semibold text-slate-200">{objectiveComplete ? 'Objective complete — the Underground route is unlocked.' : 'Walk through Arrivals and find the Underground sign.'}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15"><div className={`h-full rounded-full bg-amber-300 transition-all duration-500 ${objectiveComplete ? 'w-full' : nearSign ? 'w-4/5' : 'w-1/4'}`} /></div>
        </div>
        <div className="pointer-events-auto flex gap-2">
          <button className="grid h-11 w-11 place-items-center rounded-full border border-white/30 bg-slate-950/60 backdrop-blur"><HelpCircle className="h-5 w-5" /></button>
          <button onClick={restart} className="grid h-11 w-11 place-items-center rounded-full border border-white/30 bg-slate-950/60 backdrop-blur"><RotateCcw className="h-5 w-5" /></button>
        </div>
      </header>

      <div className="absolute bottom-5 left-5 grid grid-cols-3 gap-2 sm:hidden">
        <div />
        <DirectionButton label="↑" action="forward" inputRef={inputRef} />
        <div />
        <DirectionButton label="←" action="left" inputRef={inputRef} />
        <DirectionButton label="↓" action="backward" inputRef={inputRef} />
        <DirectionButton label="→" action="right" inputRef={inputRef} />
      </div>

      <div className="absolute bottom-5 right-5 max-w-[58%]">
        {nearSign ? (
          <button onClick={() => setObjectiveComplete(true)} className="rounded-full bg-amber-300 px-6 py-4 text-sm font-black text-slate-950 shadow-[0_0_32px_rgba(252,211,77,.65)] transition hover:scale-105 active:scale-95">Explore Underground</button>
        ) : (
          <div className="hidden rounded-full border border-white/30 bg-slate-950/60 px-5 py-3 text-sm font-bold text-slate-100 backdrop-blur sm:block">Move with WASD or arrow keys</div>
        )}
      </div>
    </main>
  );
}
