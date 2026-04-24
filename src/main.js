import * as THREE from "three";
import "./style.css";

import { AssetCache } from "./engine/assetCache.js";
import { createRenderer, detectAutoQuality } from "./engine/renderer.js";
import { loadScene } from "./engine/sceneLoader.js";
import { DesktopControls } from "./systems/controls/desktopControls.js";
import { MobileControls } from "./systems/controls/mobileControls.js";
import { InteractionDirector } from "./systems/interactions/interactionDirector.js";
import { PortalInteractionSystem } from "./systems/interactions/portalInteractions.js";
import { AudioSystem } from "./systems/audio/audioSystem.js";
import { DriftEventsSystem } from "./systems/drift/driftEventsSystem.js";
import { ScenePanelSystem } from "./systems/display/scenePanelSystem.js";
import { StabilityObjectivesSystem } from "./systems/gameplay/stabilityObjectivesSystem.js";
import { resolveInitialThemeName, ThemeSystem } from "./systems/theming/applyTheme.js";
import {
  buildDevModelShowroomLayout,
  createIsolatedDevModelLabSceneConfig,
  DEV_MODEL_SHOWROOM_TAG,
  loadDevModelIntakeManifest
} from "./editor/devModelShowroom.js";
import { createOverlay } from "./ui/overlay.js";
import { isFeedRuntimeConfigFile, selectPreferredFeedRuntimeSource } from "./utils/runtimeConfigFeeds.js";
import { createPerfHud } from "./ui/perfHud.js";
import { resolvePublicPath } from "./utils/path.js";
import {
  normalizeExternalUrl,
  shouldEnableLocalDebugUi,
  shouldEnableLocalEditor,
  isLocalAuthoringHostName
} from "./utils/runtimePolicy.js";
import {
  ARTIFACT_TRANSITION_RUNTIME_PHASE,
  getRuntimePhaseModuleId
} from "./utils/runtimePhases.js";

const BUILD_ID = import.meta.env.VITE_BUILD_ID || "";
const THEME_STORAGE_KEY = "lobby.theme.v1";
const QUALITY_STORAGE_KEY = "lobby.quality.v1";
const SECRET_UNLOCKS_STORAGE_KEY = "lobby.secret_unlocks.v1";
const LEGACY_DEV_THEME_STORAGE_KEY = "lobby.dev.theme";
const LEGACY_DEV_QUALITY_STORAGE_KEY = "lobby.dev.quality";
const VALID_QUALITY_VALUES = new Set(["low", "medium", "high"]);
const MAIN_OBJECTIVE_ID = "brainstorm_main_task";
const CENTER_ARTIFACT_TARGET_ID = "prop:center_hover_gif";
const ARTIFACT_TRANSITION_MODULE_ID = getRuntimePhaseModuleId(
  ARTIFACT_TRANSITION_RUNTIME_PHASE
);
const DEV_CONFIG_FILES = [
  {
    fileName: "scene.json",
    label: "Scene",
    description: "Room layout, portals, props, spawn, and zones."
  },
  {
    fileName: "themes.json",
    label: "Themes",
    description: "Theme visuals, props, lighting, and mood."
  },
  {
    fileName: "catalog.json",
    label: "Catalog",
    description: "Feed room placement, room sizing, and theme routing."
  },
  {
    fileName: "audio.json",
    label: "Audio",
    description: "Ambient layers, portal hums, and theme stingers."
  },
  {
    fileName: "objectives.json",
    label: "Objective",
    description: "Artifact objective and HUD visibility."
  },
  {
    fileName: "drift-events.json",
    label: "Drift",
    description: "Atmospheric event pulses and ambience shifts."
  },
  {
    fileName: "shop-feed.json",
    label: "Shop Feed",
    description: "Items shown in the shop wing."
  },
  {
    fileName: "projects-feed.json",
    label: "Projects Feed",
    description: "Projects shown in the projects wing."
  },
  {
    fileName: "videos-feed.json",
    label: "Video Feed",
    description: "Recent YouTube uploads for the screening hall."
  },
  {
    fileName: "videos-long-feed.json",
    label: "Longform Feed",
    description: "Long-form channel uploads for the screening archive wall."
  },
  {
    fileName: "atelier-feed.json",
    label: "Atelier Feed",
    description: "Prototype spaces and future room concepts for the atelier wing."
  }
];
const DEV_CONFIG_FILE_SET = new Set(DEV_CONFIG_FILES.map((entry) => entry.fileName));

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

function readText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed || fallback;
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

async function loadRuntimeConfigCandidate(path) {
  try {
    return {
      ok: true,
      path,
      payload: await loadJson(path)
    };
  } catch (error) {
    return {
      ok: false,
      path,
      error
    };
  }
}

async function loadRuntimeConfig(fileName, { optional = false, defaultsOnly = false } = {}) {
  const normalizedFileName = isSupportedRuntimeConfigFile(fileName)
    ? normalizeRuntimeConfigFileName(fileName)
    : "";
  if (!normalizedFileName) {
    if (optional) {
      return null;
    }
    throw new Error(`Unsupported runtime config "${fileName}".`);
  }

  if (!defaultsOnly && isFeedRuntimeConfigFile(normalizedFileName)) {
    const localPath = `config/${normalizedFileName}`;
    const defaultsPath = `config.defaults/${normalizedFileName}`;
    const [localCandidate, defaultsCandidate] = await Promise.all([
      loadRuntimeConfigCandidate(localPath),
      loadRuntimeConfigCandidate(defaultsPath)
    ]);
    const preferredSource = selectPreferredFeedRuntimeSource(normalizedFileName, {
      localPayload: localCandidate.ok ? localCandidate.payload : null,
      defaultsPayload: defaultsCandidate.ok ? defaultsCandidate.payload : null
    });

    if (preferredSource === "defaults" && defaultsCandidate.ok) {
      return defaultsCandidate.payload;
    }
    if (preferredSource === "local" && localCandidate.ok) {
      return localCandidate.payload;
    }
    if (localCandidate.ok) {
      return localCandidate.payload;
    }
    if (defaultsCandidate.ok) {
      return defaultsCandidate.payload;
    }
    if (optional) {
      return null;
    }
    throw defaultsCandidate.error || localCandidate.error || new Error(`Failed loading ${normalizedFileName}.`);
  }

  const attempts = defaultsOnly
    ? [`config.defaults/${normalizedFileName}`]
    : [`config/${normalizedFileName}`, `config.defaults/${normalizedFileName}`];
  let lastError = null;

  for (const candidate of attempts) {
    try {
      return await loadJson(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  if (optional) {
    return null;
  }

  throw lastError || new Error(`Failed loading runtime config ${normalizedFileName}.`);
}

async function loadSceneConfig() {
  return loadRuntimeConfig("scene.json");
}

async function loadOptionalSceneConfig() {
  return loadRuntimeConfig("scene.json", { optional: true });
}

function buildRuntimeConfigPath(fileName, source = "effective") {
  if (!isSupportedRuntimeConfigFile(fileName)) {
    throw new Error(`Unsupported runtime config "${fileName}".`);
  }
  const normalizedFileName = normalizeRuntimeConfigFileName(fileName);
  if (source === "local") {
    return `config/${normalizedFileName}`;
  }
  return `config.defaults/${normalizedFileName}`;
}

async function fetchRuntimeConfigText(path) {
  const response = await fetch(withBuildId(resolvePublicPath(path)), {
    cache: "no-cache"
  });
  if (!response.ok) {
    throw new Error(`Failed loading ${path}: ${response.status}`);
  }
  return response.text();
}

async function readEditableRuntimeConfig(fileName, source = "effective") {
  if (!isSupportedRuntimeConfigFile(fileName)) {
    throw new Error(`Unsupported runtime config "${fileName}".`);
  }
  const normalizedFileName = normalizeRuntimeConfigFileName(fileName);

  if (import.meta.env.DEV) {
    const url = new URL(resolvePublicPath("__dev/config"), window.location.origin);
    url.searchParams.set("file", normalizedFileName);
    url.searchParams.set("source", source);
    const response = await fetch(url, {
      cache: "no-cache"
    });
    if (!response.ok) {
      throw new Error(`Dev config read failed for ${fileName}: ${response.status}`);
    }
    const payload = await response.json();
    if (!payload?.ok) {
      throw new Error(payload?.error || `Dev config read failed for ${fileName}.`);
    }
    return {
      fileName: normalizedFileName,
      source: payload.source || source,
      exists: Boolean(payload.exists),
      text: payload.text || "",
      hasLocal: Boolean(payload.hasLocal),
      hasDefaults: Boolean(payload.hasDefaults)
    };
  }

  if (source === "local") {
    return {
      fileName: normalizedFileName,
      source: "local",
      exists: false,
      text: "",
      hasLocal: false,
      hasDefaults: true
    };
  }

  if (source === "defaults") {
    const text = await fetchRuntimeConfigText(buildRuntimeConfigPath(normalizedFileName, "defaults"));
    return {
      fileName: normalizedFileName,
      source: "defaults",
      exists: true,
      text,
      hasLocal: false,
      hasDefaults: true
    };
  }

  try {
    const text = await fetchRuntimeConfigText(buildRuntimeConfigPath(normalizedFileName, "local"));
    return {
      fileName: normalizedFileName,
      source: "local",
      exists: true,
      text,
      hasLocal: true,
      hasDefaults: true
    };
  } catch {
    const text = await fetchRuntimeConfigText(buildRuntimeConfigPath(normalizedFileName, "defaults"));
    return {
      fileName: normalizedFileName,
      source: "defaults",
      exists: true,
      text,
      hasLocal: false,
      hasDefaults: true
    };
  }
}

async function writeEditableRuntimeConfig(fileName, target, text) {
  if (!import.meta.env.DEV) {
    throw new Error("Saving runtime config from the dev menu only works in local dev mode.");
  }
  if (!isSupportedRuntimeConfigFile(fileName)) {
    throw new Error(`Unsupported runtime config "${fileName}".`);
  }
  const normalizedFileName = normalizeRuntimeConfigFileName(fileName);

  const response = await fetch(resolvePublicPath("__dev/config"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      fileName: normalizedFileName,
      target,
      text
    })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Dev config write failed for ${fileName}.`);
  }
  return payload;
}

async function deleteEditableRuntimeConfig(fileName, target = "local") {
  if (!import.meta.env.DEV) {
    throw new Error("Deleting runtime config from the dev menu only works in local dev mode.");
  }
  if (!isSupportedRuntimeConfigFile(fileName)) {
    throw new Error(`Unsupported runtime config "${fileName}".`);
  }
  const normalizedFileName = normalizeRuntimeConfigFileName(fileName);

  const url = new URL(resolvePublicPath("__dev/config"), window.location.origin);
  url.searchParams.set("file", normalizedFileName);
  url.searchParams.set("target", target);

  const response = await fetch(url, {
    method: "DELETE"
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Dev config delete failed for ${fileName}.`);
  }
  return payload;
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

function normalizeRuntimeConfigFileName(fileName) {
  return typeof fileName === "string" ? fileName.trim() : "";
}

function isSupportedRuntimeConfigFile(fileName) {
  const normalized = normalizeRuntimeConfigFileName(fileName);
  return DEV_CONFIG_FILE_SET.has(normalized) || isFeedRuntimeConfigFile(normalized);
}

function mergeDevConfigFiles(...sources) {
  const merged = [];
  const seen = new Set();

  for (const source of sources) {
    for (const entry of Array.isArray(source) ? source : []) {
      const fileName = normalizeRuntimeConfigFileName(entry?.fileName);
      if (!isSupportedRuntimeConfigFile(fileName) || seen.has(fileName)) {
        continue;
      }
      merged.push({
        fileName,
        label: readText(entry?.label, fileName),
        description: readText(entry?.description, "")
      });
      seen.add(fileName);
    }
  }

  return merged;
}

function getCatalogFeedDefinitions(catalogConfig) {
  const definitions = [];
  const seenSources = new Set();
  const roomEntries = Object.entries(catalogConfig?.rooms || {});
  const fallbackRoomIds = ["shop", "projects", "videos"];
  const sourceEntries = roomEntries.length
    ? roomEntries
    : fallbackRoomIds.map((roomId) => [roomId, {}]);
  const appendDefinition = (roomId, roomConfig, feedSource, fileName, labelSuffix = "Feed") => {
    const normalizedSource =
      typeof feedSource === "string" && feedSource.trim() ? feedSource.trim() : "";
    if (!normalizedSource || seenSources.has(normalizedSource)) {
      return;
    }

    const normalizedFileName =
      typeof fileName === "string" && fileName.trim()
        ? fileName.trim()
        : `${normalizedSource}-feed.json`;
    definitions.push({
      roomId,
      roomLabel: readText(roomConfig?.label, formatThemeLabel(roomId)),
      feedSource: normalizedSource,
      fileName: normalizedFileName,
      labelSuffix
    });
    seenSources.add(normalizedSource);
  };

  for (const [roomId, roomConfig] of sourceEntries) {
    const feedSource =
      typeof roomConfig?.feedSource === "string" && roomConfig.feedSource.trim()
        ? roomConfig.feedSource.trim()
        : roomId;
    appendDefinition(roomId, roomConfig, feedSource, roomConfig?.feedFile, "Feed");
    appendDefinition(
      roomId,
      roomConfig,
      roomConfig?.playlistWall?.feedSource,
      roomConfig?.playlistWall?.feedFile,
      "Archive"
    );
  }

  return definitions;
}

function buildCatalogFeedDevConfigFiles(catalogConfig) {
  return getCatalogFeedDefinitions(catalogConfig).map((definition) => ({
    fileName: definition.fileName,
    label: `${definition.roomLabel} ${definition.labelSuffix}`,
    description:
      definition.labelSuffix === "Archive"
        ? `Archive items shown on the ${definition.roomLabel} wall.`
        : `Items shown in the ${definition.roomLabel} room.`
  }));
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

function normalizeEditorOverrides(payload) {
  const source = isObject(payload) ? payload : {};
  const props = isObject(source.props) ? cloneJson(source.props) || {} : {};
  const createdProps = Array.isArray(source.createdProps)
    ? source.createdProps
        .map((entry) => (isObject(entry) ? cloneJson(entry) : null))
        .filter((entry) => isObject(entry))
    : [];
  const hiddenProps = [...new Set((Array.isArray(source.hiddenProps) ? source.hiddenProps : [])
    .map((entry) => readText(entry, ""))
    .filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const hiddenGeneratedNodes = [...new Set(
    (Array.isArray(source.hiddenGeneratedNodes) ? source.hiddenGeneratedNodes : [])
      .map((entry) => readText(entry, ""))
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  return {
    createdProps,
    props,
    hiddenProps,
    hiddenGeneratedNodes
  };
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

function normalizeModuleTriggerIds(value) {
  const source = Array.isArray(value) ? value : value ? [value] : [];
  const normalized = [];
  const seen = new Set();
  for (const entry of source) {
    const id = typeof entry === "string" ? entry.trim() : "";
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    normalized.push(id);
  }
  return normalized;
}

function normalizeModuleTriggers(rawTriggers, zones) {
  // Rear-hall staging uses generic public labels in-scene, so module ids remain the stable
  // internal handles for identifying which hidden space each trigger controls.
  const normalized = [];
  const seen = new Set();
  for (const entry of Array.isArray(rawTriggers) ? rawTriggers : []) {
    if (!isObject(entry)) {
      continue;
    }

    const zoneId = typeof entry.zoneId === "string" ? entry.zoneId.trim() : "";
    const zone = findZoneById(zones, zoneId);
    const moduleIds = normalizeModuleTriggerIds(
      entry.moduleIds || entry.moduleId || entry.modules
    );
    const enterModuleIds = normalizeModuleTriggerIds(
      entry.enterModuleIds || entry.enterModuleId || entry.enterModules || moduleIds
    );
    const exitModuleIds = normalizeModuleTriggerIds(
      entry.exitModuleIds || entry.exitModuleId || entry.exitModules || moduleIds
    );
    if (!zone || !enterModuleIds.length) {
      continue;
    }

    const id =
      typeof entry.id === "string" && entry.id.trim()
        ? entry.id.trim()
        : `${zoneId}:${enterModuleIds.join(",")}`;
    if (!id || seen.has(id)) {
      continue;
    }

    normalized.push({
      id,
      zoneId,
      zone,
      moduleIds: enterModuleIds,
      enterModuleIds,
      exitModuleIds,
      enterVisible: entry.visible !== false,
      exitVisible:
        entry.exitVisible == null ? null : Boolean(entry.exitVisible),
      message:
        typeof entry.message === "string" && entry.message.trim() ? entry.message.trim() : "",
      exitMessage:
        typeof entry.exitMessage === "string" && entry.exitMessage.trim()
          ? entry.exitMessage.trim()
          : "",
      once: entry.once === true,
      active: true,
      wasInside: false
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
  const localAuthoringHost = isLocalAuthoringHostName(window.location.hostname);
  const params = new URLSearchParams(window.location.search);
  const hasThemeQuery = params.has("theme");
  const localDebugUiEnabled = shouldEnableLocalDebugUi(params, {
    isDev,
    hostname: window.location.hostname
  });
  const sceneUiEnabled = params.get("sceneui") !== "0";
  const modelLabModeEnabled = localAuthoringHost && params.get("modellab") === "1";
  const allowThemeSelector = sceneUiEnabled && localDebugUiEnabled && !modelLabModeEnabled;
  const devMenuEnabled = localDebugUiEnabled;
  const editorSupported = !modelLabModeEnabled && (isDev || localAuthoringHost);
  const editorModeEnabled = !modelLabModeEnabled && shouldEnableLocalEditor(params, {
    isDev,
    hostname: window.location.hostname
  });
  const inspectUiEnabled = editorModeEnabled;
  const perfEnabled = localDebugUiEnabled && params.get("perf") === "1";
  const runtimeDebugApiEnabled = localDebugUiEnabled || editorModeEnabled;
  const devModelShowroomSupported = isDev || localAuthoringHost;
  const devModelShowroomRequested = modelLabModeEnabled;

  let rendererContext = null;
  let controls = null;
  let interactionSystem = null;
  let interactionDirector = null;
  let scenePanelSystem = null;
  let themeSystem = null;
  let catalogSystem = null;
  let editorSystem = null;
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
  let cache = null;
  let centerArtifactActivated = false;
  let centerArtifactSceneFxStrength = 0;
  let centerArtifactOwner = null;
  let centerArtifactLinkedRifleOwner = null;
  let centerArtifactMoonDiscOwner = null;
  let centerArtifactMoonHaloOwner = null;
  let centerArtifactLight = null;
  let devModelShowroomManifest = null;
  let devModelShowroomLayout = null;
  let devModelShowroomState = {
    modelShowroomSupported: devModelShowroomSupported,
    modelShowroomActive: false,
    modelShowroomBusy: false,
    modelShowroomIsolated: modelLabModeEnabled,
    modelShowroomStatus: devModelShowroomSupported
      ? modelLabModeEnabled
        ? "Isolated model lab booting."
        : "Model lab is ready. Open it to boot an isolated preview scene."
      : "Model lab is available while running locally.",
    modelShowroomTone: "muted"
  };
  let detachAudioUnlock = () => {};
  const centerArtifactMaterials = [];
  const centerArtifactLinkedRifleMaterials = [];
  const centerArtifactMoonDiscMaterials = [];
  const centerArtifactMoonHaloMaterials = [];
  const centerArtifactPrimaryColor = new THREE.Color("#ffffff");
  const centerArtifactSecondaryColor = new THREE.Color("#ffffff");
  const centerArtifactFogTargetColor = new THREE.Color("#f6da68");
  const centerArtifactFogScratchColor = new THREE.Color("#444444");
  const centerArtifactMoonDiscColor = new THREE.Color("#ba2024");
  const centerArtifactMoonHaloColor = new THREE.Color("#6a0810");
  const centerArtifactMoonPulseColor = new THREE.Color("#ef6533");
  const centerArtifactMoonScratchColor = new THREE.Color("#ffffff");
  let secretUnlocks = [];
  let moduleTriggers = [];
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
    const overrides = { ...(themePostProcessingBase || {}) };
    const strength = clamp01(centerArtifactSceneFxStrength);
    if (strength > 0.001) {
      const baseBloomStrength = Number.isFinite(overrides.bloomStrength) ? overrides.bloomStrength : 0.45;
      const baseBloomRadius = Number.isFinite(overrides.bloomRadius) ? overrides.bloomRadius : 0.72;
      const baseBloomThreshold =
        Number.isFinite(overrides.bloomThreshold) ? overrides.bloomThreshold : 0.3;
      const baseVignetteDarkness =
        Number.isFinite(overrides.vignetteDarkness) ? overrides.vignetteDarkness : 0.78;
      const baseVignetteOffset =
        Number.isFinite(overrides.vignetteOffset) ? overrides.vignetteOffset : 1.18;
      overrides.bloomEnabled = true;
      overrides.vignetteEnabled = true;
      overrides.bloomStrength = baseBloomStrength + 0.22 * strength;
      overrides.bloomRadius = baseBloomRadius + 0.12 * strength;
      overrides.bloomThreshold = Math.max(0, baseBloomThreshold - 0.08 * strength);
      overrides.vignetteDarkness = Math.min(2, baseVignetteDarkness + 0.06 * strength);
      overrides.vignetteOffset = Math.min(2, baseVignetteOffset + 0.03 * strength);
    }
    rendererContext.setPostProcessingOverrides(overrides);
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

  function findPropOwner(propId, cachedOwner = null) {
    if (cachedOwner?.parent) {
      return cachedOwner;
    }
    const resolvedById = sceneContext?.getEditablePropObject?.(propId) || null;
    if (resolvedById) {
      return resolvedById;
    }
    if (!rendererContext?.scene) {
      return null;
    }
    return rendererContext.scene.getObjectByName(propId) || null;
  }

  function findCenterArtifactOwner() {
    const owner = findPropOwner("center_hover_gif", centerArtifactOwner);
    if (!owner) {
      return null;
    }
    centerArtifactOwner = owner;
    return owner;
  }

  function collectCenterArtifactMaterials(owner) {
    centerArtifactMaterials.length = 0;
    collectArtifactMaterials(owner, centerArtifactMaterials);
  }

  function collectLinkedRifleMaterials(owner) {
    centerArtifactLinkedRifleMaterials.length = 0;
    collectArtifactMaterials(owner, centerArtifactLinkedRifleMaterials);
  }

  function collectArtifactMaterials(owner, targetMaterials) {
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
        if (material.color?.isColor && !material.userData.centerArtifactBaseColor) {
          material.userData.centerArtifactBaseColor = material.color.clone();
        }
        if (!material.userData.centerArtifactBaseEmissive) {
          material.userData.centerArtifactBaseEmissive = material.emissive.clone();
        }
        if (!Number.isFinite(material.userData.centerArtifactBaseEmissiveIntensity)) {
          material.userData.centerArtifactBaseEmissiveIntensity = material.emissiveIntensity ?? 0;
        }
        targetMaterials.push(material);
      }
    });
  }

  function findCenterArtifactMoonDiscOwner() {
    if (centerArtifactMoonDiscOwner?.parent) {
      return centerArtifactMoonDiscOwner;
    }
    if (!rendererContext?.scene) {
      return null;
    }
    const owner = rendererContext.scene.getObjectByName("moon_disc");
    if (!owner) {
      return null;
    }
    centerArtifactMoonDiscOwner = owner;
    return owner;
  }

  function findCenterArtifactMoonHaloOwner() {
    if (centerArtifactMoonHaloOwner?.parent) {
      return centerArtifactMoonHaloOwner;
    }
    if (!rendererContext?.scene) {
      return null;
    }
    const owner = rendererContext.scene.getObjectByName("moon_halo");
    if (!owner) {
      return null;
    }
    centerArtifactMoonHaloOwner = owner;
    return owner;
  }

  function findCenterArtifactLinkedRifleOwner() {
    const owner = findPropOwner("east_media_project_rifle", centerArtifactLinkedRifleOwner);
    if (!owner) {
      return null;
    }
    centerArtifactLinkedRifleOwner = owner;
    return owner;
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

  function applyCenterArtifactAtmosphere(elapsed) {
    const strength = clamp01(centerArtifactSceneFxStrength);
    if (strength <= 0.001) {
      return;
    }

    const fog = rendererContext?.scene?.fog;
    const scene = rendererContext?.scene;
    if (fog?.isFog && scene) {
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2.9);
      const hazeMix = (0.12 + pulse * 0.06) * strength;
      const nearTarget = Math.max(0.01, fog.near * 0.84);
      const farTarget = Math.max(nearTarget + 0.5, fog.far * 0.9);
      fog.near = THREE.MathUtils.lerp(fog.near, nearTarget, 0.18 * strength);
      fog.far = THREE.MathUtils.lerp(fog.far, farTarget, 0.22 * strength);
      centerArtifactFogScratchColor
        .copy(centerArtifactFogTargetColor)
        .lerp(centerArtifactPrimaryColor, 0.16 + pulse * 0.08);
      fog.color.lerp(centerArtifactFogScratchColor, hazeMix);
      if (scene.background?.isColor) {
        scene.background.copy(fog.color);
      } else {
        scene.background = fog.color.clone();
      }
    }

    const discOwner = findCenterArtifactMoonDiscOwner();
    if (discOwner && !centerArtifactMoonDiscMaterials.length) {
      collectArtifactMaterials(discOwner, centerArtifactMoonDiscMaterials);
    }
    const haloOwner = findCenterArtifactMoonHaloOwner();
    if (haloOwner && !centerArtifactMoonHaloMaterials.length) {
      collectArtifactMaterials(haloOwner, centerArtifactMoonHaloMaterials);
    }

    const moonPulse = 0.5 + 0.5 * Math.sin(elapsed * 2.1 + 0.45);
    const discLerp = 0.72 * strength;
    const haloLerp = 0.86 * strength;
    centerArtifactMoonScratchColor
      .copy(centerArtifactMoonDiscColor)
      .lerp(centerArtifactMoonPulseColor, 0.18 + moonPulse * 0.18);
    for (const material of centerArtifactMoonDiscMaterials) {
      if (!material?.emissive?.isColor) {
        continue;
      }
      const baseColor = material.userData?.centerArtifactBaseColor;
      if (baseColor?.isColor) {
        material.color.copy(baseColor).lerp(centerArtifactMoonScratchColor, discLerp);
      }
      material.emissive.copy(centerArtifactMoonScratchColor);
      const baseIntensity =
        material.userData?.centerArtifactBaseEmissiveIntensity ?? material.emissiveIntensity ?? 0;
      material.emissiveIntensity =
        Math.max(baseIntensity + 0.35, 0.68 + moonPulse * 0.38) * strength;
    }

    centerArtifactMoonScratchColor
      .copy(centerArtifactMoonHaloColor)
      .lerp(centerArtifactMoonDiscColor, 0.22 + moonPulse * 0.12);
    for (const material of centerArtifactMoonHaloMaterials) {
      if (!material?.emissive?.isColor) {
        continue;
      }
      const baseColor = material.userData?.centerArtifactBaseColor;
      if (baseColor?.isColor) {
        material.color.copy(baseColor).lerp(centerArtifactMoonScratchColor, haloLerp);
      }
      material.emissive.copy(centerArtifactMoonScratchColor);
      const baseIntensity =
        material.userData?.centerArtifactBaseEmissiveIntensity ?? material.emissiveIntensity ?? 0;
      material.emissiveIntensity =
        Math.max(baseIntensity + 0.12, 0.22 + moonPulse * 0.14) * strength;
    }

    applyThemePostProcessing();
  }

  function activateCenterArtifact(target = null) {
    if (centerArtifactActivated) {
      return;
    }

    const owner = target?.userData?.owner || findCenterArtifactOwner();
    centerArtifactOwner = owner || centerArtifactOwner;
    collectCenterArtifactMaterials(centerArtifactOwner);
    collectLinkedRifleMaterials(findCenterArtifactLinkedRifleOwner());
    ensureCenterArtifactLight(centerArtifactOwner);
    centerArtifactActivated = true;
    if (ARTIFACT_TRANSITION_MODULE_ID) {
      const revealedModules =
        sceneContext?.setPropModulesVisible?.([ARTIFACT_TRANSITION_MODULE_ID], true) || [];
      if (revealedModules.length) {
        refreshInteractiveSurfaces();
      }
    }
    stabilitySystem?.completeObjective(MAIN_OBJECTIVE_ID);
    applyCenterArtifactLightingDominance();
  }

  function updateCenterArtifact(delta, elapsed) {
    centerArtifactSceneFxStrength = THREE.MathUtils.damp(
      centerArtifactSceneFxStrength,
      centerArtifactActivated ? 1 : 0,
      3.4,
      delta
    );

    if (!centerArtifactActivated) {
      const owner = findCenterArtifactOwner();
      if (!owner) {
        return;
      }
      if (!centerArtifactMaterials.length) {
        collectCenterArtifactMaterials(owner);
      }
      const light = ensureCenterArtifactLight(owner);
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2.8);
      for (const material of centerArtifactMaterials) {
        if (!material?.emissive?.isColor) {
          continue;
        }
        const baseIntensity =
          material.userData?.centerArtifactBaseEmissiveIntensity ?? material.emissiveIntensity ?? 0;
        material.emissive.set("#ffffff");
        material.emissiveIntensity = Math.max(baseIntensity + 0.06, 0.28 + pulse * 0.42);
      }
      if (light) {
        light.color.set("#ffffff");
        light.intensity = 0.7 + pulse * 0.44;
        light.distance = 14;
      }
      return;
    }

    const owner = findCenterArtifactOwner();
    if (!owner) {
      return;
    }
    collectCenterArtifactMaterials(owner);
    const linkedRifleOwner = findCenterArtifactLinkedRifleOwner();
    if (linkedRifleOwner) {
      collectLinkedRifleMaterials(linkedRifleOwner);
    } else {
      centerArtifactLinkedRifleMaterials.length = 0;
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

    for (const material of centerArtifactLinkedRifleMaterials) {
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
    applyCenterArtifactAtmosphere(elapsed);
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
    showTransientPrompt(text);
  }

  function showPopupBlockedMessage() {
    showTransientPrompt("Popup blocked. Allow popups to open links in a new tab.");
  }

  function showTransientPrompt(label, durationMs = 2800) {
    const text = typeof label === "string" ? label.trim() : "";
    if (!text) {
      return;
    }
    ui.setPortalPrompt({ label: text });
    window.setTimeout(() => {
      if (!interactionSystem?.hoveredTarget) {
        ui.setPortalPrompt(null);
      }
    }, durationMs);
  }

  function openExternalUrl(url) {
    const targetUrl = normalizeExternalUrl(url, {
      baseUrl: window.location.href
    });
    if (!targetUrl) {
      showTransientPrompt("Link unavailable.");
      return false;
    }
    document.exitPointerLock?.();
    const popup = window.open(targetUrl, "_blank", "noopener,noreferrer");
    if (popup) {
      return true;
    }
    showPopupBlockedMessage();
    return false;
  }

  async function unlockSecretById(secretId, options = {}) {
    const normalizedSecretId = typeof secretId === "string" ? secretId.trim() : "";
    if (!normalizedSecretId) {
      return false;
    }

    const unlock = secretUnlocks.find((entry) => entry.id === normalizedSecretId) || null;
    if (!unlock) {
      return false;
    }

    if (!unlock.unlocked) {
      unlock.unlocked = true;
      unlock.hits = Math.max(unlock.hits, unlock.requiredEntries);
      unlock.wasInside = false;
      unlock.nextEligibleAtMs = performance.now() + unlock.cooldownMs;
      secretUnlockedIds.add(unlock.id);
      persistSecretUnlocks();
      applySecretFloorplanOverrides();
    }

    showSecretUnlockMessage(options.message || unlock.message);
    return true;
  }

  function teleportPlayer(position, yaw = null, pitchValue = null) {
    if (!sceneContext?.player || !Array.isArray(position) || position.length < 3) {
      return false;
    }

    const nextPosition = new THREE.Vector3(
      Number(position[0]) || 0,
      Number(position[1]) || sceneContext.player.position.y || 1.7,
      Number(position[2]) || 0
    );
    const nextYaw = Number.isFinite(yaw) ? THREE.MathUtils.degToRad(yaw) : sceneContext.player.rotation.y;
    const nextPitch =
      sceneContext.pitch && Number.isFinite(pitchValue)
        ? THREE.MathUtils.degToRad(pitchValue)
        : sceneContext?.pitch?.rotation?.x ?? 0;

    if (controls?.setPose) {
      controls.setPose({
        position: nextPosition,
        yaw: nextYaw,
        pitch: nextPitch
      });
    } else {
      sceneContext.player.position.copy(nextPosition);
      sceneContext.player.rotation.y = nextYaw;
      if (sceneContext.pitch) {
        sceneContext.pitch.rotation.x = nextPitch;
      }
    }
    interactionSystem?.setHovered?.(null);
    return true;
  }

  function focusCatalogRoomWall(roomId, wall = "front", distance = 4.2) {
    if (!catalogSystem?.isRoomEnabled?.(roomId)) {
      return false;
    }

    const roomConfig = catalogSystem?.getRoomConfig?.(roomId);
    if (!roomConfig) {
      return false;
    }

    const origin = Array.isArray(roomConfig.origin) ? roomConfig.origin : [0, 0, 0];
    const size = Array.isArray(roomConfig.size) ? roomConfig.size : [8.6, 4.6, 9.6];
    const rotationDeg = Number(roomConfig.rotationY) || 0;
    const rotationRad = THREE.MathUtils.degToRad(rotationDeg);
    const safeDistance = Math.max(1.4, Number(distance) || 4.2);
    const playerY = sceneContext?.player?.position?.y || 1.7;
    const normalizedWall = typeof wall === "string" ? wall.trim().toLowerCase() : "front";
    let localX = 0;
    let localZ = size[2] * 0.5 - safeDistance;
    let yawDeg = 180;

    switch (normalizedWall) {
      case "back":
        localZ = -size[2] * 0.5 + safeDistance;
        yawDeg = 0;
        break;
      case "left":
        localX = -size[0] * 0.5 + safeDistance;
        localZ = 0;
        yawDeg = -90;
        break;
      case "right":
        localX = size[0] * 0.5 - safeDistance;
        localZ = 0;
        yawDeg = 90;
        break;
      default:
        break;
    }

    const rotatedOffset = new THREE.Vector3(localX, 0, localZ).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      rotationRad
    );
    return teleportPlayer(
      [origin[0] + rotatedOffset.x, playerY, origin[2] + rotatedOffset.z],
      yawDeg + rotationDeg,
      0
    );
  }

  function activateCenterArtifactTarget() {
    const target =
      getInteractionTargets().find((entry) => entry?.id === CENTER_ARTIFACT_TARGET_ID) || null;
    activateCenterArtifact(target);
    return centerArtifactActivated;
  }

  function refreshInteractiveSurfaces() {
    interactionSystem?.setTargets?.(getInteractionTargets());
    scenePanelSystem?.setPanels?.(sceneContext?.getDisplayPanels?.() || []);
    scenePanelSystem?.update?.(rendererContext?.camera);
  }

  function buildModelLabRuntimeUrl(enabled) {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("debugui", "1");
    nextUrl.searchParams.set("sceneui", "1");
    nextUrl.searchParams.delete("editor");
    if (enabled) {
      nextUrl.searchParams.set("modellab", "1");
    } else {
      nextUrl.searchParams.delete("modellab");
    }
    return nextUrl.toString();
  }

  function navigateToModelLabRuntime() {
    window.location.assign(buildModelLabRuntimeUrl(true));
    return true;
  }

  function navigateToLobbyRuntime() {
    window.location.assign(buildModelLabRuntimeUrl(false));
    return true;
  }

  function syncDevModelShowroomState(patch = null) {
    if (isObject(patch)) {
      devModelShowroomState = {
        ...devModelShowroomState,
        ...patch
      };
    }
    ui?.setDevModelShowroomState?.(devModelShowroomState);
    return {
      ...devModelShowroomState
    };
  }

  function createDevModelShowroomActionResult(message, tone = "success") {
    return {
      modelShowroomState: {
        ...devModelShowroomState
      },
      devStatusMessage: readText(message, devModelShowroomState.modelShowroomStatus),
      devStatusTone: readText(tone, devModelShowroomState.modelShowroomTone)
    };
  }

  async function requestDevModelShowroomManifest(forceRefresh = false) {
    const manifest = await loadDevModelIntakeManifest({ forceRefresh });
    devModelShowroomManifest = manifest;
    return manifest;
  }

  async function scanDevModelShowroomManifest({ forceRefresh = false } = {}) {
    if (!devModelShowroomSupported) {
      return createDevModelShowroomActionResult("Model lab is available while running locally.", "muted");
    }

    syncDevModelShowroomState({
      modelShowroomBusy: true,
      modelShowroomStatus: forceRefresh
        ? "Refreshing local intake assets."
        : "Scanning local intake assets.",
      modelShowroomTone: "info"
    });

    try {
      const manifest = await requestDevModelShowroomManifest(forceRefresh);
      const portableCount = Number(manifest?.summary?.portableCount) || 0;
      const totalCount = Number(manifest?.summary?.totalCount) || 0;
      const nextStatus = totalCount
        ? `${portableCount}/${totalCount} intake models passed portability checks.`
        : "No intake models were found in the configured external folder.";
      syncDevModelShowroomState({
        modelShowroomBusy: false,
        modelShowroomStatus: nextStatus,
        modelShowroomTone: portableCount > 0 ? "success" : "muted"
      });
      return createDevModelShowroomActionResult(nextStatus, portableCount > 0 ? "success" : "muted");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Local intake scan failed.";
      syncDevModelShowroomState({
        modelShowroomBusy: false,
        modelShowroomStatus: message,
        modelShowroomTone: "error"
      });
      throw error;
    }
  }

  function hideDevModelShowroom() {
    sceneContext?.removePropsByTag?.(DEV_MODEL_SHOWROOM_TAG);
    devModelShowroomLayout = null;
    refreshInteractiveSurfaces();

    const portableCount = Number(devModelShowroomManifest?.summary?.portableCount) || 0;
    const nextStatus = modelLabModeEnabled
      ? portableCount
        ? `Model models cleared. ${portableCount} portable intake models remain ready to reload.`
        : "Model models cleared from the isolated lab."
      : portableCount
        ? `Model lab hidden. ${portableCount} portable intake models remain ready.`
        : "Model lab hidden.";
    syncDevModelShowroomState({
      modelShowroomActive: false,
      modelShowroomBusy: false,
      modelShowroomStatus: nextStatus,
      modelShowroomTone: "muted"
    });
    return createDevModelShowroomActionResult(nextStatus, "muted");
  }

  function teleportToDevModelShowroom() {
    if (!devModelShowroomLayout?.spawnPosition) {
      return false;
    }
    return teleportPlayer(
      devModelShowroomLayout.spawnPosition,
      devModelShowroomLayout.spawnYaw,
      0
    );
  }

  async function openDevModelShowroom({ forceRefresh = false, teleport = true } = {}) {
    if (!devModelShowroomSupported) {
      return createDevModelShowroomActionResult("Model lab is available while running locally.", "muted");
    }
    if (!sceneContext?.addProps || !sceneContext?.removePropsByTag) {
      return createDevModelShowroomActionResult("Scene is still booting. Try again in a moment.", "info");
    }

    syncDevModelShowroomState({
      modelShowroomBusy: true,
      modelShowroomStatus: forceRefresh
        ? "Refreshing intake assets and rebuilding model lab."
        : "Building model lab from local intake assets.",
      modelShowroomTone: "info"
    });

    try {
      const manifest =
        forceRefresh || !devModelShowroomManifest
          ? await requestDevModelShowroomManifest(forceRefresh)
          : devModelShowroomManifest;
      const layout = buildDevModelShowroomLayout(manifest, {
        roomBounds: sceneContext?.getRoomBounds?.() || null,
        floorY: Number(sceneContext?.floorY) || 0,
        placementMode: modelLabModeEnabled ? "center" : "outside"
      });

      sceneContext.removePropsByTag(DEV_MODEL_SHOWROOM_TAG);
      if (!layout.portableEntries.length) {
        const nextStatus = Number(manifest?.summary?.totalCount) > 0
          ? "Model lab could not load because no intake models passed portability checks."
          : "No intake models were found in the configured external folder.";
        devModelShowroomLayout = null;
        syncDevModelShowroomState({
          modelShowroomActive: false,
          modelShowroomBusy: false,
          modelShowroomStatus: nextStatus,
          modelShowroomTone: "error"
        });
        return createDevModelShowroomActionResult(nextStatus, "error");
      }

      await sceneContext.addProps(layout.props, {
        tag: DEV_MODEL_SHOWROOM_TAG
      });
      devModelShowroomLayout = layout;
      refreshInteractiveSurfaces();
      if (teleport) {
        teleportToDevModelShowroom();
      }

      const nextStatus =
        modelLabModeEnabled
          ? `Isolated model lab loaded: ${layout.meta.portableCount}/${layout.meta.totalCount} portable models on dedicated preview pads.`
          : `Model lab loaded: ${layout.meta.portableCount}/${layout.meta.totalCount} portable models on isolated preview pads.`;
      syncDevModelShowroomState({
        modelShowroomActive: true,
        modelShowroomBusy: false,
        modelShowroomStatus: nextStatus,
        modelShowroomTone: "success"
      });
      return createDevModelShowroomActionResult(nextStatus, "success");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Model lab failed to load.";
      sceneContext?.removePropsByTag?.(DEV_MODEL_SHOWROOM_TAG);
      devModelShowroomLayout = null;
      refreshInteractiveSurfaces();
      syncDevModelShowroomState({
        modelShowroomActive: false,
        modelShowroomBusy: false,
        modelShowroomStatus: message,
        modelShowroomTone: "error"
      });
      throw error;
    }
  }

  function exitDevModelShowroomMode() {
    navigateToLobbyRuntime();
    return createDevModelShowroomActionResult("Returning to lobby runtime.", "info");
  }

  async function toggleDevModelShowroom() {
    if (modelLabModeEnabled) {
      return exitDevModelShowroomMode();
    }
    navigateToModelLabRuntime();
    return createDevModelShowroomActionResult("Opening isolated model lab.", "info");
  }

  async function refreshDevModelShowroom() {
    if (modelLabModeEnabled || devModelShowroomState.modelShowroomActive) {
      return openDevModelShowroom({
        forceRefresh: true,
        teleport: false
      });
    }
    return scanDevModelShowroomManifest({
      forceRefresh: true
    });
  }

  async function applyThemeSelection(themeName, options = {}) {
    let appliedTheme = themeName;
    if (options.hideInspectPanel !== false) {
      ui.hideInspectPanel?.();
    }
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
      refreshInteractiveSurfaces();
    }
    currentThemeName = appliedTheme;
    themeAmbientMixBase = getThemeAmbientMix(loadedThemesConfig, appliedTheme);
    themePostProcessingBase = getThemePostProcessing(loadedThemesConfig, appliedTheme);
    applyThemeAmbientMix();
    applyThemeAudioProfile({ playStinger: options.playStinger !== false });
    applyThemePostProcessing();
    captureThemeFogBase();
    applyDriftFogPulse();
    applyCenterArtifactLightingDominance();
    scenePanelSystem?.setPanels?.(sceneContext?.getDisplayPanels?.() || []);
    if (options.persist !== false) {
      saveThemeSelection(appliedTheme, { mirrorLegacyDevKey: isDev });
    }
    return appliedTheme;
  }

  async function handleInspectAction(action) {
    return Boolean(await interactionDirector?.runInteraction(action));
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

  function updateModuleTriggers() {
    if (!moduleTriggers.length || !sceneContext?.player?.position) {
      return;
    }

    for (const trigger of moduleTriggers) {
    if (trigger.active === false) {
      continue;
    }

    const inside = isPositionInsideBoxZone(trigger.zone, sceneContext.player.position);
    if (inside && !trigger.wasInside) {
      const updated =
          sceneContext?.setPropModulesVisible?.(
            trigger.enterModuleIds?.length ? trigger.enterModuleIds : trigger.moduleIds,
            trigger.enterVisible
          ) || [];
      if (updated.length) {
        refreshInteractiveSurfaces();
      }
      if (updated.length && trigger.message) {
        showTransientPrompt(trigger.message);
      }
      if (trigger.once) {
        trigger.active = false;
      }
    } else if (!inside && trigger.wasInside && trigger.exitVisible != null) {
      const updated =
          sceneContext?.setPropModulesVisible?.(
            trigger.exitModuleIds?.length ? trigger.exitModuleIds : trigger.moduleIds,
            trigger.exitVisible
          ) || [];
      if (updated.length) {
        refreshInteractiveSurfaces();
      }
      if (updated.length && trigger.exitMessage) {
        showTransientPrompt(trigger.exitMessage);
        }
      }

      trigger.wasInside = inside;
    }
  }

  async function tryEnableAudioFromInteraction() {
    if (audioReady || !audioSystem) {
      return audioReady;
    }

    audioReady = await audioSystem.autoEnable();
    if (audioReady) {
      ui.hideSoundGate();
      detachAudioUnlock();
    } else {
      ui.showSoundGate();
    }
    return audioReady;
  }

  const ui = createOverlay({
    mount: app,
    isMobile: mobile,
    showDevPanel: devMenuEnabled,
    showThemePanel: allowThemeSelector,
    enableInspectPanel: inspectUiEnabled,
    devMenu: {
      enabled: devMenuEnabled,
      writable: isDev,
      editorSupported,
      editorActive: editorModeEnabled,
      modelShowroomSupported: devModelShowroomSupported,
      modelShowroomActive: devModelShowroomState.modelShowroomActive,
      modelShowroomBusy: devModelShowroomState.modelShowroomBusy,
      modelShowroomIsolated: modelLabModeEnabled,
      modelShowroomStatus: devModelShowroomState.modelShowroomStatus,
      modelShowroomTone: devModelShowroomState.modelShowroomTone,
      configFiles: DEV_CONFIG_FILES,
      loadConfig: (fileName, source) => readEditableRuntimeConfig(fileName, source),
      saveConfig: (fileName, target, text) => writeEditableRuntimeConfig(fileName, target, text),
      deleteConfig: (fileName, target) => deleteEditableRuntimeConfig(fileName, target),
      reloadRuntime: () => window.location.reload(),
      toggleModelShowroom: () => toggleDevModelShowroom(),
      refreshModelShowroom: () => refreshDevModelShowroom(),
      toggleEditor: () => {
        if (!editorSupported) {
          return false;
        }
        const nextUrl = new URL(window.location.href);
        if (editorModeEnabled) {
          nextUrl.searchParams.delete("editor");
        } else {
          nextUrl.searchParams.set("editor", "1");
          nextUrl.searchParams.set("debugui", "1");
          nextUrl.searchParams.set("sceneui", "1");
        }
        window.location.assign(nextUrl.toString());
        return true;
      }
    },
    onEnableSound: async () => tryEnableAudioFromInteraction(),
    onInspectAction: async (action) => handleInspectAction(action),
    onThemeChange: async (themeName) =>
      applyThemeSelection(themeName, {
        playStinger: true,
        persist: true,
        hideInspectPanel: true
      }),
    onQualityChange: (quality) => {
      if (rendererContext) {
        rendererContext.setQuality(quality);
      }
      const nextProfile = rendererContext?.getQualityProfile(quality) || null;
      if (themeSystem?.sceneContext && rendererContext) {
        for (const light of themeSystem.sceneContext.lights) {
          if (light.isPointLight) {
            light.castShadow = Boolean(light.userData.canCastShadow && nextProfile?.shadows);
          }
        }
      }
      if (themeSystem && nextProfile) {
        themeSystem.setQualityProfile(nextProfile);
      }
      if (catalogSystem && nextProfile) {
        catalogSystem.setQualityProfile?.(nextProfile);
      }
      scenePanelSystem?.setUpdateIntervalMs?.(
        Math.round((nextProfile?.visibilityUpdateInterval || 0.12) * 1000)
      );
      saveQualitySelection(quality, { mirrorLegacyDevKey: isDev });
    }
  });
  syncDevModelShowroomState();
  const debugRuntimeStartedAtMs = performance.now();
  let lastRuntimeElapsed = 0;
  mountRuntimeDebugApi();
  if (editorModeEnabled && !app.querySelector("#local-editor")) {
    const editorHost = app.querySelector(".ui-layer") || app;
    const placeholder = document.createElement("section");
    placeholder.id = "local-editor";
    placeholder.className = "editor-panel";
    placeholder.dataset.ui = "true";
    placeholder.innerHTML = `
      <header class="editor-panel-head" data-ui>
        <p class="editor-panel-kicker" data-ui>Scene Tools</p>
        <div class="editor-panel-title-row" data-ui>
          <div data-ui>
            <h2 data-ui>Local Scene Editor</h2>
            <p class="editor-panel-subtitle" data-ui>Loading editor tools.</p>
          </div>
          <div class="editor-panel-badge-row" data-ui>
            <span class="editor-panel-badge" data-ui>Local</span>
            <span class="editor-panel-badge editor-panel-badge-active" data-ui>Loading</span>
          </div>
        </div>
      </header>
    `;
    editorHost.appendChild(placeholder);
  }
  ui.hideFallback();
  ui.showLoading({
    title: modelLabModeEnabled ? "Opening Model Lab" : "Entering Lobby",
    message: modelLabModeEnabled
      ? "Preparing isolated preview space."
      : "Loading runtime configuration."
  });

  let sceneConfig = null;
  let runtimeThemesConfig = null;
  let audioConfig = null;
  let driftEventsConfig = null;
  let objectivesConfig = null;
  let catalogConfig = null;
  let sceneEditorOverrides = normalizeEditorOverrides(null);
  let catalogFeeds = {};

  if (modelLabModeEnabled) {
    sceneConfig = createIsolatedDevModelLabSceneConfig();
    runtimeThemesConfig = null;
    audioConfig = { ambientLayers: [], sfx: {}, portalAudio: {}, themeStingers: {} };
    driftEventsConfig = { enabled: false };
    objectivesConfig = { enabled: false, objectives: [], ui: { showStabilityMeter: false, showObjectivesPanel: false } };
    catalogConfig = { rooms: {} };
    ui.setDevConfigFiles?.(DEV_CONFIG_FILES);
  } else {
    [
      sceneConfig,
      runtimeThemesConfig,
      audioConfig,
      driftEventsConfig,
      objectivesConfig,
      catalogConfig
    ] = await Promise.all([
      loadSceneConfig(),
      loadRuntimeConfig("themes.json", { optional: true }),
      loadRuntimeConfig("audio.json"),
      loadRuntimeConfig("drift-events.json", { optional: true }),
      loadRuntimeConfig("objectives.json", { optional: true }),
      loadRuntimeConfig("catalog.json", { optional: true })
    ]);
    const catalogFeedDefinitions = getCatalogFeedDefinitions(catalogConfig);
    sceneEditorOverrides = normalizeEditorOverrides(sceneConfig?.editorOverrides);
    ui.setDevConfigFiles?.(mergeDevConfigFiles(DEV_CONFIG_FILES, buildCatalogFeedDevConfigFiles(catalogConfig)));
    const catalogFeedEntries = await Promise.all(
      catalogFeedDefinitions.map(async (definition) => [
        definition.feedSource,
        (await loadRuntimeConfig(definition.fileName, { optional: true })) || { items: [] }
      ])
    );
    catalogFeeds = Object.fromEntries(catalogFeedEntries);
  }

  ui.setLoadingState({
    message: modelLabModeEnabled ? "Calibrating model lab renderer." : "Calibrating render pipeline."
  });
  const emergencyThemesConfig = {
    defaultTheme: "lobby",
    themes: {
      lobby: {
        label: modelLabModeEnabled ? "Model Lab" : "Lobby"
      }
    }
  };

  loadedThemesConfig = hasThemeMap(runtimeThemesConfig)
    ? runtimeThemesConfig
    : emergencyThemesConfig;

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
  const autoUnlockAudio = () => {
    tryEnableAudioFromInteraction().catch(() => {});
  };
  rendererContext.renderer.domElement.addEventListener("pointerdown", autoUnlockAudio, {
    passive: true
  });
  detachAudioUnlock = () => {
    rendererContext?.renderer?.domElement?.removeEventListener?.("pointerdown", autoUnlockAudio);
  };
  ui.setLoadingState({
    message: modelLabModeEnabled ? "Assembling model lab geometry." : "Assembling scene geometry."
  });
  if (perfEnabled) {
    perfHud = createPerfHud({ mount: app });
  }

  cache = new AssetCache();
  const qualityProfile = rendererContext.getQualityProfile(quality);
  sceneContext = await loadScene({
    scene: rendererContext.scene,
    camera: rendererContext.camera,
    cache,
    sceneConfig,
    qualityProfile,
    catalogConfig,
    catalogFeeds
  });
  if (editorModeEnabled && ARTIFACT_TRANSITION_MODULE_ID) {
    sceneContext?.setPropModulesVisible?.([ARTIFACT_TRANSITION_MODULE_ID], true);
  }
  secretUnlocks = modelLabModeEnabled
    ? []
    : normalizeSecretUnlocks(
        sceneConfig.secretUnlocks,
        sceneContext?.zones || sceneConfig?.zones || [],
        secretUnlockedIds
      );
  moduleTriggers = modelLabModeEnabled
    ? []
    : normalizeModuleTriggers(
        sceneConfig.moduleTriggers,
        sceneContext?.zones || sceneConfig?.zones || []
      );
  scenePanelSystem = new ScenePanelSystem({
    domElement: rendererContext.renderer.domElement,
    camera: rendererContext.camera,
    scene: rendererContext.scene,
    panels: sceneContext?.getDisplayPanels?.() || [],
    onOpenUrl: (url) => openExternalUrl(url),
    isPointerLocked: () => controls?.isPointerLocked?.() || false,
    updateIntervalMs: Math.round((qualityProfile?.visibilityUpdateInterval || 0.12) * 1000)
  });
  ui.setLoadingState({
    message: modelLabModeEnabled ? "Loading validated intake models." : "Linking portals and systems."
  });

  let appliedTheme = "lobby";
  let catalogReady = false;
  let catalogInitPromise = Promise.resolve();

  if (modelLabModeEnabled) {
    availableThemeIds = ["lobby"];
    currentThemeName = "lobby";
    ui.setThemeOptions([{ id: "lobby", label: "Model Lab" }], "lobby");
    ui.setTheme("lobby");
    ui.hideSoundGate();
    catalogReady = true;
  } else {
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
    appliedTheme = await applyThemeSelection(themeName, {
      playStinger: false,
      persist: false,
      hideInspectPanel: true
    });
    if (appliedTheme) {
      if (isDev) {
        writeStorageString(LEGACY_DEV_THEME_STORAGE_KEY, appliedTheme);
      }
    } else {
      themeSystem.resetToBaseState();
      ui.setTheme(availableThemeIds[0] || "lobby");
    }
    const { CatalogRoomSystem } = await import("./systems/catalog/catalogRoomSystem.js");
    catalogSystem = new CatalogRoomSystem({
      scene: rendererContext.scene,
      cache,
      catalogConfig: catalogConfig || {},
      catalogFeeds,
      domElement: rendererContext.renderer.domElement,
      qualityProfile,
      wallMaterialSource: sceneContext.roomMaterials?.wall || null,
      floorMaterialSource: sceneContext.roomMaterials?.floor || null
    });
    catalogInitPromise = catalogSystem
      .initialize(appliedTheme || themeName)
      .then(async () => {
        catalogReady = true;
        await applySceneEditorOverrides(sceneEditorOverrides, { markDirty: false });
        await editorSystem?.loadSavedState?.({ silent: true });
        editorSystem?.refreshOutliner?.();
        refreshInteractiveSurfaces();
      })
      .catch((error) => {
        console.error("Catalog failed to initialize", error);
      });
  }

  getInteractionTargets = () => [
    ...(sceneContext?.portals || []),
    ...(sceneContext?.getInteractionTargets?.() || []),
    ...(catalogSystem?.getTargets() || [])
  ];

  function getPlayerColliders() {
    const colliders = [];
    const sceneColliders = sceneContext?.getColliders?.();
    const catalogColliders = catalogSystem?.getColliders?.();

    if (Array.isArray(sceneColliders) && sceneColliders.length) {
      colliders.push(...sceneColliders);
    }
    if (Array.isArray(catalogColliders) && catalogColliders.length) {
      colliders.push(...catalogColliders);
    }

    return colliders;
  }

  async function applySceneEditorOverrides(overrides = sceneEditorOverrides, { markDirty = false } = {}) {
    const normalized = normalizeEditorOverrides(overrides);
    let updated = 0;

    updated += (await sceneContext?.setEditorCreatedProps?.(normalized.createdProps, { markDirty })) || 0;
    updated += sceneContext?.applyEditablePropTransforms?.(normalized.props, { markDirty }) || 0;

    for (const propId of normalized.hiddenProps) {
      if (sceneContext?.setEditablePropVisible?.(propId, false, { markDirty })) {
        updated += 1;
      }
    }

    for (const shellNodeId of normalized.hiddenGeneratedNodes) {
      if (catalogSystem?.setGeneratedShellNodeVisible?.(shellNodeId, false)) {
        updated += 1;
      }
    }

    if (updated > 0) {
      refreshInteractiveSurfaces();
      editorSystem?.refreshOutliner?.();
    }
    return updated;
  }

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
        onPointerLockChange: (locked) => ui.setPointerLockState(locked),
        shouldRequestPointerLock: (event) =>
          !editorModeEnabled && !interactionSystem?.peekActivationTarget?.(event)
      });

  interactionDirector = new InteractionDirector({
    inspectTarget: async (target) => {
      if (target?.id === CENTER_ARTIFACT_TARGET_ID) {
        activateCenterArtifact(target);
      }
      if (controls?.isPointerLocked?.()) {
        return true;
      }
      if (!inspectUiEnabled) {
        ui.hideInspectPanel?.();
        return true;
      }
      ui.showInspectPanel?.(target.inspectData);
      return true;
    },
    openUrl: async (url) => openExternalUrl(url),
    applyTheme: async (themeName) =>
      applyThemeSelection(themeName, {
        playStinger: true,
        persist: true,
        hideInspectPanel: false
      }),
    teleport: async (interaction) =>
      teleportPlayer(interaction.position, interaction.yaw, interaction.pitch),
    unlockSecret: unlockSecretById,
    playScreenVideo: async (interaction) => {
      document.exitPointerLock?.();
      return Boolean(await catalogSystem?.playScreenVideo?.(interaction));
    },
    activateCenterArtifact,
    toggleModules: async (moduleIds) => {
      const updated = sceneContext?.togglePropModulesVisible?.(moduleIds) || [];
      refreshInteractiveSurfaces();
      return updated;
    },
    setModulesVisible: async (moduleIds, visible) => {
      const updated = sceneContext?.setPropModulesVisible?.(moduleIds, visible) || [];
      refreshInteractiveSurfaces();
      return updated;
    },
    activatePortal: async (portalId, interaction = {}) => {
      const normalizedPortalId = typeof portalId === "string" ? portalId.trim() : "";
      if (!normalizedPortalId) {
        return false;
      }
      const portalUrl =
        interaction.url ||
        sceneContext?.portals?.find((entry) => entry.id === normalizedPortalId)?.url ||
        "";
      return openExternalUrl(portalUrl);
    },
    showPrompt: showTransientPrompt
  });

  interactionSystem = new PortalInteractionSystem({
    domElement: rendererContext.renderer.domElement,
    camera: rendererContext.camera,
    targets: getInteractionTargets(),
    isPointerLocked: () => controls?.isPointerLocked?.() || false,
    syncMatrices: () => rendererContext.scene?.updateMatrixWorld?.(),
    onHover: (target) => {
      ui.setPortalPrompt(target?.type === "portal" ? target : null);
    },
    onActivate: (target) => {
      const activation = interactionDirector?.activate(target);
      activation?.catch?.((error) => {
        console.error("Target interaction failed", error);
      });
    }
  });
  if (catalogReady) {
    interactionSystem.setTargets(getInteractionTargets());
  }

  if (editorModeEnabled) {
    const { createLocalSceneEditor } = await import("./editor/localSceneEditor.js");
    editorSystem = createLocalSceneEditor({
      mount: app,
      scene: rendererContext.scene,
      camera: rendererContext.camera,
      renderer: rendererContext.renderer,
      sceneContext,
      catalogSystem,
      applyLookDelta: (deltaX, deltaY) => controls?.applyLookDelta?.(deltaX, deltaY),
      clearMovementKeys: () => controls?.clearKeys?.(),
      readSceneConfig: (source = "effective") => readEditableRuntimeConfig("scene.json", source),
      writeSceneConfig: import.meta.env.DEV
        ? (target, text) => writeEditableRuntimeConfig("scene.json", target, text)
        : null,
      onSceneMutated: () => {
        refreshInteractiveSurfaces();
      },
      onSuppressPointerLock: () => {
        rendererContext.renderer.domElement.dataset.pointerLockSuppressedUntil = String(
          performance.now() + 600
        );
        document.exitPointerLock?.();
        controls?.clearKeys?.();
      }
    });
    refreshInteractiveSurfaces();
  }
  if (devModelShowroomRequested) {
    openDevModelShowroom({
      forceRefresh: false,
      teleport: true
    }).catch((error) => {
      console.warn("Model lab preload failed", error);
    });
  }

  const debugTargetBounds = new THREE.Box3();
  const debugTargetCenter = new THREE.Vector3();
  const debugTargetNdc = new THREE.Vector3();
  let lastSceneRevision =
    typeof sceneContext?.getSceneRevision === "function" ? sceneContext.getSceneRevision() : -1;

  function syncDebugRuntimeState({ forceScenePanels = false } = {}) {
    const activeCamera = rendererContext?.camera || null;
    const activeScene = rendererContext?.scene || null;
    const previousElapsed = Number.isFinite(lastRuntimeElapsed) ? lastRuntimeElapsed : 0;
    const wallClockElapsed = Math.max(0, performance.now() - debugRuntimeStartedAtMs) / 1000;
    const elapsed = Math.max(previousElapsed, wallClockElapsed);
    const delta = Math.min(Math.max(elapsed - previousElapsed, 0), 0.05);
    lastRuntimeElapsed = elapsed;

    sceneContext?.updateDynamicProps?.(elapsed, activeCamera);
    catalogSystem?.update?.(delta, elapsed, activeCamera);
    updateCenterArtifact(delta, elapsed);
    updateModuleTriggers();
    activeCamera?.updateMatrixWorld?.(true);
    activeScene?.updateMatrixWorld?.(true);

    if (forceScenePanels && scenePanelSystem && activeCamera) {
      scenePanelSystem.lastUpdateAt = -Infinity;
      scenePanelSystem.update(activeCamera);
    }
  }

  function getInteractionTargetById(targetId) {
    const normalizedTargetId = typeof targetId === "string" ? targetId.trim() : "";
    if (!normalizedTargetId) {
      return null;
    }
    return getInteractionTargets().find((entry) => entry?.id === normalizedTargetId) || null;
  }

  function projectInteractionTarget(targetId) {
    const target = getInteractionTargetById(targetId);
    const camera = rendererContext?.camera;
    if (!target?.hitbox || !camera) {
      return null;
    }

    rendererContext.scene?.updateMatrixWorld?.(true);
    debugTargetBounds.setFromObject(target.hitbox);
    if (debugTargetBounds.isEmpty()) {
      debugTargetCenter.setFromMatrixPosition(target.hitbox.matrixWorld);
    } else {
      debugTargetBounds.getCenter(debugTargetCenter);
    }

    debugTargetNdc.copy(debugTargetCenter).project(camera);
    return {
      id: target.id,
      label: target.label || null,
      ndc: {
        x: Number(debugTargetNdc.x.toFixed(4)),
        y: Number(debugTargetNdc.y.toFixed(4)),
        z: Number(debugTargetNdc.z.toFixed(4))
      },
      distance: Number(camera.position.distanceTo(debugTargetCenter).toFixed(4)),
      withinViewport: Math.abs(debugTargetNdc.x) <= 1 && Math.abs(debugTargetNdc.y) <= 1,
      inFrontOfCamera: debugTargetNdc.z >= -1 && debugTargetNdc.z <= 1,
      pickedAtProjection: interactionSystem?.debugPickAtNdc?.(debugTargetNdc.x, debugTargetNdc.y)?.id || null
    };
  }

  function readDebugPosition(value) {
    if (Array.isArray(value) && value.length >= 3) {
      const x = Number(value[0]);
      const y = Number(value[1]);
      const z = Number(value[2]);
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        return [x, y, z];
      }
      return null;
    }
    if (value && typeof value === "object") {
      const x = Number(value.x);
      const y = Number(value.y);
      const z = Number(value.z);
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        return [x, y, z];
      }
    }
    return null;
  }

  function probeColliders(position, radius = 0.38) {
    const point = readDebugPosition(position);
    const probeRadius = THREE.MathUtils.clamp(Number(radius) || 0.38, 0.05, 2.5);
    if (!point) {
      return {
        blocked: false,
        blockerCount: 0,
        blockers: []
      };
    }

    const [x, y, z] = point;
    const colliders = typeof getPlayerColliders === "function" ? getPlayerColliders() : [];
    const roundColliderValue = (value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? Number(numeric.toFixed(4)) : 0;
    };
    const blockers = [];
    for (const collider of colliders) {
      if (!collider || collider.enabled === false) {
        continue;
      }
      const minY = Number.isFinite(collider.minY) ? collider.minY : -Infinity;
      const maxY = Number.isFinite(collider.maxY) ? collider.maxY : Infinity;
      if (y < minY || y > maxY) {
        continue;
      }
      const minX = (Number(collider.minX) || 0) - probeRadius;
      const maxX = (Number(collider.maxX) || 0) + probeRadius;
      const minZ = (Number(collider.minZ) || 0) - probeRadius;
      const maxZ = (Number(collider.maxZ) || 0) + probeRadius;
      if (x < minX || x > maxX || z < minZ || z > maxZ) {
        continue;
      }
      blockers.push({
        id: collider.id || null,
        tag: collider.tag || null,
        roomId: collider.roomId || null,
        roomIndex: Number.isFinite(collider.roomIndex) ? collider.roomIndex : null,
        minX: roundColliderValue(collider.minX),
        maxX: roundColliderValue(collider.maxX),
        minZ: roundColliderValue(collider.minZ),
        maxZ: roundColliderValue(collider.maxZ)
      });
      if (blockers.length >= 12) {
        break;
      }
    }

    return {
      blocked: blockers.length > 0,
      blockerCount: blockers.length,
      radius: Number(probeRadius.toFixed(3)),
      position: [Number(x.toFixed(4)), Number(y.toFixed(4)), Number(z.toFixed(4))],
      blockers
    };
  }

  function getDebugStats(options = {}) {
    const includeRaycasts = options.includeRaycasts === true;
    const rendererInfo = rendererContext?.renderer?.info;
    const playerPos = sceneContext?.player?.position;
    const propStats = sceneContext?.getPropStats?.() || { total: 0, byTag: {} };
    const moduleStates = sceneContext?.getPropModuleStates?.() || [];
    const stabilityState = stabilitySystem?.getState?.() || null;
    return {
      theme: themeSystem?.currentThemeName || currentThemeName || null,
      portalCount: (sceneContext?.portals || []).length,
      interactionTargetCount: getInteractionTargets().length,
      secretUnlocks: secretUnlocks
        .filter((entry) => entry.unlocked)
        .map((entry) => entry.id),
      anyInteractionHit: includeRaycasts ? interactionSystem?.debugFindAnyTargetHit?.()?.id || null : null,
      anyPortalHit: includeRaycasts ? interactionSystem?.debugFindAnyPortalHit?.()?.id || null : null,
      player: playerPos
        ? {
            x: Number(playerPos.x.toFixed(3)),
            y: Number(playerPos.y.toFixed(3)),
            z: Number(playerPos.z.toFixed(3))
          }
        : null,
      props: propStats,
      modules: moduleStates,
      moduleTriggers: moduleTriggers.map((entry) => ({
        id: entry.id,
        zoneId: entry.zoneId,
        moduleIds: [...entry.moduleIds],
        exitModuleIds: [...(entry.exitModuleIds || [])],
        wasInside: entry.wasInside,
        active: entry.active !== false
      })),
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
      scenePanels: scenePanelSystem?.getDebugStats?.() || null,
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

  function createRuntimeDebugApi() {
    return {
      getStats: (options = {}) =>
        getDebugStats({
          includeRaycasts: true,
          ...options
        }),
      setTheme: async (themeName) =>
        applyThemeSelection(themeName, {
          playStinger: true,
          persist: false,
          hideInspectPanel: false
        }),
      getDriftSnapshot: () => driftSystem?.getSnapshot?.() || null,
      resetDrift: (seed) => driftSystem?.reset?.(seed),
      getModuleStates: () => sceneContext?.getPropModuleStates?.() || [],
      setModuleVisibility: (moduleId, visible) => {
        const updated = sceneContext?.setPropModulesVisible?.([moduleId], visible) || [];
        refreshInteractiveSurfaces();
        return updated;
      },
      toggleModuleVisibility: (moduleId) => {
        const updated = sceneContext?.togglePropModulesVisible?.([moduleId]) || [];
        refreshInteractiveSurfaces();
        return updated;
      },
      playScreeningItem: (roomId, itemId) =>
        catalogSystem?.playScreenVideo?.({ roomId, itemId }) || false,
      getScreeningState: () => catalogSystem?.getScreeningState?.() || null,
      getCatalogRoomIds: () => catalogSystem?.getConfiguredRoomIds?.() || [],
      getCatalogRoomSnapshot: (roomId) => {
        syncDebugRuntimeState();
        return catalogSystem?.getRoomSnapshot?.(roomId) || null;
      },
      estimateCatalogRoomCount: (roomId, itemCount) =>
        catalogSystem?.estimateRoomCount?.(roomId, itemCount) ?? null,
      getScenePanelIds: () => {
        const runtimePanels = scenePanelSystem?.getPanelSnapshots?.() || [];
        const panelSource = runtimePanels.length
          ? runtimePanels
          : (sceneContext?.getDisplayPanels?.() || []).map((entry) => ({
              id: typeof entry?.id === "string" ? entry.id.trim() : ""
            }));
        return panelSource
          .map((entry) => (typeof entry?.id === "string" ? entry.id.trim() : ""))
          .filter(Boolean);
      },
      getScenePanels: () => {
        syncDebugRuntimeState({
          forceScenePanels: true
        });
        const runtimePanels = scenePanelSystem?.getPanelSnapshots?.() || [];
        if (runtimePanels.length) {
          return runtimePanels;
        }
        return (sceneContext?.getDisplayPanels?.() || []).map((entry) => ({
          id: typeof entry?.id === "string" ? entry.id.trim() : "",
          type: entry?.type || null,
          imageCount: Array.isArray(entry?.images) ? entry.images.length : 0,
          visible: entry?.object?.visible !== false,
          ctaUrl: typeof entry?.cta?.url === "string" ? entry.cta.url : ""
        }));
      },
      activateScenePanelCta: (panelId) => scenePanelSystem?.activatePanelCta?.(panelId) || false,
      debugProjectScenePanel: (panelId) => {
        syncDebugRuntimeState({
          forceScenePanels: true
        });
        return scenePanelSystem?.debugProjectPanel?.(panelId) || null;
      },
      getScenePanelPerf: () => scenePanelSystem?.getDebugStats?.() || null,
      getPropState: (propId) => {
        syncDebugRuntimeState();
        return sceneContext?.getPropState?.(propId) || null;
      },
      getPropPlacementDiagnostics: (propId) =>
        sceneContext?.getEditablePropPlacementDiagnostics?.(propId) || null,
      resolvePropPlacement: (propId, markDirty = true) =>
        sceneContext?.resolveEditablePropPlacement?.(propId, {
          markDirty: markDirty !== false
        }) || null,
      getGeneratedShellEntries: (roomId) => {
        syncDebugRuntimeState();
        return catalogSystem?.getGeneratedShellEntries?.(roomId) || [];
      },
      setGeneratedShellVisible: (shellNodeId, visible) =>
        catalogSystem?.setGeneratedShellNodeVisible?.(shellNodeId, visible) || false,
      restoreGeneratedShellRoom: (roomId) => catalogSystem?.restoreGeneratedShellRoom?.(roomId) || 0,
      getEditorSnapshot: () => editorSystem?.getSnapshot?.() || null,
      getEditorStatePayload: () => editorSystem?.buildState?.() || null,
      saveEditorState: () => editorSystem?.saveState?.() || null,
      loadEditorState: async () => (await editorSystem?.loadSavedState?.()) ?? 0,
      clearEditorState: () => {
        editorSystem?.clearState?.();
        return true;
      },
      createEditorPreset: async () => (await editorSystem?.createFromPreset?.()) || false,
      duplicateSelectedEditorProp: async () => (await editorSystem?.duplicateSelected?.()) || false,
      deleteSelectedEditorItem: () => editorSystem?.deleteSelected?.() || false,
      selectEditorProp: (propId) => Boolean(editorSystem?.selectProp?.(propId)),
      selectGeneratedShellNode: (shellNodeId) => Boolean(editorSystem?.selectGeneratedNode?.(shellNodeId)),
      getDevModelShowroomState: () => ({
        ...devModelShowroomState,
        sourceDir: readText(devModelShowroomManifest?.sourceDir, ""),
        summary: cloneJson(devModelShowroomManifest?.summary || null)
      }),
      scanDevModelShowroom: async (forceRefresh = false) =>
        scanDevModelShowroomManifest({
          forceRefresh: forceRefresh !== false
        }),
      loadDevModelShowroom: async (options = {}) =>
        openDevModelShowroom({
          forceRefresh: options?.forceRefresh === true,
          teleport: options?.teleport !== false
        }),
      hideDevModelShowroom: () => hideDevModelShowroom(),
      reloadDevModelShowroom: async () =>
        openDevModelShowroom({
          forceRefresh: true,
          teleport: false
        }),
      teleportToDevModelShowroom: () => teleportToDevModelShowroom(),
      probeColliders: (position, radius) => probeColliders(position, radius),
      activateCenterArtifact: () => activateCenterArtifactTarget(),
      teleport: (position, yaw, pitch) => teleportPlayer(position, yaw, pitch),
      focusCatalogRoomWall: (roomId, wall, distance) => focusCatalogRoomWall(roomId, wall, distance),
      getInteractionTargetIds: () =>
        getInteractionTargets()
          .map((target) => (typeof target?.id === "string" ? target.id.trim() : ""))
          .filter(Boolean),
      projectInteractionTarget: (targetId) => projectInteractionTarget(targetId),
      getPortalIds: () =>
        (sceneContext?.portals || [])
          .map((portal) => (typeof portal?.id === "string" ? portal.id.trim() : ""))
          .filter(Boolean),
      pickTargetAt: (x = 0, y = 0) => interactionSystem?.debugPickAtNdc?.(x, y)?.id || null,
      getHoveredTargetId: () => interactionSystem?.hoveredTarget?.id || null,
      findAnyTargetHit: () => interactionSystem?.debugFindAnyTargetHit?.()?.id || null,
      findAnyPortalHit: () => interactionSystem?.debugFindAnyPortalHit?.()?.id || null,
      activateAnyPortal: () => Boolean(interactionSystem?.debugActivateAnyPortal?.()),
      activatePortal: (portalId) =>
        interactionDirector?.runInteraction?.({
          type: "portal",
          portalId
        }) || false,
      activateHoveredOrAnyTarget: () =>
        Boolean(interactionSystem?.debugActivateHoveredOrAnyTarget?.())
    };
  }

  function mountRuntimeDebugApi() {
    if (!runtimeDebugApiEnabled || debugApiMounted) {
      return;
    }
    window.__LOBBY_DEBUG = createRuntimeDebugApi();
    debugApiMounted = true;
  }

  const clock = new THREE.Clock();
  let sceneInteractive = false;
  let rendererWarmupStarted = false;

  function startRendererWarmup() {
    if (rendererWarmupStarted || editorModeEnabled || !rendererContext) {
      return;
    }
    rendererWarmupStarted = true;
    Promise.resolve(rendererContext.precompile?.()).catch((error) => {
      console.warn("Renderer warmup skipped", error);
    });
  }

  rendererContext.renderer.setAnimationLoop(() => {
    const delta = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.elapsedTime;
    lastRuntimeElapsed = elapsed;
    controls?.update(delta);
    for (const portal of sceneContext.portals || []) {
      portal.update?.(delta, elapsed);
    }
    sceneContext.updateDynamicProps?.(elapsed, rendererContext.camera);
    catalogSystem?.update(delta, elapsed, rendererContext.camera);
    const currentSceneRevision =
      typeof sceneContext?.getSceneRevision === "function" ? sceneContext.getSceneRevision() : -1;
    if (currentSceneRevision !== lastSceneRevision) {
      lastSceneRevision = currentSceneRevision;
      refreshInteractiveSurfaces();
      editorSystem?.refreshOutliner?.();
    }
    rendererContext.scene?.updateMatrixWorld?.();
    scenePanelSystem?.update(rendererContext.camera);
    interactionSystem?.update();
    themeSystem?.update(delta);
    if (driftSystem?.config?.enabled) {
      driftSnapshot = driftSystem.update(delta);
      applyThemeAmbientMix();
    }
    applyDriftFogPulse();
    updateCenterArtifact(delta, elapsed);
    updateSecretUnlocks(performance.now());
    updateModuleTriggers();

    const surface = getSurfaceAtPosition(sceneContext.zones, sceneContext.player.position);
    audioSystem?.setSurface(surface);
    audioSystem?.updateSpatialAudio(rendererContext.camera);
    audioSystem?.updateZones(sceneContext.player.position);

    rendererContext.render();
    if (!sceneInteractive) {
      sceneInteractive = true;
      ui.hideLoading();
      startRendererWarmup();
    }
    perfHud?.update({
      delta,
      stats: getDebugStats()
    });
  });

  window.addEventListener("beforeunload", () => {
    detachAudioUnlock?.();
    controls?.dispose?.();
    interactionSystem?.dispose?.();
    scenePanelSystem?.dispose?.();
    editorSystem?.dispose?.();
    themeSystem?.dispose?.();
    catalogSystem?.dispose?.();
    stabilitySystem?.dispose?.();
    audioSystem?.dispose?.();
    perfHud?.dispose?.();
    if (debugApiMounted) {
      delete window.__LOBBY_DEBUG;
    }
    cache?.dispose?.();
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
    const localDebugUiEnabled = shouldEnableLocalDebugUi(params, {
      isDev,
      hostname: window.location.hostname
    });
    const sceneUiEnabled = params.get("sceneui") !== "0";
    const allowThemeSelector = sceneUiEnabled && localDebugUiEnabled;
    const fallbackSceneConfig = await loadOptionalSceneConfig();
    const fallbackLinks = getFallbackLinks(fallbackSceneConfig);

    const ui = createOverlay({
      mount: app,
      isMobile: mobile,
      showDevPanel: localDebugUiEnabled,
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
