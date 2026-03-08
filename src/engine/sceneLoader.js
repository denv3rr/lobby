import * as THREE from "three";
import { createProceduralTexture } from "./proceduralTextures.js";

function degToRad(value = 0) {
  return THREE.MathUtils.degToRad(value);
}

function toVector3(values = [0, 0, 0]) {
  return new THREE.Vector3(values[0] || 0, values[1] || 0, values[2] || 0);
}

function cloneMaterialConfig(config = {}) {
  return {
    color: config.color,
    texture: config.texture,
    textureRepeat: config.textureRepeat
  };
}

function cloneConfig(config = {}) {
  return JSON.parse(JSON.stringify(config || {}));
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function disposeManagedMaterial(material) {
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

function disposeManagedObjectResources(object) {
  if (!object) {
    return;
  }

  object.traverse((child) => {
    if (!child?.userData?.disposeManagedResources) {
      return;
    }
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      for (const material of child.material) {
        disposeManagedMaterial(material);
      }
    } else {
      disposeManagedMaterial(child.material);
    }
  });
}

async function applyMaterialConfig(material, config = {}, cache) {
  const color = config.color || "#777777";
  material.color.set(color);
  material.map = null;

  if (config.texture) {
    const texture = await cache.loadTexture(config.texture);
    if (texture) {
      if (Array.isArray(config.textureRepeat)) {
        texture.repeat.set(config.textureRepeat[0] || 1, config.textureRepeat[1] || 1);
      }
      material.map = texture;
      material.needsUpdate = true;
    }
  }
}

async function resolveTexture(config = {}, cache) {
  if (config.procedural) {
    const texture = createProceduralTexture(config.procedural);
    if (texture) {
      texture.userData = texture.userData || {};
      texture.userData.disposeWithMaterial = true;
    }
    return texture;
  }
  if (config.texture) {
    return cache.loadTexture(config.texture);
  }
  return null;
}

function setTextureRepeat(texture, repeat) {
  if (!texture || !Array.isArray(repeat)) {
    return;
  }
  texture.repeat.set(repeat[0] || 1, repeat[1] || 1);
}

async function applyPrimitiveMaterial(meshMaterial, materialConfig, cache, animatedTextures, owner) {
  const config = materialConfig || {};
  const emissiveBoost = config.emissiveBoost ?? 1.35;
  meshMaterial.color.set(config.color || "#6c655a");
  meshMaterial.roughness = config.roughness ?? 0.9;
  meshMaterial.metalness = config.metalness ?? 0.05;
  meshMaterial.emissive.set(config.emissiveColor || "#000000");
  meshMaterial.emissiveIntensity = (config.emissiveIntensity ?? 0) * emissiveBoost;
  meshMaterial.opacity = config.opacity ?? 1;
  meshMaterial.transparent = Boolean(config.transparent || meshMaterial.opacity < 1);
  meshMaterial.side = config.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
  meshMaterial.map = null;
  meshMaterial.emissiveMap = null;

  const mapTexture = await resolveTexture(config, cache);
  if (mapTexture) {
    setTextureRepeat(mapTexture, config.textureRepeat);
    meshMaterial.map = mapTexture;
  }

  if (config.emissiveMap === "$map" && mapTexture) {
    meshMaterial.emissiveMap = mapTexture;
  } else if (config.emissiveMap) {
    const emissiveTexture = await cache.loadTexture(config.emissiveMap);
    if (emissiveTexture) {
      setTextureRepeat(emissiveTexture, config.textureRepeat);
      meshMaterial.emissiveMap = emissiveTexture;
    }
  }

  if (Array.isArray(config.textureScroll) && mapTexture) {
    animatedTextures.push({
      texture: mapTexture,
      scrollX: config.textureScroll[0] || 0,
      scrollY: config.textureScroll[1] || 0,
      animatedImage: Boolean(config.animatedTexture),
      owner
    });
  } else if (config.animatedTexture && mapTexture) {
    animatedTextures.push({
      texture: mapTexture,
      scrollX: 0,
      scrollY: 0,
      animatedImage: true,
      owner
    });
  }

  meshMaterial.needsUpdate = true;
}

function makeLabelSprite(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(12, 12, 10, 0.72)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(195, 210, 212, 0.9)";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
  ctx.fillStyle = "#f1f3ea";
  ctx.font = "700 54px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width * 0.5, canvas.height * 0.5);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.4, 0.85, 1);
  return sprite;
}

function toColor(value, fallback) {
  try {
    return new THREE.Color(value || fallback);
  } catch {
    return new THREE.Color(fallback);
  }
}

function readText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed || fallback;
}

function normalizeModuleIds(value) {
  const source = Array.isArray(value) ? value : [value];
  const seen = new Set();
  const ids = [];
  for (const entry of source) {
    const normalized = readText(entry, "");
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    ids.push(normalized);
  }
  return ids;
}

function normalizeInteractableAction(action = {}) {
  const label = readText(action?.label, "Open");
  const url = readText(action?.url, "");
  const secretId = readText(action?.secretId, "");
  const position = Array.isArray(action?.position)
    ? action.position.slice(0, 3).map((value) => Number(value) || 0)
    : null;
  const hasSteps = Array.isArray(action?.steps) && action.steps.length > 0;
  const type = readText(
    action?.type,
    hasSteps ? "sequence" : url ? "url" : secretId ? "unlock-secret" : position ? "teleport" : ""
  ).toLowerCase();
  return {
    label,
    type,
    url,
    theme: readText(action?.theme, ""),
    secretId,
    portalId: readText(action?.portalId, ""),
    message: readText(action?.message, readText(action?.prompt, "")),
    moduleIds: normalizeModuleIds(action?.moduleIds || action?.moduleId || action?.modules),
    position,
    yaw: Number.isFinite(action?.yaw) ? action.yaw : null,
    pitch: Number.isFinite(action?.pitch) ? action.pitch : null,
    steps: Array.isArray(action?.steps) ? cloneConfig(action.steps) : null,
    closeOnRun: action?.closeOnRun !== false
  };
}

async function createPrimitiveMesh(prop, cache, animatedTextures, owner) {
  const primitive = prop.primitive || "box";
  let geometry = null;

  if (primitive === "sphere") {
    geometry = new THREE.SphereGeometry(0.5, 20, 20);
  } else if (primitive === "cylinder") {
    geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 18);
  } else if (primitive === "plane") {
    geometry = new THREE.PlaneGeometry(1, 1);
  } else if (primitive === "torus") {
    geometry = new THREE.TorusGeometry(0.45, 0.18, 14, 30);
  } else {
    geometry = new THREE.BoxGeometry(1, 1, 1);
  }

  const material = new THREE.MeshStandardMaterial({
    color: prop.material?.color || "#6c655a",
    roughness: 0.9,
    metalness: 0.05
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.disposeManagedResources = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  await applyPrimitiveMaterial(material, prop.material, cache, animatedTextures, owner);
  return mesh;
}

function normalizeModelFallbackConfig(prop = {}) {
  const fallback = prop?.modelFallback;
  if (!fallback || fallback === false) {
    return null;
  }

  if (typeof fallback === "string") {
    return {
      type: "primitive",
      primitive: fallback
    };
  }

  if (typeof fallback === "object") {
    return {
      type: "primitive",
      ...fallback
    };
  }

  return null;
}

function createPortal(portalConfig) {
  const group = new THREE.Group();
  const size = portalConfig.size || [2.2, 2.8, 0.45];
  const accent = toColor(portalConfig.color, "#9ecbff");
  const accentDark = accent.clone().multiplyScalar(0.32);
  const coreWidth = Math.max(0.8, size[0] * 0.72);
  const coreHeight = Math.max(1.2, size[1] * 0.74);
  const defaultStyle = {
    color: portalConfig.color || "#9ecbff",
    ringBaseIntensity: 0.28,
    ringHoverBoost: 0.9,
    rimBaseIntensity: 0.56,
    rimHoverBoost: 1.25,
    hazeBaseOpacity: 0.2,
    hazeHoverBoost: 0.2,
    coreBaseOpacity: 0.68,
    coreHoverBoost: 0.17,
    pulseSpeed: 2.4,
    rotationSpeed: 0.18,
    hoverRotationBoost: 0.5,
    waveSpeed: 1.1,
    waveAmplitude: 0.01,
    labelBaseOpacity: 0.9
  };
  let style = { ...defaultStyle };

  const baseMat = new THREE.MeshStandardMaterial({
    color: "#2f2f32",
    roughness: 0.84,
    metalness: 0.22
  });
  const pillarMat = new THREE.MeshStandardMaterial({
    color: "#36363a",
    roughness: 0.72,
    metalness: 0.28
  });
  const ringMat = new THREE.MeshStandardMaterial({
    color: accent.clone().lerp(new THREE.Color("#dbe8ff"), 0.22),
    emissive: accent,
    emissiveIntensity: 0.3,
    roughness: 0.34,
    metalness: 0.58
  });

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(size[0] * 1.18, 0.36, size[2] * 1.35),
    baseMat
  );
  base.position.y = -size[1] * 0.5 - 0.18;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const leftPillar = new THREE.Mesh(
    new THREE.BoxGeometry(size[0] * 0.18, size[1], size[2] * 0.72),
    pillarMat
  );
  leftPillar.position.x = -size[0] * 0.5 + size[0] * 0.09;
  leftPillar.castShadow = true;
  leftPillar.receiveShadow = true;
  group.add(leftPillar);

  const rightPillar = leftPillar.clone();
  rightPillar.position.x = size[0] * 0.5 - size[0] * 0.09;
  group.add(rightPillar);

  const topBeam = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1] * 0.14, size[2] * 0.72),
    pillarMat
  );
  topBeam.position.y = size[1] * 0.5 - size[1] * 0.07;
  topBeam.castShadow = true;
  topBeam.receiveShadow = true;
  group.add(topBeam);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(Math.min(coreWidth, coreHeight) * 0.43, 0.08, 14, 52),
    ringMat
  );
  ring.position.z = size[2] * 0.38;
  ring.scale.set(1.05, coreHeight / coreWidth, 1);
  ring.castShadow = false;
  ring.receiveShadow = false;
  group.add(ring);

  const coreMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      time: { value: Math.random() * 7 },
      colorA: { value: accentDark },
      colorB: { value: accent },
      opacity: { value: 0.72 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float time;
      uniform vec3 colorA;
      uniform vec3 colorB;
      uniform float opacity;

      void main() {
        vec2 p = vUv - 0.5;
        float radial = 1.0 - smoothstep(0.24, 0.78, length(vec2(p.x, p.y * 1.12)));
        float waveA = sin((vUv.y * 20.0) - (time * 2.1) + sin(vUv.x * 8.0 + time * 0.6) * 1.5);
        float waveB = sin((vUv.x * 17.0) + (time * 1.7) + sin(vUv.y * 10.0 - time * 0.3) * 1.2);
        float flow = 0.5 + 0.5 * (waveA * 0.55 + waveB * 0.45);
        vec3 col = mix(colorA, colorB, smoothstep(0.12, 0.92, flow));
        float alpha = opacity * radial * (0.62 + flow * 0.38);
        if (alpha < 0.02) discard;
        gl_FragColor = vec4(col, alpha);
      }
    `
  });
  const core = new THREE.Mesh(new THREE.PlaneGeometry(coreWidth, coreHeight), coreMat);
  core.position.z = size[2] * 0.43;
  group.add(core);

  const haze = new THREE.Mesh(
    new THREE.PlaneGeometry(coreWidth * 0.9, coreHeight * 0.9),
    new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  haze.position.z = size[2] * 0.44;
  group.add(haze);

  const rimLight = new THREE.PointLight(accent, 0.62, 10.2);
  rimLight.position.set(0, size[1] * 0.08, size[2] * 0.45);
  group.add(rimLight);

  const label = makeLabelSprite(portalConfig.label || "Portal");
  label.position.set(0, size[1] * 0.72, size[2] * 0.7);
  group.add(label);

  const position = portalConfig.position || [0, 1.4, -6];
  const rotation = portalConfig.rotation || [0, 0, 0];
  group.position.set(position[0] || 0, position[1] || 0, position[2] || 0);
  group.rotation.set(degToRad(rotation[0]), degToRad(rotation[1]), degToRad(rotation[2]));

  const hitbox = new THREE.Mesh(
    new THREE.PlaneGeometry(coreWidth, coreHeight),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  hitbox.position.z = size[2] * 0.56;
  group.add(hitbox);
  hitbox.userData.portalId = portalConfig.id;
  hitbox.userData.portalUrl = portalConfig.url;
  hitbox.userData.portalLabel = portalConfig.label;

  let hoverTarget = 0;

  function applyStyle(styleOverrides = {}) {
    style = {
      ...defaultStyle,
      ...(styleOverrides || {})
    };

    const styleColor = toColor(style.color, defaultStyle.color);
    accent.copy(styleColor);
    accentDark.copy(styleColor).multiplyScalar(0.32);
    ringMat.color.copy(styleColor).lerp(new THREE.Color("#dbe8ff"), 0.22);
    ringMat.emissive.copy(styleColor);
    coreMat.uniforms.colorA.value.copy(accentDark);
    coreMat.uniforms.colorB.value.copy(accent);
    rimLight.color.copy(styleColor);
    haze.material.color.copy(styleColor);
  }

  function resetStyle() {
    applyStyle(defaultStyle);
  }

  applyStyle(portalConfig.style || {});

  function setHovered(hovered) {
    hoverTarget = hovered ? 1 : 0;
  }

  function update(delta, elapsed) {
    const t = coreMat.uniforms.time.value + delta;
    coreMat.uniforms.time.value = t;
    const pulse = 0.5 + Math.sin(elapsed * style.pulseSpeed) * 0.5;
    const hoverStrength = THREE.MathUtils.damp(
      ringMat.emissiveIntensity,
      style.ringBaseIntensity + hoverTarget * style.ringHoverBoost,
      8,
      delta
    );
    ringMat.emissiveIntensity = hoverStrength;
    rimLight.intensity =
      style.rimBaseIntensity + hoverStrength * style.rimHoverBoost + pulse * 0.18;
    haze.material.opacity =
      style.hazeBaseOpacity + hoverStrength * style.hazeHoverBoost + pulse * 0.05;
    coreMat.uniforms.opacity.value = style.coreBaseOpacity + hoverStrength * style.coreHoverBoost;
    ring.rotation.z += delta * (style.rotationSpeed + hoverStrength * style.hoverRotationBoost);
    core.position.z =
      size[2] * 0.43 + Math.sin(elapsed * style.waveSpeed + size[0]) * style.waveAmplitude;
    label.material.opacity = style.labelBaseOpacity + hoverStrength * 0.1;
  }

  return {
    id: portalConfig.id,
    type: "portal",
    label: portalConfig.label,
    url: portalConfig.url,
    interaction: isObject(portalConfig.interaction) ? cloneConfig(portalConfig.interaction) : null,
    group,
    hitbox,
    setHovered,
    update,
    applyStyle,
    resetStyle
  };
}

function getRoomBounds(size = [30, 8, 30], margin = 1.4, overrideBounds = null) {
  if (overrideBounds && typeof overrideBounds === "object") {
    const minX = Number(overrideBounds.minX);
    const maxX = Number(overrideBounds.maxX);
    const minZ = Number(overrideBounds.minZ);
    const maxZ = Number(overrideBounds.maxZ);
    if (
      Number.isFinite(minX) &&
      Number.isFinite(maxX) &&
      Number.isFinite(minZ) &&
      Number.isFinite(maxZ) &&
      minX < maxX &&
      minZ < maxZ
    ) {
      return { minX, maxX, minZ, maxZ };
    }
  }

  const halfW = (size[0] || 30) * 0.5 - margin;
  const halfD = (size[2] || 30) * 0.5 - margin;
  return {
    minX: -halfW,
    maxX: halfW,
    minZ: -halfD,
    maxZ: halfD
  };
}

function mergeBounds(into, next) {
  if (!into || !next) {
    return into;
  }
  into.minX = Math.min(into.minX, next.minX);
  into.maxX = Math.max(into.maxX, next.maxX);
  into.minZ = Math.min(into.minZ, next.minZ);
  into.maxZ = Math.max(into.maxZ, next.maxZ);
  return into;
}

function boundsOverlap2D(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

function computeCatalogRoomCapacity(config = {}) {
  const size = Array.isArray(config.size) ? config.size : [8.6, 4.6, 9.6];
  const width = Math.max(1, Number(size[0]) || 8.6);
  const depth = Math.max(1, Number(size[2]) || 9.6);
  const layout = isObject(config.layout) ? config.layout : {};
  const card = isObject(config.card) ? config.card : {};
  const cardWidth = Math.max(0.2, Number(card.width) || 1.45);
  const horizontalGap = Math.max(0, Number(layout.horizontalGap) || 0.42);
  const wallMargin = Math.max(0, Number(layout.wallMargin) || 0.72);
  const stride = cardWidth + horizontalGap;

  function lineSlots(length) {
    const usable = Math.max(0, length - wallMargin * 2);
    if (stride <= 0) {
      return 0;
    }
    return Math.max(0, Math.floor((usable + horizontalGap) / stride));
  }

  return lineSlots(width) + lineSlots(depth) + lineSlots(width);
}

function feedItemCount(feed) {
  return Array.isArray(feed?.items) ? feed.items.length : 0;
}

function createProtectedFloorplanZones({
  roomConfig = {},
  roomSize = [30, 8, 30],
  sceneConfig = {},
  catalogConfig = null,
  catalogFeeds = {}
}) {
  const zones = [];
  const width = roomSize[0] || 30;
  const depth = roomSize[2] || 30;
  const floorplanSafety = roomConfig.floorplan?.safety || {};

  const sideDoorways = roomConfig.sideDoorways || {};
  if (sideDoorways.enabled !== false) {
    const doorwayWidth = THREE.MathUtils.clamp(
      sideDoorways.width ?? 3.8,
      1.5,
      Math.max(1.5, depth - 1)
    );
    const zHalf = doorwayWidth * 0.5 + 1.15;
    const outwardDepth = Math.max(3.5, floorplanSafety.sideDoorDepth ?? 6.5);
    for (const centerZ of getSideDoorCenters(sideDoorways, "east", depth, doorwayWidth)) {
      zones.push({
        id: `east-doorway-clearance-${centerZ.toFixed(2)}`,
        minX: width * 0.5 - 0.8,
        maxX: width * 0.5 + outwardDepth,
        minZ: centerZ - zHalf,
        maxZ: centerZ + zHalf
      });
    }
    for (const centerZ of getSideDoorCenters(sideDoorways, "west", depth, doorwayWidth)) {
      zones.push({
        id: `west-doorway-clearance-${centerZ.toFixed(2)}`,
        minX: -width * 0.5 - outwardDepth,
        maxX: -width * 0.5 + 0.8,
        minZ: centerZ - zHalf,
        maxZ: centerZ + zHalf
      });
    }
  }

  const frontEntrance = roomConfig.frontEntrance || {};
  if (frontEntrance.enabled) {
    const doorwayWidth = THREE.MathUtils.clamp(
      frontEntrance.width ?? 4.2,
      1.6,
      Math.max(1.6, width - 1.6)
    );
    const centerX = THREE.MathUtils.clamp(
      frontEntrance.centerX ?? 0,
      -width * 0.5 + doorwayWidth * 0.5 + 0.4,
      width * 0.5 - doorwayWidth * 0.5 - 0.4
    );
    const pathHalfWidth = Math.max(doorwayWidth * 0.5 + 1.2, floorplanSafety.frontPathHalfWidth ?? 3.3);
    const pathStartZ = depth * 0.5 - 0.8;
    const pathDepth = Math.max(12, floorplanSafety.frontPathDepth ?? 24);

    zones.push({
      id: "front-courtyard-path-clearance",
      minX: centerX - pathHalfWidth,
      maxX: centerX + pathHalfWidth,
      minZ: pathStartZ,
      maxZ: pathStartZ + pathDepth
    });
  }

  const protectedZonePattern = /(outdoor|courtyard|front[_-]?yard|plaza)/i;
  const sceneZones = Array.isArray(sceneConfig?.zones) ? sceneConfig.zones : [];
  for (const zone of sceneZones) {
    if (zone?.shape !== "box" || !protectedZonePattern.test(String(zone.id || ""))) {
      continue;
    }
    const [sx, sy, sz] = zone.size || [0, 0, 0];
    const [px, py, pz] = zone.position || [0, 0, 0];
    if (!sx || !sz) {
      continue;
    }
    zones.push({
      id: `zone-${zone.id}`,
      minX: (px || 0) - sx * 0.5,
      maxX: (px || 0) + sx * 0.5,
      minZ: (pz || 0) - sz * 0.5,
      maxZ: (pz || 0) + sz * 0.5
    });
  }

  const catalogRooms = isObject(catalogConfig?.rooms) ? catalogConfig.rooms : {};
  const roomIds = Object.keys(catalogRooms);

  for (const roomId of roomIds) {
    const config = isObject(catalogRooms[roomId]) ? catalogRooms[roomId] : null;
    if (!config) {
      continue;
    }

    const feedSource =
      typeof config.feedSource === "string" && config.feedSource.trim()
        ? config.feedSource.trim()
        : roomId;
    const itemCount = feedItemCount(catalogFeeds?.[feedSource]);
    const size = Array.isArray(config.size) ? config.size : [8.6, 4.6, 9.6];
    const roomWidth = Math.max(1, Number(size[0]) || 8.6);
    const roomDepth = Math.max(1, Number(size[2]) || 9.6);
    const defaultOriginX = roomId === "shop" ? -19.3 : 19.3;
    const origin = Array.isArray(config.origin) ? config.origin : [defaultOriginX, 0, 0];
    const expansionStep = Array.isArray(config.expansion?.step)
      ? config.expansion.step
      : [0, 0, -(roomDepth + 2.2)];
    const maxItems = Number.isFinite(config.layout?.maxItems) && config.layout.maxItems > 0
      ? Math.floor(config.layout.maxItems)
      : itemCount;
    const boundedItems = Math.max(0, Math.min(itemCount, maxItems));
    const capacity = Math.max(1, computeCatalogRoomCapacity(config));
    const roomCount = Math.max(1, Math.ceil(Math.max(1, boundedItems) / capacity));
    const padX = Math.max(0.35, Number(config.protectionPaddingX) || 0.8);
    const padZ = Math.max(0.35, Number(config.protectionPaddingZ) || 0.8);

    for (let index = 0; index < roomCount; index += 1) {
      const centerX = (origin[0] || 0) + (expansionStep[0] || 0) * index;
      const centerZ = (origin[2] || 0) + (expansionStep[2] || 0) * index;
      zones.push({
        id: `catalog-${roomId}-${index + 1}`,
        zoneType: "catalog",
        minX: centerX - roomWidth * 0.5 - padX,
        maxX: centerX + roomWidth * 0.5 + padX,
        minZ: centerZ - roomDepth * 0.5 - padZ,
        maxZ: centerZ + roomDepth * 0.5 + padZ
      });
    }
  }

  return zones.filter(
    (zone) =>
      Number.isFinite(zone.minX) &&
      Number.isFinite(zone.maxX) &&
      Number.isFinite(zone.minZ) &&
      Number.isFinite(zone.maxZ) &&
      zone.minX < zone.maxX &&
      zone.minZ < zone.maxZ
  );
}

function getSideDoorCenters(sideDoorways = {}, side = "east", depth = 30, doorwayWidth = 3.8) {
  const centersBySide = isObject(sideDoorways?.centersBySide) ? sideDoorways.centersBySide : {};
  const configuredCenters = Array.isArray(centersBySide[side]) ? centersBySide[side] : [];
  const fallbackCenters = Array.isArray(sideDoorways?.centers) ? sideDoorways.centers : [];
  const source =
    configuredCenters.length
      ? configuredCenters
      : fallbackCenters.length
        ? fallbackCenters
        : [sideDoorways?.centerZ ?? 0];
  const minCenter = -depth * 0.5 + doorwayWidth * 0.5 + 0.4;
  const maxCenter = depth * 0.5 - doorwayWidth * 0.5 - 0.4;
  const normalized = [];
  for (const value of source) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      continue;
    }
    const clamped = THREE.MathUtils.clamp(numeric, minCenter, maxCenter);
    if (!normalized.some((existing) => Math.abs(existing - clamped) < 0.05)) {
      normalized.push(clamped);
    }
  }
  normalized.sort((a, b) => a - b);
  return normalized.length ? normalized : [0];
}

function deriveCatalogSideDoorways(roomConfig = {}, catalogConfig = null) {
  const sideDoorways = cloneConfig(roomConfig.sideDoorways || {});
  if (sideDoorways.enabled === false) {
    return sideDoorways;
  }

  const catalogRooms = isObject(catalogConfig?.rooms) ? catalogConfig.rooms : {};
  const roomEntries = Object.entries(catalogRooms);
  if (!roomEntries.length) {
    return sideDoorways;
  }

  const roomSize = Array.isArray(roomConfig.size) ? roomConfig.size : [30, 8, 30];
  const depth = Math.max(1, Number(roomSize[2]) || 30);
  const doorwayWidth = THREE.MathUtils.clamp(
    sideDoorways.width ?? 3.8,
    1.5,
    Math.max(1.5, depth - 1)
  );
  const derivedCenters = {
    east: [],
    west: []
  };

  for (const [roomId, config] of roomEntries) {
    if (!isObject(config) || config.enabled === false) {
      continue;
    }
    const defaultOriginX = roomId === "shop" ? -19.3 : 19.3;
    const origin = Array.isArray(config.origin) ? config.origin : [defaultOriginX, 0, 0];
    const centerX = Number(origin[0]);
    const centerZ = Number(origin[2]);
    if (!Number.isFinite(centerX) || !Number.isFinite(centerZ)) {
      continue;
    }
    if (centerX > 0) {
      derivedCenters.east.push(centerZ);
    } else if (centerX < 0) {
      derivedCenters.west.push(centerZ);
    }
  }

  if (!derivedCenters.east.length && !derivedCenters.west.length) {
    return sideDoorways;
  }

  sideDoorways.centersBySide = {
    east: getSideDoorCenters({ ...sideDoorways, centersBySide: derivedCenters }, "east", depth, doorwayWidth),
    west: getSideDoorCenters({ ...sideDoorways, centersBySide: derivedCenters }, "west", depth, doorwayWidth)
  };
  return sideDoorways;
}

function createPropSafetyZones({ roomConfig = {}, roomSize = [30, 8, 30], sceneConfig = {} }) {
  const zones = [];
  const width = roomSize[0] || 30;
  const depth = roomSize[2] || 30;

  const sideDoorways = roomConfig.sideDoorways || {};
  if (sideDoorways.enabled !== false) {
    const doorwayWidth = THREE.MathUtils.clamp(
      sideDoorways.width ?? 3.8,
      1.5,
      Math.max(1.5, depth - 1)
    );
    const zHalf = doorwayWidth * 0.5 + 1.1;
    const xDepth = 2.4;
    for (const centerZ of getSideDoorCenters(sideDoorways, "east", depth, doorwayWidth)) {
      zones.push({
        id: `side-door-east-${centerZ.toFixed(2)}`,
        kind: "doorway",
        minX: width * 0.5 - xDepth,
        maxX: width * 0.5 + 0.8,
        minZ: centerZ - zHalf,
        maxZ: centerZ + zHalf
      });
    }
    for (const centerZ of getSideDoorCenters(sideDoorways, "west", depth, doorwayWidth)) {
      zones.push({
        id: `side-door-west-${centerZ.toFixed(2)}`,
        kind: "doorway",
        minX: -width * 0.5 - 0.8,
        maxX: -width * 0.5 + xDepth,
        minZ: centerZ - zHalf,
        maxZ: centerZ + zHalf
      });
    }
  }

  const frontEntrance = roomConfig.frontEntrance || {};
  if (frontEntrance.enabled) {
    const doorwayWidth = THREE.MathUtils.clamp(
      frontEntrance.width ?? 4.2,
      1.6,
      Math.max(1.6, width - 1.6)
    );
    const centerX = THREE.MathUtils.clamp(
      frontEntrance.centerX ?? 0,
      -width * 0.5 + doorwayWidth * 0.5 + 0.4,
      width * 0.5 - doorwayWidth * 0.5 - 0.4
    );
    zones.push({
      id: "front-entrance",
      kind: "doorway",
      minX: centerX - doorwayWidth * 0.5 - 1.15,
      maxX: centerX + doorwayWidth * 0.5 + 1.15,
      minZ: depth * 0.5 - 2.5,
      maxZ: depth * 0.5 + 1
    });
  }

  for (const portal of Array.isArray(sceneConfig?.portals) ? sceneConfig.portals : []) {
    const [px, py, pz] = portal.position || [0, 0, 0];
    const [sx, sy, sz] = portal.size || [2.2, 2.8, 0.4];
    zones.push({
      id: `portal-${portal.id || zones.length + 1}`,
      kind: "portal",
      minX: (px || 0) - sx * 0.5 - 1.2,
      maxX: (px || 0) + sx * 0.5 + 1.2,
      minZ: (pz || 0) - Math.max(1.1, sz * 1.1),
      maxZ: (pz || 0) + Math.max(2.2, sz * 4.2)
    });
  }

  return zones;
}

export async function loadScene({
  scene,
  camera,
  cache,
  sceneConfig,
  qualityProfile,
  catalogConfig = null,
  catalogFeeds = {}
}) {
  const roomConfig = cloneConfig(sceneConfig.room || {});
  roomConfig.sideDoorways = deriveCatalogSideDoorways(roomConfig, catalogConfig);
  const roomSize = roomConfig.size || [30, 8, 30];
  const floorY = roomConfig.floorY || 0;
  const baseRoomBounds = getRoomBounds(roomSize, 1.4, roomConfig.navigationBounds);
  const roomBounds = { ...baseRoomBounds };

  const roomGroup = new THREE.Group();
  roomGroup.name = "RoomGroup";
  scene.add(roomGroup);
  const wallThickness = roomConfig.collisionWallThickness ?? 0.5;
  const colliders = [];
  const floorplanRecords = [];
  const floorplanBaseConfig = cloneConfig(roomConfig.floorplan || {});
  const FLOORPLAN_BASE_TAG = "floorplan-base";
  const FLOORPLAN_THEME_TAG = "floorplan-theme";
  let baseFloorplanBounds = [];
  let themeFloorplanBounds = [];

  function addColliderRect({
    centerX,
    centerZ,
    sizeX,
    sizeZ,
    minY = floorY,
    maxY = floorY + height,
    tag = "room",
    id = "",
    moduleIds = [],
    enabled = true
  }) {
    if (sizeX <= 0 || sizeZ <= 0) {
      return;
    }
    colliders.push({
      id,
      tag,
      enabled: enabled !== false,
      moduleIds: normalizeModuleIds(moduleIds),
      minX: centerX - sizeX * 0.5,
      maxX: centerX + sizeX * 0.5,
      minZ: centerZ - sizeZ * 0.5,
      maxZ: centerZ + sizeZ * 0.5,
      minY,
      maxY
    });
  }

  function removeCollidersByTag(tag) {
    for (let i = colliders.length - 1; i >= 0; i -= 1) {
      if (colliders[i].tag === tag) {
        colliders.splice(i, 1);
      }
    }
  }

  function setRoomBounds(nextBounds = null) {
    const resolved = getRoomBounds(roomSize, 1.4, nextBounds);
    roomBounds.minX = resolved.minX;
    roomBounds.maxX = resolved.maxX;
    roomBounds.minZ = resolved.minZ;
    roomBounds.maxZ = resolved.maxZ;
  }

  const wallMaterial = new THREE.MeshStandardMaterial({
    color: roomConfig.wallMaterial?.color || "#7a7a70",
    roughness: 0.92,
    metalness: 0.04,
    side: THREE.DoubleSide
  });
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: roomConfig.floorMaterial?.color || "#656358",
    roughness: 0.95,
    metalness: 0.03
  });
  const ceilingMaterial = new THREE.MeshStandardMaterial({
    color: roomConfig.ceilingMaterial?.color || "#88857a",
    roughness: 0.96,
    metalness: 0
  });

  await Promise.all([
    applyMaterialConfig(wallMaterial, roomConfig.wallMaterial || {}, cache),
    applyMaterialConfig(floorMaterial, roomConfig.floorMaterial || {}, cache),
    applyMaterialConfig(ceilingMaterial, roomConfig.ceilingMaterial || {}, cache)
  ]);

  const [width, height, depth] = roomSize;
  const floorplanProtectedZones = createProtectedFloorplanZones({
    roomConfig,
    roomSize,
    sceneConfig,
    catalogConfig,
    catalogFeeds
  });
  const catalogProtectedZones = floorplanProtectedZones.filter(
    (zone) => zone.zoneType === "catalog"
  );
  const propSafetyZones = createPropSafetyZones({
    roomConfig,
    roomSize,
    sceneConfig
  });

  function wallBlockedByProtectedZone(bounds) {
    for (const zone of floorplanProtectedZones) {
      if (boundsOverlap2D(bounds, zone)) {
        return true;
      }
    }
    return false;
  }

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), floorMaterial);
  floor.rotation.x = -Math.PI * 0.5;
  floor.position.y = floorY;
  floor.receiveShadow = true;
  roomGroup.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), ceilingMaterial);
  ceiling.rotation.x = Math.PI * 0.5;
  ceiling.position.y = floorY + height;
  roomGroup.add(ceiling);

  const northWall = new THREE.Mesh(new THREE.PlaneGeometry(width, height), wallMaterial);
  northWall.position.set(0, floorY + height * 0.5, -depth * 0.5);
  roomGroup.add(northWall);
  addColliderRect({
    centerX: 0,
    centerZ: -depth * 0.5,
    sizeX: width,
    sizeZ: wallThickness,
    minY: floorY + 0.02,
    maxY: floorY + height - 0.04,
    id: "north_wall"
  });

  const frontEntrance = roomConfig.frontEntrance || {};
  const frontEntranceEnabled = Boolean(frontEntrance.enabled);
  const frontDoorWidth = THREE.MathUtils.clamp(
    frontEntrance.width ?? 4.2,
    1.6,
    Math.max(1.6, width - 1.6)
  );
  const frontDoorHeight = THREE.MathUtils.clamp(
    frontEntrance.height ?? 3.4,
    2.2,
    Math.max(2.2, height - 0.4)
  );
  const frontDoorCenterX = THREE.MathUtils.clamp(
    frontEntrance.centerX ?? 0,
    -width * 0.5 + frontDoorWidth * 0.5 + 0.4,
    width * 0.5 - frontDoorWidth * 0.5 - 0.4
  );

  if (!frontEntranceEnabled) {
    const southWall = new THREE.Mesh(new THREE.PlaneGeometry(width, height), wallMaterial);
    southWall.rotation.y = Math.PI;
    southWall.position.set(0, floorY + height * 0.5, depth * 0.5);
    roomGroup.add(southWall);
    addColliderRect({
      centerX: 0,
      centerZ: depth * 0.5,
      sizeX: width,
      sizeZ: wallThickness,
      minY: floorY + 0.02,
      maxY: floorY + height - 0.04,
      id: "south_wall"
    });
  } else {
    const topHeight = Math.max(0.2, height - frontDoorHeight);
    const leftWidth = Math.max(
      0.2,
      frontDoorCenterX - frontDoorWidth * 0.5 - (-width * 0.5)
    );
    const rightWidth = Math.max(
      0.2,
      width * 0.5 - (frontDoorCenterX + frontDoorWidth * 0.5)
    );

    const topSegment = new THREE.Mesh(
      new THREE.PlaneGeometry(width, topHeight),
      wallMaterial
    );
    topSegment.rotation.y = Math.PI;
    topSegment.position.set(0, floorY + frontDoorHeight + topHeight * 0.5, depth * 0.5);
    roomGroup.add(topSegment);

    const leftSegment = new THREE.Mesh(
      new THREE.PlaneGeometry(leftWidth, frontDoorHeight),
      wallMaterial
    );
    leftSegment.rotation.y = Math.PI;
    leftSegment.position.set(
      -width * 0.5 + leftWidth * 0.5,
      floorY + frontDoorHeight * 0.5,
      depth * 0.5
    );
    roomGroup.add(leftSegment);

    const rightSegment = new THREE.Mesh(
      new THREE.PlaneGeometry(rightWidth, frontDoorHeight),
      wallMaterial
    );
    rightSegment.rotation.y = Math.PI;
    rightSegment.position.set(
      frontDoorCenterX + frontDoorWidth * 0.5 + rightWidth * 0.5,
      floorY + frontDoorHeight * 0.5,
      depth * 0.5
    );
    roomGroup.add(rightSegment);

    addColliderRect({
      centerX: -width * 0.5 + leftWidth * 0.5,
      centerZ: depth * 0.5,
      sizeX: leftWidth,
      sizeZ: wallThickness,
      minY: floorY + 0.02,
      maxY: floorY + frontDoorHeight - 0.02,
      id: "south_wall_left"
    });
    addColliderRect({
      centerX: frontDoorCenterX + frontDoorWidth * 0.5 + rightWidth * 0.5,
      centerZ: depth * 0.5,
      sizeX: rightWidth,
      sizeZ: wallThickness,
      minY: floorY + 0.02,
      maxY: floorY + frontDoorHeight - 0.02,
      id: "south_wall_right"
    });
  }

  const sideDoorways = roomConfig.sideDoorways || {};
  const doorwayEnabled = sideDoorways.enabled !== false;
  const doorwayGlassEnabled = sideDoorways.glass !== false;
  const doorwayWidth = THREE.MathUtils.clamp(
    sideDoorways.width ?? 3.8,
    1.5,
    Math.max(1.5, depth - 1)
  );
  const doorwayHeight = THREE.MathUtils.clamp(
    sideDoorways.height ?? 3.2,
    2,
    Math.max(2, height - 0.6)
  );
  const doorwayPanelMaterial =
    doorwayEnabled && doorwayGlassEnabled
      ? new THREE.MeshPhysicalMaterial({
          color: sideDoorways.glassColor || "#a9cfdc",
          roughness: 0.08,
          metalness: 0.05,
          transmission: 0.82,
          transparent: true,
          opacity: sideDoorways.glassOpacity ?? 0.46,
          thickness: 0.02,
          side: THREE.DoubleSide
        })
      : wallMaterial;

  function addSideWallWithDoor(side) {
    const isEast = side === "east";
    const x = isEast ? width * 0.5 : -width * 0.5;
    const yaw = isEast ? -Math.PI * 0.5 : Math.PI * 0.5;
    const doorCenters = getSideDoorCenters(sideDoorways, side, depth, doorwayWidth);
    const topHeight = Math.max(0.2, height - doorwayHeight);

    if (!doorwayEnabled) {
      const fullWall = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), wallMaterial);
      fullWall.rotation.y = yaw;
      fullWall.position.set(x, floorY + height * 0.5, 0);
      roomGroup.add(fullWall);
      addColliderRect({
        centerX: x,
        centerZ: 0,
        sizeX: wallThickness,
        sizeZ: depth,
        minY: floorY + 0.02,
        maxY: floorY + height - 0.04,
        id: `${side}_wall`
      });
      return;
    }

    const topSegment = new THREE.Mesh(
      new THREE.PlaneGeometry(depth, topHeight),
      doorwayPanelMaterial
    );
    topSegment.rotation.y = yaw;
    topSegment.position.set(x, floorY + doorwayHeight + topHeight * 0.5, 0);
    roomGroup.add(topSegment);

    let spanStart = -depth * 0.5;
    for (let index = 0; index < doorCenters.length; index += 1) {
      const centerZ = doorCenters[index];
      const openingStart = centerZ - doorwayWidth * 0.5;
      const openingEnd = centerZ + doorwayWidth * 0.5;
      const segmentLength = openingStart - spanStart;
      if (segmentLength > 0.1) {
        const segment = new THREE.Mesh(
          new THREE.PlaneGeometry(segmentLength, doorwayHeight),
          doorwayPanelMaterial
        );
        segment.rotation.y = yaw;
        segment.position.set(
          x,
          floorY + doorwayHeight * 0.5,
          spanStart + segmentLength * 0.5
        );
        roomGroup.add(segment);
        addColliderRect({
          centerX: x,
          centerZ: spanStart + segmentLength * 0.5,
          sizeX: wallThickness,
          sizeZ: segmentLength,
          minY: floorY + 0.02,
          maxY: floorY + doorwayHeight - 0.02,
          id: `${side}_wall_segment_${index}`
        });
      }
      spanStart = openingEnd;
    }

    const trailingLength = depth * 0.5 - spanStart;
    if (trailingLength > 0.1) {
      const trailingSegment = new THREE.Mesh(
        new THREE.PlaneGeometry(trailingLength, doorwayHeight),
        doorwayPanelMaterial
      );
      trailingSegment.rotation.y = yaw;
      trailingSegment.position.set(
        x,
        floorY + doorwayHeight * 0.5,
        spanStart + trailingLength * 0.5
      );
      roomGroup.add(trailingSegment);
      addColliderRect({
        centerX: x,
        centerZ: spanStart + trailingLength * 0.5,
        sizeX: wallThickness,
        sizeZ: trailingLength,
        minY: floorY + 0.02,
        maxY: floorY + doorwayHeight - 0.02,
        id: `${side}_wall_segment_tail`
      });
    }
  }

  addSideWallWithDoor("east");
  addSideWallWithDoor("west");

  function normalizeOpenSide(value) {
    const side = String(value || "")
      .trim()
      .toLowerCase();
    if (side === "north" || side === "south" || side === "east" || side === "west") {
      return side;
    }
    return "";
  }

  function removeFloorplanByTag(tag) {
    removeCollidersByTag(tag);
    for (let i = floorplanRecords.length - 1; i >= 0; i -= 1) {
      const item = floorplanRecords[i];
      if (item.userData?.floorplanTag !== tag) {
        continue;
      }
      scene.remove(item);
      item.traverse((child) => {
        if (child.geometry?.dispose) {
          child.geometry.dispose();
        }
        if (Array.isArray(child.material)) {
          for (const material of child.material) {
            if (material?.userData?.floorplanOwned) {
              material.dispose();
            }
          }
        } else if (child.material?.userData?.floorplanOwned) {
          child.material.dispose();
        }
      });
      floorplanRecords.splice(i, 1);
    }
  }

  function createFloorplanMaterial(baseMaterial, override = null) {
    if (!override || typeof override !== "object") {
      return baseMaterial;
    }

    const material = baseMaterial.clone();
    material.userData.floorplanOwned = true;
    if (override.color) {
      material.color.set(override.color);
    }
    if (override.roughness != null) {
      material.roughness = override.roughness;
    }
    if (override.metalness != null) {
      material.metalness = override.metalness;
    }
    if (override.emissiveColor) {
      material.emissive.set(override.emissiveColor);
    }
    if (override.emissiveIntensity != null) {
      material.emissiveIntensity = override.emissiveIntensity;
    }
    if (override.opacity != null) {
      material.opacity = override.opacity;
      material.transparent = override.opacity < 1;
    }
    return material;
  }

  function createAnnex(annexConfig, index, tag) {
    const size = Array.isArray(annexConfig?.size) ? annexConfig.size : [8, 6, 8];
    const widthValue = Math.max(2.2, Number(size[0]) || 8);
    const heightValue = Math.max(2.2, Number(size[1]) || 6);
    const depthValue = Math.max(2.2, Number(size[2]) || 8);
    const position = Array.isArray(annexConfig?.position) ? annexConfig.position : [0, 0, 0];
    const centerX = Number(position[0]) || 0;
    const baseY = floorY + (Number(position[1]) || 0);
    const centerZ = Number(position[2]) || 0;
    const openSide = normalizeOpenSide(annexConfig?.openSide);
    const navigationInset = THREE.MathUtils.clamp(
      annexConfig?.navigationInset ?? 1.05,
      0.35,
      Math.max(0.35, Math.min(widthValue, depthValue) * 0.45)
    );

    const floorMat = createFloorplanMaterial(floorMaterial, annexConfig?.floorMaterial);
    const wallMat = createFloorplanMaterial(wallMaterial, annexConfig?.wallMaterial);
    const ceilingMat = createFloorplanMaterial(ceilingMaterial, annexConfig?.ceilingMaterial);

    const group = new THREE.Group();
    group.name = annexConfig?.id || `annex-${index + 1}`;
    group.userData.floorplanTag = tag;
    group.position.set(centerX, baseY, centerZ);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(widthValue, depthValue), floorMat);
    floor.rotation.x = -Math.PI * 0.5;
    floor.receiveShadow = true;
    group.add(floor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(widthValue, depthValue), ceilingMat);
    ceiling.rotation.x = Math.PI * 0.5;
    ceiling.position.y = heightValue;
    group.add(ceiling);

    function addWall(side) {
      if (side === openSide) {
        return;
      }

      let mesh = null;
      let wallBounds = null;
      if (side === "north") {
        wallBounds = {
          minX: centerX - widthValue * 0.5,
          maxX: centerX + widthValue * 0.5,
          minZ: centerZ - depthValue * 0.5 - wallThickness * 0.5,
          maxZ: centerZ - depthValue * 0.5 + wallThickness * 0.5
        };
        if (wallBlockedByProtectedZone(wallBounds)) {
          return;
        }
        mesh = new THREE.Mesh(new THREE.PlaneGeometry(widthValue, heightValue), wallMat);
        mesh.position.set(0, heightValue * 0.5, -depthValue * 0.5);
        addColliderRect({
          centerX,
          centerZ: centerZ - depthValue * 0.5,
          sizeX: widthValue,
          sizeZ: wallThickness,
          minY: baseY + 0.02,
          maxY: baseY + heightValue - 0.04,
          tag,
          id: `${group.name}_north`
        });
      } else if (side === "south") {
        wallBounds = {
          minX: centerX - widthValue * 0.5,
          maxX: centerX + widthValue * 0.5,
          minZ: centerZ + depthValue * 0.5 - wallThickness * 0.5,
          maxZ: centerZ + depthValue * 0.5 + wallThickness * 0.5
        };
        if (wallBlockedByProtectedZone(wallBounds)) {
          return;
        }
        mesh = new THREE.Mesh(new THREE.PlaneGeometry(widthValue, heightValue), wallMat);
        mesh.rotation.y = Math.PI;
        mesh.position.set(0, heightValue * 0.5, depthValue * 0.5);
        addColliderRect({
          centerX,
          centerZ: centerZ + depthValue * 0.5,
          sizeX: widthValue,
          sizeZ: wallThickness,
          minY: baseY + 0.02,
          maxY: baseY + heightValue - 0.04,
          tag,
          id: `${group.name}_south`
        });
      } else if (side === "east") {
        wallBounds = {
          minX: centerX + widthValue * 0.5 - wallThickness * 0.5,
          maxX: centerX + widthValue * 0.5 + wallThickness * 0.5,
          minZ: centerZ - depthValue * 0.5,
          maxZ: centerZ + depthValue * 0.5
        };
        if (wallBlockedByProtectedZone(wallBounds)) {
          return;
        }
        mesh = new THREE.Mesh(new THREE.PlaneGeometry(depthValue, heightValue), wallMat);
        mesh.rotation.y = -Math.PI * 0.5;
        mesh.position.set(widthValue * 0.5, heightValue * 0.5, 0);
        addColliderRect({
          centerX: centerX + widthValue * 0.5,
          centerZ,
          sizeX: wallThickness,
          sizeZ: depthValue,
          minY: baseY + 0.02,
          maxY: baseY + heightValue - 0.04,
          tag,
          id: `${group.name}_east`
        });
      } else if (side === "west") {
        wallBounds = {
          minX: centerX - widthValue * 0.5 - wallThickness * 0.5,
          maxX: centerX - widthValue * 0.5 + wallThickness * 0.5,
          minZ: centerZ - depthValue * 0.5,
          maxZ: centerZ + depthValue * 0.5
        };
        if (wallBlockedByProtectedZone(wallBounds)) {
          return;
        }
        mesh = new THREE.Mesh(new THREE.PlaneGeometry(depthValue, heightValue), wallMat);
        mesh.rotation.y = Math.PI * 0.5;
        mesh.position.set(-widthValue * 0.5, heightValue * 0.5, 0);
        addColliderRect({
          centerX: centerX - widthValue * 0.5,
          centerZ,
          sizeX: wallThickness,
          sizeZ: depthValue,
          minY: baseY + 0.02,
          maxY: baseY + heightValue - 0.04,
          tag,
          id: `${group.name}_west`
        });
      }

      if (mesh) {
        group.add(mesh);
      }
    }

    addWall("north");
    addWall("south");
    addWall("east");
    addWall("west");

    scene.add(group);
    floorplanRecords.push(group);

    return {
      minX: centerX - widthValue * 0.5 + navigationInset,
      maxX: centerX + widthValue * 0.5 - navigationInset,
      minZ: centerZ - depthValue * 0.5 + navigationInset,
      maxZ: centerZ + depthValue * 0.5 - navigationInset
    };
  }

  function buildFloorplanAnnexes(annexes, tag) {
    const bounds = [];
    const source = Array.isArray(annexes) ? annexes : [];
    for (let index = 0; index < source.length; index += 1) {
      const annex = source[index];
      if (!annex || annex.enabled === false) {
        continue;
      }
      const annexBounds = createAnnex(annex, index, tag);
      if (annexBounds && annexBounds.minX < annexBounds.maxX && annexBounds.minZ < annexBounds.maxZ) {
        bounds.push(annexBounds);
      }
    }
    return bounds;
  }

  function applyFloorplanBounds(themeFloorplan = null) {
    const explicitBounds =
      themeFloorplan?.navigationProfile?.bounds || themeFloorplan?.navigationBounds || null;
    if (explicitBounds) {
      setRoomBounds(explicitBounds);
      return;
    }

    const merged = { ...baseRoomBounds };
    for (const bounds of baseFloorplanBounds) {
      mergeBounds(merged, bounds);
    }
    if (themeFloorplan?.extendNavigation !== false) {
      for (const bounds of themeFloorplanBounds) {
        mergeBounds(merged, bounds);
      }
    }
    setRoomBounds(merged);
  }

  function applyThemeFloorplan(themeFloorplan = null) {
    removeFloorplanByTag(FLOORPLAN_THEME_TAG);
    themeFloorplanBounds = [];

    const config =
      themeFloorplan && typeof themeFloorplan === "object"
        ? cloneConfig(themeFloorplan)
        : null;
    if (config?.annexes) {
      themeFloorplanBounds = buildFloorplanAnnexes(config.annexes, FLOORPLAN_THEME_TAG);
    }
    applyFloorplanBounds(config);
  }

  function resetThemeFloorplan() {
    applyThemeFloorplan(null);
  }

  baseFloorplanBounds = buildFloorplanAnnexes(floorplanBaseConfig?.annexes, FLOORPLAN_BASE_TAG);
  applyFloorplanBounds(null);

  const fogConfig = sceneConfig.fog || {};
  scene.fog = new THREE.Fog(
    fogConfig.color || "#44443f",
    fogConfig.near || 6,
    fogConfig.far || 52
  );
  scene.background = new THREE.Color(fogConfig.color || "#343431");
  const baseFogState = {
    color: fogConfig.color || "#44443f",
    near: fogConfig.near || 6,
    far: fogConfig.far || 52
  };

  const lights = [];
  for (const lightConfig of sceneConfig.lights || []) {
    let light = null;
    if (lightConfig.type === "ambient") {
      light = new THREE.AmbientLight(
        lightConfig.color || "#ffffff",
        lightConfig.intensity ?? 0.5
      );
    } else if (lightConfig.type === "directional") {
      light = new THREE.DirectionalLight(
        lightConfig.color || "#eef2ff",
        lightConfig.intensity ?? 0.7
      );
      const pos = lightConfig.position || [0, floorY + height + 4, depth * 0.4];
      light.position.set(pos[0] || 0, pos[1] || 0, pos[2] || 0);
      const target = new THREE.Object3D();
      const targetPos = lightConfig.target || [0, floorY, 0];
      target.position.set(targetPos[0] || 0, targetPos[1] || 0, targetPos[2] || 0);
      light.target = target;
      scene.add(target);
      light.userData.target = target;
    } else if (lightConfig.type === "spot") {
      light = new THREE.SpotLight(
        lightConfig.color || "#ffffff",
        lightConfig.intensity ?? 1,
        lightConfig.distance ?? 45,
        lightConfig.angle ?? 0.6,
        lightConfig.penumbra ?? 0.4
      );
      const pos = lightConfig.position || [0, floorY + height, 0];
      light.position.set(pos[0] || 0, pos[1] || 0, pos[2] || 0);
      const target = new THREE.Object3D();
      const targetPos = lightConfig.target || [0, floorY, 0];
      target.position.set(targetPos[0] || 0, targetPos[1] || 0, targetPos[2] || 0);
      light.target = target;
      scene.add(target);
      light.userData.target = target;
    } else {
      light = new THREE.PointLight(
        lightConfig.color || "#fff8df",
        lightConfig.intensity ?? 1,
        lightConfig.distance ?? 25
      );
      const pos = lightConfig.position || [0, floorY + height - 1, 0];
      light.position.set(pos[0] || 0, pos[1] || 0, pos[2] || 0);
    }
    if (light) {
      if (!light.isAmbientLight) {
        light.userData.canCastShadow = Boolean(lightConfig.castShadow);
        light.userData.preserveInThemes = Boolean(lightConfig.preserveInThemes);
        light.castShadow = Boolean(light.userData.canCastShadow && qualityProfile.shadows);
        if (light.castShadow) {
          if (light.shadow?.mapSize) {
            light.shadow.mapSize.set(1024, 1024);
          }
          if (light.shadow?.camera) {
            light.shadow.bias = -0.00035;
            if (light.isDirectionalLight) {
              light.shadow.camera.near = 0.5;
              light.shadow.camera.far = 90;
              light.shadow.camera.left = -26;
              light.shadow.camera.right = 26;
              light.shadow.camera.top = 26;
              light.shadow.camera.bottom = -26;
            } else if (light.isSpotLight) {
              light.shadow.camera.near = 0.5;
              light.shadow.camera.far = Math.max(32, light.distance || 40);
            } else if (light.isPointLight) {
              light.shadow.camera.near = 0.5;
              light.shadow.camera.far = Math.max(20, light.distance || 25);
            }
          }
        }
      }
      scene.add(light);
      lights.push(light);
    }
  }

  if (!lights.length) {
    const fallbackAmbient = new THREE.AmbientLight("#d2d0c4", 0.5);
    scene.add(fallbackAmbient);
    lights.push(fallbackAmbient);
  }

  const portals = (sceneConfig.portals || []).map(createPortal);
  for (const portal of portals) {
    scene.add(portal.group);
  }

  const propRecords = [];
  const propInteractionTargets = [];
  const propModules = new Map();
  const animatedTextures = [];
  const dynamicProps = [];
  const visibilityEntries = [];
  let glowLightCount = 0;
  const maxGlowLights = Number.isFinite(qualityProfile?.sceneGlowLightBudget)
    ? Math.max(0, Number(qualityProfile.sceneGlowLightBudget))
    : sceneConfig.glowLightBudget ?? 48;
  let lastVisibilityUpdateAt = -1;
  const visibilityUpdateInterval = Math.max(
    0.05,
    Number(qualityProfile?.visibilityUpdateInterval) || 0.1
  );
  const managedVisibility = qualityProfile?.managedVisibility !== false;
  const directionalVisibility = qualityProfile?.directionalVisibility !== false;
  const cameraWorldPosition = new THREE.Vector3();
  const cameraWorldDirection = new THREE.Vector3();
  const objectWorldPosition = new THREE.Vector3();
  const toObjectDirection = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const tempPropBox = new THREE.Box3();
  const tempPropSize = new THREE.Vector3();
  const tempPropCenter = new THREE.Vector3();
  const tempLocalCenter = new THREE.Vector3();

  function addObjectCollider(
    object,
    { tag = "base", id = "", moduleIds = [], enabled = true } = {}
  ) {
    tempPropBox.setFromObject(object);
    if (tempPropBox.isEmpty()) {
      return;
    }
    tempPropBox.getSize(tempPropSize);
    tempPropBox.getCenter(tempPropCenter);
    if (tempPropSize.x <= 0.02 || tempPropSize.z <= 0.02) {
      return;
    }
    addColliderRect({
      centerX: tempPropCenter.x,
      centerZ: tempPropCenter.z,
      sizeX: tempPropSize.x + 0.08,
      sizeZ: tempPropSize.z + 0.08,
      minY: tempPropBox.min.y,
      maxY: tempPropBox.max.y + 0.02,
      tag,
      id,
      moduleIds,
      enabled
    });
  }

  function getObjectBounds2D(object) {
    tempPropBox.setFromObject(object);
    if (tempPropBox.isEmpty()) {
      return null;
    }

    return {
      minX: tempPropBox.min.x,
      maxX: tempPropBox.max.x,
      minZ: tempPropBox.min.z,
      maxZ: tempPropBox.max.z
    };
  }

  function isBlockedByCatalogZone(object) {
    const bounds = getObjectBounds2D(object);
    if (!bounds) {
      return false;
    }

    for (const zone of catalogProtectedZones) {
      if (boundsOverlap2D(bounds, zone)) {
        return true;
      }
    }
    return false;
  }

  function isBlockedByPropSafetyZone(object, prop = {}) {
    const bounds = getObjectBounds2D(object);
    if (!bounds) {
      return false;
    }

    for (const zone of propSafetyZones) {
      if (zone.kind === "portal" && prop.allowPortalBlock === true) {
        continue;
      }
      if (zone.kind === "doorway" && prop.allowDoorwayBlock === true) {
        continue;
      }
      if (boundsOverlap2D(bounds, zone)) {
        return true;
      }
    }
    return false;
  }

  function applyResolvedVisibility(entry) {
    const resolved = entry.cullVisible !== false && entry.moduleVisible !== false;
    if (entry.visible === resolved) {
      return;
    }

    entry.visible = resolved;
    entry.object.visible = resolved;
    if (entry.hitbox) {
      entry.hitbox.visible = resolved;
    }
    if (entry.target?.userData) {
      entry.target.userData.hiddenFromInteraction = !resolved;
    }
  }

  function setVisibilityState(entry, visible) {
    entry.cullVisible = Boolean(visible);
    applyResolvedVisibility(entry);
  }

  function setModuleVisibilityState(entry, visible) {
    entry.moduleVisible = Boolean(visible);
    applyResolvedVisibility(entry);
  }

  function registerVisibilityEntry(wrapper, prop, tag, target = null) {
    if (!wrapper?.parent || prop?.visibility?.enabled === false) {
      return null;
    }

    tempPropBox.setFromObject(wrapper);
    if (tempPropBox.isEmpty()) {
      return null;
    }
    tempPropBox.getSize(tempPropSize);
    const radius = Math.max(tempPropSize.x, tempPropSize.y, tempPropSize.z) * 0.5;
    const nearDistance = Math.max(4, Number(prop?.visibility?.nearDistance) || 8);
    const maxDistance = Math.max(
      nearDistance + 1,
      Number(prop?.visibility?.maxDistance) ||
        (target ? 34 : tag === "theme-extra" ? 42 : 56)
    );
    const coneDegrees = THREE.MathUtils.clamp(
      Number(prop?.visibility?.coneDegrees) || (target ? 160 : 138),
      40,
      178
    );

    const entry = {
      object: wrapper,
      hitbox: target?.hitbox || null,
      target,
      radius,
      nearDistance,
      relaxedDistance: Math.max(
        nearDistance + radius,
        Number(prop?.visibility?.relaxedDistance) || 14
      ),
      maxDistance,
      coneCos: Math.cos(THREE.MathUtils.degToRad(coneDegrees * 0.5)),
      cullVisible: true,
      moduleVisible: true,
      visible: true
    };
    visibilityEntries.push(entry);
    setVisibilityState(entry, true);
    return entry;
  }

  function resolveModuleVisibility(moduleIds = []) {
    const ids = normalizeModuleIds(moduleIds);
    if (!ids.length) {
      return true;
    }

    for (const moduleId of ids) {
      if (propModules.get(moduleId)?.visible === false) {
        return false;
      }
    }
    return true;
  }

  function syncModuleMemberVisibility(member) {
    if (!member) {
      return false;
    }

    const resolved = resolveModuleVisibility(member.moduleIds);
    if (member.visibilityEntry) {
      setModuleVisibilityState(member.visibilityEntry, resolved);
    } else if (member.object) {
      member.object.visible = resolved;
      if (member.target?.hitbox) {
        member.target.hitbox.visible = resolved;
      }
      if (member.target?.userData) {
        member.target.userData.hiddenFromInteraction = !resolved;
      }
    }
    return resolved;
  }

  function syncModuleColliderVisibility() {
    for (const collider of colliders) {
      if (!Array.isArray(collider.moduleIds) || !collider.moduleIds.length) {
        continue;
      }
      collider.enabled = resolveModuleVisibility(collider.moduleIds);
    }
  }

  function registerModuleMember(moduleIds, member, initialVisible = true) {
    const ids = normalizeModuleIds(moduleIds);
    if (!ids.length || !member) {
      return ids;
    }

    member.moduleIds = ids;
    for (const moduleId of ids) {
      let record = propModules.get(moduleId);
      if (!record) {
        record = {
          id: moduleId,
          visible: initialVisible,
          members: []
        };
        propModules.set(moduleId, record);
      } else if (!initialVisible) {
        record.visible = false;
      }
      record.members.push(member);
    }
    syncModuleMemberVisibility(member);
    syncModuleColliderVisibility();
    return ids;
  }

  function setPropModulesVisible(moduleIds, visible) {
    const ids = normalizeModuleIds(moduleIds);
    if (!ids.length) {
      return [];
    }

    const touchedMembers = new Set();
    const updated = [];
    for (const moduleId of ids) {
      let record = propModules.get(moduleId);
      if (!record) {
        record = {
          id: moduleId,
          visible: Boolean(visible),
          members: []
        };
        propModules.set(moduleId, record);
      }
      record.visible = Boolean(visible);
      updated.push({
        id: moduleId,
        visible: record.visible,
        memberCount: record.members.length
      });
      for (const member of record.members) {
        touchedMembers.add(member);
      }
    }

    for (const member of touchedMembers) {
      syncModuleMemberVisibility(member);
    }
    syncModuleColliderVisibility();
    return updated;
  }

  function togglePropModulesVisible(moduleIds) {
    const ids = normalizeModuleIds(moduleIds);
    if (!ids.length) {
      return [];
    }
    const nextVisible = !resolveModuleVisibility(ids);
    return setPropModulesVisible(ids, nextVisible);
  }

  function getPropModuleState(moduleId) {
    const id = readText(moduleId, "");
    if (!id) {
      return null;
    }
    const record = propModules.get(id);
    if (!record) {
      return {
        id,
        visible: true,
        memberCount: 0
      };
    }
    return {
      id,
      visible: record.visible !== false,
      memberCount: record.members.length
    };
  }

  function getPropModuleStates() {
    return [...propModules.values()].map((record) => ({
      id: record.id,
      visible: record.visible !== false,
      memberCount: record.members.length
    }));
  }

  function updateManagedVisibility(elapsedTime, activeCamera) {
    if (!visibilityEntries.length) {
      return;
    }

    if (!managedVisibility) {
      for (const entry of visibilityEntries) {
        if (!entry.object?.parent) {
          continue;
        }
        setVisibilityState(entry, true);
      }
      return;
    }

    if (!activeCamera) {
      return;
    }
    if (lastVisibilityUpdateAt >= 0 && elapsedTime - lastVisibilityUpdateAt < visibilityUpdateInterval) {
      return;
    }
    lastVisibilityUpdateAt = elapsedTime;

    activeCamera.getWorldPosition(cameraWorldPosition);
    activeCamera.getWorldDirection(cameraWorldDirection).normalize();

    for (const entry of visibilityEntries) {
      if (!entry.object?.parent) {
        continue;
      }

      entry.object.getWorldPosition(objectWorldPosition);
      const distanceSq = cameraWorldPosition.distanceToSquared(objectWorldPosition);
      const currentlyVisible = entry.visible !== false;
      const extraDistance = currentlyVisible ? Math.max(2, entry.radius * 2.2) : 0;
      const nearDistance = entry.nearDistance + entry.radius + extraDistance;
      const maxDistance = entry.maxDistance + entry.radius + extraDistance;
      const relaxedDistance = entry.relaxedDistance + entry.radius + extraDistance;
      let visible = distanceSq <= nearDistance * nearDistance;

      if (!visible && distanceSq <= maxDistance * maxDistance) {
        if (!directionalVisibility) {
          visible = distanceSq <= relaxedDistance * relaxedDistance;
        } else {
          toObjectDirection
            .copy(objectWorldPosition)
            .sub(cameraWorldPosition)
            .normalize();
          visible =
            distanceSq <= relaxedDistance * relaxedDistance ||
            toObjectDirection.dot(cameraWorldDirection) >=
              (currentlyVisible ? entry.coneCos - 0.12 : entry.coneCos);
        }
      }

      setVisibilityState(entry, visible);
    }
  }

  function registerPropCollider(wrapper, prop, tag, moduleIds = []) {
    if (prop.collider === false || prop.billboard || prop.hoverMotion) {
      return;
    }

    if (typeof prop.collider === "object" && Array.isArray(prop.collider.size)) {
      const colliderSize = prop.collider.size;
      const colliderOffset = prop.collider.offset || [0, 0, 0];
      const center = wrapper.position.clone().add(
        new THREE.Vector3(
          colliderOffset[0] || 0,
          colliderOffset[1] || 0,
          colliderOffset[2] || 0
        )
      );
      const ySize = colliderSize[1] || 2;
      addColliderRect({
        centerX: center.x,
        centerZ: center.z,
        sizeX: colliderSize[0] || 0.5,
        sizeZ: colliderSize[2] || 0.5,
        minY: center.y - ySize * 0.5,
        maxY: center.y + ySize * 0.5,
        tag,
        id: prop.id || wrapper.name,
        moduleIds,
        enabled: !prop.initiallyHidden
      });
      return;
    }

    if (prop.type === "primitive" && prop.primitive === "plane" && prop.collider !== true) {
      return;
    }

    addObjectCollider(wrapper, {
      tag,
      id: prop.id || wrapper.name,
      moduleIds,
      enabled: !prop.initiallyHidden
    });
  }

  function attachGlowLight(wrapper, prop) {
    if (glowLightCount >= maxGlowLights) {
      return;
    }
    const material = prop.material || {};
    if (material.glowLight === false) {
      return;
    }
    if (!material.emissiveColor) {
      return;
    }
    const emissiveIntensity = material.emissiveIntensity ?? 0;
    if (emissiveIntensity < 0.12) {
      return;
    }

    const scale = prop.scale || [1, 1, 1];
    const lightRadius = Math.max(scale[0] || 1, scale[1] || 1, scale[2] || 1);
    const intensity = Math.min(1.2, 0.24 + emissiveIntensity * 0.82);
    const distance = Math.max(2.4, lightRadius * 3.6);
    const light = new THREE.PointLight(material.emissiveColor, intensity, distance);
    light.position.set(
      0,
      material.glowOffsetY ?? Math.max(0.35, (scale[1] || 1) * 0.35),
      material.glowOffsetZ ?? 0
    );
    light.userData.canCastShadow = false;
    light.userData.fromPropGlow = true;
    wrapper.add(light);
    glowLightCount += 1;
  }

  function createPropInteractionTarget(wrapper, prop, tag) {
    if (!prop?.interactable || typeof prop.interactable !== "object") {
      return null;
    }
    if (prop.interactable.enabled === false) {
      return null;
    }

    const interactable = prop.interactable;
    const title = readText(interactable.title, readText(prop.id, "Exhibit"));
    const description = readText(interactable.description, "");
    const label = readText(interactable.label, title);
    const tags = Array.isArray(interactable.tags)
      ? interactable.tags
          .map((entry) => readText(entry, ""))
          .filter(Boolean)
          .slice(0, 10)
      : [];
    const actions = Array.isArray(interactable.actions)
      ? interactable.actions
          .map((entry) => normalizeInteractableAction(entry))
          .filter(
            (entry) =>
              entry.url ||
              entry.theme ||
              entry.secretId ||
              entry.portalId ||
              entry.message ||
              entry.moduleIds.length ||
              entry.position ||
              entry.steps?.length ||
              entry.type
          )
          .slice(0, 6)
      : [];

    tempPropBox.setFromObject(wrapper);
    if (tempPropBox.isEmpty()) {
      return null;
    }

    tempPropBox.getSize(tempPropSize);
    tempPropBox.getCenter(tempPropCenter);
    tempLocalCenter.copy(tempPropCenter);
    wrapper.worldToLocal(tempLocalCenter);
    const isCenterArtifact =
      readText(prop.id, "") === "center_hover_gif" ||
      readText(interactable?.interaction?.type, "") === "center-artifact";
    const hitboxScale = isCenterArtifact ? 1.72 : 1.08;

    const hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(
        Math.max(isCenterArtifact ? 1.4 : 0.6, tempPropSize.x * hitboxScale),
        Math.max(isCenterArtifact ? 1.6 : 0.8, tempPropSize.y * hitboxScale),
        Math.max(isCenterArtifact ? 1.1 : 0.6, tempPropSize.z * hitboxScale)
      ),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false
      })
    );
    hitbox.userData.disposeManagedResources = true;
    hitbox.position.copy(tempLocalCenter);
    wrapper.add(hitbox);

    const emissiveMaterials = [];
    wrapper.traverse((child) => {
      if (!child?.isMesh) {
        return;
      }
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (!material || material.emissiveIntensity == null) {
          continue;
        }
        material.userData = material.userData || {};
        if (!Number.isFinite(material.userData.baseInteractableEmissiveIntensity)) {
          material.userData.baseInteractableEmissiveIntensity = material.emissiveIntensity || 0;
        }
        emissiveMaterials.push(material);
      }
    });

    const baseScale = wrapper.scale.clone();
    return {
      id: `prop:${readText(prop.id, wrapper.name || "item")}`,
      label,
      type: "prop",
      hitbox,
      interaction: isObject(interactable.interaction) ? cloneConfig(interactable.interaction) : null,
      inspectData: {
        title,
        description,
        tags,
        actions
      },
      userData: {
        themeTag: tag,
        owner: wrapper
      },
      setHovered: (hovered) => {
        const hoverStrength = hovered ? 1 : 0;
        wrapper.scale.copy(baseScale).multiplyScalar(1 + hoverStrength * 0.03);
        for (const material of emissiveMaterials) {
          const base = material.userData?.baseInteractableEmissiveIntensity ?? 0;
          material.emissiveIntensity = base + hoverStrength * 0.22;
        }
      }
    };
  }

  async function instantiateProp(prop, tag = "base", options = {}) {
    const shouldCancel =
      typeof options.shouldCancel === "function" ? options.shouldCancel : () => false;
    if (shouldCancel()) {
      return null;
    }

    const wrapper = new THREE.Group();
    wrapper.name = prop.id || "prop";
    wrapper.userData.themeTag = tag;
    wrapper.userData.billboard = Boolean(prop.billboard);
    wrapper.userData.billboardAxis = prop.billboardAxis || "all";
    wrapper.position.copy(toVector3(prop.position || [0, 0, 0]));
    wrapper.rotation.set(
      degToRad(prop.rotation?.[0] || 0),
      degToRad(prop.rotation?.[1] || 0),
      degToRad(prop.rotation?.[2] || 0)
    );

    if (prop.type === "model" && prop.model) {
      const gltf = await cache.loadModel(prop.model);
      if (shouldCancel()) {
        return null;
      }
      if (gltf?.scene) {
        const model = gltf.scene.clone(true);
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        wrapper.add(model);
      } else {
        const fallbackConfig = normalizeModelFallbackConfig(prop);
        if (!fallbackConfig) {
          console.warn(
            `[sceneLoader] Missing model asset "${prop.model}" for prop "${prop.id || "unnamed"}".`
          );
          return null;
        }

        const fallback = await createPrimitiveMesh(fallbackConfig, cache, animatedTextures, wrapper);
        wrapper.add(fallback);
      }
    } else {
      wrapper.add(await createPrimitiveMesh(prop, cache, animatedTextures, wrapper));
    }

    if (shouldCancel()) {
      disposeManagedObjectResources(wrapper);
      return null;
    }

    const scale = prop.scale || [1, 1, 1];
    wrapper.scale.set(scale[0] || 1, scale[1] || 1, scale[2] || 1);
    wrapper.updateMatrixWorld(true);
    if (prop.allowCatalogOverlap !== true && isBlockedByCatalogZone(wrapper)) {
      disposeManagedObjectResources(wrapper);
      return null;
    }
    if (isBlockedByPropSafetyZone(wrapper, prop)) {
      disposeManagedObjectResources(wrapper);
      return null;
    }

    attachGlowLight(wrapper, prop);
    scene.add(wrapper);
    wrapper.updateMatrixWorld(true);
    propRecords.push(wrapper);
    const moduleIds = normalizeModuleIds(prop.moduleIds || prop.moduleId || prop.modules);
    const initialModuleVisible = !prop.initiallyHidden;
    registerPropCollider(wrapper, prop, tag, moduleIds);
    const interactionTarget = createPropInteractionTarget(wrapper, prop, tag);
    if (interactionTarget) {
      propInteractionTargets.push(interactionTarget);
      wrapper.userData.interactionTarget = interactionTarget;
    }
    const visibilityEntry = registerVisibilityEntry(wrapper, prop, tag, interactionTarget);
    if (moduleIds.length) {
      registerModuleMember(
        moduleIds,
        {
          object: wrapper,
          target: interactionTarget,
          visibilityEntry
        },
        initialModuleVisible
      );
    } else if (prop.initiallyHidden) {
      wrapper.visible = false;
      if (interactionTarget?.hitbox) {
        interactionTarget.hitbox.visible = false;
      }
      if (interactionTarget?.userData) {
        interactionTarget.userData.hiddenFromInteraction = true;
      }
    }

    const hover = prop.hoverMotion;
    if (wrapper.userData.billboard || hover) {
      dynamicProps.push({
        object: wrapper,
        basePosition: wrapper.position.clone(),
        hover: hover
          ? {
              axis: hover.axis || "y",
              amplitude: hover.amplitude ?? 0.15,
              speed: hover.speed ?? 1.2,
              phase: hover.phase ?? Math.random() * Math.PI * 2
            }
          : null
      });
    }
    return wrapper;
  }

  async function addProps(props = [], { tag = "base", shouldCancel } = {}) {
    const cancel = typeof shouldCancel === "function" ? shouldCancel : () => false;
    const created = [];
    for (const prop of props) {
      if (cancel()) {
        break;
      }
      const item = await instantiateProp(prop, tag, { shouldCancel: cancel });
      if (cancel()) {
        break;
      }
      if (!item) {
        continue;
      }
      created.push(item);
    }
    return created;
  }

  function removePropsByTag(tag) {
    removeCollidersByTag(tag);
    for (let i = propRecords.length - 1; i >= 0; i -= 1) {
      const item = propRecords[i];
      if (item.userData.themeTag === tag) {
        item.traverse((child) => {
          if (child.isPointLight && child.userData?.fromPropGlow) {
            glowLightCount = Math.max(0, glowLightCount - 1);
          }
        });
        disposeManagedObjectResources(item);
        scene.remove(item);
        item.clear();
        propRecords.splice(i, 1);
        for (let j = animatedTextures.length - 1; j >= 0; j -= 1) {
          if (animatedTextures[j].owner === item) {
            animatedTextures.splice(j, 1);
          }
        }
        for (let j = dynamicProps.length - 1; j >= 0; j -= 1) {
          if (dynamicProps[j].object === item) {
            dynamicProps.splice(j, 1);
          }
        }
        for (let j = propInteractionTargets.length - 1; j >= 0; j -= 1) {
          if (propInteractionTargets[j].userData?.owner === item) {
            propInteractionTargets.splice(j, 1);
          }
        }
        for (let j = visibilityEntries.length - 1; j >= 0; j -= 1) {
          if (visibilityEntries[j].object === item) {
            visibilityEntries.splice(j, 1);
          }
        }
        for (const [moduleId, record] of propModules.entries()) {
          record.members = record.members.filter((member) => member.object !== item);
          if (!record.members.length) {
            propModules.delete(moduleId);
          }
        }
      }
    }
  }

  function updateDynamicProps(elapsedTime, activeCamera) {
    if (activeCamera) {
      activeCamera.getWorldPosition(cameraWorldPosition);
    }

    for (const item of dynamicProps) {
      const object = item.object;
      if (!object?.parent) {
        continue;
      }
      if (object.visible === false) {
        continue;
      }

      if (item.hover) {
        const { axis, amplitude, speed, phase } = item.hover;
        const wave = Math.sin(elapsedTime * speed + phase) * amplitude;
        object.position.copy(item.basePosition);
        if (axis === "x") {
          object.position.x += wave;
        } else if (axis === "z") {
          object.position.z += wave;
        } else {
          object.position.y += wave;
        }
      }

      if (object.userData.billboard && activeCamera) {
        object.getWorldPosition(objectWorldPosition);
        if (object.userData.billboardAxis === "y") {
          lookTarget.set(
            cameraWorldPosition.x,
            objectWorldPosition.y,
            cameraWorldPosition.z
          );
        } else {
          lookTarget.copy(cameraWorldPosition);
        }
        object.lookAt(lookTarget);
      }
    }

    updateManagedVisibility(elapsedTime, activeCamera);
  }

  function getPropStats() {
    const byTag = {};
    for (const item of propRecords) {
      const tag = item?.userData?.themeTag || "unknown";
      byTag[tag] = (byTag[tag] || 0) + 1;
    }

    return {
      total: propRecords.length,
      byTag
    };
  }

  await addProps(sceneConfig.props || [], { tag: "base" });

  const spawn = sceneConfig.spawn || {};
  const player = new THREE.Object3D();
  player.position.copy(toVector3(spawn.position || [0, 1.7, 10]));
  player.rotation.y = degToRad(spawn.yaw || 180);
  scene.add(player);

  const pitch = new THREE.Object3D();
  player.add(pitch);
  pitch.add(camera);
  camera.position.set(0, 0, 0);

  const baseLightState = lights.map((light) => ({
    color: light.color?.getHexString ? `#${light.color.getHexString()}` : "#ffffff",
    intensity: light.intensity
  }));

  return {
    roomConfig: {
      size: roomSize,
      floorY,
      navigationBounds: cloneConfig(roomConfig.navigationBounds || {}),
      floorplan: cloneConfig(floorplanBaseConfig || {}),
      sideDoorways: cloneConfig(roomConfig.sideDoorways || {}),
      frontEntrance: cloneConfig(roomConfig.frontEntrance || {}),
      wallMaterial: cloneMaterialConfig(roomConfig.wallMaterial || {}),
      floorMaterial: cloneMaterialConfig(roomConfig.floorMaterial || {}),
      ceilingMaterial: cloneMaterialConfig(roomConfig.ceilingMaterial || {})
    },
    roomMaterials: {
      wall: wallMaterial,
      floor: floorMaterial,
      ceiling: ceilingMaterial
    },
    roomBounds,
    floorY,
    player,
    pitch,
    portals,
    lights,
    baseLightState,
    baseFogState,
    zones: sceneConfig.zones || [],
    animatedTextures,
    getInteractionTargets: () => propInteractionTargets,
    getColliders: () => colliders,
    setRoomBounds,
    getRoomBounds: () => ({ ...roomBounds }),
    applyThemeFloorplan,
    resetThemeFloorplan,
    addProps,
    removePropsByTag,
    setPropModulesVisible,
    togglePropModulesVisible,
    getPropModuleState,
    getPropModuleStates,
    updateDynamicProps,
    getPropStats
  };
}
