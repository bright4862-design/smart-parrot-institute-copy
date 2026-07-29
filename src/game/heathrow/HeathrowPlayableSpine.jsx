import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float, RoundedBox, Text } from '@react-three/drei';
import { HelpCircle, RotateCcw, Sparkles } from 'lucide-react';
import * as THREE from 'three';
import {
  clearCheckpoint,
  HEATHROW_STEPS,
  INITIAL_MISSION_STATE,
  loadCheckpoint,
  objectiveCopy,
  reduceMission,
  saveCheckpoint,
} from './missionState';

const SPAWN = Object.freeze({ x: 0, z: -9 });
const SUITCASE = Object.freeze({ x: -10.5, z: -7.4 });
const UNDERGROUND = Object.freeze({ x: 0, z: 10.4 });
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function useInput(inputRef, interact) {
  useEffect(() => {
    const bindings = {
      KeyW: 'forward', ArrowUp: 'forward', KeyS: 'backward', ArrowDown: 'backward',
      KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    };
    const keydown = (event) => {
      const action = bindings[event.code];
      if (action) {
        event.preventDefault();
        inputRef.current[action] = true;
      }
      if (!event.repeat && (event.code === 'KeyE' || event.code === 'Space')) {
        event.preventDefault();
        interact();
      }
    };
    const keyup = (event) => {
      const action = bindings[event.code];
      if (!action) return;
      event.preventDefault();
      inputRef.current[action] = false;
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
    };
  }, [inputRef, interact]);
}

function Terminal() {
  const columns = useMemo(() => Array.from({ length: 8 }, (_, i) => -21 + i * 6), []);
  const ceilingLights = useMemo(() => Array.from({ length: 7 }, (_, i) => -18 + i * 6), []);

  return (
    <group>
      <mesh receiveShadow position={[0, -0.12, 0]}>
        <boxGeometry args={[48, 0.2, 34]} />
        <meshStandardMaterial color="#cfd5dc" roughness={0.24} metalness={0.18} />
      </mesh>

      <mesh position={[0, 7.8, -15.5]} receiveShadow>
        <boxGeometry args={[48, 16, 0.45]} />
        <meshPhysicalMaterial color="#8fc5df" transparent opacity={0.52} roughness={0.08} metalness={0.08} transmission={0.18} />
      </mesh>

      <mesh position={[0, 7.8, -15.28]}>
        <planeGeometry args={[46, 14]} />
        <meshBasicMaterial color="#b6ddf0" transparent opacity={0.18} toneMapped={false} />
      </mesh>

      {columns.map((x) => (
        <mesh key={x} position={[x, 4, -14.9]} castShadow receiveShadow>
          <boxGeometry args={[0.45, 8, 0.45]} />
          <meshStandardMaterial color="#f7f8fa" metalness={0.62} roughness={0.2} />
        </mesh>
      ))}

      <mesh position={[0, 8.5, 0]} receiveShadow>
        <boxGeometry args={[48, 0.35, 34]} />
        <meshStandardMaterial color="#e6e9ed" roughness={0.62} />
      </mesh>

      {ceilingLights.map((x) => (
        <group key={x} position={[x, 8.28, -0.5]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[3.8, 0.85]} />
            <meshBasicMaterial color="#fff4d6" toneMapped={false} />
          </mesh>
          <pointLight color="#ffe9bd" intensity={8} distance={8} decay={2.2} />
        </group>
      ))}

      <RoundedBox args={[11, 2.2, 3.2]} radius={0.45} position={[-10.5, 1.05, -8]} castShadow receiveShadow>
        <meshStandardMaterial color="#2d333d" metalness={0.72} roughness={0.28} />
      </RoundedBox>
      <Text position={[-10.5, 2.7, -6.25]} fontSize={0.62} color="#17233d" anchorX="center">BAGGAGE RECLAIM</Text>

      <RoundedBox args={[7.2, 3.2, 2.2]} radius={0.25} position={[12, 1.6, -7]} castShadow receiveShadow>
        <meshStandardMaterial color="#815036" roughness={0.42} />
      </RoundedBox>
      <Text position={[12, 3.45, -5.8]} fontSize={0.58} color="#fff7e7" anchorX="center">COFFEE</Text>

      <mesh position={[0, 0.03, 4]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[3.2, 16]} />
        <meshStandardMaterial color="#f4c847" roughness={0.4} />
      </mesh>
    </group>
  );
}

function HeathrowLighting() {
  const keyLight = useRef();

  useFrame(({ clock }) => {
    if (!keyLight.current) return;
    keyLight.current.intensity = 3.35 + Math.sin(clock.elapsedTime * 0.22) * 0.08;
  });

  return (
    <>
      <ambientLight intensity={0.38} color="#d7e9f6" />
      <hemisphereLight args={['#dff3ff', '#7d6650', 0.82]} />

      <directionalLight
        ref={keyLight}
        position={[-10, 16, -10]}
        color="#fff1d4"
        intensity={3.35}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-camera-near={1}
        shadow-camera-far={50}
        shadow-bias={-0.00018}
        shadow-normalBias={0.025}
      />

      <directionalLight position={[9, 9, 4]} color="#9ccfff" intensity={0.72} />
      <rectAreaLight position={[0, 7.8, -8]} rotation={[-Math.PI / 2.2, 0, 0]} width={28} height={8} color="#d8efff" intensity={2.3} />
      <pointLight position={[12, 4.2, -5.5]} color="#ffbd74" intensity={26} distance={12} decay={2.1} />
      <pointLight position={[-10.5, 3.6, -6.8]} color="#b5ccff" intensity={18} distance={10} decay={2.1} />
      <spotLight position={[0, 9, 9]} target-position={[0, 0, 11]} angle={0.48} penumbra={0.9} color="#ffe9a8" intensity={22} distance={24} decay={2} />
    </>
  );
}

function Suitcase({ visible, active }) {
  if (!visible) return null;
  return (
    <Float speed={active ? 2 : 1} floatIntensity={active ? 0.16 : 0.04} rotationIntensity={0.05}>
      <group position={[SUITCASE.x, 1.12, SUITCASE.z]}>
        <RoundedBox args={[1.45, 1.75, 0.7]} radius={0.18} castShadow>
          <meshStandardMaterial color="#7655d7" emissive={active ? '#2d175f' : '#000'} emissiveIntensity={active ? 0.9 : 0} roughness={0.32} />
        </RoundedBox>
        <mesh position={[0, 1.08, 0]} castShadow><torusGeometry args={[0.35, 0.08, 12, 24, Math.PI]} /><meshStandardMaterial color="#292334" metalness={0.65} /></mesh>
        <Text position={[0, 0, 0.39]} fontSize={0.22} color="white" anchorX="center">LONDON</Text>
        {active && <pointLight position={[0, 0.4, 1]} color="#a98cff" intensity={7} distance={4.5} decay={2} />}
      </group>
    </Float>
  );
}

function Underground({ active }) {
  return (
    <group position={[0, 3.4, 11.4]}>
      <mesh castShadow><torusGeometry args={[1.45, 0.34, 20, 48]} /><meshStandardMaterial color={active ? '#ff4c55' : '#db2c37'} emissive={active ? '#7a0910' : '#230000'} emissiveIntensity={active ? 1.8 : 0.5} /></mesh>
      <mesh position={[0, 0, 0.2]} castShadow><boxGeometry args={[4.2, 0.62, 0.35]} /><meshStandardMaterial color="#163f8f" emissive="#09245a" emissiveIntensity={active ? 1.1 : 0.35} /></mesh>
      <Text position={[0, 0, 0.41]} fontSize={0.42} color="white" anchorX="center">UNDERGROUND</Text>
      <mesh position={[0, -2.45, 0]} castShadow><boxGeometry args={[0.35, 3.7, 0.35]} /><meshStandardMaterial color="#39414c" metalness={0.65} /></mesh>
      {active && <pointLight position={[0, 0, 1.8]} color="#ff6c65" intensity={12} distance={7} decay={2} />}
    </group>
  );
}

function Pico({ target, visible, celebrating }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (!ref.current || !visible) return;
    ref.current.position.lerp(new THREE.Vector3(target.x - 1.2, (celebrating ? 2.7 : 2.15) + Math.sin(clock.elapsedTime * 3) * 0.16, target.z - 1.1), 0.045);
    ref.current.rotation.z = celebrating ? Math.sin(clock.elapsedTime * 6) * 0.22 : 0;
  });
  if (!visible) return null;
  return (
    <group ref={ref}>
      <mesh castShadow scale={[0.72, 0.9, 0.72]}><sphereGeometry args={[0.7, 24, 24]} /><meshStandardMaterial color="#28b67a" roughness={0.5} /></mesh>
      <mesh position={[0.58, 0.08, 0]} rotation={[0, 0, -0.2]} castShadow><coneGeometry args={[0.34, 0.75, 18]} /><meshStandardMaterial color="#f3bd37" /></mesh>
      <mesh position={[0.22, 0.28, 0.55]}><sphereGeometry args={[0.12, 16, 16]} /><meshStandardMaterial color="#121722" roughness={0.15} /></mesh>
      <mesh position={[-0.45, -0.1, 0]} rotation={[0, 0, 0.55]} castShadow><capsuleGeometry args={[0.22, 0.8, 6, 12]} /><meshStandardMaterial color="#148f68" /></mesh>
      <pointLight position={[0, 0.7, 0.6]} color="#8fffd0" intensity={2.5} distance={3.5} decay={2} />
    </group>
  );
}

function Player({ inputRef, resetToken, reportPosition }) {
  const ref = useRef();
  const velocity = useRef(new THREE.Vector3());
  const { camera } = useThree();

  useEffect(() => {
    ref.current?.position.set(SPAWN.x, 0.95, SPAWN.z);
    velocity.current.set(0, 0, 0);
  }, [resetToken]);

  useFrame((_, delta) => {
    if (!ref.current) return;
    const input = inputRef.current;
    const move = new THREE.Vector3((input.right ? 1 : 0) - (input.left ? 1 : 0), 0, (input.backward ? 1 : 0) - (input.forward ? 1 : 0));
    if (move.lengthSq()) move.normalize();
    velocity.current.lerp(move.multiplyScalar(5.2), 1 - Math.pow(0.001, delta));
    ref.current.position.addScaledVector(velocity.current, delta);
    ref.current.position.x = clamp(ref.current.position.x, -20, 20);
    ref.current.position.z = clamp(ref.current.position.z, -13, 12);
    if (velocity.current.lengthSq() > 0.04) ref.current.rotation.y = Math.atan2(velocity.current.x, velocity.current.z);
    reportPosition(ref.current.position.x, ref.current.position.z);
    camera.position.lerp(new THREE.Vector3(ref.current.position.x, 6.2, ref.current.position.z + 8.5), 1 - Math.pow(0.002, delta));
    camera.lookAt(ref.current.position.x, 1.3, ref.current.position.z - 2.2);
  });

  return (
    <group ref={ref} position={[SPAWN.x, 0.95, SPAWN.z]}>
      <mesh castShadow><capsuleGeometry args={[0.48, 1.2, 8, 16]} /><meshStandardMaterial color="#7c5ce7" roughness={0.42} /></mesh>
      <mesh position={[0, 1.05, 0]} castShadow><sphereGeometry args={[0.43, 24, 24]} /><meshStandardMaterial color="#f0bd99" roughness={0.54} /></mesh>
      <mesh position={[0, 1.28, 0]} scale={[1.08, 0.55, 1.08]} castShadow><sphereGeometry args={[0.45, 20, 20]} /><meshStandardMaterial color="#493225" roughness={0.7} /></mesh>
    </group>
  );
}

function World({ inputRef, mission, resetToken, reportPosition, playerPosition, activeTarget }) {
  return (
    <>
      <color attach="background" args={['#8dbbd2']} />
      <fog attach="fog" args={['#bfd5df', 24, 58]} />
      <HeathrowLighting />
      <Terminal />
      <Suitcase visible={!mission.suitcaseCollected} active={activeTarget === 'suitcase'} />
      <Underground active={activeTarget === 'underground'} />
      <Player inputRef={inputRef} resetToken={resetToken} reportPosition={reportPosition} />
      <Pico target={playerPosition} visible={mission.suitcaseCollected} celebrating={mission.step === HEATHROW_STEPS.COMPLETE} />
      {mission.step === HEATHROW_STEPS.FIND_UNDERGROUND && <Float speed={1.4} floatIntensity={0.25}><Text position={[0, 6.7, 11]} fontSize={0.58} color="#13213b" anchorX="center">Follow the yellow path</Text></Float>}
    </>
  );
}

function DirectionButton({ label, action, inputRef }) {
  const set = (value) => { inputRef.current[action] = value; };
  return <button aria-label={label} onPointerDown={(e) => { e.preventDefault(); set(true); }} onPointerUp={() => set(false)} onPointerCancel={() => set(false)} onPointerLeave={() => set(false)} className="grid h-14 w-14 select-none place-items-center rounded-2xl border border-white/40 bg-slate-950/55 text-xl font-black text-white shadow-xl backdrop-blur active:scale-95">{label}</button>;
}

export default function HeathrowPlayableSpine() {
  const inputRef = useRef({ forward: false, backward: false, left: false, right: false });
  const positionRef = useRef({ ...SPAWN });
  const [playerPosition, setPlayerPosition] = useState({ ...SPAWN });
  const [mission, dispatch] = useReducer(reduceMission, INITIAL_MISSION_STATE, loadCheckpoint);
  const [resetToken, setResetToken] = useState(0);
  const [picoLine, setPicoLine] = useState('');

  const reportPosition = useCallback((x, z) => {
    positionRef.current.x = x;
    positionRef.current.z = z;
    setPlayerPosition((current) => (Math.abs(current.x - x) > 0.08 || Math.abs(current.z - z) > 0.08 ? { x, z } : current));
  }, []);

  const nearSuitcase = distance(playerPosition, SUITCASE) < 2.4;
  const nearUnderground = distance(playerPosition, UNDERGROUND) < 3.4;
  const activeTarget = mission.step === HEATHROW_STEPS.COLLECT_SUITCASE && nearSuitcase ? 'suitcase' : mission.step === HEATHROW_STEPS.FIND_UNDERGROUND && nearUnderground ? 'underground' : null;

  const interact = useCallback(() => {
    const position = positionRef.current;
    if (mission.step === HEATHROW_STEPS.COLLECT_SUITCASE && distance(position, SUITCASE) < 2.4) {
      dispatch({ type: 'COLLECT_SUITCASE' });
      setPicoLine('Pico: “There you are! Ready for London?”');
    } else if (mission.step === HEATHROW_STEPS.MEET_PICO) {
      dispatch({ type: 'MEET_PICO' });
      setPicoLine('Pico: “Underground. Follow the yellow path!”');
    } else if (mission.step === HEATHROW_STEPS.FIND_UNDERGROUND && distance(position, UNDERGROUND) < 3.4) {
      dispatch({ type: 'FIND_UNDERGROUND' });
      setPicoLine('Pico: “You found it. London is waiting.”');
    }
  }, [mission.step]);

  useInput(inputRef, interact);
  useEffect(() => saveCheckpoint(mission), [mission]);

  const restart = () => {
    clearCheckpoint();
    inputRef.current = { forward: false, backward: false, left: false, right: false };
    positionRef.current = { ...SPAWN };
    setPlayerPosition({ ...SPAWN });
    setPicoLine('');
    dispatch({ type: 'RESET' });
    setResetToken((value) => value + 1);
  };

  const progress = { collect_suitcase: 'w-1/4', meet_pico: 'w-2/4', find_underground: 'w-3/4', complete: 'w-full' }[mission.step];
  const canInteract = activeTarget || mission.step === HEATHROW_STEPS.MEET_PICO;
  const label = mission.step === HEATHROW_STEPS.COLLECT_SUITCASE ? 'Collect suitcase' : mission.step === HEATHROW_STEPS.MEET_PICO ? 'Say hello to Pico' : 'Enter Underground';

  return (
    <main className="relative h-screen min-h-[640px] overflow-hidden bg-slate-950 text-white">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [0, 6.2, 0], fov: 48, near: 0.1, far: 120 }}
        gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.08 }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
      >
        <World inputRef={inputRef} mission={mission} resetToken={resetToken} reportPosition={reportPosition} playerPosition={playerPosition} activeTarget={activeTarget} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/20 via-transparent to-slate-950/35" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_120px_rgba(15,23,42,.22)]" />
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4 sm:p-6">
        <div className="pointer-events-auto max-w-sm rounded-[24px] border border-white/35 bg-slate-950/68 p-4 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-2 text-xs font-black tracking-[.18em] text-amber-300"><Sparkles className="h-4 w-4" /> LONDON · A1</div>
          <h1 className="mt-1 text-xl font-black">Heathrow Terminal 5</h1>
          <p className="mt-2 text-sm font-semibold text-slate-200">{objectiveCopy(mission.step)}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15"><div className={`h-full rounded-full bg-amber-300 transition-all duration-500 ${progress}`} /></div>
        </div>
        <div className="pointer-events-auto flex gap-2">
          <button aria-label="Show help" onClick={() => setPicoLine('Pico: “Look for the softly glowing object.”')} className="grid h-11 w-11 place-items-center rounded-full border border-white/30 bg-slate-950/60 backdrop-blur"><HelpCircle className="h-5 w-5" /></button>
          <button aria-label="Restart mission" onClick={restart} className="grid h-11 w-11 place-items-center rounded-full border border-white/30 bg-slate-950/60 backdrop-blur"><RotateCcw className="h-5 w-5" /></button>
        </div>
      </header>
      {picoLine && <div className="pointer-events-none absolute left-1/2 top-32 w-[min(88vw,420px)] -translate-x-1/2 rounded-2xl border border-white/30 bg-slate-950/72 px-5 py-3 text-center text-sm font-bold shadow-2xl backdrop-blur-xl">{picoLine}</div>}
      <div className="absolute bottom-5 left-5 grid grid-cols-3 gap-2 sm:hidden"><div /><DirectionButton label="↑" action="forward" inputRef={inputRef} /><div /><DirectionButton label="←" action="left" inputRef={inputRef} /><DirectionButton label="↓" action="backward" inputRef={inputRef} /><DirectionButton label="→" action="right" inputRef={inputRef} /></div>
      <div className="absolute bottom-5 right-5 max-w-[58%]">
        {canInteract ? <button onClick={interact} className="rounded-full bg-amber-300 px-6 py-4 text-sm font-black text-slate-950 shadow-[0_0_32px_rgba(252,211,77,.65)] active:scale-95">{label}<span className="ml-2 hidden opacity-70 sm:inline">E</span></button> : mission.step === HEATHROW_STEPS.COMPLETE ? <div className="rounded-full border border-emerald-300/40 bg-emerald-950/70 px-5 py-3 text-sm font-black text-emerald-100 backdrop-blur">Checkpoint saved ✓</div> : <div className="hidden rounded-full border border-white/30 bg-slate-950/60 px-5 py-3 text-sm font-bold backdrop-blur sm:block">Move with WASD or arrow keys</div>}
      </div>
    </main>
  );
}
