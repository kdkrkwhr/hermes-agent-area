/** Non-lobby wall posters (GID 19) — soft ADD glitter/sweep (weaker than lobby).
 *  `?poster=0` off (shared with lobby). `?poster=force` or `?wallposter=force` smoke.
 */

import { TILE_SIZE } from "../constants.js";
import { POSTER_GID, posterEnabledFromQuery } from "./lobbyPoster.js";

/** Above furniture; below agents (10). Match lobbyPoster depth. */
const DEPTH = 8.2;
/** Map has 9 wall GID19 — keep headroom. */
const MAX_TILES = 12;
const SWEEP_MS_MIN = 18000;
const SWEEP_MS_MAX = 32000;
const FORCE_SWEEP_MS_MIN = 4000;
const FORCE_SWEEP_MS_MAX = 7000;
/** Softer than lobby (lobby uses ~0.06–0.22). */
const GLITTER_COLOR = 0xfff4c8;
const HIGHLIGHT_COLOR = 0xffffff;
/** Multiplier vs lobby intensities. */
const SOFT = 0.45;

/**
 * Wall FX gate. `poster=0` kills both. `wallposter=0` kills wall only.
 * `poster=force` / `wallposter=force` → smoke (faster sweep, still soft).
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function wallPosterModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const q = new URLSearchParams(location.search);
    const poster = q.get("poster");
    const wall = q.get("wallposter");

    if (poster === "0" || poster === "false" || poster === "off") {
      return { enabled: false, forced: false };
    }
    if (wall === "0" || wall === "false" || wall === "off") {
      return { enabled: false, forced: false };
    }
    if (
      poster === "force" ||
      poster === "1" ||
      poster === "true" ||
      poster === "on" ||
      wall === "force" ||
      wall === "1" ||
      wall === "true" ||
      wall === "on"
    ) {
      return { enabled: true, forced: true };
    }
    // default follows shared poster gate
    return { enabled: posterEnabledFromQuery(), forced: false };
  } catch {
    return { enabled: true, forced: false };
  }
}

export function wallPosterEnabledFromQuery() {
  return wallPosterModeFromQuery().enabled;
}

function isLobbyBand(tx, ty) {
  return ty >= 25 && ty <= 28 && tx >= 14 && tx <= 26;
}

function tileCenter(scene, tx, ty) {
  const tw = scene.map?.tileWidth ?? TILE_SIZE;
  const th = scene.map?.tileHeight ?? TILE_SIZE;
  return { tx, ty, x: tx * tw + tw / 2, y: ty * th + th / 2 };
}

/**
 * GID 19 outside lobby entrance band. Cap MAX_TILES.
 * @param {Phaser.Scene} scene
 */
export function findWallPosterTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (!layer?.getTileAt || !scene.map) return hits;

  for (let ty = 0; ty < scene.map.height; ty++) {
    for (let tx = 0; tx < scene.map.width; tx++) {
      const tile = layer.getTileAt(tx, ty);
      if (tile?.index !== POSTER_GID) continue;
      if (isLobbyBand(tx, ty)) continue;
      hits.push(tileCenter(scene, tx, ty));
      if (hits.length >= MAX_TILES) return hits;
    }
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
      return 0.85;
    case "day":
      return 0.75;
    case "evening":
      return 0.58;
    case "night":
      return 0.42;
    default:
      return 0.7;
  }
}

function randSweepMs(forced) {
  if (forced) {
    return (
      FORCE_SWEEP_MS_MIN +
      Math.floor(Math.random() * (FORCE_SWEEP_MS_MAX - FORCE_SWEEP_MS_MIN + 1))
    );
  }
  return (
    SWEEP_MS_MIN + Math.floor(Math.random() * (SWEEP_MS_MAX - SWEEP_MS_MIN + 1))
  );
}

/**
 * Soft ambient glitter on corridor / open-desk / war-room wall posters.
 */
export class WallPosterAmbient {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    const mode = wallPosterModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.tiles = this.enabled ? findWallPosterTiles(scene) : [];
    this.bounds = this.tiles.map((t) => tileBounds(scene, t.tx, t.ty));
    this.phases = this.bounds.map(() => Math.random());
    this.sweepMs = this.bounds.map(() => randSweepMs(this.forced));
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

  /** Call from applyTimeOfDayLighting — intensity follows TOD (force = peak). */
  sync() {
    if (!this.shouldBeActive()) {
      this.active = false;
      this.todAlpha = 0;
      this.gfx.clear();
      this.gfx.setVisible(false);
      this.publish();
      return;
    }
    this.todAlpha = this.forced
      ? 1
      : alphaForTod(this.scene.lightingPreset?.name ?? "day");
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
        this.sweepMs[i] = randSweepMs(this.forced);
      }
    }
    this.active = true;
    this._draw();
    this.publish();
  }

  _draw() {
    const g = this.gfx;
    const a = this.todAlpha * SOFT * (this.forced ? 1.35 : 1);
    g.clear();

    for (let i = 0; i < this.bounds.length; i++) {
      const b = this.bounds[i];
      const phase = this.phases[i];
      const twinkle = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2 * 2.9 + i * 0.7);

      // soft frame glow (weaker than lobby)
      g.fillStyle(GLITTER_COLOR, 0.04 * a * twinkle);
      g.fillRect(b.left - 1, b.top - 1, b.w + 2, b.h + 2);

      // diagonal highlight sweep
      const sweepX = b.left + phase * b.w;
      const bandW = Math.max(5, b.w * 0.18);
      g.fillStyle(HIGHLIGHT_COLOR, 0.06 * a);
      g.fillTriangle(
        sweepX - bandW,
        b.top,
        sweepX,
        b.top,
        sweepX - bandW * 0.35,
        b.top + b.h,
      );
      g.fillStyle(HIGHLIGHT_COLOR, 0.09 * a);
      g.fillTriangle(sweepX, b.top, sweepX + bandW * 0.35, b.top + b.h, sweepX + bandW, b.top);

      // fewer glitter specks
      const seeds = [
        [0.22, 0.28],
        [0.55, 0.62],
        [0.78, 0.35],
      ];
      for (const [fx, fy] of seeds) {
        const flicker =
          0.35 +
          0.65 *
            Math.abs(
              Math.sin((phase + fx * 1.4 + fy + i * 0.25) * Math.PI * 2),
            );
        if (flicker < 0.5) continue;
        const px = b.left + fx * b.w;
        const py = b.top + fy * b.h;
        g.fillStyle(GLITTER_COLOR, 0.14 * a * flicker);
        g.fillCircle(px, py, 1.0);
        g.fillStyle(HIGHLIGHT_COLOR, 0.22 * a * flicker);
        g.fillCircle(px + 0.4, py - 0.4, 0.55);
      }
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      active: this.active,
      todAlpha: this.todAlpha,
      posterGid: POSTER_GID,
      posterCount: this.tiles.length,
      maxTiles: MAX_TILES,
      posters: this.tiles.map((t) => ({ tx: t.tx, ty: t.ty })),
      phases: this.phases.slice(),
      depth: DEPTH,
      soft: SOFT,
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
      wallPoster: snap,
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

export { DEPTH, MAX_TILES, SWEEP_MS_MIN, SWEEP_MS_MAX, SOFT };
