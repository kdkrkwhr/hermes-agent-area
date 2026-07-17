/** Seasonal petal/leaf soft ADD drift over north GID-12 windows + Open Desk sky.
 * Mar–May petal, Sep–Nov leaf; else off.
 * `?season=0|off` off · `spring|autumn|petal|leaf` force · `1` calendar on.
 */

import { findWindowTiles, MAX_EMITTERS } from "./windowRain.js";

/** Same band as snow/rain (4); below lighting (6) / agents (10). */
const DEPTH = 4;
/** Keep sparse — below snow's 6. */
const MAX_SEASON_EMITTERS = Math.min(4, MAX_EMITTERS);
/** Open Desk zone label anchor (OfficeScene zoneLabels). */
const OPEN_DESK = { tx: 8, ty: 2 };

const PETAL_TINTS = [0xffb7c5, 0xffc8d6, 0xff9eb5, 0xffd0dc];
const LEAF_TINTS = [0xe89a3c, 0xc4682a, 0xd4a04a, 0xa85a28];

/**
 * Query parse.
 * @returns {{ forcedOff: boolean, forcedKind: null|'petal'|'leaf', forceCalendar: boolean }}
 */
export function parseSeasonMode() {
  if (typeof location === "undefined") {
    return { forcedOff: false, forcedKind: null, forceCalendar: false };
  }
  try {
    const raw = new URLSearchParams(location.search).get("season");
    if (raw == null || raw === "") {
      return { forcedOff: false, forcedKind: null, forceCalendar: false };
    }
    const v = String(raw).toLowerCase();
    if (v === "0" || v === "off" || v === "false") {
      return { forcedOff: true, forcedKind: null, forceCalendar: false };
    }
    if (v === "spring" || v === "petal") {
      return { forcedOff: false, forcedKind: "petal", forceCalendar: false };
    }
    if (v === "autumn" || v === "fall" || v === "leaf") {
      return { forcedOff: false, forcedKind: "leaf", forceCalendar: false };
    }
    if (v === "1" || v === "on" || v === "true") {
      return { forcedOff: false, forcedKind: null, forceCalendar: true };
    }
  } catch {
    /* ignore */
  }
  return { forcedOff: false, forcedKind: null, forceCalendar: false };
}

/**
 * Calendar kind for a 1–12 month. null = off season.
 * @param {number} month
 * @returns {null|'petal'|'leaf'}
 */
export function kindForMonth(month) {
  if (month >= 3 && month <= 5) return "petal";
  if (month >= 9 && month <= 11) return "leaf";
  return null;
}

/** Evenly sample tiles so we keep ≤ max emitters. */
function sampleTiles(tiles, max = MAX_SEASON_EMITTERS) {
  if (tiles.length <= max) return tiles.slice();
  const out = [];
  const step = (tiles.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    out.push(tiles[Math.round(i * step)]);
  }
  return out;
}

function driftConfig(kind, night) {
  const alphaStart = night ? 0.22 : 0.42;
  return {
    speedX: { min: -18, max: 22 },
    speedY: { min: 8, max: 22 },
    scale: { start: 0.7, end: 0.25 },
    alpha: { start: alphaStart, end: 0 },
    lifespan: { min: 2800, max: 5200 },
    frequency: 220,
    quantity: 1,
    tint: kind === "leaf" ? LEAF_TINTS : PETAL_TINTS,
    gravityY: 4,
    blendMode: "ADD",
  };
}

/**
 * Soft ADD petal/leaf drift. Independent of weather; night softens alpha.
 */
export class SeasonalDrift {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    const mode = parseSeasonMode();
    this.forcedOff = mode.forcedOff;
    this.forcedKind = mode.forcedKind;
    this.forceCalendar = mode.forceCalendar;
    this.tiles = findWindowTiles(scene);
    this.anchors = this._buildAnchors();
    this.emitters = [];
    this.active = false;
    this.kind = null;
    this.night = false;

    if (this.anchors.length) {
      this._ensureTextures();
      this._createEmitters();
    }

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  _buildAnchors() {
    const tw = this.scene.map?.tileWidth ?? 32;
    const th = this.scene.map?.tileHeight ?? 32;
    const windows = sampleTiles(this.tiles, Math.max(1, MAX_SEASON_EMITTERS - 1));
    const desk = {
      tx: OPEN_DESK.tx,
      ty: OPEN_DESK.ty,
      x: OPEN_DESK.tx * tw + tw / 2,
      y: OPEN_DESK.ty * th + th / 2 - 12,
    };
    // Prefer windows; always keep one Open Desk sky slot when space allows.
    if (!windows.length) return [desk];
    if (windows.length < MAX_SEASON_EMITTERS) {
      return [...windows, desk];
    }
    return windows;
  }

  _ensureTextures() {
    registerPetalTexture(this.scene);
    registerLeafTexture(this.scene);
  }

  _createEmitters() {
    // Start stopped; sync() picks texture + config for kind.
    for (const a of this.anchors) {
      const emitter = this.scene.add.particles(
        a.x,
        a.y - 8,
        "fx-petal",
        driftConfig("petal", false),
      );
      emitter.setDepth(DEPTH);
      emitter.stop();
      this.emitters.push(emitter);
    }
  }

  /**
   * Resolve active kind from query + calendar. Independent of weather.
   * @returns {null|'petal'|'leaf'}
   */
  resolveKind() {
    if (this.forcedOff) return null;
    if (this.forcedKind) return this.forcedKind;
    const month = new Date().getMonth() + 1;
    return kindForMonth(month);
  }

  shouldBeActive() {
    return !!this.resolveKind() && this.emitters.length > 0;
  }

  /** Call from applyTimeOfDayLighting — rematch kind + night alpha. */
  sync() {
    const kind = this.resolveKind();
    const night = this.scene.lightingPreset?.name === "night";
    const want = !!kind && this.emitters.length > 0;

    if (!want) {
      if (this.active) {
        for (const e of this.emitters) e.stop();
      }
      this.active = false;
      this.kind = null;
      this.night = night;
      this.publish();
      return;
    }

    const kindChanged = kind !== this.kind;
    const nightChanged = night !== this.night;
    if (kindChanged || nightChanged || !this.active) {
      this.kind = kind;
      this.night = night;
      const tex = kind === "leaf" ? "fx-leaf" : "fx-petal";
      const cfg = driftConfig(kind, night);
      for (const e of this.emitters) {
        e.setTexture(tex);
        e.setConfig(cfg);
        if (!this.active) e.start();
      }
      this.active = true;
    }
    this.publish();
  }

  snapshot() {
    return {
      enabled: !this.forcedOff,
      forcedKind: this.forcedKind,
      forceCalendar: this.forceCalendar,
      kind: this.kind,
      active: this.active,
      night: this.night,
      emitterCount: this.emitters.length,
      windowTiles: this.tiles.length,
      month: new Date().getMonth() + 1,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      season: this.snapshot(),
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
    this.kind = null;
    this.publish();
  }
}

/** Soft pink petal blob. Safe to call more than once. */
export function registerPetalTexture(scene) {
  if (scene.textures.exists("fx-petal")) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xffffff, 1);
  g.fillEllipse(4, 4, 5, 3);
  g.fillEllipse(3, 3, 2, 2);
  g.generateTexture("fx-petal", 8, 8);
  g.destroy();
}

/** Soft leaf diamond. Safe to call more than once. */
export function registerLeafTexture(scene) {
  if (scene.textures.exists("fx-leaf")) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xffffff, 1);
  g.fillTriangle(4, 1, 7, 5, 4, 7);
  g.fillTriangle(4, 1, 1, 5, 4, 7);
  g.generateTexture("fx-leaf", 8, 8);
  g.destroy();
}
