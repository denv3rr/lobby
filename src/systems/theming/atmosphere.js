import * as THREE from "three";

const QUALITY_LEVELS = ["low", "medium", "high"];
const DEFAULT_ROOM_SIZE = [30, 8, 30];

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toArray3(value, fallback = DEFAULT_ROOM_SIZE) {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  return [
    toNumber(value[0], fallback[0]),
    toNumber(value[1], fallback[1]),
    toNumber(value[2], fallback[2])
  ];
}

function cloneConfig(value) {
  if (value == null) {
    return null;
  }

  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function resolveQualityName(profile) {
  const explicit = String(profile?.quality || profile?.name || "").toLowerCase();
  if (QUALITY_LEVELS.includes(explicit)) {
    return explicit;
  }

  const multiplier = toNumber(profile?.particleMultiplier, 0.7);
  if (multiplier <= 0.45) {
    return "low";
  }
  if (multiplier <= 0.85) {
    return "medium";
  }
  return "high";
}

function resolveQualityConfig(config, qualityName) {
  if (!config || typeof config !== "object") {
    return null;
  }
  const qualityMap = config.quality;
  const override =
    qualityMap && typeof qualityMap === "object" ? qualityMap[qualityName] : null;
  const resolved = {
    ...config,
    ...(override && typeof override === "object" ? override : {})
  };
  delete resolved.quality;
  return resolved;
}

function parsePhaseToRadians(phase) {
  const value = toNumber(phase, 0);
  if (Math.abs(value) <= 1) {
    return value * Math.PI * 2;
  }
  return THREE.MathUtils.degToRad(value);
}

function disposeObjectResources(object) {
  object.traverse((node) => {
    if (node.geometry?.dispose) {
      node.geometry.dispose();
    }
    if (Array.isArray(node.material)) {
      for (const material of node.material) {
        material?.dispose?.();
      }
    } else {
      node.material?.dispose?.();
    }
  });
}

export class AtmosphereSystem {
  constructor({ scene, cache, floorY = 0, roomSize = DEFAULT_ROOM_SIZE, qualityProfile }) {
    this.scene = scene;
    this.cache = cache;
    this.floorY = floorY;
    this.roomSize = toArray3(roomSize, DEFAULT_ROOM_SIZE);
    this.qualityProfile = qualityProfile || { quality: "medium", particleMultiplier: 0.7 };
    this.currentConfig = null;
    this.state = null;
    this.elapsed = 0;
    this.applyToken = 0;
  }

  resolveArea(areaConfig, fallbackHeight = 8) {
    const base = [this.roomSize[0], fallbackHeight, this.roomSize[2]];
    if (!Array.isArray(areaConfig)) {
      return base;
    }
    if (areaConfig.length === 2) {
      return [toNumber(areaConfig[0], base[0]), base[1], toNumber(areaConfig[1], base[2])];
    }
    return [
      toNumber(areaConfig[0], base[0]),
      toNumber(areaConfig[1], base[1]),
      toNumber(areaConfig[2], base[2])
    ];
  }

  getQualityName() {
    return resolveQualityName(this.qualityProfile);
  }

  getParticleMultiplier() {
    return Math.max(0, toNumber(this.qualityProfile?.particleMultiplier, 1));
  }

  async loadOptionalTexture(src) {
    if (!src || !this.cache?.loadTexture) {
      return null;
    }
    try {
      return (await this.cache.loadTexture(src)) || null;
    } catch {
      return null;
    }
  }

  clear() {
    if (!this.state) {
      return;
    }
    if (this.state.root) {
      this.scene.remove(this.state.root);
      disposeObjectResources(this.state.root);
    }
    this.state = null;
    this.elapsed = 0;
  }

  disposeState(state) {
    if (!state?.root) {
      return;
    }
    this.scene.remove(state.root);
    disposeObjectResources(state.root);
  }

  updateMoonTransform(moonState) {
    if (!moonState) {
      return;
    }
    moonState.mesh.position.set(
      Math.cos(moonState.angle) * moonState.orbitRadius,
      moonState.height,
      Math.sin(moonState.angle) * moonState.orbitRadius
    );
  }

  async createDome(root, config, token) {
    const radius = Math.max(6, toNumber(config.radius, 52));
    const geometry = new THREE.SphereGeometry(radius, 36, 18);
    const material = new THREE.MeshBasicMaterial({
      color: config.color || "#101821",
      side: THREE.BackSide,
      fog: false,
      depthWrite: false
    });

    if (config.texture) {
      const texture = await this.loadOptionalTexture(config.texture);
      if (token !== this.applyToken) {
        geometry.dispose();
        material.dispose();
        return null;
      }
      if (texture) {
        material.map = texture;
        material.needsUpdate = true;
      }
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "theme-atmosphere-dome";
    mesh.position.y = this.floorY;
    mesh.frustumCulled = false;
    root.add(mesh);

    return {
      mesh,
      rotationSpeed: toNumber(config.rotationSpeed, 0)
    };
  }

  async createMoon(root, config, token) {
    const radius = Math.max(0.15, toNumber(config.radius, 1.4));
    const geometry = new THREE.SphereGeometry(radius, 24, 18);
    const material = new THREE.MeshBasicMaterial({
      color: config.color || "#d7e3f8",
      fog: false,
      depthWrite: false
    });

    if (config.texture) {
      const texture = await this.loadOptionalTexture(config.texture);
      if (token !== this.applyToken) {
        geometry.dispose();
        material.dispose();
        return null;
      }
      if (texture) {
        material.map = texture;
        material.needsUpdate = true;
      }
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "theme-atmosphere-moon";
    mesh.frustumCulled = false;

    const moonState = {
      mesh,
      orbitRadius: Math.max(0, toNumber(config.orbitRadius, Math.max(this.roomSize[0], this.roomSize[2]) * 0.75)),
      height: this.floorY + toNumber(config.height, Math.max(this.roomSize[1] + 6, 10)),
      orbitSpeed: toNumber(config.orbitSpeed, 0),
      angle: parsePhaseToRadians(config.phase)
    };
    this.updateMoonTransform(moonState);
    root.add(mesh);
    return moonState;
  }

  async createCloudLayers(root, config, multiplier, token) {
    const baseLayerCount = Math.max(1, Math.round(toNumber(config.layerCount, 2)));
    const layerCount = Math.max(
      1,
      Math.round(baseLayerCount * Math.max(0.45, Math.sqrt(Math.max(multiplier, 0.01))))
    );
    const baseDensity = Math.max(1, Math.round(toNumber(config.density, 18)));
    const density = Math.max(1, Math.round(baseDensity * Math.max(0.2, multiplier)));
    const area = this.resolveArea(config.area, 3);
    const halfX = Math.max(1, area[0] * 0.5);
    const halfZ = Math.max(1, area[2] * 0.5);
    const verticalSpread = Math.max(0.15, area[1]);
    const baseHeight = this.floorY + toNumber(config.height, Math.max(this.roomSize[1] + 2.4, 8));
    const opacity = toNumber(config.opacity, 0.45);
    const speedBase = toNumber(config.speed, 0.2);
    const speedSign = speedBase === 0 ? 1 : Math.sign(speedBase);
    const size = Math.max(
      0.3,
      Math.min(
        8,
        (Math.max(area[0], area[2]) / Math.max(1, density)) * 2.8 + 0.7
      )
    );

    const cloudTexture = config.texture ? await this.loadOptionalTexture(config.texture) : null;
    if (token !== this.applyToken) {
      return null;
    }

    const layers = [];
    for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
      const layerOffset = layerCount === 1
        ? 0
        : (layerIndex / (layerCount - 1) - 0.5) * verticalSpread;
      const minY = baseHeight + layerOffset - verticalSpread * 0.24;
      const maxY = baseHeight + layerOffset + verticalSpread * 0.24;
      const positions = new Float32Array(density * 3);
      const speeds = new Float32Array(density);
      const phases = new Float32Array(density);

      for (let i = 0; i < density; i += 1) {
        const base = i * 3;
        positions[base] = THREE.MathUtils.randFloat(-halfX, halfX);
        positions[base + 1] = THREE.MathUtils.randFloat(minY, maxY);
        positions[base + 2] = THREE.MathUtils.randFloat(-halfZ, halfZ);
        phases[i] = Math.random() * Math.PI * 2;
        speeds[i] = THREE.MathUtils.randFloat(
          Math.abs(speedBase) * 0.55,
          Math.abs(speedBase) * 1.35
        ) * speedSign;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        color: config.color || "#ffffff",
        size,
        transparent: true,
        opacity,
        depthWrite: false,
        map: cloudTexture || null,
        alphaTest: cloudTexture ? 0.02 : 0,
        sizeAttenuation: true
      });
      const points = new THREE.Points(geometry, material);
      points.name = `theme-atmosphere-clouds-${layerIndex}`;
      points.frustumCulled = false;
      root.add(points);

      layers.push({
        points,
        geometry,
        speeds,
        phases,
        halfX,
        halfZ,
        minY,
        maxY
      });
    }

    return layers;
  }

  createRain(root, config, multiplier) {
    const scaledCount = Math.floor(Math.max(0, toNumber(config.count, 420)) * multiplier);
    if (scaledCount <= 0) {
      return null;
    }

    const area = this.resolveArea(config.area, Math.max(this.roomSize[1] + 4, 10));
    const halfX = Math.max(1, area[0] * 0.5);
    const halfZ = Math.max(1, area[2] * 0.5);
    const minY = this.floorY + 0.05;
    const maxY = this.floorY + Math.max(1, area[1]);
    const positions = new Float32Array(scaledCount * 3);
    const speeds = new Float32Array(scaledCount);
    const phases = new Float32Array(scaledCount);
    const fallSpeed = Math.max(0.1, toNumber(config.fallSpeed, 8));

    for (let i = 0; i < scaledCount; i += 1) {
      const base = i * 3;
      positions[base] = THREE.MathUtils.randFloat(-halfX, halfX);
      positions[base + 1] = THREE.MathUtils.randFloat(minY, maxY);
      positions[base + 2] = THREE.MathUtils.randFloat(-halfZ, halfZ);
      phases[i] = Math.random() * Math.PI * 2;
      speeds[i] = THREE.MathUtils.randFloat(fallSpeed * 0.7, fallSpeed * 1.35);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: config.color || "#9cc7ff",
      size: Math.max(0.005, toNumber(config.size, 0.03)),
      transparent: true,
      opacity: toNumber(config.opacity, 0.55),
      depthWrite: false
    });
    const points = new THREE.Points(geometry, material);
    points.name = "theme-atmosphere-rain";
    points.frustumCulled = false;
    root.add(points);

    return {
      points,
      geometry,
      speeds,
      phases,
      minY,
      maxY,
      halfX,
      halfZ,
      drift: Math.max(0.01, fallSpeed * 0.08)
    };
  }

  async apply(config) {
    const token = ++this.applyToken;
    this.currentConfig = cloneConfig(config);
    this.clear();

    if (!config || typeof config !== "object") {
      return true;
    }

    const qualityName = this.getQualityName();
    const particleMultiplier = this.getParticleMultiplier();
    const domeConfig = resolveQualityConfig(config.dome, qualityName);
    const moonConfig = resolveQualityConfig(config.moon, qualityName);
    const cloudsConfig = resolveQualityConfig(config.clouds, qualityName);
    const rainConfig = resolveQualityConfig(config.rain, qualityName);

    const nextState = {
      root: new THREE.Group(),
      dome: null,
      moon: null,
      cloudLayers: [],
      rain: null
    };
    nextState.root.name = "theme-atmosphere-root";
    this.scene.add(nextState.root);

    try {
      if (domeConfig && domeConfig.enabled !== false) {
        nextState.dome = await this.createDome(nextState.root, domeConfig, token);
        if (token !== this.applyToken) {
          this.disposeState(nextState);
          return false;
        }
      }

      if (moonConfig?.enabled) {
        nextState.moon = await this.createMoon(nextState.root, moonConfig, token);
        if (token !== this.applyToken) {
          this.disposeState(nextState);
          return false;
        }
      }

      if (cloudsConfig?.enabled) {
        const layers = await this.createCloudLayers(
          nextState.root,
          cloudsConfig,
          particleMultiplier,
          token
        );
        if (token !== this.applyToken) {
          this.disposeState(nextState);
          return false;
        }
        nextState.cloudLayers = layers || [];
      }

      if (rainConfig?.enabled) {
        nextState.rain = this.createRain(nextState.root, rainConfig, particleMultiplier);
      }

      if (
        !nextState.dome &&
        !nextState.moon &&
        !nextState.cloudLayers.length &&
        !nextState.rain
      ) {
        this.disposeState(nextState);
        return true;
      }

      this.state = nextState;
      return true;
    } catch (error) {
      if (token === this.applyToken) {
        this.disposeState(nextState);
      }
      console.error("Failed to apply atmosphere config", error);
      return false;
    }
  }

  updateCloudLayers(deltaTime) {
    for (const layer of this.state?.cloudLayers || []) {
      const positions = layer.geometry.attributes.position.array;
      for (let i = 0; i < layer.speeds.length; i += 1) {
        const base = i * 3;
        const speed = layer.speeds[i];
        const phase = layer.phases[i];
        positions[base] += speed * deltaTime;
        positions[base + 2] += Math.sin(this.elapsed * 0.32 + phase) * Math.abs(speed) * 0.35 * deltaTime;
        positions[base + 1] += Math.sin(this.elapsed * 0.52 + phase * 0.7) * 0.03 * deltaTime;

        if (positions[base] > layer.halfX) positions[base] = -layer.halfX;
        if (positions[base] < -layer.halfX) positions[base] = layer.halfX;
        if (positions[base + 2] > layer.halfZ) positions[base + 2] = -layer.halfZ;
        if (positions[base + 2] < -layer.halfZ) positions[base + 2] = layer.halfZ;
        if (positions[base + 1] < layer.minY) positions[base + 1] = layer.maxY;
        if (positions[base + 1] > layer.maxY) positions[base + 1] = layer.minY;
      }
      layer.geometry.attributes.position.needsUpdate = true;
    }
  }

  updateRain(deltaTime) {
    const rain = this.state?.rain;
    if (!rain) {
      return;
    }
    const positions = rain.geometry.attributes.position.array;
    for (let i = 0; i < rain.speeds.length; i += 1) {
      const base = i * 3;
      positions[base + 1] -= rain.speeds[i] * deltaTime;
      positions[base] += Math.sin(this.elapsed * 4 + rain.phases[i]) * rain.drift * deltaTime;

      if (positions[base + 1] <= rain.minY) {
        positions[base] = THREE.MathUtils.randFloat(-rain.halfX, rain.halfX);
        positions[base + 1] = rain.maxY;
        positions[base + 2] = THREE.MathUtils.randFloat(-rain.halfZ, rain.halfZ);
      }

      if (positions[base] > rain.halfX) positions[base] = -rain.halfX;
      if (positions[base] < -rain.halfX) positions[base] = rain.halfX;
      if (positions[base + 2] > rain.halfZ) positions[base + 2] = -rain.halfZ;
      if (positions[base + 2] < -rain.halfZ) positions[base + 2] = rain.halfZ;
    }
    rain.geometry.attributes.position.needsUpdate = true;
  }

  update(deltaTime) {
    if (!this.state) {
      return;
    }
    this.elapsed += deltaTime;

    if (this.state.dome?.mesh && this.state.dome.rotationSpeed) {
      this.state.dome.mesh.rotation.y += this.state.dome.rotationSpeed * deltaTime;
    }

    if (this.state.moon) {
      this.state.moon.angle += this.state.moon.orbitSpeed * deltaTime;
      this.updateMoonTransform(this.state.moon);
    }

    this.updateCloudLayers(deltaTime);
    this.updateRain(deltaTime);
  }

  setQualityProfile(profile) {
    this.qualityProfile = profile || this.qualityProfile;
    if (this.currentConfig) {
      this.apply(this.currentConfig).catch(() => {});
    }
  }

  dispose() {
    this.applyToken += 1;
    this.currentConfig = null;
    this.clear();
  }
}
