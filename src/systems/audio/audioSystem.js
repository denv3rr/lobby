import { resolvePublicPath } from "../../utils/path.js";

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function createWhiteNoiseBuffer(context, durationSeconds = 2) {
  const length = Math.floor(context.sampleRate * durationSeconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    channel[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function defaultSynthForLayer(id) {
  if (id.includes("backrooms")) return { type: "industrial", frequency: 60 };
  if (id.includes("roman")) return { type: "fog", frequency: 150 };
  if (id.includes("inferno")) return { type: "rumble", frequency: 44 };
  if (id.includes("purgatory")) return { type: "radio", frequency: 980 };
  if (id.includes("neon")) return { type: "lowPulse", frequency: 52, lfoRate: 0.18 };
  if (id.includes("winter")) return { type: "wind", frequency: 950 };
  if (id.includes("chime")) return { type: "distantMetal", baseFrequency: 210 };
  return { type: "fog", frequency: 128 };
}

function createOscillator(context, type, frequency = 220, detune = 0) {
  const osc = context.createOscillator();
  osc.type = type;
  osc.frequency.value = frequency;
  osc.detune.value = detune;
  return osc;
}

export class AudioSystem {
  constructor(audioConfig = {}) {
    this.audioConfig = audioConfig;
    this.ambientLayers = new Map();
    this.sfxMap = audioConfig.sfx || {};
    this.zoneState = new Map();
    this.enabled = false;
    this.stepAccumulator = 0;
    this.currentSurface = "tile";
    this.currentMix = {};

    this.audioContext = null;
    this.noiseBuffer = null;
  }

  initialize() {
    for (const layer of this.audioConfig.ambientLayers || []) {
      const state = {
        id: layer.id,
        config: layer,
        baseVolume: layer.volume ?? 0.2,
        alwaysOn: Boolean(layer.alwaysOn),
        multiplier: 0,
        outputGain: null,
        teardown: null,
        htmlAudio: null,
        started: false
      };

      if (layer.src) {
        const audio = new Audio(resolvePublicPath(layer.src));
        audio.loop = Boolean(layer.loop);
        audio.preload = "auto";
        audio.crossOrigin = "anonymous";
        audio.volume = 0;
        state.htmlAudio = audio;
      }

      this.ambientLayers.set(layer.id, state);
    }
  }

  ensureAudioContext() {
    if (!this.audioContext) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new Ctx();
    }
    if (!this.noiseBuffer) {
      this.noiseBuffer = createWhiteNoiseBuffer(this.audioContext);
    }
    return this.audioContext;
  }

  applyLayerVolume(state) {
    const volume = clamp01(state.baseVolume * state.multiplier);
    if (state.outputGain) {
      state.outputGain.gain.setTargetAtTime(
        volume,
        this.audioContext.currentTime,
        0.18
      );
    }
    if (state.htmlAudio) {
      state.htmlAudio.volume = volume;
    }
  }

  buildSynthLayer(state) {
    const context = this.ensureAudioContext();
    const synth = state.config.synth || defaultSynthForLayer(state.id);
    const output = context.createGain();
    output.gain.value = 0;
    output.connect(context.destination);

    if (synth.type === "fog") {
      const noise = context.createBufferSource();
      noise.buffer = this.noiseBuffer;
      noise.loop = true;
      const band = context.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = synth.frequency || 150;
      band.Q.value = 0.6;
      const low = context.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.value = synth.cutoff || 760;
      const noiseGain = context.createGain();
      noiseGain.gain.value = 0.22;
      const sub = createOscillator(context, "sine", Math.max(28, (synth.frequency || 150) * 0.35));
      const subGain = context.createGain();
      subGain.gain.value = 0.035;
      const lfo = createOscillator(context, "sine", 0.06);
      const lfoGain = context.createGain();
      lfoGain.gain.value = 45;
      lfo.connect(lfoGain).connect(band.frequency);

      noise.connect(band).connect(low).connect(noiseGain).connect(output);
      sub.connect(subGain).connect(output);
      noise.start();
      sub.start();
      lfo.start();

      return {
        output,
        stop() {
          noise.stop();
          sub.stop();
          lfo.stop();
          band.disconnect();
          low.disconnect();
          noiseGain.disconnect();
          subGain.disconnect();
          lfoGain.disconnect();
          output.disconnect();
        }
      };
    }

    if (synth.type === "industrial") {
      const mains = createOscillator(context, "sine", synth.frequency || 60);
      const harmonic = createOscillator(context, "triangle", (synth.frequency || 60) * 2, 1.5);
      const humGain = context.createGain();
      humGain.gain.value = 0.07;

      const noise = context.createBufferSource();
      noise.buffer = this.noiseBuffer;
      noise.loop = true;
      const hissBand = context.createBiquadFilter();
      hissBand.type = "bandpass";
      hissBand.frequency.value = synth.hissFrequency || 2100;
      hissBand.Q.value = 0.8;
      const hissGain = context.createGain();
      hissGain.gain.value = 0.08;
      const flutter = createOscillator(context, "sine", synth.flutterRate || 0.34);
      const flutterDepth = context.createGain();
      flutterDepth.gain.value = 420;
      flutter.connect(flutterDepth).connect(hissBand.frequency);

      mains.connect(humGain);
      harmonic.connect(humGain);
      humGain.connect(output);
      noise.connect(hissBand).connect(hissGain).connect(output);
      mains.start();
      harmonic.start();
      noise.start();
      flutter.start();

      return {
        output,
        stop() {
          mains.stop();
          harmonic.stop();
          noise.stop();
          flutter.stop();
          humGain.disconnect();
          hissBand.disconnect();
          hissGain.disconnect();
          flutterDepth.disconnect();
          output.disconnect();
        }
      };
    }

    if (synth.type === "hum") {
      const oscA = createOscillator(context, "sine", synth.frequency || 58);
      const oscB = createOscillator(
        context,
        "triangle",
        (synth.frequency || 58) * 2,
        synth.detune || 0
      );
      const mix = context.createGain();
      mix.gain.value = 0.35;
      oscA.connect(mix);
      oscB.connect(mix);
      mix.connect(output);
      oscA.start();
      oscB.start();

      return {
        output,
        stop() {
          oscA.stop();
          oscB.stop();
          mix.disconnect();
          output.disconnect();
        }
      };
    }

    if (synth.type === "rumble") {
      const noise = context.createBufferSource();
      noise.buffer = this.noiseBuffer;
      noise.loop = true;
      const lowpass = context.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 120;
      const sub = createOscillator(context, "sine", synth.frequency || 44);
      const subGain = context.createGain();
      subGain.gain.value = 0.18;
      noise.connect(lowpass).connect(output);
      sub.connect(subGain).connect(output);
      noise.start();
      sub.start();

      return {
        output,
        stop() {
          noise.stop();
          sub.stop();
          lowpass.disconnect();
          subGain.disconnect();
          output.disconnect();
        }
      };
    }

    if (synth.type === "wind") {
      const noise = context.createBufferSource();
      noise.buffer = this.noiseBuffer;
      noise.loop = true;
      const band = context.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = synth.frequency || 880;
      band.Q.value = 0.5;
      const low = context.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.value = 1800;
      const lfo = createOscillator(context, "sine", 0.08);
      const lfoGain = context.createGain();
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain);
      lfoGain.connect(band.frequency);
      noise.connect(band).connect(low).connect(output);
      noise.start();
      lfo.start();

      return {
        output,
        stop() {
          noise.stop();
          lfo.stop();
          band.disconnect();
          low.disconnect();
          lfoGain.disconnect();
          output.disconnect();
        }
      };
    }

    if (synth.type === "pulse") {
      const carrier = createOscillator(context, "sawtooth", synth.frequency || 92);
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 780;
      const gate = context.createGain();
      gate.gain.value = 0.1;
      const lfo = createOscillator(context, "sine", synth.lfoRate || 1.8);
      const lfoGain = context.createGain();
      lfoGain.gain.value = 0.08;
      lfo.connect(lfoGain).connect(gate.gain);
      carrier.connect(filter).connect(gate).connect(output);
      carrier.start();
      lfo.start();

      return {
        output,
        stop() {
          carrier.stop();
          lfo.stop();
          filter.disconnect();
          gate.disconnect();
          lfoGain.disconnect();
          output.disconnect();
        }
      };
    }

    if (synth.type === "chime") {
      const base = synth.baseFrequency || 460;
      const intervalMs = synth.intervalMs || 4400;
      const timer = window.setInterval(() => {
        if (!this.enabled || this.audioContext?.state !== "running") {
          return;
        }
        const freq = base * (1 + Math.random() * 1.4);
        const osc = createOscillator(context, "sine", freq);
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.07, context.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 1.8);
        osc.connect(gain).connect(output);
        osc.start();
        osc.stop(context.currentTime + 2);
      }, intervalMs);

      return {
        output,
        stop() {
          window.clearInterval(timer);
          output.disconnect();
        }
      };
    }

    if (synth.type === "radio") {
      const noise = context.createBufferSource();
      noise.buffer = this.noiseBuffer;
      noise.loop = true;
      const band = context.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = synth.frequency || 980;
      band.Q.value = 3.4;
      const high = context.createBiquadFilter();
      high.type = "highpass";
      high.frequency.value = 320;
      const baseGain = context.createGain();
      baseGain.gain.value = 0.12;
      noise.connect(high).connect(band).connect(baseGain).connect(output);
      noise.start();

      const crackleTimer = window.setInterval(() => {
        if (!this.enabled || this.audioContext?.state !== "running") {
          return;
        }
        const burst = context.createBufferSource();
        burst.buffer = this.noiseBuffer;
        const burstBand = context.createBiquadFilter();
        burstBand.type = "bandpass";
        burstBand.frequency.value = 900 + Math.random() * 2000;
        burstBand.Q.value = 2;
        const burstGain = context.createGain();
        burstGain.gain.setValueAtTime(0.0001, context.currentTime);
        burstGain.gain.exponentialRampToValueAtTime(0.06, context.currentTime + 0.01);
        burstGain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
        burst.connect(burstBand).connect(burstGain).connect(output);
        burst.start();
        burst.stop(context.currentTime + 0.22);
      }, synth.crackleMs || 2600);

      return {
        output,
        stop() {
          window.clearInterval(crackleTimer);
          noise.stop();
          band.disconnect();
          high.disconnect();
          baseGain.disconnect();
          output.disconnect();
        }
      };
    }

    if (synth.type === "lowPulse") {
      const sub = createOscillator(context, "sine", synth.frequency || 52);
      const second = createOscillator(context, "sine", (synth.frequency || 52) * 0.5, 2);
      const subGain = context.createGain();
      subGain.gain.value = 0.07;
      const lfo = createOscillator(context, "sine", synth.lfoRate || 0.18);
      const lfoGain = context.createGain();
      lfoGain.gain.value = 0.05;
      lfo.connect(lfoGain).connect(subGain.gain);
      sub.connect(subGain);
      second.connect(subGain);
      subGain.connect(output);
      sub.start();
      second.start();
      lfo.start();

      return {
        output,
        stop() {
          sub.stop();
          second.stop();
          lfo.stop();
          subGain.disconnect();
          lfoGain.disconnect();
          output.disconnect();
        }
      };
    }

    if (synth.type === "distantMetal") {
      const base = synth.baseFrequency || 210;
      const intervalMs = synth.intervalMs || 12000;
      const timer = window.setInterval(() => {
        if (!this.enabled || this.audioContext?.state !== "running") {
          return;
        }
        const freq = base * (0.9 + Math.random() * 0.65);
        const osc = createOscillator(context, "triangle", freq);
        const toneGain = context.createGain();
        const damp = context.createBiquadFilter();
        damp.type = "lowpass";
        damp.frequency.value = 1400;
        toneGain.gain.setValueAtTime(0.0001, context.currentTime);
        toneGain.gain.exponentialRampToValueAtTime(0.035, context.currentTime + 0.02);
        toneGain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 2.4);
        osc.connect(damp).connect(toneGain).connect(output);
        osc.start();
        osc.stop(context.currentTime + 2.5);
      }, intervalMs);

      return {
        output,
        stop() {
          window.clearInterval(timer);
          output.disconnect();
        }
      };
    }

    const main = createOscillator(context, "triangle", synth.frequency || 130);
    const detuned = createOscillator(
      context,
      "sine",
      (synth.frequency || 130) * 0.5,
      synth.detune || 6
    );
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = synth.cutoff || 680;
    const wobble = createOscillator(context, "sine", 0.09);
    const wobbleGain = context.createGain();
    wobbleGain.gain.value = 40;
    const mixGain = context.createGain();
    mixGain.gain.value = 0.2;
    wobble.connect(wobbleGain).connect(filter.frequency);
    main.connect(filter);
    detuned.connect(filter);
    filter.connect(mixGain).connect(output);
    main.start();
    detuned.start();
    wobble.start();

    return {
      output,
      stop() {
        main.stop();
        detuned.stop();
        wobble.stop();
        filter.disconnect();
        mixGain.disconnect();
        wobbleGain.disconnect();
        output.disconnect();
      }
    };
  }

  startLayer(state) {
    if (state.started) {
      return;
    }

    if (state.config.synth || !state.config.src) {
      const synthNodes = this.buildSynthLayer(state);
      state.outputGain = synthNodes.output;
      state.teardown = synthNodes.stop;
    }

    if (state.htmlAudio) {
      state.htmlAudio.currentTime = 0;
      state.htmlAudio.play().catch(() => {});
    }

    state.started = true;
    this.applyLayerVolume(state);
  }

  async enable() {
    try {
      const context = this.ensureAudioContext();
      if (context.state === "suspended") {
        await context.resume();
      }
      this.enabled = context.state === "running";
      if (!this.enabled) {
        return false;
      }

      for (const state of this.ambientLayers.values()) {
        this.startLayer(state);
      }
      return true;
    } catch {
      this.enabled = false;
      return false;
    }
  }

  async autoEnable() {
    return this.enable();
  }

  setAmbientMix(mix = {}) {
    this.currentMix = mix;
    for (const [id, state] of this.ambientLayers.entries()) {
      state.multiplier = mix[id] ?? (state.alwaysOn ? 1 : 0);
      this.applyLayerVolume(state);
    }
  }

  playSfx(key, { volume = 1 } = {}) {
    if (!this.enabled) {
      return;
    }

    const src = this.sfxMap[key];
    if (!src) {
      return;
    }

    const sample = new Audio(resolvePublicPath(src));
    sample.preload = "auto";
    sample.volume = clamp01(volume);
    sample.play().catch(() => {});
  }

  setSurface(surface) {
    this.currentSurface = surface || "tile";
  }

  registerMovementDistance(distance) {
    if (!this.enabled || distance <= 0) {
      return;
    }

    this.stepAccumulator += distance;
    if (this.stepAccumulator < 1.8) {
      return;
    }

    this.stepAccumulator = 0;
    if (this.currentSurface === "carpet") {
      this.playSfx("footstepCarpet", { volume: 0.2 });
    } else {
      this.playSfx("footstepTile", { volume: 0.2 });
    }
  }

  updateZones(playerPosition) {
    if (!this.enabled) {
      return;
    }

    for (const zone of this.audioConfig.zones || []) {
      const state = this.zoneState.get(zone.id) || { nextAllowedAt: 0 };
      const distance = Math.hypot(
        playerPosition.x - zone.position[0],
        playerPosition.y - zone.position[1],
        playerPosition.z - zone.position[2]
      );

      if (distance <= zone.radius && performance.now() >= state.nextAllowedAt) {
        this.playSfx(zone.sfx, { volume: 0.45 });
        state.nextAllowedAt = performance.now() + (zone.cooldownMs || 15000);
      }

      this.zoneState.set(zone.id, state);
    }
  }

  dispose() {
    for (const state of this.ambientLayers.values()) {
      state.htmlAudio?.pause();
      if (state.htmlAudio) {
        state.htmlAudio.src = "";
      }
      if (state.teardown) {
        state.teardown();
      }
    }
    this.ambientLayers.clear();

    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(() => {});
    }
  }
}
