import * as THREE from "three";

const SHOP_LINK = "https://seperet.com/shop";
const PROJECTS_LINK = "https://github.com/denv3rr";

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

function normalizeItems(feed) {
  return Array.isArray(feed?.items) ? feed.items : [];
}

function trimTitle(title, max = 26) {
  const clean = String(title || "").trim();
  if (!clean) {
    return "Untitled";
  }
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
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
    ctx.fillStyle = index === 0 ? "#f2f5f4" : "#b9d0ce";
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

function normalizeFilter(filter = {}) {
  return {
    itemIds: Array.isArray(filter.itemIds) ? filter.itemIds : [],
    tagsAny: Array.isArray(filter.tagsAny) ? filter.tagsAny : []
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

  if (!selected.length) {
    selected = safeItems;
  }

  const limit = Number.isFinite(maxItems) && maxItems > 0 ? maxItems : 6;
  return selected.slice(0, limit);
}

export class CatalogRoomSystem {
  constructor({ scene, cache, catalogConfig, shopFeed, projectsFeed, domElement }) {
    this.scene = scene;
    this.cache = cache;
    this.catalogConfig = catalogConfig || {};
    this.shopItems = normalizeItems(shopFeed);
    this.projectItems = normalizeItems(projectsFeed);
    this.domElement = domElement || window;
    this.root = new THREE.Group();
    this.root.name = "CatalogRooms";
    this.scene.add(this.root);

    this.enabled = this.catalogConfig.enabled !== false;
    this.roomNodes = new Map(); // roomId -> roomNode[]
    this.targets = [];
    this.dynamicCards = [];
    this.colliders = [];
    this.applyToken = 0;
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

  clearRoomCards(roomId) {
    for (const roomNode of this.getRoomNodes(roomId)) {
      disposeObjectResources(roomNode.cardsGroup);
      roomNode.cardsGroup.clear();
    }

    this.targets = this.targets.filter((target) => target.userData?.roomId !== roomId);
    this.dynamicCards = this.dynamicCards.filter((entry) => entry.roomId !== roomId);
  }

  removeRoomsByIndex(roomId, minIndexInclusive) {
    const nodes = this.getRoomNodes(roomId);
    if (!nodes.length) {
      return;
    }
    const kept = [];
    for (const node of nodes) {
      if (node.index < minIndexInclusive) {
        kept.push(node);
        continue;
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

  addCollider(roomId, roomIndex, centerX, centerZ, sizeX, sizeZ, minY, maxY) {
    this.colliders.push({
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

  createWallPanel(
    roomGroup,
    geometryArgs,
    material,
    position,
    rotationY,
    doorway = null
  ) {
    const [panelWidth, panelHeight] = geometryArgs;
    if (!doorway) {
      const full = new THREE.Mesh(
        new THREE.PlaneGeometry(panelWidth, panelHeight),
        material
      );
      full.position.copy(position);
      full.rotation.y = rotationY;
      roomGroup.add(full);
      return;
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

    const left = new THREE.Mesh(
      new THREE.PlaneGeometry(sideSegment, openingHeight),
      material
    );
    left.position.copy(position);
    left.position.x += Math.cos(rotationY) * (openingWidth * 0.5 + sideSegment * 0.5);
    left.position.z += Math.sin(rotationY) * (openingWidth * 0.5 + sideSegment * 0.5);
    left.rotation.y = rotationY;
    roomGroup.add(left);

    const right = new THREE.Mesh(
      new THREE.PlaneGeometry(sideSegment, openingHeight),
      material
    );
    right.position.copy(position);
    right.position.x -= Math.cos(rotationY) * (openingWidth * 0.5 + sideSegment * 0.5);
    right.position.z -= Math.sin(rotationY) * (openingWidth * 0.5 + sideSegment * 0.5);
    right.rotation.y = rotationY;
    roomGroup.add(right);
  }

  createRoomShell(roomId, config, roomIndex, totalRooms) {
    const group = new THREE.Group();
    group.name = `${roomId}Room_${roomIndex + 1}`;

    const size = config.size || [8, 4.6, 9.6];
    const [width, height, depth] = size;
    const wallThickness = 0.42;
    const origin = config.origin || [0, 0, 0];
    const step = Array.isArray(config.expansion?.step)
      ? config.expansion.step
      : [0, 0, -(depth + 2.2)];
    group.position.set(
      (origin[0] || 0) + (step[0] || 0) * roomIndex,
      (origin[1] || 0) + (step[1] || 0) * roomIndex,
      (origin[2] || 0) + (step[2] || 0) * roomIndex
    );

    const accent = toColor(config.accentColor, roomId === "shop" ? "#8ec8d3" : "#ba9de2");
    const titleColor = toColor(config.titleColor, "#f5f5f0");
    const wallColor = accent.clone().multiplyScalar(0.24);
    const trimColor = accent.clone().multiplyScalar(0.55);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({
        color: wallColor.clone().offsetHSL(0, 0, -0.07),
        roughness: 0.92,
        metalness: 0.03
      })
    );
    floor.rotation.x = -Math.PI * 0.5;
    floor.receiveShadow = true;
    group.add(floor);

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({
        color: wallColor.clone().offsetHSL(0, 0, 0.06),
        roughness: 0.93,
        metalness: 0.02
      })
    );
    ceiling.rotation.x = Math.PI * 0.5;
    ceiling.position.y = height;
    group.add(ceiling);

    const wallMaterial = new THREE.MeshStandardMaterial({
      color: wallColor,
      roughness: 0.88,
      metalness: 0.08
    });

    const outerWall = new THREE.Mesh(
      new THREE.PlaneGeometry(depth, height),
      new THREE.MeshStandardMaterial({
        color: wallColor.clone().offsetHSL(0, 0, -0.03),
        roughness: 0.9,
        metalness: 0.04
      })
    );
    outerWall.rotation.y = roomId === "shop" ? Math.PI * 0.5 : -Math.PI * 0.5;
    outerWall.position.set(roomId === "shop" ? -width * 0.5 : width * 0.5, height * 0.5, 0);
    group.add(outerWall);
    this.addCollider(
      roomId,
      roomIndex,
      group.position.x + (roomId === "shop" ? -width * 0.5 : width * 0.5),
      group.position.z,
      wallThickness,
      depth,
      group.position.y + 0.02,
      group.position.y + height - 0.04
    );

    const connectorDoor = {
      width: clamp(config.connectorDoor?.width ?? 2.4, 1.4, width - 1),
      height: clamp(config.connectorDoor?.height ?? 3, 2, height - 0.4)
    };
    const needsFrontConnector = roomIndex > 0;
    const needsBackConnector = roomIndex < totalRooms - 1;

    this.createWallPanel(
      group,
      [width, height],
      wallMaterial,
      new THREE.Vector3(0, height * 0.5, -depth * 0.5),
      0,
      needsBackConnector ? connectorDoor : null
    );
    this.createWallPanel(
      group,
      [width, height],
      wallMaterial,
      new THREE.Vector3(0, height * 0.5, depth * 0.5),
      Math.PI,
      needsFrontConnector ? connectorDoor : null
    );

    const addDepthWallColliders = (zLocal, hasDoor) => {
      const minY = group.position.y + 0.02;
      const maxY = group.position.y + connectorDoor.height;
      const worldZ = group.position.z + zLocal;
      if (!hasDoor) {
        this.addCollider(
          roomId,
          roomIndex,
          group.position.x,
          worldZ,
          width,
          wallThickness,
          minY,
          maxY
        );
        return;
      }

      const segmentWidth = Math.max(0.18, (width - connectorDoor.width) * 0.5);
      const leftCenter = -connectorDoor.width * 0.5 - segmentWidth * 0.5;
      const rightCenter = connectorDoor.width * 0.5 + segmentWidth * 0.5;
      this.addCollider(
        roomId,
        roomIndex,
        group.position.x + leftCenter,
        worldZ,
        segmentWidth,
        wallThickness,
        minY,
        maxY
      );
      this.addCollider(
        roomId,
        roomIndex,
        group.position.x + rightCenter,
        worldZ,
        segmentWidth,
        wallThickness,
        minY,
        maxY
      );
    };
    addDepthWallColliders(-depth * 0.5, needsBackConnector);
    addDepthWallColliders(depth * 0.5, needsFrontConnector);

    const entranceFrameMaterial = new THREE.MeshStandardMaterial({
      color: trimColor,
      roughness: 0.58,
      metalness: 0.18,
      emissive: accent,
      emissiveIntensity: 0.14
    });
    const frameDepth = 0.24;
    const frameHeight = clamp(height * 0.86, 2.9, 4.2);
    const frameWidth = clamp(width * 0.58, 2.4, 4.1);
    const frameCenterX = roomId === "shop" ? width * 0.5 - 0.18 : -width * 0.5 + 0.18;
    const frameDirection = roomId === "shop" ? 1 : -1;

    const frameTop = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.2, frameWidth),
      entranceFrameMaterial
    );
    frameTop.position.set(frameCenterX, frameHeight, 0);
    group.add(frameTop);

    const framePillar = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, frameHeight, frameDepth),
      entranceFrameMaterial
    );
    framePillar.position.set(frameCenterX, frameHeight * 0.5, frameWidth * 0.5 - frameDepth * 0.5);
    group.add(framePillar);
    const secondPillar = framePillar.clone();
    secondPillar.position.z = -(frameWidth * 0.5 - frameDepth * 0.5);
    group.add(secondPillar);

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
      title.rotation.set(0, roomId === "shop" ? Math.PI * 0.5 : -Math.PI * 0.5, 0);
      group.add(title);
    }

    const accentLight = new THREE.PointLight(
      accent,
      0.45,
      8
    );
    accentLight.position.set(frameCenterX + frameDirection * 0.55, height - 0.6, 0);
    group.add(accentLight);

    const cardsGroup = new THREE.Group();
    cardsGroup.name = `${roomId}Cards`;
    group.add(cardsGroup);

    this.root.add(group);
    const node = {
      index: roomIndex,
      group,
      cardsGroup,
      config: {
        ...config,
        size,
        _derived: {
          cardOffset: config.layout?.cardOffset ?? 0.08
        }
      }
    };
    const nodes = this.getRoomNodes(roomId);
    nodes.push(node);
    this.roomNodes.set(roomId, nodes);
    return node;
  }

  computeWallSlots(roomId, roomNode) {
    const roomConfig = roomNode.config;
    const [width, height, depth] = roomConfig.size || [8.6, 4.6, 9.6];
    const layout = roomConfig.layout || {};
    const cardWidth = roomConfig.card?.width || 1.45;
    const horizontalGap = layout.horizontalGap ?? 0.42;
    const wallMargin = layout.wallMargin ?? 0.7;
    const y = layout.displayY ?? clamp(height * 0.56, 2.2, 2.9);
    const offset = roomConfig._derived?.cardOffset ?? 0.08;

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

    const walls = [];
    const backLine = buildLine(width);
    for (const x of backLine) {
      walls.push({
        wall: "back",
        position: [x, y, -depth * 0.5 + offset],
        rotationY: 0
      });
    }
    const outerLine = buildLine(depth);
    for (const z of outerLine) {
      walls.push({
        wall: "outer",
        position: [roomId === "shop" ? -width * 0.5 + offset : width * 0.5 - offset, y, z],
        rotationY: roomId === "shop" ? Math.PI * 0.5 : -Math.PI * 0.5
      });
    }
    const frontLine = buildLine(width);
    for (const x of frontLine) {
      walls.push({
        wall: "front",
        position: [x, y, depth * 0.5 - offset],
        rotationY: Math.PI
      });
    }
    return walls;
  }

  computeRoomCapacity(roomId, config) {
    const tempNode = {
      config: {
        ...config,
        _derived: {
          cardOffset: config.layout?.cardOffset ?? 0.08
        }
      }
    };
    return this.computeWallSlots(roomId, tempNode).length;
  }

  reconcileRoomCount(roomId, config, required) {
    this.colliders = this.colliders.filter((entry) => entry.roomId !== roomId);
    const current = this.getRoomNodes(roomId);
    if (current.length > required) {
      this.removeRoomsByIndex(roomId, required);
    }
    const refreshed = this.getRoomNodes(roomId);
    for (let index = refreshed.length; index < required; index += 1) {
      this.createRoomShell(roomId, config, index, required);
    }

    // Rebuild connectors if room count changed.
    const finalNodes = this.getRoomNodes(roomId);
    for (const node of finalNodes) {
      disposeObjectResources(node.group);
      this.root.remove(node.group);
      node.group.clear();
    }
    this.roomNodes.set(roomId, []);
    for (let index = 0; index < required; index += 1) {
      this.createRoomShell(roomId, config, index, required);
    }
  }

  async createCard(roomId, roomNode, item, placement, index, token) {
    const roomConfig = roomNode.config;
    const cardWidth = roomConfig.card?.width || 1.45;
    const cardHeight = roomConfig.card?.height || 1.9;

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
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: accent.clone().multiplyScalar(0.44),
      roughness: 0.45,
      metalness: 0.28,
      emissive: accent,
      emissiveIntensity: 0.12
    });
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(cardWidth + 0.14, cardHeight + 0.14, 0.12),
      frameMaterial
    );
    frame.castShadow = false;
    frame.receiveShadow = false;
    group.add(frame);

    const imageMaterial = new THREE.MeshStandardMaterial({
      color: "#d8dbdf",
      roughness: 0.4,
      metalness: 0.06
    });
    const imagePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(cardWidth, cardHeight),
      imageMaterial
    );
    imagePlane.position.z = 0.07;
    group.add(imagePlane);

    const glowPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(cardWidth + 0.5, cardHeight + 0.5),
      new THREE.MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0.34,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    glowPanel.position.z = 0.02;
    glowPanel.renderOrder = 2;
    group.add(glowPanel);

    if (index < 28) {
      const glowLight = new THREE.PointLight(accent, 0.42, 3.8);
      glowLight.position.set(0, 0.08, 0.44);
      glowLight.userData.canCastShadow = false;
      group.add(glowLight);
    }

    if (item.image) {
      const texture = await this.cache.loadTexture(item.image);
      if (token !== this.applyToken) {
        cleanupCard();
        return false;
      }
      if (texture) {
        imageMaterial.map = texture;
        imageMaterial.color.set("#ffffff");
        imageMaterial.needsUpdate = true;
      }
    }

    const shelf = new THREE.Mesh(
      new THREE.BoxGeometry(cardWidth + 0.28, 0.11, 0.46),
      new THREE.MeshStandardMaterial({
        color: accent.clone().multiplyScalar(0.26),
        roughness: 0.83,
        metalness: 0.08
      })
    );
    shelf.position.set(0, -cardHeight * 0.5 - 0.2, 0.17);
    group.add(shelf);

    const priceLine =
      item.price != null && Number.isFinite(item.price)
        ? `${item.currency || "USD"} ${item.price.toFixed(2)}`
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
    const hoverColor = accent.clone().lerp(new THREE.Color("#ffffff"), 0.24);

    const target = {
      id: `${roomId}-${item.id || index}`,
      label: trimTitle(item.title || "Item", 32),
      url: item.url || (roomId === "shop" ? SHOP_LINK : PROJECTS_LINK),
      hitbox,
      userData: { roomId, roomIndex: roomNode.index },
      setHovered: (state) => {
        hovered = Boolean(state);
        frameMaterial.emissiveIntensity = hovered ? 0.52 : 0.12;
        frameMaterial.color.copy(hovered ? hoverColor : accent.clone().multiplyScalar(0.44));
        frame.scale.setScalar(hovered ? 1.05 : 1);
      }
    };

    this.targets.push(target);
    this.dynamicCards.push({
      roomId,
      roomIndex: roomNode.index,
      group,
      baseY: placement.position[1],
      baseRotationY,
      phase: Math.random() * Math.PI * 2,
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

    const sourceItems = roomId === "shop" ? this.shopItems : this.projectItems;
    const roomFilter = themeSpec?.[roomId] || {};
    const roomConfig = this.catalogConfig.rooms?.[roomId] || {};
    const maxItems = roomConfig.layout?.maxItems || sourceItems.length || 1;
    const filtered = filterItems(sourceItems, roomFilter, maxItems);
    const items = filtered;

    if (!items.length) {
      // Keep a single room shell, but render no fallback cards when feed is empty.
      this.reconcileRoomCount(roomId, roomConfig, 1);
      return;
    }

    const capacity = this.computeRoomCapacity(roomId, roomConfig);
    const safeCapacity = Math.max(1, capacity);
    const roomCount = Math.max(1, Math.ceil(items.length / safeCapacity));
    this.reconcileRoomCount(roomId, roomConfig, roomCount);

    const nodes = this.getRoomNodes(roomId).sort((a, b) => a.index - b.index);
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

    for (let index = 0; index < items.length; index += 1) {
      if (token !== this.applyToken) {
        return;
      }
      const slot = slotPool[index];
      if (!slot) {
        break;
      }
      // Sequential creation avoids burst texture requests on first load.
      const created = await this.createCard(roomId, slot.roomNode, items[index], slot, index, token);
      if (!created && token !== this.applyToken) {
        return;
      }
    }
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

    const token = ++this.applyToken;
    const themeSpec = this.getThemeSpec(themeName || "default");
    await this.buildRoomCards("shop", themeSpec, token);
    if (token !== this.applyToken) {
      return;
    }
    await this.buildRoomCards("projects", themeSpec, token);
  }

  update(deltaTime, elapsedTime) {
    for (const entry of this.dynamicCards) {
      entry.group.rotation.set(0, entry.baseRotationY, 0);
      const lift = entry.isHovered() ? 0.06 : 0;
      entry.group.position.y =
        entry.baseY + Math.sin(elapsedTime * 1.5 + entry.phase) * 0.025 + lift;
      const desiredScale = entry.isHovered() ? 1.04 : 1;
      const current = entry.group.scale.x;
      const next = THREE.MathUtils.damp(current, desiredScale, 8, deltaTime);
      entry.group.scale.set(next, next, next);
    }
  }

  dispose() {
    disposeObjectResources(this.root);
    this.root.clear();
    this.scene.remove(this.root);
    this.targets.length = 0;
    this.dynamicCards.length = 0;
    this.colliders.length = 0;
    this.roomNodes.clear();
  }
}
