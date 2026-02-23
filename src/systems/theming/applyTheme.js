import * as THREE from "three";
import { createProceduralTexture } from "../../engine/proceduralTextures.js";
import { ParticleSystem } from "./particles.js";
import { AtmosphereSystem } from "./atmosphere.js";

function cloneRoomConfig(roomConfig) {
  return JSON.parse(JSON.stringify(roomConfig));
}

function formatThemeLabel(id) {
  return String(id)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function mergeRoomConfig(baseConfig, roomOverrides = {}) {
  const merged = cloneRoomConfig(baseConfig);
  for (const key of Object.keys(roomOverrides)) {
    merged[key] = {
      ...(merged[key] || {}),
      ...(roomOverrides[key] || {})
    };
  }
  return merged;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rangesOverlap(minA, maxA, minB, maxB) {
  return minA <= maxB && maxA >= minB;
}

function boxesOverlap2D(a, b) {
  return (
    rangesOverlap(a.minX, a.maxX, b.minX, b.maxX) &&
    rangesOverlap(a.minZ, a.maxZ, b.minZ, b.maxZ)
  );
}

function normalizeScale(scale) {
  if (!Array.isArray(scale)) {
    return [1, 1, 1];
  }
  return [Math.abs(scale[0] || 1), Math.abs(scale[1] || 1), Math.abs(scale[2] || 1)];
}

function estimatePropBounds2D(prop) {
  const position = Array.isArray(prop?.position) ? prop.position : [0, 0, 0];
  const [sx, sy, sz] = normalizeScale(prop?.scale);
  let widthX = sx;
  let depthZ = sz;

  if (prop?.type === "primitive") {
    const primitive = prop.primitive || "box";
    if (primitive === "plane") {
      widthX = sx;
      depthZ = Math.max(0.35, sy);
    } else if (primitive === "cylinder" || primitive === "sphere") {
      const diameter = Math.max(sx, sz);
      widthX = diameter;
      depthZ = diameter;
    }
  }

  return {
    minX: (position[0] || 0) - widthX * 0.5,
    maxX: (position[0] || 0) + widthX * 0.5,
    minZ: (position[2] || 0) - depthZ * 0.5,
    maxZ: (position[2] || 0) + depthZ * 0.5
  };
}

function computeDoorClearanceZones(roomConfig = {}) {
  const size = Array.isArray(roomConfig.size) ? roomConfig.size : [30, 8, 30];
  const width = size[0] || 30;
  const depth = size[2] || 30;
  const zones = [];

  const sideDoorways = roomConfig.sideDoorways || {};
  if (sideDoorways.enabled !== false) {
    const doorwayWidth = clamp(sideDoorways.width ?? 3.8, 1.5, Math.max(1.5, depth - 1));
    const centerZ = sideDoorways.centerZ ?? 0;
    const zHalf = doorwayWidth * 0.5 + 1.05;
    const xBand = 2.25;
    zones.push({
      id: "eastDoorway",
      minX: width * 0.5 - xBand,
      maxX: width * 0.5 + 0.42,
      minZ: centerZ - zHalf,
      maxZ: centerZ + zHalf
    });
    zones.push({
      id: "westDoorway",
      minX: -width * 0.5 - 0.42,
      maxX: -width * 0.5 + xBand,
      minZ: centerZ - zHalf,
      maxZ: centerZ + zHalf
    });
  }

  const frontEntrance = roomConfig.frontEntrance || {};
  if (frontEntrance.enabled) {
    const doorwayWidth = clamp(frontEntrance.width ?? 4.2, 1.6, Math.max(1.6, width - 1.6));
    const centerX = clamp(
      frontEntrance.centerX ?? 0,
      -width * 0.5 + doorwayWidth * 0.5 + 0.4,
      width * 0.5 - doorwayWidth * 0.5 - 0.4
    );
    const xHalf = doorwayWidth * 0.5 + 1.2;
    zones.push({
      id: "frontEntrance",
      minX: centerX - xHalf,
      maxX: centerX + xHalf,
      minZ: depth * 0.5 - 2.4,
      maxZ: depth * 0.5 + 0.62
    });
  }

  return zones;
}

function filterThemePropsForDoorways(props, roomConfig) {
  const source = Array.isArray(props) ? props : [];
  if (!source.length) {
    return source;
  }
  const zones = computeDoorClearanceZones(roomConfig);
  if (!zones.length) {
    return source;
  }

  return source.filter((prop) => {
    if (!prop || prop.allowDoorwayBlock === true) {
      return true;
    }
    const bounds = estimatePropBounds2D(prop);
    for (const zone of zones) {
      if (boxesOverlap2D(bounds, zone)) {
        return false;
      }
    }
    return true;
  });
}

async function resolveTexture(config, cache) {
  if (!config) {
    return null;
  }

  if (config.procedural) {
    const texture = createProceduralTexture(config.procedural);
    if (texture) {
      texture.userData = texture.userData || {};
      texture.userData.disposeWithMaterial = true;
    }
    return texture;
  }

  if (config.texture) {
    const loaded = await cache.loadTexture(config.texture);
    return loaded || null;
  }

  return null;
}

function disposeOwnedTexture(texture) {
  if (texture?.userData?.disposeWithMaterial) {
    texture.dispose();
  }
}

function applyTextureRepeat(texture, repeat) {
  if (!texture || !Array.isArray(repeat)) {
    return;
  }
  texture.repeat.set(repeat[0] || 1, repeat[1] || 1);
}

async function applyMaterialFromConfig(material, config, cache, animatedTextures) {
  disposeOwnedTexture(material.map);
  disposeOwnedTexture(material.emissiveMap);
  material.color.set(config.color || "#777777");
  material.map = null;
  material.emissiveMap = null;
  material.emissive.set(config.emissiveColor || "#000000");
  material.emissiveIntensity = config.emissiveIntensity ?? 0;
  material.roughness = config.roughness ?? material.roughness ?? 0.9;
  material.metalness = config.metalness ?? material.metalness ?? 0.02;

  const mapTexture = await resolveTexture(config, cache);
  if (mapTexture) {
    applyTextureRepeat(mapTexture, config.textureRepeat);
    material.map = mapTexture;
  }

  if (config.emissiveMap === "$map" && mapTexture) {
    material.emissiveMap = mapTexture;
  } else if (config.emissiveMap) {
    const emissiveTexture = await cache.loadTexture(config.emissiveMap);
    if (emissiveTexture) {
      applyTextureRepeat(emissiveTexture, config.textureRepeat);
      material.emissiveMap = emissiveTexture;
    }
  }

  if (Array.isArray(config.textureScroll) && mapTexture) {
    animatedTextures.push({
      texture: mapTexture,
      scrollX: config.textureScroll[0] || 0,
      scrollY: config.textureScroll[1] || 0,
      animatedImage: Boolean(config.animatedTexture)
    });
  } else if (config.animatedTexture && mapTexture) {
    animatedTextures.push({
      texture: mapTexture,
      scrollX: 0,
      scrollY: 0,
      animatedImage: true
    });
  }

  material.needsUpdate = true;
}

function createThemeLight(lightConfig, qualityProfile) {
  const type = lightConfig.type || "point";
  let light = null;

  if (type === "ambient") {
    light = new THREE.AmbientLight(
      lightConfig.color || "#ffffff",
      lightConfig.intensity ?? 0.2
    );
  } else if (type === "directional") {
    light = new THREE.DirectionalLight(
      lightConfig.color || "#ffffff",
      lightConfig.intensity ?? 1
    );
    const targetPos = lightConfig.target || [0, 0, 0];
    light.target.position.set(targetPos[0] || 0, targetPos[1] || 0, targetPos[2] || 0);
    light.userData.target = light.target;
  } else if (type === "spot") {
    light = new THREE.SpotLight(
      lightConfig.color || "#ffffff",
      lightConfig.intensity ?? 1,
      lightConfig.distance ?? 30,
      lightConfig.angle ?? 0.55,
      lightConfig.penumbra ?? 0.35
    );
    const targetPos = lightConfig.target || [0, 0, 0];
    light.target.position.set(targetPos[0] || 0, targetPos[1] || 0, targetPos[2] || 0);
    light.userData.target = light.target;
  } else {
    light = new THREE.PointLight(
      lightConfig.color || "#ffffff",
      lightConfig.intensity ?? 1,
      lightConfig.distance ?? 28
    );
  }

  if (!light.isAmbientLight) {
    const position = lightConfig.position || [0, 4, 0];
    light.position.set(position[0] || 0, position[1] || 0, position[2] || 0);
    light.userData.canCastShadow = Boolean(lightConfig.castShadow);
    light.castShadow = Boolean(light.userData.canCastShadow && qualityProfile?.shadows);
  }

  return light;
}

export function resolveInitialThemeName(themesConfig) {
  const themeNames = Object.keys(themesConfig.themes || {});
  if (!themeNames.length) {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  const queryTheme = params.get("theme");
  if (queryTheme && themesConfig.themes[queryTheme]) {
    return queryTheme;
  }

  if (themesConfig.autoThemeByMonth?.enabled) {
    const month = new Date().getMonth() + 1;
    const mapped = themesConfig.autoThemeByMonth?.map?.[String(month)];
    if (mapped && themesConfig.themes[mapped]) {
      return mapped;
    }
  }

  if (themesConfig.defaultTheme && themesConfig.themes[themesConfig.defaultTheme]) {
    return themesConfig.defaultTheme;
  }

  return themeNames[0];
}

export class ThemeSystem {
  constructor({
    scene,
    sceneContext,
    cache,
    themesConfig,
    audioSystem,
    qualityProfile
  }) {
    this.scene = scene;
    this.sceneContext = sceneContext;
    this.cache = cache;
    this.themesConfig = themesConfig;
    this.audioSystem = audioSystem;
    this.qualityProfile = qualityProfile;
    this.particles = new ParticleSystem(scene, sceneContext.floorY);
    this.atmosphere = new AtmosphereSystem({
      scene,
      cache,
      floorY: sceneContext.floorY,
      roomSize: sceneContext.roomConfig?.size,
      qualityProfile
    });
    this.currentThemeName = null;
    this.themeLights = [];
    this.animatedTextures = [];
    this.applyToken = 0;
  }

  listThemes() {
    const themes = this.themesConfig?.themes;
    if (!themes || typeof themes !== "object") {
      return [];
    }

    return Object.entries(themes)
      .map(([id, value]) => {
        const normalizedId = typeof id === "string" ? id.trim() : "";
        if (!normalizedId) {
          return null;
        }
        const label =
          typeof value?.label === "string" && value.label.trim()
            ? value.label.trim()
            : formatThemeLabel(normalizedId);
        return {
          id: normalizedId,
          label
        };
      })
      .filter(Boolean);
  }

  setQualityProfile(profile) {
    this.qualityProfile = profile;
    if (this.currentThemeName) {
      this.applyTheme(this.currentThemeName).catch(() => {});
    } else {
      this.atmosphere.setQualityProfile(profile);
    }
  }

  clearThemeLights() {
    for (const light of this.themeLights) {
      this.scene.remove(light);
      if (light.userData?.target) {
        this.scene.remove(light.userData.target);
      }
    }
    this.themeLights.length = 0;
  }

  resetToBaseState() {
    this.clearThemeLights();
    this.sceneContext.resetThemeFloorplan?.();
    this.sceneContext.removePropsByTag("theme-extra");
    this.animatedTextures = [];
    this.atmosphere.clear();

    this.sceneContext.lights.forEach((light, index) => {
      const base = this.sceneContext.baseLightState[index];
      if (base?.color) {
        light.color.set(base.color);
      }
      if (base?.intensity != null) {
        light.intensity = base.intensity;
      }
      if (light.isPointLight) {
        light.castShadow = Boolean(light.userData.canCastShadow && this.qualityProfile?.shadows);
      }
    });

    const fog = this.sceneContext.baseFogState;
    if (fog && this.scene.fog) {
      this.scene.fog.color = new THREE.Color(fog.color);
      this.scene.fog.near = fog.near;
      this.scene.fog.far = fog.far;
      this.scene.background = new THREE.Color(fog.color);
    }

    for (const portal of this.sceneContext.portals || []) {
      portal.resetStyle?.();
    }
    this.particles.setEffect(
      null,
      this.qualityProfile?.particleMultiplier || 1,
      this.sceneContext.roomConfig.size
    );
    this.audioSystem.setAmbientMix({});
  }

  async applyTheme(themeName) {
    const token = ++this.applyToken;
    const theme =
      this.themesConfig.themes?.[themeName] ||
      this.themesConfig.themes?.[this.themesConfig.defaultTheme];

    if (!theme) {
      return false;
    }

    try {
      this.animatedTextures = [];

      const mergedRoomConfig = mergeRoomConfig(
        this.sceneContext.roomConfig,
        theme.roomOverrides || {}
      );

      await Promise.all([
        applyMaterialFromConfig(
          this.sceneContext.roomMaterials.wall,
          mergedRoomConfig.wallMaterial || {},
          this.cache,
          this.animatedTextures
        ),
        applyMaterialFromConfig(
          this.sceneContext.roomMaterials.floor,
          mergedRoomConfig.floorMaterial || {},
          this.cache,
          this.animatedTextures
        ),
        applyMaterialFromConfig(
          this.sceneContext.roomMaterials.ceiling,
          mergedRoomConfig.ceilingMaterial || {},
          this.cache,
          this.animatedTextures
        )
      ]);
      if (token !== this.applyToken) {
        return false;
      }

      this.sceneContext.applyThemeFloorplan?.(theme.floorplan || null);
      if (token !== this.applyToken) {
        return false;
      }

      const fog = theme.fog;
      if (fog && this.scene.fog) {
        this.scene.fog.color = new THREE.Color(fog.color || "#444444");
        this.scene.fog.near = fog.near ?? this.scene.fog.near;
        this.scene.fog.far = fog.far ?? this.scene.fog.far;
        this.scene.background = new THREE.Color(fog.color || "#333333");
      }

      this.sceneContext.lights.forEach((light, index) => {
        const base = this.sceneContext.baseLightState[index];
        if (base?.color) {
          light.color.set(base.color);
        }
        if (base?.intensity != null) {
          light.intensity = base.intensity;
        }
        if (light.isPointLight) {
          light.castShadow = Boolean(light.userData.canCastShadow && this.qualityProfile?.shadows);
        }
      });

      if (theme.disableBaseLights) {
        for (const light of this.sceneContext.lights) {
          if (light.userData?.preserveInThemes) {
            continue;
          }
          light.intensity = 0;
        }
      } else {
        for (const override of theme.lights || []) {
          const light = this.sceneContext.lights[override.index];
          if (!light) {
            continue;
          }
          if (override.color) {
            light.color.set(override.color);
          }
          if (override.intensity != null) {
            light.intensity = override.intensity;
          }
        }
      }
      if (token !== this.applyToken) {
        return false;
      }

      this.clearThemeLights();
      for (const lightConfig of theme.additionalLights || []) {
        const light = createThemeLight(lightConfig, this.qualityProfile);
        this.scene.add(light);
        if (light.userData?.target) {
          this.scene.add(light.userData.target);
        }
        this.themeLights.push(light);
      }
      if (token !== this.applyToken) {
        return false;
      }

      this.sceneContext.removePropsByTag("theme-extra");
      const doorwaySafeProps = filterThemePropsForDoorways(
        theme.additionalProps || [],
        this.sceneContext.roomConfig || {}
      );
      await this.sceneContext.addProps(doorwaySafeProps, {
        tag: "theme-extra",
        shouldCancel: () => token !== this.applyToken
      });
      if (token !== this.applyToken) {
        this.sceneContext.removePropsByTag("theme-extra");
        return false;
      }

      const globalPortalStyle = theme.portalStyle || {};
      const portalStyles = theme.portalStyles || {};
      for (const portal of this.sceneContext.portals || []) {
        const style = {
          ...globalPortalStyle,
          ...(portalStyles[portal.id] || {})
        };
        portal.applyStyle?.(style);
      }

      this.audioSystem.setAmbientMix(theme.ambientAudioMix || {});
      const effectConfig = theme.particles?.effect
        ? theme.particles.effect
        : theme.particles?.snow?.enabled
          ? {
              type: "snow",
              ...theme.particles.snow
            }
          : null;
      this.particles.setEffect(
        effectConfig,
        this.qualityProfile?.particleMultiplier || 1,
        this.sceneContext.roomConfig.size
      );
      await this.atmosphere.apply(theme.atmosphere || null);
      if (token !== this.applyToken) {
        return false;
      }
      this.currentThemeName = themeName;
      return true;
    } catch (error) {
      console.error(`Failed to apply theme: ${themeName}`, error);
      this.resetToBaseState();
      return false;
    }
  }

  update(deltaTime) {
    this.particles.update(deltaTime);
    this.atmosphere.update(deltaTime);
    const allAnimated = [
      ...(this.sceneContext.animatedTextures || []),
      ...this.animatedTextures
    ];
    for (const entry of allAnimated) {
      const updateFrame = entry.texture.userData?.updateFrame;
      if (typeof updateFrame === "function") {
        updateFrame(deltaTime);
      }
      entry.texture.offset.x += entry.scrollX * deltaTime;
      entry.texture.offset.y += entry.scrollY * deltaTime;
      if (entry.animatedImage) {
        entry.texture.needsUpdate = true;
      }
    }
  }

  dispose() {
    this.particles.dispose();
    this.atmosphere.dispose();
    this.clearThemeLights();
  }
}
