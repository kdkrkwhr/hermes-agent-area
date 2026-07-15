/** Morning-only SW sunbeams through north GID-12 windows. `?sunbeam=0` off. */

import { findWindowTiles, MAX_EMITTERS } from "./windowRain.js";

/** Above rain (4); below lighting overlay (6) / agents (10). */
const DEPTH = 5;
/** Warm morning shaft — keep soft next to dust motes. */
const BEAM_COLOR = 0xffe6b8;
/** Shaft length in px from window center toward SW. */
const BEAM_LEN = 150;
/** Half-width at the pane (px). Tip is ~1/3 of that. */
const BEAM_HALF = 14;
/** Base alpha per stacked pass (x stack weights). Low so dust still reads. */
const ALPHA_BASE = 0.11;

/**
 * Query: omit = on (morning-gated). `0`/`off`/`false` = never.
 * @returns {boolean}
 */
export function sunbeamEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("sunbeam");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

/** Evenly sample tiles so we keep <= MAX_EMITTERS shafts. */
function sampleTiles(tiles, max = MAX_EMITTERS) {
  if (tiles.length <= max) return tiles.slice();
  const out = [];
  const step = (tiles.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    out.push(tiles[Math.round(i * step)]);
  }
  return out;
}

/**
 * Unit SW vector in screen space (west -X, south +Y).
 * @returns {{ dx: number, dy: number, px: number, py: number }}
 */
function swBasis() {
  const dx = -Math.SQRT1_2;
  const dy = Math.SQRT1_2;
  return { dx, dy, px: -dy, py: dx };
}

/**
 * Morning sunbeams from north glass into the open-plan floor.
 * Sync via applyTimeOfDayLighting. `?tod=morning` forces morning lighting.
 */
export class SunBeams {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.enabled = sunbeamEnabledFromQuery();
    this.tiles = this.enabled ? findWindowTiles(scene) : [];
    this.anchors = sampleTiles(this.tiles);
    this.active = false;
    this.gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);
    this.gfx.setBlendMode("ADD");

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  shouldBeActive() {
    if (!this.enabled || !this.anchors.length) return false;
    return this.scene.lightingPreset?.name === "morning";
  }

  /** Call from applyTimeOfDayLighting — morning only; clear otherwise. */
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
    this._draw();
    this.publish();
  }

  _draw() {
    const { dx, dy, px, py } = swBasis();
    const g = this.gfx;
    g.clear();

    for (const a of this.anchors) {
      const tipX = a.x + dx * BEAM_LEN;
      const tipY = a.y + dy * BEAM_LEN;
      const nearL = {
        x: a.x + px * BEAM_HALF,
        y: a.y + py * BEAM_HALF,
      };
      const nearR = {
        x: a.x - px * BEAM_HALF,
        y: a.y - py * BEAM_HALF,
      };
      const tipHalf = BEAM_HALF * 0.32;
      const tipL = {
        x: tipX + px * tipHalf,
        y: tipY + py * tipHalf,
      };
      const tipR = {
        x: tipX - px * tipHalf,
        y: tipY - py * tipHalf,
      };

      const layers = [
        { scale: 1.35, alpha: ALPHA_BASE * 0.35 },
        { scale: 1.0, alpha: ALPHA_BASE * 0.7 },
        { scale: 0.55, alpha: ALPHA_BASE * 1.05 },
      ];

      for (const layer of layers) {
        const s = layer.scale;
        const nL = {
          x: a.x + (nearL.x - a.x) * s,
          y: a.y + (nearL.y - a.y) * s,
        };
        const nR = {
          x: a.x + (nearR.x - a.x) * s,
          y: a.y + (nearR.y - a.y) * s,
        };
        const tL = {
          x: tipX + (tipL.x - tipX) * s,
          y: tipY + (tipL.y - tipY) * s,
        };
        const tR = {
          x: tipX + (tipR.x - tipX) * s,
          y: tipY + (tipR.y - tipY) * s,
        };
        g.fillStyle(BEAM_COLOR, layer.alpha);
        g.fillTriangle(nL.x, nL.y, nR.x, nR.y, tR.x, tR.y);
        g.fillTriangle(nL.x, nL.y, tR.x, tR.y, tL.x, tL.y);
      }
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      active: this.active,
      emitterCount: this.anchors.length,
      windowTiles: this.tiles.length,
      lighting: this.scene.lightingPreset?.name ?? null,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      sunbeam: this.snapshot(),
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
    this.publish();
  }
}
