import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { normalizeModelLibraryManifest } from "../src/editor/modelLibrary.js";
import {
  analyzeModelFile,
  evaluateModelPortability
} from "./modelAssetAnalysis.mjs";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SOURCE_CONFIG_FILES = [
  { path: "public/config/scene.json", required: false },
  { path: "public/config/themes.json", required: false },
  { path: "public/config.defaults/scene.json", required: true },
  { path: "public/config.defaults/themes.json", required: true }
];

const MODEL_LIBRARY_MANIFEST_FILE = "public/assets/models/props/library.json";
const VALID_PRIMITIVES = new Set(["box", "sphere", "cylinder", "plane", "torus"]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readJsonConfig(relativePath, required, errors) {
  const fullPath = path.join(ROOT_DIR, relativePath);
  try {
    const raw = await readFile(fullPath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === "ENOENT" && !required) {
      return null;
    }

    if (error?.code === "ENOENT") {
      errors.push(`Missing required config file: ${relativePath}`);
      return null;
    }

    if (error instanceof SyntaxError) {
      errors.push(`Invalid JSON in ${relativePath}: ${error.message}`);
      return null;
    }

    errors.push(`Unable to read ${relativePath}: ${error.message}`);
    return null;
  }
}

function asModelReference(prop, context) {
  if (!isObject(prop) || prop.type !== "model") {
    return null;
  }

  const modelPath = typeof prop.model === "string" ? prop.model.trim() : "";
  if (!modelPath) {
    return {
      ...context,
      propId: prop.id || "(unnamed)",
      modelPath: "",
      hasFallback: Boolean(prop.modelFallback),
      fallbackPrimitive:
        typeof prop.modelFallback === "string"
          ? prop.modelFallback
          : prop.modelFallback?.primitive || null
    };
  }

  const fallback = prop.modelFallback;
  const fallbackPrimitive =
    typeof fallback === "string" ? fallback : fallback?.primitive || null;

  return {
    ...context,
    propId: prop.id || "(unnamed)",
    modelPath,
    hasFallback: fallback !== false && Boolean(fallback),
    fallbackPrimitive
  };
}

function collectScenePropRefs(props, filePath, scope, refs) {
  for (const prop of Array.isArray(props) ? props : []) {
    const ref = asModelReference(prop, {
      file: filePath,
      scope,
      themeId: null
    });
    if (ref) {
      refs.push(ref);
    }
  }
}

function collectModelReferences(filePath, config) {
  const refs = [];

  if (!isObject(config)) {
    return refs;
  }

  collectScenePropRefs(config.props, filePath, "scene.props", refs);
  if (Array.isArray(config.propGroups)) {
    config.propGroups.forEach((group, index) => {
      collectScenePropRefs(group?.props, filePath, `scene.propGroups[${index}].props`, refs);
    });
  }

  if (isObject(config.themes)) {
    for (const [themeId, themeConfig] of Object.entries(config.themes)) {
      if (!Array.isArray(themeConfig?.additionalProps)) {
        continue;
      }
      for (const prop of themeConfig.additionalProps) {
        const ref = asModelReference(prop, {
          file: filePath,
          scope: "themes.additionalProps",
          themeId
        });
        if (ref) {
          refs.push(ref);
        }
      }
    }
  }

  return refs;
}

function resolveModelPath(modelPath) {
  if (!modelPath) {
    return null;
  }

  const normalized = modelPath.replace(/\\/g, "/");
  const relativeFromPublic = normalized.startsWith("/")
    ? normalized.slice(1)
    : normalized;
  return path.join(ROOT_DIR, "public", relativeFromPublic.replace(/^public\//, ""));
}

async function pathExists(targetPath) {
  if (!targetPath) {
    return false;
  }
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function analyzeModelAsset(modelPath) {
  const resolvedPath = resolveModelPath(modelPath);
  const analysis = await analyzeModelFile(resolvedPath);
  return {
    resolvedPath,
    ...analysis
  };
}

function validateManifestEntries(manifest, errors, warnings) {
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  const seenIds = new Set();
  const seenModels = new Set();
  const requirementFailures = [];
  const analyses = [];

  return Promise.all(
    entries.map(async (entry) => {
      const entryLabel = `${entry.id} (${entry.label})`;
      if (seenIds.has(entry.id)) {
        errors.push(`Duplicate model library entry id: ${entry.id}`);
        return;
      }
      seenIds.add(entry.id);

      const modelPath = entry.defaults?.model;
      if (!modelPath) {
        errors.push(`Model library entry ${entryLabel} is missing defaults.model.`);
        return;
      }
      if (seenModels.has(modelPath)) {
        warnings.push(`Model library contains multiple entries for ${modelPath}.`);
      } else {
        seenModels.add(modelPath);
      }
      if (!manifest.requirements.extensions.includes(path.extname(modelPath).toLowerCase())) {
        errors.push(`Model library entry ${entryLabel} must use one of: ${manifest.requirements.extensions.join(", ")}.`);
        return;
      }
      const exists = await pathExists(resolveModelPath(modelPath));
      if (!exists) {
        errors.push(`Model library entry ${entryLabel} points to a missing model: ${modelPath}`);
        return;
      }
      const fallback = entry.defaults?.modelFallback;
      const fallbackPrimitive =
        typeof fallback === "string" ? fallback : fallback?.primitive || null;
      if (!fallbackPrimitive || !VALID_PRIMITIVES.has(fallbackPrimitive)) {
        errors.push(
          `Model library entry ${entryLabel} must define a supported modelFallback primitive. Supported: ${Array.from(VALID_PRIMITIVES).join(", ")}.`
        );
        return;
      }

      const analysis = await analyzeModelAsset(modelPath);
      analyses.push({
        id: entry.id,
        label: entry.label,
        modelPath,
        ...analysis
      });

      const failures = evaluateModelPortability(
        modelPath,
        analysis,
        manifest.requirements
      ).failures;
      if (failures.length) {
        requirementFailures.push(
          `Model library entry ${entryLabel} failed portability checks: ${failures.join("; ")}.`
        );
      }
    })
  ).then(() => {
    errors.push(...requirementFailures);
    return analyses.sort((a, b) => a.id.localeCompare(b.id));
  });
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const strict = args.has("--strict");
  const failOnAnyMissing = args.has("--fail-on-missing");

  const errors = [];
  const warnings = [];
  const refs = [];

  for (const source of SOURCE_CONFIG_FILES) {
    const config = await readJsonConfig(source.path, source.required, errors);
    if (!config) {
      continue;
    }
    refs.push(...collectModelReferences(source.path, config));
  }

  const manifestRaw = await readJsonConfig(MODEL_LIBRARY_MANIFEST_FILE, true, errors);
  const manifest = manifestRaw ? normalizeModelLibraryManifest(manifestRaw) : null;

  const dedupedRefs = [];
  const seenRefKeys = new Set();
  for (const ref of refs) {
    const key = `${ref.scope}|${ref.themeId || "scene"}|${ref.propId}|${ref.modelPath}`;
    if (seenRefKeys.has(key)) {
      continue;
    }
    seenRefKeys.add(key);
    dedupedRefs.push(ref);
  }

  let missingCount = 0;
  let missingWithoutFallbackCount = 0;
  let fallbackPrimitiveIssues = 0;

  for (const ref of dedupedRefs) {
    if (!ref.modelPath) {
      warnings.push(
        `Model prop "${ref.propId}" in ${ref.file} (${ref.scope}) has no model path.`
      );
      missingCount += 1;
      if (!ref.hasFallback) {
        missingWithoutFallbackCount += 1;
      }
      continue;
    }

    const resolvedPath = resolveModelPath(ref.modelPath);
    const exists = await pathExists(resolvedPath);
    if (!exists) {
      missingCount += 1;
      if (!ref.hasFallback) {
        missingWithoutFallbackCount += 1;
      }
      warnings.push(
        `Missing model "${ref.modelPath}" for prop "${ref.propId}" in ${ref.file}` +
          `${ref.themeId ? ` (theme: ${ref.themeId})` : ""}.` +
          `${ref.hasFallback ? " modelFallback is set." : " No modelFallback is set."}`
      );
    }

    if (
      ref.hasFallback &&
      ref.fallbackPrimitive &&
      !VALID_PRIMITIVES.has(ref.fallbackPrimitive)
    ) {
      fallbackPrimitiveIssues += 1;
      warnings.push(
        `Prop "${ref.propId}" in ${ref.file} uses unsupported modelFallback primitive ` +
          `"${ref.fallbackPrimitive}". Supported: ${Array.from(VALID_PRIMITIVES).join(", ")}.`
      );
    }
  }

  let manifestAnalyses = [];
  if (manifest) {
    manifestAnalyses = await validateManifestEntries(manifest, errors, warnings);
  }

  if (errors.length) {
    console.error("Model asset validation failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Model asset references scanned: ${refs.length} ` +
      `| unique: ${dedupedRefs.length} ` +
      `| missing: ${missingCount} ` +
      `| missing without fallback: ${missingWithoutFallbackCount}`
  );

  if (manifest) {
    const maxBytes = Math.round(Number(manifest.requirements.maxFileBytes) / 1000);
    console.log(
      `Model library manifest entries: ${manifest.entries.length} ` +
        `| portability budget: <= ${maxBytes} KB, ` +
        `<= ${manifest.requirements.maxTriangles} tris, ` +
        `<= ${manifest.requirements.maxMaterials} materials`
    );
    for (const analysis of manifestAnalyses) {
      console.log(
        `- ${analysis.id}: ${Math.round(analysis.fileBytes / 1000)} KB | ` +
          `${analysis.triangleCount} tris | ` +
          `${analysis.materialCount} mats | ` +
          `${analysis.textureCount} tex | ` +
          `${analysis.animationCount} anim`
      );
    }
  }

  if (warnings.length) {
    console.warn("Model asset validation warnings:");
    for (const warning of warnings) {
      console.warn(`- ${warning}`);
    }
  }

  if (fallbackPrimitiveIssues > 0) {
    process.exitCode = 1;
    return;
  }

  if (failOnAnyMissing && missingCount > 0) {
    process.exitCode = 1;
    return;
  }

  if (strict && missingWithoutFallbackCount > 0) {
    process.exitCode = 1;
    return;
  }

  console.log(
    strict
      ? "Model asset validation passed strict mode."
      : "Model asset validation passed warn mode."
  );
}

main().catch((error) => {
  console.error(`Model asset validation crashed: ${error.message}`);
  process.exitCode = 1;
});
