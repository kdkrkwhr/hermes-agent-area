/** North-facade soft snowflakes on ground GID-12 windows. `?snow=0` off, `?snow=1` force. */

import { findWindowTiles, MAX_EMITTERS } from "./windowRain.js";

/** Above ground/furniture; below zone labels (5) / agents (10). Same band as rain. */
const DEPTH = 4;

/**
 * Query: omit = weather-driven only.
 * `0`/`off`/`false` = never. `1`/`on`/`true` = always on.
 */
export function parseSnowMode() {
  if (typeof location === "undefined") {
    return { forcedOff: false, forcedOn: false };
  }
  try {
    const raw = new URLSearchParams(location.search).get("snow");
    if (raw === "0" || raw === "off" || raw === "false") {
      return { forcedOff: true, forcedOn: false };
    }
    if (raw === "1" || raw === "on" || raw === "true") {
      return { forcedOff: false, forcedOn: true };
    }
  } catch {
    /* ignore */
  }
  return { forcedOff: false, forcedOn: false };
}

/** Evenly sample tiles so we keep ≤ MAX_EMITTERS emitters. */
function sampleTiles(tiles, max = MAX_EMITTERS) {
  if (tiles.length <= max) return tiles.slice();
  const out = [];
  const step = (tiles.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    out.push(tiles[Math.round(i * step)]);
  }
  return out;
}

function snowConfig() {
  return {
    speedX: { min: -10, max: 14 },
    speedY: { min: 14, max: 32 },
    scale: { start: 0.65, end: 0.2 },
    alpha: { start: 0.75, end: 0 },
    lifespan: { min: 1600, max: 3200 },
    frequency: 110,
    quantity: 1,
    tint: [0xffffff, 0xe8f4ff, 0xd8ecff],
    gravityY: 6,
    blendMode: "ADD",
  };
}

/**
 * Soft ADD-blend snowflakes outside north windows.
 */
export class SnowFlakes {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    const mode = parseSnowMode();
    this.forcedOff = mode.forcedOff;
    this.forcedOn = mode.forcedOn;
    this.tiles = findWindowTiles(scene);
    this.anchors = sampleTiles(this.tiles);
    this.emitters = [];
    this.active = false;
    this.weatherForceOn = false;

    if (this.anchors.length) {
      this._ensureTextures();
      this._createEmitters();
    }

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  _ensureTextures() {
    registerSnowTexture(this.scene);
  }

  _createEmitters() {
    for (const a of this.anchors) {
      const emitter = this.scene.add.particles(a.x, a.y - 10, "fx-snow", snowConfig());
      emitter.setDepth(DEPTH);
      emitter.stop();
      this.emitters.push(emitter);
    }
  }

  /**
   * Weather JSON snow — sustained force while snowing.
   * Clear/cloudy/rain → false. `?snow=` still wins.
   * @param {boolean} on
   */
  setWeatherForceOn(on) {
    const next = !!on;
    if (next === this.weatherForceOn) {
      this.sync();
      return;
    }
    this.weatherForceOn = next;
    this.sync();
  }

  shouldBeActive() {
    if (this.forcedOff) return false;
    if (this.forcedOn) return true;
    if (this.weatherForceOn) return true;
    return false;
  }

  sync() {
    const want = this.shouldBeActive() && this.emitters.length > 0;
    if (want === this.active) {
      this.publish();
      return;
    }
    this.active = want;
    for (const e of this.emitters) {
      if (want) e.start();
      else e.stop();
    }
    this.publish();
  }

  snapshot() {
    return {
      enabled: !this.forcedOff,
      forcedOn: this.forcedOn,
      weatherForceOn: !!this.weatherForceOn,
      active: this.active,
      emitterCount: this.emitters.length,
      windowTiles: this.tiles.length,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      snow: this.snapshot(),
    };
  }

  destroy() {
    for (const e of this.emitters.splice(0)) {
      try {
        e.destroy();
      } catch {
        /* ignore */
      }
    }
    this.active = false;
    this.publish();
  }
}

/** Soft 3×3 flake. Safe to call more than once. */
export function registerSnowTexture(scene) {
  if (scene.textures.exists("fx-snow")) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xffffff, 1);
  g.fillRect(3, 2, 2, 4);
  g.fillRect(2, 3, 4, 2);
  g.fillRect(3, 3, 2, 2);
  g.generateTexture("fx-snow", 8, 8);
  g.destroy();
}
