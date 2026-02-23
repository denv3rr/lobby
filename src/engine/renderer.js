import * as THREE from "three";

const QUALITY_PROFILES = {
  low: {
    maxPixelRatio: 1,
    shadows: false,
    particleMultiplier: 0.35
  },
  medium: {
    maxPixelRatio: 1.5,
    shadows: true,
    particleMultiplier: 0.7
  },
  high: {
    maxPixelRatio: 2,
    shadows: true,
    particleMultiplier: 1
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

export function createRenderer({ mount, quality = "medium" }) {
  let activeQuality = quality;
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

  applyRendererQuality(renderer, activeQuality);
  mount.appendChild(renderer.domElement);

  function setQuality(nextQuality) {
    activeQuality = nextQuality;
    applyRendererQuality(renderer, activeQuality);
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    applyRendererQuality(renderer, activeQuality);
  }

  window.addEventListener("resize", onResize);

  return {
    scene,
    camera,
    renderer,
    getQualityProfile: (name) => QUALITY_PROFILES[name] || QUALITY_PROFILES.medium,
    setQuality,
    dispose() {
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      renderer.domElement.remove();
    }
  };
}
