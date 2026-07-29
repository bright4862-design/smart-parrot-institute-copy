import '@/game/r3fSafeDataProps';
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Float, Lightformer, RoundedBox, Text } from '@react-three/drei';
import { Bloom, EffectComposer, Select, Selection } from '@react-three/postprocessing';
import { HelpCircle, RotateCcw, Sparkles } from 'lucide-react';
import * as THREE from 'three';
import {
  clearCheckpoint,
  HEATHROW_SEQUENCE,
  HEATHROW_STEPS,
  INITIAL_MISSION_STATE,
  loadCheckpoint,
  objectiveCopy,
  reduceMission,
  saveCheckpoint,
} from './missionState';
import TravelerAvatar from './TravelerAvatar';
import AirportNPCs, { AIRPORT_EMPLOYEE_POSITION, QUESTION_NPC_POSITIONS } from './AirportNPCs';
import AirportSigns, { AIRPORT_SIGNS, findNearbyAirportSign, getAirportSign } from './AirportSigns';
import TerminalExpansion from './TerminalExpansion';

const SPAWN = Object.freeze({ x: 0, z: -9 });
const SUITCASE = Object.freeze({ x: -10.5, z: -7.4 });
const UNDERGROUND = Object.freeze({ x: 0, z: 19.2 });
const SUITCASE_INTERACT_RADIUS = 2.35;
const SUITCASE_GLOW_RADIUS = 8;
const SUITCASE_HOLD_MS = 1050;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const normalizeAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const dampAngle = (current, target, smoothing, delta) => (
  current + normalizeAngle(target - current) * (1 - Math.exp(-smoothing * delta))
);
const TRAVELER_QUESTIONS = Object.freeze({
  gate: Object.freeze({
    eyebrow: 'GATE A12 · TRAVELLER',
    title: '“Excuse me — is this Gate A12?”',
    prompt: 'Use the blue gate sign to choose a helpful reply.',
    answers: Object.freeze([
      'Yes, this is Gate A12.',
      'No, this is baggage reclaim.',
      'The restrooms are over there.',
    ]),
    correctIndex: 0,
    completionEvent: 'HELP_GATE_TRAVELER',
    success: '“Thank you! I’m in the right place.”',
    retry: 'Look at the blue gate sign. Read the letter and number together.',
    picoSuccess: 'Pico: “Nice work — you used the sign to help someone. Now let’s ask airport staff for directions.”',
  }),
  restroom: Object.freeze({
    eyebrow: 'SERVICES · TRAVELLER',
    title: '“Excuse me — where are the restrooms?”',
    prompt: 'Use the airport signs to choose a helpful reply.',
    answers: Object.freeze([
      'They are next to the coffee shop.',
      'This is Gate A12.',
      'I am a suitcase.',
    ]),
    correctIndex: 0,
    completionEvent: 'HELP_RESTROOM_TRAVELER',
    success: '“Thank you! I can find them now.”',
    retry: 'Look at the services sign and choose the complete direction.',
    picoSuccess: 'Pico: “Clear directions. No interpretive dance required.”',
  }),
});

const readMobileRenderProfile = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { mobile: false, ios: false, android: false };
  }

  const userAgent = navigator.userAgent || '';
  const ipadDesktopMode = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const ios = /iPhone|iPad|iPod/i.test(userAgent) || ipadDesktopMode;
  const android = /Android/i.test(userAgent);
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const compactViewport = Math.min(window.innerWidth, window.innerHeight) < 900;

  return {
    mobile: ios || android || (coarsePointer && compactViewport),
    ios,
    android,
  };
};

function readDprRange(mobile) {
  const deviceDpr = typeof window === 'undefined' ? 1 : (window.devicePixelRatio || 1);
  const maxDpr = Math.max(1, Math.min(deviceDpr, mobile ? 1.5 : 2));
  const minDpr = Math.min(maxDpr, mobile ? 1 : 1.15);

  return {
    minDpr,
    maxDpr,
    initialDpr: Math.min(maxDpr, mobile ? 1.25 : 1.5),
  };
}

function useMobileRenderProfile() {
  const [profile, setProfile] = useState(readMobileRenderProfile);

  useEffect(() => {
    const refresh = () => setProfile(readMobileRenderProfile());
    window.addEventListener('resize', refresh);
    window.addEventListener('orientationchange', refresh);
    return () => {
      window.removeEventListener('resize', refresh);
      window.removeEventListener('orientationchange', refresh);
    };
  }, []);

  return profile;
}

class GameCanvasBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    this.props.onError?.(error);
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function RendererFallback({ onRetry }) {
  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-slate-950 px-6 text-center text-white">
      <div className="max-w-sm rounded-[28px] border border-white/15 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
        <div className="text-4xl">🦜</div>
        <h2 className="mt-3 text-xl font-black">The 3D scene needs a quick restart</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">Close other graphics-heavy tabs, then retry. Smart Parrot will use the lightweight mobile renderer on iOS and Android.</p>
        <button type="button" onClick={onRetry} className="mt-5 rounded-full bg-amber-300 px-6 py-3 text-sm font-black text-slate-950 active:scale-95">Retry mission</button>
      </div>
    </div>
  );
}

function useInput(inputRef, onInteractPress, onInteractRelease, enabled = true) {
  useEffect(() => {
    const bindings = {
      KeyW: 'forward', ArrowUp: 'forward', KeyS: 'backward', ArrowDown: 'backward',
      KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    };
    const isUiTarget = (target) => (
      target instanceof HTMLElement
      && Boolean(target.closest('button, a, input, select, textarea, [contenteditable="true"], [role="button"]'))
    );
    const keydown = (event) => {
      if (!enabled || isUiTarget(event.target)) return;
      const action = bindings[event.code];
      if (action) {
        event.preventDefault();
        inputRef.current[action] = true;
      }
      if (!event.repeat && (event.code === 'KeyE' || event.code === 'Space')) {
        event.preventDefault();
        onInteractPress();
      }
    };
    const keyup = (event) => {
      if (!enabled || isUiTarget(event.target)) return;
      const action = bindings[event.code];
      if (action) {
        event.preventDefault();
        inputRef.current[action] = false;
      }
      if (event.code === 'KeyE' || event.code === 'Space') {
        event.preventDefault();
        onInteractRelease();
      }
    };
    const blur = () => {
      inputRef.current = { forward: false, backward: false, left: false, right: false };
      onInteractRelease();
    };
    if (!enabled) blur();
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
    };
  }, [enabled, inputRef, onInteractPress, onInteractRelease]);
}

function Terminal() {
  const columns = useMemo(() => Array.from({ length: 11 }, (_, i) => -30 + i * 6), []);
  const ceilingLights = useMemo(() => Array.from({ length: 10 }, (_, i) => -27 + i * 6), []);

  return (
    <group>
      <mesh receiveShadow position={[0, -0.12, 1]}>
        <boxGeometry args={[68, 0.2, 48]} />
        <meshStandardMaterial color="#cfd5dc" roughness={0.2} metalness={0.2} />
      </mesh>

      <mesh position={[0, 7.8, -22.5]} receiveShadow>
        <boxGeometry args={[68, 16, 0.45]} />
        <meshPhysicalMaterial color="#789fba" transparent opacity={0.48} roughness={0.12} metalness={0.08} transmission={0.18} />
      </mesh>

      <mesh position={[0, 7.8, -22.28]}>
        <planeGeometry args={[66, 14]} />
        <meshBasicMaterial color="#a8c8d8" transparent opacity={0.13} toneMapped={false} />
      </mesh>

      {columns.map((x) => (
        <mesh key={x} position={[x, 4, -21.9]} castShadow receiveShadow>
          <boxGeometry args={[0.45, 8, 0.45]} />
          <meshStandardMaterial color="#f7f8fa" metalness={0.62} roughness={0.2} />
        </mesh>
      ))}

      <mesh position={[0, 8.5, 1]} receiveShadow>
        <boxGeometry args={[68, 0.35, 48]} />
        <meshStandardMaterial color="#e6e9ed" roughness={0.62} />
      </mesh>

      {ceilingLights.map((x) => (
        <mesh key={x} position={[x, 8.28, -0.5]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[3.8, 0.85]} />
          <meshStandardMaterial
            color="#fff4d6"
            emissive="#ffe3a1"
            emissiveIntensity={1.9}
            roughness={0.38}
            toneMapped={false}
          />
        </mesh>
      ))}

      <RoundedBox args={[11, 2.2, 3.2]} radius={0.45} position={[-10.5, 1.05, -8]} castShadow receiveShadow>
        <meshStandardMaterial color="#2d333d" metalness={0.72} roughness={0.28} />
      </RoundedBox>

      <RoundedBox args={[7.2, 3.2, 2.2]} radius={0.25} position={[12, 1.6, -7]} castShadow receiveShadow>
        <meshStandardMaterial color="#815036" roughness={0.42} />
      </RoundedBox>
      <Text position={[12, 3.45, -5.8]} fontSize={0.58} color="#fff7e7" anchorX="center">COFFEE</Text>

      <mesh position={[0, 0.03, 7.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[3.2, 34]} />
        <meshStandardMaterial color="#f4c847" roughness={0.4} />
      </mesh>
    </group>
  );
}

function RainyWindowAtmosphere({ mobileRenderer = false }) {
  const rainRef = useRef();
  const runwayGlowRef = useRef();
  const shadowRef = useRef();
  const aircraftRef = useRef();

  const drops = useMemo(() => Array.from({ length: mobileRenderer ? 32 : 72 }, (_, index) => ({
    x: -22 + ((index * 7.13) % 44),
    y: 1 + ((index * 3.71) % 13),
    length: 0.25 + ((index * 0.17) % 0.75),
    speed: 0.35 + ((index * 0.11) % 0.8),
  })), [mobileRenderer]);

  const runwayLights = useMemo(() => Array.from({ length: mobileRenderer ? 10 : 18 }, (_, index) => ({
    x: -21 + index * 2.5,
    color: index % 5 === 0 ? '#ff8b55' : index % 2 === 0 ? '#8fd3ff' : '#fff0a8',
  })), [mobileRenderer]);

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
      <group ref={rainRef} position={[0, 0, -22.03]}>
        {drops.map((drop, index) => (
          <mesh key={index} position={[drop.x, drop.y, 0]} rotation={[0, 0, -0.08]}>
            <planeGeometry args={[0.025, drop.length]} />
            <meshBasicMaterial color="#d8f1ff" transparent opacity={0.32} depthWrite={false} toneMapped={false} />
          </mesh>
        ))}
      </group>

      <group position={[0, 0, -23.2]}>
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
          <mesh position={[-2.2, 0, 0]}>
            <sphereGeometry args={[0.12, 12, 12]} />
            <meshBasicMaterial color="#ff665a" toneMapped={false} />
          </mesh>
          <mesh position={[2.2, 0, 0]}>
            <sphereGeometry args={[0.12, 12, 12]} />
            <meshBasicMaterial color="#72dcff" toneMapped={false} />
          </mesh>
        </mesh>
      </group>

      <mesh ref={runwayGlowRef} position={[-19, 0.015, -28]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7, 1.1]} />
        <meshBasicMaterial color="#86cfff" transparent opacity={0.2} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>

      <mesh ref={shadowRef} position={[-18, 0.022, -24]} rotation={[-Math.PI / 2, 0, -0.16]}>
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
    target.position.set(0, 0, 20);
    if (light.current) light.current.target = target;
  }, [target]);

  return (
    <>
      <primitive object={target} />
      <spotLight ref={light} position={[0, 10, 17]} angle={0.48} penumbra={0.9} color="#ffe9a8" intensity={22} distance={28} decay={2} />
    </>
  );
}

function HeathrowLighting({ mobileRenderer = false }) {
  const keyLight = useRef();

  useEffect(() => {
    const light = keyLight.current;
    if (!light || mobileRenderer) return;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.left = -34;
    light.shadow.camera.right = 34;
    light.shadow.camera.top = 34;
    light.shadow.camera.bottom = -34;
    light.shadow.camera.near = 1;
    light.shadow.camera.far = 50;
    light.shadow.camera.updateProjectionMatrix();
    light.shadow.bias = -0.00018;
    light.shadow.normalBias = 0.025;
  }, [mobileRenderer]);

  useFrame(({ clock }) => {
    if (keyLight.current) {
      const baseIntensity = mobileRenderer ? 2.15 : 2.8;
      keyLight.current.intensity = baseIntensity + Math.sin(clock.elapsedTime * 0.22) * 0.06;
    }
  });

  return (
    <>
      {!mobileRenderer && (
        <Environment background={false} resolution={128} frames={1} environmentIntensity={0.82}>
          <Lightformer form="rect" intensity={4.2} color="#f7e2c5" position={[0, 9, -3]} rotation={[Math.PI / 2, 0, 0]} scale={[22, 8, 1]} />
          <Lightformer form="rect" intensity={2.4} color="#9dd8ff" position={[0, 6, -13]} rotation={[0, 0, 0]} scale={[28, 8, 1]} />
          <Lightformer form="ring" intensity={1.4} color="#c6b7ff" position={[10, 5, 5]} rotation={[0, -Math.PI / 2, 0]} scale={[5, 5, 1]} />
        </Environment>
      )}
      <ambientLight intensity={mobileRenderer ? 0.38 : 0.18} color="#cfdfeb" />
      <hemisphereLight args={['#d8edfa', '#625a55', mobileRenderer ? 0.82 : 0.58]} />
      <directionalLight
        ref={keyLight}
        position={[-10, 16, -10]}
        color="#f7e8d3"
        intensity={mobileRenderer ? 2.15 : 2.8}
        castShadow={!mobileRenderer}
      />
      {!mobileRenderer && <UndergroundSpot />}
    </>
  );
}

function CinematicBloom() {
  return (
    <EffectComposer multisampling={0} resolutionScale={0.72}>
      <Bloom
        intensity={0.42}
        luminanceThreshold={0.9}
        luminanceSmoothing={0.34}
        mipmapBlur
      />
    </EffectComposer>
  );
}

function Suitcase({ visible, active, proximity = 0, collecting = false }) {
  const groupRef = useRef();
  const startedAt = useRef(null);

  useEffect(() => {
    startedAt.current = null;
  }, [collecting]);

  useFrame(({ clock }) => {
    if (!groupRef.current || !visible) return;
    if (collecting) {
      if (startedAt.current === null) startedAt.current = clock.elapsedTime;
      const raw = clamp((clock.elapsedTime - startedAt.current) / 0.52, 0, 1);
      const eased = 1 - Math.pow(1 - raw, 3);
      const scale = Math.max(0.12, 1 - eased * 0.88);
      groupRef.current.position.set(SUITCASE.x, 1.12 + eased * 1.35, SUITCASE.z);
      groupRef.current.rotation.set(eased * -0.2, eased * 2.2, eased * 0.35);
      groupRef.current.scale.setScalar(scale);
    } else {
      groupRef.current.position.set(SUITCASE.x, 1.12, SUITCASE.z);
      groupRef.current.rotation.set(0, 0, 0);
      groupRef.current.scale.setScalar(1);
    }
  });

  if (!visible) return null;
  const glowStrength = 0.12 + proximity * 1.55 + (active ? 0.55 : 0) + (collecting ? 1.1 : 0);
  const floorGlow = clamp(0.12 + proximity * 0.6 + (active ? 0.2 : 0), 0.12, 0.92);

  return (
    <>
      <Float speed={active ? 2.4 : 1 + proximity} floatIntensity={active ? 0.2 : 0.04 + proximity * 0.08} rotationIntensity={0.04}>
        <Select enabled>
          <group ref={groupRef} position={[SUITCASE.x, 1.12, SUITCASE.z]}>
            <RoundedBox args={[1.45, 1.75, 0.7]} radius={0.18} castShadow>
              <meshStandardMaterial color="#7655d7" emissive="#3d1f84" emissiveIntensity={glowStrength} roughness={0.32} />
            </RoundedBox>
            <mesh position={[0, 1.08, 0]} castShadow><torusGeometry args={[0.35, 0.08, 12, 24, Math.PI]} /><meshStandardMaterial color="#292334" metalness={0.65} /></mesh>
            <Text position={[0, 0, 0.39]} fontSize={0.22} color="white" anchorX="center">LONDON</Text>
          </group>
        </Select>
      </Float>
      <Select enabled={active || proximity > 0.28}>
        <mesh position={[SUITCASE.x, 0.035, SUITCASE.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.72, 1.15 + proximity * 0.18, 48]} />
          <meshBasicMaterial color="#a98cff" transparent opacity={floorGlow} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      </Select>
    </>
  );
}

function Underground({ active }) {
  return (
    <group position={[UNDERGROUND.x, 3.4, UNDERGROUND.z + 1]}>
      <Select enabled>
        <group>
          <mesh castShadow><torusGeometry args={[1.45, 0.34, 20, 48]} /><meshStandardMaterial color={active ? '#ff4c55' : '#db2c37'} emissive={active ? '#a4141d' : '#4f050a'} emissiveIntensity={active ? 2.1 : 0.85} /></mesh>
          <mesh position={[0, 0, 0.2]} castShadow><boxGeometry args={[4.2, 0.62, 0.35]} /><meshStandardMaterial color="#163f8f" emissive="#123b91" emissiveIntensity={active ? 1.55 : 0.75} /></mesh>
          <Text position={[0, 0, 0.41]} fontSize={0.42} color="white" anchorX="center">UNDERGROUND</Text>
        </group>
      </Select>
      <mesh position={[0, -2.45, 0]} castShadow><boxGeometry args={[0.35, 3.7, 0.35]} /><meshStandardMaterial color="#39414c" metalness={0.65} /></mesh>
    </group>
  );
}

function Pico({ target, visible, celebrating, entering = false }) {
  const ref = useRef();
  const entranceStartedAt = useRef(null);

  useEffect(() => {
    if (visible && entering) entranceStartedAt.current = null;
  }, [visible, entering]);

  useFrame(({ clock }) => {
    if (!ref.current || !visible) return;
    const destination = new THREE.Vector3(
      target.x - 0.9,
      (celebrating ? 2.25 : 1.9) + Math.sin(clock.elapsedTime * 3) * 0.11,
      target.z - 0.8,
    );

    if (entering) {
      if (entranceStartedAt.current === null) {
        entranceStartedAt.current = clock.elapsedTime;
        ref.current.position.set(target.x - 4.2, 5.4, target.z - 3.2);
      }
      const raw = clamp((clock.elapsedTime - entranceStartedAt.current) / 1.25, 0, 1);
      const eased = 1 - Math.pow(1 - raw, 3);
      ref.current.position.lerp(destination, 0.06 + eased * 0.12);
      ref.current.rotation.y = (1 - eased) * Math.PI * 3;
      ref.current.rotation.z = Math.sin(raw * Math.PI * 2) * (1 - eased) * 0.45;
      ref.current.scale.setScalar(0.28 + eased * 0.2);
    } else {
      ref.current.position.lerp(destination, 0.055);
      ref.current.rotation.y = 0;
      ref.current.rotation.z = celebrating ? Math.sin(clock.elapsedTime * 6) * 0.22 : 0;
      ref.current.scale.setScalar(0.48);
    }
  });

  if (!visible) return null;
  return (
    <Select enabled={entering || celebrating}>
      <group ref={ref} scale={0.48}>
        <mesh castShadow scale={[0.72, 0.9, 0.72]}><sphereGeometry args={[0.7, 24, 24]} /><meshStandardMaterial color="#28b67a" emissive="#0a5d42" emissiveIntensity={entering ? 1.35 : celebrating ? 0.9 : 0.22} roughness={0.5} /></mesh>
        <mesh position={[0.58, 0.08, 0]} rotation={[0, 0, -0.2]} castShadow><coneGeometry args={[0.34, 0.75, 18]} /><meshStandardMaterial color="#f3bd37" emissive="#8b6200" emissiveIntensity={entering ? 0.8 : 0.18} /></mesh>
        <mesh position={[0.22, 0.28, 0.55]}><sphereGeometry args={[0.12, 16, 16]} /><meshStandardMaterial color="#121722" roughness={0.15} /></mesh>
        <mesh position={[-0.45, -0.1, 0]} rotation={[0, 0, 0.55]} castShadow><capsuleGeometry args={[0.22, 0.8, 6, 12]} /><meshStandardMaterial color="#148f68" emissive="#083d2f" emissiveIntensity={entering ? 0.75 : 0.16} /></mesh>
      </group>
    </Select>
  );
}

function ArrivalCutsceneCamera({ active }) {
  const { camera } = useThree();
  const startedAt = useRef(null);
  const positionCurve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(-19, 7.8, -12.5),
    new THREE.Vector3(-13.5, 6.2, -8.5),
    new THREE.Vector3(-7.5, 5.1, -3.5),
    new THREE.Vector3(4.5, 4.8, 1.5),
    new THREE.Vector3(0, 7.15, 2.8),
  ]), []);
  const targetCurve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(-14, 1.3, -10),
    new THREE.Vector3(-10.5, 1.1, -7.4),
    new THREE.Vector3(0, 1.5, -2),
    new THREE.Vector3(5.8, 1.3, 1.6),
    new THREE.Vector3(0, 1.15, -10.8),
  ]), []);

  useEffect(() => {
    if (!active) return;
    startedAt.current = null;
    camera.position.copy(positionCurve.getPoint(0));
  }, [active, camera, positionCurve]);

  useFrame(({ clock }) => {
    if (!active) return;
    if (startedAt.current === null) startedAt.current = clock.elapsedTime;
    const raw = clamp((clock.elapsedTime - startedAt.current) / 6.4, 0, 1);
    const eased = raw * raw * (3 - 2 * raw);
    camera.position.copy(positionCurve.getPoint(eased));
    camera.lookAt(targetCurve.getPoint(eased));
  });

  return null;
}

function Player({ inputRef, resetToken, reportPosition, controlsEnabled, conversationTarget = null, cameraFollowEnabled = true, mobileRenderer = false }) {
  const ref = useRef();
  const velocity = useRef(new THREE.Vector3());
  const cameraGoal = useMemo(() => new THREE.Vector3(), []);
  const cameraLook = useMemo(() => new THREE.Vector3(), []);
  const cameraAim = useMemo(() => new THREE.PerspectiveCamera(), []);
  const toSpeaker = useMemo(() => new THREE.Vector3(), []);
  const cameraSide = useMemo(() => new THREE.Vector3(), []);
  const moveVector = useMemo(() => new THREE.Vector3(), []);
  const cameraMode = useRef('follow');
  const [moving, setMoving] = useState(false);
  const { camera } = useThree();

  useEffect(() => {
    ref.current?.position.set(SPAWN.x, 0.95, SPAWN.z);
    velocity.current.set(0, 0, 0);
  }, [resetToken]);

  useFrame((_, delta) => {
    if (!ref.current) return;
    const input = controlsEnabled ? inputRef.current : { forward: false, backward: false, left: false, right: false };
    moveVector.set((input.right ? 1 : 0) - (input.left ? 1 : 0), 0, (input.backward ? 1 : 0) - (input.forward ? 1 : 0));
    if (moveVector.lengthSq()) moveVector.normalize();
    velocity.current.lerp(moveVector.multiplyScalar(controlsEnabled ? 5.2 : 0), 1 - Math.pow(0.001, delta));
    ref.current.position.addScaledVector(velocity.current, delta);
    ref.current.position.x = clamp(ref.current.position.x, -31, 31);
    ref.current.position.z = clamp(ref.current.position.z, -21, 23);

    const isMoving = velocity.current.lengthSq() > 0.35;
    if (conversationTarget) {
      const speakerYaw = Math.atan2(
        conversationTarget.x - ref.current.position.x,
        conversationTarget.z - ref.current.position.z,
      );
      ref.current.rotation.y = dampAngle(ref.current.rotation.y, speakerYaw, 7.2, delta);
    } else if (isMoving) {
      ref.current.rotation.y = Math.atan2(velocity.current.x, velocity.current.z);
    }

    setMoving((current) => (current === isMoving ? current : isMoving));
    reportPosition(ref.current.position.x, ref.current.position.z);

    const previousCameraMode = cameraMode.current;
    if (conversationTarget) {
      toSpeaker.set(
        conversationTarget.x - ref.current.position.x,
        0,
        conversationTarget.z - ref.current.position.z,
      );
      const speakerDistance = Math.max(toSpeaker.length(), 0.001);
      toSpeaker.multiplyScalar(1 / speakerDistance);
      cameraSide.set(-toSpeaker.z, 0, toSpeaker.x).multiplyScalar(conversationTarget.cameraSide ?? 1);

      cameraLook.set(
        (ref.current.position.x + conversationTarget.x) * 0.5,
        conversationTarget.lookY ?? 1.48,
        (ref.current.position.z + conversationTarget.z) * 0.5,
      );
      cameraGoal.copy(cameraLook)
        .addScaledVector(cameraSide, mobileRenderer ? 5.1 : 4.8)
        .addScaledVector(toSpeaker, mobileRenderer ? -0.65 : -0.55);
      cameraGoal.y = mobileRenderer ? 4.45 : 4.05;

      const dialoguePositionAlpha = 1 - Math.exp(-(mobileRenderer ? 10.5 : 8.5) * delta);
      const dialogueRotationAlpha = 1 - Math.exp(-(mobileRenderer ? 12 : 10) * delta);
      camera.position.lerp(cameraGoal, dialoguePositionAlpha);
      cameraAim.position.copy(camera.position);
      cameraAim.lookAt(cameraLook);
      camera.quaternion.slerp(cameraAim.quaternion, dialogueRotationAlpha);
      cameraMode.current = 'conversation';
    } else if (cameraFollowEnabled) {
      const cameraHeight = mobileRenderer ? 6.65 : 6.4;
      const cameraDistance = mobileRenderer ? 9.35 : 9.8;
      const forwardLook = mobileRenderer ? 0.9 : 1.4;
      cameraGoal.set(ref.current.position.x, cameraHeight, ref.current.position.z + cameraDistance);
      cameraLook.set(ref.current.position.x, 1.2, ref.current.position.z - forwardLook);

      const returningToFollow = previousCameraMode !== 'follow';
      const followStrength = mobileRenderer ? 12.5 : 9.5;
      const rotationStrength = mobileRenderer ? 14 : 11;
      const positionAlpha = 1 - Math.exp(-(returningToFollow ? followStrength * 1.6 : followStrength) * delta);
      const rotationAlpha = 1 - Math.exp(-(returningToFollow ? rotationStrength * 1.5 : rotationStrength) * delta);

      if (camera.position.distanceToSquared(cameraGoal) > 400) {
        camera.position.copy(cameraGoal);
      } else {
        camera.position.lerp(cameraGoal, positionAlpha);
      }
      cameraAim.position.copy(camera.position);
      cameraAim.lookAt(cameraLook);
      camera.quaternion.slerp(cameraAim.quaternion, rotationAlpha);
      cameraMode.current = 'follow';
    } else {
      cameraMode.current = 'held';
    }

    camera.updateMatrixWorld();
  });

  return (
    <group ref={ref} position={[SPAWN.x, 0.95, SPAWN.z]}>
      <TravelerAvatar moving={moving && !conversationTarget} />
    </group>
  );
}

function World({
  inputRef,
  mission,
  resetToken,
  reportPosition,
  playerPosition,
  activeTarget,
  cutsceneActive,
  gameplayEnabled,
  suitcaseProximity,
  pickupAnimating,
  picoEntering,
  quizOpen,
  npcQuestion,
  inspectedSignIds,
  focusedSignId,
  mobileRenderer,
}) {
  const engagedQuestionId = npcQuestion
    || (activeTarget === 'gate_question' ? 'gate' : activeTarget === 'restroom_question' ? 'restroom' : null);
  const focusedSign = getAirportSign(focusedSignId);
  const conversationTarget = focusedSign
    ? {
        x: focusedSign.position[0],
        z: focusedSign.position[2],
        lookY: focusedSign.position[1],
        cameraSide: focusedSign.cameraSide,
      }
    : quizOpen
      ? { ...AIRPORT_EMPLOYEE_POSITION, cameraSide: -1 }
      : npcQuestion
        ? { ...QUESTION_NPC_POSITIONS[npcQuestion], cameraSide: npcQuestion === 'gate' ? 1 : -1 }
        : null;

  return (
    <Selection>
      <>
        <color attach="background" args={['#718fa3']} />
        <fog attach="fog" args={['#aebfc9', 32, 82]} />
        <HeathrowLighting mobileRenderer={mobileRenderer} />
        <RainyWindowAtmosphere mobileRenderer={mobileRenderer} />
        <ArrivalCutsceneCamera active={cutsceneActive} />
        <Terminal />
        <TerminalExpansion mobileRenderer={mobileRenderer} />
        <AirportSigns
          missionActive={mission.step === HEATHROW_STEPS.INSPECT_SIGNS}
          inspectedIds={inspectedSignIds}
          focusedId={focusedSignId}
        />
        <AirportNPCs
          employeeActive={mission.step === HEATHROW_STEPS.ASK_EMPLOYEE}
          employeeEngaged={activeTarget === 'employee' || quizOpen}
          questionActiveId={engagedQuestionId}
          playerPosition={playerPosition}
        />
        <Suitcase
          visible={!mission.suitcaseCollected}
          active={activeTarget === 'suitcase'}
          proximity={suitcaseProximity}
          collecting={pickupAnimating}
        />
        <Underground active={activeTarget === 'underground'} />
        <Player
          inputRef={inputRef}
          resetToken={resetToken}
          reportPosition={reportPosition}
          controlsEnabled={gameplayEnabled}
          conversationTarget={conversationTarget}
          cameraFollowEnabled={!cutsceneActive}
          mobileRenderer={mobileRenderer}
        />
        <Pico
          target={cutsceneActive ? SUITCASE : playerPosition}
          visible={cutsceneActive || mission.suitcaseCollected}
          celebrating={!cutsceneActive && mission.step === HEATHROW_STEPS.COMPLETE}
          entering={picoEntering}
        />
        {mission.step === HEATHROW_STEPS.FOLLOW_YELLOW_ROUTE && (
          <Select enabled>
            <Float speed={1.4} floatIntensity={0.25}>
              <Text position={[0, 6.7, 11]} fontSize={0.58} color="#f7d65c" anchorX="center" outlineWidth={0.018} outlineColor="#17213b">Follow the yellow path</Text>
            </Float>
          </Select>
        )}
        {!mobileRenderer && <CinematicBloom />}
      </>
    </Selection>
  );
}

function DirectionButton({ label, action, inputRef }) {
  const set = (value) => { inputRef.current[action] = value; };
  return <button aria-label={label} onPointerDown={(e) => { e.preventDefault(); set(true); }} onPointerUp={() => set(false)} onPointerCancel={() => set(false)} onPointerLeave={() => set(false)} className="grid h-[52px] w-[52px] select-none place-items-center rounded-2xl border border-white/40 bg-slate-950/62 text-lg font-black text-white shadow-xl backdrop-blur active:scale-95">{label}</button>;
}

function AdaptiveRenderQuality({ dpr, minDpr, maxDpr, mobile, onDprChange }) {
  const sampleRef = useRef({ elapsed: 0, frames: 0, strongSamples: 0 });
  const lastChangeRef = useRef(-10);

  useFrame((state, delta) => {
    if (typeof document !== 'undefined' && document.hidden) return;

    const sample = sampleRef.current;
    sample.elapsed += Math.min(delta, 0.12);
    sample.frames += 1;

    if (sample.elapsed < 2.5) return;

    const fps = sample.frames / sample.elapsed;
    sample.elapsed = 0;
    sample.frames = 0;

    if (state.clock.elapsedTime - lastChangeRef.current < 4) return;

    const lowFps = mobile ? 42 : 50;
    const highFps = mobile ? 55 : 58;

    if (fps < lowFps && dpr > minDpr + 0.04) {
      sample.strongSamples = 0;
      lastChangeRef.current = state.clock.elapsedTime;
      onDprChange(Math.max(minDpr, Number((dpr - 0.15).toFixed(2))));
      return;
    }

    if (fps > highFps && dpr < maxDpr - 0.04) {
      sample.strongSamples += 1;
      if (sample.strongSamples >= 2) {
        sample.strongSamples = 0;
        lastChangeRef.current = state.clock.elapsedTime;
        onDprChange(Math.min(maxDpr, Number((dpr + 0.1).toFixed(2))));
      }
      return;
    }

    sample.strongSamples = 0;
  });

  return null;
}

export default function HeathrowPlayableSpine() {
  const gameRootRef = useRef(null);
  const inputRef = useRef({ forward: false, backward: false, left: false, right: false });
  const positionRef = useRef({ ...SPAWN });
  const firstNpcAnswerRef = useRef(null);
  const npcContinueRef = useRef(null);
  const [playerPosition, setPlayerPosition] = useState({ ...SPAWN });
  const [mission, dispatch] = useReducer(reduceMission, INITIAL_MISSION_STATE, loadCheckpoint);
  const [resetToken, setResetToken] = useState(0);
  const [picoLine, setPicoLine] = useState('');
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizFeedback, setQuizFeedback] = useState('');
  const [npcQuestion, setNpcQuestion] = useState(null);
  const [npcQuestionFeedback, setNpcQuestionFeedback] = useState('');
  const [inspectedSignIds, setInspectedSignIds] = useState([]);
  const [focusedSignId, setFocusedSignId] = useState(null);
  const [cutsceneActive, setCutsceneActive] = useState(() => mission.step === HEATHROW_STEPS.COLLECT_SUITCASE && !mission.suitcaseCollected);
  const [cutsceneBeat, setCutsceneBeat] = useState(0);
  const [holdingSuitcase, setHoldingSuitcase] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [pickupAnimating, setPickupAnimating] = useState(false);
  const [picoEntering, setPicoEntering] = useState(false);
  const renderProfile = useMobileRenderProfile();
  const renderRange = useMemo(() => readDprRange(renderProfile.mobile), [renderProfile.mobile]);
  const [adaptiveDpr, setAdaptiveDpr] = useState(() => readDprRange(readMobileRenderProfile().mobile).initialDpr);
  const [rendererFailure, setRendererFailure] = useState('');
  const [rendererKey, setRendererKey] = useState(0);
  const canHoldSuitcaseRef = useRef(false);
  const pickupAnimatingRef = useRef(false);
  const interactionTimersRef = useRef([]);
  const signsCompletedRef = useRef(false);

  useEffect(() => {
    setAdaptiveDpr(renderRange.initialDpr);
  }, [renderRange]);

  const reportPosition = useCallback((x, z) => {
    positionRef.current.x = x;
    positionRef.current.z = z;
    setPlayerPosition((current) => (Math.abs(current.x - x) > 0.08 || Math.abs(current.z - z) > 0.08 ? { x, z } : current));
  }, []);

  const suitcaseDistance = distance(playerPosition, SUITCASE);
  const nearSuitcase = suitcaseDistance < SUITCASE_INTERACT_RADIUS;
  const suitcaseProximity = clamp(
    1 - ((suitcaseDistance - SUITCASE_INTERACT_RADIUS) / (SUITCASE_GLOW_RADIUS - SUITCASE_INTERACT_RADIUS)),
    0,
    1,
  );
  const nearEmployee = distance(playerPosition, AIRPORT_EMPLOYEE_POSITION) < 3.2;
  const nearUnderground = distance(playerPosition, UNDERGROUND) < 3.8;
  const nearGateTraveler = distance(playerPosition, QUESTION_NPC_POSITIONS.gate) < 2.8;
  const nearRestroomTraveler = distance(playerPosition, QUESTION_NPC_POSITIONS.restroom) < 2.8;
  const nearbySign = mission.step === HEATHROW_STEPS.INSPECT_SIGNS
    ? findNearbyAirportSign(playerPosition)
    : null;
  const canInspectNearbySign = nearbySign
    && !inspectedSignIds.includes(nearbySign.id)
    && !focusedSignId;
  const canHoldSuitcase = mission.step === HEATHROW_STEPS.COLLECT_SUITCASE
    && nearSuitcase
    && !pickupAnimating
    && !cutsceneActive
    && !quizOpen
    && !npcQuestion;
  canHoldSuitcaseRef.current = canHoldSuitcase;
  const activeTarget = mission.step === HEATHROW_STEPS.COLLECT_SUITCASE && nearSuitcase
    ? 'suitcase'
    : canInspectNearbySign
      ? `sign:${nearbySign.id}`
      : mission.step === HEATHROW_STEPS.ASK_EMPLOYEE && nearEmployee
        ? 'employee'
        : mission.step === HEATHROW_STEPS.REACH_UNDERGROUND && nearUnderground
          ? 'underground'
          : mission.step === HEATHROW_STEPS.HELP_GATE_TRAVELER && nearGateTraveler
            ? 'gate_question'
            : mission.step === HEATHROW_STEPS.HELP_RESTROOM_TRAVELER && nearRestroomTraveler
              ? 'restroom_question'
              : null;
  const npcQuestionData = TRAVELER_QUESTIONS[npcQuestion] ?? null;
  const npcQuestionComplete = npcQuestion === 'gate'
    ? mission.gateTravelerHelped
    : npcQuestion === 'restroom'
      ? mission.restroomTravelerHelped
      : false;
  const gameplayEnabled = !cutsceneActive
    && !quizOpen
    && !npcQuestion
    && !focusedSignId
    && !pickupAnimating
    && !picoEntering;

  const interact = useCallback(() => {
    if (quizOpen || npcQuestion || focusedSignId) return;
    const position = positionRef.current;
    if (mission.step === HEATHROW_STEPS.MEET_PICO) {
      dispatch({ type: 'MEET_PICO' });
      setPicoLine('Pico: “Let’s read the airport signs before we choose a route.”');
    } else if (mission.step === HEATHROW_STEPS.INSPECT_SIGNS) {
      const sign = findNearbyAirportSign(position);
      if (!sign || inspectedSignIds.includes(sign.id)) return;
      inputRef.current = { forward: false, backward: false, left: false, right: false };
      setPicoLine('');
      setInspectedSignIds((current) => [...current, sign.id]);
      setFocusedSignId(sign.id);
    } else if (mission.step === HEATHROW_STEPS.ASK_EMPLOYEE && distance(position, AIRPORT_EMPLOYEE_POSITION) < 3.2) {
      inputRef.current = { forward: false, backward: false, left: false, right: false };
      setQuizFeedback('');
      setQuizOpen(true);
    } else if (mission.step === HEATHROW_STEPS.REACH_UNDERGROUND && distance(position, UNDERGROUND) < 3.8) {
      dispatch({ type: 'REACH_UNDERGROUND' });
      setPicoLine('Pico: “You found it. London is waiting.”');
    } else if (
      mission.step === HEATHROW_STEPS.HELP_GATE_TRAVELER
      && distance(position, QUESTION_NPC_POSITIONS.gate) < 2.8
    ) {
      inputRef.current = { forward: false, backward: false, left: false, right: false };
      setNpcQuestionFeedback('');
      setNpcQuestion('gate');
    } else if (
      mission.step === HEATHROW_STEPS.HELP_RESTROOM_TRAVELER
      && distance(position, QUESTION_NPC_POSITIONS.restroom) < 2.8
    ) {
      inputRef.current = { forward: false, backward: false, left: false, right: false };
      setNpcQuestionFeedback('');
      setNpcQuestion('restroom');
    }
  }, [focusedSignId, inspectedSignIds, mission.step, npcQuestion, quizOpen]);

  useEffect(() => {
    if (
      mission.step !== HEATHROW_STEPS.INSPECT_SIGNS
      || inspectedSignIds.length !== AIRPORT_SIGNS.length
      || signsCompletedRef.current
    ) {
      return;
    }

    signsCompletedRef.current = true;
    dispatch({ type: 'INSPECT_SIGNS' });
    setPicoLine('Pico: “Three signs, three clues. Let’s help the traveller at Gate A12.”');
  }, [inspectedSignIds, mission.step]);

  const clearInteractionTimers = useCallback(() => {
    interactionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    interactionTimersRef.current = [];
  }, []);

  const closeNpcQuestion = useCallback(() => {
    setNpcQuestion(null);
    setNpcQuestionFeedback('');
    window.requestAnimationFrame(() => gameRootRef.current?.focus({ preventScroll: true }));
  }, []);

  useEffect(() => {
    if (!npcQuestion) return undefined;
    const focusFrame = window.requestAnimationFrame(() => {
      firstNpcAnswerRef.current?.focus({ preventScroll: true });
    });
    const onDialogKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeNpcQuestion();
    };
    window.addEventListener('keydown', onDialogKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', onDialogKeyDown);
    };
  }, [closeNpcQuestion, npcQuestion]);

  useEffect(() => {
    if (!npcQuestionComplete) return undefined;
    const focusFrame = window.requestAnimationFrame(() => {
      npcContinueRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [npcQuestionComplete]);

  const answerNpcQuestion = useCallback((answerIndex) => {
    if (!npcQuestionData || npcQuestionComplete) return;
    if (answerIndex !== npcQuestionData.correctIndex) {
      setNpcQuestionFeedback(npcQuestionData.retry);
      return;
    }

    dispatch({ type: npcQuestionData.completionEvent });
    setNpcQuestionFeedback(npcQuestionData.success);
    setPicoLine(npcQuestionData.picoSuccess);
  }, [npcQuestionComplete, npcQuestionData]);

  const beginSuitcaseHold = useCallback(() => {
    if (!canHoldSuitcaseRef.current || pickupAnimatingRef.current) return;
    setPicoLine('');
    setHoldProgress(0);
    setHoldingSuitcase(true);
  }, []);

  const endSuitcaseHold = useCallback(() => {
    if (pickupAnimatingRef.current) return;
    setHoldingSuitcase(false);
    setHoldProgress(0);
  }, []);

  const onInteractPress = useCallback(() => {
    if (canHoldSuitcaseRef.current) {
      beginSuitcaseHold();
      return;
    }
    interact();
  }, [beginSuitcaseHold, interact]);

  const onInteractRelease = useCallback(() => {
    endSuitcaseHold();
  }, [endSuitcaseHold]);

  useInput(inputRef, onInteractPress, onInteractRelease, gameplayEnabled);

  useEffect(() => {
    if (!holdingSuitcase) return undefined;
    const startedAt = performance.now();
    let frameId;

    const tick = (now) => {
      if (!canHoldSuitcaseRef.current) {
        setHoldingSuitcase(false);
        setHoldProgress(0);
        return;
      }

      const nextProgress = clamp((now - startedAt) / SUITCASE_HOLD_MS, 0, 1);
      setHoldProgress(nextProgress);

      if (nextProgress >= 1) {
        setHoldingSuitcase(false);
        setHoldProgress(1);
        pickupAnimatingRef.current = true;
        setPickupAnimating(true);
        inputRef.current = { forward: false, backward: false, left: false, right: false };

        const pickupTimer = window.setTimeout(() => {
          dispatch({ type: 'COLLECT_SUITCASE' });
          pickupAnimatingRef.current = false;
          setPickupAnimating(false);
          setHoldProgress(0);
          setPicoEntering(true);

          const lineTimer = window.setTimeout(() => {
            setPicoLine('Pico: “Nice! Found it. You’re better at this than most humans.”');
          }, 620);
          const entranceTimer = window.setTimeout(() => {
            setPicoEntering(false);
          }, 1450);
          interactionTimersRef.current.push(lineTimer, entranceTimer);
        }, 520);
        interactionTimersRef.current.push(pickupTimer);
        return;
      }

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [holdingSuitcase]);

  useEffect(() => () => clearInteractionTimers(), [clearInteractionTimers]);
  useEffect(() => saveCheckpoint(mission), [mission]);
  useEffect(() => {
    if (!cutsceneActive) return undefined;
    inputRef.current = { forward: false, backward: false, left: false, right: false };
    setCutsceneBeat(0);
    const timers = [
      window.setTimeout(() => setCutsceneBeat(1), 1400),
      window.setTimeout(() => setCutsceneBeat(2), 3000),
      window.setTimeout(() => setCutsceneBeat(3), 4700),
      window.setTimeout(() => setCutsceneActive(false), 6400),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [cutsceneActive]);

  const restart = () => {
    clearCheckpoint();
    clearInteractionTimers();
    pickupAnimatingRef.current = false;
    inputRef.current = { forward: false, backward: false, left: false, right: false };
    positionRef.current = { ...SPAWN };
    setPlayerPosition({ ...SPAWN });
    setPicoLine('');
    setQuizOpen(false);
    setQuizFeedback('');
    setNpcQuestion(null);
    setNpcQuestionFeedback('');
    setInspectedSignIds([]);
    setFocusedSignId(null);
    signsCompletedRef.current = false;
    setHoldingSuitcase(false);
    setHoldProgress(0);
    setPickupAnimating(false);
    setPicoEntering(false);
    setCutsceneActive(true);
    setCutsceneBeat(0);
    dispatch({ type: 'RESET' });
    setResetToken((value) => value + 1);
  };

  const missionStepIndex = Math.max(0, HEATHROW_SEQUENCE.indexOf(mission.step));
  const progressPercent = ((missionStepIndex + 1) / HEATHROW_SEQUENCE.length) * 100;
  const canInteract = activeTarget || mission.step === HEATHROW_STEPS.MEET_PICO;
  const label = activeTarget?.startsWith('sign:')
    ? 'Inspect sign'
    : activeTarget === 'gate_question' || activeTarget === 'restroom_question'
    ? 'Talk to traveller'
    : mission.step === HEATHROW_STEPS.COLLECT_SUITCASE
      ? 'Collect suitcase'
      : mission.step === HEATHROW_STEPS.MEET_PICO
        ? 'Say hello to Pico'
        : mission.step === HEATHROW_STEPS.ASK_EMPLOYEE
          ? 'Ask airport staff'
          : 'Enter Underground';
  const focusedSignData = getAirportSign(focusedSignId);
  const cutsceneCopy = [
    { eyebrow: 'SMART PARROT ADVENTURE', title: 'London Heathrow', body: 'A new city. A new language. One very important suitcase.' },
    { eyebrow: 'TERMINAL 5', title: 'Arrivals', body: 'Follow the signs through the busy terminal.' },
    { eyebrow: 'FIRST OBJECTIVE', title: 'Find your purple suitcase', body: 'It should be waiting at baggage reclaim.' },
    { eyebrow: 'PICO', title: '“Purple suitcase. Very fashionable.”', body: '“Also, apparently, very easy to lose.”' },
  ][cutsceneBeat];

  const retryRenderer = () => {
    setRendererFailure('');
    setRendererKey((value) => value + 1);
  };

  const rendererFallback = <RendererFallback onRetry={retryRenderer} />;

  return (
    <main
      ref={gameRootRef}
      tabIndex={-1}
      className="relative h-screen h-[100dvh] overflow-hidden bg-slate-950 text-white [touch-action:none]"
      style={{ minHeight: renderProfile.mobile ? 0 : 560 }}
      data-render-profile={renderProfile.mobile ? 'mobile-safe' : 'desktop-cinematic'}
      data-render-dpr={adaptiveDpr.toFixed(2)}
      data-mobile-platform={renderProfile.ios ? 'ios' : renderProfile.android ? 'android' : 'other'}
    >
      {rendererFailure ? rendererFallback : (
        <GameCanvasBoundary resetKey={rendererKey} onError={() => setRendererFailure('render-error')} fallback={rendererFallback}>
          <Canvas
            key={`${rendererKey}-${renderProfile.mobile ? 'mobile' : 'desktop'}`}
            fallback={rendererFallback}
            shadows={!renderProfile.mobile}
            dpr={adaptiveDpr}
            camera={{ position: [0, 7.15, 2.8], fov: 52, near: 0.1, far: renderProfile.mobile ? 110 : 160 }}
            gl={{
              antialias: !renderProfile.mobile,
              alpha: false,
              depth: true,
              stencil: false,
              preserveDrawingBuffer: false,
              failIfMajorPerformanceCaveat: false,
              precision: renderProfile.mobile ? 'mediump' : 'highp',
              powerPreference: renderProfile.mobile ? 'default' : 'high-performance',
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 1.02,
            }}
            onCreated={({ gl }) => {
              gl.outputColorSpace = THREE.SRGBColorSpace;
              gl.shadowMap.enabled = !renderProfile.mobile;
              if (!renderProfile.mobile) gl.shadowMap.type = THREE.PCFSoftShadowMap;
              gl.domElement.addEventListener('webglcontextlost', (event) => {
                event.preventDefault();
                setRendererFailure('context-lost');
              }, { once: true });
            }}
          >
            <AdaptiveRenderQuality
              dpr={adaptiveDpr}
              minDpr={renderRange.minDpr}
              maxDpr={renderRange.maxDpr}
              mobile={renderProfile.mobile}
              onDprChange={setAdaptiveDpr}
            />
            <World
              inputRef={inputRef}
              mission={mission}
              resetToken={resetToken}
              reportPosition={reportPosition}
              playerPosition={playerPosition}
              activeTarget={activeTarget}
              cutsceneActive={cutsceneActive}
              gameplayEnabled={gameplayEnabled}
              suitcaseProximity={mission.step === HEATHROW_STEPS.COLLECT_SUITCASE ? suitcaseProximity : 0}
              pickupAnimating={pickupAnimating}
              picoEntering={picoEntering}
              quizOpen={quizOpen}
              npcQuestion={npcQuestion}
              inspectedSignIds={inspectedSignIds}
              focusedSignId={focusedSignId}
              mobileRenderer={renderProfile.mobile}
            />
          </Canvas>
        </GameCanvasBoundary>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/28 via-transparent to-slate-950/42" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_140px_rgba(15,23,42,.3)]" />

      {cutsceneActive && (
        <div className="pointer-events-none absolute inset-0 z-30 flex flex-col justify-between">
          <div className="h-[11vh] min-h-14 bg-slate-950/92" />
          <button
            type="button"
            onClick={() => setCutsceneActive(false)}
            className="pointer-events-auto absolute right-4 top-[calc(env(safe-area-inset-top)_+_1rem)] rounded-full border border-white/25 bg-slate-950/60 px-4 py-2 text-xs font-black tracking-wide text-white backdrop-blur-xl active:scale-95 sm:right-6"
          >
            Skip
          </button>
          <div className="mx-auto mb-6 w-[min(88vw,620px)] text-center drop-shadow-2xl sm:mb-10">
            <div className="text-[10px] font-black tracking-[.26em] text-amber-300 sm:text-xs">{cutsceneCopy.eyebrow}</div>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-5xl">{cutsceneCopy.title}</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-200 sm:mt-3 sm:text-base">{cutsceneCopy.body}</p>
            <div className="mx-auto mt-4 flex w-fit gap-1.5">
              {[0, 1, 2, 3].map((beat) => <span key={beat} className={`h-1.5 rounded-full transition-all ${beat === cutsceneBeat ? 'w-8 bg-amber-300' : 'w-2 bg-white/35'}`} />)}
            </div>
          </div>
          <div className="h-[11vh] min-h-14 bg-slate-950/92" />
        </div>
      )}

      {!cutsceneActive && <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:gap-3 sm:p-6">
        <div className="pointer-events-auto w-[calc(100%_-_6rem)] max-w-sm rounded-[20px] border border-white/35 bg-slate-950/72 p-3 shadow-2xl backdrop-blur-xl sm:w-auto sm:rounded-[24px] sm:p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-black tracking-[.16em] text-amber-300 sm:text-xs"><Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> LONDON · A1</div>
          <h1 className="mt-0.5 text-base font-black sm:mt-1 sm:text-xl">Heathrow Terminal 5</h1>
          <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-200 sm:mt-2 sm:text-sm">{objectiveCopy(mission.step)}</p>
          {mission.step === HEATHROW_STEPS.INSPECT_SIGNS && (
            <div className="mt-2 text-[10px] font-black tracking-[.12em] text-sky-200 sm:text-xs">
              AIRPORT SIGNS · {inspectedSignIds.length}/{AIRPORT_SIGNS.length}
            </div>
          )}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15 sm:mt-3 sm:h-2">
            <div
              className="h-full rounded-full bg-amber-300 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        <div className="pointer-events-auto flex gap-2">
          <button aria-label="Show help" onClick={() => setPicoLine('Pico: “Look for the softly glowing object.”')} className="grid h-10 w-10 place-items-center rounded-full border border-white/30 bg-slate-950/65 backdrop-blur sm:h-11 sm:w-11"><HelpCircle className="h-[18px] w-[18px] sm:h-5 sm:w-5" /></button>
          <button aria-label="Restart mission" onClick={restart} className="grid h-10 w-10 place-items-center rounded-full border border-white/30 bg-slate-950/65 backdrop-blur sm:h-11 sm:w-11"><RotateCcw className="h-[18px] w-[18px] sm:h-5 sm:w-5" /></button>
        </div>
      </header>}
      {!cutsceneActive && picoLine && <div className="pointer-events-none absolute left-1/2 top-[7.5rem] z-20 w-[min(86vw,420px)] -translate-x-1/2 rounded-2xl border border-white/30 bg-slate-950/78 px-4 py-2.5 text-center text-xs font-bold shadow-2xl backdrop-blur-xl sm:top-32 sm:px-5 sm:py-3 sm:text-sm">{picoLine}</div>}

      {focusedSignData && (
        <div className="absolute inset-0 z-40 flex items-end justify-end bg-slate-950/18 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
          <div className="w-full max-w-sm rounded-[24px] border border-sky-100/55 bg-slate-950/90 p-5 text-white shadow-2xl backdrop-blur-xl sm:p-6">
            <div className="text-[10px] font-black tracking-[.18em] text-sky-300 sm:text-xs">
              AIRPORT SIGNS · {inspectedSignIds.length}/{AIRPORT_SIGNS.length}
            </div>
            <h2 className="mt-2 text-2xl font-black tracking-tight">{focusedSignData.shortLabel}</h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-100">{focusedSignData.learningCopy}</p>
            <p className="mt-3 rounded-2xl bg-sky-400/12 px-4 py-3 text-xs font-bold leading-5 text-sky-100">
              {focusedSignData.hint}
            </p>
            <button
              type="button"
              onClick={() => setFocusedSignId(null)}
              className="mt-5 w-full rounded-full bg-amber-300 px-5 py-3 text-sm font-black text-slate-950 active:scale-[0.98]"
            >
              Continue exploring
            </button>
          </div>
        </div>
      )}

      {quizOpen && (
        <div className="absolute inset-0 z-40 grid place-items-end bg-slate-950/32 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[1px] sm:place-items-center">
          <div className="w-full max-w-lg rounded-[28px] border border-white/45 bg-white/96 p-5 text-slate-900 shadow-2xl backdrop-blur-xl sm:p-7">
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

      {npcQuestionData && (
        <div className="absolute inset-0 z-40 flex items-end justify-end bg-slate-950/[0.18] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="traveller-dialog-title"
            className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-[26px] border border-sky-100/50 bg-slate-950/95 p-4 text-white shadow-2xl backdrop-blur-xl [touch-action:pan-y] sm:max-h-[calc(100dvh-3rem)] sm:p-6"
          >
            <div className="text-[10px] font-black tracking-[.18em] text-sky-300 sm:text-xs">{npcQuestionData.eyebrow}</div>
            <h2 id="traveller-dialog-title" className="mt-2 text-xl font-black tracking-tight sm:text-2xl">{npcQuestionData.title}</h2>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-300 sm:text-sm sm:leading-6">{npcQuestionData.prompt}</p>
            <div className="mt-4 grid gap-2.5 sm:mt-5 sm:gap-3">
              {npcQuestionData.answers.map((answer, index) => (
                <button
                  key={answer}
                  ref={index === 0 ? firstNpcAnswerRef : null}
                  type="button"
                  disabled={npcQuestionComplete}
                  onClick={() => answerNpcQuestion(index)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    answerNpcQuestion(index);
                  }}
                  className="min-h-12 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-left text-sm font-bold text-white transition hover:border-sky-200/70 hover:bg-sky-300/[0.15] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300/70 active:scale-[0.99] disabled:cursor-default disabled:opacity-55"
                >
                  {answer}
                </button>
              ))}
            </div>
            {npcQuestionFeedback && (
              <p
                role="status"
                aria-live="polite"
                className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${
                  npcQuestionComplete
                    ? 'border-emerald-300/40 bg-emerald-400/[0.12] text-emerald-100'
                    : 'border-amber-300/40 bg-amber-300/[0.12] text-amber-100'
                }`}
              >
                <span className="font-black">{npcQuestionComplete ? 'Correct. ' : 'Try again. '}</span>
                {npcQuestionFeedback}
              </p>
            )}
            <button
              ref={npcContinueRef}
              type="button"
              onClick={closeNpcQuestion}
              className={`mt-4 min-h-12 w-full rounded-full px-5 py-3 text-sm font-black transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300/70 active:scale-[0.98] ${
                npcQuestionComplete
                  ? 'bg-amber-300 text-slate-950'
                  : 'border border-white/25 bg-white/[0.08] text-slate-200'
              }`}
            >
              {npcQuestionComplete ? 'Continue' : 'Close'}
            </button>
          </section>
        </div>
      )}

      {!cutsceneActive && !npcQuestion && !focusedSignId && !pickupAnimating && !picoEntering && (
        <>
          {renderProfile.mobile && <div className="absolute bottom-[calc(env(safe-area-inset-bottom)_+_5.25rem)] left-4 z-20 grid grid-cols-3 gap-1.5"><div /><DirectionButton label="↑" action="forward" inputRef={inputRef} /><div /><DirectionButton label="←" action="left" inputRef={inputRef} /><DirectionButton label="↓" action="backward" inputRef={inputRef} /><DirectionButton label="→" action="right" inputRef={inputRef} /></div>}
          <div className="absolute bottom-[calc(env(safe-area-inset-bottom)_+_7.5rem)] right-4 z-20 max-w-[58%] sm:bottom-5 sm:right-5 sm:max-w-[62%]">
            {activeTarget === 'suitcase' ? (
              <button
                type="button"
                aria-label="Hold to collect the purple suitcase"
                aria-pressed={holdingSuitcase}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                  beginSuitcaseHold();
                }}
                onPointerUp={(event) => {
                  event.preventDefault();
                  if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                  endSuitcaseHold();
                }}
                onPointerCancel={endSuitcaseHold}
                onPointerLeave={() => {
                  if (holdingSuitcase) endSuitcaseHold();
                }}
                onContextMenu={(event) => event.preventDefault()}
                className="flex select-none items-center gap-2 rounded-full border border-amber-100/70 bg-slate-950/78 p-1.5 pr-3 text-left text-white shadow-[0_0_36px_rgba(167,139,250,.5)] backdrop-blur-xl active:scale-[0.98] sm:gap-3 sm:p-2 sm:pr-5"
              >
                <span
                  className="grid h-[66px] w-[66px] shrink-0 place-items-center rounded-full p-[5px] shadow-[0_0_24px_rgba(252,211,77,.45)] sm:h-[76px] sm:w-[76px]"
                  style={{ background: `conic-gradient(#facc15 ${holdProgress * 360}deg, rgba(255,255,255,.2) 0deg)` }}
                >
                  <span className="grid h-full w-full place-items-center rounded-full bg-amber-300 text-slate-950 shadow-inner">
                    <span className="text-center leading-none">
                      <span className="block text-sm font-black sm:text-base">{Math.round(holdProgress * 100)}%</span>
                      <span className="mt-1 block text-[8px] font-black tracking-[.16em] sm:text-[9px]">HOLD</span>
                    </span>
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-black leading-tight sm:text-sm">Hold to collect</span>
                  <span className="mt-0.5 block text-[9px] font-semibold text-slate-300 sm:text-[10px]">Keep holding until the ring fills<span className="hidden sm:inline"> · E</span></span>
                </span>
              </button>
            ) : canInteract ? (
              <button onClick={interact} className="min-h-12 rounded-full bg-amber-300 px-4 py-3 text-xs font-black leading-tight text-slate-950 shadow-[0_0_32px_rgba(252,211,77,.65)] active:scale-95 sm:px-6 sm:py-4 sm:text-sm">{label}<span className="ml-2 hidden opacity-70 sm:inline">E</span></button>
            ) : mission.step === HEATHROW_STEPS.COMPLETE ? (
              <div className="rounded-full border border-emerald-300/40 bg-emerald-950/70 px-5 py-3 text-sm font-black text-emerald-100 backdrop-blur">Checkpoint saved ✓</div>
            ) : (
              <div className="hidden rounded-full border border-white/30 bg-slate-950/60 px-5 py-3 text-sm font-bold backdrop-blur sm:block">Move with WASD or arrow keys</div>
            )}
          </div>
        </>
      )}

      {pickupAnimating && (
        <div className="pointer-events-none absolute bottom-[calc(env(safe-area-inset-bottom)_+_8.5rem)] right-4 z-30 rounded-full border border-violet-200/50 bg-violet-950/80 px-5 py-3 text-xs font-black text-violet-100 shadow-[0_0_36px_rgba(167,139,250,.65)] backdrop-blur sm:bottom-6 sm:right-6 sm:text-sm">Suitcase collected ✓</div>
      )}
    </main>
  );
}
