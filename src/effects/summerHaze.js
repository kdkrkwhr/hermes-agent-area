/** Summer heat-haze ambient — soft warm amber/peach ground shimmer + slow ripple.
 * Jun–Aug calendar ON; other months OFF.
 * morning/day full · evening weak · night off.
 * `?haze=0` off · `?haze=force` (+`?tod=day`) smoke.
 * Visual only — no SFX. Does not touch winterHeater / focusAcVent / dustMotes.
 */

import { TILE_SIZE } from "../constants.js";
import { registerDustTexture } from "./dustMotes.js";

/** Above dust/heater(8); below agents(10). Mid-air over Open Desk / lounge. */
const DEPTH = 8.5;
/** Cap sites — Open Desk + lounge overhead only. */
const MAX_SITES = 3;
/** Soft peach / warm amber — summer heat vibe (cooler than heater fire). */
const GLOW_COLOR = 0xffc878;
const RIPPLE_TINTS = [0xffd090, 0xffe0b0, 0xffb868, 0xfff0c8];
const GLOW_RADIUS = 36;
const RIPPLE_FREQ = 900;
const ALPHA_BASE = 0.16;

/**
 * Query: omit = calendar. `0`/`off`/`false` = never.
 * `force`/`1`/`on`/`true` = always (smoke).
 * @returns {{ forcedOff: boolean, forcedOn: boolean }}
 */
export function parseHazeMode() {
  if (typeof location === "undefined") {
    return { forcedOff: false, forcedOn: false };
  }
  try {
    const raw = new URLSearchParams(location.search).get("haze");
    if (raw == null || raw === "") {
      return { forcedOff: false, forcedOn: false };
    }
    const v = String(raw).toLowerCase();
    if (v === "0" || v === "off" || v === "false") {
      return { forcedOff: true, forcedOn: false };
    }
    if (v === "force" || v === "1" || v === "on" || v === "true") {
      return { forcedOff: false, forcedOn: true };
    }
  } catch {
    /* ignore */
  }
  return { forcedOff: false, forcedOn: false };
}

/** Jun–Aug → true. @param {number} month 1–12 */
export function isSummerMonth(month) {
  return month >= 6 && month <= 8;
}

/**
 * Overhead anchors: Open Desk + lounge air (no new GID, away from heater walls).
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number, zone: string }[]}
 */
export function findHazeAnchors(scene) {
  const tw = scene.map?.tileWidth ?? TILE_SIZE;
  const th = scene.map?.tileHeight ?? TILE_SIZE;
  const seeds = [
    { tx: 5.5, ty: 5.2, zone: "open" },
    { tx: 11.8, ty: 4.0, zone: "open" },
    { tx: 16.2, ty: 15.5, zone: "lounge" },
  ];
  const out = [];
  for (const s of seeds) {
    if (out.length >= MAX_SITES) break;
    out.push({
      tx: s.tx,
      ty: s.ty,
      x: s.tx * tw + tw / 2,
      y: s.ty * th + th / 2,
      zone: s.zone,
    });
  }
  return out;
}

function registerHazeTexture(scene) {
  if (scene.textures.exists("fx-haze")) return;
  registerDustTexture(scene);
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xffffff, 1);
  g.fillEllipse(4, 2, 7, 3);
  g.generateTexture("fx-haze", 8, 4);
  g.destroy();
}

function hazeTexKey(scene) {
  if (scene.textures.exists("fx-haze")) return "fx-haze";
  return "fx-dust";
}

/** TOD mul: day/morning full, evening weak, night off (0). */
function todHazeMul(name) {
  if (name === "night") return 0;
  if (name === "evening") return 0.35;
  if (name === "morning") return 0.9;
  return 1;
}

/**
 * Soft peach ground shimmer + slow horizontal heat-ripple particles.
 */
export class SummerHaze {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = parseHazeMode();
    this.forcedOff = mode.forcedOff;
    this.forcedOn = mode.forcedOn;
    this.enabled = !this.forcedOff;
    this.anchors = this.enabled ? findHazeAnchors(scene) : [];
    /** @type {Phaser.GameObjects.Particles.ParticleEmitter[]} */
    this.emitters = [];
    this.gfx = null;
    this.active = false;
    this.mode = "off";
    this._lastKey = "";
    this._alpha = ALPHA_BASE;

    if (this.enabled && this.anchors.length) {
      registerHazeTexture(scene);
      this.gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);
      this.gfx.setBlendMode("ADD");
      for (const a of this.anchors) {
        this.emitters.push(this._makeEmitter(a.x, a.y));
      }
    }

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  _makeEmitter(x, y) {
    const key = hazeTexKey(this.scene);
    const emitter = this.scene.add.particles(x, y, key, {
      speedX: { min: -10, max: 10 },
      speedY: { min: -3, max: 3 },
      scale: { start: 1.1, end: 0.35 },
      alpha: { start: 0.18, end: 0 },
      lifespan: { min: 1400, max: 2600 },
      frequency: RIPPLE_FREQ,
      quantity: 1,
      tint: RIPPLE_TINTS,
      blendMode: "ADD",
      maxParticles: 6,
      advance: 600,
    });
    emitter.setDepth(DEPTH);
    emitter.stop();
    return emitter;
  }

  /** @returns {boolean} */
  inSeason() {
    const month = new Date().getMonth() + 1;
    return isSummerMonth(month);
  }

  shouldBeActive() {
    if (this.forcedOff || !this.anchors.length) return false;
    if (this.forcedOn) return true;
    const tod = this.scene.lightingPreset?.name ?? "day";
    if (todHazeMul(tod) <= 0) return false; // night off
    return this.inSeason();
  }

  /** Resolve alpha from TOD. Force keeps a faint night shimmer for smoke. */
  resolveAlpha() {
    const tod = this.scene.lightingPreset?.name ?? "day";
    let mul = todHazeMul(tod);
    if (this.forcedOn && tod === "night") mul = 0.22;
    if (this.forcedOn && tod === "evening") mul = Math.max(mul, 0.4);
    return ALPHA_BASE * mul;
  }

  /** Call from applyTimeOfDayLighting. */
  sync() {
    if (!this.enabled || !this.anchors.length || !this.gfx) {
      this.active = false;
      this.mode = "off";
      this.gfx?.clear();
      this.gfx?.setVisible(false);
      for (const e of this.emitters) e.stop();
      this.publish();
      return;
    }

    const want = this.shouldBeActive();
    this._alpha = this.resolveAlpha();
    this.mode = want ? (this.forcedOn ? "force" : "summer") : "off";

    if (!want || this._alpha <= 0.01) {
      if (this.active) {
        for (const e of this.emitters) e.stop();
      }
      this.active = false;
      this.gfx.clear();
      this.gfx.setVisible(false);
      this.publish();
      return;
    }

    for (const e of this.emitters) {
      e.setFrequency(RIPPLE_FREQ);
      e.setParticleAlpha({
        start: Math.min(0.32, this._alpha + 0.06),
        end: 0,
      });
      if (!this.active) e.start();
    }
    this.active = true;
    this.gfx.setVisible(true);
    this.publish();
  }

  /**
   * Slow breathe ground shimmer. @param {number} [time]
   */
  update(time = this.scene.time.now) {
    if (!this.active || !this.gfx) return;
    const phase = (Math.sin((time / 4200) * Math.PI * 2) + 1) / 2;
    const base = this._alpha * (0.65 + phase * 0.4);
    const g = this.gfx;
    g.clear();
    for (const a of this.anchors) {
      const wobble = Math.sin(time / 1800 + a.tx) * 3;
      g.fillStyle(GLOW_COLOR, base * 0.28);
      g.fillEllipse(a.x + wobble, a.y, GLOW_RADIUS * 1.6, GLOW_RADIUS * 0.7);
      g.fillStyle(GLOW_COLOR, base * 0.45);
      g.fillEllipse(a.x - wobble * 0.5, a.y - 2, GLOW_RADIUS, GLOW_RADIUS * 0.45);
      g.fillStyle(GLOW_COLOR, base * 0.7);
      g.fillEllipse(a.x, a.y - 1, GLOW_RADIUS * 0.4, GLOW_RADIUS * 0.2);
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forcedOn: this.forcedOn,
      forcedOff: this.forcedOff,
      active: this.active,
      mode: this.mode,
      tod: this.scene.lightingPreset?.name ?? null,
      alpha: this._alpha,
      month: new Date().getMonth() + 1,
      inSeason: this.inSeason(),
      emitterCount: this.emitters.length,
      siteCount: this.anchors.length,
      anchors: this.anchors.map((a) => ({
        tx: a.tx,
        ty: a.ty,
        zone: a.zone,
      })),
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
      haze: snap,
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
    try {
      this.gfx?.destroy();
    } catch {
      /* ignore */
    }
    this.gfx = null;
    this.active = false;
    this.publish();
  }
}

export { DEPTH as HAZE_DEPTH, MAX_SITES as HAZE_MAX_SITES };
