/** Evening/night city-light twinkle on north GID-12 windows. `?citylight=0` off. */

import { findWindowTiles } from "./windowRain.js";

/** Same band as sunbeams (5) — above rain (4), below lighting overlay (6). */
const DEPTH = 5;
/** Denser than rain shafts — tiny dots read better with more anchors. */
const MAX_LIGHTS = 14;
/** Cool + warm city mix (ADD). */
const COLORS = [0xa8c8ff, 0xffe6a0, 0xd0e4ff, 0xffc878];

/**
 * Query: omit = on (evening/night-gated). `0`/`off`/`false` = never.
 * @returns {boolean}
 */
export function cityLightEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("citylight");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

/** Evenly sample tiles so we keep ≤ max lights. */
function sampleTiles(tiles, max = MAX_LIGHTS) {
  if (tiles.length <= max) return tiles.slice();
  const out = [];
  const step = (tiles.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    out.push(tiles[Math.round(i * step)]);
  }
  return out;
}

/**
 * Soft ADD twinkle outside north glass. Sync via applyTimeOfDayLighting.
 * Mute-independent (visual only). Slow blink — no strobe.
 */
export class CityLights {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.enabled = cityLightEnabledFromQuery();
    this.tiles = this.enabled ? findWindowTiles(scene) : [];
    const sampled = sampleTiles(this.tiles);
    this.anchors = sampled.map((t, i) => ({
      ...t,
      /** Stagger so panes don't blink in lockstep. */
      phase: (i * 1.7) % (Math.PI * 2),
      /** Period ms — 2.6–4.2s soft breathe. */
      period: 2600 + (i % 5) * 400,
      color: COLORS[i % COLORS.length],
      /** Slight horizontal jitter so lights sit "outside" the pane. */
      ox: ((i % 3) - 1) * 4,
      oy: -6 - (i % 4),
    }));
    this.active = false;
    this.gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);
    this.gfx.setBlendMode("ADD");

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  shouldBeActive() {
    if (!this.enabled || !this.anchors.length) return false;
    const name = this.scene.lightingPreset?.name;
    return name === "evening" || name === "night";
  }

  /** Call from applyTimeOfDayLighting — evening/night only. */
  sync() {
    const want = this.shouldBeActive();
    if (!want) {
      this.active = false;
      this.gfx.clear();
      this.gfx.setVisible(false);
      this.publish();
      return;
    }
    this.active = true;
    this.gfx.setVisible(true);
    this.publish();
  }

  /**
   * Soft per-light alpha pulse. Clear+redraw in one Graphics.
   * @param {number} [time] scene.time.now
   */
  update(time = this.scene.time.now) {
    if (!this.active) return;

    const g = this.gfx;
    g.clear();

    for (const a of this.anchors) {
      const wave = (Math.sin((time / a.period) * Math.PI * 2 + a.phase) + 1) / 2;
      // mostly dim, gentle peak — no hard flash
      const alpha = 0.12 + wave * 0.38;
      const x = a.x + a.ox;
      const y = a.y + a.oy;

      g.fillStyle(a.color, alpha * 0.35);
      g.fillCircle(x, y, 5.5);
      g.fillStyle(a.color, alpha * 0.7);
      g.fillCircle(x, y, 3);
      g.fillStyle(a.color, Math.min(0.95, alpha * 1.05));
      g.fillCircle(x, y, 1.4);
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      active: this.active,
      lightCount: this.anchors.length,
      windowTiles: this.tiles.length,
      lighting: this.scene.lightingPreset?.name ?? null,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      cityLights: this.snapshot(),
    };
  }

  destroy() {
    if (this.gfx) {
      try {
        this.gfx.destroy();
      } catch {
        /* ignore */
      }
      this.gfx = null;
    }
    this.active = false;
    this.anchors = [];
    this.publish();
  }
}
