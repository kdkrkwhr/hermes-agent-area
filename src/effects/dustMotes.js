/** Ambient floating dust motes. morning/day full; evening/night 1/4. `?dust=0` off. */

/** Above rain (4) / lighting (6) / lamp (7); below agents (10) / desk glow (11). */
const DEPTH = 8;
/** Day/morning emit interval (ms). Night = this * 4. */
const FREQ_DAY = 320;
const FREQ_NIGHT = FREQ_DAY * 4;
const TINTS = [0xfff5e6, 0xffe8c8, 0xffffff, 0xfff0d8];

/** `?dust=0` (or false/off) disables. Default on. */
export function dustEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("dust");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

/**
 * Soft 2×2 cream mote. Safe to call more than once.
 * @param {Phaser.Scene} scene
 */
export function registerDustTexture(scene) {
  if (scene.textures.exists("fx-dust")) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xffffff, 1);
  g.fillRect(3, 3, 2, 2);
  g.fillRect(4, 2, 1, 1);
  g.generateTexture("fx-dust", 8, 8);
  g.destroy();
}

function densityForTod(name) {
  if (name === "morning" || name === "day") return "full";
  if (name === "evening" || name === "night") return "quarter";
  return "full";
}

/**
 * One ADD-blend emitter over the map. Sync via applyTimeOfDayLighting / WeatherFx.
 */
export class DustMotes {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ mapW: number, mapH: number }} dims
   */
  constructor(scene, dims) {
    this.scene = scene;
    this.mapW = dims.mapW;
    this.mapH = dims.mapH;
    this.enabled = dustEnabledFromQuery();
    this.active = false;
    this.density = "full";
    this.cloudy = false;
    this.emitter = null;

    if (this.enabled) {
      registerDustTexture(scene);
      this._createEmitter();
    }

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  _createEmitter() {
    const mapW = this.mapW;
    const mapH = this.mapH;
    const emitter = this.scene.add.particles(0, 0, "fx-dust", {
      x: { min: 0, max: mapW },
      y: { min: 0, max: mapH },
      speedX: { min: -6, max: 6 },
      speedY: { min: -10, max: -1 },
      scale: { start: 0.4, end: 0.12 },
      alpha: { start: 0.28, end: 0 },
      lifespan: { min: 5000, max: 10000 },
      frequency: FREQ_DAY,
      quantity: 1,
      tint: TINTS,
      gravityY: -2,
      blendMode: "ADD",
      advance: 2000,
    });
    emitter.setDepth(DEPTH);
    emitter.stop();
    this.emitter = emitter;
  }

  /** WeatherFx cloudy — slightly softer / rarer motes. */
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
    return this.enabled && !!this.emitter;
  }

  /** Call from applyTimeOfDayLighting — rematch density + start/stop. */
  sync() {
    if (!this.shouldBeActive()) {
      this.active = false;
      this.density = "off";
      this.emitter?.stop();
      this.publish();
      return;
    }

    const name = this.scene.lightingPreset?.name ?? "day";
    this.density = densityForTod(name);
    const freq =
      this.density === "quarter"
        ? FREQ_NIGHT
        : this.cloudy
          ? Math.round(FREQ_DAY * 1.35)
          : FREQ_DAY;

    // cloudy / quarter softens alpha a touch (setConfig would wipe emit zone)
    const alphaStart =
      this.density === "quarter" ? 0.1 : this.cloudy ? 0.18 : 0.28;
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
      active: this.active,
      tod: this.scene.lightingPreset?.name ?? null,
      density: this.density,
      cloudy: this.cloudy,
      emitterCount: this.emitter ? 1 : 0,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      dust: this.snapshot(),
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
