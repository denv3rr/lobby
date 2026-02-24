import * as THREE from "three";
import "./style.css";

import { AssetCache } from "./engine/assetCache.js";
import { createRenderer, detectAutoQuality } from "./engine/renderer.js";
import { loadScene } from "./engine/sceneLoader.js";
import { DesktopControls } from "./systems/controls/desktopControls.js";
import { MobileControls } from "./systems/controls/mobileControls.js";
import { PortalInteractionSystem } from "./systems/interactions/portalInteractions.js";
import { AudioSystem } from "./systems/audio/audioSystem.js";
import { resolveInitialThemeName, ThemeSystem } from "./systems/theming/applyTheme.js";
import { createOverlay } from "./ui/overlay.js";
import { createPerfHud } from "./ui/perfHud.js";
import { resolvePublicPath } from "./utils/path.js";

const BUILD_ID = import.meta.env.VITE_BUILD_ID || "";
const THEME_STORAGE_KEY = "lobby.theme.v1";
const QUALITY_STORAGE_KEY = "lobby.quality.v1";
const LEGACY_DEV_THEME_STORAGE_KEY = "lobby.dev.theme";
const LEGACY_DEV_QUALITY_STORAGE_KEY = "lobby.dev.quality";
const VALID_QUALITY_VALUES = new Set(["low", "medium", "high"]);

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

function withBuildId(path) {
  if (!BUILD_ID) {
    return path;
  }

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}v=${encodeURIComponent(BUILD_ID)}`;
}

async function loadJson(path) {
  const response = await fetch(withBuildId(resolvePublicPath(path)), {
    cache: "no-cache"
  });
  if (!response.ok) {
    throw new Error(`Failed loading ${path}: ${response.status}`);
  }
  return response.json();
}

async function loadRuntimeConfig(fileName) {
  try {
    return await loadJson(`config/${fileName}`);
  } catch {
    return loadJson(`config.defaults/${fileName}`);
  }
}

async function loadOptionalRuntimeConfig(fileName) {
  try {
    return await loadRuntimeConfig(fileName);
  } catch {
    return null;
  }
}

async function loadOptionalJson(path) {
  try {
    return await loadJson(path);
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

function mergeThemesConfig(defaultsConfig, overrideConfig) {
  const defaults = hasThemeMap(defaultsConfig) ? defaultsConfig : { themes: {} };
  const overrides = hasThemeMap(overrideConfig) ? overrideConfig : { themes: {} };

  const mergedThemes = {
    ...(defaults.themes || {})
  };

  for (const [themeId, themeValue] of Object.entries(overrides.themes || {})) {
    mergedThemes[themeId] = {
      ...(defaults.themes?.[themeId] || {}),
      ...(themeValue || {})
    };
  }

  return {
    ...defaults,
    ...overrides,
    autoThemeByMonth: {
      ...(defaults.autoThemeByMonth || {}),
      ...(overrides.autoThemeByMonth || {}),
      map: {
        ...(defaults.autoThemeByMonth?.map || {}),
        ...(overrides.autoThemeByMonth?.map || {})
      }
    },
    themes: mergedThemes,
    defaultTheme:
      overrides.defaultTheme ||
      defaults.defaultTheme ||
      Object.keys(mergedThemes)[0] ||
      "lobby"
  };
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

function getThemeAmbientMix(themesConfig, themeName) {
  if (!themesConfig?.themes || !themeName) {
    return {};
  }
  const mix = themesConfig.themes[themeName]?.ambientAudioMix;
  if (!mix || typeof mix !== "object") {
    return {};
  }
  return { ...mix };
}

function getSafeStorage() {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStorageString(keys) {
  const storage = getSafeStorage();
  if (!storage) {
    return null;
  }

  const candidates = Array.isArray(keys) ? keys : [keys];
  for (const key of candidates) {
    if (typeof key !== "string" || !key.trim()) {
      continue;
    }
    let value = null;
    try {
      value = storage.getItem(key);
    } catch {
      return null;
    }
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

function writeStorageString(key, value) {
  if (typeof key !== "string" || !key.trim()) {
    return false;
  }

  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    return false;
  }

  const storage = getSafeStorage();
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(key, normalized);
    return true;
  } catch {
    return false;
  }
}

function normalizeQualityValue(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return VALID_QUALITY_VALUES.has(normalized) ? normalized : null;
}

function loadSavedThemeSelection() {
  const stable = readStorageString(THEME_STORAGE_KEY);
  if (stable) {
    return stable;
  }

  const legacy = readStorageString(LEGACY_DEV_THEME_STORAGE_KEY);
  if (legacy) {
    writeStorageString(THEME_STORAGE_KEY, legacy);
  }
  return legacy;
}

function saveThemeSelection(themeId, options = {}) {
  const normalized = typeof themeId === "string" ? themeId.trim() : "";
  if (!normalized) {
    return false;
  }

  const shouldMirrorLegacy = Boolean(options.mirrorLegacyDevKey);
  if (shouldMirrorLegacy) {
    writeStorageString(LEGACY_DEV_THEME_STORAGE_KEY, normalized);
  }

  return writeStorageString(THEME_STORAGE_KEY, normalized);
}

function loadSavedQualitySelection() {
  const stable = normalizeQualityValue(readStorageString(QUALITY_STORAGE_KEY));
  if (stable) {
    return stable;
  }

  const legacy = normalizeQualityValue(readStorageString(LEGACY_DEV_QUALITY_STORAGE_KEY));
  if (legacy) {
    writeStorageString(QUALITY_STORAGE_KEY, legacy);
  }
  return legacy;
}

function saveQualitySelection(quality, options = {}) {
  const normalized = normalizeQualityValue(quality);
  if (!normalized) {
    return false;
  }

  const shouldMirrorLegacy = Boolean(options.mirrorLegacyDevKey);
  if (shouldMirrorLegacy) {
    writeStorageString(LEGACY_DEV_QUALITY_STORAGE_KEY, normalized);
  }

  return writeStorageString(QUALITY_STORAGE_KEY, normalized);
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

function getFallbackLinks(sceneConfig) {
  const links = [];
  const portals = Array.isArray(sceneConfig?.portals) ? sceneConfig.portals : [];
  for (const portal of portals) {
    const url = typeof portal?.url === "string" ? portal.url.trim() : "";
    if (!url) {
      continue;
    }
    const label =
      typeof portal?.label === "string" && portal.label.trim() ? portal.label.trim() : url;
    links.push({ label, url });
  }
  return links;
}

function getBootErrorMessage(error) {
  if (error instanceof Error && typeof error.message === "string" && error.message.trim()) {
    return error.message.trim();
  }
  return "Unexpected boot error.";
}

async function boot() {
  const app = document.querySelector("#app");
  if (!app) {
    throw new Error("Missing #app mount node.");
  }
  const mobile = isMobileDevice();
  const isDev = import.meta.env.DEV;
  const params = new URLSearchParams(window.location.search);
  const hasThemeQuery = params.has("theme");
  const debugUiParam = params.get("debugui") === "1";
  const sceneUiEnabled = params.get("sceneui") !== "0";
  const perfEnabled = params.get("perf") === "1";

  let rendererContext = null;
  let controls = null;
  let interactionSystem = null;
  let themeSystem = null;
  let catalogSystem = null;
  let sceneContext = null;
  let audioSystem = null;
  let loadedThemesConfig = null;
  let availableThemeIds = [];
  let themeAmbientMixBase = {};
  let currentThemeName = null;
  let audioReady = false;
  let getInteractionTargets = () => [];
  let perfHud = null;
  let debugApiMounted = false;

  function applyThemeAmbientMix() {
    if (!audioSystem) {
      return;
    }
    audioSystem.setAmbientMix(themeAmbientMixBase);
  }

  const ui = createOverlay({
    mount: app,
    isMobile: mobile,
    showDevPanel: isDev || debugUiParam,
    showThemePanel: sceneUiEnabled,
    onEnableSound: async () => {
      if (audioSystem) {
        audioReady = await audioSystem.enable();
        if (audioReady) {
          ui.hideSoundGate();
        } else {
          ui.showSoundGate();
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
      currentThemeName = appliedTheme;
      themeAmbientMixBase = getThemeAmbientMix(loadedThemesConfig, appliedTheme);
      applyThemeAmbientMix();
      saveThemeSelection(appliedTheme, { mirrorLegacyDevKey: isDev });
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
      saveQualitySelection(quality, { mirrorLegacyDevKey: isDev });
    }
  });
  ui.hideFallback();
  ui.showLoading({
    title: "Entering Lobby",
    message: "Loading runtime configuration."
  });

  const [
    sceneConfig,
    localThemesConfig,
    defaultThemesConfig,
    audioConfig,
    catalogConfig,
    shopFeed,
    projectsFeed
  ] =
    await Promise.all([
    loadRuntimeConfig("scene.json"),
    loadOptionalJson("config/themes.json"),
      loadOptionalJson("config.defaults/themes.json"),
      loadRuntimeConfig("audio.json"),
      loadOptionalRuntimeConfig("catalog.json"),
      loadOptionalRuntimeConfig("shop-feed.json"),
      loadOptionalRuntimeConfig("projects-feed.json")
    ]);
  ui.setLoadingState({
    message: "Calibrating render pipeline."
  });
  const emergencyThemesConfig = {
    defaultTheme: "lobby",
    themes: {
      lobby: {
        label: "Lobby"
      }
    }
  };

  const mergedThemesConfig = mergeThemesConfig(defaultThemesConfig, localThemesConfig);
  if (hasThemeMap(mergedThemesConfig)) {
    loadedThemesConfig = mergedThemesConfig;
  } else {
    try {
      const defaults = await loadJson("config.defaults/themes.json");
      loadedThemesConfig = hasThemeMap(defaults) ? defaults : emergencyThemesConfig;
    } catch {
      loadedThemesConfig = emergencyThemesConfig;
    }
  }

  if (!supportsWebGL()) {
    const fallbackLinks = getFallbackLinks(sceneConfig);
    ui.hideLoading();
    ui.hideSoundGate();
    ui.showFallback(fallbackLinks, {
      title: "WebGL Unavailable",
      message:
        "3D rendering is unavailable on this device right now. Open a destination directly or retry boot.",
      retryLabel: "Retry Boot",
      onRetry: requestBootRetry
    });
    return;
  }

  const savedQuality = loadSavedQualitySelection();
  const quality = savedQuality || detectAutoQuality();
  ui.setQuality(quality);

  rendererContext = createRenderer({
    mount: ui.viewport,
    quality
  });
  ui.setLoadingState({
    message: "Assembling scene geometry."
  });
  if (perfEnabled) {
    perfHud = createPerfHud({ mount: app });
  }

  const cache = new AssetCache();
  const qualityProfile = rendererContext.getQualityProfile(quality);
  sceneContext = await loadScene({
    scene: rendererContext.scene,
    camera: rendererContext.camera,
    cache,
    sceneConfig,
    qualityProfile
  });
  ui.setLoadingState({
    message: "Linking portals and systems."
  });

  audioSystem = new AudioSystem(audioConfig);
  audioSystem.initialize();
  ui.showSoundGate();

  themeSystem = new ThemeSystem({
    scene: rendererContext.scene,
    sceneContext,
    cache,
    themesConfig: loadedThemesConfig,
    audioSystem,
    qualityProfile
  });
  const savedTheme = loadSavedThemeSelection();
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
      writeStorageString(LEGACY_DEV_THEME_STORAGE_KEY, appliedTheme);
    }
  } else {
    themeSystem.resetToBaseState();
    ui.setTheme(availableThemeIds[0] || "lobby");
  }
  currentThemeName = appliedTheme || availableThemeIds[0] || "lobby";
  themeAmbientMixBase = getThemeAmbientMix(loadedThemesConfig, currentThemeName);
  applyThemeAmbientMix();
  ui.hideStabilityMeter?.();
  ui.setObjectivesPanelVisible?.(false);

  const { CatalogRoomSystem } = await import("./systems/catalog/catalogRoomSystem.js");
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

  function getDebugStats() {
    const rendererInfo = rendererContext?.renderer?.info;
    const playerPos = sceneContext?.player?.position;
    const propStats = sceneContext?.getPropStats?.() || { total: 0, byTag: {} };
    return {
      theme: themeSystem?.currentThemeName || null,
      portalCount: (sceneContext?.portals || []).length,
      interactionTargetCount: getInteractionTargets().length,
      anyInteractionHit: interactionSystem?.debugFindAnyTargetHit?.()?.id || null,
      player: playerPos
        ? {
            x: Number(playerPos.x.toFixed(3)),
            y: Number(playerPos.y.toFixed(3)),
            z: Number(playerPos.z.toFixed(3))
          }
        : null,
      props: propStats,
      render: rendererInfo
        ? {
            calls: rendererInfo.render.calls,
            triangles: rendererInfo.render.triangles,
            points: rendererInfo.render.points,
            lines: rendererInfo.render.lines,
            geometries: rendererInfo.memory.geometries,
            textures: rendererInfo.memory.textures
          }
        : null,
      jsHeapMb: Number.isFinite(performance?.memory?.usedJSHeapSize)
        ? Number((performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1))
        : null
    };
  }

  window.__LOBBY_DEBUG = {
    getStats: () => getDebugStats(),
    setTheme: async (themeName) => {
      const resolved = await applyFirstWorkingTheme(themeSystem, [themeName, ...availableThemeIds]);
      if (resolved && catalogSystem) {
        await catalogSystem.applyTheme(resolved);
        interactionSystem?.setTargets(getInteractionTargets());
        currentThemeName = resolved;
        themeAmbientMixBase = getThemeAmbientMix(loadedThemesConfig, resolved);
        applyThemeAmbientMix();
      }
      return resolved;
    },
    findAnyTargetHit: () => interactionSystem?.debugFindAnyTargetHit?.()?.id || null,
    activateHoveredOrAnyTarget: () =>
      Boolean(interactionSystem?.debugActivateHoveredOrAnyTarget?.())
  };
  debugApiMounted = true;

  const clock = new THREE.Clock();
  let sceneInteractive = false;
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
    if (!sceneInteractive) {
      sceneInteractive = true;
      ui.hideLoading();
    }
    perfHud?.update({
      delta,
      stats: getDebugStats()
    });
  });

  window.addEventListener("beforeunload", () => {
    controls?.dispose?.();
    interactionSystem?.dispose?.();
    themeSystem?.dispose?.();
    catalogSystem?.dispose?.();
    audioSystem?.dispose?.();
    perfHud?.dispose?.();
    if (debugApiMounted) {
      delete window.__LOBBY_DEBUG;
    }
    rendererContext?.dispose?.();
  });

  catalogInitPromise.catch(() => {});
}

let bootInFlight = false;

function requestBootRetry() {
  attemptBoot().catch((error) => {
    console.error("Boot retry failed", error);
  });
}

async function attemptBoot() {
  if (bootInFlight) {
    return;
  }
  bootInFlight = true;
  try {
    await boot();
  } catch (error) {
    console.error("Lobby failed to load", error);

    const app = document.querySelector("#app");
    if (!app) {
      return;
    }

    const mobile = isMobileDevice();
    const isDev = import.meta.env.DEV;
    const params = new URLSearchParams(window.location.search);
    const debugUiParam = params.get("debugui") === "1";
    const sceneUiEnabled = params.get("sceneui") !== "0";
    const fallbackSceneConfig = await loadOptionalRuntimeConfig("scene.json");
    const fallbackLinks = getFallbackLinks(fallbackSceneConfig);

    const ui = createOverlay({
      mount: app,
      isMobile: mobile,
      showDevPanel: isDev || debugUiParam,
      showThemePanel: sceneUiEnabled,
      onEnableSound: async () => {},
      onThemeChange: () => {},
      onQualityChange: () => {}
    });
    ui.hideLoading();
    ui.hideSoundGate();
    ui.showFallback(fallbackLinks, {
      title: "Lobby failed to load",
      message: "Boot sequence was interrupted. Retry boot or use direct links.",
      detail: getBootErrorMessage(error),
      retryLabel: "Retry Boot",
      onRetry: requestBootRetry
    });
  } finally {
    bootInFlight = false;
  }
}

attemptBoot().catch((error) => {
  console.error("Boot controller failure", error);
});
