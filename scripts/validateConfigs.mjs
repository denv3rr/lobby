import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULTS_DIR = path.join(ROOT_DIR, "public", "config.defaults");
const REQUIRED_FILES = [
  "scene.json",
  "themes.json",
  "audio.json",
  "catalog.json",
  "objectives.json",
  "drift-events.json"
];

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
  }

  if (!isObject(sceneConfig.spawn)) {
    errors.push("scene.json is missing required object: spawn.");
  }

  if (!Array.isArray(sceneConfig.portals)) {
    errors.push("scene.json is missing required array: portals.");
    return;
  }

  const seenPortalIds = new Set();
  for (let index = 0; index < sceneConfig.portals.length; index += 1) {
    const portal = sceneConfig.portals[index];
    const pathPrefix = `scene.json portals[${index}]`;

    if (!isObject(portal)) {
      errors.push(`${pathPrefix} must be an object.`);
      continue;
    }

    const portalId = typeof portal.id === "string" ? portal.id.trim() : "";
    if (!portalId) {
      errors.push(`${pathPrefix} is missing required string: id.`);
    } else if (seenPortalIds.has(portalId)) {
      errors.push(`scene.json portals must have unique ids. Duplicate id: "${portalId}".`);
    } else {
      seenPortalIds.add(portalId);
    }

    if (typeof portal.label !== "string" || !portal.label.trim()) {
      errors.push(`${pathPrefix} is missing required string: label.`);
    }

    if (typeof portal.url !== "string" || !portal.url.trim()) {
      errors.push(`${pathPrefix} is missing required string: url.`);
    }
  }
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
    const requiredRooms = ["shop", "projects"];
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
