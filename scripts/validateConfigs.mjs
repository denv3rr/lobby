import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { normalizeRuntimePhase } from "../src/utils/runtimePhases.js";
import { CORE_RUNTIME_CONFIG_FILES, listRuntimeConfigFiles } from "./configWorkspace.mjs";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULTS_DIR = path.join(ROOT_DIR, "public", "config.defaults");
const REQUIRED_FILES = [...CORE_RUNTIME_CONFIG_FILES];

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function validateVector(pathPrefix, value, errors, { positive = false } = {}) {
  if (value == null) {
    return;
  }

  if (!Array.isArray(value) || value.length < 3 || !value.slice(0, 3).every(isFiniteNumber)) {
    errors.push(`${pathPrefix} must be an array of 3 finite numbers.`);
    return;
  }

  if (positive && value.slice(0, 3).some((entry) => Number(entry) <= 0)) {
    errors.push(`${pathPrefix} must contain positive numbers.`);
  }
}

function validateBounds(pathPrefix, bounds, errors) {
  if (bounds == null) {
    return;
  }

  if (!isObject(bounds)) {
    errors.push(`${pathPrefix} must be an object.`);
    return;
  }

  const axes = ["X", "Z"];
  for (const axis of axes) {
    const minKey = `min${axis}`;
    const maxKey = `max${axis}`;
    if (!isFiniteNumber(bounds[minKey]) || !isFiniteNumber(bounds[maxKey])) {
      errors.push(`${pathPrefix}.${minKey} and ${pathPrefix}.${maxKey} must be finite numbers.`);
      continue;
    }
    if (Number(bounds[minKey]) >= Number(bounds[maxKey])) {
      errors.push(`${pathPrefix}.${minKey} must be less than ${pathPrefix}.${maxKey}.`);
    }
  }
}

function validateUniqueId(pathPrefix, value, errors, seenIds, collectionLabel) {
  const normalizedId = typeof value === "string" ? value.trim() : "";
  if (!normalizedId) {
    errors.push(`${pathPrefix} is missing required string: id.`);
    return "";
  }

  if (seenIds.has(normalizedId)) {
    errors.push(`${collectionLabel} must have unique ids. Duplicate id: "${normalizedId}".`);
    return normalizedId;
  }

  seenIds.add(normalizedId);
  return normalizedId;
}

function validateModuleIds(pathPrefix, value, errors) {
  if (value == null) {
    return;
  }

  const moduleIds = Array.isArray(value) ? value : [value];
  for (let index = 0; index < moduleIds.length; index += 1) {
    if (typeof moduleIds[index] !== "string" || !moduleIds[index].trim()) {
      errors.push(`${pathPrefix}[${index}] must be a non-empty string.`);
    }
  }
}

function validateRuntimePhase(pathPrefix, value, errors) {
  if (value == null) {
    return;
  }

  if (typeof value !== "string") {
    errors.push(`${pathPrefix} must be a string when provided.`);
    return;
  }

  const rawValue = value.trim().toLowerCase();
  if (rawValue && !normalizeRuntimePhase(rawValue) && rawValue !== "always") {
    errors.push(`${pathPrefix} references unknown runtimePhase "${value}".`);
  }
}

function validatePropConfig(pathPrefix, prop, errors, seenPropIds, { allowInheritedType = false } = {}) {
  if (!isObject(prop)) {
    errors.push(`${pathPrefix} must be an object.`);
    return;
  }

  validateUniqueId(pathPrefix, prop.id, errors, seenPropIds, "scene.json props");

  const propType = typeof prop.type === "string" ? prop.type.trim() : "";
  if (!propType && !allowInheritedType) {
    errors.push(`${pathPrefix} is missing required string: type.`);
  } else if (prop.type != null && !propType) {
    errors.push(`${pathPrefix}.type must be a non-empty string when provided.`);
  }

  validateVector(`${pathPrefix}.position`, prop.position, errors);
  validateVector(`${pathPrefix}.rotation`, prop.rotation, errors);
  validateVector(`${pathPrefix}.scale`, prop.scale, errors, {
    positive: true
  });
  validateRuntimePhase(`${pathPrefix}.runtimePhase`, prop.runtimePhase, errors);
  validateModuleIds(
    `${pathPrefix}.moduleIds`,
    prop.moduleIds ?? prop.moduleId ?? prop.modules,
    errors
  );
}

function validatePropGroups(propGroups, errors, seenPropIds = new Set()) {
  if (propGroups == null) {
    return;
  }

  if (!Array.isArray(propGroups)) {
    errors.push("scene.json propGroups must be an array when provided.");
    return;
  }

  const seenGroupIds = new Set();
  for (let index = 0; index < propGroups.length; index += 1) {
    const group = propGroups[index];
    const pathPrefix = `scene.json propGroups[${index}]`;
    if (!isObject(group)) {
      errors.push(`${pathPrefix} must be an object.`);
      continue;
    }

    validateUniqueId(pathPrefix, group.id, errors, seenGroupIds, "scene.json propGroups");
    validateVector(`${pathPrefix}.position`, group.position, errors);
    validateVector(`${pathPrefix}.rotation`, group.rotation, errors);
    validateVector(`${pathPrefix}.scale`, group.scale, errors, {
      positive: true
    });

    if (group.defaults != null && !isObject(group.defaults)) {
      errors.push(`${pathPrefix}.defaults must be an object when provided.`);
    }

    if (!Array.isArray(group.props) || !group.props.length) {
      errors.push(`${pathPrefix} is missing required non-empty array: props.`);
      continue;
    }

    for (let propIndex = 0; propIndex < group.props.length; propIndex += 1) {
      validatePropConfig(`${pathPrefix}.props[${propIndex}]`, group.props[propIndex], errors, seenPropIds, {
        allowInheritedType: true
      });
    }
  }
}

function validateProps(props, errors, seenPropIds = new Set()) {
  if (props == null) {
    return;
  }

  if (!Array.isArray(props)) {
    errors.push("scene.json props must be an array when provided.");
    return;
  }

  for (let index = 0; index < props.length; index += 1) {
    validatePropConfig(`scene.json props[${index}]`, props[index], errors, seenPropIds);
  }
}

function validateZonesConfig(zones, errors) {
  if (zones == null) {
    return;
  }

  if (!Array.isArray(zones)) {
    errors.push("scene.json zones must be an array when provided.");
    return;
  }

  const seenZoneIds = new Set();
  for (let index = 0; index < zones.length; index += 1) {
    const zone = zones[index];
    const pathPrefix = `scene.json zones[${index}]`;
    if (!isObject(zone)) {
      errors.push(`${pathPrefix} must be an object.`);
      continue;
    }

    validateUniqueId(pathPrefix, zone.id, errors, seenZoneIds, "scene.json zones");
    validateVector(`${pathPrefix}.position`, zone.position, errors);
    validateVector(`${pathPrefix}.size`, zone.size, errors, {
      positive: true
    });
  }
}

function validateSecretUnlocksConfig(secretUnlocks, errors) {
  if (secretUnlocks == null) {
    return;
  }

  if (!Array.isArray(secretUnlocks)) {
    errors.push("scene.json secretUnlocks must be an array when provided.");
    return;
  }

  const seenUnlockIds = new Set();
  for (let index = 0; index < secretUnlocks.length; index += 1) {
    const unlock = secretUnlocks[index];
    const pathPrefix = `scene.json secretUnlocks[${index}]`;
    if (!isObject(unlock)) {
      errors.push(`${pathPrefix} must be an object.`);
      continue;
    }

    validateUniqueId(pathPrefix, unlock.id, errors, seenUnlockIds, "scene.json secretUnlocks");
    if (typeof unlock.zoneId !== "string" || !unlock.zoneId.trim()) {
      errors.push(`${pathPrefix} is missing required string: zoneId.`);
    }
  }
}

async function readJson(fileName, errors) {
  const fullPath = path.join(DEFAULTS_DIR, fileName);
  try {
    const raw = await readFile(fullPath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === "ENOENT") {
      errors.push(`Missing required config: public/config.defaults/${fileName}`);
      return null;
    }

    if (error instanceof SyntaxError) {
      errors.push(`Invalid JSON in public/config.defaults/${fileName}: ${error.message}`);
      return null;
    }

    errors.push(`Failed reading public/config.defaults/${fileName}: ${error.message}`);
    return null;
  }
}

function validateSceneConfig(sceneConfig, errors) {
  if (!isObject(sceneConfig)) {
    errors.push("scene.json must be a JSON object.");
    return;
  }

  if (!isObject(sceneConfig.room)) {
    errors.push("scene.json is missing required object: room.");
  } else {
    validateVector("scene.json room.size", sceneConfig.room.size, errors, {
      positive: true
    });
    if (sceneConfig.room.floorY != null && !isFiniteNumber(sceneConfig.room.floorY)) {
      errors.push("scene.json room.floorY must be a finite number when provided.");
    }
    validateBounds("scene.json room.navigationBounds", sceneConfig.room.navigationBounds, errors);
  }

  if (!isObject(sceneConfig.spawn)) {
    errors.push("scene.json is missing required object: spawn.");
  } else {
    validateVector("scene.json spawn.position", sceneConfig.spawn.position, errors);
  }

  if (!Array.isArray(sceneConfig.portals)) {
    errors.push("scene.json is missing required array: portals.");
  } else {
    const seenPortalIds = new Set();
    for (let index = 0; index < sceneConfig.portals.length; index += 1) {
      const portal = sceneConfig.portals[index];
      const pathPrefix = `scene.json portals[${index}]`;

      if (!isObject(portal)) {
        errors.push(`${pathPrefix} must be an object.`);
        continue;
      }

      validateUniqueId(pathPrefix, portal.id, errors, seenPortalIds, "scene.json portals");

      if (typeof portal.label !== "string" || !portal.label.trim()) {
        errors.push(`${pathPrefix} is missing required string: label.`);
      }

      if (typeof portal.url !== "string" || !portal.url.trim()) {
        errors.push(`${pathPrefix} is missing required string: url.`);
      }

      validateVector(`${pathPrefix}.position`, portal.position, errors);
      validateVector(`${pathPrefix}.rotation`, portal.rotation, errors);
      validateVector(`${pathPrefix}.size`, portal.size, errors, {
        positive: true
      });
    }
  }

  const seenPropIds = new Set();
  validateProps(sceneConfig.props, errors, seenPropIds);
  validatePropGroups(sceneConfig.propGroups, errors, seenPropIds);
  validateSecretUnlocksConfig(sceneConfig.secretUnlocks, errors);
  validateZonesConfig(sceneConfig.zones, errors);
}

function validateThemesConfig(themesConfig, errors) {
  if (!isObject(themesConfig)) {
    errors.push("themes.json must be a JSON object.");
    return;
  }

  if (typeof themesConfig.defaultTheme !== "string" || !themesConfig.defaultTheme.trim()) {
    errors.push("themes.json is missing required string: defaultTheme.");
  }

  if (!isObject(themesConfig.themes)) {
    errors.push("themes.json is missing required object: themes.");
    return;
  }

  const themeIds = Object.keys(themesConfig.themes);
  if (!themeIds.length) {
    errors.push("themes.json themes map must not be empty.");
    return;
  }

  const defaultTheme = themesConfig.defaultTheme?.trim();
  if (defaultTheme && !themesConfig.themes[defaultTheme]) {
    errors.push(`themes.json defaultTheme "${defaultTheme}" is not defined in themes map.`);
  }
}

function validateAudioConfig(audioConfig, errors) {
  if (!isObject(audioConfig)) {
    errors.push("audio.json must be a JSON object.");
    return new Set();
  }

  if (!Array.isArray(audioConfig.ambientLayers)) {
    errors.push("audio.json is missing required array: ambientLayers.");
    return new Set();
  }

  const layerIds = new Set();
  for (let index = 0; index < audioConfig.ambientLayers.length; index += 1) {
    const layer = audioConfig.ambientLayers[index];
    const pathPrefix = `audio.json ambientLayers[${index}]`;

    if (!isObject(layer)) {
      errors.push(`${pathPrefix} must be an object.`);
      continue;
    }

    const layerId = typeof layer.id === "string" ? layer.id.trim() : "";
    if (!layerId) {
      errors.push(`${pathPrefix} is missing required string: id.`);
      continue;
    }

    if (layerIds.has(layerId)) {
      errors.push(`audio.json ambientLayers must have unique ids. Duplicate id: "${layerId}".`);
      continue;
    }

    layerIds.add(layerId);
  }

  return layerIds;
}

function validateCatalogConfig(catalogConfig, errors) {
  if (!isObject(catalogConfig)) {
    errors.push("catalog.json must be a JSON object.");
    return;
  }

  if (!isObject(catalogConfig.rooms)) {
    errors.push("catalog.json is missing required object: rooms.");
  } else {
    const requiredRooms = ["shop", "projects", "atelier", "videos"];
    for (const roomId of requiredRooms) {
      if (!isObject(catalogConfig.rooms[roomId])) {
        errors.push(`catalog.json rooms must include object: ${roomId}.`);
      }
    }
  }

  if (!isObject(catalogConfig.themeContent)) {
    errors.push("catalog.json is missing required object: themeContent.");
  }
}

function validateFeedConfig(fileName, feedConfig, errors) {
  if (!isObject(feedConfig)) {
    errors.push(`${fileName} must be a JSON object.`);
    return;
  }

  if (!Array.isArray(feedConfig.items)) {
    errors.push(`${fileName} is missing required array: items.`);
    return;
  }

  if (!feedConfig.items.length) {
    errors.push(`${fileName} items must not be empty.`);
  }
}

function validateObjectivesConfig(objectivesConfig, errors) {
  if (!isObject(objectivesConfig)) {
    errors.push("objectives.json must be a JSON object.");
    return;
  }

  if (!isObject(objectivesConfig.stability)) {
    errors.push("objectives.json is missing required object: stability.");
  }

  if (!isObject(objectivesConfig.ui)) {
    errors.push("objectives.json is missing required object: ui.");
  }

  if (!Array.isArray(objectivesConfig.objectives)) {
    errors.push("objectives.json is missing required array: objectives.");
    return;
  }

  const seenIds = new Set();
  for (let index = 0; index < objectivesConfig.objectives.length; index += 1) {
    const objective = objectivesConfig.objectives[index];
    const pathPrefix = `objectives.json objectives[${index}]`;
    if (!isObject(objective)) {
      errors.push(`${pathPrefix} must be an object.`);
      continue;
    }

    const objectiveId = typeof objective.id === "string" ? objective.id.trim() : "";
    if (!objectiveId) {
      errors.push(`${pathPrefix} is missing required string: id.`);
      continue;
    }

    if (seenIds.has(objectiveId)) {
      errors.push(`objectives.json objectives must have unique ids. Duplicate id: "${objectiveId}".`);
      continue;
    }
    seenIds.add(objectiveId);
  }
}

function validateDriftEventsConfig(driftEventsConfig, errors) {
  if (!isObject(driftEventsConfig)) {
    errors.push("drift-events.json must be a JSON object.");
    return;
  }

  if (!isObject(driftEventsConfig.events)) {
    errors.push("drift-events.json is missing required object: events.");
    return;
  }

  const requiredEventTypes = ["fogPulse", "ambientMix", "stabilityDelta"];
  for (const eventType of requiredEventTypes) {
    if (!isObject(driftEventsConfig.events[eventType])) {
      errors.push(`drift-events.json events must include object: ${eventType}.`);
    }
  }
}

function validateCrossConfigConsistency(
  themesConfig,
  catalogConfig,
  driftEventsConfig,
  audioLayerIds,
  errors
) {
  const autoThemeConfig = themesConfig?.autoThemeByMonth;
  const autoThemeMap = isObject(autoThemeConfig?.map) ? autoThemeConfig.map : null;
  if (autoThemeMap) {
    for (const [monthKey, mappedTheme] of Object.entries(autoThemeMap)) {
      if (!/^(?:[1-9]|1[0-2])$/.test(monthKey)) {
        errors.push(
          `themes.json autoThemeByMonth.map contains invalid month key "${monthKey}".`
        );
      }
      if (typeof mappedTheme !== "string" || !mappedTheme.trim()) {
        errors.push("themes.json autoThemeByMonth.map must only contain theme id strings.");
        continue;
      }
      const normalizedMappedTheme = mappedTheme.trim();
      if (!themesConfig.themes?.[normalizedMappedTheme]) {
        errors.push(
          `themes.json autoThemeByMonth maps to unknown theme "${normalizedMappedTheme}".`
        );
      }
    }
  }
  if (autoThemeConfig?.enabled === true) {
    if (!autoThemeMap) {
      errors.push("themes.json autoThemeByMonth.enabled=true requires an object map.");
    } else {
      for (let month = 1; month <= 12; month += 1) {
        const monthKey = String(month);
        const mappedTheme = autoThemeMap[monthKey];
        if (typeof mappedTheme !== "string" || !mappedTheme.trim()) {
          errors.push(
            `themes.json autoThemeByMonth.enabled=true requires month "${monthKey}" to map to a theme id.`
          );
        }
      }
    }
  }

  if (isObject(catalogConfig?.themeContent) && isObject(themesConfig?.themes)) {
    for (const themeId of Object.keys(catalogConfig.themeContent)) {
      if (themeId === "default") {
        continue;
      }
      if (!themesConfig.themes[themeId]) {
        errors.push(
          `catalog.json themeContent references unknown theme "${themeId}".`
        );
      }
    }
  }

  if (isObject(themesConfig?.themes) && audioLayerIds.size) {
    for (const [themeId, themeConfig] of Object.entries(themesConfig.themes)) {
      if (!isObject(themeConfig?.ambientAudioMix)) {
        continue;
      }
      for (const layerId of Object.keys(themeConfig.ambientAudioMix)) {
        if (!audioLayerIds.has(layerId)) {
          errors.push(
            `themes.json theme "${themeId}" ambientAudioMix references unknown audio layer "${layerId}".`
          );
        }
      }
    }
  }

  if (Array.isArray(driftEventsConfig?.events?.ambientMix?.layers) && audioLayerIds.size) {
    for (const layerId of driftEventsConfig.events.ambientMix.layers) {
      if (typeof layerId !== "string" || !layerId.trim()) {
        errors.push("drift-events.json events.ambientMix.layers must contain non-empty strings.");
        continue;
      }
      if (!audioLayerIds.has(layerId)) {
        errors.push(
          `drift-events.json ambientMix layer "${layerId}" is not defined in audio.json ambientLayers.`
        );
      }
    }
  }
}

async function main() {
  const errors = [];
  const loaded = {};

  for (const fileName of REQUIRED_FILES) {
    loaded[fileName] = await readJson(fileName, errors);
  }

  const runtimeFiles = await listRuntimeConfigFiles("defaults");
  const feedFiles = runtimeFiles.filter((fileName) => /-feed\.json$/i.test(fileName));
  for (const fileName of feedFiles) {
    if (Object.prototype.hasOwnProperty.call(loaded, fileName)) {
      continue;
    }
    loaded[fileName] = await readJson(fileName, errors);
  }

  const sceneConfig = loaded["scene.json"];
  const themesConfig = loaded["themes.json"];
  const audioConfig = loaded["audio.json"];
  const catalogConfig = loaded["catalog.json"];
  const objectivesConfig = loaded["objectives.json"];
  const driftEventsConfig = loaded["drift-events.json"];

  validateSceneConfig(sceneConfig, errors);
  validateThemesConfig(themesConfig, errors);
  const audioLayerIds = validateAudioConfig(audioConfig, errors);
  validateCatalogConfig(catalogConfig, errors);
  validateObjectivesConfig(objectivesConfig, errors);
  validateDriftEventsConfig(driftEventsConfig, errors);
  for (const fileName of feedFiles) {
    validateFeedConfig(fileName, loaded[fileName], errors);
  }
  validateCrossConfigConsistency(
    themesConfig,
    catalogConfig,
    driftEventsConfig,
    audioLayerIds,
    errors
  );

  if (errors.length) {
    console.error("Config validation failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Config validation passed for public/config.defaults.");
}

main().catch((error) => {
  console.error(`Config validation failed: ${error.message}`);
  process.exitCode = 1;
});
