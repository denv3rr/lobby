import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const VIGNETTE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    offset: { value: 1.15 },
    darkness: { value: 0.8 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - 0.5) * offset;
      float vignette = smoothstep(0.82, 0.25, dot(uv, uv));
      color.rgb *= mix(darkness, 1.0, vignette);
      gl_FragColor = color;
    }
  `
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const QUALITY_PROFILES = {
  low: {
    renderScale: 0.72,
    maxPixelRatio: 1,
    shadows: false,
    particleMultiplier: 0,
    atmosphereEnabled: false,
    animatedTextureFps: 12,
    catalogCardLightBudget: 0,
    catalogCardGlow: false,
    catalogCardFloat: false,
    catalogMaterialMode: "basic",
    catalogThumbnails: false,
    sceneGlowLightBudget: 0,
    managedVisibility: false,
    directionalVisibility: false,
    visibilityUpdateInterval: 0.14,
    postProcessing: {
      enabled: false
    }
  },
  medium: {
    renderScale: 0.94,
    maxPixelRatio: 1.5,
    shadows: true,
    particleMultiplier: 0.7,
    atmosphereEnabled: true,
    animatedTextureFps: 24,
    catalogCardLightBudget: 6,
    catalogCardGlow: true,
    catalogCardFloat: false,
    catalogMaterialMode: "standard",
    catalogThumbnails: true,
    sceneGlowLightBudget: 12,
    managedVisibility: false,
    directionalVisibility: false,
    visibilityUpdateInterval: 0.12,
    postProcessing: {
      enabled: true,
      bloomEnabled: true,
      bloomStrength: 0.45,
      bloomRadius: 0.72,
      bloomThreshold: 0.3,
      vignetteEnabled: true,
      vignetteDarkness: 0.78,
      vignetteOffset: 1.18
    }
  },
  high: {
    renderScale: 1,
    maxPixelRatio: 2,
    shadows: true,
    particleMultiplier: 1,
    atmosphereEnabled: true,
    animatedTextureFps: 30,
    catalogCardLightBudget: 12,
    catalogCardGlow: true,
    catalogCardFloat: true,
    catalogMaterialMode: "standard",
    catalogThumbnails: true,
    sceneGlowLightBudget: 24,
    managedVisibility: false,
    directionalVisibility: false,
    visibilityUpdateInterval: 0.14,
    postProcessing: {
      enabled: true,
      bloomEnabled: true,
      bloomStrength: 0.62,
      bloomRadius: 0.84,
      bloomThreshold: 0.22,
      vignetteEnabled: true,
      vignetteDarkness: 0.74,
      vignetteOffset: 1.2
    }
  }
};

export function detectAutoQuality() {
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  const isMobile =
    window.matchMedia("(pointer: coarse)").matches ||
    /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);

  if (isMobile || cores <= 4 || memory <= 4) {
    return "low";
  }

  if (cores >= 8 && memory >= 8) {
    return "high";
  }

  return "medium";
}

function applyRendererQuality(renderer, quality) {
  const profile = QUALITY_PROFILES[quality] || QUALITY_PROFILES.medium;
  const deviceRatio = window.devicePixelRatio || 1;
  const baseRatio = Math.min(deviceRatio, profile.maxPixelRatio);
  const pixelRatio = Math.max(0.5, baseRatio * (profile.renderScale || 1));
  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.enabled = profile.shadows;
}

function normalizePostProcessingOverrides(overrides) {
  if (!isObject(overrides)) {
    return {};
  }

  const normalized = {};
  const booleanKeys = ["enabled", "bloomEnabled", "vignetteEnabled"];
  for (const key of booleanKeys) {
    if (typeof overrides[key] === "boolean") {
      normalized[key] = overrides[key];
    }
  }

  const numberSpecs = [
    ["bloomStrength", 0, 3],
    ["bloomRadius", 0, 2],
    ["bloomThreshold", 0, 1],
    ["vignetteDarkness", 0, 2],
    ["vignetteOffset", 0.5, 2]
  ];
  for (const [key, min, max] of numberSpecs) {
    const value = Number(overrides[key]);
    if (Number.isFinite(value)) {
      normalized[key] = clamp(value, min, max);
    }
  }

  return normalized;
}

function resolvePostProcessingSettings(profile, overrides) {
  return {
    ...(profile.postProcessing || {}),
    ...normalizePostProcessingOverrides(overrides)
  };
}

function getViewportSize(mount) {
  const bounds = mount?.getBoundingClientRect?.();
  const width = Math.max(
    1,
    Math.round(bounds?.width || mount?.clientWidth || window.innerWidth || 1)
  );
  const height = Math.max(
    1,
    Math.round(bounds?.height || mount?.clientHeight || window.innerHeight || 1)
  );
  return { width, height };
}

export function createRenderer({ mount, quality = "medium" }) {
  let activeQuality = quality;
  let activePostOverrides = {};
  let useComposer = false;
  let composer = null;
  let renderPass = null;
  let bloomPass = null;
  let vignettePass = null;
  let outputPass = null;
  let resizeObserver = null;
  const scene = new THREE.Scene();
  let viewportSize = getViewportSize(mount);
  const camera = new THREE.PerspectiveCamera(
    72,
    viewportSize.width / viewportSize.height,
    0.1,
    200
  );
  const renderer = new THREE.WebGLRenderer({
    antialias: quality !== "low",
    powerPreference: "high-performance"
  });

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.info.autoReset = false;
  renderer.setSize(viewportSize.width, viewportSize.height, false);
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.display = "block";

  function ensureComposer() {
    if (composer) {
      return composer;
    }

    composer = new EffectComposer(renderer);
    renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(viewportSize.width, viewportSize.height),
      0.62,
      0.84,
      0.22
    );
    composer.addPass(bloomPass);

    vignettePass = new ShaderPass(VIGNETTE_SHADER);
    composer.addPass(vignettePass);

    outputPass = new OutputPass();
    composer.addPass(outputPass);

    composer.setPixelRatio?.(renderer.getPixelRatio());
    composer.setSize(viewportSize.width, viewportSize.height);
    return composer;
  }

  function disposeComposer() {
    outputPass?.dispose?.();
    vignettePass?.dispose?.();
    bloomPass?.dispose?.();
    renderPass?.dispose?.();
    composer?.dispose?.();
    composer = null;
    renderPass = null;
    bloomPass = null;
    vignettePass = null;
    outputPass = null;
  }

  function applyCurrentSettings() {
    const profile = QUALITY_PROFILES[activeQuality] || QUALITY_PROFILES.medium;
    viewportSize = getViewportSize(mount);
    applyRendererQuality(renderer, activeQuality);

    const post = resolvePostProcessingSettings(profile, activePostOverrides);
    useComposer = post.enabled !== false;

    if (!useComposer) {
      disposeComposer();
      return;
    }

    ensureComposer();
    composer.setPixelRatio?.(renderer.getPixelRatio());
    composer.setSize(viewportSize.width, viewportSize.height);

    bloomPass.enabled = useComposer && post.bloomEnabled !== false;
    bloomPass.strength = post.bloomStrength ?? bloomPass.strength;
    bloomPass.radius = post.bloomRadius ?? bloomPass.radius;
    bloomPass.threshold = post.bloomThreshold ?? bloomPass.threshold;

    vignettePass.enabled = useComposer && post.vignetteEnabled !== false;
    vignettePass.uniforms.offset.value = post.vignetteOffset ?? vignettePass.uniforms.offset.value;
    vignettePass.uniforms.darkness.value =
      post.vignetteDarkness ?? vignettePass.uniforms.darkness.value;
    outputPass.enabled = useComposer;
  }

  applyCurrentSettings();
  mount.appendChild(renderer.domElement);

  function setQuality(nextQuality) {
    activeQuality = nextQuality;
    applyCurrentSettings();
  }

  function setPostProcessingOverrides(overrides = null) {
    activePostOverrides = normalizePostProcessingOverrides(overrides);
    applyCurrentSettings();
  }

  function render() {
    renderer.info.reset();
    if (useComposer) {
      composer.render();
      return;
    }
    renderer.render(scene, camera);
  }

  async function precompile() {
    try {
      if (typeof renderer.compileAsync === "function") {
        await renderer.compileAsync(scene, camera);
        return true;
      }
      if (typeof renderer.compile === "function") {
        renderer.compile(scene, camera);
        return true;
      }
    } catch (error) {
      console.warn("Renderer precompile skipped", error);
    }
    return false;
  }

  function onResize() {
    viewportSize = getViewportSize(mount);
    camera.aspect = viewportSize.width / viewportSize.height;
    camera.updateProjectionMatrix();
    renderer.setSize(viewportSize.width, viewportSize.height, false);
    applyCurrentSettings();
  }

  window.addEventListener("resize", onResize);
  if (typeof ResizeObserver === "function" && mount) {
    resizeObserver = new ResizeObserver(() => {
      onResize();
    });
    resizeObserver.observe(mount);
  }

  return {
    scene,
    camera,
    renderer,
    getQualityProfile: (name) => {
      const resolved = QUALITY_PROFILES[name] ? name : "medium";
      return {
        quality: resolved,
        ...QUALITY_PROFILES[resolved]
      };
    },
    precompile,
    render,
    setQuality,
    setPostProcessingOverrides,
    dispose() {
      window.removeEventListener("resize", onResize);
      resizeObserver?.disconnect?.();
      disposeComposer();
      renderer.dispose();
      renderer.domElement.remove();
    }
  };
}
