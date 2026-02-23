import * as THREE from "three";
import "./style.css";

import { AssetCache } from "./engine/assetCache.js";
import { createRenderer, detectAutoQuality } from "./engine/renderer.js";
import { loadScene } from "./engine/sceneLoader.js";
import { DesktopControls } from "./systems/controls/desktopControls.js";
import { MobileControls } from "./systems/controls/mobileControls.js";
import { PortalInteractionSystem } from "./systems/interactions/portalInteractions.js";
import { CatalogRoomSystem } from "./systems/catalog/catalogRoomSystem.js";
import { AudioSystem } from "./systems/audio/audioSystem.js";
import { resolveInitialThemeName, ThemeSystem } from "./systems/theming/applyTheme.js";
import { createOverlay } from "./ui/overlay.js";
import { resolvePublicPath } from "./utils/path.js";

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function isMobileDevice() {
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
  );
}

async function loadJson(path) {
  const response = await fetch(resolvePublicPath(path));
  if (!response.ok) {
    throw new Error(`Failed loading ${path}: ${response.status}`);
  }
  return response.json();
}

async function loadRuntimeConfig(fileName) {
  if (import.meta.env.PROD) {
    return loadJson(`config.defaults/${fileName}`);
  }
  try {
    return await loadJson(`config/${fileName}`);
  } catch {
    return loadJson(`config.defaults/${fileName}`);
  }
}

async function loadOptionalRuntimeConfig(fileName) {
  if (import.meta.env.PROD) {
    try {
      return await loadJson(`config.defaults/${fileName}`);
    } catch {
      return null;
    }
  }
  try {
    return await loadRuntimeConfig(fileName);
  } catch {
    return null;
  }
}

function getSurfaceAtPosition(zones, position) {
  for (const zone of zones || []) {
    if (zone.shape !== "box") {
      continue;
    }

    const [sx, sy, sz] = zone.size || [0, 0, 0];
    const [px, py, pz] = zone.position || [0, 0, 0];
    const insideX = Math.abs(position.x - px) <= sx * 0.5;
    const insideY = Math.abs(position.y - py) <= sy * 0.5;
    const insideZ = Math.abs(position.z - pz) <= sz * 0.5;
    if (insideX && insideY && insideZ) {
      return zone.surface || "tile";
    }
  }

  return "tile";
}

function hasThemeMap(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      value.themes &&
      typeof value.themes === "object" &&
      Object.keys(value.themes).length > 0
  );
}

function formatThemeLabel(id) {
  if (!id) {
    return "Lobby";
  }
  return id
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeThemeEntries(entries, themesConfig) {
  const seen = new Set();
  const output = [];
  const source = Array.isArray(entries) ? entries : [];

  for (const entry of source) {
    const id = typeof entry?.id === "string" ? entry.id.trim() : "";
    if (!id || seen.has(id)) {
      continue;
    }
    const label =
      typeof entry?.label === "string" && entry.label.trim()
        ? entry.label.trim()
        : formatThemeLabel(id);
    output.push({ id, label });
    seen.add(id);
  }

  if (!output.length && themesConfig?.themes && typeof themesConfig.themes === "object") {
    for (const id of Object.keys(themesConfig.themes)) {
      if (!id || seen.has(id)) {
        continue;
      }
      output.push({
        id,
        label: formatThemeLabel(id)
      });
      seen.add(id);
    }
  }

  if (!output.length) {
    output.push({ id: "lobby", label: "Lobby" });
  }

  return output;
}

async function applyFirstWorkingTheme(themeSystem, candidates) {
  const seen = new Set();
  for (const candidate of candidates || []) {
    const id = typeof candidate === "string" ? candidate.trim() : "";
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const applied = await themeSystem.applyTheme(id);
    if (applied) {
      return id;
    }
  }
  return null;
}

async function boot() {
  const app = document.querySelector("#app");
  const mobile = isMobileDevice();
  const isDev = import.meta.env.DEV;
  const params = new URLSearchParams(window.location.search);
  const hasThemeQuery = params.has("theme");
  const debugUiParam = params.get("debugui") === "1";

  let rendererContext = null;
  let controls = null;
  let interactionSystem = null;
  let themeSystem = null;
  let catalogSystem = null;
  let sceneContext = null;
  let audioSystem = null;
  let loadedThemesConfig = null;
  let availableThemeIds = [];
  let audioReady = false;
  let removeAutoUnlock = null;
  let getInteractionTargets = () => [];

  const ui = createOverlay({
    mount: app,
    isMobile: mobile,
    showDevPanel: isDev || debugUiParam,
    onEnableSound: async () => {
      if (audioSystem) {
        audioReady = await audioSystem.enable();
        if (audioReady && removeAutoUnlock) {
          removeAutoUnlock();
          removeAutoUnlock = null;
        }
      }
    },
    onThemeChange: async (themeName) => {
      let appliedTheme = themeName;
      if (themeSystem) {
        const candidates = [themeName, loadedThemesConfig?.defaultTheme, ...availableThemeIds];
        const resolved = await applyFirstWorkingTheme(themeSystem, candidates);
        if (resolved) {
          appliedTheme = resolved;
        } else {
          themeSystem.resetToBaseState();
          appliedTheme = availableThemeIds[0] || "lobby";
        }
        ui.setTheme(appliedTheme);
      }
      if (catalogSystem) {
        await catalogSystem.applyTheme(appliedTheme);
        interactionSystem?.setTargets(getInteractionTargets());
      }
      if (isDev) {
        localStorage.setItem("lobby.dev.theme", appliedTheme);
      }
    },
    onQualityChange: (quality) => {
      if (rendererContext) {
        rendererContext.setQuality(quality);
      }
      if (themeSystem?.sceneContext && rendererContext) {
        const profile = rendererContext.getQualityProfile(quality);
        for (const light of themeSystem.sceneContext.lights) {
          if (light.isPointLight) {
            light.castShadow = Boolean(light.userData.canCastShadow && profile.shadows);
          }
        }
      }
      if (themeSystem && rendererContext) {
        themeSystem.setQualityProfile(rendererContext.getQualityProfile(quality));
      }
      if (isDev) {
        localStorage.setItem("lobby.dev.quality", quality);
      }
    }
  });

  const [sceneConfig, themesConfig, audioConfig, catalogConfig, shopFeed, projectsFeed] =
    await Promise.all([
    loadRuntimeConfig("scene.json"),
    loadRuntimeConfig("themes.json"),
      loadRuntimeConfig("audio.json"),
      loadOptionalRuntimeConfig("catalog.json"),
      loadOptionalRuntimeConfig("shop-feed.json"),
      loadOptionalRuntimeConfig("projects-feed.json")
    ]);
  const emergencyThemesConfig = {
    defaultTheme: "lobby",
    themes: {
      lobby: {
        label: "Lobby"
      }
    }
  };
  if (hasThemeMap(themesConfig)) {
    loadedThemesConfig = themesConfig;
  } else {
    try {
      const defaults = await loadJson("config.defaults/themes.json");
      loadedThemesConfig = hasThemeMap(defaults) ? defaults : emergencyThemesConfig;
    } catch {
      loadedThemesConfig = emergencyThemesConfig;
    }
  }

  if (!supportsWebGL()) {
    const fallbackLinks =
      sceneConfig.portals?.map((portal) => ({
        label: portal.label,
        url: portal.url
      })) || [];
    ui.hideSoundGate();
    ui.showFallback(fallbackLinks);
    return;
  }

  const savedQuality = isDev ? localStorage.getItem("lobby.dev.quality") : null;
  const quality =
    savedQuality && ["low", "medium", "high"].includes(savedQuality)
      ? savedQuality
      : detectAutoQuality();
  ui.setQuality(quality);

  rendererContext = createRenderer({
    mount: ui.viewport,
    quality
  });

  const cache = new AssetCache();
  const qualityProfile = rendererContext.getQualityProfile(quality);
  sceneContext = await loadScene({
    scene: rendererContext.scene,
    camera: rendererContext.camera,
    cache,
    sceneConfig,
    qualityProfile
  });

  audioSystem = new AudioSystem(audioConfig);
  audioSystem.initialize();
  audioReady = await audioSystem.autoEnable();

  if (!audioReady) {
    const unlockAudio = async () => {
      if (audioReady) {
        return;
      }
      audioReady = await audioSystem.enable();
      if (audioReady) {
        ui.hideSoundGate();
        if (removeAutoUnlock) {
          removeAutoUnlock();
          removeAutoUnlock = null;
        }
      } else {
        ui.showSoundGate();
      }
    };

    const handlePointer = () => {
      unlockAudio();
    };
    const handleKey = () => {
      unlockAudio();
    };

    window.addEventListener("pointerdown", handlePointer, { passive: true });
    window.addEventListener("keydown", handleKey);
    removeAutoUnlock = () => {
      window.removeEventListener("pointerdown", handlePointer);
      window.removeEventListener("keydown", handleKey);
    };
    ui.showSoundGate();
  }

  themeSystem = new ThemeSystem({
    scene: rendererContext.scene,
    sceneContext,
    cache,
    themesConfig: loadedThemesConfig,
    audioSystem,
    qualityProfile
  });
  const savedTheme = isDev ? localStorage.getItem("lobby.dev.theme") : null;
  let themeName = resolveInitialThemeName(loadedThemesConfig);
  const themeEntries = normalizeThemeEntries(themeSystem.listThemes(), loadedThemesConfig);
  availableThemeIds = themeEntries.map((entry) => entry.id);
  if (
    !hasThemeQuery &&
    savedTheme &&
    availableThemeIds.includes(savedTheme)
  ) {
    themeName = savedTheme;
  }
  if (!themeName || !availableThemeIds.includes(themeName)) {
    themeName = availableThemeIds[0];
  }

  ui.setThemeOptions(themeEntries, themeName);
  const appliedTheme = await applyFirstWorkingTheme(themeSystem, [
    themeName,
    loadedThemesConfig.defaultTheme,
    ...availableThemeIds
  ]);
  if (appliedTheme) {
    ui.setTheme(appliedTheme);
    if (isDev) {
      localStorage.setItem("lobby.dev.theme", appliedTheme);
    }
  } else {
    themeSystem.resetToBaseState();
    ui.setTheme(availableThemeIds[0] || "lobby");
  }

  catalogSystem = new CatalogRoomSystem({
    scene: rendererContext.scene,
    cache,
    catalogConfig: catalogConfig || {},
    shopFeed: shopFeed || { items: [] },
    projectsFeed: projectsFeed || { items: [] },
    domElement: rendererContext.renderer.domElement
  });
  let catalogReady = false;
  const catalogInitPromise = catalogSystem
    .initialize(appliedTheme || themeName)
    .then(() => {
      catalogReady = true;
      interactionSystem?.setTargets(getInteractionTargets());
    })
    .catch((error) => {
      console.error("Catalog failed to initialize", error);
    });

  getInteractionTargets = () => [
    ...(sceneContext?.portals || []),
    ...(catalogSystem?.getTargets() || [])
  ];
  const getPlayerColliders = () => [
    ...(sceneContext?.getColliders?.() || []),
    ...(catalogSystem?.getColliders?.() || [])
  ];

  controls = mobile
    ? new MobileControls({
        domElement: rendererContext.renderer.domElement,
        camera: rendererContext.camera,
        player: sceneContext.player,
        pitch: sceneContext.pitch,
        floorY: sceneContext.floorY,
        roomBounds: sceneContext.roomBounds,
        getColliders: getPlayerColliders,
        onMoveDistance: (distance) => audioSystem?.registerMovementDistance(distance)
      })
    : new DesktopControls({
        domElement: rendererContext.renderer.domElement,
        camera: rendererContext.camera,
        player: sceneContext.player,
        pitch: sceneContext.pitch,
        roomBounds: sceneContext.roomBounds,
        getColliders: getPlayerColliders,
        onMoveDistance: (distance) => audioSystem?.registerMovementDistance(distance),
        onPointerLockChange: (locked) => ui.setPointerLockState(locked)
      });

  interactionSystem = new PortalInteractionSystem({
    domElement: rendererContext.renderer.domElement,
    camera: rendererContext.camera,
    targets: getInteractionTargets(),
    isPointerLocked: () => controls?.isPointerLocked?.() || false,
    onHover: (portal) => {
      ui.setPortalPrompt(portal);
    },
    onActivate: (portal) => {
      const popup = window.open(portal.url, "_blank", "noopener,noreferrer");
      if (!popup) {
        window.location.href = portal.url;
      }
    }
  });
  if (catalogReady) {
    interactionSystem.setTargets(getInteractionTargets());
  }

  const clock = new THREE.Clock();
  rendererContext.renderer.setAnimationLoop(() => {
    const delta = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.elapsedTime;
    controls?.update(delta);
    interactionSystem?.update();
    for (const portal of sceneContext.portals || []) {
      portal.update?.(delta, elapsed);
    }
    sceneContext.updateDynamicProps?.(elapsed, rendererContext.camera);
    catalogSystem?.update(delta, elapsed);
    themeSystem?.update(delta);

    const surface = getSurfaceAtPosition(sceneContext.zones, sceneContext.player.position);
    audioSystem?.setSurface(surface);
    audioSystem?.updateZones(sceneContext.player.position);

    rendererContext.renderer.render(rendererContext.scene, rendererContext.camera);
  });

  window.addEventListener("beforeunload", () => {
    if (removeAutoUnlock) {
      removeAutoUnlock();
    }
    controls?.dispose?.();
    interactionSystem?.dispose?.();
    themeSystem?.dispose?.();
    catalogSystem?.dispose?.();
    audioSystem?.dispose?.();
    rendererContext?.dispose?.();
  });

  catalogInitPromise.catch(() => {});
}

boot().catch((error) => {
  const app = document.querySelector("#app");
  app.innerHTML = `
    <div style="padding:1rem;font-family:Trebuchet MS, Verdana, sans-serif;">
      <h2>Lobby failed to load</h2>
      <p>${error.message}</p>
    </div>
  `;
});
