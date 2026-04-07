import { resolvePublicPath } from "../utils/path.js";

export const DEV_MODEL_SHOWROOM_API_PATH = "/__dev/model-intake";
export const DEV_MODEL_SHOWROOM_TAG = "dev-model-showroom";
export const DEV_MODEL_SHOWROOM_COLUMNS_MAX = 6;
export const DEV_MODEL_SHOWROOM_CELL_SIZE = 6;
export const DEV_MODEL_SHOWROOM_ISOLATED_ROOM_SIZE = [96, 16, 96];

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

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeRoomBounds(bounds) {
  if (!bounds || typeof bounds !== "object") {
    return null;
  }

  const minX = toFiniteNumber(bounds.minX, null);
  const maxX = toFiniteNumber(bounds.maxX, null);
  const minZ = toFiniteNumber(bounds.minZ, null);
  const maxZ = toFiniteNumber(bounds.maxZ, null);
  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(minZ) ||
    !Number.isFinite(maxZ)
  ) {
    return null;
  }

  return { minX, maxX, minZ, maxZ };
}

function buildShowroomOrigin(roomBounds, width, depth, offset = 30) {
  const normalizedBounds = normalizeRoomBounds(roomBounds);
  if (!normalizedBounds) {
    return {
      x: 62,
      z: 62
    };
  }

  return {
    x: normalizedBounds.maxX + offset + width * 0.5,
    z: normalizedBounds.maxZ + offset + depth * 0.5
  };
}

function buildCenteredShowroomOrigin() {
  return {
    x: 0,
    z: 0
  };
}

function buildShowroomPedestalProp(id, position, scale, material = {}) {
  return {
    id,
    primitive: "box",
    position,
    scale,
    collider: false,
    allowCatalogOverlap: true,
    allowDoorwayBlock: true,
    allowPortalBlock: true,
    material
  };
}

function buildShowroomLightProp(id, position) {
  return {
    id,
    primitive: "cylinder",
    position,
    scale: [0.22, 2.6, 0.22],
    collider: false,
    allowCatalogOverlap: true,
    allowDoorwayBlock: true,
    allowPortalBlock: true,
    material: {
      color: "#7f8f98",
      emissiveColor: "#bfdcff",
      emissiveIntensity: 0.34,
      glowLight: true
    }
  };
}

export async function loadDevModelIntakeManifest(options = {}) {
  const requestUrl = new URL(resolvePublicPath(DEV_MODEL_SHOWROOM_API_PATH), window.location.origin);
  if (options?.forceRefresh === true) {
    requestUrl.searchParams.set("refresh", "1");
  }

  const response = await fetch(requestUrl, {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Model intake request failed: ${response.status}`);
  }

  const payload = await response.json();
  if (!payload?.ok) {
    throw new Error(readText(payload?.error, "Model intake payload was invalid."));
  }
  return payload;
}

export function createIsolatedDevModelLabSceneConfig() {
  const [roomWidth, roomHeight, roomDepth] = DEV_MODEL_SHOWROOM_ISOLATED_ROOM_SIZE;
  const halfWidth = roomWidth * 0.5;
  const halfDepth = roomDepth * 0.5;

  return {
    meta: {
      version: 1,
      mode: "dev-model-lab"
    },
    room: {
      size: [...DEV_MODEL_SHOWROOM_ISOLATED_ROOM_SIZE],
      floorY: 0,
      navigationBounds: {
        minX: -halfWidth + 3,
        maxX: halfWidth - 3,
        minZ: -halfDepth + 3,
        maxZ: halfDepth - 3
      },
      sideDoorways: {
        enabled: false
      },
      frontEntrance: {
        enabled: false
      },
      rearEntrance: {
        enabled: false
      },
      wallMaterial: {
        color: "#161b20",
        roughness: 0.94,
        metalness: 0.04,
        procedural: "concrete",
        textureRepeat: [10, 3]
      },
      floorMaterial: {
        color: "#10151a",
        roughness: 0.96,
        metalness: 0.03,
        procedural: "concrete",
        textureRepeat: [10, 10]
      },
      ceilingMaterial: {
        color: "#1a2026",
        roughness: 0.95,
        metalness: 0.02
      }
    },
    spawn: {
      position: [0, 1.7, 26],
      yaw: 180
    },
    fog: {
      color: "#0b0f12",
      near: 16,
      far: 82
    },
    lights: [
      {
        type: "ambient",
        color: "#d7dee6",
        intensity: 0.42
      },
      {
        type: "point",
        color: "#eef6ff",
        intensity: 1.3,
        position: [0, 9.5, 0],
        distance: 58,
        castShadow: true
      },
      {
        type: "point",
        color: "#b6d6ff",
        intensity: 0.5,
        position: [-20, 7, 16],
        distance: 38,
        castShadow: false
      },
      {
        type: "point",
        color: "#b6d6ff",
        intensity: 0.5,
        position: [20, 7, 16],
        distance: 38,
        castShadow: false
      }
    ],
    portals: [],
    props: [],
    propGroups: [],
    zones: [],
    moduleTriggers: [],
    secretUnlocks: [],
    editorOverrides: {}
  };
}

export function buildDevModelShowroomLayout(manifest, options = {}) {
  const entries = Array.isArray(manifest?.entries)
    ? manifest.entries.filter((entry) => entry?.portable && entry?.defaults?.model)
    : [];

  const roomBounds = normalizeRoomBounds(options.roomBounds);
  const floorY = toFiniteNumber(options.floorY, 0);
  const cellSize = Math.max(4.5, toFiniteNumber(options.cellSize, DEV_MODEL_SHOWROOM_CELL_SIZE));
  const defaultColumnCount = Math.ceil(Math.sqrt(Math.max(entries.length, 1)));
  const columns = Math.max(
    2,
    Math.min(
      DEV_MODEL_SHOWROOM_COLUMNS_MAX,
      toFiniteNumber(options.columns, defaultColumnCount)
    )
  );
  const rows = Math.max(1, Math.ceil(entries.length / columns));
  const width = Math.max(columns * cellSize + 6, 18);
  const depth = Math.max(rows * cellSize + 8, 16);
  const placementMode = readText(options.placementMode, "outside").toLowerCase();
  const origin = placementMode === "center"
    ? buildCenteredShowroomOrigin()
    : buildShowroomOrigin(roomBounds, width, depth, toFiniteNumber(options.offset, 30));
  const startX = origin.x - ((columns - 1) * cellSize) * 0.5;
  const startZ = origin.z - ((rows - 1) * cellSize) * 0.5;
  const props = [];

  props.push(
    buildShowroomPedestalProp(
      "dev_showroom_floor",
      [origin.x, floorY - 0.3, origin.z],
      [width, 0.6, depth],
      {
        color: "#11181d",
        roughness: 0.92,
        metalness: 0.08
      }
    )
  );

  props.push(
    buildShowroomPedestalProp(
      "dev_showroom_dais",
      [origin.x, floorY + 0.05, origin.z],
      [width - 4, 0.16, depth - 4],
      {
        color: "#1d262c",
        roughness: 0.86,
        metalness: 0.14
      }
    )
  );

  const lightOffsetX = width * 0.5 - 1.8;
  const lightOffsetZ = depth * 0.5 - 1.8;
  props.push(buildShowroomLightProp("dev_showroom_light_nw", [origin.x - lightOffsetX, floorY + 1.3, origin.z - lightOffsetZ]));
  props.push(buildShowroomLightProp("dev_showroom_light_ne", [origin.x + lightOffsetX, floorY + 1.3, origin.z - lightOffsetZ]));
  props.push(buildShowroomLightProp("dev_showroom_light_sw", [origin.x - lightOffsetX, floorY + 1.3, origin.z + lightOffsetZ]));
  props.push(buildShowroomLightProp("dev_showroom_light_se", [origin.x + lightOffsetX, floorY + 1.3, origin.z + lightOffsetZ]));

  entries.forEach((entry, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = startX + column * cellSize;
    const z = startZ + row * cellSize;

    props.push(
      buildShowroomPedestalProp(
        `dev_showroom_pad_${entry.id}`,
        [x, floorY + 0.2, z],
        [2.3, 0.22, 2.3],
        {
          color: "#233037",
          roughness: 0.82,
          metalness: 0.12
        }
      )
    );

    const modelDefaults = cloneValue(entry.defaults) || {};
    props.push({
      ...modelDefaults,
      id: `dev_showroom_model_${entry.id}`,
      position: [x, floorY + 0.34, z],
      collider: false,
      allowCatalogOverlap: true,
      allowDoorwayBlock: true,
      allowPortalBlock: true,
      runtimePhase: "",
      initiallyHidden: false,
      deferLoad: false
    });
  });

  return {
    props,
    portableEntries: entries,
    meta: {
      totalCount: Array.isArray(manifest?.entries) ? manifest.entries.length : 0,
      portableCount: entries.length,
      rejectedCount: Math.max(0, (Array.isArray(manifest?.entries) ? manifest.entries.length : 0) - entries.length),
      columns,
      rows,
      cellSize,
      floorSize: [width, depth],
      origin: [origin.x, floorY, origin.z]
    },
    spawnPosition: [origin.x, floorY + 1.7, origin.z + depth * 0.5 + 7],
    spawnYaw: 180
  };
}
