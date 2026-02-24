const DRIFT_EVENT_TYPES = Object.freeze(["fogPulse", "ambientMix", "stabilityDelta"]);

const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  seed: "seperet-drift-v1",
  baseIntervalSeconds: { min: 20, max: 40 },
  maxConcurrentEvents: 2,
  eventWeights: {
    fogPulse: 0.42,
    ambientMix: 0.36,
    stabilityDelta: 0.22
  },
  events: {
    fogPulse: {
      enabled: true,
      chance: 1,
      durationSeconds: { min: 3, max: 7 },
      peakIntensity: { min: 0.08, max: 0.22 },
      nearScale: { min: 0.9, max: 1.02 },
      farScale: { min: 0.82, max: 0.98 },
      colorLerp: { min: 0.02, max: 0.12 }
    },
    ambientMix: {
      enabled: true,
      chance: 1,
      durationSeconds: { min: 5, max: 12 },
      layers: [
        "lobby_pad",
        "backrooms_buzz",
        "roman_aura",
        "inferno_rumble",
        "purgatory_void",
        "neon_pulse",
        "winter_air",
        "chime_metal",
        "night_woodland_wind",
        "fluorescent_drift",
        "far_traffic"
      ],
      maxLayerCount: 2,
      delta: { min: -0.2, max: 0.2 },
      minMagnitude: 0.04
    },
    stabilityDelta: {
      enabled: true,
      chance: 1,
      durationSeconds: { min: 4, max: 10 },
      delta: { min: -0.16, max: 0.16 }
    }
  }
});

const MAX_SPAWNS_PER_UPDATE = 128;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function toFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeRange(source, fallback, floor = -Infinity, ceiling = Infinity) {
  const min = clamp(
    toFiniteNumber(source?.min, fallback.min),
    floor,
    ceiling
  );
  const max = clamp(
    toFiniteNumber(source?.max, fallback.max),
    floor,
    ceiling
  );

  if (min <= max) {
    return { min, max };
  }

  return { min: max, max: min };
}

function normalizeLayers(value, fallback = []) {
  const source = Array.isArray(value) ? value : fallback;
  const seen = new Set();
  const output = [];

  for (const entry of source) {
    const id = typeof entry === "string" ? entry.trim() : "";
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    output.push(id);
  }

  return output;
}

function normalizeEventWeights(value, eventsConfig) {
  const source = isObject(value) ? value : {};
  let total = 0;
  const normalized = {};

  for (const type of DRIFT_EVENT_TYPES) {
    const eventEnabled = eventsConfig[type]?.enabled !== false;
    const weight = eventEnabled ? Math.max(0, toFiniteNumber(source[type], DEFAULT_CONFIG.eventWeights[type])) : 0;
    normalized[type] = weight;
    total += weight;
  }

  if (total > 0) {
    return normalized;
  }

  return {
    fogPulse: eventsConfig.fogPulse.enabled ? 1 : 0,
    ambientMix: eventsConfig.ambientMix.enabled ? 1 : 0,
    stabilityDelta: eventsConfig.stabilityDelta.enabled ? 1 : 0
  };
}

function xmur3(seedText) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i += 1) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createSeededRandom(seed) {
  const hashed = xmur3(String(seed || DEFAULT_CONFIG.seed));
  return mulberry32(hashed());
}

function sineEnvelope(progress) {
  const clamped = clamp01(progress);
  return Math.sin(clamped * Math.PI);
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function deepCloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createNeutralSnapshot(timeSeconds, seed, nextEventAt) {
  return {
    timeSeconds: round(timeSeconds, 4),
    seed,
    nextEventInSeconds: round(Math.max(0, nextEventAt - timeSeconds), 4),
    activeEvents: [],
    fogPulse: {
      intensity: 0,
      nearScale: 1,
      farScale: 1,
      colorLerp: 0
    },
    ambientMix: {},
    stabilityDelta: 0
  };
}

function normalizeConfig(rawConfig = {}) {
  const source = isObject(rawConfig) ? rawConfig : {};
  const sourceEvents = isObject(source.events) ? source.events : {};

  const fogPulse = {
    enabled: sourceEvents.fogPulse?.enabled !== false,
    chance: clamp01(toFiniteNumber(sourceEvents.fogPulse?.chance, DEFAULT_CONFIG.events.fogPulse.chance)),
    durationSeconds: normalizeRange(
      sourceEvents.fogPulse?.durationSeconds,
      DEFAULT_CONFIG.events.fogPulse.durationSeconds,
      0.25,
      120
    ),
    peakIntensity: normalizeRange(
      sourceEvents.fogPulse?.peakIntensity,
      DEFAULT_CONFIG.events.fogPulse.peakIntensity,
      0,
      1
    ),
    nearScale: normalizeRange(
      sourceEvents.fogPulse?.nearScale,
      DEFAULT_CONFIG.events.fogPulse.nearScale,
      0.6,
      1.4
    ),
    farScale: normalizeRange(
      sourceEvents.fogPulse?.farScale,
      DEFAULT_CONFIG.events.fogPulse.farScale,
      0.6,
      1.4
    ),
    colorLerp: normalizeRange(
      sourceEvents.fogPulse?.colorLerp,
      DEFAULT_CONFIG.events.fogPulse.colorLerp,
      0,
      1
    )
  };

  const ambientMix = {
    enabled: sourceEvents.ambientMix?.enabled !== false,
    chance: clamp01(toFiniteNumber(sourceEvents.ambientMix?.chance, DEFAULT_CONFIG.events.ambientMix.chance)),
    durationSeconds: normalizeRange(
      sourceEvents.ambientMix?.durationSeconds,
      DEFAULT_CONFIG.events.ambientMix.durationSeconds,
      0.25,
      180
    ),
    layers: normalizeLayers(
      sourceEvents.ambientMix?.layers,
      DEFAULT_CONFIG.events.ambientMix.layers
    ),
    maxLayerCount: clamp(
      Math.round(toFiniteNumber(sourceEvents.ambientMix?.maxLayerCount, DEFAULT_CONFIG.events.ambientMix.maxLayerCount)),
      1,
      8
    ),
    delta: normalizeRange(
      sourceEvents.ambientMix?.delta,
      DEFAULT_CONFIG.events.ambientMix.delta,
      -1,
      1
    ),
    minMagnitude: clamp(
      toFiniteNumber(sourceEvents.ambientMix?.minMagnitude, DEFAULT_CONFIG.events.ambientMix.minMagnitude),
      0,
      1
    )
  };

  const stabilityDelta = {
    enabled: sourceEvents.stabilityDelta?.enabled !== false,
    chance: clamp01(
      toFiniteNumber(sourceEvents.stabilityDelta?.chance, DEFAULT_CONFIG.events.stabilityDelta.chance)
    ),
    durationSeconds: normalizeRange(
      sourceEvents.stabilityDelta?.durationSeconds,
      DEFAULT_CONFIG.events.stabilityDelta.durationSeconds,
      0.25,
      180
    ),
    delta: normalizeRange(
      sourceEvents.stabilityDelta?.delta,
      DEFAULT_CONFIG.events.stabilityDelta.delta,
      -1,
      1
    )
  };

  const normalized = {
    enabled: source.enabled !== false,
    seed:
      typeof source.seed === "string" && source.seed.trim()
        ? source.seed.trim()
        : DEFAULT_CONFIG.seed,
    baseIntervalSeconds: normalizeRange(
      source.baseIntervalSeconds,
      DEFAULT_CONFIG.baseIntervalSeconds,
      0.25,
      600
    ),
    maxConcurrentEvents: clamp(
      Math.round(toFiniteNumber(source.maxConcurrentEvents, DEFAULT_CONFIG.maxConcurrentEvents)),
      1,
      8
    ),
    events: {
      fogPulse,
      ambientMix,
      stabilityDelta
    },
    eventWeights: {}
  };

  normalized.eventWeights = normalizeEventWeights(source.eventWeights, normalized.events);
  return normalized;
}

export class DriftEventsSystem {
  constructor(config = {}) {
    this.config = normalizeConfig(config);
    this.seed = this.config.seed;
    this.random = createSeededRandom(this.seed);
    this.timeSeconds = 0;
    this.eventCounter = 0;
    this.activeEvents = [];
    this.nextEventAt = this.sampleInterval();
    this.lastSnapshot = createNeutralSnapshot(this.timeSeconds, this.seed, this.nextEventAt);
  }

  sampleUnit() {
    return this.random();
  }

  sampleRange(range) {
    return range.min + (range.max - range.min) * this.sampleUnit();
  }

  sampleInterval() {
    return this.sampleRange(this.config.baseIntervalSeconds);
  }

  setConfig(nextConfig = {}) {
    this.config = normalizeConfig(nextConfig);
    this.reset(this.config.seed);
  }

  reset(seed = this.config.seed) {
    this.seed = typeof seed === "string" && seed.trim() ? seed.trim() : DEFAULT_CONFIG.seed;
    this.random = createSeededRandom(this.seed);
    this.timeSeconds = 0;
    this.eventCounter = 0;
    this.activeEvents = [];
    this.nextEventAt = this.sampleInterval();
    this.lastSnapshot = createNeutralSnapshot(this.timeSeconds, this.seed, this.nextEventAt);
    return this.getSnapshot();
  }

  chooseEventType() {
    const enabledTypes = DRIFT_EVENT_TYPES.filter((type) => {
      return this.config.events[type]?.enabled && this.config.eventWeights[type] > 0;
    });
    if (!enabledTypes.length) {
      return null;
    }

    const totalWeight = enabledTypes.reduce((sum, type) => sum + this.config.eventWeights[type], 0);
    if (totalWeight <= 0) {
      return null;
    }

    let roll = this.sampleUnit() * totalWeight;
    for (const type of enabledTypes) {
      roll -= this.config.eventWeights[type];
      if (roll <= 0) {
        return type;
      }
    }

    return enabledTypes[enabledTypes.length - 1];
  }

  createFogPulsePayload(config) {
    return {
      peakIntensity: this.sampleRange(config.peakIntensity),
      nearScale: this.sampleRange(config.nearScale),
      farScale: this.sampleRange(config.farScale),
      colorLerp: this.sampleRange(config.colorLerp)
    };
  }

  createAmbientMixPayload(config) {
    const layers = normalizeLayers(config.layers);
    if (!layers.length) {
      return null;
    }

    const shuffled = layers.slice();
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.sampleUnit() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const maxCount = Math.min(config.maxLayerCount, shuffled.length);
    const layerCount = clamp(1 + Math.floor(this.sampleUnit() * maxCount), 1, maxCount);
    const selected = shuffled.slice(0, layerCount);

    const deltas = {};
    for (const layerId of selected) {
      let delta = this.sampleRange(config.delta);
      if (Math.abs(delta) < config.minMagnitude) {
        const sign = this.sampleUnit() < 0.5 ? -1 : 1;
        delta = sign * config.minMagnitude;
      }
      deltas[layerId] = round(clamp(delta, -1, 1), 4);
    }

    return { deltas };
  }

  createStabilityDeltaPayload(config) {
    return {
      delta: round(clamp(this.sampleRange(config.delta), -1, 1), 4)
    };
  }

  createEvent(type, startTimeSeconds) {
    const eventConfig = this.config.events[type];
    if (!eventConfig?.enabled) {
      return null;
    }
    if (this.sampleUnit() > eventConfig.chance) {
      return null;
    }

    let payload = null;
    if (type === "fogPulse") {
      payload = this.createFogPulsePayload(eventConfig);
    } else if (type === "ambientMix") {
      payload = this.createAmbientMixPayload(eventConfig);
    } else if (type === "stabilityDelta") {
      payload = this.createStabilityDeltaPayload(eventConfig);
    }

    if (!payload) {
      return null;
    }

    const durationSeconds = this.sampleRange(eventConfig.durationSeconds);
    return {
      id: `${type}:${this.eventCounter}`,
      type,
      startTimeSeconds,
      endTimeSeconds: startTimeSeconds + durationSeconds,
      durationSeconds,
      payload
    };
  }

  spawnEventsUntilCurrentTime() {
    let spawnCount = 0;
    while (this.timeSeconds >= this.nextEventAt && spawnCount < MAX_SPAWNS_PER_UPDATE) {
      if (this.activeEvents.length < this.config.maxConcurrentEvents) {
        const type = this.chooseEventType();
        if (type) {
          this.eventCounter += 1;
          const event = this.createEvent(type, this.nextEventAt);
          if (event) {
            this.activeEvents.push(event);
          }
        }
      }
      this.nextEventAt += this.sampleInterval();
      spawnCount += 1;
    }

    if (spawnCount >= MAX_SPAWNS_PER_UPDATE && this.nextEventAt <= this.timeSeconds) {
      this.nextEventAt = this.timeSeconds + this.sampleInterval();
    }
  }

  pruneExpiredEvents() {
    this.activeEvents = this.activeEvents.filter((event) => event.endTimeSeconds > this.timeSeconds);
  }

  composeSnapshot() {
    const snapshot = createNeutralSnapshot(this.timeSeconds, this.seed, this.nextEventAt);

    for (const event of this.activeEvents) {
      if (this.timeSeconds < event.startTimeSeconds || this.timeSeconds >= event.endTimeSeconds) {
        continue;
      }

      const progress = clamp01(
        (this.timeSeconds - event.startTimeSeconds) / Math.max(0.0001, event.durationSeconds)
      );
      const envelope = sineEnvelope(progress);

      snapshot.activeEvents.push({
        id: event.id,
        type: event.type,
        progress: round(progress, 4),
        envelope: round(envelope, 4),
        endTimeSeconds: round(event.endTimeSeconds, 4)
      });

      if (event.type === "fogPulse") {
        snapshot.fogPulse.intensity = clamp01(
          snapshot.fogPulse.intensity + event.payload.peakIntensity * envelope
        );
        snapshot.fogPulse.nearScale *= 1 + (event.payload.nearScale - 1) * envelope;
        snapshot.fogPulse.farScale *= 1 + (event.payload.farScale - 1) * envelope;
        snapshot.fogPulse.colorLerp = clamp01(
          snapshot.fogPulse.colorLerp + event.payload.colorLerp * envelope
        );
      }

      if (event.type === "ambientMix") {
        for (const [layerId, delta] of Object.entries(event.payload.deltas)) {
          const current = snapshot.ambientMix[layerId] || 0;
          snapshot.ambientMix[layerId] = clamp(current + delta * envelope, -1, 1);
        }
      }

      if (event.type === "stabilityDelta") {
        snapshot.stabilityDelta = clamp(
          snapshot.stabilityDelta + event.payload.delta * envelope,
          -1,
          1
        );
      }
    }

    snapshot.fogPulse.intensity = round(snapshot.fogPulse.intensity, 4);
    snapshot.fogPulse.nearScale = round(clamp(snapshot.fogPulse.nearScale, 0.6, 1.4), 4);
    snapshot.fogPulse.farScale = round(clamp(snapshot.fogPulse.farScale, 0.6, 1.4), 4);
    snapshot.fogPulse.colorLerp = round(snapshot.fogPulse.colorLerp, 4);
    snapshot.stabilityDelta = round(snapshot.stabilityDelta, 4);

    const ambientMix = {};
    for (const [layerId, value] of Object.entries(snapshot.ambientMix)) {
      ambientMix[layerId] = round(clamp(value, -1, 1), 4);
    }
    snapshot.ambientMix = ambientMix;
    return snapshot;
  }

  advance(deltaSeconds = 0) {
    const safeDelta = clamp(toFiniteNumber(deltaSeconds, 0), 0, 60);
    this.timeSeconds += safeDelta;

    if (!this.config.enabled) {
      this.pruneExpiredEvents();
      this.lastSnapshot = createNeutralSnapshot(this.timeSeconds, this.seed, this.nextEventAt);
      return this.getSnapshot();
    }

    this.spawnEventsUntilCurrentTime();
    this.pruneExpiredEvents();
    this.lastSnapshot = this.composeSnapshot();
    return this.getSnapshot();
  }

  update(deltaSeconds = 0) {
    return this.advance(deltaSeconds);
  }

  seek(timeSeconds = 0) {
    const target = Math.max(0, toFiniteNumber(timeSeconds, 0));
    if (target < this.timeSeconds) {
      const seed = this.seed;
      this.reset(seed);
    }
    return this.advance(target - this.timeSeconds);
  }

  getSnapshot() {
    return deepCloneJson(this.lastSnapshot);
  }
}

export function normalizeDriftEventsConfig(config) {
  return normalizeConfig(config);
}

export { DRIFT_EVENT_TYPES };
