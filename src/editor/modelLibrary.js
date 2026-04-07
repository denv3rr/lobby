import { normalizeRuntimePhase } from "../utils/runtimePhases.js";

export const MODEL_LIBRARY_MANIFEST_PATH = "/assets/models/props/library.json";

export const DEFAULT_MODEL_LIBRARY_REQUIREMENTS = {
  extensions: [".glb"],
  embeddedOnly: true,
  maxFileBytes: 1_250_000,
  maxTriangles: 12_000,
  maxMaterials: 8,
  maxTextures: 8
};

export const MOTION_PRESETS = [
  {
    id: "",
    label: "None",
    config: null
  },
  {
    id: "spin-y-slow",
    label: "Slow Spin",
    config: {
      animation: {
        type: "spin-y",
        speed: 0.42
      }
    }
  },
  {
    id: "spin-y-creep",
    label: "Creeping Spin",
    config: {
      animation: {
        type: "spin-y",
        speed: 0.18
      }
    }
  },
  {
    id: "spin-x",
    label: "Spin X",
    config: {
      animation: {
        type: "spin-x",
        speed: 0.48
      }
    }
  },
  {
    id: "bob",
    label: "Bob",
    config: {
      animation: {
        type: "bob",
        axis: "y",
        speed: 0.72,
        amplitude: 0.08
      }
    }
  },
  {
    id: "pulse",
    label: "Pulse",
    config: {
      animation: {
        type: "pulse",
        speed: 1,
        amplitude: 0.06
      }
    }
  }
];

export const EFFECT_PRESETS = [
  {
    id: "",
    label: "None",
    config: null
  },
  {
    id: "smoke",
    label: "Smoke",
    config: {
      effect: {
        type: "smoke",
        count: 18,
        size: 0.12,
        opacity: 0.16,
        color: "#c9ccc7",
        riseSpeed: 0.18,
        drift: 0.26
      }
    }
  },
  {
    id: "mist",
    label: "Mist",
    config: {
      effect: {
        type: "mist",
        count: 14,
        size: 0.2,
        opacity: 0.11,
        color: "#d7dad8",
        riseSpeed: 0.08,
        drift: 0.14
      }
    }
  },
  {
    id: "embers",
    label: "Embers",
    config: {
      effect: {
        type: "embers",
        count: 16,
        size: 0.07,
        opacity: 0.72,
        color: "#ff9363",
        riseSpeed: 0.46,
        drift: 0.3,
        additive: true
      }
    }
  },
  {
    id: "sparks",
    label: "Sparks",
    config: {
      effect: {
        type: "sparks",
        count: 12,
        size: 0.05,
        opacity: 0.76,
        color: "#ffd59c",
        riseSpeed: 0.62,
        drift: 0.34,
        additive: true
      }
    }
  }
];

function readText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed || fallback;
}

function cloneValue(value) {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((entry) => readText(entry, "")).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function normalizeVector(values, length, fallback) {
  if (!Array.isArray(values) || values.length < length) {
    return fallback.slice(0, length);
  }
  return values.slice(0, length).map((entry, index) => {
    const numeric = Number(entry);
    if (!Number.isFinite(numeric)) {
      return fallback[index];
    }
    return numeric;
  });
}

function normalizeMaterialConfig(material) {
  if (!material || typeof material !== "object" || Array.isArray(material)) {
    return undefined;
  }

  const normalized = cloneValue(material) || {};
  const emissiveIntensity = Number(normalized.emissiveIntensity);
  if (Number.isFinite(emissiveIntensity)) {
    normalized.emissiveIntensity = emissiveIntensity;
  }
  if ("glowLight" in normalized) {
    normalized.glowLight = normalized.glowLight !== false;
  }
  return normalized;
}

function normalizeEffectConfig(effect) {
  if (!effect || typeof effect !== "object" || Array.isArray(effect)) {
    return undefined;
  }

  const normalized = cloneValue(effect) || {};
  normalized.type = readText(normalized.type, "").toLowerCase();
  if (!normalized.type) {
    return undefined;
  }
  return normalized;
}

function normalizeAnimationConfig(animation) {
  if (!animation || typeof animation !== "object" || Array.isArray(animation)) {
    return undefined;
  }

  const normalized = cloneValue(animation) || {};
  normalized.type = readText(normalized.type, "").toLowerCase();
  if (!normalized.type) {
    return undefined;
  }
  return normalized;
}

function normalizeDefaults(defaults, fallbackModelPath) {
  const source = defaults && typeof defaults === "object" && !Array.isArray(defaults)
    ? cloneValue(defaults) || {}
    : {};

  const modelPath = readText(source.model, fallbackModelPath);
  if (!modelPath) {
    return null;
  }

  const normalized = {
    type: "model",
    model: modelPath,
    scale: normalizeVector(source.scale, 3, [1, 1, 1]),
    rotation: normalizeVector(source.rotation, 3, [0, 0, 0]),
    collider: source.collider !== false,
    modelPlacement:
      source.modelPlacement && typeof source.modelPlacement === "object" && !Array.isArray(source.modelPlacement)
        ? cloneValue(source.modelPlacement)
        : undefined,
    modelFallback:
      typeof source.modelFallback === "string" ||
      (source.modelFallback && typeof source.modelFallback === "object" && !Array.isArray(source.modelFallback))
        ? cloneValue(source.modelFallback)
        : "box",
    runtimePhase: normalizeRuntimePhase(source.runtimePhase),
    deferLoad: source.deferLoad === true,
    allowCatalogOverlap: source.allowCatalogOverlap === true,
    allowDoorwayBlock: source.allowDoorwayBlock === true,
    allowPortalBlock: source.allowPortalBlock === true
  };

  const material = normalizeMaterialConfig(source.material);
  if (material) {
    normalized.material = material;
  }

  const animation = normalizeAnimationConfig(source.animation);
  if (animation) {
    normalized.animation = animation;
  }

  const effect = normalizeEffectConfig(source.effect);
  if (effect) {
    normalized.effect = effect;
  }

  if (Array.isArray(source.tags)) {
    normalized.tags = normalizeStringList(source.tags);
  }

  return normalized;
}

export function normalizeModelLibraryManifest(manifest) {
  const requirementsSource =
    manifest?.requirements && typeof manifest.requirements === "object" && !Array.isArray(manifest.requirements)
      ? manifest.requirements
      : {};
  const requirements = {
    ...DEFAULT_MODEL_LIBRARY_REQUIREMENTS,
    ...cloneValue(requirementsSource)
  };
  requirements.extensions = normalizeStringList(requirements.extensions).map((entry) =>
    entry.startsWith(".") ? entry.toLowerCase() : `.${entry.toLowerCase()}`
  );
  requirements.embeddedOnly = requirements.embeddedOnly !== false;
  requirements.maxFileBytes = Math.max(1, Number(requirements.maxFileBytes) || DEFAULT_MODEL_LIBRARY_REQUIREMENTS.maxFileBytes);
  requirements.maxTriangles = Math.max(1, Number(requirements.maxTriangles) || DEFAULT_MODEL_LIBRARY_REQUIREMENTS.maxTriangles);
  requirements.maxMaterials = Math.max(1, Number(requirements.maxMaterials) || DEFAULT_MODEL_LIBRARY_REQUIREMENTS.maxMaterials);
  requirements.maxTextures = Math.max(1, Number(requirements.maxTextures) || DEFAULT_MODEL_LIBRARY_REQUIREMENTS.maxTextures);

  const entries = [];
  const sourceEntries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  for (const entry of sourceEntries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const id = readText(entry.id, "");
    const label = readText(entry.label, "");
    const modelPath = readText(entry.model, readText(entry.defaults?.model, ""));
    const defaults = normalizeDefaults(entry.defaults, modelPath);
    if (!id || !label || !defaults) {
      continue;
    }

    entries.push({
      id,
      label,
      category: readText(entry.category, "Library"),
      description: readText(entry.description, ""),
      tags: normalizeStringList(entry.tags),
      author: readText(entry.author, ""),
      license: readText(entry.license, ""),
      source: readText(entry.source, ""),
      defaults
    });
  }

  return {
    version: Math.max(1, Number(manifest?.version) || 1),
    requirements,
    entries
  };
}

export function buildEditorPresetFromLibraryEntry(entry) {
  const normalized = entry && typeof entry === "object" ? entry : null;
  if (!normalized?.id || !normalized?.label || !normalized?.defaults?.model) {
    return null;
  }

  return {
    id: `library:${normalized.id}`,
    label: normalized.label,
    category: normalized.category || "Library",
    description: normalized.description || "",
    tags: cloneValue(normalized.tags) || [],
    config: cloneValue(normalized.defaults) || {}
  };
}

export function getMotionPresetConfig(presetId) {
  const preset = MOTION_PRESETS.find((entry) => entry.id === readText(presetId, ""));
  return preset ? cloneValue(preset.config) : null;
}

export function getEffectPresetConfig(presetId) {
  const preset = EFFECT_PRESETS.find((entry) => entry.id === readText(presetId, ""));
  return preset ? cloneValue(preset.config) : null;
}

function getFirstAnimation(config) {
  if (Array.isArray(config?.animations) && config.animations.length > 0) {
    return config.animations[0];
  }
  if (config?.animation && typeof config.animation === "object") {
    return config.animation;
  }
  return null;
}

function getFirstEffect(config) {
  if (Array.isArray(config?.effects) && config.effects.length > 0) {
    return config.effects[0];
  }
  if (config?.effect && typeof config.effect === "object") {
    return config.effect;
  }
  return null;
}

export function resolveMotionPresetId(config) {
  const animation = getFirstAnimation(config);
  if (!animation || typeof animation !== "object") {
    return "";
  }

  const type = readText(animation.type, "").toLowerCase();
  const axis = readText(animation.axis, "y").toLowerCase();
  const speed = Number(animation.speed) || 0;
  const amplitude = Number(animation.amplitude) || 0;

  if ((type === "spin-y" || type === "spiny" || type === "spin") && axis === "y") {
    if (speed <= 0.24) {
      return "spin-y-creep";
    }
    return "spin-y-slow";
  }
  if ((type === "spin-x" || type === "spinx") && axis === "x") {
    return "spin-x";
  }
  if (type === "bob" || type === "hover") {
    return "bob";
  }
  if (type === "pulse" && amplitude > 0) {
    return "pulse";
  }
  return "custom";
}

export function resolveEffectPresetId(config) {
  const effect = getFirstEffect(config);
  if (!effect || typeof effect !== "object") {
    return "";
  }

  const type = readText(effect.type, "").toLowerCase();
  if (type === "embers") {
    return "embers";
  }
  if (type === "sparks") {
    return "sparks";
  }
  if (type === "mist" || type === "fog") {
    return "mist";
  }
  if (type === "smoke") {
    return "smoke";
  }
  return "custom";
}
