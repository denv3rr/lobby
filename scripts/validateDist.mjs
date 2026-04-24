import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { listRuntimeConfigFiles } from "./configWorkspace.mjs";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");

async function readTextOrThrow(filePath) {
  return readFile(filePath, "utf8");
}

async function ensureJsonFileExists(baseDir, fileName, errors) {
  const filePath = path.join(baseDir, fileName);
  try {
    const raw = await readTextOrThrow(filePath);
    return JSON.parse(raw);
  } catch (error) {
    const relativePath = path.relative(ROOT_DIR, filePath).replace(/\\/g, "/");
    if (error instanceof SyntaxError) {
      errors.push(`Invalid JSON in ${relativePath}: ${error.message}`);
      return null;
    }
    errors.push(`Missing required dist file: ${relativePath}`);
    return null;
  }
}

function validateFeedPayload(fileName, payload, errors) {
  if (!payload || !Array.isArray(payload.items)) {
    errors.push(`Feed ${fileName} must contain an items array.`);
    return;
  }

  if (!payload.items.length) {
    errors.push(`Feed ${fileName} must not be empty in dist output.`);
  }
}

function collectReferencedAssetPaths(value, referencedAssets = new Set()) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\/assets\/.+/.test(trimmed)) {
      referencedAssets.add(trimmed.replace(/^\/+/, ""));
    }
    return referencedAssets;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectReferencedAssetPaths(entry, referencedAssets);
    }
    return referencedAssets;
  }

  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) {
      collectReferencedAssetPaths(entry, referencedAssets);
    }
  }

  return referencedAssets;
}

async function ensureDistAssetExists(relativeAssetPath, errors) {
  const normalizedPath = path.posix.normalize(relativeAssetPath).replace(/^\/+/, "");
  const assetPath = path.join(DIST_DIR, normalizedPath);
  try {
    await access(assetPath);
  } catch {
    errors.push(`Referenced dist asset is missing: ${normalizedPath}`);
  }
}

async function main() {
  const errors = [];
  const referencedAssets = new Set();
  const runtimeFiles = await listRuntimeConfigFiles("defaults");
  const requiredFeeds = runtimeFiles.filter((fileName) => /-feed\.json$/i.test(fileName));
  const htmlPath = path.join(DIST_DIR, "index.html");
  const html = await readTextOrThrow(htmlPath).catch((error) => {
    errors.push(`Missing dist/index.html: ${error.message}`);
    return "";
  });

  const expectedBase = (process.env.VITE_BASE_PATH || "/").replace(/\/?$/, "/");
  if (html && !html.includes(expectedBase)) {
    errors.push(`dist/index.html does not reference expected base path "${expectedBase}".`);
  }

  const defaultsDir = path.join(DIST_DIR, "config.defaults");
  const compatDir = path.join(DIST_DIR, "config");

  for (const fileName of runtimeFiles) {
    const defaultsPayload = await ensureJsonFileExists(defaultsDir, fileName, errors);
    const compatPayload = await ensureJsonFileExists(compatDir, fileName, errors);
    collectReferencedAssetPaths(defaultsPayload, referencedAssets);
    collectReferencedAssetPaths(compatPayload, referencedAssets);

    if (requiredFeeds.includes(fileName)) {
      validateFeedPayload(fileName, defaultsPayload, errors);
      validateFeedPayload(fileName, compatPayload, errors);
    }
  }

  for (const assetPath of referencedAssets) {
    await ensureDistAssetExists(assetPath, errors);
  }

  if (errors.length) {
    console.error("Dist validation failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Dist validation passed.");
}

main().catch((error) => {
  console.error(`Dist validation failed: ${error.message}`);
  process.exitCode = 1;
});
