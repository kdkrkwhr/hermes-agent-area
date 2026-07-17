/** Soft ADD moth dots orbiting LampGlow anchors. evening/night only. `?moths=0` off, `?moths=1` force. */

import { findLampTiles } from "./lampGlow.js";

/** Above lamp glow (7); below agents (10). Same band as dust. */
const DEPTH = 8;
/** Warm lamp-wing tint (ADD). */
const MOTH_COLOR = 0xffe8b0;
/** Soft outer radius of each mote (px). */
const DOT_R = 2.2;

/**
 * Query: omit = on (evening/night-gated).
 * `0`/`off`/`false` = never. `1`/`on`/`true`/`force` = always (TOD ignore).
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function mothsModeFromQuery() {
  if (typeof location === "undefined") return { enabled: true, forced: false };
  try {
    const v = new URLSearchParams(location.search).get("moths");
    if (v == null || v === "") return { enabled: true, forced: false };
    if (v === "0" || v === "false" || v === "off") {
      return { enabled: false, forced: false };
    }
    if (v === "1" || v === "true" || v === "on" || v === "force") {
      return { enabled: true, forced: true };
    }
    return { enabled: true, forced: false };
  } catch {
    return { enabled: true, forced: false };
  }
}

/**
 * Build 1–2 moths per lamp with staggered orbit params.
 * @param {{ x: number, y: number }[]} lamps
 */
function buildMoths(lamps) {
  const moths = [];
  let i = 0;
  for (const lamp of lamps) {
    const n = 1 + (i % 2); // alternate 1 then 2
    for (let k = 0; k < n; k++) {
      const seed = i * 3 + k * 7;
      moths.push({
        cx: lamp.x,
        cy: lamp.y,
        /** Orbit radius 10–18px. */
        radius: 10 + (seed % 9),
        /** Period 2–4s. */
        period: 2000 + (seed % 5) * 400,
        /** Per-anchor phase randomize. */
        phase: ((seed * 1.37) % (Math.PI * 2)),
        /** Slight elliptical squash so paths don't look perfect circles. */
        ellipt: 0.82 + ((seed % 4) * 0.05),
      });
    }
    i += 1;
  }
  return moths;
}

/**
 * Night/evening moths orbiting floor lamps. One Graphics, scanned once.
 */
export class LampMoths {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    const mode = mothsModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.lamps = this.enabled ? findLampTiles(scene) : [];
    this.moths = this.enabled ? buildMoths(this.lamps) : [];
    this.active = false;
    this.gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);
    this.gfx.setBlendMode("ADD");
    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  shouldBeActive() {
    if (!this.enabled || !this.moths.length) return false;
    if (this.forced) return true;
    const name = this.scene.lightingPreset?.name;
    return name === "evening" || name === "night";
  }

  /** Call from applyTimeOfDayLighting — hide on morning/day (unless forced). */
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
   * Slow orbital redraw.
   * @param {number} [time] scene.time.now
   */
  update(time = this.scene.time.now) {
    if (!this.active) return;

    const g = this.gfx;
    g.clear();

    for (const m of this.moths) {
      const ang = (time / m.period) * Math.PI * 2 + m.phase;
      const x = m.cx + Math.cos(ang) * m.radius;
      const y = m.cy + Math.sin(ang) * m.radius * m.ellipt;
      // gentle flutter alpha
      const flutter = (Math.sin(time / 380 + m.phase) + 1) / 2;
      const alpha = 0.22 + flutter * 0.45;

      g.fillStyle(MOTH_COLOR, alpha * 0.35);
      g.fillCircle(x, y, DOT_R * 1.8);
      g.fillStyle(MOTH_COLOR, alpha * 0.85);
      g.fillCircle(x, y, DOT_R);
      g.fillStyle(0xfff8e8, Math.min(0.95, alpha));
      g.fillCircle(x, y, DOT_R * 0.45);
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      active: this.active,
      count: this.moths.length,
      lampCount: this.lamps.length,
      lighting: this.scene.lightingPreset?.name ?? null,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      moths: this.snapshot(),
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
    this.moths = [];
    this.lamps = [];
    this.publish();
  }
}
