/** Ambient GID-16 coffee-machine steam. Soft ADD. `?steam=0` off. */

import { findCoffeeTiles } from "../roomInteract.js";

/** Above furniture; near dust (8) / shadow (9); below agent status burst (11). */
const DEPTH = 9;
/** Quiet lounge drip — much slower than coffee_rush burst (freq 70). */
const FREQ_DAY = 520;
const FREQ_NIGHT = 900;
const ALPHA_DAY = 0.2;
const ALPHA_NIGHT = 0.09;

/**
 * Query: omit = on. `0`/`off`/`false` = never.
 * @returns {boolean}
 */
export function steamEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("steam");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

function isNightTod(name) {
  return name === "night" || name === "evening";
}

/**
 * One weak ADD emitter per coffee tile (usually 1–2).
 * Sync via applyTimeOfDayLighting — night/evening just dims base alpha.
 * OfficeEvents coffee_rush / lunch_rush bursts stay separate and louder.
 */
export class CoffeeSteam {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.enabled = steamEnabledFromQuery();
    this.tiles = this.enabled ? findCoffeeTiles(scene) : [];
    this.emitters = [];
    this.active = false;
    this.dim = false;

    if (this.enabled) {
      for (const t of this.tiles) {
        this.emitters.push(this._makeEmitter(t.x, t.y - 8));
      }
    }

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  _makeEmitter(x, y) {
    const emitter = this.scene.add.particles(x, y, "fx-steam", {
      speedX: { min: -8, max: 8 },
      speedY: { min: -28, max: -12 },
      scale: { start: 0.5, end: 0.08 },
      alpha: { start: ALPHA_DAY, end: 0 },
      lifespan: { min: 700, max: 1200 },
      frequency: FREQ_DAY,
      quantity: 1,
      tint: 0xdddddd,
      blendMode: "ADD",
    });
    emitter.setDepth(DEPTH);
    emitter.stop();
    return emitter;
  }

  shouldBeActive() {
    return this.enabled && this.emitters.length > 0;
  }

  /** Call from applyTimeOfDayLighting — raining/weather stays on; night dims. */
  sync() {
    if (!this.shouldBeActive()) {
      this.active = false;
      this.dim = false;
      for (const e of this.emitters) e.stop();
      this.publish();
      return;
    }

    const name = this.scene.lightingPreset?.name ?? "day";
    this.dim = isNightTod(name);
    const freq = this.dim ? FREQ_NIGHT : FREQ_DAY;
    const alphaStart = this.dim ? ALPHA_NIGHT : ALPHA_DAY;

    for (const e of this.emitters) {
      e.setFrequency(freq);
      e.setParticleAlpha({ start: alphaStart, end: 0 });
      if (!this.active) e.start();
    }
    this.active = true;
    this.publish();
  }

  snapshot() {
    return {
      enabled: this.enabled,
      active: this.active,
      dim: this.dim,
      emitterCount: this.emitters.length,
      coffeeTiles: this.tiles.length,
      lighting: this.scene.lightingPreset?.name ?? null,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      steam: this.snapshot(),
    };
  }

  destroy() {
    for (const e of this.emitters) {
      try {
        e.destroy();
      } catch {
        /* ignore */
      }
    }
    this.emitters = [];
    this.active = false;
    this.publish();
  }
}
