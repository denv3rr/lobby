import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SOURCE_CONFIG_FILES = [
  { path: "public/config/scene.json", required: false },
  { path: "public/config/themes.json", required: false },
  { path: "public/config.defaults/scene.json", required: true },
  { path: "public/config.defaults/themes.json", required: true }
];

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
      fallbackPrimitive: typeof prop.modelFallback === "string"
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

function collectModelReferences(filePath, config) {
  const refs = [];

  if (!isObject(config)) {
    return refs;
  }

  if (Array.isArray(config.props)) {
    for (const prop of config.props) {
      const ref = asModelReference(prop, {
        file: filePath,
        scope: "scene.props",
        themeId: null
      });
      if (ref) {
        refs.push(ref);
      }
    }
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
