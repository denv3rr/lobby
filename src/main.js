import * as THREE from "three";
import "./style.css";

import { AssetCache } from "./engine/assetCache.js";
import { createRenderer, detectAutoQuality } from "./engine/renderer.js";
import { loadScene } from "./engine/sceneLoader.js";
import { DesktopControls } from "./systems/controls/desktopControls.js";
import { MobileControls } from "./systems/controls/mobileControls.js";
import { PortalInteractionSystem } from "./systems/interactions/portalInteractions.js";
import { AudioSystem } from "./systems/audio/audioSystem.js";
import { DriftEventsSystem } from "./systems/drift/driftEventsSystem.js";
import { StabilityObjectivesSystem } from "./systems/gameplay/stabilityObjectivesSystem.js";
import { resolveInitialThemeName, ThemeSystem } from "./systems/theming/applyTheme.js";
import { createOverlay } from "./ui/overlay.js";
import { createPerfHud } from "./ui/perfHud.js";
import { resolvePublicPath } from "./utils/path.js";

const BUILD_ID = import.meta.env.VITE_BUILD_ID || "";
const THEME_STORAGE_KEY = "lobby.theme.v1";
const QUALITY_STORAGE_KEY = "lobby.quality.v1";
const SECRET_UNLOCKS_STORAGE_KEY = "lobby.secret_unlocks.v1";
const LEGACY_DEV_THEME_STORAGE_KEY = "lobby.dev.theme";
const LEGACY_DEV_QUALITY_STORAGE_KEY = "lobby.dev.quality";
const VALID_QUALITY_VALUES = new Set(["low", "medium", "high"]);
const MAIN_OBJECTIVE_ID = "brainstorm_main_task";
const CENTER_ARTIFACT_TARGET_ID = "prop:center_hover_gif";

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

async function loadSceneConfig() {
  try {
    return await loadJson("config/scene.json");
  } catch {
    return loadJson("config.defaults/scene.json");
  }
}

async function loadOptionalSceneConfig() {
  try {
    return await loadSceneConfig();
  } catch {
    return null;
  }
}

async function loadDefaultConfig(fileName) {
  return loadJson(`config.defaults/${fileName}`);
}

async function loadOptionalDefaultConfig(fileName) {
  return loadOptionalJson(`config.defaults/${fileName}`);
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

function getThemePostProcessing(themesConfig, themeName) {
  if (!themesConfig?.themes || !themeName) {
    return {};
  }
  const postProcessing = themesConfig.themes[themeName]?.postProcessing;
  if (!postProcessing || typeof postProcessing !== "object") {
    return {};
  }
  return { ...postProcessing };
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(1, numeric));
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

function readStorageJson(key, fallback = null) {
  const raw = readStorageString(key);
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeStorageJson(key, value) {
  if (typeof key !== "string" || !key.trim()) {
    return false;
  }

  try {
    const serialized = JSON.stringify(value);
    return writeStorageString(key, serialized);
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

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function getUnlockedSecretIds() {
  const stored = readStorageJson(SECRET_UNLOCKS_STORAGE_KEY, null);
  const ids = Array.isArray(stored?.unlockedIds) ? stored.unlockedIds : [];
  const unique = [];
  const seen = new Set();
  for (const id of ids) {
    const normalized = typeof id === "string" ? id.trim() : "";
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    unique.push(normalized);
  }
  return unique;
}

function saveUnlockedSecretIds(ids) {
  const unique = [];
  const seen = new Set();
  for (const id of Array.isArray(ids) ? ids : []) {
    const normalized = typeof id === "string" ? id.trim() : "";
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    unique.push(normalized);
  }
  writeStorageJson(SECRET_UNLOCKS_STORAGE_KEY, { unlockedIds: unique });
}

function findZoneById(zones, zoneId) {
  const lookup = typeof zoneId === "string" ? zoneId.trim() : "";
  if (!lookup) {
    return null;
  }
  for (const zone of zones || []) {
    if (zone?.id === lookup) {
      return zone;
    }
  }
  return null;
}

function isPositionInsideBoxZone(zone, position) {
  if (!zone || zone.shape !== "box" || !position) {
    return false;
  }
  const [sx, sy, sz] = zone.size || [0, 0, 0];
  const [px, py, pz] = zone.position || [0, 0, 0];
  return (
    Math.abs(position.x - px) <= sx * 0.5 &&
    Math.abs(position.y - py) <= sy * 0.5 &&
    Math.abs(position.z - pz) <= sz * 0.5
  );
}

function normalizeSecretUnlocks(rawUnlocks, zones, unlockedIdSet) {
  const normalized = [];
  const seen = new Set();
  for (const entry of Array.isArray(rawUnlocks) ? rawUnlocks : []) {
    if (!isObject(entry)) {
      continue;
    }
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!id || seen.has(id)) {
      continue;
    }

    const zoneId = typeof entry.zoneId === "string" ? entry.zoneId.trim() : "";
    const zone = findZoneById(zones, zoneId);
    if (!zone) {
      continue;
    }

    const requiredEntries = Math.max(1, Math.round(Number(entry.requiredEntries) || 3));
    const cooldownSeconds = Math.max(0.1, Number(entry.cooldownSeconds) || 1.2);
    const unlocked = unlockedIdSet.has(id);
    const floorplan = isObject(entry.floorplan) ? cloneJson(entry.floorplan) : null;
    normalized.push({
      id,
      zoneId,
      zone,
      requiredEntries,
      cooldownMs: cooldownSeconds * 1000,
      message:
        typeof entry.message === "string" && entry.message.trim()
          ? entry.message.trim()
          : `Secret unlocked: ${id}`,
      floorplan,
      unlocked,
      hits: unlocked ? requiredEntries : 0,
      wasInside: false,
      nextEligibleAtMs: 0
    });
    seen.add(id);
  }
  return normalized;
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
  const allowThemeSelector = isDev && sceneUiEnabled;
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
  let themePostProcessingBase = {};
  let themeFogBase = null;
  let currentThemeName = null;
  let audioReady = false;
  let getInteractionTargets = () => [];
  let perfHud = null;
  let debugApiMounted = false;
  let driftSystem = null;
  let driftSnapshot = null;
  let stabilitySystem = null;
  let centerArtifactActivated = false;
  let centerArtifactOwner = null;
  let centerArtifactLight = null;
  const seenObjectivePortalIds = new Set();
  const centerArtifactMaterials = [];
  const centerArtifactPrimaryColor = new THREE.Color("#ffffff");
  const centerArtifactSecondaryColor = new THREE.Color("#ffffff");
  let secretUnlocks = [];
  const secretUnlockedIds = new Set(getUnlockedSecretIds());

  function getMixedAmbientMap() {
    const mixed = { ...(themeAmbientMixBase || {}) };
    if (!driftSnapshot?.ambientMix || typeof driftSnapshot.ambientMix !== "object") {
      return mixed;
    }

    for (const [layerId, delta] of Object.entries(driftSnapshot.ambientMix)) {
      const baseValue = Number(mixed[layerId] ?? 0);
      const normalizedBase = Number.isFinite(baseValue) ? baseValue : 0;
      const normalizedDelta = Number.isFinite(delta) ? delta : 0;
      mixed[layerId] = clamp01(normalizedBase + normalizedDelta);
    }
    return mixed;
  }

  function applyThemeAmbientMix() {
    if (!audioSystem) {
      return;
    }
    audioSystem.setAmbientMix(getMixedAmbientMap());
  }

  function applyThemeAudioProfile(options = {}) {
    if (!audioSystem) {
      return;
    }
    audioSystem.setTheme(currentThemeName, options);
  }

  function applyThemePostProcessing() {
    if (!rendererContext) {
      return;
    }
    rendererContext.setPostProcessingOverrides(themePostProcessingBase);
  }

  function captureThemeFogBase() {
    const fog = rendererContext?.scene?.fog;
    if (!fog?.isFog) {
      themeFogBase = null;
      return;
    }

    themeFogBase = {
      color: fog.color?.clone?.() || new THREE.Color("#444444"),
      near: Number.isFinite(fog.near) ? fog.near : 1,
      far: Number.isFinite(fog.far) ? fog.far : 40
    };
  }

  function applyDriftFogPulse() {
    const fog = rendererContext?.scene?.fog;
    const scene = rendererContext?.scene;
    if (!fog?.isFog || !scene || !themeFogBase?.color) {
      return;
    }

    const pulse = driftSnapshot?.fogPulse || null;
    const nearScale = Number.isFinite(pulse?.nearScale) ? pulse.nearScale : 1;
    const farScale = Number.isFinite(pulse?.farScale) ? pulse.farScale : 1;
    const colorLerp = clamp01(pulse?.colorLerp ?? 0);
    const intensity = clamp01(pulse?.intensity ?? 0);

    fog.near = Math.max(0.01, themeFogBase.near * nearScale);
    fog.far = Math.max(fog.near + 0.5, themeFogBase.far * farScale);

    if (colorLerp > 0) {
      const targetFogColor = themeFogBase.color
        .clone()
        .lerp(new THREE.Color("#e9e0c8"), Math.min(1, colorLerp * (0.64 + intensity * 0.72)));
      fog.color.copy(themeFogBase.color).lerp(targetFogColor, colorLerp);
    } else {
      fog.color.copy(themeFogBase.color);
    }

    if (scene.background?.isColor) {
      scene.background.copy(fog.color);
    } else {
      scene.background = fog.color.clone();
    }
  }

  function onPortalObjectiveSeen(target) {
    if (!stabilitySystem || !target?.url) {
      return;
    }
    const targetId = typeof target.id === "string" ? target.id.trim() : "";
    if (!targetId || seenObjectivePortalIds.has(targetId)) {
      return;
    }
    seenObjectivePortalIds.add(targetId);
    stabilitySystem.incrementObjectiveProgress("orient_portals", 1);
  }

  function findCenterArtifactOwner() {
    if (centerArtifactOwner?.parent) {
      return centerArtifactOwner;
    }
    if (!rendererContext?.scene) {
      return null;
    }
    const owner = rendererContext.scene.getObjectByName("center_hover_gif");
    if (!owner) {
      return null;
    }
    centerArtifactOwner = owner;
    return owner;
  }

  function collectCenterArtifactMaterials(owner) {
    centerArtifactMaterials.length = 0;
    if (!owner) {
      return;
    }

    owner.traverse((child) => {
      if (!child?.isMesh) {
        return;
      }
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (!material || !material.emissive?.isColor) {
          continue;
        }
        material.userData = material.userData || {};
        if (!material.userData.centerArtifactBaseEmissive) {
          material.userData.centerArtifactBaseEmissive = material.emissive.clone();
        }
        if (!Number.isFinite(material.userData.centerArtifactBaseEmissiveIntensity)) {
          material.userData.centerArtifactBaseEmissiveIntensity = material.emissiveIntensity ?? 0;
        }
        centerArtifactMaterials.push(material);
      }
    });
  }

  function ensureCenterArtifactLight(owner) {
    if (centerArtifactLight?.parent) {
      return centerArtifactLight;
    }
    if (!owner) {
      return null;
    }

    const light = new THREE.PointLight("#ffffff", 0, 34);
    light.position.set(0, 0, 0.45);
    light.userData = {
      ...(light.userData || {}),
      artifactMainLight: true,
      canCastShadow: false
    };
    owner.add(light);
    centerArtifactLight = light;
    return centerArtifactLight;
  }

  function applyCenterArtifactLightingDominance() {
    if (!centerArtifactActivated || !rendererContext?.scene) {
      return;
    }

    rendererContext.scene.traverse((node) => {
      if (!node?.isLight || node === centerArtifactLight || node.userData?.artifactMainLight) {
        return;
      }
      node.userData = node.userData || {};
      if (!Number.isFinite(node.userData.centerArtifactBaseIntensity)) {
        node.userData.centerArtifactBaseIntensity = Number(node.intensity) || 0;
      }
      node.intensity = node.userData.centerArtifactBaseIntensity * 0.2;
    });
  }

  function activateCenterArtifact(target = null) {
    if (centerArtifactActivated) {
      return;
    }

    const owner = target?.userData?.owner || findCenterArtifactOwner();
    centerArtifactOwner = owner || centerArtifactOwner;
    collectCenterArtifactMaterials(centerArtifactOwner);
    ensureCenterArtifactLight(centerArtifactOwner);
    centerArtifactActivated = true;
    stabilitySystem?.completeObjective(MAIN_OBJECTIVE_ID);
    applyCenterArtifactLightingDominance();
  }

  function updateCenterArtifact(elapsed) {
    if (!centerArtifactActivated) {
      return;
    }

    const owner = findCenterArtifactOwner();
    if (!owner) {
      return;
    }
    if (!centerArtifactMaterials.length) {
      collectCenterArtifactMaterials(owner);
    }
    const light = ensureCenterArtifactLight(owner);
    if (!light) {
      return;
    }

    const hue = (elapsed * 0.14) % 1;
    const pulse = 0.5 + 0.5 * Math.sin(elapsed * 4.2);
    centerArtifactPrimaryColor.setHSL(hue, 0.96, 0.58);
    centerArtifactSecondaryColor.setHSL((hue + 0.12) % 1, 0.92, 0.52);

    for (const material of centerArtifactMaterials) {
      if (!material?.emissive?.isColor) {
        continue;
      }
      const baseIntensity =
        material.userData?.centerArtifactBaseEmissiveIntensity ?? material.emissiveIntensity ?? 0;
      material.emissive.copy(centerArtifactPrimaryColor);
      material.color?.copy?.(centerArtifactSecondaryColor);
      material.emissiveIntensity = Math.max(1.05, baseIntensity * 4.5) + pulse * 1.1;
    }

    light.color.copy(centerArtifactPrimaryColor);
    light.intensity = 3.4 + pulse * 1.8;
    light.distance = 38;
  }

  function updateStabilityFromDrift(delta) {
    if (!stabilitySystem || !driftSnapshot) {
      return;
    }

    const driftAmount = Number.isFinite(driftSnapshot.stabilityDelta)
      ? driftSnapshot.stabilityDelta
      : 0;
    if (Math.abs(driftAmount) > 0.0001) {
      stabilitySystem.adjustStability(driftAmount * delta * 0.7, {
        reason: "drift:stability"
      });
    }

    const fogPulseIntensity = Number.isFinite(driftSnapshot?.fogPulse?.intensity)
      ? driftSnapshot.fogPulse.intensity
      : 0;
    const isDriftStress = Math.abs(driftAmount) >= 0.09 || fogPulseIntensity >= 0.16;
    stabilitySystem.setStressSource("drift", isDriftStress);
    stabilitySystem.update(delta);
  }

  function updateOptionalObjectives() {
    if (!stabilitySystem) {
      return;
    }

    if (secretUnlocks.some((entry) => entry.unlocked)) {
      stabilitySystem.completeObjective("verify_annex");
    }
  }

  function applySecretFloorplanOverrides(options = {}) {
    if (!themeSystem) {
      return;
    }
    const floorplanOverrides = secretUnlocks
      .filter((entry) => entry.unlocked && isObject(entry.floorplan))
      .map((entry) => entry.floorplan);
    themeSystem.setRuntimeFloorplanOverrides(floorplanOverrides, options);
  }

  function persistSecretUnlocks() {
    const unlocked = secretUnlocks.filter((entry) => entry.unlocked).map((entry) => entry.id);
    saveUnlockedSecretIds(unlocked);
  }

  function showSecretUnlockMessage(message) {
    const text =
      typeof message === "string" && message.trim() ? message.trim() : "Secret unlocked";
    ui.setPortalPrompt({ label: text });
    window.setTimeout(() => {
      if (!interactionSystem?.hoveredTarget) {
        ui.setPortalPrompt(null);
      }
    }, 2800);
  }

  function showPopupBlockedMessage() {
    ui.setPortalPrompt({
      label: "Popup blocked. Allow popups to open links in a new tab."
    });
    window.setTimeout(() => {
      if (!interactionSystem?.hoveredTarget) {
        ui.setPortalPrompt(null);
      }
    }, 2800);
  }

  function updateSecretUnlocks(nowMs) {
    if (!secretUnlocks.length || !sceneContext?.player?.position) {
      return;
    }

    for (const unlock of secretUnlocks) {
      if (unlock.unlocked) {
        continue;
      }

      const inside = isPositionInsideBoxZone(unlock.zone, sceneContext.player.position);
      if (inside && !unlock.wasInside && nowMs >= unlock.nextEligibleAtMs) {
        unlock.hits += 1;
        unlock.nextEligibleAtMs = nowMs + unlock.cooldownMs;
        if (unlock.hits >= unlock.requiredEntries) {
          unlock.unlocked = true;
          secretUnlockedIds.add(unlock.id);
          persistSecretUnlocks();
          applySecretFloorplanOverrides();
          showSecretUnlockMessage(unlock.message);
        }
      }
      unlock.wasInside = inside;
    }
  }

  const ui = createOverlay({
    mount: app,
    isMobile: mobile,
    showDevPanel: isDev || debugUiParam,
    showThemePanel: allowThemeSelector,
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
      ui.hideInspectPanel?.();
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
      themePostProcessingBase = getThemePostProcessing(loadedThemesConfig, appliedTheme);
      applyThemeAmbientMix();
      applyThemeAudioProfile({ playStinger: true });
      applyThemePostProcessing();
      captureThemeFogBase();
      applyDriftFogPulse();
      applyCenterArtifactLightingDominance();
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
    defaultThemesConfig,
    audioConfig,
    driftEventsConfig,
    objectivesConfig,
    catalogConfig,
    shopFeed,
    projectsFeed
  ] =
    await Promise.all([
      loadSceneConfig(),
      loadOptionalDefaultConfig("themes.json"),
      loadDefaultConfig("audio.json"),
      loadOptionalDefaultConfig("drift-events.json"),
      loadOptionalDefaultConfig("objectives.json"),
      loadOptionalDefaultConfig("catalog.json"),
      loadOptionalDefaultConfig("shop-feed.json"),
      loadOptionalDefaultConfig("projects-feed.json")
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

  if (hasThemeMap(defaultThemesConfig)) {
    loadedThemesConfig = defaultThemesConfig;
  } else {
    try {
      const defaults = await loadDefaultConfig("themes.json");
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
    qualityProfile,
    catalogConfig,
    shopFeed,
    projectsFeed
  });
  secretUnlocks = normalizeSecretUnlocks(
    sceneConfig.secretUnlocks,
    sceneContext?.zones || sceneConfig?.zones || [],
    secretUnlockedIds
  );
  ui.setLoadingState({
    message: "Linking portals and systems."
  });

  audioSystem = new AudioSystem(audioConfig);
  audioSystem.initialize();
  audioSystem.setPortalTargets(sceneContext?.portals || []);
  driftSystem = new DriftEventsSystem(driftEventsConfig || { enabled: false });
  driftSnapshot = driftSystem.getSnapshot();
  stabilitySystem = new StabilityObjectivesSystem({
    config: objectivesConfig || { enabled: false },
    ui
  });
  stabilitySystem.initialize();
  ui.showSoundGate();

  themeSystem = new ThemeSystem({
    scene: rendererContext.scene,
    sceneContext,
    cache,
    themesConfig: loadedThemesConfig,
    audioSystem,
    qualityProfile
  });
  applySecretFloorplanOverrides({ reapply: false });
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
  themePostProcessingBase = getThemePostProcessing(loadedThemesConfig, currentThemeName);
  applyThemeAmbientMix();
  applyThemeAudioProfile({ playStinger: false });
  applyThemePostProcessing();
  captureThemeFogBase();
  applyDriftFogPulse();

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
    ...(sceneContext?.getInteractionTargets?.() || []),
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
    onHover: (target) => {
      ui.setPortalPrompt(target);
      onPortalObjectiveSeen(target);
    },
    onActivate: (target) => {
      if (target?.inspectData) {
        const isCenterArtifact = target.id === CENTER_ARTIFACT_TARGET_ID;
        if (isCenterArtifact) {
          activateCenterArtifact(target);
        }
        if (controls?.isPointerLocked?.()) {
          return;
        }
        ui.showInspectPanel?.(target.inspectData);
        return;
      }
      const url = typeof target?.url === "string" ? target.url.trim() : "";
      if (!url) {
        return;
      }
      const popup = window.open(url, "_blank", "noopener,noreferrer");
      if (!popup) {
        showPopupBlockedMessage();
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
    const stabilityState = stabilitySystem?.getState?.() || null;
    return {
      theme: themeSystem?.currentThemeName || null,
      portalCount: (sceneContext?.portals || []).length,
      interactionTargetCount: getInteractionTargets().length,
      secretUnlocks: secretUnlocks
        .filter((entry) => entry.unlocked)
        .map((entry) => entry.id),
      anyInteractionHit: interactionSystem?.debugFindAnyTargetHit?.()?.id || null,
      player: playerPos
        ? {
            x: Number(playerPos.x.toFixed(3)),
            y: Number(playerPos.y.toFixed(3)),
            z: Number(playerPos.z.toFixed(3))
          }
        : null,
      props: propStats,
      themeParticles: themeSystem?.particles?.effect
        ? {
            type: themeSystem.particles.effect.type || null,
            count: Number.isFinite(themeSystem.particles.effect.speeds?.length)
              ? themeSystem.particles.effect.speeds.length
              : 0
          }
        : null,
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
      drift: driftSnapshot
        ? {
            activeEventCount: driftSnapshot.activeEvents?.length || 0,
            activeEvents: (driftSnapshot.activeEvents || []).map((event) => event.type),
            nextEventInSeconds: driftSnapshot.nextEventInSeconds ?? null,
            fogPulseIntensity: driftSnapshot.fogPulse?.intensity ?? 0,
            stabilityDelta: driftSnapshot.stabilityDelta ?? 0
          }
        : null,
      stability: stabilitySystem
        ? {
            value: Number(stabilityState?.stability?.toFixed?.(4) || 0),
            state: stabilityState?.stabilityState || null
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
        themePostProcessingBase = getThemePostProcessing(loadedThemesConfig, resolved);
        applyThemeAmbientMix();
        applyThemeAudioProfile({ playStinger: true });
        applyThemePostProcessing();
        captureThemeFogBase();
        applyDriftFogPulse();
        applyCenterArtifactLightingDominance();
      }
      return resolved;
    },
    getDriftSnapshot: () => driftSystem?.getSnapshot?.() || null,
    resetDrift: (seed) => driftSystem?.reset?.(seed),
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
    if (driftSystem?.config?.enabled) {
      driftSnapshot = driftSystem.update(delta);
      applyThemeAmbientMix();
      applyDriftFogPulse();
    }
    updateStabilityFromDrift(delta);
    updateCenterArtifact(elapsed);
    updateSecretUnlocks(performance.now());
    updateOptionalObjectives();

    const surface = getSurfaceAtPosition(sceneContext.zones, sceneContext.player.position);
    audioSystem?.setSurface(surface);
    audioSystem?.updateSpatialAudio(rendererContext.camera);
    audioSystem?.updateZones(sceneContext.player.position);

    rendererContext.render();
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
    stabilitySystem?.dispose?.();
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
    const allowThemeSelector = isDev && sceneUiEnabled;
    const fallbackSceneConfig = await loadOptionalSceneConfig();
    const fallbackLinks = getFallbackLinks(fallbackSceneConfig);

    const ui = createOverlay({
      mount: app,
      isMobile: mobile,
      showDevPanel: isDev || debugUiParam,
      showThemePanel: allowThemeSelector,
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
