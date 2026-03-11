import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { selectPreferredFeedRuntimeSource } from "../src/utils/runtimeConfigFeeds.js";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PUBLIC_CONFIG_DIR = path.join(ROOT_DIR, "public", "config");
export const PUBLIC_DEFAULTS_DIR = path.join(ROOT_DIR, "public", "config.defaults");

export const CORE_RUNTIME_CONFIG_FILES = [
  "scene.json",
  "themes.json",
  "audio.json",
  "catalog.json",
  "objectives.json",
  "drift-events.json"
];

export const DEFAULT_FEED_CONFIG_FILES = [
  "atelier-feed.json",
  "shop-feed.json",
  "projects-feed.json",
  "videos-feed.json",
  "videos-long-feed.json"
];

export const RUNTIME_CONFIG_FILES = [
  ...CORE_RUNTIME_CONFIG_FILES,
  ...DEFAULT_FEED_CONFIG_FILES
];

function normalizeFileName(fileName) {
  return typeof fileName === "string" ? path.posix.basename(fileName.trim()) : "";
}

function isFeedConfigFile(fileName) {
  return /^[a-z0-9_-]+-feed\.json$/i.test(normalizeFileName(fileName));
}

function appendUniqueRuntimeFile(fileNames, seen, fileName) {
  const normalizedFileName = normalizeFileName(fileName);
  if (!isRuntimeConfigFile(normalizedFileName) || seen.has(normalizedFileName)) {
    return;
  }

  fileNames.push(normalizedFileName);
  seen.add(normalizedFileName);
}

function resolveRoomFeedFile(roomId, roomConfig = {}) {
  const explicitFileName = normalizeFileName(roomConfig?.feedFile);
  if (isFeedConfigFile(explicitFileName)) {
    return explicitFileName;
  }

  const fallbackSource =
    typeof roomConfig?.feedSource === "string" && roomConfig.feedSource.trim()
      ? roomConfig.feedSource.trim()
      : roomId;
  const fallbackFileName = normalizeFileName(`${fallbackSource}-feed.json`);
  return isFeedConfigFile(fallbackFileName) ? fallbackFileName : "";
}

function collectCatalogFeedFiles(catalogConfig) {
  const feedFiles = [];
  const seen = new Set();
  const appendFeedFile = (fileName) => {
    const normalizedFileName = normalizeFileName(fileName);
    if (!isFeedConfigFile(normalizedFileName) || seen.has(normalizedFileName)) {
      return;
    }
    feedFiles.push(normalizedFileName);
    seen.add(normalizedFileName);
  };

  for (const [roomId, roomConfig] of Object.entries(catalogConfig?.rooms || {})) {
    const feedFileName = resolveRoomFeedFile(roomId, roomConfig);
    appendFeedFile(feedFileName);
    if (roomConfig?.playlistWall) {
      appendFeedFile(
        normalizeFileName(roomConfig.playlistWall.feedFile) ||
          normalizeFileName(`${roomConfig.playlistWall.feedSource || ""}-feed.json`)
      );
    }
  }

  return feedFiles;
}

function normalizeTarget(target = "local") {
  return target === "defaults" ? "defaults" : "local";
}

function parseJsonIfPossible(text = "") {
  if (typeof text !== "string" || !text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function isRuntimeConfigFile(fileName) {
  const normalizedFileName = normalizeFileName(fileName);
  return RUNTIME_CONFIG_FILES.includes(normalizedFileName) || isFeedConfigFile(normalizedFileName);
}

export function resolveConfigPath(fileName, target = "local") {
  const normalizedFileName = normalizeFileName(fileName);
  if (!isRuntimeConfigFile(normalizedFileName)) {
    throw new Error(`Unsupported runtime config file "${fileName}".`);
  }

  const normalizedTarget = normalizeTarget(target);
  const baseDir =
    normalizedTarget === "defaults" ? PUBLIC_DEFAULTS_DIR : PUBLIC_CONFIG_DIR;
  return path.join(baseDir, normalizedFileName);
}

async function readTextIfExists(filePath) {
  try {
    const text = await readFile(filePath, "utf8");
    return {
      exists: true,
      text
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        exists: false,
        text: ""
      };
    }
    throw error;
  }
}

async function listFeedFilesInDirectory(target = "defaults") {
  const baseDir = normalizeTarget(target) === "defaults" ? PUBLIC_DEFAULTS_DIR : PUBLIC_CONFIG_DIR;
  try {
    const entries = await readdir(baseDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && isFeedConfigFile(entry.name))
      .map((entry) => normalizeFileName(entry.name));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function listRuntimeConfigFiles(source = "effective") {
  const fileNames = [];
  const seen = new Set();

  for (const fileName of CORE_RUNTIME_CONFIG_FILES) {
    appendUniqueRuntimeFile(fileNames, seen, fileName);
  }
  for (const fileName of DEFAULT_FEED_CONFIG_FILES) {
    appendUniqueRuntimeFile(fileNames, seen, fileName);
  }

  try {
    const catalogResult = await readRuntimeConfigJson("catalog.json", source);
    for (const fileName of collectCatalogFeedFiles(catalogResult.json)) {
      appendUniqueRuntimeFile(fileNames, seen, fileName);
    }
  } catch {
    // The dedicated config validators handle malformed or missing catalog data.
  }

  const scanTargets =
    source === "effective" ? ["defaults", "local"] : [normalizeTarget(source)];
  for (const target of scanTargets) {
    const feedFiles = await listFeedFilesInDirectory(target);
    for (const fileName of feedFiles) {
      appendUniqueRuntimeFile(fileNames, seen, fileName);
    }
  }

  return fileNames;
}

export async function readRuntimeConfig(fileName, source = "effective") {
  const normalizedFileName = normalizeFileName(fileName);
  if (!isRuntimeConfigFile(normalizedFileName)) {
    throw new Error(`Unsupported runtime config file "${fileName}".`);
  }

  const localPath = resolveConfigPath(normalizedFileName, "local");
  const defaultsPath = resolveConfigPath(normalizedFileName, "defaults");
  const [localResult, defaultsResult] = await Promise.all([
    readTextIfExists(localPath),
    readTextIfExists(defaultsPath)
  ]);

  let resolvedSource = source;
  if (source === "effective") {
    resolvedSource = localResult.exists ? "local" : "defaults";
    if (localResult.exists && defaultsResult.exists) {
      const preferredFeedSource = selectPreferredFeedRuntimeSource(normalizedFileName, {
        localPayload: parseJsonIfPossible(localResult.text),
        defaultsPayload: parseJsonIfPossible(defaultsResult.text)
      });
      if (preferredFeedSource === "defaults" || preferredFeedSource === "local") {
        resolvedSource = preferredFeedSource;
      }
    }
  }

  if (resolvedSource !== "local" && resolvedSource !== "defaults") {
    throw new Error(`Unsupported config source "${source}".`);
  }

  const activeResult = resolvedSource === "local" ? localResult : defaultsResult;
  const activePath = resolvedSource === "local" ? localPath : defaultsPath;

  return {
    fileName: normalizedFileName,
    requestedSource: source,
    source: resolvedSource,
    exists: activeResult.exists,
    text: activeResult.text,
    path: activePath,
    hasLocal: localResult.exists,
    hasDefaults: defaultsResult.exists
  };
}

export async function readRuntimeConfigJson(fileName, source = "effective") {
  const result = await readRuntimeConfig(fileName, source);
  if (!result.exists) {
    return {
      ...result,
      json: null
    };
  }

  return {
    ...result,
    json: JSON.parse(result.text)
  };
}

export async function writeRuntimeConfig(fileName, target, nextValue) {
  const normalizedTarget = normalizeTarget(target);
  const outputPath = resolveConfigPath(fileName, normalizedTarget);
  const parsed =
    typeof nextValue === "string" ? JSON.parse(nextValue) : nextValue;
  const serialized = `${JSON.stringify(parsed, null, 2)}\n`;

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, "utf8");

  return {
    fileName: normalizeFileName(fileName),
    target: normalizedTarget,
    path: outputPath,
    text: serialized,
    json: parsed
  };
}

export async function deleteRuntimeConfig(fileName, target = "local") {
  const normalizedTarget = normalizeTarget(target);
  const outputPath = resolveConfigPath(fileName, normalizedTarget);

  try {
    await rm(outputPath, { force: true });
    return {
      fileName: normalizeFileName(fileName),
      target: normalizedTarget,
      path: outputPath,
      deleted: true
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        fileName: normalizeFileName(fileName),
        target: normalizedTarget,
        path: outputPath,
        deleted: false
      };
    }
    throw error;
  }
}

export async function promoteLocalOverrides(
  fileNames = null,
  options = {}
) {
  const normalizedFiles = [];
  const seen = new Set();

  for (const fileName of Array.isArray(fileNames) ? fileNames : []) {
    const normalizedFileName = normalizeFileName(fileName);
    if (!isRuntimeConfigFile(normalizedFileName) || seen.has(normalizedFileName)) {
      continue;
    }
    normalizedFiles.push(normalizedFileName);
    seen.add(normalizedFileName);
  }

  const defaultFiles = await listRuntimeConfigFiles(options.source || "effective");
  const filesToPromote = normalizedFiles.length ? normalizedFiles : defaultFiles;
  const promoted = [];

  for (const fileName of filesToPromote) {
    const localConfig = await readRuntimeConfig(fileName, "local");
    if (!localConfig.exists) {
      continue;
    }

    await writeRuntimeConfig(fileName, "defaults", localConfig.text);
    if (options.deleteLocal) {
      await deleteRuntimeConfig(fileName, "local");
    }
    promoted.push(fileName);
  }

  return promoted;
}
