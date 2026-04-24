import * as THREE from "three";

const SHOP_LINK = "https://seperet.com/shop";
const PROJECTS_LINK = "https://github.com/denv3rr";
const VIDEOS_LINK = "https://youtube.com/@seperet";
const DEFAULT_ROOM_LINKS = {
  shop: SHOP_LINK,
  projects: PROJECTS_LINK,
  atelier: PROJECTS_LINK,
  videos: VIDEOS_LINK
};

const SCREENING_ROOM_ID = "videos";
const SCREENING_FALLBACK_LABEL = "Select A Video";
const LONGFORM_FEED_SOURCE = "videos-long";
const tempColliderBox = new THREE.Box3();
const tempColliderCenter = new THREE.Vector3();
const tempColliderSize = new THREE.Vector3();

function toColor(value, fallback) {
  try {
    return new THREE.Color(value || fallback);
  } catch {
    return new THREE.Color(fallback);
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeEntrySide(value, fallback = "west") {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return ["north", "south", "east", "west"].includes(normalized) ? normalized : fallback;
}

function oppositeSide(side) {
  switch (normalizeEntrySide(side, "west")) {
    case "north":
      return "south";
    case "south":
      return "north";
    case "east":
      return "west";
    default:
      return "east";
  }
}

function getWallRotationY(side) {
  switch (normalizeEntrySide(side, "west")) {
    case "south":
      return Math.PI;
    case "east":
      return -Math.PI * 0.5;
    case "west":
      return Math.PI * 0.5;
    default:
      return 0;
  }
}

function getSideNormal(side) {
  switch (normalizeEntrySide(side, "west")) {
    case "north":
      return { x: 0, z: -1 };
    case "south":
      return { x: 0, z: 1 };
    case "east":
      return { x: 1, z: 0 };
    default:
      return { x: -1, z: 0 };
  }
}

function getSideTangent(side) {
  switch (normalizeEntrySide(side, "west")) {
    case "north":
    case "south":
      return { x: 1, z: 0 };
    case "east":
    case "west":
      return { x: 0, z: 1 };
    default:
      return { x: 1, z: 0 };
  }
}

function normalizeRoomRotationY(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? THREE.MathUtils.degToRad(numericValue) : 0;
}

function normalizeItems(feed) {
  return Array.isArray(feed?.items) ? feed.items : [];
}

function normalizePresentationWallConfig(config = null) {
  if (!isObject(config) || config.enabled === false) {
    return null;
  }

  const width = Math.max(2.6, Number(config.width) || 3.6);
  const aspectRatio = Math.max(1.2, Number(config.aspectRatio) || 16 / 9);
  const wall = ["back", "outer", "front"].includes(config.wall) ? config.wall : "front";
  const center =
    Number.isFinite(Number(config.centerX)) ? Number(config.centerX) : Number(config.center) || 0;
  return {
    enabled: true,
    wall,
    width,
    height: width / aspectRatio,
    displayY: Number(config.displayY) || 2.62,
    offset: Math.max(0.05, Number(config.offset) || 0.08),
    center,
    label: trimTitle(config.label || "Screening", 22),
    idleLabel: trimTitle(config.idleLabel || SCREENING_FALLBACK_LABEL, 24)
  };
}

function normalizePlaylistWallConfig(config = null) {
  if (!isObject(config) || config.enabled === false) {
    return null;
  }

  const width = Math.max(2.2, Number(config.width) || 3.36);
  const height = Math.max(1.8, Number(config.height) || 3.04);
  const wall = ["back", "outer", "front"].includes(config.wall) ? config.wall : "back";
  const center =
    Number.isFinite(Number(config.centerX)) ? Number(config.centerX) : Number(config.center) || 0;
  return {
    enabled: true,
    wall,
    width,
    height,
    displayY: Number(config.displayY) || 2.3,
    offset: Math.max(0.05, Number(config.offset) || 0.08),
    center,
    label: trimTitle(config.label || "Longform Archive", 24),
    feedSource:
      typeof config.feedSource === "string" && config.feedSource.trim()
        ? config.feedSource.trim()
        : LONGFORM_FEED_SOURCE,
    itemLimit: Math.max(6, Number(config.itemLimit) || 28)
  };
}

function normalizeShellNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(4)) : fallback;
}

function normalizeShellVector(value, fallback) {
  const source = Array.isArray(value) ? value : fallback;
  return [0, 1, 2].map((index) => normalizeShellNumber(source?.[index], fallback[index] || 0));
}

function normalizeShellConnectorConfig(value, fallbackDoor = null) {
  if (value === false) {
    return null;
  }

  const config = value === true ? { enabled: true } : isObject(value) ? value : {};
  if (config.enabled === false) {
    return null;
  }

  return {
    enabled: true,
    width: normalizeShellNumber(
      config.width,
      normalizeShellNumber(fallbackDoor?.width, 2.4)
    ),
    height: normalizeShellNumber(
      config.height,
      normalizeShellNumber(fallbackDoor?.height, 3)
    )
  };
}

function buildRoomShellSignature(
  roomId,
  config,
  required,
  materialMode = "standard",
  presentationWallConfig = null,
  playlistWallConfig = null
) {
  const safeConfig = isObject(config) ? config : {};
  const resolvedEntrySide = normalizeEntrySide(
    safeConfig.entrySide,
    roomId === "shop" ? "east" : "west"
  );
  const connectorDoor = isObject(safeConfig.connectorDoor)
    ? {
        width: normalizeShellNumber(safeConfig.connectorDoor.width, 2.4),
        height: normalizeShellNumber(safeConfig.connectorDoor.height, 3)
      }
    : null;
  const connectors = isObject(safeConfig.connectors)
    ? {
        front: normalizeShellConnectorConfig(safeConfig.connectors.front, connectorDoor),
        back: normalizeShellConnectorConfig(safeConfig.connectors.back, connectorDoor)
      }
    : { front: null, back: null };

  return JSON.stringify({
    roomId,
    required: Math.max(1, Math.floor(Number(required) || 1)),
    size: normalizeShellVector(safeConfig.size, [8, 4.6, 9.6]),
    origin: normalizeShellVector(safeConfig.origin, [0, 0, 0]),
    step: normalizeShellVector(safeConfig.expansion?.step, [0, 0, 0]),
    entrySide: resolvedEntrySide,
    rotationY: normalizeShellNumber(safeConfig.rotationY, 0),
    materialMode: readText(materialMode, "standard"),
    showEntryFrame: safeConfig.showEntryFrame !== false,
    label: readText(safeConfig.label, roomId),
    accentColor: readText(safeConfig.accentColor, ""),
    titleColor: readText(safeConfig.titleColor, ""),
    connectorDoor,
    connectors,
    presentationWall: isObject(presentationWallConfig)
      ? {
          ...presentationWallConfig,
          allRooms: safeConfig.presentationWall?.allRooms === true
        }
      : null,
    playlistWall: isObject(playlistWallConfig)
      ? {
          ...playlistWallConfig,
          allRooms: safeConfig.playlistWall?.allRooms === true
        }
      : null
  });
}

function extractYoutubeVideoId(item = {}) {
  const preferredId = typeof item?.id === "string" ? item.id.trim() : "";
  if (/^[A-Za-z0-9_-]{11}$/.test(preferredId)) {
    return preferredId;
  }

  const rawUrl = typeof item?.url === "string" ? item.url.trim() : "";
  if (!rawUrl) {
    return "";
  }

  try {
    const url = new URL(rawUrl);
    const directId = url.searchParams.get("v");
    if (directId && /^[A-Za-z0-9_-]{11}$/.test(directId)) {
      return directId;
    }

    const pathParts = url.pathname.split("/").filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1] || "";
    if (url.hostname.includes("youtu.be") && /^[A-Za-z0-9_-]{11}$/.test(lastPart)) {
      return lastPart;
    }
    if (
      (pathParts[0] === "embed" || pathParts[0] === "shorts") &&
      /^[A-Za-z0-9_-]{11}$/.test(lastPart)
    ) {
      return lastPart;
    }
  } catch {
    return "";
  }

  return "";
}

function readPublishedAtTimestamp(item = {}) {
  const publishedAt =
    typeof item?.publishedAt === "string" ? item.publishedAt.trim() : "";
  if (!publishedAt) {
    return -1;
  }

  const timestamp = Date.parse(publishedAt);
  return Number.isFinite(timestamp) ? timestamp : -1;
}

function resolveFeaturedVideoItem(items = []) {
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!safeItems.length) {
    return null;
  }

  let featuredItem = safeItems[0];
  let featuredTimestamp = readPublishedAtTimestamp(featuredItem);

  for (let index = 1; index < safeItems.length; index += 1) {
    const candidate = safeItems[index];
    const candidateTimestamp = readPublishedAtTimestamp(candidate);
    if (candidateTimestamp > featuredTimestamp) {
      featuredItem = candidate;
      featuredTimestamp = candidateTimestamp;
    }
  }

  return featuredItem;
}

function buildYoutubeEmbedUrl(videoId) {
  const normalizedId = typeof videoId === "string" ? videoId.trim() : "";
  if (!/^[A-Za-z0-9_-]{11}$/.test(normalizedId)) {
    return "";
  }
  return `https://www.youtube-nocookie.com/embed/${normalizedId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
}

function readDurationText(item = {}) {
  return typeof item?.durationText === "string" ? item.durationText.trim() : "";
}

function trimTitle(title, max = 26) {
  const clean = String(title || "").trim();
  if (!clean) {
    return "▶︎";
  }
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function readText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed || fallback;
}

function makeLabelCanvas(lines, options = {}) {
  const width = options.width || 512;
  const height = options.height || 192;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = options.background || "rgba(10, 11, 11, 0.82)";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = options.border || "rgba(188, 213, 215, 0.76)";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, width - 4, height - 4);

  const content = Array.isArray(lines) ? lines.filter(Boolean) : [String(lines || "")];
  const firstLineY = content.length > 1 ? height * 0.42 : height * 0.52;
  const lineGap = 58;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  content.forEach((line, index) => {
    ctx.font = index === 0 ? "700 52px Trebuchet MS" : "600 42px Trebuchet MS";
    ctx.fillStyle = index === 0
      ? options.primaryColor || "#f2f5f4"
      : options.secondaryColor || "#b9d0ce";
    ctx.fillText(String(line), width * 0.5, firstLineY + index * lineGap);
  });

  return canvas;
}

function makeLabelPlane(lines, scale = [2.8, 0.9], options = {}) {
  const canvas = makeLabelCanvas(lines, options);
  if (!canvas) {
    return null;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData.disposeWithMaterial = true;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.FrontSide,
    depthTest: true,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(scale[0], scale[1]),
    material
  );
  return mesh;
}

function disposeMaterial(material) {
  if (!material) {
    return;
  }

  const maps = [
    material.map,
    material.alphaMap,
    material.aoMap,
    material.bumpMap,
    material.emissiveMap,
    material.lightMap,
    material.metalnessMap,
    material.normalMap,
    material.roughnessMap
  ];

  for (const texture of maps) {
    if (texture?.userData?.disposeWithMaterial) {
      texture.dispose();
    }
  }

  material.dispose?.();
}

function disposeObjectResources(root) {
  if (!root) {
    return;
  }

  root.traverse((node) => {
    node.geometry?.dispose?.();
    if (Array.isArray(node.material)) {
      for (const material of node.material) {
        disposeMaterial(material);
      }
    } else {
      disposeMaterial(node.material);
    }
  });
}

function createSharedWallMaterial(sourceMaterial, fallbackColor) {
  if (sourceMaterial?.isMaterial) {
    const clone = sourceMaterial.clone();
    clone.side = THREE.DoubleSide;
    return clone;
  }

  const resolvedColor =
    fallbackColor?.isColor === true ? fallbackColor.clone() : toColor(fallbackColor, "#777777");
  return new THREE.MeshStandardMaterial({
    color: resolvedColor,
    roughness: 0.88,
    metalness: 0.08,
    side: THREE.DoubleSide
  });
}

function createSharedFloorMaterial(sourceMaterial, fallbackColor) {
  if (sourceMaterial?.isMaterial) {
    const clone = sourceMaterial.clone();
    clone.side = THREE.DoubleSide;
    return clone;
  }

  const resolvedColor =
    fallbackColor?.isColor === true ? fallbackColor.clone() : toColor(fallbackColor, "#777777");
  return new THREE.MeshStandardMaterial({
    color: resolvedColor,
    roughness: 0.9,
    metalness: 0.05,
    side: THREE.DoubleSide
  });
}

function normalizeFilter(filter = {}) {
  return {
    itemIds: Array.isArray(filter.itemIds) ? filter.itemIds : [],
    tagsAny: Array.isArray(filter.tagsAny) ? filter.tagsAny : [],
    allowEmpty: filter.allowEmpty === true
  };
}

function filterItems(items, filter, maxItems) {
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!safeItems.length) {
    return [];
  }

  const normalized = normalizeFilter(filter);

  let selected = safeItems;
  if (normalized.itemIds.length) {
    const idSet = new Set(normalized.itemIds);
    selected = safeItems.filter((item) => idSet.has(item.id));
  } else if (normalized.tagsAny.length) {
    const tags = new Set(normalized.tagsAny.map((tag) => String(tag).toLowerCase()));
    selected = safeItems.filter((item) =>
      (item.tags || []).some((tag) => tags.has(String(tag).toLowerCase()))
    );
  }

  if (!selected.length && !normalized.allowEmpty) {
    selected = safeItems;
  }

  const limit = Number.isFinite(maxItems) && maxItems > 0 ? maxItems : 6;
  return selected.slice(0, limit);
}

export class CatalogRoomSystem {
  constructor({
    scene,
    cache,
    catalogConfig,
    catalogFeeds,
    domElement,
    qualityProfile = null,
    wallMaterialSource = null,
    floorMaterialSource = null
  }) {
    this.scene = scene;
    this.cache = cache;
    this.catalogConfig = catalogConfig || {};
    this.catalogFeeds = catalogFeeds || {};
    this.feedItemsBySource = {};
    for (const [feedId, feed] of Object.entries(this.catalogFeeds)) {
      this.feedItemsBySource[feedId] = normalizeItems(feed);
    }
    this.domElement = domElement || window;
    this.qualityProfile = qualityProfile || { quality: "medium" };
    this.wallMaterialSource = wallMaterialSource || null;
    this.floorMaterialSource = floorMaterialSource || null;
    this.activeThemeName = null;
    this.root = new THREE.Group();
    this.root.name = "CatalogRooms";
    this.scene.add(this.root);

    this.enabled = this.catalogConfig.enabled !== false;
    this.roomNodes = new Map(); // roomId -> roomNode[]
    this.generatedShellObjects = new Map();
    this.hiddenShellNodeIds = new Set();
    this.targets = [];
    this.dynamicCards = [];
    this.colliders = [];
    this.applyToken = 0;
    this.lastVisibilityUpdateAt = -1;
    this.cameraWorldPosition = new THREE.Vector3();
    this.cameraForward = new THREE.Vector3();
    this.cardWorldPosition = new THREE.Vector3();
    this.cardDirection = new THREE.Vector3();
    this.presentationWalls = new Map();
    this.presentationStateByRoom = new Map();
    this.playlistWalls = new Map();
    this.presentationLayer = null;
    this.presentationOverlays = new Map();
    this.playlistOverlays = new Map();
    this.roomShellSignatures = new Map();
    this.screenCenterWorld = new THREE.Vector3();
    this.screenNormalWorld = new THREE.Vector3();
    this.screenQuaternion = new THREE.Quaternion();
    this.screenWorldCorners = [
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3()
    ];
    this.screenForwardSample = new THREE.Vector3();
    this.cameraSpaceSample = new THREE.Vector3();
  }

  getTargets() {
    return this.targets;
  }

  getRoomNodes(roomId) {
    return this.roomNodes.get(roomId) || [];
  }

  getColliders() {
    return this.colliders;
  }

  registerGeneratedShellObject(roomId, roomIndex, object, metadata = {}) {
    if (!object) {
      return object;
    }

    const partId = readText(metadata.partId, object.name || "shell-node");
    const label = readText(metadata.label, partId);
    const type = readText(metadata.type, "shell");
    const sourcePath = readText(metadata.sourcePath, `catalog.rooms.${roomId}`);
    const shellNodeId = `catalog:${roomId}:${roomIndex}:${partId}`;

    object.userData = object.userData || {};
    object.userData.generatedShellNodeId = shellNodeId;
    object.userData.generatedShellRoomId = roomId;
    object.userData.generatedShellRoomIndex = roomIndex;
    object.userData.generatedShellPartId = partId;
    object.userData.generatedShellType = type;
    object.userData.generatedShellLabel = label;
    object.userData.generatedShellSourceFile = "catalog.json";
    object.userData.generatedShellSourcePath = sourcePath;
    this.generatedShellObjects.set(shellNodeId, object);

    if (this.hiddenShellNodeIds.has(shellNodeId)) {
      object.visible = false;
    }

    return object;
  }

  unregisterGeneratedShellObjects(roomId, minIndexInclusive = 0) {
    const normalizedRoomId = readText(roomId, "");
    if (!normalizedRoomId) {
      return 0;
    }

    let removed = 0;
    for (const [shellNodeId, object] of this.generatedShellObjects.entries()) {
      if (readText(object?.userData?.generatedShellRoomId, "") !== normalizedRoomId) {
        continue;
      }
      const roomIndex = Number(object?.userData?.generatedShellRoomIndex);
      if (Number.isFinite(roomIndex) && roomIndex < minIndexInclusive) {
        continue;
      }
      this.generatedShellObjects.delete(shellNodeId);
      removed += 1;
    }
    return removed;
  }

  getGeneratedShellObject(shellNodeId) {
    const id = readText(shellNodeId, "");
    if (!id) {
      return null;
    }
    const cached = this.generatedShellObjects.get(id) || null;
    if (cached) {
      return cached;
    }

    for (const roomId of this.roomNodes.keys()) {
      for (const node of this.getRoomNodes(roomId)) {
        const shellNodes = Array.isArray(node.generatedShellNodes) ? node.generatedShellNodes : [];
        for (const object of shellNodes) {
          const objectId = readText(object?.userData?.generatedShellNodeId, "");
          if (!objectId || objectId !== id) {
            continue;
          }
          this.generatedShellObjects.set(id, object);
          return object;
        }
      }
    }

    return null;
  }

  getHiddenGeneratedShellNodeIds() {
    return [...this.hiddenShellNodeIds].sort((a, b) => a.localeCompare(b));
  }

  getGeneratedShellEntries(roomId = "") {
    const targetRoomId = readText(roomId, "");
    const roomIds = targetRoomId ? [targetRoomId] : this.getActiveRoomIds();
    const worldBounds = new THREE.Box3();
    const worldCenter = new THREE.Vector3();
    const worldSize = new THREE.Vector3();
    const entries = [];

    for (const currentRoomId of roomIds) {
      const nodes = this.getRoomNodes(currentRoomId).sort((a, b) => a.index - b.index);
      for (const node of nodes) {
        const shellNodes = Array.isArray(node.generatedShellNodes) ? node.generatedShellNodes : [];
        for (const object of shellNodes) {
          const shellNodeId = readText(object?.userData?.generatedShellNodeId, "");
          if (!shellNodeId) {
            continue;
          }

          object.updateWorldMatrix?.(true, true);
          worldBounds.setFromObject(object);
          if (worldBounds.isEmpty()) {
            worldCenter.setFromMatrixPosition(object.matrixWorld);
            worldSize.set(0, 0, 0);
          } else {
            worldBounds.getCenter(worldCenter);
            worldBounds.getSize(worldSize);
          }

          const colliderCount = this.colliders.filter(
            (entry) => readText(entry?.id, "") === shellNodeId
          ).length;
          const enabledColliderCount = this.colliders.filter(
            (entry) => readText(entry?.id, "") === shellNodeId && entry.enabled !== false
          ).length;

          entries.push({
            id: shellNodeId,
            roomId: currentRoomId,
            roomIndex: node.index,
            type: readText(object.userData?.generatedShellType, "shell"),
            partId: readText(object.userData?.generatedShellPartId, ""),
            label: readText(object.userData?.generatedShellLabel, shellNodeId),
            sourceConfigFile: readText(object.userData?.generatedShellSourceFile, "catalog.json"),
            sourcePath: readText(object.userData?.generatedShellSourcePath, `catalog.rooms.${currentRoomId}`),
            visible: object.visible !== false,
            colliderCount,
            enabledColliderCount,
            worldPosition: [
              Number(worldCenter.x.toFixed(4)),
              Number(worldCenter.y.toFixed(4)),
              Number(worldCenter.z.toFixed(4))
            ],
            worldBoundsSize: [
              Number(worldSize.x.toFixed(4)),
              Number(worldSize.y.toFixed(4)),
              Number(worldSize.z.toFixed(4))
            ],
            object
          });
        }
      }
    }

    return entries.sort((a, b) => {
      const byRoom = a.roomId.localeCompare(b.roomId);
      if (byRoom) {
        return byRoom;
      }
      const byIndex = a.roomIndex - b.roomIndex;
      if (byIndex) {
        return byIndex;
      }
      return a.label.localeCompare(b.label);
    });
  }

  setGeneratedShellNodeVisible(shellNodeId, visible) {
    const id = readText(shellNodeId, "");
    if (!id) {
      return false;
    }

    const resolved = visible !== false;
    if (resolved) {
      this.hiddenShellNodeIds.delete(id);
    } else {
      this.hiddenShellNodeIds.add(id);
    }

    const object = this.getGeneratedShellObject(id);
    if (object) {
      object.visible = resolved;
    }

    let updatedCollider = false;
    for (const collider of this.colliders) {
      if (readText(collider?.id, "") !== id) {
        continue;
      }
      collider.enabled = resolved;
      updatedCollider = true;
    }

    return Boolean(object) || updatedCollider;
  }

  restoreGeneratedShellRoom(roomId) {
    const normalizedRoomId = readText(roomId, "");
    if (!normalizedRoomId) {
      return 0;
    }

    let restored = 0;
    for (const entry of this.getGeneratedShellEntries(normalizedRoomId)) {
      if (!entry.visible || entry.enabledColliderCount !== entry.colliderCount) {
        if (this.setGeneratedShellNodeVisible(entry.id, true)) {
          restored += 1;
        }
      }
    }
    return restored;
  }

  isRoomEnabled(roomId) {
    return this.getRoomConfig(roomId)?.enabled !== false;
  }

  getConfiguredRoomIds() {
    return Object.entries(this.catalogConfig?.rooms || {})
      .filter(([, roomConfig]) => roomConfig?.enabled !== false)
      .map(([roomId]) => roomId);
  }

  getActiveRoomIds() {
    return [...this.roomNodes.entries()]
      .filter(([, nodes]) => Array.isArray(nodes) && nodes.length)
      .map(([roomId]) => roomId);
  }

  getRoomConfig(roomId) {
    return this.catalogConfig?.rooms?.[roomId] || {};
  }

  getRoomItems(roomId) {
    if (!this.isRoomEnabled(roomId)) {
      return [];
    }
    const roomConfig = this.getRoomConfig(roomId);
    const feedSource =
      typeof roomConfig.feedSource === "string" && roomConfig.feedSource.trim()
        ? roomConfig.feedSource.trim()
        : roomId;
    return this.getFeedItems(feedSource);
  }

  getFeedItems(feedSource) {
    const normalizedFeedSource =
      typeof feedSource === "string" && feedSource.trim() ? feedSource.trim() : "";
    if (!normalizedFeedSource) {
      return [];
    }
    return this.feedItemsBySource[normalizedFeedSource] || [];
  }

  getDefaultRoomUrl(roomId) {
    const roomConfig = this.getRoomConfig(roomId);
    const configuredUrl =
      typeof roomConfig.defaultUrl === "string" && roomConfig.defaultUrl.trim()
        ? roomConfig.defaultUrl.trim()
        : "";
    return configuredUrl || DEFAULT_ROOM_LINKS[roomId] || PROJECTS_LINK;
  }

  setQualityProfile(profile = null) {
    this.qualityProfile = profile || { quality: "medium" };
    this.lastVisibilityUpdateAt = -1;
    if (this.enabled && this.activeThemeName) {
      Promise.resolve(this.applyTheme(this.activeThemeName)).catch((error) => {
        console.error("Catalog quality refresh failed", error);
      });
    }
  }

  getQualityProfileValue(key, fallback) {
    return this.qualityProfile?.[key] ?? fallback;
  }

  getPresentationWallConfig(roomId, roomConfig = this.getRoomConfig(roomId), roomIndex = 0) {
    const configured = normalizePresentationWallConfig(roomConfig?.presentationWall);
    if (configured) {
      const allRooms = roomConfig?.presentationWall?.allRooms === true;
      return roomIndex === 0 || allRooms ? configured : null;
    }

    if (roomId !== SCREENING_ROOM_ID || roomIndex > 0) {
      return null;
    }

    return normalizePresentationWallConfig({
      enabled: true,
      wall: "front",
      width: 3.58,
      aspectRatio: 16 / 9,
      displayY: roomConfig?.layout?.displayY ?? 2.62,
      offset: roomConfig?._derived?.cardOffset ?? roomConfig?.layout?.cardOffset ?? 0.08,
      idleLabel: SCREENING_FALLBACK_LABEL
    });
  }

  getPlaylistWallConfig(roomId, roomConfig = this.getRoomConfig(roomId), roomIndex = 0) {
    const configured = normalizePlaylistWallConfig(roomConfig?.playlistWall);
    if (configured) {
      const allRooms = roomConfig?.playlistWall?.allRooms === true;
      return roomIndex === 0 || allRooms ? configured : null;
    }

    if (roomId !== SCREENING_ROOM_ID || roomIndex > 0) {
      return null;
    }

    return normalizePlaylistWallConfig({
      enabled: true,
      wall: "back",
      width: 3.28,
      height: 3.02,
      displayY: 2.28,
      offset: roomConfig?._derived?.cardOffset ?? roomConfig?.layout?.cardOffset ?? 0.08,
      label: "Longform Archive",
      feedSource: LONGFORM_FEED_SOURCE,
      itemLimit: 28
    });
  }

  getPlaylistItems(roomId, roomConfig = this.getRoomConfig(roomId), roomIndex = 0) {
    const playlistWall = this.getPlaylistWallConfig(roomId, roomConfig, roomIndex);
    if (!playlistWall) {
      return [];
    }
    return this.getFeedItems(playlistWall.feedSource).slice(0, playlistWall.itemLimit);
  }

  allowReservedWallSideSlots(roomConfig = {}) {
    return roomConfig?.layout?.allowReservedWallSideSlots === true;
  }

  getWallSlotBlockers(roomId, roomNode) {
    const blockers = [];
    const roomConfig = roomNode.config;
    const cardWidth = roomConfig.card?.width || 1.45;
    const horizontalGap = roomConfig.layout?.horizontalGap ?? 0.42;
    const allowReservedWallSideSlots = this.allowReservedWallSideSlots(roomConfig);
    const blockerPadding =
      roomId === SCREENING_ROOM_ID
        ? cardWidth * 0.34 + horizontalGap * 0.18
        : cardWidth * 0.56 + horizontalGap * 0.45;
    const presentationWall = this.getPresentationWallConfig(roomId, roomConfig, roomNode.index);
    if (presentationWall && allowReservedWallSideSlots) {
      blockers.push({
        wall: presentationWall.wall,
        min: presentationWall.center - presentationWall.width * 0.5 - blockerPadding,
        max: presentationWall.center + presentationWall.width * 0.5 + blockerPadding
      });
    }
    const playlistWall = this.getPlaylistWallConfig(roomId, roomConfig, roomNode.index);
    if (playlistWall) {
      blockers.push({
        wall: playlistWall.wall,
        min: playlistWall.center - playlistWall.width * 0.5 - blockerPadding,
        max: playlistWall.center + playlistWall.width * 0.5 + blockerPadding
      });
    }
    const connectorPadding =
      roomId === SCREENING_ROOM_ID
        ? cardWidth * 0.48 + horizontalGap * 0.24
        : cardWidth * 0.6 + horizontalGap * 0.34;
    const frontConnector = isObject(roomConfig?._derived?.frontConnector)
      ? roomConfig._derived.frontConnector
      : null;
    if (frontConnector) {
      blockers.push({
        wall: "front",
        min: -frontConnector.width * 0.5 - connectorPadding,
        max: frontConnector.width * 0.5 + connectorPadding
      });
    }
    const backConnector = isObject(roomConfig?._derived?.backConnector)
      ? roomConfig._derived.backConnector
      : null;
    if (backConnector) {
      blockers.push({
        wall: "back",
        min: -backConnector.width * 0.5 - connectorPadding,
        max: backConnector.width * 0.5 + connectorPadding
      });
    }
    return blockers;
  }

  getScreeningState(roomId = SCREENING_ROOM_ID) {
    const state = this.presentationStateByRoom.get(roomId);
    return state ? { ...state } : null;
  }

  ensurePresentationLayer() {
    if (this.presentationLayer?.isConnected) {
      return this.presentationLayer;
    }

    const host = this.domElement?.parentElement || document.body;
    const layer = document.createElement("div");
    layer.className = "screening-wall-layer";
    host.appendChild(layer);
    this.presentationLayer = layer;
    return layer;
  }

  ensurePresentationOverlay(roomId) {
    const existing = this.presentationOverlays.get(roomId);
    if (existing?.root?.isConnected) {
      return existing;
    }

    const layer = this.ensurePresentationLayer();
    const root = document.createElement("div");
    root.className = "screening-wall-player hidden";

    const iframe = document.createElement("iframe");
    iframe.className = "screening-wall-iframe";
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    iframe.loading = "lazy";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.setAttribute("title", "Screening wall");

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "screening-wall-close";
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.clearPresentationWall(roomId);
    });

    const caption = document.createElement("div");
    caption.className = "screening-wall-caption";
    caption.textContent = "";

    root.appendChild(iframe);
    root.appendChild(closeButton);
    root.appendChild(caption);
    layer.appendChild(root);

    const overlay = {
      root,
      iframe,
      closeButton,
      caption
    };
    this.presentationOverlays.set(roomId, overlay);
    return overlay;
  }

  hidePresentationOverlay(roomId) {
    const overlay = this.presentationOverlays.get(roomId);
    if (!overlay) {
      return;
    }
    overlay.root.classList.add("hidden");
    overlay.root.style.transform = "translate(-200vw, -200vh)";
    overlay.root.style.width = "0px";
    overlay.root.style.height = "0px";
  }

  removePresentationOverlay(roomId) {
    const overlay = this.presentationOverlays.get(roomId);
    if (!overlay) {
      return;
    }
    overlay.iframe.src = "about:blank";
    overlay.root.remove();
    this.presentationOverlays.delete(roomId);
  }

  ensurePlaylistOverlay(roomId) {
    const existing = this.playlistOverlays.get(roomId);
    if (existing?.root?.isConnected) {
      return existing;
    }

    const layer = this.ensurePresentationLayer();
    const root = document.createElement("div");
    root.className = "screening-playlist hidden";

    const frame = document.createElement("div");
    frame.className = "screening-playlist-frame";

    const title = document.createElement("div");
    title.className = "screening-playlist-title";

    const list = document.createElement("div");
    list.className = "screening-playlist-list";

    frame.appendChild(title);
    frame.appendChild(list);
    root.appendChild(frame);
    layer.appendChild(root);

    const overlay = { root, frame, title, list };
    this.playlistOverlays.set(roomId, overlay);
    return overlay;
  }

  hidePlaylistOverlay(roomId) {
    const overlay = this.playlistOverlays.get(roomId);
    if (!overlay) {
      return;
    }
    overlay.root.classList.add("hidden");
    overlay.root.style.transform = "translate(-200vw, -200vh)";
    overlay.root.style.width = "0px";
    overlay.root.style.height = "0px";
  }

  ensurePresentationWallEntry(roomId) {
    const normalizedRoomId =
      typeof roomId === "string" && roomId.trim() ? roomId.trim() : "";
    if (!normalizedRoomId) {
      return null;
    }

    const existing = this.presentationWalls.get(normalizedRoomId);
    if (existing?.group?.parent) {
      return existing;
    }

    const roomNode = this.getRoomNodes(normalizedRoomId)[0] || null;
    if (!roomNode?.group?.parent) {
      return null;
    }

    return this.createPresentationWall(normalizedRoomId, roomNode);
  }

  ensurePlaylistWallEntry(roomId) {
    const normalizedRoomId =
      typeof roomId === "string" && roomId.trim() ? roomId.trim() : "";
    if (!normalizedRoomId) {
      return null;
    }

    const existing = this.playlistWalls.get(normalizedRoomId);
    if (existing?.group?.parent) {
      return existing;
    }

    const roomNode = this.getRoomNodes(normalizedRoomId)[0] || null;
    if (!roomNode?.group?.parent) {
      return null;
    }

    return this.createPlaylistWall(normalizedRoomId, roomNode);
  }

  removePlaylistOverlay(roomId) {
    const overlay = this.playlistOverlays.get(roomId);
    if (!overlay) {
      return;
    }
    overlay.root.remove();
    this.playlistOverlays.delete(roomId);
  }

  syncPlaylistWall(roomId) {
    const wall = this.ensurePlaylistWallEntry(roomId);
    if (!wall) {
      this.hidePlaylistOverlay(roomId);
      return;
    }

    const overlay = this.ensurePlaylistOverlay(roomId);
    const items = this.getPlaylistItems(roomId, this.getRoomConfig(roomId), wall.roomIndex);
    overlay.title.textContent = wall.config.label;
    overlay.list.replaceChildren();

    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "screening-playlist-item";
      button.dataset.itemId = item.id || "";

      const title = document.createElement("span");
      title.className = "screening-playlist-item-title";
      title.textContent = trimTitle(item.title || "Video", 120);

      const meta = document.createElement("span");
      meta.className = "screening-playlist-item-meta";
      const durationText = readDurationText(item);
      meta.textContent = durationText || "";

      button.appendChild(title);
      button.appendChild(meta);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.playScreenVideo({
          roomId,
          itemId: item.id || "",
          videoId: extractYoutubeVideoId(item),
          url: item.url || "",
          title: item.title || "",
          image: item.image || ""
        });
      });
      overlay.list.appendChild(button);
    }
  }

  createPresentationLabelTexture(lines) {
    const canvas = makeLabelCanvas(lines, {
      width: 1024,
      height: 576,
      background: "rgba(7, 9, 10, 0.94)",
      border: "rgba(182, 208, 208, 0.82)"
    });
    if (!canvas) {
      return null;
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.userData.disposeWithMaterial = true;
    return texture;
  }

  setPresentationDisplayTexture(entry, texture = null) {
    const material = entry?.display?.material;
    if (!material) {
      return;
    }

    const currentMap = material.map;
    if (
      currentMap &&
      currentMap !== texture &&
      currentMap.userData?.disposeWithMaterial
    ) {
      currentMap.dispose();
    }

    material.map = texture;
    material.color.set(texture ? "#ffffff" : "#060809");
    material.needsUpdate = true;
  }

  async updatePresentationPoster(roomId, item = null) {
    const entry = this.presentationWalls.get(roomId);
    if (!entry) {
      return;
    }

    entry.posterImageRequest = typeof item?.image === "string" ? item.image : "";
    this.setPresentationDisplayTexture(entry, null);
    if (entry.label) {
      entry.label.visible = !item;
    }

    const allowThumbnails = this.getQualityProfileValue("catalogThumbnails", true) !== false;
    if (!item || !allowThumbnails || !entry.posterImageRequest) {
      return;
    }

    const imageRequest = entry.posterImageRequest;
    void this.cache
      .loadTexture(imageRequest)
      .then((texture) => {
        if (!texture || this.presentationWalls.get(roomId) !== entry) {
          return;
        }
        if (entry.posterImageRequest !== imageRequest) {
          return;
        }
        this.setPresentationDisplayTexture(entry, texture);
        if (entry.label) {
          entry.label.visible = false;
        }
      })
      .catch(() => {});
  }

  createPresentationWall(roomId, roomNode) {
    const roomConfig = roomNode.config;
    const config = this.getPresentationWallConfig(roomId, roomConfig, roomNode.index);
    if (!config) {
      this.presentationWalls.delete(roomId);
      return null;
    }

    const [width, height, depth] = roomConfig.size || [8.6, 4.6, 9.6];
    const entrySide = normalizeEntrySide(
      roomConfig.entrySide,
      roomId === "shop" ? "east" : "west"
    );
    const accent = toColor(roomConfig.accentColor, roomId === "shop" ? "#8ec8d3" : "#ba9de2");
    const basicMode = this.getQualityProfileValue("catalogMaterialMode", "standard") === "basic";
    const FrameMaterial = basicMode ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial;
    const displayMaterial = new THREE.MeshBasicMaterial({
      color: "#060809"
    });

    const group = new THREE.Group();
    group.name = `${roomId}PresentationWall`;

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(config.width + 0.2, config.height + 0.2, 0.18),
      new FrameMaterial(
        basicMode
          ? {
              color: accent.clone().multiplyScalar(0.42)
            }
          : {
              color: accent.clone().multiplyScalar(0.42),
              roughness: 0.42,
              metalness: 0.22,
              emissive: accent,
              emissiveIntensity: 0.08
            }
      )
    );
    group.add(frame);

    const display = new THREE.Mesh(
      new THREE.PlaneGeometry(config.width, config.height),
      displayMaterial
    );
    display.position.z = 0.1;
    display.renderOrder = 1;
    group.add(display);

    const label = makeLabelPlane([config.idleLabel], [config.width * 0.72, 0.56], {
      width: 768,
      height: 176,
      background: "rgba(7, 8, 10, 0.74)",
      border: "rgba(194, 216, 218, 0.78)"
    });
    if (label) {
      label.position.set(0, 0, 0.12);
      group.add(label);
    }

    switch (config.wall) {
      case "back":
        group.position.set(config.center, config.displayY, -depth * 0.5 + config.offset);
        group.rotation.y = 0;
        break;
      case "outer":
        group.position.set(
          entrySide === "east" ? -width * 0.5 + config.offset : width * 0.5 - config.offset,
          config.displayY,
          config.center
        );
        group.rotation.y = entrySide === "east" ? Math.PI * 0.5 : -Math.PI * 0.5;
        break;
      default:
        group.position.set(config.center, config.displayY, depth * 0.5 - config.offset);
        group.rotation.y = Math.PI;
        break;
    }

    roomNode.group.add(group);

    const entry = {
      roomId,
      roomIndex: roomNode.index,
      config,
      group,
      frame,
      display,
      label,
      title: null
    };
    this.presentationWalls.set(roomId, entry);
    this.setPresentationDisplayTexture(entry, null);
    if (label) {
      label.visible = true;
    }
    return entry;
  }

  createPlaylistWall(roomId, roomNode) {
    const roomConfig = roomNode.config;
    const config = this.getPlaylistWallConfig(roomId, roomConfig, roomNode.index);
    if (!config) {
      this.playlistWalls.delete(roomId);
      return null;
    }

    const [width, height, depth] = roomConfig.size || [8.6, 4.6, 9.6];
    const entrySide = normalizeEntrySide(
      roomConfig.entrySide,
      roomId === "shop" ? "east" : "west"
    );
    const accent = toColor(roomConfig.accentColor, roomId === "shop" ? "#8ec8d3" : "#ba9de2");
    const basicMode = this.getQualityProfileValue("catalogMaterialMode", "standard") === "basic";
    const FrameMaterial = basicMode ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial;

    const group = new THREE.Group();
    group.name = `${roomId}PlaylistWall`;

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(config.width + 0.18, config.height + 0.18, 0.14),
      new FrameMaterial(
        basicMode
          ? {
              color: accent.clone().multiplyScalar(0.34)
            }
          : {
              color: accent.clone().multiplyScalar(0.34),
              roughness: 0.52,
              metalness: 0.16,
              emissive: accent,
              emissiveIntensity: 0.05
            }
      )
    );
    group.add(frame);

    const display = new THREE.Mesh(
      new THREE.PlaneGeometry(config.width, config.height),
      new THREE.MeshBasicMaterial({
        color: "#06080a"
      })
    );
    display.position.z = 0.08;
    group.add(display);

    const title = makeLabelPlane([config.label], [Math.min(2.9, config.width * 0.78), 0.54], {
      width: 768,
      height: 168,
      background: "rgba(8, 9, 10, 0.84)",
      border: "rgba(196, 214, 218, 0.64)"
    });
    if (title) {
      title.position.set(0, config.height * 0.5 + 0.42, 0.06);
      group.add(title);
    }

    const hint = makeLabelPlane(["(ESC to scroll and select)"], [Math.min(2.5, config.width * 0.68), 0.44], {
      width: 700,
      height: 152,
      background: "rgba(7, 8, 10, 0.76)",
      border: "rgba(180, 198, 205, 0.42)"
    });
    if (hint) {
      hint.position.set(0, -config.height * 0.5 - 0.38, 0.06);
      group.add(hint);
    }

    switch (config.wall) {
      case "outer":
        group.position.set(
          entrySide === "east" ? -width * 0.5 + config.offset : width * 0.5 - config.offset,
          config.displayY,
          config.center
        );
        group.rotation.y = entrySide === "east" ? Math.PI * 0.5 : -Math.PI * 0.5;
        break;
      case "front":
        group.position.set(config.center, config.displayY, depth * 0.5 - config.offset);
        group.rotation.y = Math.PI;
        break;
      default:
        group.position.set(config.center, config.displayY, -depth * 0.5 + config.offset);
        group.rotation.y = 0;
        break;
    }

    roomNode.group.add(group);

    const entry = {
      roomId,
      roomIndex: roomNode.index,
      config,
      group,
      display,
      title
    };
    this.playlistWalls.set(roomId, entry);
    this.syncPlaylistWall(roomId);
    return entry;
  }

  findPresentationItem(roomId, interaction = {}) {
    const items = [
      ...this.getRoomItems(roomId),
      ...this.getPlaylistItems(roomId)
    ];
    if (!items.length) {
      return null;
    }

    const itemId = typeof interaction.itemId === "string" ? interaction.itemId.trim() : "";
    const videoId = typeof interaction.videoId === "string" ? interaction.videoId.trim() : "";
    const url = typeof interaction.url === "string" ? interaction.url.trim() : "";

    if (!itemId && !videoId && !url) {
      return items[0] || null;
    }

    return (
      items.find((item) => {
        if (!item) {
          return false;
        }
        if (itemId && item.id === itemId) {
          return true;
        }
        const resolvedVideoId = extractYoutubeVideoId(item);
        if (videoId && resolvedVideoId === videoId) {
          return true;
        }
        return Boolean(url) && item.url === url;
      }) || null
    );
  }

  async syncPresentationWall(roomId) {
    const wall = this.ensurePresentationWallEntry(roomId);
    if (!wall) {
      this.hidePresentationOverlay(roomId);
      return;
    }

    const state = this.presentationStateByRoom.get(roomId);
    if (!state?.active) {
      this.hidePresentationOverlay(roomId);
      await this.updatePresentationPoster(roomId, null);
      return;
    }

    const item = this.findPresentationItem(roomId, state) || {
      id: state.itemId || state.videoId || "",
      title: state.title || SCREENING_FALLBACK_LABEL,
      url: state.url || "",
      image: state.image || ""
    };
    const overlay = this.ensurePresentationOverlay(roomId);
    overlay.caption.textContent = trimTitle(state.title || item?.title || SCREENING_FALLBACK_LABEL, 84);
    overlay.iframe.setAttribute(
      "title",
      `${trimTitle(state.title || item?.title || "Seperet video", 84)} screening wall`
    );
    if (overlay.iframe.dataset.src !== state.embedUrl) {
      overlay.iframe.src = state.embedUrl;
      overlay.iframe.dataset.src = state.embedUrl;
    }
    overlay.root.classList.remove("hidden");
    await this.updatePresentationPoster(roomId, item);
  }

  async playScreenVideo(interaction = {}) {
    const roomId =
      typeof interaction.roomId === "string" && interaction.roomId.trim()
        ? interaction.roomId.trim()
        : SCREENING_ROOM_ID;
    let wall = this.ensurePresentationWallEntry(roomId);
    if (!wall && this.activeThemeName) {
      await this.applyTheme(this.activeThemeName);
      wall = this.ensurePresentationWallEntry(roomId);
    }
    if (!wall) {
      return false;
    }

    const item = this.findPresentationItem(roomId, interaction) || {
      id:
        (typeof interaction.itemId === "string" && interaction.itemId.trim()) ||
        (typeof interaction.videoId === "string" && interaction.videoId.trim()) ||
        "",
      title:
        (typeof interaction.title === "string" && interaction.title.trim()) ||
        SCREENING_FALLBACK_LABEL,
      url: typeof interaction.url === "string" ? interaction.url.trim() : "",
      image: typeof interaction.image === "string" ? interaction.image.trim() : ""
    };
    if (!item) {
      return false;
    }

    const videoId = extractYoutubeVideoId(item) || interaction.videoId || "";
    const embedUrl = buildYoutubeEmbedUrl(videoId);
    if (!embedUrl) {
      return false;
    }

    this.presentationStateByRoom.set(roomId, {
      roomId,
      itemId: item.id || videoId,
      videoId,
      title: item.title || SCREENING_FALLBACK_LABEL,
      url: item.url || "",
      image: item.image || "",
      embedUrl,
      active: true
    });

    await this.syncPresentationWall(roomId);
    return true;
  }

  clearPresentationWall(roomId = SCREENING_ROOM_ID) {
    const normalizedRoomId = typeof roomId === "string" ? roomId.trim() : "";
    if (!normalizedRoomId) {
      return false;
    }

    const previous = this.presentationStateByRoom.get(normalizedRoomId) || { roomId: normalizedRoomId };
    this.presentationStateByRoom.set(normalizedRoomId, {
      ...previous,
      active: false,
      embedUrl: "",
      itemId: "",
      videoId: ""
    });

    const overlay = this.presentationOverlays.get(normalizedRoomId);
    if (overlay) {
      overlay.iframe.src = "about:blank";
      overlay.iframe.dataset.src = "";
      overlay.caption.textContent = "";
      overlay.root.classList.add("hidden");
    }

    void this.updatePresentationPoster(normalizedRoomId, null);
    return true;
  }

  computeWallOverlayRect(display, size, activeCamera, options = {}) {
    const bounds = this.domElement?.getBoundingClientRect?.();
    if (!display || !activeCamera || !bounds || bounds.width <= 0 || bounds.height <= 0) {
      return null;
    }

    const widthWorld = Math.max(0.2, Number(size?.width) || 0);
    const heightWorld = Math.max(0.2, Number(size?.height) || 0);
    const minFacingDot = Number(options.minFacingDot) || 0.12;
    const minLookDot = Number(options.minLookDot) || 0.72;
    const maxViewportWidth = Number(options.maxViewportWidth) || 0.96;
    const maxViewportHeight = Number(options.maxViewportHeight) || 0.82;
    const maxViewportArea = Number(options.maxViewportArea) || 0.46;
    const minPixelWidth = Number(options.minPixelWidth) || 120;
    const minPixelHeight = Number(options.minPixelHeight) || 68;
    const minAspectScale = Number(options.minAspectScale) || 0.6;
    const maxAspectScale = Number(options.maxAspectScale) || 1.65;
    const minPlaneDistance = Number(options.minPlaneDistance) || 0.24;
    const projectedAxisLimit = Number(options.projectedAxisLimit) || 1.18;

    display.getWorldPosition(this.screenCenterWorld);
    display.getWorldQuaternion(this.screenQuaternion);
    this.screenNormalWorld.set(0, 0, 1).applyQuaternion(this.screenQuaternion).normalize();

    activeCamera.getWorldPosition(this.cameraWorldPosition);
    activeCamera.getWorldDirection(this.cameraForward).normalize();
    this.screenForwardSample
      .copy(this.cameraWorldPosition)
      .sub(this.screenCenterWorld);
    this.cameraSpaceSample.copy(this.screenCenterWorld).applyMatrix4(activeCamera.matrixWorldInverse);

    if (this.screenNormalWorld.dot(this.screenForwardSample) <= minFacingDot) {
      return null;
    }
    if (Math.abs(this.screenForwardSample.dot(this.screenNormalWorld)) <= minPlaneDistance) {
      return null;
    }
    if (this.cameraSpaceSample.z >= -0.18) {
      return null;
    }

    this.cardDirection
      .copy(this.screenCenterWorld)
      .sub(this.cameraWorldPosition)
      .normalize();
    if (this.cardDirection.dot(this.cameraForward) < minLookDot) {
      return null;
    }

    const halfWidth = widthWorld * 0.5;
    const halfHeight = heightWorld * 0.5;
    const localCorners = [
      [-halfWidth, halfHeight, 0.01],
      [halfWidth, halfHeight, 0.01],
      [halfWidth, -halfHeight, 0.01],
      [-halfWidth, -halfHeight, 0.01]
    ];

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < this.screenWorldCorners.length; index += 1) {
      const [x, y, z] = localCorners[index];
      const projected = this.screenWorldCorners[index].set(x, y, z);
      display.localToWorld(projected);
      this.cameraSpaceSample.copy(projected).applyMatrix4(activeCamera.matrixWorldInverse);
      if (this.cameraSpaceSample.z >= -0.05) {
        return null;
      }
      projected.project(activeCamera);

      if (
        !Number.isFinite(projected.x) ||
        !Number.isFinite(projected.y) ||
        !Number.isFinite(projected.z) ||
        projected.z < -1 ||
        projected.z > 1.2 ||
        Math.abs(projected.x) > projectedAxisLimit ||
        Math.abs(projected.y) > projectedAxisLimit
      ) {
        return null;
      }

      const pixelX = ((projected.x + 1) * 0.5) * bounds.width;
      const pixelY = ((1 - projected.y) * 0.5) * bounds.height;
      minX = Math.min(minX, pixelX);
      minY = Math.min(minY, pixelY);
      maxX = Math.max(maxX, pixelX);
      maxY = Math.max(maxY, pixelY);
    }

    const width = maxX - minX;
    const height = maxY - minY;
    const area = width * height;
    const aspect = widthWorld / heightWorld;
    const projectedAspect = width / Math.max(1, height);
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      !Number.isFinite(area) ||
      width < minPixelWidth ||
      height < minPixelHeight ||
      width > bounds.width * maxViewportWidth ||
      height > bounds.height * maxViewportHeight ||
      area > bounds.width * bounds.height * maxViewportArea ||
      projectedAspect < aspect * minAspectScale ||
      projectedAspect > aspect * maxAspectScale ||
      maxX < 0 ||
      maxY < 0 ||
      minX > bounds.width ||
      minY > bounds.height
    ) {
      return null;
    }

    return {
      x: minX,
      y: minY,
      width,
      height
    };
  }

  updatePresentationOverlay(roomId, activeCamera) {
    const wall = this.ensurePresentationWallEntry(roomId);
    const state = this.presentationStateByRoom.get(roomId);
    const overlay = this.presentationOverlays.get(roomId);
    if (!wall || !state?.active || !overlay || !activeCamera) {
      this.hidePresentationOverlay(roomId);
      return;
    }

    const rect = this.computeWallOverlayRect(
      wall.display,
      {
        width: wall.config.width,
        height: wall.config.height
      },
      activeCamera,
      {
        minFacingDot: 0.16,
        minLookDot: 0.82,
        maxViewportWidth: 0.82,
        maxViewportHeight: 0.68,
        maxViewportArea: 0.36,
        minPixelWidth: 120,
        minPixelHeight: 68,
        minAspectScale: 0.6,
        maxAspectScale: 1.5,
        minPlaneDistance: 0.34,
        projectedAxisLimit: 1.1
      }
    );
    if (!rect) {
      this.hidePresentationOverlay(roomId);
      return;
    }

    overlay.root.classList.remove("hidden");
    overlay.root.style.transform = `translate(${rect.x.toFixed(2)}px, ${rect.y.toFixed(2)}px)`;
    overlay.root.style.width = `${rect.width.toFixed(2)}px`;
    overlay.root.style.height = `${rect.height.toFixed(2)}px`;
  }

  updatePlaylistOverlay(roomId, activeCamera) {
    const wall = this.ensurePlaylistWallEntry(roomId);
    const overlay = this.playlistOverlays.get(roomId);
    if (!wall || !overlay || !activeCamera) {
      this.hidePlaylistOverlay(roomId);
      return;
    }

    const rect = this.computeWallOverlayRect(
      wall.display,
      {
        width: wall.config.width,
        height: wall.config.height
      },
      activeCamera,
      {
        minFacingDot: 0.08,
        minLookDot: 0.5,
        maxViewportWidth: 0.86,
        maxViewportHeight: 0.9,
        maxViewportArea: 0.62,
        minPixelWidth: 140,
        minPixelHeight: 160,
        minAspectScale: 0.4,
        maxAspectScale: 2.5,
        minPlaneDistance: 0.14,
        projectedAxisLimit: 1.36
      }
    );
    if (!rect) {
      this.hidePlaylistOverlay(roomId);
      return;
    }

    overlay.root.classList.remove("hidden");
    overlay.root.style.transform = `translate(${rect.x.toFixed(2)}px, ${rect.y.toFixed(2)}px)`;
    overlay.root.style.width = `${rect.width.toFixed(2)}px`;
    overlay.root.style.height = `${rect.height.toFixed(2)}px`;
  }

  setTargetVisibility(target, visible) {
    if (!target) {
      return;
    }
    const resolved = Boolean(visible);
    target.hitbox.visible = resolved;
    target.userData = target.userData || {};
    target.userData.hiddenFromInteraction = !resolved;
  }

  clearRoomCards(roomId) {
    for (const roomNode of this.getRoomNodes(roomId)) {
      disposeObjectResources(roomNode.cardsGroup);
      roomNode.cardsGroup.clear();
    }

    this.targets = this.targets.filter((target) => target.userData?.roomId !== roomId);
    this.dynamicCards = this.dynamicCards.filter((entry) => entry.roomId !== roomId);
  }

  removeRoom(roomId) {
    this.clearRoomCards(roomId);
    this.removeRoomsByIndex(roomId, 0);
    this.unregisterGeneratedShellObjects(roomId, 0);
    this.hidePresentationOverlay(roomId);
    this.removePresentationOverlay(roomId);
    this.presentationWalls.delete(roomId);
    this.presentationStateByRoom.delete(roomId);
    this.hidePlaylistOverlay(roomId);
    this.removePlaylistOverlay(roomId);
    this.playlistWalls.delete(roomId);
    this.roomShellSignatures.delete(roomId);
    this.roomNodes.delete(roomId);
    this.colliders = this.colliders.filter((entry) => entry.roomId !== roomId);
  }

  removeRoomsByIndex(roomId, minIndexInclusive) {
    const nodes = this.getRoomNodes(roomId);
    if (!nodes.length) {
      return;
    }
    this.unregisterGeneratedShellObjects(roomId, minIndexInclusive);
    const kept = [];
    for (const node of nodes) {
      if (node.index < minIndexInclusive) {
        kept.push(node);
        continue;
      }
      const presentationWall = this.presentationWalls.get(roomId);
      if (presentationWall && presentationWall.roomIndex === node.index) {
        this.hidePresentationOverlay(roomId);
        this.presentationWalls.delete(roomId);
      }
      const playlistWall = this.playlistWalls.get(roomId);
      if (playlistWall && playlistWall.roomIndex === node.index) {
        this.hidePlaylistOverlay(roomId);
        this.playlistWalls.delete(roomId);
      }
      disposeObjectResources(node.group);
      this.root.remove(node.group);
      node.group.clear();
    }
    this.roomNodes.set(roomId, kept);
    this.colliders = this.colliders.filter(
      (entry) => !(entry.roomId === roomId && entry.roomIndex >= minIndexInclusive)
    );
  }

  addCollider(roomId, roomIndex, centerX, centerZ, sizeX, sizeZ, minY, maxY, metadata = {}) {
    this.colliders.push({
      id: readText(metadata.id, ""),
      tag: readText(metadata.tag, ""),
      label: readText(metadata.label, ""),
      sourcePath: readText(metadata.sourcePath, ""),
      enabled: metadata.enabled !== false,
      roomId,
      roomIndex,
      minX: centerX - sizeX * 0.5,
      maxX: centerX + sizeX * 0.5,
      minZ: centerZ - sizeZ * 0.5,
      maxZ: centerZ + sizeZ * 0.5,
      minY,
      maxY
    });
  }

  addColliderFromObject(roomId, roomIndex, object, minThickness = 0.42, metadata = {}) {
    if (!object) {
      return false;
    }

    object.updateWorldMatrix?.(true, true);
    tempColliderBox.setFromObject(object);
    if (tempColliderBox.isEmpty()) {
      return false;
    }

    tempColliderBox.getCenter(tempColliderCenter);
    tempColliderBox.getSize(tempColliderSize);
    const thickness = Math.max(0.12, Number(minThickness) || 0.42);
    const minY = tempColliderBox.min.y + 0.02;
    const maxY = Math.max(minY + 0.1, tempColliderBox.max.y - 0.02);
    this.addCollider(
      roomId,
      roomIndex,
      tempColliderCenter.x,
      tempColliderCenter.z,
      Math.max(tempColliderSize.x, thickness),
      Math.max(tempColliderSize.z, thickness),
      minY,
      maxY,
      {
        id: readText(metadata.id, readText(object.userData?.generatedShellNodeId, "")),
        tag: readText(metadata.tag, readText(object.userData?.generatedShellType, "")),
        label: readText(metadata.label, readText(object.userData?.generatedShellLabel, "")),
        sourcePath: readText(
          metadata.sourcePath,
          readText(object.userData?.generatedShellSourcePath, "")
        ),
        enabled: metadata.enabled ?? object.visible !== false
      }
    );
    return true;
  }

  addCollidersFromObjects(roomId, roomIndex, objects, minThickness = 0.42) {
    for (const object of Array.isArray(objects) ? objects : [objects]) {
      this.addColliderFromObject(roomId, roomIndex, object, minThickness);
    }
  }

  createWallPanel(
    roomGroup,
    geometryArgs,
    material,
    position,
    rotationY,
    doorway = null,
    metadata = null
  ) {
    const panels = [];
    const [panelWidth, panelHeight] = geometryArgs;
    const meta = isObject(metadata) ? metadata : null;
    const registerPanel = (panel, suffix = "", label = "") => {
      if (!meta || typeof meta.register !== "function") {
        return;
      }
      const partId = suffix ? `${meta.partId}-${suffix}` : meta.partId;
      meta.register(panel, {
        partId,
        type: readText(meta.type, "wall"),
        label: readText(label, partId)
      });
    };
    if (!doorway) {
      const full = new THREE.Mesh(
        new THREE.PlaneGeometry(panelWidth, panelHeight),
        material
      );
      full.position.copy(position);
      full.rotation.y = rotationY;
      roomGroup.add(full);
      registerPanel(full, "", readText(meta?.label, "Wall"));
      panels.push(full);
      return panels;
    }

    const openingWidth = clamp(doorway.width ?? 2.5, 1.4, panelWidth - 0.8);
    const openingHeight = clamp(doorway.height ?? 3, 2, panelHeight - 0.4);
    const topHeight = Math.max(0.2, panelHeight - openingHeight);
    const sideSegment = Math.max(0.2, (panelWidth - openingWidth) * 0.5);

    const top = new THREE.Mesh(
      new THREE.PlaneGeometry(panelWidth, topHeight),
      material
    );
    top.position.copy(position);
    top.position.y += openingHeight * 0.5 + topHeight * 0.5;
    top.rotation.y = rotationY;
    roomGroup.add(top);
    registerPanel(top, "top", `${readText(meta?.label, "Wall")} Top`);
    panels.push(top);

    const left = new THREE.Mesh(
      new THREE.PlaneGeometry(sideSegment, openingHeight),
      material
    );
    left.position.copy(position);
    left.position.x += Math.cos(rotationY) * (openingWidth * 0.5 + sideSegment * 0.5);
    left.position.z += Math.sin(rotationY) * (openingWidth * 0.5 + sideSegment * 0.5);
    left.rotation.y = rotationY;
    roomGroup.add(left);
    registerPanel(left, "left", `${readText(meta?.label, "Wall")} Left`);
    panels.push(left);

    const right = new THREE.Mesh(
      new THREE.PlaneGeometry(sideSegment, openingHeight),
      material
    );
    right.position.copy(position);
    right.position.x -= Math.cos(rotationY) * (openingWidth * 0.5 + sideSegment * 0.5);
    right.position.z -= Math.sin(rotationY) * (openingWidth * 0.5 + sideSegment * 0.5);
    right.rotation.y = rotationY;
    roomGroup.add(right);
    registerPanel(right, "right", `${readText(meta?.label, "Wall")} Right`);
    panels.push(right);
    return panels;
  }

  createRoomShell(roomId, config, roomIndex, totalRooms) {
    const group = new THREE.Group();
    group.name = `${roomId}Room_${roomIndex + 1}`;
    const generatedShellNodes = [];

    const size = config.size || [8, 4.6, 9.6];
    const [width, height, depth] = size;
    const basicMode = this.getQualityProfileValue("catalogMaterialMode", "standard") === "basic";
    const SurfaceMaterial = basicMode ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial;
    const entrySide = normalizeEntrySide(
      config.entrySide,
      roomId === "shop" ? "east" : "west"
    );
    const wallThickness = 0.42;
    const rotationY = normalizeRoomRotationY(config.rotationY);
    const origin = config.origin || [0, 0, 0];
    const step = Array.isArray(config.expansion?.step)
      ? config.expansion.step
      : [0, 0, -(depth + 2.2)];
    const showEntryFrame = config.showEntryFrame !== false;
    group.position.set(
      (origin[0] || 0) + (step[0] || 0) * roomIndex,
      (origin[1] || 0) + (step[1] || 0) * roomIndex,
      (origin[2] || 0) + (step[2] || 0) * roomIndex
    );
    group.rotation.y = rotationY;

    const accent = toColor(config.accentColor, roomId === "shop" ? "#8ec8d3" : "#ba9de2");
    const titleColor = toColor(config.titleColor, "#f5f5f0");
    const wallColor = accent.clone().multiplyScalar(0.24);
    const trimColor = accent.clone().multiplyScalar(0.55);
    const generatedShellSourcePath = `catalog.rooms.${roomId}`;
    const registerShellNode = (object, metadata = {}) => {
      const registered = this.registerGeneratedShellObject(roomId, roomIndex, object, {
        sourcePath: generatedShellSourcePath,
        ...metadata
      });
      if (registered) {
        generatedShellNodes.push(registered);
      }
      return registered;
    };

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      createSharedFloorMaterial(this.floorMaterialSource, wallColor.clone().offsetHSL(0, 0, -0.07))
    );
    floor.rotation.x = -Math.PI * 0.5;
    floor.receiveShadow = true;
    group.add(floor);
    registerShellNode(floor, {
      partId: "floor",
      type: "floor",
      label: "Floor"
    });

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new SurfaceMaterial({
        color: wallColor.clone().offsetHSL(0, 0, 0.06),
        ...(basicMode
          ? {}
          : {
              roughness: 0.93,
              metalness: 0.02
            })
      })
    );
    ceiling.rotation.x = Math.PI * 0.5;
    ceiling.position.y = height;
    group.add(ceiling);
    registerShellNode(ceiling, {
      partId: "ceiling",
      type: "ceiling",
      label: "Ceiling"
    });

    const wallMaterial = createSharedWallMaterial(this.wallMaterialSource, wallColor);

    const outerWall = new THREE.Mesh(
      new THREE.PlaneGeometry(depth, height),
      createSharedWallMaterial(this.wallMaterialSource, wallColor.clone().offsetHSL(0, 0, -0.03))
    );
    const outerWallDirection = entrySide === "east" ? -1 : 1;
    outerWall.rotation.y = entrySide === "east" ? Math.PI * 0.5 : -Math.PI * 0.5;
    outerWall.position.set(outerWallDirection * width * 0.5, height * 0.5, 0);
    group.add(outerWall);
    registerShellNode(outerWall, {
      partId: "outer-wall",
      type: "wall",
      label: "Outer Wall"
    });

    const connectorDoor = {
      width: clamp(config.connectorDoor?.width ?? 2.4, 1.4, width - 1),
      height: clamp(config.connectorDoor?.height ?? 3, 2, height - 0.4)
    };
    const connectorConfig = isObject(config.connectors) ? config.connectors : {};
    const resolveConnector = (side, autoEnabled) => {
      const sideConfigRaw = connectorConfig[side];
      if (sideConfigRaw === false) {
        return null;
      }
      const sideConfig =
        sideConfigRaw === true ? { enabled: true } : isObject(sideConfigRaw) ? sideConfigRaw : {};
      const enabled =
        sideConfig.enabled === false ? false : autoEnabled || sideConfig.enabled === true;
      if (!enabled) {
        return null;
      }
      return {
        width: clamp(sideConfig.width ?? connectorDoor.width, 1.4, width - 1),
        height: clamp(sideConfig.height ?? connectorDoor.height, 2, height - 0.4)
      };
    };
    const frontConnector = resolveConnector("front", roomIndex > 0);
    const backConnector = resolveConnector("back", roomIndex < totalRooms - 1);

    const backWallPanels = this.createWallPanel(
      group,
      [width, height],
      wallMaterial,
      new THREE.Vector3(0, height * 0.5, -depth * 0.5),
      0,
      backConnector,
      {
        partId: "back-wall",
        type: "wall",
        label: "Back Wall",
        register: registerShellNode
      }
    );
    const frontWallPanels = this.createWallPanel(
      group,
      [width, height],
      wallMaterial,
      new THREE.Vector3(0, height * 0.5, depth * 0.5),
      Math.PI,
      frontConnector,
      {
        partId: "front-wall",
        type: "wall",
        label: "Front Wall",
        register: registerShellNode
      }
    );

    if (showEntryFrame) {
      const entranceFrameMaterial = new SurfaceMaterial(
        basicMode
          ? {
              color: trimColor.clone().multiplyScalar(0.45)
            }
          : {
              color: trimColor.clone().multiplyScalar(0.45),
              roughness: 0.58,
              metalness: 0.28,
              emissive: accent.clone().multiplyScalar(0.18),
              emissiveIntensity: 0.08
            }
      );
      const entranceAccentMaterial = new SurfaceMaterial(
        basicMode
          ? {
              color: accent.clone().offsetHSL(0, 0.08, 0.14)
            }
          : {
              color: accent.clone().offsetHSL(0, 0.08, 0.14),
              roughness: 0.2,
              metalness: 0.08,
              emissive: accent,
              emissiveIntensity: 0.42
            }
      );
      const frameDepth = 0.24;
      const frameHeight = clamp(height * 0.86, 2.9, 4.2);
      const frameWidth = clamp(width * 0.58, 2.4, 4.1);
      const frameDirection = entrySide === "east" ? 1 : -1;
      const frameCenterX = frameDirection * (width * 0.5 - 0.18);

      const frameTop = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.2, frameWidth),
        entranceFrameMaterial
      );
      frameTop.castShadow = true;
      frameTop.receiveShadow = true;
      frameTop.position.set(frameCenterX, frameHeight, 0);
      group.add(frameTop);
      registerShellNode(frameTop, {
        partId: "entry-frame-top",
        type: "frame",
        label: "Entry Frame Top"
      });

      const framePillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, frameHeight, frameDepth),
        entranceFrameMaterial
      );
      framePillar.castShadow = true;
      framePillar.receiveShadow = true;
      framePillar.position.set(frameCenterX, frameHeight * 0.5, frameWidth * 0.5 - frameDepth * 0.5);
      group.add(framePillar);
      registerShellNode(framePillar, {
        partId: "entry-frame-left",
        type: "frame",
        label: "Entry Frame Left"
      });
      const secondPillar = framePillar.clone();
      secondPillar.castShadow = true;
      secondPillar.receiveShadow = true;
      secondPillar.position.z = -(frameWidth * 0.5 - frameDepth * 0.5);
      group.add(secondPillar);
      registerShellNode(secondPillar, {
        partId: "entry-frame-right",
        type: "frame",
        label: "Entry Frame Right"
      });

      const glowStrip = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.08, Math.max(1.4, frameWidth - 0.38)),
        entranceAccentMaterial
      );
      glowStrip.castShadow = true;
      glowStrip.receiveShadow = true;
      glowStrip.position.set(frameCenterX - frameDirection * 0.1, frameHeight - 0.14, 0);
      group.add(glowStrip);
      registerShellNode(glowStrip, {
        partId: "entry-frame-glow-strip",
        type: "frame-accent",
        label: "Entry Glow Strip"
      });

      const title = makeLabelPlane(
        [trimTitle(config.label || (roomId === "shop" ? "Gift Shop" : "Projects"), 24)],
        [2.8, 0.75],
        {
          border: `#${titleColor.getHexString()}`,
          background: "rgba(13, 16, 16, 0.82)"
        }
      );
      if (title) {
        title.position.set(frameCenterX + frameDirection * 0.44, frameHeight + 0.42, 0);
        title.rotation.set(0, entrySide === "east" ? Math.PI * 0.5 : -Math.PI * 0.5, 0);
        group.add(title);
      }

      if (!basicMode) {
        const accentLight = new THREE.PointLight(
          accent,
          0.45,
          8
        );
        accentLight.position.set(frameCenterX - frameDirection * 0.46, frameHeight + 0.32, 0);
        group.add(accentLight);
      }
    }

    const cardsGroup = new THREE.Group();
    cardsGroup.name = `${roomId}Cards`;
    group.add(cardsGroup);

    group.updateWorldMatrix(true, true);
    this.addColliderFromObject(roomId, roomIndex, outerWall, wallThickness);
    this.addCollidersFromObjects(roomId, roomIndex, backWallPanels, wallThickness);
    this.addCollidersFromObjects(roomId, roomIndex, frontWallPanels, wallThickness);

    this.root.add(group);
    const node = {
      index: roomIndex,
      group,
      cardsGroup,
      generatedShellNodes,
      config: {
        ...config,
        size,
        _derived: {
          cardOffset: config.layout?.cardOffset ?? 0.08,
          frontConnector: frontConnector ? { ...frontConnector } : null,
          backConnector: backConnector ? { ...backConnector } : null
        }
      }
    };
    const nodes = this.getRoomNodes(roomId);
    nodes.push(node);
    this.roomNodes.set(roomId, nodes);
    this.createPresentationWall(roomId, node);
    this.createPlaylistWall(roomId, node);
    return node;
  }

  computeWallSlots(roomId, roomNode) {
    const roomConfig = roomNode.config;
    const [width, height, depth] = roomConfig.size || [8.6, 4.6, 9.6];
    const entrySide = normalizeEntrySide(
      roomConfig.entrySide,
      roomId === "shop" ? "east" : "west"
    );
    const layout = roomConfig.layout || {};
    const cardWidth = roomConfig.card?.width || 1.45;
    const horizontalGap = layout.horizontalGap ?? 0.42;
    const wallMargin = layout.wallMargin ?? 0.7;
    const y = layout.displayY ?? clamp(height * 0.56, 2.2, 2.9);
    const offset = roomConfig._derived?.cardOffset ?? 0.08;
    const reservedWall = this.getPresentationWallConfig(roomId, roomConfig, roomNode.index)?.wall || null;
    const allowReservedWallSideSlots = this.allowReservedWallSideSlots(roomConfig);
    const blockers = this.getWallSlotBlockers(roomId, roomNode);

    const buildLine = (length) => {
      const usable = Math.max(0, length - wallMargin * 2);
      const stride = cardWidth + horizontalGap;
      const count = Math.max(0, Math.floor((usable + horizontalGap) / stride));
      const values = [];
      if (!count) {
        return values;
      }
      const start = -((count - 1) * stride) * 0.5;
      for (let i = 0; i < count; i += 1) {
        values.push(start + i * stride);
      }
      return values;
    };
    const filterBlockedLine = (wall, values) =>
      values.filter(
        (value) =>
          !blockers.some(
            (blocker) =>
              blocker.wall === wall &&
              value >= blocker.min &&
              value <= blocker.max
          )
      );

    const walls = [];
    if (reservedWall !== "back" || allowReservedWallSideSlots) {
      const backLine = filterBlockedLine("back", buildLine(width));
      for (const x of backLine) {
        walls.push({
          wall: "back",
          position: [x, y, -depth * 0.5 + offset],
          rotationY: 0
        });
      }
    }
    if (reservedWall !== "outer" || allowReservedWallSideSlots) {
      const outerLine = filterBlockedLine("outer", buildLine(depth));
      for (const z of outerLine) {
        walls.push({
          wall: "outer",
          position: [entrySide === "east" ? -width * 0.5 + offset : width * 0.5 - offset, y, z],
          rotationY: entrySide === "east" ? Math.PI * 0.5 : -Math.PI * 0.5
        });
      }
    }
    if (reservedWall !== "front" || allowReservedWallSideSlots) {
      const frontLine = filterBlockedLine("front", buildLine(width));
      for (const x of frontLine) {
        walls.push({
          wall: "front",
          position: [x, y, depth * 0.5 - offset],
          rotationY: Math.PI
        });
      }
    }
    return walls;
  }

  computeRoomCapacity(roomId, config) {
    const tempNode = {
      index: 0,
      config: {
        ...config,
        _derived: {
          cardOffset: config.layout?.cardOffset ?? 0.08
        }
      }
    };
    return this.computeWallSlots(roomId, tempNode).length;
  }

  computeRoomCapacityForIndex(roomId, config, roomIndex = 0) {
    const tempNode = {
      index: roomIndex,
      config: {
        ...config,
        _derived: {
          cardOffset: config.layout?.cardOffset ?? 0.08
        }
      }
    };
    return this.computeWallSlots(roomId, tempNode).length;
  }

  computeRequiredRoomCount(roomId, config, itemCount) {
    const safeItemCount = Math.max(0, Number(itemCount) || 0);
    if (!safeItemCount) {
      return 1;
    }

    let totalCapacity = 0;
    let roomCount = 0;
    const hardLimit = 24;
    while (totalCapacity < safeItemCount && roomCount < hardLimit) {
      totalCapacity += Math.max(1, this.computeRoomCapacityForIndex(roomId, config, roomCount));
      roomCount += 1;
    }
    return Math.max(1, roomCount);
  }

  estimateRoomCount(roomId, itemCount = null) {
    const roomConfig = this.getRoomConfig(roomId);
    if (!roomConfig || roomConfig.enabled === false) {
      return 0;
    }

    const resolvedItemCount = Number.isFinite(Number(itemCount))
      ? Math.max(0, Math.floor(Number(itemCount)))
      : this.getRoomItems(roomId).length;
    return this.computeRequiredRoomCount(roomId, roomConfig, resolvedItemCount);
  }

  buildSlotPool(roomId, nodes, roomConfig, itemCount) {
    const distribution = readText(roomConfig?.layout?.distribution, "sequential").toLowerCase();
    if (distribution !== "balanced" || nodes.length <= 1) {
      const slotPool = [];
      for (const node of nodes) {
        const slots = this.computeWallSlots(roomId, node);
        for (const slot of slots) {
          slotPool.push({
            ...slot,
            roomNode: node
          });
        }
      }
      return slotPool;
    }

    const buckets = nodes
      .map((node) => ({
        roomNode: node,
        slots: this.computeWallSlots(roomId, node).map((slot) => ({
          ...slot,
          roomNode: node
        }))
      }))
      .filter((bucket) => bucket.slots.length);
    const slotPool = [];
    while (slotPool.length < itemCount && buckets.some((bucket) => bucket.slots.length)) {
      for (const bucket of buckets) {
        const slot = bucket.slots.shift();
        if (!slot) {
          continue;
        }
        slotPool.push(slot);
        if (slotPool.length >= itemCount) {
          break;
        }
      }
    }
    return slotPool;
  }

  getRoomSnapshot(roomId) {
    const nodes = this.getRoomNodes(roomId).sort((a, b) => a.index - b.index);
    const latestItemIds = this.dynamicCards
      .filter((entry) => entry.roomId === roomId && entry.isLatestVideo)
      .map((entry) => entry.itemId);
    return {
      roomId,
      enabled: this.isRoomEnabled(roomId),
      nodeCount: nodes.length,
      shellNodeCount: nodes.reduce(
        (total, node) =>
          total + (Array.isArray(node.generatedShellNodes) ? node.generatedShellNodes.length : 0),
        0
      ),
      colliderCount: this.colliders.filter((entry) => entry?.roomId === roomId).length,
      cardCounts: nodes.map((node) => node.cardsGroup?.children?.length || 0),
      capacities: nodes.map((node) => this.computeWallSlots(roomId, node).length),
      latestItemId: latestItemIds[0] || null,
      latestItemIds
    };
  }

  reconcileRoomCount(roomId, config, required) {
    const normalizedRoomId = readText(roomId, "");
    if (!normalizedRoomId) {
      return;
    }

    const safeRequired = Math.max(1, Math.floor(Number(required) || 1));
    const materialMode = this.getQualityProfileValue("catalogMaterialMode", "standard");
    const presentationWallConfig = this.getPresentationWallConfig(normalizedRoomId, config, 0);
    const playlistWallConfig = this.getPlaylistWallConfig(normalizedRoomId, config, 0);
    const shellSignature = buildRoomShellSignature(
      normalizedRoomId,
      config,
      safeRequired,
      materialMode,
      presentationWallConfig,
      playlistWallConfig
    );
    const current = this.getRoomNodes(normalizedRoomId);
    const shellSignatureMatches = this.roomShellSignatures.get(normalizedRoomId) === shellSignature;
    const shellNodesIntact =
      current.length === safeRequired &&
      current.every((node) => node?.group?.parent === this.root);

    if (shellSignatureMatches && shellNodesIntact) {
      return;
    }

    this.colliders = this.colliders.filter((entry) => entry.roomId !== normalizedRoomId);
    this.unregisterGeneratedShellObjects(normalizedRoomId, 0);
    this.hidePresentationOverlay(normalizedRoomId);
    this.presentationWalls.delete(normalizedRoomId);
    this.hidePlaylistOverlay(normalizedRoomId);
    this.playlistWalls.delete(normalizedRoomId);
    if (current.length > safeRequired) {
      this.removeRoomsByIndex(normalizedRoomId, safeRequired);
    }

    // Rebuild connectors if the shell layout changed or the room count changed.
    const finalNodes = this.getRoomNodes(normalizedRoomId);
    for (const node of finalNodes) {
      disposeObjectResources(node.group);
      this.root.remove(node.group);
      node.group.clear();
    }
    this.roomNodes.set(normalizedRoomId, []);
    for (let index = 0; index < safeRequired; index += 1) {
      this.createRoomShell(normalizedRoomId, config, index, safeRequired);
    }
    this.roomShellSignatures.set(normalizedRoomId, shellSignature);
  }

  async createCard(roomId, roomNode, item, placement, index, token, options = {}) {
    const roomConfig = roomNode.config;
    const cardWidth = roomConfig.card?.width || 1.45;
    const cardHeight = roomConfig.card?.height || 1.9;
    const basicMode = this.getQualityProfileValue("catalogMaterialMode", "standard") === "basic";
    const cardGlowEnabled = this.getQualityProfileValue("catalogCardGlow", true) !== false;
    const allowThumbnails = this.getQualityProfileValue("catalogThumbnails", true) !== false;
    const cardLightBudget = Math.max(
      0,
      Number(this.getQualityProfileValue("catalogCardLightBudget", 28)) || 0
    );
    const MaterialCtor = basicMode ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial;
    const isScreeningRoom = Boolean(this.getPresentationWallConfig(roomId, roomConfig, roomNode.index));
    const videoId = extractYoutubeVideoId(item);
    const isLatestVideoCard = isScreeningRoom && options?.featuredItem === item;

    const group = new THREE.Group();
    group.position.set(
      placement.position[0],
      placement.position[1],
      placement.position[2]
    );
    const baseRotationY = placement.rotationY || 0;
    group.rotation.y = baseRotationY;
    roomNode.cardsGroup.add(group);

    const cleanupCard = () => {
      roomNode.cardsGroup.remove(group);
      disposeObjectResources(group);
      group.clear();
    };

    const accent = toColor(roomConfig.accentColor, roomId === "shop" ? "#8ec8d3" : "#ba9de2");
    const cardAccent = isLatestVideoCard
      ? accent.clone().lerp(new THREE.Color("#ffdcea"), 0.38)
      : accent.clone();
    const restFrameColor = cardAccent.clone().multiplyScalar(0.44);
    const frameMaterial = new MaterialCtor(
      basicMode
        ? {
            color: cardAccent.clone().multiplyScalar(0.48)
          }
        : {
            color: restFrameColor.clone(),
            roughness: 0.45,
            metalness: 0.28,
            emissive: cardAccent,
            emissiveIntensity: isLatestVideoCard ? 0.2 : 0.12
          }
    );
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(cardWidth + 0.14, cardHeight + 0.14, 0.12),
      frameMaterial
    );
    frame.castShadow = false;
    frame.receiveShadow = false;
    group.add(frame);

    const imageMaterial = new MaterialCtor(
      basicMode
        ? {
            color: "#d8dbdf"
          }
        : {
            color: "#d8dbdf",
            roughness: 0.4,
            metalness: 0.06
          }
    );
    const imagePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(cardWidth, cardHeight),
      imageMaterial
    );
    imagePlane.position.z = 0.07;
    group.add(imagePlane);

    const glowPanel = cardGlowEnabled
      ? new THREE.Mesh(
          new THREE.PlaneGeometry(cardWidth + 0.5, cardHeight + 0.5),
          new THREE.MeshBasicMaterial({
            color: cardAccent,
            transparent: true,
            opacity: isLatestVideoCard ? (basicMode ? 0.3 : 0.46) : basicMode ? 0.2 : 0.34,
            blending: THREE.AdditiveBlending,
            depthWrite: false
          })
        )
      : null;
    if (glowPanel) {
      glowPanel.position.z = 0.02;
      glowPanel.renderOrder = 2;
      group.add(glowPanel);
    }

    if (!basicMode && cardLightBudget > 0 && index < cardLightBudget) {
      const glowLight = new THREE.PointLight(cardAccent, isLatestVideoCard ? 0.58 : 0.42, 3.8);
      glowLight.position.set(0, 0.08, 0.44);
      glowLight.userData.canCastShadow = false;
      group.add(glowLight);
    }

    if (allowThumbnails && item.image) {
      const imageRequest = item.image;
      void this.cache
        .loadTexture(imageRequest)
        .then((texture) => {
          if (!texture || token !== this.applyToken || !group.parent) {
            return;
          }
          imageMaterial.map = texture;
          imageMaterial.color.set("#ffffff");
          imageMaterial.needsUpdate = true;
        })
        .catch(() => {});
    }

    const shelf = new THREE.Mesh(
      new THREE.BoxGeometry(cardWidth + 0.28, 0.11, 0.46),
      new MaterialCtor(
        basicMode
          ? {
              color: accent.clone().multiplyScalar(0.26)
            }
          : {
              color: accent.clone().multiplyScalar(0.26),
              roughness: 0.83,
              metalness: 0.08
            }
      )
    );
    shelf.position.set(0, -cardHeight * 0.5 - 0.2, 0.17);
    group.add(shelf);

    const priceLine =
      item.price != null && Number.isFinite(item.price)
        ? `${item.currency || "USD"} ${item.price.toFixed(2)}`
        : isScreeningRoom
          ? ""
        : roomId === "shop"
          ? "Open In Shop"
          : "Open Project";
    const labelPlane = makeLabelPlane(
      [trimTitle(item.title || "Item", 22), trimTitle(priceLine, 20)],
      [2.1, 0.66]
    );
    if (labelPlane) {
      labelPlane.position.set(0, -cardHeight * 0.5 - 0.58, 0.3);
      group.add(labelPlane);
    }

    if (isLatestVideoCard) {
      const latestBadge = makeLabelPlane(["Latest"], [0.92, 0.28], {
        width: 384,
        height: 120,
        background: "rgba(255, 240, 247, 0.96)",
        border: "rgba(255, 173, 206, 0.96)",
        primaryColor: "#ff6da4"
      });
      if (latestBadge) {
        latestBadge.position.set(cardWidth * 0.22, cardHeight * 0.5 - 0.16, 0.1);
        latestBadge.renderOrder = 4;
        group.add(latestBadge);
      }
    }

    const hitbox = new THREE.Mesh(
      new THREE.PlaneGeometry(cardWidth + 0.2, cardHeight + 0.24),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    hitbox.position.z = 0.2;
    group.add(hitbox);

    let hovered = false;
    const hoverColor = cardAccent.clone().lerp(new THREE.Color("#ffffff"), 0.24);
    const baseGlowOpacity = glowPanel ? Number(glowPanel.material?.opacity) || 0 : 0;
    const hoverGlowOpacity = isLatestVideoCard
      ? (basicMode ? 0.42 : 0.62)
      : basicMode
        ? 0.3
        : 0.5;
    const itemId = item.id || videoId || `${roomId}-${index}`;
    const interaction = isScreeningRoom
      ? {
          type: "screen-video",
          roomId,
          itemId,
          videoId,
          url: item.url || "",
          title: item.title || "",
          image: item.image || ""
        }
      : null;

    const target = {
      id: `${roomId}-${item.id || index}`,
      label: trimTitle(item.title || "Item", 32),
      url: isScreeningRoom ? "" : item.url || this.getDefaultRoomUrl(roomId),
      interaction,
      hitbox,
      userData: { roomId, roomIndex: roomNode.index, itemId, isLatestVideo: isLatestVideoCard },
      setHovered: (state) => {
        hovered = Boolean(state);
        if (!basicMode && "emissiveIntensity" in frameMaterial) {
          frameMaterial.emissiveIntensity = hovered ? 0.52 : isLatestVideoCard ? 0.2 : 0.12;
        }
        frameMaterial.color.copy(hovered ? hoverColor : restFrameColor);
        frame.scale.setScalar(hovered ? 1.05 : 1);
        if (glowPanel) {
          glowPanel.material.opacity = hovered ? hoverGlowOpacity : baseGlowOpacity;
        }
      }
    };

    this.targets.push(target);
    this.setTargetVisibility(target, true);
    this.dynamicCards.push({
      roomId,
      roomIndex: roomNode.index,
      itemId,
      isLatestVideo: isLatestVideoCard,
      group,
      target,
      baseY: placement.position[1],
      baseRotationY,
      phase: Math.random() * Math.PI * 2,
      floatEnabled: this.getQualityProfileValue("catalogCardFloat", true) !== false,
      isHovered: () => hovered
    });
    return true;
  }

  getThemeSpec(themeName) {
    const specs = this.catalogConfig.themeContent || {};
    return specs[themeName] || specs.default || {};
  }

  async buildRoomCards(roomId, themeSpec, token) {
    this.clearRoomCards(roomId);

    const { roomConfig, items } = this.resolveRoomItems(roomId, themeSpec);

    if (!items.length) {
      // Keep a single room shell, but render no fallback cards when feed is empty.
      this.reconcileRoomCount(roomId, roomConfig, 1);
      await this.syncPresentationWall(roomId);
      this.syncPlaylistWall(roomId);
      return;
    }

    const roomCount = this.computeRequiredRoomCount(roomId, roomConfig, items.length);
    this.reconcileRoomCount(roomId, roomConfig, roomCount);

    const nodes = this.getRoomNodes(roomId).sort((a, b) => a.index - b.index);
    const slotPool = this.buildSlotPool(roomId, nodes, roomConfig, items.length);
    const featuredItem = roomId === SCREENING_ROOM_ID ? resolveFeaturedVideoItem(items) : null;

    for (let index = 0; index < items.length; index += 1) {
      if (token !== this.applyToken) {
        return;
      }
      const slot = slotPool[index];
      if (!slot) {
        break;
      }
      // Sequential creation avoids burst texture requests on first load.
      const created = await this.createCard(
        roomId,
        slot.roomNode,
        items[index],
        slot,
        index,
        token,
        { featuredItem }
      );
      if (!created && token !== this.applyToken) {
        return;
      }
    }

    await this.syncPresentationWall(roomId);
    this.syncPlaylistWall(roomId);
  }

  resolveRoomItems(roomId, themeSpec) {
    const sourceItems = this.getRoomItems(roomId);
    const roomConfig = this.catalogConfig.rooms?.[roomId] || {};
    const roomFilter = {
      ...(themeSpec?.[roomId] || {}),
      ...(isObject(roomConfig.filter) ? roomConfig.filter : {})
    };
    if (roomConfig.allowEmpty === true) {
      roomFilter.allowEmpty = true;
    }
    const maxItems = roomConfig.layout?.maxItems || sourceItems.length || 1;
    return {
      roomConfig,
      items: filterItems(sourceItems, roomFilter, maxItems)
    };
  }

  async initialize(themeName) {
    if (!this.enabled) {
      return;
    }

    await this.applyTheme(themeName || "default");
  }

  async applyTheme(themeName) {
    if (!this.enabled) {
      return;
    }

    const nextThemeName = themeName || "default";
    const themeChanged = this.activeThemeName !== nextThemeName;
    this.activeThemeName = nextThemeName;
    const token = ++this.applyToken;
    const themeSpec = this.getThemeSpec(this.activeThemeName);
    const roomIds = this.getConfiguredRoomIds();
    const activeRoomIds = new Set(roomIds);
    if (themeChanged) {
      for (const existingRoomId of [...this.roomNodes.keys()]) {
        this.removeRoom(existingRoomId);
      }
    }
    for (const existingRoomId of [...this.roomNodes.keys()]) {
      if (!activeRoomIds.has(existingRoomId)) {
        this.removeRoom(existingRoomId);
      }
    }
    const roomPlans = roomIds.map((roomId) => {
      const { roomConfig, items } = this.resolveRoomItems(roomId, themeSpec);
      const required = items.length
        ? this.computeRequiredRoomCount(roomId, roomConfig, items.length)
        : 1;
      return {
        roomId,
        roomConfig,
        required
      };
    });
    for (const roomPlan of roomPlans) {
      this.reconcileRoomCount(roomPlan.roomId, roomPlan.roomConfig, roomPlan.required);
    }
    for (const roomId of roomIds) {
      await this.buildRoomCards(roomId, themeSpec, token);
      if (token !== this.applyToken) {
        return;
      }
    }
  }

  update(deltaTime, elapsedTime, activeCamera = null) {
    const visibilityUpdateInterval = Math.max(
      0.04,
      Number(this.getQualityProfileValue("visibilityUpdateInterval", 0.12)) || 0.12
    );
    const managedVisibility = this.getQualityProfileValue("managedVisibility", true) !== false;
    const directionalVisibility = this.getQualityProfileValue("directionalVisibility", true) !== false;

    if (activeCamera && managedVisibility) {
      if (this.lastVisibilityUpdateAt < 0 || elapsedTime - this.lastVisibilityUpdateAt >= visibilityUpdateInterval) {
        this.lastVisibilityUpdateAt = elapsedTime;
        activeCamera.getWorldPosition(this.cameraWorldPosition);
        activeCamera.getWorldDirection(this.cameraForward).normalize();

        for (const entry of this.dynamicCards) {
          entry.group.getWorldPosition(this.cardWorldPosition);
          const dx = this.cardWorldPosition.x - this.cameraWorldPosition.x;
          const dy = this.cardWorldPosition.y - this.cameraWorldPosition.y;
          const dz = this.cardWorldPosition.z - this.cameraWorldPosition.z;
          const distanceSq = dx * dx + dy * dy + dz * dz;
          const wasVisible = entry.group.visible !== false;
          let visible = distanceSq <= (wasVisible ? 12.25 * 12.25 : 10.5 * 10.5);

          if (!visible && distanceSq <= 40 * 40) {
            if (!directionalVisibility) {
              visible = distanceSq <= (wasVisible ? 22 * 22 : 18 * 18);
            } else {
              this.cardDirection
                .set(dx, dy, dz)
                .normalize();
              visible =
                distanceSq <= 18 * 18 ||
                this.cardDirection.dot(this.cameraForward) >= (wasVisible ? -0.32 : -0.16);
            }
          }

          entry.group.visible = visible;
          this.setTargetVisibility(entry.target, visible);
        }
      }
    } else if (!managedVisibility) {
      for (const entry of this.dynamicCards) {
        entry.group.visible = true;
        this.setTargetVisibility(entry.target, true);
      }
    }

    for (const entry of this.dynamicCards) {
      if (!entry.group.visible && !entry.isHovered()) {
        continue;
      }
      if (!entry.isHovered() && !entry.floatEnabled) {
        continue;
      }
      entry.group.rotation.set(0, entry.baseRotationY, 0);
      const lift = entry.isHovered() ? 0.06 : 0;
      const bob = entry.floatEnabled ? Math.sin(elapsedTime * 1.5 + entry.phase) * 0.025 : 0;
      entry.group.position.y = entry.baseY + bob + lift;
      const desiredScale = entry.isHovered() ? 1.04 : 1;
      const current = entry.group.scale.x;
      const next = THREE.MathUtils.damp(current, desiredScale, 8, deltaTime);
      entry.group.scale.set(next, next, next);
    }

    if (!activeCamera) {
      return;
    }

    for (const [roomId, state] of this.presentationStateByRoom.entries()) {
      if (!state?.active) {
        continue;
      }
      this.updatePresentationOverlay(roomId, activeCamera);
    }
    for (const roomId of this.playlistWalls.keys()) {
      this.updatePlaylistOverlay(roomId, activeCamera);
    }
  }

  dispose() {
    for (const roomId of this.presentationOverlays.keys()) {
      this.removePresentationOverlay(roomId);
    }
    for (const roomId of this.playlistOverlays.keys()) {
      this.removePlaylistOverlay(roomId);
    }
    this.presentationWalls.clear();
    this.presentationStateByRoom.clear();
    this.playlistWalls.clear();
    this.presentationLayer?.remove?.();
    this.presentationLayer = null;
    disposeObjectResources(this.root);
    this.root.clear();
    this.scene.remove(this.root);
    this.targets.length = 0;
    this.dynamicCards.length = 0;
    this.colliders.length = 0;
    this.roomNodes.clear();
    this.roomShellSignatures.clear();
  }
}
