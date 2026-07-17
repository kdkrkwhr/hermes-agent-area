/** Lobby entrance posters (GID 19) — ADD glitter sweep + highlight. `?poster=0` off. */

import { TILE_SIZE } from "../constants.js";

export const POSTER_GID = 19;
/** Above furniture; below agents (10). */
const DEPTH = 8.2;
const SWEEP_MS_MIN = 12000;
const SWEEP_MS_MAX = 20000;
const GLITTER_COLOR = 0xfff4c8;
const HIGHLIGHT_COLOR = 0xffffff;

/** `?poster=0|false|off` disables FX + E-quote. Default on. */
export function posterEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("poster");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

function tileCenter(scene, tx, ty) {
  const tw = scene.map?.tileWidth ?? TILE_SIZE;
  const th = scene.map?.tileHeight ?? TILE_SIZE;
  return { tx, ty, x: tx * tw + tw / 2, y: ty * th + th / 2 };
}

/**
 * Lobby poster tiles — GID 19 near entrance (y 26–27, x 14–25).
 * @param {Phaser.Scene} scene
 */
export function findLobbyPosterTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (!layer?.getTileAt || !scene.map) return hits;

  for (let ty = 0; ty < scene.map.height; ty++) {
    for (let tx = 0; tx < scene.map.width; tx++) {
      const tile = layer.getTileAt(tx, ty);
      if (tile?.index !== POSTER_GID) continue;
      // lobby entrance band only — skip corridor wall art
      if (ty < 25 || ty > 28 || tx < 14 || tx > 26) continue;
      hits.push(tileCenter(scene, tx, ty));
    }
  }

  if (!hits.length) {
    hits.push(tileCenter(scene, 15, 26));
    hits.push(tileCenter(scene, 24, 26));
  }
  return hits;
}

function tileBounds(scene, tx, ty) {
  const tw = scene.map?.tileWidth ?? TILE_SIZE;
  const th = scene.map?.tileHeight ?? TILE_SIZE;
  return {
    tx,
    ty,
    cx: tx * tw + tw / 2,
    cy: ty * th + th / 2,
    left: tx * tw,
    top: ty * th,
    w: tw,
    h: th,
  };
}

function alphaForTod(presetName) {
  switch (presetName) {
    case "morning":
      return 1;
    case "day":
      return 0.92;
    case "evening":
      return 0.72;
    case "night":
      return 0.55;
    default:
      return 0.85;
  }
}

function randSweepMs() {
  return SWEEP_MS_MIN + Math.floor(Math.random() * (SWEEP_MS_MAX - SWEEP_MS_MIN + 1));
}

/**
 * Ambient glitter + highlight sweep on lobby entrance posters.
 */
export class LobbyPoster {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.enabled = posterEnabledFromQuery();
    this.tiles = this.enabled ? findLobbyPosterTiles(scene) : [];
    this.bounds = this.tiles.map((t) => tileBounds(scene, t.tx, t.ty));
    this.phases = this.bounds.map(() => Math.random());
    this.sweepMs = this.bounds.map(() => randSweepMs());
    this.todAlpha = 1;
    this.active = false;
    this._lastKey = "";

    this.gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);
    this.gfx.setBlendMode("ADD");

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  shouldBeActive() {
    return this.enabled && this.bounds.length > 0;
  }

  /** Call from applyTimeOfDayLighting — intensity follows TOD. */
  sync() {
    if (!this.shouldBeActive()) {
      this.active = false;
      this.todAlpha = 0;
      this.gfx.clear();
      this.gfx.setVisible(false);
      this.publish();
      return;
    }
    this.todAlpha = alphaForTod(this.scene.lightingPreset?.name ?? "day");
    this.active = true;
    this.gfx.setVisible(true);
    this._draw();
    this.publish();
  }

  /**
   * @param {number} _now
   * @param {number} [delta=16]
   */
  update(_now, delta = 16) {
    if (!this.shouldBeActive()) {
      this.active = false;
      this.gfx.clear();
      this.gfx.setVisible(false);
      this.publish();
      return;
    }

    const dt = typeof delta === "number" && delta > 0 ? delta : 16;
    for (let i = 0; i < this.phases.length; i++) {
      this.phases[i] = (this.phases[i] + dt / this.sweepMs[i]) % 1;
      if (this.phases[i] < dt / this.sweepMs[i]) {
        this.sweepMs[i] = randSweepMs();
      }
    }
    this.active = true;
    this._draw();
    this.publish();
  }

  _draw() {
    const g = this.gfx;
    const a = this.todAlpha;
    g.clear();

    for (let i = 0; i < this.bounds.length; i++) {
      const b = this.bounds[i];
      const phase = this.phases[i];
      const twinkle = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2 * 3.7 + i);

      // soft frame glow
      g.fillStyle(GLITTER_COLOR, 0.06 * a * twinkle);
      g.fillRect(b.left - 1, b.top - 1, b.w + 2, b.h + 2);

      // diagonal highlight sweep
      const sweepX = b.left + phase * b.w;
      const bandW = Math.max(6, b.w * 0.22);
      g.fillStyle(HIGHLIGHT_COLOR, 0.1 * a);
      g.fillTriangle(
        sweepX - bandW,
        b.top,
        sweepX,
        b.top,
        sweepX - bandW * 0.35,
        b.top + b.h,
      );
      g.fillStyle(HIGHLIGHT_COLOR, 0.14 * a);
      g.fillTriangle(sweepX, b.top, sweepX + bandW * 0.35, b.top + b.h, sweepX + bandW, b.top);

      // glitter specks
      const seeds = [
        [0.18, 0.22],
        [0.42, 0.55],
        [0.68, 0.3],
        [0.82, 0.72],
      ];
      for (const [fx, fy] of seeds) {
        const flicker =
          0.35 +
          0.65 *
            Math.abs(
              Math.sin((phase + fx * 1.7 + fy + i * 0.3) * Math.PI * 2),
            );
        if (flicker < 0.45) continue;
        const px = b.left + fx * b.w;
        const py = b.top + fy * b.h;
        g.fillStyle(GLITTER_COLOR, 0.22 * a * flicker);
        g.fillCircle(px, py, 1.2);
        g.fillStyle(HIGHLIGHT_COLOR, 0.35 * a * flicker);
        g.fillCircle(px + 0.5, py - 0.5, 0.7);
      }
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      active: this.active,
      todAlpha: this.todAlpha,
      posterGid: POSTER_GID,
      posterCount: this.tiles.length,
      posters: this.tiles.map((t) => ({ tx: t.tx, ty: t.ty })),
      phases: this.phases.slice(),
      depth: DEPTH,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    const snap = this.snapshot();
    const key = JSON.stringify(snap);
    if (key === this._lastKey) return;
    this._lastKey = key;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      poster: snap,
    };
  }

  destroy() {
    try {
      this.gfx.destroy();
    } catch {
      /* ignore */
    }
    this.active = false;
    this.publish();
  }
}

export { DEPTH, SWEEP_MS_MIN, SWEEP_MS_MAX };
