import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export const HERO_MODEL_URL = "/assets/characters/hero/runtime/hero_v1.glb";
export const HERO_FALLBACK_ANIMATION = "hero_idle_loop";

export const REQUIRED_HERO_NODES = [
  "HeroRoot",
  "HeroArmature",
  "HeroBody",
  "HeroBackpack",
  "HeroSuitcase",
];

export const REQUIRED_HERO_ANIMATIONS = [
  "hero_idle_loop",
  "hero_walk_loop",
  "hero_run_loop",
  "hero_wave_once",
  "hero_listen_loop",
  "hero_celebrate_once",
];

export function validateHeroGltf(gltf) {
  const nodeNames = new Set();
  gltf.scene.traverse((node) => {
    if (node.name) nodeNames.add(node.name);
  });

  const animationNames = new Set(gltf.animations.map((clip) => clip.name));
  const missingNodes = REQUIRED_HERO_NODES.filter((name) => !nodeNames.has(name));
  const missingAnimations = REQUIRED_HERO_ANIMATIONS.filter(
    (name) => !animationNames.has(name),
  );

  return {
    valid: missingNodes.length === 0 && missingAnimations.length === 0,
    missingNodes,
    missingAnimations,
    nodeNames: [...nodeNames],
    animationNames: [...animationNames],
  };
}

export class HeroModelRuntime {
  constructor({ modelUrl = HERO_MODEL_URL, logger = console } = {}) {
    this.modelUrl = modelUrl;
    this.logger = logger;
    this.loader = new GLTFLoader();
    this.gltf = null;
    this.model = null;
    this.mixer = null;
    this.actions = new Map();
    this.currentAction = null;
    this.validation = null;
  }

  async load() {
    const gltf = await this.loader.loadAsync(this.modelUrl);
    this.validation = validateHeroGltf(gltf);

    if (!this.validation.valid) {
      this.logger.warn("Hero GLB failed contract validation", this.validation);
    }

    this.gltf = gltf;
    this.model = gltf.scene;
    this.model.name ||= "HeroRoot";

    this.model.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
        node.frustumCulled = true;
      }
    });

    this.mixer = new THREE.AnimationMixer(this.model);
    gltf.animations.forEach((clip) => {
      this.actions.set(clip.name, this.mixer.clipAction(clip));
    });

    if (this.actions.has(HERO_FALLBACK_ANIMATION)) {
      this.play(HERO_FALLBACK_ANIMATION, { fadeDuration: 0 });
    }

    return {
      model: this.model,
      validation: this.validation,
      animations: [...this.actions.keys()],
    };
  }

  hasAnimation(name) {
    return this.actions.has(name);
  }

  play(name, { fadeDuration = 0.2, loop = true, clampWhenFinished = false } = {}) {
    const nextAction = this.actions.get(name);

    if (!nextAction) {
      this.logger.warn(`Hero animation not found: ${name}`);
      return false;
    }

    if (this.currentAction === nextAction) return true;

    nextAction.reset();
    nextAction.enabled = true;
    nextAction.setEffectiveTimeScale(1);
    nextAction.setEffectiveWeight(1);
    nextAction.clampWhenFinished = clampWhenFinished;
    nextAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);

    if (this.currentAction && fadeDuration > 0) {
      this.currentAction.fadeOut(fadeDuration);
      nextAction.fadeIn(fadeDuration);
    }

    nextAction.play();
    this.currentAction = nextAction;
    return true;
  }

  update(deltaSeconds) {
    this.mixer?.update(deltaSeconds);
  }

  dispose() {
    this.mixer?.stopAllAction();

    this.model?.traverse((node) => {
      if (!node.isMesh) return;
      node.geometry?.dispose?.();

      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.filter(Boolean).forEach((material) => {
        Object.values(material).forEach((value) => {
          if (value?.isTexture) value.dispose();
        });
        material.dispose?.();
      });
    });

    this.actions.clear();
    this.currentAction = null;
    this.mixer = null;
    this.model = null;
    this.gltf = null;
  }
}
