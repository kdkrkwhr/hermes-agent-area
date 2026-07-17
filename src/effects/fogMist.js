/** Ground soft fog mist — cloudy/fog weather + weak morning bonus. `?fog=0` off, `?fog=force` smoke. */

import { registerDustTexture } from "./dustMotes.js";

/** Above map tiles; below rain (4) / dust (8) — ground-hugging band. */
const DEPTH = 3;
/** Single map-wide emitter — stay cheap next to rain/snow. */
const MAX_EMITTERS = 1;
const FREQ_CLOUDY = 260;
const FREQ_MORNING = 520;
const TINTS = [0xc8d4e0, 0xd8e2ea, 0xb8c8d8, 0xe0e8f0];

/**
 * Query: omit = weather/morning driven.
 * `0`/`off`/`false` = never. `force`/`1`/`on`/`true` = always on.
 * @returns {{ forcedOff: boolean, forcedOn: boolean }}
 */
export function parseFogMode() {
  if (typeof location === "undefined") {
    return { forcedOff: false, forcedOn: false };
  }
  try {
    const raw = new URLSearchParams(location.search).get("fog");
    if (raw === "0" || raw === "off" || raw === "false") {
      return { forcedOff: true, forcedOn: false };
    }
    if (raw === "force" || raw === "1" || raw === "on" || raw === "true") {
      return { forcedOff: false, forcedOn: true };
    }
  } catch {
    /* ignore */
  }
  return { forcedOff: false, forcedOn: false };
}

/**
 * Soft blob for mist (larger than dust mote). Safe to call more than once.
 * @param {Phaser.Scene} scene
 */
export function registerFogTexture(scene) {
  if (scene.textures.exists("fx-fog")) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xffffff, 0.55);
  g.fillCircle(8, 8, 6);
  g.fillStyle(0xffffff, 0.28);
  g.fillCircle(8, 8, 8);
  g.generateTexture("fx-fog", 16, 16);
  g.destroy();
}

/**
 * Bottom-band soft mist particles. Sync via WeatherFx + applyTimeOfDayLighting.
 */
export class FogMist {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ mapW: number, mapH: number }} dims
   */
  constructor(scene, dims) {
    this.scene = scene;
    this.mapW = dims.mapW;
    this.mapH = dims.mapH;
    const mode = parseFogMode();
    this.forcedOff = mode.forcedOff;
    this.forcedOn = mode.forcedOn;
    this.enabled = !this.forcedOff;
    this.cloudy = false;
    this.active = false;
    this.mode = "off";
    this.emitter = null;

    if (this.enabled) {
      registerFogTexture(scene);
      registerDustTexture(scene);
      this._createEmitter();
    }

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  _createEmitter() {
    const mapW = this.mapW;
    const mapH = this.mapH;
    const yMin = Math.floor(mapH * 0.6);
    const yMax = mapH;
    const key = sceneTextureKey(this.scene);
    const emitter = this.scene.add.particles(0, 0, key, {
      x: { min: 0, max: mapW },
      y: { min: yMin, max: yMax },
      speedX: { min: -8, max: 10 },
      speedY: { min: -4, max: 2 },
      scale: { start: 1.6, end: 2.8 },
      alpha: { start: 0.16, end: 0 },
      lifespan: { min: 4500, max: 9000 },
      frequency: FREQ_CLOUDY,
      quantity: 1,
      tint: TINTS,
      gravityY: -1,
      blendMode: "ADD",
      advance: 2500,
      maxParticles: 28,
    });
    emitter.setDepth(DEPTH);
    emitter.stop();
    this.emitter = emitter;
  }

  /**
   * WeatherFx cloudy / fog — sustained mist.
   * @param {boolean} on
   */
  setCloudy(on) {
    const next = !!on;
    if (next === this.cloudy) {
      this.sync();
      return;
    }
    this.cloudy = next;
    this.sync();
  }

  shouldBeActive() {
    if (this.forcedOff || !this.emitter) return false;
    if (this.forcedOn) return true;
    if (this.cloudy) return true;
    return this.scene.lightingPreset?.name === "morning";
  }

  /** intensity: force/cloudy = full, morning-only = weak */
  _intensity() {
    if (this.forcedOn || this.cloudy) return "full";
    if (this.scene.lightingPreset?.name === "morning") return "weak";
    return "off";
  }

  /** Call from applyTimeOfDayLighting / WeatherFx. */
  sync() {
    if (!this.enabled || !this.emitter) {
      this.active = false;
      this.mode = "off";
      this.emitter?.stop();
      this.publish();
      return;
    }

    const want = this.shouldBeActive();
    const intensity = this._intensity();
    this.mode = want ? intensity : "off";

    if (!want) {
      if (this.active) this.emitter.stop();
      this.active = false;
      this.publish();
      return;
    }

    const freq = intensity === "weak" ? FREQ_MORNING : FREQ_CLOUDY;
    const alphaStart = intensity === "weak" ? 0.08 : 0.16;
    this.emitter.setFrequency(freq);
    this.emitter.setParticleAlpha({ start: alphaStart, end: 0 });

    if (!this.active) {
      this.emitter.start();
      this.active = true;
    }
    this.publish();
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forcedOn: this.forcedOn,
      forcedOff: this.forcedOff,
      cloudy: this.cloudy,
      active: this.active,
      mode: this.mode,
      tod: this.scene.lightingPreset?.name ?? null,
      emitterCount: this.emitter ? MAX_EMITTERS : 0,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      fog: this.snapshot(),
    };
  }

  destroy() {
    if (this.emitter) {
      try {
        this.emitter.destroy();
      } catch {
        /* ignore */
      }
      this.emitter = null;
    }
    this.active = false;
    this.publish();
  }
}

/** Prefer soft fog tex; fall back to dust mote if missing. */
function sceneTextureKey(scene) {
  if (scene.textures.exists("fx-fog")) return "fx-fog";
  return "fx-dust";
}
