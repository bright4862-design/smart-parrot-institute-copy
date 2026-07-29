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
import TravelerAvatar from './TravelerAvatar';
import AirportNPCs, { AIRPORT_EMPLOYEE_POSITION } from './AirportNPCs';

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
        <meshStandardMaterial color="#cfd5dc" roughness={0.2} metalness={0.2} />
      </mesh>

      <mesh position={[0, 7.8, -15.5]} receiveShadow>
        <boxGeometry args={[48, 16, 0.45]} />
        <meshPhysicalMaterial color="#789fba" transparent opacity={0.48} roughness={0.12} metalness={0.08} transmission={0.18} />
      </mesh>

      <mesh position={[0, 7.8, -15.28]}>
        <planeGeometry args={[46, 14]} />
        <meshBasicMaterial color="#a8c8d8" transparent opacity={0.13} toneMapped={false} />
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

function RainyWindowAtmosphere() {
  const rainRef = useRef();
  const runwayGlowRef = useRef();
  const shadowRef = useRef();
  const aircraftRef = useRef();

  const drops = useMemo(() => Array.from({ length: 72 }, (_, index) => ({
    x: -22 + ((index * 7.13) % 44),
    y: 1 + ((index * 3.71) % 13),
    length: 0.25 + ((index * 0.17) % 0.75),
    speed: 0.35 + ((index * 0.11) % 0.8),
  })), []);

  const runwayLights = useMemo(() => Array.from({ length: 18 }, (_, index) => ({
    x: -21 + index * 2.5,
    color: index % 5 === 0 ? '#ff8b55' : index % 2 === 0 ? '#8fd3ff' : '#fff0a8',
  })), []);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    if (rainRef.current) {
      rainRef.current.children.forEach((drop, index) => {
        const data = drops[index];
        drop.position.y = 1 + ((data.y - time * data.speed + 26) % 13);
      });
    }
    if (aircraftRef.current) {
      aircraftRef.current.position.x = -25 + ((time * 2.15) % 50);
      aircraftRef.current.position.y = 2.2 + Math.sin(time * 0.34) * 0.18;
    }
    if (runwayGlowRef.current) {
      runwayGlowRef.current.position.x = -19 + ((time * 3.1) % 38);
      runwayGlowRef.current.material.opacity = 0.2 + Math.sin(time * 1.7) * 0.05;
    }
    if (shadowRef.current) {
      shadowRef.current.position.x = -18 + ((time * 1.45) % 36);
      shadowRef.current.rotation.z = -0.16 + Math.sin(time * 0.3) * 0.035;
      shadowRef.current.material.opacity = 0.035 + Math.sin(time * 0.55) * 0.012;
    }
  });

  return (
    <group>
      <group ref={rainRef} position={[0, 0, -15.03]}>
        {drops.map((drop, index) => (
          <mesh key={index} position={[drop.x, drop.y, 0]} rotation={[0, 0, -0.08]}>
            <planeGeometry args={[0.025, drop.length]} />
            <meshBasicMaterial color="#d8f1ff" transparent opacity={0.32} depthWrite={false} toneMapped={false} />
          </mesh>
        ))}
      </group>

      <group position={[0, 0, -16.2]}>
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[54, 12]} />
          <meshStandardMaterial color="#344552" roughness={0.22} metalness={0.28} />
        </mesh>
        {runwayLights.map((light, index) => (
          <mesh key={index} position={[light.x, 0.07, 0.6 + (index % 3) * 1.15]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.09, 12]} />
            <meshBasicMaterial color={light.color} toneMapped={false} />
          </mesh>
        ))}
        <mesh ref={aircraftRef} position={[-22, 2.2, -1]}>
          <boxGeometry args={[4.4, 0.32, 0.7]} />
          <meshStandardMaterial color="#dbe4ea" roughness={0.36} metalness={0.52} />
          <mesh position={[0, 0.12, 0]} rotation={[0, 0, -0.03]}>
            <boxGeometry args={[1.2, 0.08, 5]} />
            <meshStandardMaterial color="#ccd7de" roughness={0.38} metalness={0.46} />
          </mesh>
          <pointLight position={[-2.2, 0, 0]} color="#ff665a" intensity={18} distance={7} decay={2} />
          <pointLight position={[2.2, 0, 0]} color="#72dcff" intensity={18} distance={7} decay={2} />
        </mesh>
      </group>

      <mesh ref={runwayGlowRef} position={[-19, 0.015, -7]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7, 1.1]} />
        <meshBasicMaterial color="#86cfff" transparent opacity={0.2} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>

      <mesh ref={shadowRef} position={[-18, 0.022, -1]} rotation={[-Math.PI / 2, 0, -0.16]}>
        <planeGeometry args={[13, 3.2]} />
        <meshBasicMaterial color="#102132" transparent opacity={0.04} depthWrite={false} />
      </mesh>
    </group>
  );
}

function UndergroundSpot() {
  const light = useRef();
  const target = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    target.position.set(0, 0, 11);
    if (light.current) light.current.target = target;
  }, [target]);

  return (
    <>
      <primitive object={target} />
      <spotLight ref={light} position={[0, 9, 9]} angle={0.48} penumbra={0.9} color="#ffe9a8" intensity={22} distance={24} decay={2} />
    </>
  );
}

function HeathrowLighting() {
  const keyLight = useRef();
  const movingLight = useRef();

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    if (keyLight.current) keyLight.current.intensity = 3.05 + Math.sin(time * 0.22) * 0.08;
    if (movingLight.current) {
      movingLight.current.position.x = -18 + ((time * 1.7) % 36);
      movingLight.current.intensity = 5.5 + Math.sin(time * 1.25) * 0.7;
    }
  });

  return (
    <>
      <ambientLight intensity={0.32} color="#cfdfeb" />
      <hemisphereLight args={['#d8edfa', '#675c52', 0.72]} />
      <directionalLight
        ref={keyLight}
        position={[-10, 16, -10]}
        color="#f7e8d3"
        intensity={3.05}
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
      <directionalLight position={[9, 9, 4]} color="#86b9e8" intensity={0.62} />
      <rectAreaLight position={[0, 7.8, -8]} rotation={[-Math.PI / 2.2, 0, 0]} width={28} height={8} color="#cce8f6" intensity={1.9} />
      <pointLight position={[12, 4.2, -5.5]} color="#ffbd74" intensity={26} distance={12} decay={2.1} />
      <pointLight position={[-10.5, 3.6, -6.8]} color="#b5ccff" intensity={18} distance={10} decay={2.1} />
      <UndergroundSpot />
      <pointLight ref={movingLight} position={[-18, 1.2, -10]} color="#91d7ff" intensity={5.5} distance={10} decay={2} />
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
    ref.current.position.lerp(new THREE.Vector3(target.x - 0.9, (celebrating ? 2.25 : 1.9) + Math.sin(clock.elapsedTime * 3) * 0.11, target.z - 0.8), 0.055);
    ref.current.rotation.z = celebrating ? Math.sin(clock.elapsedTime * 6) * 0.22 : 0;
  });
  if (!visible) return null;
  return (
    <group ref={ref} scale={0.48}>
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
  const [moving, setMoving] = useState(false);
  const { camera, size } = useThree();

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
    const isMoving = velocity.current.lengthSq() > 0.35;
    if (isMoving) ref.current.rotation.y = Math.atan2(velocity.current.x, velocity.current.z);
    setMoving((current) => (current === isMoving ? current : isMoving));
    reportPosition(ref.current.position.x, ref.current.position.z);
    const mobile = size.width < 640;
    const cameraHeight = mobile ? 7.15 : 6.4;
    const cameraDistance = mobile ? 11.8 : 9.8;
    camera.position.lerp(new THREE.Vector3(ref.current.position.x, cameraHeight, ref.current.position.z + cameraDistance), 1 - Math.pow(0.002, delta));
    camera.lookAt(ref.current.position.x, 1.15, ref.current.position.z - 1.8);
  });

  return (
    <group ref={ref} position={[SPAWN.x, 0.95, SPAWN.z]}>
      <TravelerAvatar moving={moving} />
    </group>
  );
}

function World({ inputRef, mission, resetToken, reportPosition, playerPosition, activeTarget }) {
  return (
    <>
      <color attach="background" args={['#718fa3']} />
      <fog attach="fog" args={['#aebfc9', 22, 56]} />
      <HeathrowLighting />
      <RainyWindowAtmosphere />
      <Terminal />
      <AirportNPCs employeeActive={mission.step === HEATHROW_STEPS.ASK_EMPLOYEE} />
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
  return <button aria-label={label} onPointerDown={(e) => { e.preventDefault(); set(true); }} onPointerUp={() => set(false)} onPointerCancel={() => set(false)} onPointerLeave={() => set(false)} className="grid h-[52px] w-[52px] select-none place-items-center rounded-2xl border border-white/40 bg-slate-950/62 text-lg font-black text-white shadow-xl backdrop-blur active:scale-95">{label}</button>;
}

export default function HeathrowPlayableSpine() {
  const inputRef = useRef({ forward: false, backward: false, left: false, right: false });
  const positionRef = useRef({ ...SPAWN });
  const [playerPosition, setPlayerPosition] = useState({ ...SPAWN });
  const [mission, dispatch] = useReducer(reduceMission, INITIAL_MISSION_STATE, loadCheckpoint);
  const [resetToken, setResetToken] = useState(0);
  const [picoLine, setPicoLine] = useState('');
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizFeedback, setQuizFeedback] = useState('');

  const reportPosition = useCallback((x, z) => {
    positionRef.current.x = x;
    positionRef.current.z = z;
    setPlayerPosition((current) => (Math.abs(current.x - x) > 0.08 || Math.abs(current.z - z) > 0.08 ? { x, z } : current));
  }, []);

  const nearSuitcase = distance(playerPosition, SUITCASE) < 2.8;
  const nearEmployee = distance(playerPosition, AIRPORT_EMPLOYEE_POSITION) < 3.2;
  const nearUnderground = distance(playerPosition, UNDERGROUND) < 3.8;
  const activeTarget = mission.step === HEATHROW_STEPS.COLLECT_SUITCASE && nearSuitcase
    ? 'suitcase'
    : mission.step === HEATHROW_STEPS.ASK_EMPLOYEE && nearEmployee
      ? 'employee'
      : mission.step === HEATHROW_STEPS.FIND_UNDERGROUND && nearUnderground
        ? 'underground'
        : null;

  const interact = useCallback(() => {
    const position = positionRef.current;
    if (mission.step === HEATHROW_STEPS.COLLECT_SUITCASE && distance(position, SUITCASE) < 2.4) {
      dispatch({ type: 'COLLECT_SUITCASE' });
      setPicoLine('Pico: “There you are! Ready for London?”');
    } else if (mission.step === HEATHROW_STEPS.MEET_PICO) {
      dispatch({ type: 'MEET_PICO' });
      setPicoLine('Pico: “I know the way. Mostly. Let’s ask the human in the smart jacket.”');
    } else if (mission.step === HEATHROW_STEPS.ASK_EMPLOYEE && distance(position, AIRPORT_EMPLOYEE_POSITION) < 3.2) {
      inputRef.current = { forward: false, backward: false, left: false, right: false };
      setQuizFeedback('');
      setQuizOpen(true);
    } else if (mission.step === HEATHROW_STEPS.FIND_UNDERGROUND && distance(position, UNDERGROUND) < 3.8) {
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
    setQuizOpen(false);
    setQuizFeedback('');
    dispatch({ type: 'RESET' });
    setResetToken((value) => value + 1);
  };

  const progress = {
    collect_suitcase: 'w-1/5',
    meet_pico: 'w-2/5',
    ask_employee: 'w-3/5',
    find_underground: 'w-4/5',
    complete: 'w-full',
  }[mission.step];
  const canInteract = activeTarget || mission.step === HEATHROW_STEPS.MEET_PICO;
  const label = mission.step === HEATHROW_STEPS.COLLECT_SUITCASE
    ? 'Collect suitcase'
    : mission.step === HEATHROW_STEPS.MEET_PICO
      ? 'Say hello to Pico'
      : mission.step === HEATHROW_STEPS.ASK_EMPLOYEE
        ? 'Ask airport staff'
        : 'Enter Underground';

  return (
    <main className="relative h-[100dvh] min-h-[560px] overflow-hidden bg-slate-950 text-white [touch-action:none]">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [0, 7.15, 2.8], fov: 52, near: 0.1, far: 120 }}
        gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.02 }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
      >
        <World inputRef={inputRef} mission={mission} resetToken={resetToken} reportPosition={reportPosition} playerPosition={playerPosition} activeTarget={activeTarget} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/28 via-transparent to-slate-950/42" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_140px_rgba(15,23,42,.3)]" />
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:gap-3 sm:p-6">
        <div className="pointer-events-auto w-[calc(100%_-_6rem)] max-w-sm rounded-[20px] border border-white/35 bg-slate-950/72 p-3 shadow-2xl backdrop-blur-xl sm:w-auto sm:rounded-[24px] sm:p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-black tracking-[.16em] text-amber-300 sm:text-xs"><Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> LONDON · A1</div>
          <h1 className="mt-0.5 text-base font-black sm:mt-1 sm:text-xl">Heathrow Terminal 5</h1>
          <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-200 sm:mt-2 sm:text-sm">{objectiveCopy(mission.step)}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15 sm:mt-3 sm:h-2"><div className={`h-full rounded-full bg-amber-300 transition-all duration-500 ${progress}`} /></div>
        </div>
        <div className="pointer-events-auto flex gap-2">
          <button aria-label="Show help" onClick={() => setPicoLine('Pico: “Look for the softly glowing object.”')} className="grid h-10 w-10 place-items-center rounded-full border border-white/30 bg-slate-950/65 backdrop-blur sm:h-11 sm:w-11"><HelpCircle className="h-[18px] w-[18px] sm:h-5 sm:w-5" /></button>
          <button aria-label="Restart mission" onClick={restart} className="grid h-10 w-10 place-items-center rounded-full border border-white/30 bg-slate-950/65 backdrop-blur sm:h-11 sm:w-11"><RotateCcw className="h-[18px] w-[18px] sm:h-5 sm:w-5" /></button>
        </div>
      </header>
      {picoLine && <div className="pointer-events-none absolute left-1/2 top-[7.5rem] z-20 w-[min(86vw,420px)] -translate-x-1/2 rounded-2xl border border-white/30 bg-slate-950/78 px-4 py-2.5 text-center text-xs font-bold shadow-2xl backdrop-blur-xl sm:top-32 sm:px-5 sm:py-3 sm:text-sm">{picoLine}</div>}

      {quizOpen && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[28px] border border-white/25 bg-white p-5 text-slate-900 shadow-2xl sm:p-7">
            <div className="text-xs font-black tracking-[.18em] text-violet-600">FIRST ENGLISH MOMENT</div>
            <h2 className="mt-2 text-2xl font-black tracking-tight">What should you say?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Choose the polite sentence to ask the airport employee for directions.</p>
            <div className="mt-5 grid gap-3">
              {[
                'Excuse me, where is the Underground?',
                'You take me Underground now.',
                'Underground is where?',
              ].map((answer, index) => (
                <button
                  key={answer}
                  type="button"
                  onClick={() => {
                    if (index === 0) {
                      dispatch({ type: 'ANSWER_PHRASE' });
                      setQuizFeedback('Perfect! The employee points you toward the yellow route.');
                      setPicoLine('Pico: “Excellent manners. I was going to say: train, please!”');
                      window.setTimeout(() => setQuizOpen(false), 850);
                    } else {
                      setQuizFeedback('Almost — choose the polite complete sentence beginning with “Excuse me”.');
                    }
                  }}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-bold transition hover:border-violet-300 hover:bg-violet-50 active:scale-[0.99]"
                >
                  {answer}
                </button>
              ))}
            </div>
            {quizFeedback && <p className="mt-4 rounded-2xl bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800">{quizFeedback}</p>}
            <button type="button" onClick={() => setQuizOpen(false)} className="mt-4 text-sm font-bold text-slate-500">Close</button>
          </div>
        </div>
      )}

      <div className="absolute bottom-[calc(env(safe-area-inset-bottom)_+_7.5rem)] left-4 z-20 grid grid-cols-3 gap-1.5 sm:hidden"><div /><DirectionButton label="↑" action="forward" inputRef={inputRef} /><div /><DirectionButton label="←" action="left" inputRef={inputRef} /><DirectionButton label="↓" action="backward" inputRef={inputRef} /><DirectionButton label="→" action="right" inputRef={inputRef} /></div>
      <div className="absolute bottom-[calc(env(safe-area-inset-bottom)_+_7.5rem)] right-4 z-20 max-w-[52%] sm:bottom-5 sm:right-5 sm:max-w-[58%]">
        {canInteract ? <button onClick={interact} className="min-h-12 rounded-full bg-amber-300 px-4 py-3 text-xs font-black leading-tight text-slate-950 shadow-[0_0_32px_rgba(252,211,77,.65)] active:scale-95 sm:px-6 sm:py-4 sm:text-sm">{label}<span className="ml-2 hidden opacity-70 sm:inline">E</span></button> : mission.step === HEATHROW_STEPS.COMPLETE ? <div className="rounded-full border border-emerald-300/40 bg-emerald-950/70 px-5 py-3 text-sm font-black text-emerald-100 backdrop-blur">Checkpoint saved ✓</div> : <div className="hidden rounded-full border border-white/30 bg-slate-950/60 px-5 py-3 text-sm font-bold backdrop-blur sm:block">Move with WASD or arrow keys</div>}
      </div>
    </main>
  );
}