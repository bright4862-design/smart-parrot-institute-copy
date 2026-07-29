import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import SmartParrotMascot from "../SmartParrotMascot";
import {
  HERO_MODEL_URL,
  HeroModelRuntime,
  REQUIRED_HERO_ANIMATIONS,
} from "./HeroModelRuntime";

const ANIMATION_LABELS = {
  hero_idle_loop: "Idle",
  hero_walk_loop: "Walk",
  hero_run_loop: "Run",
  hero_wave_once: "Wave",
  hero_listen_loop: "Listen",
  hero_celebrate_once: "Celebrate",
};

function isOneShot(name) {
  return name.endsWith("_once");
}

export default function HeroStage({ modelUrl = HERO_MODEL_URL, className = "" }) {
  const mountRef = useRef(null);
  const runtimeRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [activeAnimation, setActiveAnimation] = useState("hero_idle_loop");
  const [availableAnimations, setAvailableAnimations] = useState([]);
  const [validationWarnings, setValidationWarnings] = useState([]);

  const animationButtons = useMemo(
    () => REQUIRED_HERO_ANIMATIONS.filter((name) => availableAnimations.includes(name)),
    [availableAnimations],
  );

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    let disposed = false;
    let animationFrameId = 0;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f4f1ff");
    scene.fog = new THREE.Fog("#f4f1ff", 6, 14);

    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(3.2, 2.25, 5.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 3.8;
    controls.maxDistance = 8;
    controls.minPolarAngle = Math.PI * 0.24;
    controls.maxPolarAngle = Math.PI * 0.54;
    controls.target.set(0, 1.05, 0);

    scene.add(new THREE.HemisphereLight("#fff7ee", "#57647f", 2.1));

    const keyLight = new THREE.DirectionalLight("#fff4df", 3.2);
    keyLight.position.set(4, 7, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 20;
    keyLight.shadow.camera.left = -4;
    keyLight.shadow.camera.right = 4;
    keyLight.shadow.camera.top = 4;
    keyLight.shadow.camera.bottom = -4;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight("#806cff", 2.2);
    rimLight.position.set(-4, 3.5, -3);
    scene.add(rimLight);

    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(1.65, 1.8, 0.18, 64),
      new THREE.MeshStandardMaterial({
        color: "#e7e1ff",
        roughness: 0.72,
        metalness: 0.03,
      }),
    );
    platform.position.y = -0.11;
    platform.receiveShadow = true;
    scene.add(platform);

    const clock = new THREE.Clock();

    const resize = () => {
      const width = Math.max(mount.clientWidth, 1);
      const height = Math.max(mount.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const renderLoop = () => {
      animationFrameId = window.requestAnimationFrame(renderLoop);
      const delta = Math.min(clock.getDelta(), 0.05);
      runtimeRef.current?.update(delta);
      controls.update();
      renderer.render(scene, camera);
    };
    renderLoop();

    const loadHero = async () => {
      setStatus("loading");
      setErrorMessage("");

      try {
        const runtime = new HeroModelRuntime({ modelUrl });
        runtimeRef.current = runtime;
        const result = await runtime.load();

        if (disposed) {
          runtime.dispose();
          return;
        }

        const model = result.model;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const targetHeight = 2.65;
        const scale = size.y > 0 ? targetHeight / size.y : 1;

        model.scale.setScalar(scale);
        model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
        scene.add(model);

        const warnings = [
          ...result.validation.missingNodes.map((name) => `Missing node: ${name}`),
          ...result.validation.missingAnimations.map((name) => `Missing animation: ${name}`),
        ];

        setAvailableAnimations(result.animations);
        setValidationWarnings(warnings);
        setActiveAnimation(
          result.animations.includes("hero_idle_loop") ? "hero_idle_loop" : result.animations[0] || "",
        );
        setStatus("ready");
      } catch (error) {
        if (disposed) return;
        console.error("Unable to load hero model", error);
        setErrorMessage(error instanceof Error ? error.message : "The hero model could not be loaded.");
        setStatus("fallback");
      }
    };

    loadHero();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      controls.dispose();
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
      platform.geometry.dispose();
      platform.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [modelUrl]);

  const playAnimation = (name) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;

    const oneShot = isOneShot(name);
    const played = runtime.play(name, {
      fadeDuration: 0.22,
      loop: !oneShot,
      clampWhenFinished: oneShot,
    });

    if (!played) return;
    setActiveAnimation(name);

    if (oneShot && runtime.mixer) {
      const onFinished = () => {
        runtime.mixer.removeEventListener("finished", onFinished);
        runtime.play("hero_idle_loop", { fadeDuration: 0.25, loop: true });
        setActiveAnimation("hero_idle_loop");
      };
      runtime.mixer.addEventListener("finished", onFinished);
    }
  };

  return (
    <section
      className={`overflow-hidden rounded-[32px] border border-violet-100 bg-white shadow-[0_24px_80px_rgba(72,52,140,0.16)] ${className}`}
      aria-label="Interactive Smart Parrot hero preview"
    >
      <div className="relative min-h-[520px] bg-gradient-to-b from-violet-50 via-white to-indigo-50">
        <div ref={mountRef} className="absolute inset-0" />

        {status === "loading" && (
          <div className="absolute inset-0 grid place-items-center bg-white/72 backdrop-blur-sm">
            <div className="rounded-2xl border border-violet-100 bg-white px-5 py-4 text-center shadow-lg">
              <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
              <p className="font-semibold text-slate-800">Preparing the traveler…</p>
              <p className="mt-1 text-sm text-slate-500">Loading the game-ready hero model</p>
            </div>
          </div>
        )}

        {status === "fallback" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-violet-50 to-white p-6 text-center">
            <SmartParrotMascot compact />
            <div>
              <p className="font-semibold text-slate-800">3D hero slot is ready</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                Add <code className="rounded bg-violet-100 px-1.5 py-0.5">hero_v1.glb</code> to the runtime asset folder and this stage will switch from the illustrated fallback automatically.
              </p>
              {errorMessage && <p className="mt-2 text-xs text-slate-400">{errorMessage}</p>}
            </div>
          </div>
        )}

        {status === "ready" && (
          <div className="pointer-events-none absolute left-5 top-5 rounded-full border border-white/70 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur">
            Drag to rotate · Pinch to zoom
          </div>
        )}
      </div>

      <div className="border-t border-violet-100 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          {animationButtons.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => playAnimation(name)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeAnimation === name
                  ? "bg-violet-600 text-white shadow-md shadow-violet-200"
                  : "bg-violet-50 text-violet-700 hover:bg-violet-100"
              }`}
            >
              {ANIMATION_LABELS[name] || name}
            </button>
          ))}

          {status !== "ready" && (
            <span className="text-sm text-slate-500">Animation controls will activate when the GLB is present.</span>
          )}
        </div>

        {validationWarnings.length > 0 && (
          <details className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <summary className="cursor-pointer font-semibold">Asset contract warnings</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {validationWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
