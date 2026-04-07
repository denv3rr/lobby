import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { DEFAULT_MODEL_LIBRARY_REQUIREMENTS } from "../src/editor/modelLibrary.js";

const TEXT_DECODER = new TextDecoder("utf-8");

export const DEFAULT_EXTERNAL_MODEL_SOURCE_DIR =
  "C:\\Users\\denve\\OneDrive\\Pictures\\3D Models\\02_GLB Models";

function readAccessorCount(accessors, accessorIndex) {
  if (!Number.isInteger(accessorIndex) || accessorIndex < 0) {
    return 0;
  }
  return Number(accessors?.[accessorIndex]?.count) || 0;
}

function readAccessorBounds(accessors, accessorIndex) {
  if (!Number.isInteger(accessorIndex) || accessorIndex < 0) {
    return null;
  }
  const accessor = accessors?.[accessorIndex];
  if (!accessor || !Array.isArray(accessor.min) || !Array.isArray(accessor.max)) {
    return null;
  }

  const min = accessor.min.slice(0, 3).map((value) => Number(value));
  const max = accessor.max.slice(0, 3).map((value) => Number(value));
  if (!min.every(Number.isFinite) || !max.every(Number.isFinite)) {
    return null;
  }

  return { min, max };
}

function updateBounds(bounds, nextBounds) {
  if (!bounds || !nextBounds) {
    return;
  }
  for (let index = 0; index < 3; index += 1) {
    bounds.min[index] = Math.min(bounds.min[index], nextBounds.min[index]);
    bounds.max[index] = Math.max(bounds.max[index], nextBounds.max[index]);
  }
}

function finalizeBounds(bounds) {
  if (!bounds) {
    return null;
  }

  if (
    !bounds.min.every(Number.isFinite) ||
    !bounds.max.every(Number.isFinite)
  ) {
    return null;
  }

  const size = bounds.max.map((value, index) => value - bounds.min[index]);
  const center = bounds.max.map((value, index) => (value + bounds.min[index]) * 0.5);

  return {
    min: bounds.min.map((value) => Number(value.toFixed(6))),
    max: bounds.max.map((value) => Number(value.toFixed(6))),
    size: size.map((value) => Number(value.toFixed(6))),
    center: center.map((value) => Number(value.toFixed(6)))
  };
}

function createEmptyBounds() {
  return {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity]
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function readText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed || fallback;
}

export function normalizeModelRequirements(requirements = {}) {
  const merged = {
    ...DEFAULT_MODEL_LIBRARY_REQUIREMENTS,
    ...(requirements && typeof requirements === "object" && !Array.isArray(requirements)
      ? requirements
      : {})
  };

  merged.extensions = [...new Set(
    (Array.isArray(merged.extensions) ? merged.extensions : [".glb"])
      .map((entry) => readText(entry, "").toLowerCase())
      .filter(Boolean)
      .map((entry) => (entry.startsWith(".") ? entry : `.${entry}`))
  )];
  merged.embeddedOnly = merged.embeddedOnly !== false;
  merged.maxFileBytes = Math.max(1, Number(merged.maxFileBytes) || DEFAULT_MODEL_LIBRARY_REQUIREMENTS.maxFileBytes);
  merged.maxTriangles = Math.max(1, Number(merged.maxTriangles) || DEFAULT_MODEL_LIBRARY_REQUIREMENTS.maxTriangles);
  merged.maxMaterials = Math.max(1, Number(merged.maxMaterials) || DEFAULT_MODEL_LIBRARY_REQUIREMENTS.maxMaterials);
  merged.maxTextures = Math.max(1, Number(merged.maxTextures) || DEFAULT_MODEL_LIBRARY_REQUIREMENTS.maxTextures);

  return merged;
}

export function normalizeRelativeModelPath(value) {
  const normalized = readText(value, "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) {
    return "";
  }

  const segments = normalized.split("/").filter(Boolean);
  if (!segments.length) {
    return "";
  }

  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      return "";
    }
  }

  return segments.join("/");
}

export function buildDevModelServedPath(relativePath) {
  const normalized = normalizeRelativeModelPath(relativePath);
  if (!normalized) {
    return "";
  }
  const params = new URLSearchParams();
  params.set("path", normalized);
  return `/__dev/model-intake/file?${params.toString()}`;
}

export function resolveExternalModelAbsolutePath(sourceDir, relativePath) {
  const normalizedSourceDir = readText(sourceDir, "");
  const normalizedRelativePath = normalizeRelativeModelPath(relativePath);
  if (!normalizedSourceDir || !normalizedRelativePath) {
    return null;
  }

  const sourceRoot = path.resolve(normalizedSourceDir);
  const absolutePath = path.resolve(sourceRoot, ...normalizedRelativePath.split("/"));
  const relativeFromRoot = path.relative(sourceRoot, absolutePath);
  if (
    !relativeFromRoot ||
    relativeFromRoot.startsWith("..") ||
    path.isAbsolute(relativeFromRoot)
  ) {
    return null;
  }

  return absolutePath;
}

export function slugifyModelId(value, fallback = "model") {
  const base = readText(value, fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || fallback;
}

export function formatModelLabel(value) {
  const normalized = readText(value, "Model")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "Model";
  }

  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function analyzeExternalUris(entries = []) {
  let externalUriCount = 0;
  let dataUriCount = 0;
  for (const entry of entries) {
    const uri = readText(entry?.uri, "");
    if (!uri) {
      continue;
    }
    if (uri.startsWith("data:")) {
      dataUriCount += 1;
      continue;
    }
    externalUriCount += 1;
  }
  return {
    externalUriCount,
    dataUriCount
  };
}

export function estimateTriangleCount(gltfJson) {
  const meshes = Array.isArray(gltfJson?.meshes) ? gltfJson.meshes : [];
  const accessors = Array.isArray(gltfJson?.accessors) ? gltfJson.accessors : [];
  let triangleCount = 0;

  for (const mesh of meshes) {
    for (const primitive of Array.isArray(mesh?.primitives) ? mesh.primitives : []) {
      const mode = Number(primitive?.mode ?? 4);
      const indexCount = readAccessorCount(accessors, primitive?.indices);
      const positionCount = readAccessorCount(accessors, primitive?.attributes?.POSITION);
      if (mode === 4) {
        triangleCount += indexCount > 0 ? Math.floor(indexCount / 3) : Math.floor(positionCount / 3);
        continue;
      }
      if (mode === 5 || mode === 6) {
        triangleCount += Math.max(0, indexCount > 0 ? indexCount - 2 : positionCount - 2);
      }
    }
  }

  return triangleCount;
}

export function estimateModelBounds(gltfJson) {
  const meshes = Array.isArray(gltfJson?.meshes) ? gltfJson.meshes : [];
  const accessors = Array.isArray(gltfJson?.accessors) ? gltfJson.accessors : [];
  const bounds = createEmptyBounds();
  let boundSources = 0;

  for (const mesh of meshes) {
    for (const primitive of Array.isArray(mesh?.primitives) ? mesh.primitives : []) {
      const nextBounds = readAccessorBounds(accessors, primitive?.attributes?.POSITION);
      if (!nextBounds) {
        continue;
      }
      updateBounds(bounds, nextBounds);
      boundSources += 1;
    }
  }

  return boundSources > 0 ? finalizeBounds(bounds) : null;
}

export function parseGlbJson(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 20) {
    throw new Error("GLB file is too small to contain a valid header.");
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const totalLength = view.getUint32(8, true);
  if (magic !== 0x46546c67) {
    throw new Error("File header is not a GLB payload.");
  }
  if (version < 2) {
    throw new Error(`Unsupported GLB version ${version}.`);
  }
  if (totalLength !== buffer.length) {
    throw new Error("GLB header length does not match file length.");
  }

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    offset += 8;
    if (offset + chunkLength > buffer.length) {
      throw new Error("GLB chunk length exceeds file size.");
    }
    if (chunkType === 0x4e4f534a) {
      return JSON.parse(TEXT_DECODER.decode(buffer.subarray(offset, offset + chunkLength)));
    }
    offset += chunkLength;
  }

  throw new Error("GLB is missing a JSON chunk.");
}

export async function analyzeModelFile(absolutePath) {
  const fileStat = await stat(absolutePath);
  const raw = await readFile(absolutePath);
  const gltfJson = parseGlbJson(raw);
  const bufferUris = analyzeExternalUris(Array.isArray(gltfJson?.buffers) ? gltfJson.buffers : []);
  const imageUris = analyzeExternalUris(Array.isArray(gltfJson?.images) ? gltfJson.images : []);

  return {
    fileBytes: fileStat.size,
    triangleCount: estimateTriangleCount(gltfJson),
    meshCount: Array.isArray(gltfJson?.meshes) ? gltfJson.meshes.length : 0,
    materialCount: Array.isArray(gltfJson?.materials) ? gltfJson.materials.length : 0,
    textureCount: Array.isArray(gltfJson?.textures) ? gltfJson.textures.length : 0,
    animationCount: Array.isArray(gltfJson?.animations) ? gltfJson.animations.length : 0,
    extensionsUsed: Array.isArray(gltfJson?.extensionsUsed) ? gltfJson.extensionsUsed : [],
    extensionsRequired: Array.isArray(gltfJson?.extensionsRequired) ? gltfJson.extensionsRequired : [],
    externalUriCount: bufferUris.externalUriCount + imageUris.externalUriCount,
    embeddedUriCount: bufferUris.dataUriCount + imageUris.dataUriCount,
    bounds: estimateModelBounds(gltfJson)
  };
}

export function evaluateModelPortability(modelPath, analysis, requirementsInput = {}) {
  const requirements = normalizeModelRequirements(requirementsInput);
  const normalizedModelPath = readText(modelPath, "").toLowerCase();
  const failures = [];

  if (!requirements.extensions.includes(path.extname(normalizedModelPath))) {
    failures.push(
      `extension ${path.extname(normalizedModelPath) || "(none)"} is not supported`
    );
  }
  if ((analysis?.fileBytes || 0) > requirements.maxFileBytes) {
    failures.push(`file size ${analysis.fileBytes} exceeds ${requirements.maxFileBytes}`);
  }
  if ((analysis?.triangleCount || 0) > requirements.maxTriangles) {
    failures.push(`triangle count ${analysis.triangleCount} exceeds ${requirements.maxTriangles}`);
  }
  if ((analysis?.materialCount || 0) > requirements.maxMaterials) {
    failures.push(`material count ${analysis.materialCount} exceeds ${requirements.maxMaterials}`);
  }
  if ((analysis?.textureCount || 0) > requirements.maxTextures) {
    failures.push(`texture count ${analysis.textureCount} exceeds ${requirements.maxTextures}`);
  }
  if (requirements.embeddedOnly && (analysis?.externalUriCount || 0) > 0) {
    failures.push(`contains ${analysis.externalUriCount} external URI references`);
  }

  return {
    portable: failures.length === 0,
    failures,
    requirements
  };
}

export function buildSuggestedFitScale(bounds, targetSize = 2.8) {
  const size = Array.isArray(bounds?.size) ? bounds.size : [];
  const maxDimension = size.reduce((largest, value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(largest, Math.abs(numeric)) : largest;
  }, 0);

  if (maxDimension <= 0) {
    return 1;
  }

  return Number(clamp(targetSize / maxDimension, 0.05, 6).toFixed(4));
}

function buildModelEntryDescription(analysis, portable) {
  if (!analysis) {
    return portable ? "Portable GLB intake asset." : "GLB intake asset could not be analyzed.";
  }

  const kb = Math.round(analysis.fileBytes / 1000);
  const parts = [
    `${kb} KB`,
    `${analysis.triangleCount} tris`,
    `${analysis.materialCount} mats`,
    `${analysis.textureCount} tex`
  ];
  if (analysis.animationCount > 0) {
    parts.push(`${analysis.animationCount} anim`);
  }
  return `${portable ? "Portable" : "Rejected"} intake asset | ${parts.join(" | ")}`;
}

function buildModelEntryTags(analysis, portable) {
  const tags = [portable ? "portable" : "rejected", "external-intake", "glb"];
  if ((analysis?.animationCount || 0) > 0) {
    tags.push("animated");
  } else {
    tags.push("static");
  }
  if ((analysis?.externalUriCount || 0) > 0) {
    tags.push("external-refs");
  } else {
    tags.push("embedded");
  }
  return tags;
}

function buildModelDefaults(relativePath, analysis) {
  const servedPath = buildDevModelServedPath(relativePath);
  const fitScale = buildSuggestedFitScale(analysis?.bounds);
  return {
    type: "model",
    model: servedPath,
    scale: [fitScale, fitScale, fitScale],
    modelPlacement: {
      centerAxes: ["x", "z"],
      alignY: "base"
    },
    modelFallback: "box",
    collider: false,
    allowCatalogOverlap: true,
    allowDoorwayBlock: true,
    allowPortalBlock: true
  };
}

async function walkForGlbFiles(sourceDir, currentDir, output) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await walkForGlbFiles(sourceDir, absolutePath, output);
      continue;
    }
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".glb") {
      continue;
    }
    const relativePath = normalizeRelativeModelPath(path.relative(sourceDir, absolutePath));
    if (!relativePath) {
      continue;
    }
    output.push({
      absolutePath,
      relativePath,
      fileName: entry.name
    });
  }
}

export async function listExternalGlbFiles(sourceDir = DEFAULT_EXTERNAL_MODEL_SOURCE_DIR) {
  const normalizedSourceDir = path.resolve(readText(sourceDir, DEFAULT_EXTERNAL_MODEL_SOURCE_DIR));
  const files = [];
  await walkForGlbFiles(normalizedSourceDir, normalizedSourceDir, files);
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return files;
}

export async function buildExternalModelIntakeManifest({
  sourceDir = DEFAULT_EXTERNAL_MODEL_SOURCE_DIR,
  requirements = DEFAULT_MODEL_LIBRARY_REQUIREMENTS
} = {}) {
  const normalizedSourceDir = path.resolve(readText(sourceDir, DEFAULT_EXTERNAL_MODEL_SOURCE_DIR));
  const normalizedRequirements = normalizeModelRequirements(requirements);
  const files = await listExternalGlbFiles(normalizedSourceDir);
  const usedIds = new Set();
  const entries = [];

  for (const file of files) {
    let analysis = null;
    let portability = {
      portable: false,
      failures: ["Model analysis did not run."]
    };
    let errorMessage = "";

    try {
      analysis = await analyzeModelFile(file.absolutePath);
      portability = evaluateModelPortability(file.relativePath, analysis, normalizedRequirements);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Unknown model analysis error.";
      portability = {
        portable: false,
        failures: [errorMessage]
      };
    }

    const baseName = path.basename(file.relativePath, path.extname(file.relativePath));
    let nextId = slugifyModelId(baseName, "external_model");
    let suffix = 2;
    while (usedIds.has(nextId)) {
      nextId = `${slugifyModelId(baseName, "external_model")}_${suffix}`;
      suffix += 1;
    }
    usedIds.add(nextId);

    entries.push({
      id: nextId,
      label: formatModelLabel(baseName),
      category: portability.portable ? "External Intake" : "Rejected Intake",
      description: buildModelEntryDescription(analysis, portability.portable),
      tags: buildModelEntryTags(analysis, portability.portable),
      sourceFileName: file.fileName,
      relativePath: file.relativePath,
      portable: portability.portable,
      failures: portability.failures,
      analysisError: errorMessage,
      defaults: buildModelDefaults(file.relativePath, analysis),
      metrics: analysis
        ? {
            fileBytes: analysis.fileBytes,
            triangleCount: analysis.triangleCount,
            meshCount: analysis.meshCount,
            materialCount: analysis.materialCount,
            textureCount: analysis.textureCount,
            animationCount: analysis.animationCount,
            externalUriCount: analysis.externalUriCount,
            embeddedUriCount: analysis.embeddedUriCount,
            bounds: analysis.bounds,
            extensionsUsed: analysis.extensionsUsed,
            extensionsRequired: analysis.extensionsRequired
          }
        : null
    });
  }

  const portableCount = entries.filter((entry) => entry.portable).length;
  const animatedCount = entries.filter((entry) => (entry.metrics?.animationCount || 0) > 0).length;

  return {
    version: 1,
    sourceDir: normalizedSourceDir,
    requirements: normalizedRequirements,
    summary: {
      totalCount: entries.length,
      portableCount,
      rejectedCount: Math.max(0, entries.length - portableCount),
      animatedCount
    },
    entries
  };
}
