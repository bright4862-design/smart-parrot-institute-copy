import '@/game/r3fSafeDataProps';
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Float, Lightformer, RoundedBox, Text } from '@react-three/drei';
import { Bloom, EffectComposer, SMAA, Select, Selection } from '@react-three/postprocessing';
import { HelpCircle, RotateCcw, SlidersHorizontal, Sparkles, Volume2, VolumeX } from 'lucide-react';
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
import AirportLife from './AirportLife';
import AirportSigns, { AIRPORT_SIGNS, findNearbyAirportSign, getAirportSign } from './AirportSigns';
import TerminalExpansion, { TICKET_MACHINE_INTERACTION } from './TerminalExpansion';
import { resolveHeathrowMovement } from './collisionMap';
import useHeathrowAmbience from './useHeathrowAmbience';
import RenderProfileSelector from './RenderProfileSelector';
import {
  loadRenderProfilePreference,
  readRenderCapabilities,
  resolveRenderProfile,
  saveRenderProfilePreference,
} from './renderProfiles';

const SPAWN = Object.freeze({ x: 0, z: -9 });
const SUITCASE = Object.freeze({ x: -10.5, z: -7.4 });
const UNDERGROUND = Object.freeze({ x: 0, z: 19.2 });
const YELLOW_ROUTE_END = Object.freeze({ x: 0, z: 15.2, radius: 2.35 });
const YELLOW_ROUTE_GUIDES = Object.freeze([
  Object.freeze({ x: 14.3, z: 11.3, rotation: -0.45 }),
  Object.freeze({ x: 12.1, z: 13.1, rotation: -0.55 }),
  Object.freeze({ x: 9.3, z: 14, rotation: 0 }),
  Object.freeze({ x: 6.3, z: 14, rotation: 0 }),
  Object.freeze({ x: 3.3, z: 14.2, rotation: -0.08 }),
  Object.freeze({ x: 0.8, z: 14.8, rotation: -0.24 }),
]);
const SUITCASE_INTERACT_RADIUS = 3.05;
const SUITCASE_GLOW_RADIUS = 8;
const SUITCASE_HOLD_MS = 1050;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const normalizeAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const dampAngle = (current, target, smoothing, delta) => (
  current + normalizeAngle(target - current) * (1 - Math.exp(-smoothing * delta))
);
const NPC_QUESTIONS = Object.freeze({
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
    completionFlag: 'gateTravelerHelped',
    success: '“Thank you! I’m in the right place.”',
    retry: 'Look at the blue gate sign. Read the letter and number together.',
    picoSuccess: 'Pico: “Nice work — you used the sign to help someone. Now let’s ask airport staff for directions.”',
  }),
  employee: Object.freeze({
    eyebrow: 'AIRPORT STAFF · DIRECTIONS',
    title: '“Hello. How can I help?”',
    prompt: 'Choose the polite, complete question.',
    answers: Object.freeze([
      'Excuse me, where is the Underground?',
      'You take me to the Underground now.',
      'Underground is where?',
    ]),
    correctIndex: 0,
    completionEvent: 'ANSWER_EMPLOYEE',
    completionFlag: 'employeeDirectionsAnswered',
    success: '“Of course. Follow the yellow route to the ticket machines.”',
    retry: 'Start with “Excuse me” and ask a complete question.',
    picoSuccess: 'Pico: “Excellent manners. The ticket machines are along the yellow route.”',
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
    completionFlag: 'restroomTravelerHelped',
    success: '“Thank you! I can find them now.”',
    retry: 'Look at the services sign and choose the complete direction.',
    picoSuccess: 'Pico: “Clear directions. No interpretive dance required.”',
  }),
});
const TICKET_MACHINE_SCREENS = Object.freeze([
  Object.freeze({
    eyebrow: 'TICKET MACHINE · 1 OF 2',
    title: 'Choose a destination',
    prompt: 'Where are you travelling today?',
    answers: Object.freeze(['Central London', 'Gate A12', 'Baggage Reclaim']),
    correctIndex: 0,
    retry: 'The airport employee said to travel into Central London.',
  }),
  Object.freeze({
    eyebrow: 'TICKET MACHINE · 2 OF 2',
    title: 'Choose your journey',
    prompt: 'You are travelling into London now.',
    answers: Object.freeze(['Single ticket', 'Return ticket', 'Cancel']),
    correctIndex: 0,
    retry: 'Choose a single ticket for this journey.',
  }),
]);

function useRenderCapabilities() {
  const [capabilities, setCapabilities] = useState(readRenderCapabilities);

  useEffect(() => {
    const refresh = () => setCapabilities(readRenderCapabilities());
    window.addEventListener('resize', refresh);
    window.addEventListener('orientationchange', refresh);
    return () => {
      window.removeEventListener('resize', refresh);
      window.removeEventListener('orientationchange', refresh);
    };
  }, []);

  return capabilities;
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
        <h2 className="mt-3 text-xl font-black">Restarting the 3D scene</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">Smart Parrot will retry once automatically. If this stays here, close other graphics-heavy tabs and retry.</p>
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
        <meshStandardMaterial color="#8f9aa5" roughness={0.72} metalness={0.04} />
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

      <group name="heathrow-arrivals-help-kiosk" position={[12, 0, -7]}>
        <RoundedBox args={[5.4, 1.35, 1.45]} radius={0.2} position={[0, 0.68, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#315A78" roughness={0.38} metalness={0.18} />
        </RoundedBox>
        <RoundedBox args={[5.65, 0.14, 1.62]} radius={0.07} position={[0, 1.36, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#D6E0E7" roughness={0.28} metalness={0.14} />
        </RoundedBox>
        <group position={[0, 2.55, 0.5]}>
          <RoundedBox args={[4.75, 0.82, 0.14]} radius={0.1} castShadow>
            <meshStandardMaterial color="#173F68" emissive="#0A294B" emissiveIntensity={0.42} roughness={0.4} />
          </RoundedBox>
          <Text position={[0, 0, 0.08]} fontSize={0.29} color="#FFFFFF" anchorX="center" anchorY="middle" outlineWidth={0.008} outlineColor="#07192F">
            ARRIVALS HELP
          </Text>
        </group>
        <mesh position={[1.55, 1.75, -0.18]} rotation={[-0.18, 0, 0]}>
          <planeGeometry args={[0.9, 0.58]} />
          <meshStandardMaterial color="#9EE8F6" emissive="#2C9DBC" emissiveIntensity={0.55} roughness={0.22} />
        </mesh>
        <Text position={[-1.15, 1.62, -0.73]} rotation={[0, Math.PI, 0]} fontSize={0.16} color="#EAF6FF" anchorX="center">
          INFORMATION · DIRECTIONS
        </Text>
      </group>

      <mesh position={[0, 0.03, 7.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[3.2, 34]} />
        <meshStandardMaterial color="#f4c847" roughness={0.4} />
      </mesh>
    </group>
  );
}

function RainyWindowAtmosphere({ mobileRenderer = false, reduced = false }) {
  const rainRef = useRef();
  const runwayGlowRef = useRef();
  const shadowRef = useRef();
  const aircraftRef = useRef();
  const dropCount = reduced ? 18 : mobileRenderer ? 32 : 72;
  const runwayLightCount = reduced ? 6 : mobileRenderer ? 10 : 18;

  const drops = useMemo(() => Array.from({ length: dropCount }, (_, index) => ({
    x: -22 + ((index * 7.13) % 44),
    y: 1 + ((index * 3.71) % 13),
    length: 0.25 + ((index * 0.17) % 0.75),
    speed: 0.35 + ((index * 0.11) % 0.8),
  })), [dropCount]);

  const runwayLights = useMemo(() => Array.from({ length: runwayLightCount }, (_, index) => ({
    x: -21 + index * 2.5,
    color: index % 5 === 0 ? '#ff8b55' : index % 2 === 0 ? '#8fd3ff' : '#fff0a8',
  })), [runwayLightCount]);

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

function HeathrowLighting({ mobileRenderer = false, renderSettings }) {
  const keyLight = useRef();
  const simplified = renderSettings.lighting === 'simplified';
  const cinematic = renderSettings.lighting === 'cinematic';

  useEffect(() => {
    const light = keyLight.current;
    if (!light || !renderSettings.shadows) return;
    const shadowSize = cinematic && !mobileRenderer ? 2048 : 1024;
    light.shadow.mapSize.set(shadowSize, shadowSize);
    light.shadow.camera.left = cinematic ? -30 : -34;
    light.shadow.camera.right = cinematic ? 30 : 34;
    light.shadow.camera.top = cinematic ? 30 : 34;
    light.shadow.camera.bottom = cinematic ? -30 : -34;
    light.shadow.camera.near = 1;
    light.shadow.camera.far = 50;
    light.shadow.camera.updateProjectionMatrix();
    light.shadow.bias = -0.00018;
    light.shadow.normalBias = 0.025;
  }, [cinematic, mobileRenderer, renderSettings.shadows]);

  useFrame(({ clock }) => {
    if (keyLight.current) {
      const baseIntensity = simplified
        ? (mobileRenderer ? 1.85 : 2.15)
        : mobileRenderer
          ? 2.15
          : cinematic
            ? 3.05
            : 2.8;
      keyLight.current.intensity = baseIntensity + Math.sin(clock.elapsedTime * 0.22) * 0.06;
    }
  });

  return (
    <>
      {renderSettings.environment && (
        <Environment
          background={false}
          resolution={cinematic ? 192 : 128}
          frames={1}
          environmentIntensity={cinematic ? 0.92 : 0.82}
        >
          <Lightformer form="rect" intensity={cinematic ? 4.8 : 4.2} color="#f7e2c5" position={[0, 9, -3]} rotation={[Math.PI / 2, 0, 0]} scale={[22, 8, 1]} />
          <Lightformer form="rect" intensity={cinematic ? 2.8 : 2.4} color="#9dd8ff" position={[0, 6, -13]} rotation={[0, 0, 0]} scale={[28, 8, 1]} />
          <Lightformer form="ring" intensity={cinematic ? 1.7 : 1.4} color="#c6b7ff" position={[10, 5, 5]} rotation={[0, -Math.PI / 2, 0]} scale={[5, 5, 1]} />
        </Environment>
      )}
      <ambientLight intensity={simplified ? 0.48 : mobileRenderer ? 0.38 : 0.18} color="#cfdfeb" />
      <hemisphereLight args={['#d8edfa', '#625a55', simplified ? 0.92 : mobileRenderer ? 0.82 : 0.58]} />
      <directionalLight
        ref={keyLight}
        position={[-10, 16, -10]}
        color="#f7e8d3"
        intensity={simplified ? 2.15 : mobileRenderer ? 2.15 : cinematic ? 3.05 : 2.8}
        castShadow={renderSettings.shadows}
      />
      {!simplified && <UndergroundSpot />}
    </>
  );
}

function CinematicPostProcessing({ bloom, smaa }) {
  if (!bloom && !smaa) return null;
  return (
    <EffectComposer multisampling={0} resolutionScale={bloom ? 0.78 : 1}>
      {bloom && (
        <Bloom
          intensity={0.42}
          luminanceThreshold={0.9}
          luminanceSmoothing={0.34}
          mipmapBlur
        />
      )}
      {smaa && <SMAA />}
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
    <group position={[UNDERGROUND.x - 2.2, 5.25, UNDERGROUND.z - 2]} scale={0.58}>
      <Select enabled>
        <group>
          <mesh castShadow><torusGeometry args={[1.45, 0.34, 20, 48]} /><meshStandardMaterial color={active ? '#ff4c55' : '#db2c37'} emissive={active ? '#a4141d' : '#4f050a'} emissiveIntensity={active ? 2.1 : 0.85} /></mesh>
          <mesh position={[0, 0, 0.2]} castShadow><boxGeometry args={[4.2, 0.62, 0.35]} /><meshStandardMaterial color="#163f8f" emissive="#123b91" emissiveIntensity={active ? 1.55 : 0.75} /></mesh>
          <Text position={[0, 0, 0.41]} fontSize={0.42} color="white" anchorX="center">UNDERGROUND</Text>
        </group>
      </Select>
      <mesh position={[0, -3, 0]} castShadow><boxGeometry args={[0.35, 5.2, 0.35]} /><meshStandardMaterial color="#39414c" metalness={0.65} /></mesh>
    </group>
  );
}

function YellowRouteGuide() {
  const checkpointRef = useRef();

  useFrame(({ clock }) => {
    if (!checkpointRef.current) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * 3.2) * 0.08;
    checkpointRef.current.scale.setScalar(pulse);
  });

  return (
    <Select enabled>
      <group>
        {YELLOW_ROUTE_GUIDES.map((guide, index) => (
          <mesh
            key={`${guide.x}:${guide.z}`}
            position={[guide.x, 0.055, guide.z]}
            rotation={[0, guide.rotation, 0]}
            receiveShadow
          >
            <boxGeometry args={[1.75, 0.08, 0.38]} />
            <meshStandardMaterial
              color={index % 2 === 0 ? '#f7d65c' : '#f0bd36'}
              emissive="#7a5200"
              emissiveIntensity={0.45}
              roughness={0.58}
            />
          </mesh>
        ))}

        <group ref={checkpointRef} position={[YELLOW_ROUTE_END.x, 0.07, YELLOW_ROUTE_END.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.85, 1.18, 40]} />
            <meshBasicMaterial color="#ffe06a" transparent opacity={0.9} toneMapped={false} />
          </mesh>
        </group>

        <Float speed={1.4} floatIntensity={0.18}>
          <Text
            position={[YELLOW_ROUTE_END.x, 2.35, YELLOW_ROUTE_END.z]}
            fontSize={0.34}
            color="#fff0a3"
            anchorX="center"
            outlineWidth={0.018}
            outlineColor="#17213b"
          >
            FOLLOW THE YELLOW ROUTE
          </Text>
        </Float>
      </group>
    </Select>
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
    const movementDelta = Math.min(delta, 0.05);
    moveVector.set((input.right ? 1 : 0) - (input.left ? 1 : 0), 0, (input.backward ? 1 : 0) - (input.forward ? 1 : 0));
    if (moveVector.lengthSq()) moveVector.normalize();
    velocity.current.lerp(moveVector.multiplyScalar(controlsEnabled ? 5.2 : 0), 1 - Math.pow(0.001, movementDelta));
    const requestedPosition = {
      x: ref.current.position.x + velocity.current.x * movementDelta,
      z: ref.current.position.z + velocity.current.z * movementDelta,
    };
    const resolvedPosition = resolveHeathrowMovement(ref.current.position, requestedPosition, { mobileRenderer });
    if (Math.abs(resolvedPosition.x - requestedPosition.x) > 0.0001) velocity.current.x = 0;
    if (Math.abs(resolvedPosition.z - requestedPosition.z) > 0.0001) velocity.current.z = 0;
    ref.current.position.x = resolvedPosition.x;
    ref.current.position.z = resolvedPosition.z;

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
  ticketMachineOpen,
  npcQuestion,
  inspectedSignIds,
  focusedSignId,
  mobileRenderer,
  renderSettings,
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
    : ticketMachineOpen
      ? {
          x: TICKET_MACHINE_INTERACTION.cameraTarget.x,
          z: TICKET_MACHINE_INTERACTION.cameraTarget.z,
          lookY: TICKET_MACHINE_INTERACTION.cameraTarget.y,
          cameraSide: TICKET_MACHINE_INTERACTION.cameraSide,
        }
    : npcQuestion === 'employee'
      ? { ...AIRPORT_EMPLOYEE_POSITION, cameraSide: 1 }
      : npcQuestion
        ? { ...QUESTION_NPC_POSITIONS[npcQuestion], cameraSide: 1 }
        : null;

  return (
    <Selection>
      <>
        <color attach="background" args={['#718fa3']} />
        <fog attach="fog" args={['#aebfc9', 32, 82]} />
        <HeathrowLighting mobileRenderer={mobileRenderer} renderSettings={renderSettings} />
        <RainyWindowAtmosphere mobileRenderer={mobileRenderer} reduced={renderSettings.decorationDensity === 'reduced'} />
        <ArrivalCutsceneCamera active={cutsceneActive} />
        <Terminal />
        <TerminalExpansion
          mobileRenderer={mobileRenderer}
          decorationDensity={renderSettings.decorationDensity}
          ticketMachineActive={mission.step === HEATHROW_STEPS.USE_TICKET_MACHINE || ticketMachineOpen}
          ticketMachineEngaged={activeTarget === 'ticket_machine' || ticketMachineOpen}
        />
        <AirportSigns
          missionActive={mission.step === HEATHROW_STEPS.INSPECT_SIGNS}
          inspectedIds={inspectedSignIds}
          focusedId={focusedSignId}
        />
        <AirportNPCs
          employeeActive={mission.step === HEATHROW_STEPS.ASK_EMPLOYEE}
          employeeEngaged={activeTarget === 'employee' || npcQuestion === 'employee'}
          questionActiveId={engagedQuestionId}
          playerPosition={playerPosition}
          mobileRenderer={mobileRenderer}
          decorationDensity={renderSettings.decorationDensity}
        />
        <AirportLife
          decorationDensity={renderSettings.decorationDensity}
          mobileRenderer={mobileRenderer}
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
        {mission.step === HEATHROW_STEPS.FOLLOW_YELLOW_ROUTE && <YellowRouteGuide />}
        <CinematicPostProcessing bloom={renderSettings.bloom} smaa={renderSettings.smaa} />
      </>
    </Selection>
  );
}

function DirectionButton({ label, action, inputRef }) {
  const set = (value) => { inputRef.current[action] = value; };
  const press = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    set(true);
  };
  const release = (event) => {
    event?.preventDefault();
    event?.stopPropagation();
    const button = event?.currentTarget;
    if (button?.hasPointerCapture?.(event.pointerId)) {
      button.releasePointerCapture(event.pointerId);
    }
    set(false);
  };

  return (
    <button
      type="button"
      aria-label={label}
      draggable={false}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(event) => event.preventDefault()}
      onClick={(event) => event.preventDefault()}
      className="grid h-14 w-14 select-none place-items-center rounded-2xl border border-white/55 bg-slate-950/78 text-xl font-black text-white shadow-[0_12px_30px_rgba(2,6,23,.42)] backdrop-blur-md active:scale-95"
      style={{
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span aria-hidden="true" className="pointer-events-none select-none">{label}</span>
    </button>
  );
}

function AdaptiveRenderQuality({ dpr, settings, onDprChange }) {
  const sampleRef = useRef({ elapsed: 0, frames: 0, strongSamples: 0 });
  const lastChangeRef = useRef(-10);

  useFrame((state, delta) => {
    if (typeof document !== 'undefined' && document.hidden) return;

    const sample = sampleRef.current;
    sample.elapsed += Math.min(delta, 0.12);
    sample.frames += 1;

    if (sample.elapsed < settings.sampleSeconds) return;

    const fps = sample.frames / sample.elapsed;
    sample.elapsed = 0;
    sample.frames = 0;

    if (state.clock.elapsedTime - lastChangeRef.current < 4) return;

    if (fps < settings.lowFps && dpr > settings.minDpr + 0.04) {
      sample.strongSamples = 0;
      lastChangeRef.current = state.clock.elapsedTime;
      onDprChange(Math.max(settings.minDpr, Number((dpr - settings.dprStepDown).toFixed(2))));
      return;
    }

    if (fps > settings.highFps && dpr < settings.maxDpr - 0.04) {
      sample.strongSamples += 1;
      if (sample.strongSamples >= 2) {
        sample.strongSamples = 0;
        lastChangeRef.current = state.clock.elapsedTime;
        onDprChange(Math.min(settings.maxDpr, Number((dpr + settings.dprStepUp).toFixed(2))));
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
  const firstTicketAnswerRef = useRef(null);
  const ticketActionRef = useRef(null);
  const firstNpcAnswerRef = useRef(null);
  const npcContinueRef = useRef(null);
  const [playerPosition, setPlayerPosition] = useState({ ...SPAWN });
  const [mission, dispatch] = useReducer(reduceMission, INITIAL_MISSION_STATE, loadCheckpoint);
  const [resetToken, setResetToken] = useState(0);
  const [picoLine, setPicoLine] = useState('');
  const [npcQuestion, setNpcQuestion] = useState(null);
  const [npcQuestionFeedback, setNpcQuestionFeedback] = useState('');
  const [ticketMachineOpen, setTicketMachineOpen] = useState(false);
  const [ticketMachineScreen, setTicketMachineScreen] = useState(0);
  const [ticketMachineFeedback, setTicketMachineFeedback] = useState('');
  const [inspectedSignIds, setInspectedSignIds] = useState([]);
  const [focusedSignId, setFocusedSignId] = useState(null);
  const [cutsceneActive, setCutsceneActive] = useState(() => mission.step === HEATHROW_STEPS.COLLECT_SUITCASE && !mission.suitcaseCollected);
  const [cutsceneBeat, setCutsceneBeat] = useState(0);
  const [holdingSuitcase, setHoldingSuitcase] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [pickupAnimating, setPickupAnimating] = useState(false);
  const [picoEntering, setPicoEntering] = useState(false);
  const [graphicsOpen, setGraphicsOpen] = useState(false);
  const renderProfile = useRenderCapabilities();
  const [renderMode, setRenderMode] = useState(loadRenderProfilePreference);
  const renderSettings = useMemo(
    () => resolveRenderProfile(renderMode, renderProfile),
    [renderMode, renderProfile],
  );
  const {
    muted: ambienceMuted,
    started: ambienceStarted,
    supported: ambienceSupported,
    toggleMuted: toggleAmbience,
  } = useHeathrowAmbience({ playerPosition, renderSettings });
  const [adaptiveDpr, setAdaptiveDpr] = useState(
    () => resolveRenderProfile(loadRenderProfilePreference(), readRenderCapabilities()).initialDpr,
  );
  const [rendererFailure, setRendererFailure] = useState('');
  const [rendererKey, setRendererKey] = useState(0);
  const renderContextSignatureRef = useRef(
    `${renderSettings.id}:${renderSettings.antialias}:${renderSettings.precision}:${renderSettings.shadows}`,
  );
  const automaticRendererRetriesRef = useRef(0);
  const canHoldSuitcaseRef = useRef(false);
  const pickupAnimatingRef = useRef(false);
  const interactionTimersRef = useRef([]);
  const signsCompletedRef = useRef(false);

  useEffect(() => {
    saveRenderProfilePreference(renderMode);
    setAdaptiveDpr(renderSettings.initialDpr);
    const signature = `${renderSettings.id}:${renderSettings.antialias}:${renderSettings.precision}:${renderSettings.shadows}`;
    if (renderContextSignatureRef.current !== signature) {
      renderContextSignatureRef.current = signature;
      setRendererFailure('');
      setRendererKey((value) => value + 1);
    }
  }, [renderMode, renderSettings]);

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
  const nearRestroomTraveler = (
    distance(playerPosition, QUESTION_NPC_POSITIONS.restroom) < 2.8
    && playerPosition.z > 9
  );
  const nearTicketMachine = (
    distance(playerPosition, TICKET_MACHINE_INTERACTION.interactionPosition)
      < TICKET_MACHINE_INTERACTION.radius
    && playerPosition.z > TICKET_MACHINE_INTERACTION.position.z + 0.2
  );
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
    && !npcQuestion
    && !graphicsOpen;
  canHoldSuitcaseRef.current = canHoldSuitcase;
  const activeTarget = mission.step === HEATHROW_STEPS.COLLECT_SUITCASE && nearSuitcase
    ? 'suitcase'
    : canInspectNearbySign
      ? `sign:${nearbySign.id}`
      : mission.step === HEATHROW_STEPS.ASK_EMPLOYEE && nearEmployee
        ? 'employee'
        : mission.step === HEATHROW_STEPS.USE_TICKET_MACHINE && nearTicketMachine
          ? 'ticket_machine'
        : mission.step === HEATHROW_STEPS.REACH_UNDERGROUND && nearUnderground
          ? 'underground'
          : mission.step === HEATHROW_STEPS.HELP_GATE_TRAVELER && nearGateTraveler
            ? 'gate_question'
            : mission.step === HEATHROW_STEPS.HELP_RESTROOM_TRAVELER && nearRestroomTraveler
              ? 'restroom_question'
              : null;
  const npcQuestionData = NPC_QUESTIONS[npcQuestion] ?? null;
  const npcQuestionComplete = npcQuestionData
    ? Boolean(mission[npcQuestionData.completionFlag])
    : false;
  const ticketMachineScreenData = TICKET_MACHINE_SCREENS[ticketMachineScreen] ?? null;
  const ticketMachineComplete = ticketMachineOpen && mission.ticketPurchased;
  const gameplayEnabled = !cutsceneActive
    && !npcQuestion
    && !ticketMachineOpen
    && !focusedSignId
    && !graphicsOpen
    && !pickupAnimating
    && !picoEntering;

  const interact = useCallback(() => {
    if (npcQuestion || ticketMachineOpen || focusedSignId) return;
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
      setNpcQuestionFeedback('');
      setNpcQuestion('employee');
    } else if (
      mission.step === HEATHROW_STEPS.USE_TICKET_MACHINE
      && distance(position, TICKET_MACHINE_INTERACTION.interactionPosition)
        < TICKET_MACHINE_INTERACTION.radius
      && position.z > TICKET_MACHINE_INTERACTION.position.z + 0.2
    ) {
      inputRef.current = { forward: false, backward: false, left: false, right: false };
      setPicoLine('');
      setTicketMachineScreen(0);
      setTicketMachineFeedback('');
      setTicketMachineOpen(true);
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
      && position.z > 9
    ) {
      inputRef.current = { forward: false, backward: false, left: false, right: false };
      setNpcQuestionFeedback('');
      setNpcQuestion('restroom');
    }
  }, [focusedSignId, inspectedSignIds, mission.step, npcQuestion, ticketMachineOpen]);

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

  const closeTicketMachine = useCallback(() => {
    setTicketMachineOpen(false);
    setTicketMachineScreen(0);
    setTicketMachineFeedback('');
    window.requestAnimationFrame(() => gameRootRef.current?.focus({ preventScroll: true }));
  }, []);

  useEffect(() => {
    if (!ticketMachineOpen) return undefined;
    const focusFrame = window.requestAnimationFrame(() => {
      if (ticketMachineScreen >= TICKET_MACHINE_SCREENS.length) {
        ticketActionRef.current?.focus({ preventScroll: true });
      } else {
        firstTicketAnswerRef.current?.focus({ preventScroll: true });
      }
    });
    const onDialogKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeTicketMachine();
    };
    window.addEventListener('keydown', onDialogKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', onDialogKeyDown);
    };
  }, [closeTicketMachine, ticketMachineOpen, ticketMachineScreen]);

  const answerTicketMachine = useCallback((answerIndex) => {
    if (!ticketMachineScreenData || ticketMachineComplete) return;
    if (answerIndex !== ticketMachineScreenData.correctIndex) {
      setTicketMachineFeedback(ticketMachineScreenData.retry);
      return;
    }

    setTicketMachineFeedback('');
    setTicketMachineScreen((screen) => Math.min(screen + 1, TICKET_MACHINE_SCREENS.length));
  }, [ticketMachineComplete, ticketMachineScreenData]);

  const collectTicket = useCallback(() => {
    if (ticketMachineScreen < TICKET_MACHINE_SCREENS.length) return;
    if (ticketMachineComplete) {
      closeTicketMachine();
      return;
    }

    dispatch({ type: 'COMPLETE_TICKET_MACHINE' });
    setTicketMachineFeedback('Central London · Single — ticket collected.');
    setPicoLine('Pico: “Ticket collected. Let’s help the traveller near the restrooms.”');
  }, [closeTicketMachine, ticketMachineComplete, ticketMachineScreen]);

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
    if (
      mission.step !== HEATHROW_STEPS.FOLLOW_YELLOW_ROUTE
      || distance(playerPosition, YELLOW_ROUTE_END) >= YELLOW_ROUTE_END.radius
    ) {
      return;
    }

    dispatch({ type: 'FOLLOW_YELLOW_ROUTE' });
    setPicoLine('Pico: “Yellow route complete. The Underground entrance is just ahead.”');
  }, [mission.step, playerPosition]);
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

  useEffect(() => {
    if (cutsceneActive) return undefined;
    inputRef.current = { forward: false, backward: false, left: false, right: false };
    const focusFrame = window.requestAnimationFrame(() => {
      gameRootRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [cutsceneActive]);

  const closeGraphics = useCallback(() => {
    setGraphicsOpen(false);
    window.requestAnimationFrame(() => gameRootRef.current?.focus({ preventScroll: true }));
  }, []);

  const changeRenderMode = useCallback((mode) => {
    inputRef.current = { forward: false, backward: false, left: false, right: false };
    setRenderMode(saveRenderProfilePreference(mode));
  }, []);

  useEffect(() => {
    if (!graphicsOpen) return undefined;
    const onGraphicsKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeGraphics();
    };
    window.addEventListener('keydown', onGraphicsKeyDown);
    return () => window.removeEventListener('keydown', onGraphicsKeyDown);
  }, [closeGraphics, graphicsOpen]);

  const restart = () => {
    clearCheckpoint();
    clearInteractionTimers();
    pickupAnimatingRef.current = false;
    inputRef.current = { forward: false, backward: false, left: false, right: false };
    positionRef.current = { ...SPAWN };
    setPlayerPosition({ ...SPAWN });
    setPicoLine('');
    setNpcQuestion(null);
    setNpcQuestionFeedback('');
    setTicketMachineOpen(false);
    setTicketMachineScreen(0);
    setTicketMachineFeedback('');
    setInspectedSignIds([]);
    setFocusedSignId(null);
    signsCompletedRef.current = false;
    setHoldingSuitcase(false);
    setHoldProgress(0);
    setPickupAnimating(false);
    setPicoEntering(false);
    setGraphicsOpen(false);
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
    : activeTarget === 'ticket_machine'
      ? 'Use ticket machine'
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

  const performRendererRetry = useCallback(() => {
    setRendererFailure('');
    setRendererKey((value) => value + 1);
  }, []);

  const retryRenderer = useCallback(() => {
    automaticRendererRetriesRef.current = 0;
    performRendererRetry();
  }, [performRendererRetry]);

  useEffect(() => {
    if (!rendererFailure || automaticRendererRetriesRef.current >= 1) return undefined;
    automaticRendererRetriesRef.current += 1;
    const retryTimer = window.setTimeout(performRendererRetry, 700);
    return () => window.clearTimeout(retryTimer);
  }, [performRendererRetry, rendererFailure]);

  useEffect(() => {
    if (rendererFailure) return undefined;
    const stableTimer = window.setTimeout(() => {
      automaticRendererRetriesRef.current = 0;
    }, 4000);
    return () => window.clearTimeout(stableTimer);
  }, [rendererFailure, rendererKey]);

  const rendererFallback = <RendererFallback onRetry={retryRenderer} />;

  return (
    <main
      ref={gameRootRef}
      tabIndex={0}
      onPointerDown={() => gameRootRef.current?.focus({ preventScroll: true })}
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
      className="relative h-screen h-[100dvh] select-none overflow-hidden bg-slate-950 text-white outline-none [touch-action:none]"
      style={{
        minHeight: renderProfile.mobile ? 0 : 560,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
      data-testid="heathrow-ready"
      data-heathrow-ready={rendererFailure ? 'false' : 'true'}
      data-render-profile={renderProfile.mobile ? 'mobile-safe' : 'desktop-cinematic'}
      data-render-mode={renderSettings.id}
      data-render-dpr={adaptiveDpr.toFixed(2)}
      data-audio-state={!ambienceSupported ? 'unsupported' : ambienceMuted ? 'muted' : ambienceStarted ? 'playing' : 'ready'}
      data-mobile-platform={renderProfile.ios ? 'ios' : renderProfile.android ? 'android' : 'other'}
      data-player-x={playerPosition.x.toFixed(2)}
      data-player-z={playerPosition.z.toFixed(2)}
    >
      {rendererFailure ? rendererFallback : (
        <GameCanvasBoundary
          resetKey={rendererKey}
          onError={(error) => {
            console.error('[Heathrow] 3D scene error', error);
            setRendererFailure(error?.message || 'render-error');
          }}
          fallback={rendererFallback}
        >
          <Canvas
            key={`${rendererKey}-${renderProfile.mobile ? 'mobile' : 'desktop'}-${renderSettings.id}`}
            fallback={rendererFallback}
            shadows={renderSettings.shadows}
            dpr={adaptiveDpr}
            camera={{ position: [0, 7.15, 2.8], fov: 52, near: 0.1, far: renderProfile.mobile ? 110 : 160 }}
            gl={{
              antialias: renderSettings.antialias,
              alpha: false,
              depth: true,
              stencil: false,
              preserveDrawingBuffer: false,
              failIfMajorPerformanceCaveat: false,
              precision: renderSettings.precision,
              powerPreference: renderSettings.performanceBias === 'speed' ? 'default' : 'high-performance',
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: renderSettings.lighting === 'cinematic' ? 0.98 : 0.94,
            }}
            onCreated={({ gl }) => {
              gl.outputColorSpace = THREE.SRGBColorSpace;
              gl.shadowMap.enabled = renderSettings.shadows;
              if (renderSettings.shadows) gl.shadowMap.type = THREE.PCFSoftShadowMap;
              gl.domElement.addEventListener('webglcontextlost', (event) => {
                event.preventDefault();
                setRendererFailure('context-lost');
              }, { once: true });
            }}
          >
            <AdaptiveRenderQuality
              dpr={adaptiveDpr}
              settings={renderSettings}
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
              ticketMachineOpen={ticketMachineOpen}
              npcQuestion={npcQuestion}
              inspectedSignIds={inspectedSignIds}
              focusedSignId={focusedSignId}
              mobileRenderer={renderProfile.mobile}
              renderSettings={renderSettings}
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
          {ambienceSupported && (
            <button
              type="button"
              aria-label={ambienceMuted ? 'Turn airport ambience on' : 'Mute airport ambience'}
              aria-pressed={!ambienceMuted}
              onClick={toggleAmbience}
              className="relative grid h-10 w-10 place-items-center rounded-full border border-white/30 bg-slate-950/65 backdrop-blur active:scale-95 sm:h-11 sm:w-11"
            >
              {ambienceMuted ? <VolumeX className="h-[18px] w-[18px] sm:h-5 sm:w-5" /> : <Volume2 className="h-[18px] w-[18px] sm:h-5 sm:w-5" />}
              {!ambienceMuted && !ambienceStarted && <span className="absolute -bottom-1 -right-1 rounded-full bg-cyan-300 px-1.5 py-0.5 text-[8px] font-black leading-none text-slate-950">TAP</span>}
            </button>
          )}
          <button aria-label={`Graphics quality: ${renderSettings.label}`} onClick={() => { inputRef.current = { forward: false, backward: false, left: false, right: false }; setGraphicsOpen(true); }} className="relative grid h-10 w-10 place-items-center rounded-full border border-white/30 bg-slate-950/65 backdrop-blur sm:h-11 sm:w-11"><SlidersHorizontal className="h-[18px] w-[18px] sm:h-5 sm:w-5" /><span className="absolute -bottom-1 -right-1 rounded-full bg-amber-300 px-1.5 py-0.5 text-[8px] font-black leading-none text-slate-950">{renderSettings.label === 'Performance' ? 'P' : renderSettings.label === 'Auto' ? 'A' : 'HD'}</span></button>
          <button aria-label="Show help" onClick={() => setPicoLine('Pico: “Look for the softly glowing object.”')} className="grid h-10 w-10 place-items-center rounded-full border border-white/30 bg-slate-950/65 backdrop-blur sm:h-11 sm:w-11"><HelpCircle className="h-[18px] w-[18px] sm:h-5 sm:w-5" /></button>
          <button aria-label="Restart mission" onClick={restart} className="grid h-10 w-10 place-items-center rounded-full border border-white/30 bg-slate-950/65 backdrop-blur sm:h-11 sm:w-11"><RotateCcw className="h-[18px] w-[18px] sm:h-5 sm:w-5" /></button>
        </div>
      </header>}

      {graphicsOpen && (
        <div className="absolute inset-0 z-50 flex items-end justify-end bg-slate-950/45 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:p-6">
          <section role="dialog" aria-modal="true" aria-labelledby="heathrow-graphics-dialog-title" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-[28px] border border-white/25 bg-slate-950/96 p-4 text-white shadow-2xl [touch-action:pan-y] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-black tracking-[.18em] text-cyan-300 sm:text-xs">HEATHROW · DISPLAY</div>
                <h2 id="heathrow-graphics-dialog-title" className="mt-1 text-xl font-black sm:text-2xl">Graphics quality</h2>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-300">Current live render scale: {adaptiveDpr.toFixed(2)}×</p>
              </div>
              <button type="button" onClick={closeGraphics} className="rounded-full border border-white/20 bg-white/[0.08] px-3 py-2 text-xs font-black text-slate-200 active:scale-95">Close</button>
            </div>
            <div className="mt-4">
              <RenderProfileSelector mode={renderMode} resolvedProfile={renderSettings} onChange={changeRenderMode} />
            </div>
            {renderSettings.id === 'hd' && renderProfile.constrained && (
              <p className="mt-3 rounded-2xl border border-amber-300/30 bg-amber-300/[0.1] px-4 py-3 text-xs font-semibold leading-5 text-amber-100">HD is active with a safe fallback because this device reports limited graphics resources.</p>
            )}
          </section>
        </div>
      )}

      {!cutsceneActive && picoLine && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute left-1/2 top-[clamp(13rem,46svh,24rem)] z-30 w-[min(92vw,460px)] -translate-x-1/2 px-1 sm:top-52 sm:px-0"
        >
          <div className="flex items-start gap-3 rounded-[22px] border border-amber-200/80 bg-slate-950/[0.985] px-4 py-3.5 text-left shadow-[0_18px_60px_rgba(2,6,23,.78),0_0_0_1px_rgba(255,255,255,.1)] sm:px-5 sm:py-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-amber-100/70 bg-amber-300 text-xl shadow-[0_0_20px_rgba(252,211,77,.26)]" aria-hidden="true">🦜</div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-black tracking-[.18em] text-amber-300 sm:text-xs">PICO</div>
              <p className="mt-1 break-words text-base font-extrabold leading-6 tracking-[.005em] text-white [text-shadow:0_2px_8px_rgba(0,0,0,.95)] sm:text-base sm:leading-7">
                {picoLine.replace(/^Pico:\s*/, '')}
              </p>
            </div>
          </div>
        </div>
      )}

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

      {ticketMachineOpen && (
        <div className="absolute inset-0 z-40 flex items-end justify-end bg-slate-950/[0.18] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="ticket-machine-dialog-title"
            className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-[26px] border border-cyan-100/50 bg-slate-950/95 p-4 text-white shadow-2xl backdrop-blur-xl [touch-action:pan-y] sm:max-h-[calc(100dvh-3rem)] sm:p-6"
          >
            {ticketMachineScreenData ? (
              <>
                <div className="text-[10px] font-black tracking-[.18em] text-cyan-300 sm:text-xs">
                  {ticketMachineScreenData.eyebrow}
                </div>
                <h2 id="ticket-machine-dialog-title" className="mt-2 text-xl font-black tracking-tight sm:text-2xl">
                  {ticketMachineScreenData.title}
                </h2>
                <p className="mt-2 text-xs font-semibold leading-5 text-slate-300 sm:text-sm sm:leading-6">
                  {ticketMachineScreenData.prompt}
                </p>
                <div className="mt-4 grid gap-2.5 sm:mt-5 sm:gap-3">
                  {ticketMachineScreenData.answers.map((answer, index) => (
                    <button
                      key={answer}
                      ref={index === 0 ? firstTicketAnswerRef : null}
                      type="button"
                      onClick={() => answerTicketMachine(index)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        answerTicketMachine(index);
                      }}
                      className="min-h-12 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-left text-sm font-bold text-white transition hover:border-cyan-200/70 hover:bg-cyan-300/[0.15] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300/70 active:scale-[0.99]"
                    >
                      {answer}
                    </button>
                  ))}
                </div>
                {ticketMachineFeedback && (
                  <p
                    role="status"
                    aria-live="polite"
                    className="mt-4 rounded-2xl border border-amber-300/40 bg-amber-300/[0.12] px-4 py-3 text-sm font-semibold text-amber-100"
                  >
                    <span className="font-black">Try again. </span>
                    {ticketMachineFeedback}
                  </p>
                )}
                <button
                  type="button"
                  onClick={closeTicketMachine}
                  className="mt-4 min-h-12 w-full rounded-full border border-white/25 bg-white/[0.08] px-5 py-3 text-sm font-black text-slate-200 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300/70 active:scale-[0.98]"
                >
                  Close
                </button>
              </>
            ) : (
              <>
                <div className="text-[10px] font-black tracking-[.18em] text-cyan-300 sm:text-xs">TICKET MACHINE · READY</div>
                <h2 id="ticket-machine-dialog-title" className="mt-2 text-xl font-black tracking-tight sm:text-2xl">
                  Collect your ticket
                </h2>
                <p className="mt-2 text-xs font-semibold leading-5 text-slate-300 sm:text-sm sm:leading-6">
                  Check the journey details before taking the ticket.
                </p>
                <div className="mt-4 rounded-[22px] border border-cyan-200/35 bg-cyan-300/[0.1] p-4 sm:mt-5">
                  <div className="text-[10px] font-black tracking-[.16em] text-cyan-200">DESTINATION</div>
                  <div className="mt-1 text-xl font-black">Central London</div>
                  <div className="mt-3 flex items-center justify-between gap-4 border-t border-white/15 pt-3 text-sm font-bold text-slate-200">
                    <span>Single ticket</span>
                    <span>1 passenger</span>
                  </div>
                </div>
                {ticketMachineFeedback && (
                  <p
                    role="status"
                    aria-live="polite"
                    className="mt-4 rounded-2xl border border-emerald-300/40 bg-emerald-400/[0.12] px-4 py-3 text-sm font-semibold text-emerald-100"
                  >
                    <span className="font-black">Complete. </span>
                    {ticketMachineFeedback}
                  </p>
                )}
                <button
                  ref={ticketActionRef}
                  type="button"
                  onClick={collectTicket}
                  className="mt-4 min-h-12 w-full rounded-full bg-amber-300 px-5 py-3 text-sm font-black text-slate-950 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-100/80 active:scale-[0.98]"
                >
                  {ticketMachineComplete ? 'Continue' : 'Collect ticket'}
                </button>
                {!ticketMachineComplete && (
                  <button
                    type="button"
                    onClick={closeTicketMachine}
                    className="mt-2 min-h-11 w-full rounded-full text-sm font-bold text-slate-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300/70"
                  >
                    Close
                  </button>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {npcQuestionData && (
        <div className="absolute inset-0 z-40 flex items-end justify-end bg-slate-950/[0.18] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="npc-dialog-title"
            className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-[26px] border border-sky-100/50 bg-slate-950/95 p-4 text-white shadow-2xl backdrop-blur-xl [touch-action:pan-y] sm:max-h-[calc(100dvh-3rem)] sm:p-6"
          >
            <div className="text-[10px] font-black tracking-[.18em] text-sky-300 sm:text-xs">{npcQuestionData.eyebrow}</div>
            <h2 id="npc-dialog-title" className="mt-2 text-xl font-black tracking-tight sm:text-2xl">{npcQuestionData.title}</h2>
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

      {!cutsceneActive && !npcQuestion && !ticketMachineOpen && !focusedSignId && !graphicsOpen && !pickupAnimating && !picoEntering && (
        <>
          {renderProfile.mobile && (
            <div
              role="group"
              aria-label="Touch movement controls"
              data-testid="heathrow-touch-controls"
              className="absolute bottom-[calc(env(safe-area-inset-bottom)_+_7.5rem)] left-3 z-20 grid grid-cols-3 gap-2 rounded-[26px] border border-white/20 bg-slate-950/28 p-2 shadow-[0_18px_50px_rgba(2,6,23,.28)] backdrop-blur-sm sm:left-4"
            >
              <div />
              <DirectionButton label="↑" action="forward" inputRef={inputRef} />
              <div />
              <DirectionButton label="←" action="left" inputRef={inputRef} />
              <DirectionButton label="↓" action="backward" inputRef={inputRef} />
              <DirectionButton label="→" action="right" inputRef={inputRef} />
            </div>
          )}
          <div className="absolute bottom-[calc(env(safe-area-inset-bottom)_+_8.25rem)] right-4 z-20 max-w-[58%] sm:bottom-5 sm:right-5 sm:max-w-[62%]">
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
              <button data-testid="heathrow-interact" onClick={interact} className="min-h-12 rounded-full border border-amber-100/70 bg-amber-300 px-4 py-3 text-xs font-black leading-tight text-slate-950 shadow-[0_0_32px_rgba(252,211,77,.65)] active:scale-95 sm:px-6 sm:py-4 sm:text-sm">{label}<span className="ml-2 hidden opacity-70 sm:inline">E</span></button>
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
