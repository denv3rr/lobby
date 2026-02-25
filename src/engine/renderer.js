import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
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
    maxPixelRatio: 1,
    shadows: false,
    particleMultiplier: 0.35,
    postProcessing: {
      enabled: false
    }
  },
  medium: {
    maxPixelRatio: 1.5,
    shadows: true,
    particleMultiplier: 0.7,
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
    maxPixelRatio: 2,
    shadows: true,
    particleMultiplier: 1,
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio));
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

export function createRenderer({ mount, quality = "medium" }) {
  let activeQuality = quality;
  let activePostOverrides = {};
  let useComposer = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    72,
    window.innerWidth / window.innerHeight,
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
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.62,
    0.84,
    0.22
  );
  composer.addPass(bloomPass);

  const vignettePass = new ShaderPass(VIGNETTE_SHADER);
  composer.addPass(vignettePass);

  function applyCurrentSettings() {
    const profile = QUALITY_PROFILES[activeQuality] || QUALITY_PROFILES.medium;
    applyRendererQuality(renderer, activeQuality);
    composer.setPixelRatio?.(renderer.getPixelRatio());
    composer.setSize(window.innerWidth, window.innerHeight);

    const post = resolvePostProcessingSettings(profile, activePostOverrides);
    useComposer = post.enabled !== false;

    bloomPass.enabled = useComposer && post.bloomEnabled !== false;
    bloomPass.strength = post.bloomStrength ?? bloomPass.strength;
    bloomPass.radius = post.bloomRadius ?? bloomPass.radius;
    bloomPass.threshold = post.bloomThreshold ?? bloomPass.threshold;

    vignettePass.enabled = useComposer && post.vignetteEnabled !== false;
    vignettePass.uniforms.offset.value = post.vignetteOffset ?? vignettePass.uniforms.offset.value;
    vignettePass.uniforms.darkness.value =
      post.vignetteDarkness ?? vignettePass.uniforms.darkness.value;
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
    if (useComposer) {
      composer.render();
      return;
    }
    renderer.render(scene, camera);
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    applyCurrentSettings();
  }

  window.addEventListener("resize", onResize);

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
    render,
    setQuality,
    setPostProcessingOverrides,
    dispose() {
      window.removeEventListener("resize", onResize);
      composer.dispose?.();
      renderer.dispose();
      renderer.domElement.remove();
    }
  };
}
