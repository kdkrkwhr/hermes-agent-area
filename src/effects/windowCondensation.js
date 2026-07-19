/** Morning window condensation on north GID-12 glass.
 *  Soft haze + slow drip droplets. evening/night/day off.
 *  raining/snowing/fog skip. `?condensation=0` off · `?condensation=force` smoke (+tod=morning).
 */

import { findWindowTiles, MAX_EMITTERS } from "./windowRain.js";
import { registerDustTexture } from "./dustMotes.js";

/** Above rain (4); near blinds (5.5); below lighting (6) / agents (10). */
const DEPTH = 5.2;
/** Soft cool glass haze — below droplet sparkle. */
const HAZE_COLOR = 0xc8dcec;
const HAZE_ALPHA = 0.1;
/** Droplet tints — cool glass beads. */
const DROP_TINTS = [0xd8e8f4, 0xb8d0e4, 0xe8f2fa, 0xa8c4d8];
const DROP_FREQ = 420;
const DROP_ALPHA = 0.38;

/**
 * Query: omit = morning-gated. `0`/`off`/`false` = never.
 * `force`/`1`/`on`/`true` = always (still mute on precip/fog).
 * @returns {{ forcedOff: boolean, forcedOn: boolean }}
 */
export function parseCondensationMode() {
  if (typeof location === "undefined") {
    return { forcedOff: false, forcedOn: false };
  }
  try {
    const raw = new URLSearchParams(location.search).get("condensation");
    if (raw === "0" || raw === "off" || raw === "false") {
      return { forcedOff: true, forcedOn: false };
    }
    if (raw === "force" || raw === "1" || raw === "on" || raw === "true") {
      return { forcedOff: false, forcedOn: true };
    }
  } catch {
    /* ignore */
  }
  return { forcedOff: false, forcedOn: false };
}

/** Evenly sample tiles so we keep <= MAX_EMITTERS panes. */
function sampleTiles(tiles, max = MAX_EMITTERS) {
  if (tiles.length <= max) return tiles.slice();
  const out = [];
  const step = (tiles.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    out.push(tiles[Math.round(i * step)]);
  }
  return out;
}

function ensureDropTexture(scene) {
  if (scene.textures.exists("fx-condensation-drop")) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xffffff, 0.9);
  g.fillEllipse(3, 4, 4, 6);
  g.fillStyle(0xffffff, 0.35);
  g.fillCircle(2.5, 2.5, 1.2);
  g.generateTexture("fx-condensation-drop", 6, 8);
  g.destroy();
}

/**
 * Soft interior condensation on north glass. Sync via applyTimeOfDayLighting + weatherFx.
 */
export class WindowCondensation {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = parseCondensationMode();
    this.forcedOff = mode.forcedOff;
    this.forcedOn = mode.forcedOn;
    this.enabled = !this.forcedOff;
    this.tiles = this.enabled ? findWindowTiles(scene) : [];
    this.anchors = sampleTiles(this.tiles);
    this.active = false;
    this.mode = "off";
    /** @type {Phaser.GameObjects.Particles.ParticleEmitter[]} */
    this.emitters = [];
    this.gfx = null;
    this._hazePhase = 0;

    if (this.enabled && this.anchors.length) {
      registerDustTexture(scene);
      ensureDropTexture(scene);
      this.gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);
      for (const a of this.anchors) {
        this.emitters.push(this._makeEmitter(a));
      }
    }

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  _makeEmitter(a) {
    const tw = this.scene.map?.tileWidth ?? 32;
    const th = this.scene.map?.tileHeight ?? 32;
    const emitter = this.scene.add.particles(a.x, a.y - th * 0.15, "fx-condensation-drop", {
      x: { min: -tw * 0.28, max: tw * 0.28 },
      y: { min: -th * 0.2, max: th * 0.05 },
      speedX: { min: -2, max: 2 },
      speedY: { min: 6, max: 16 },
      scale: { start: 0.55, end: 0.2 },
      alpha: { start: DROP_ALPHA, end: 0 },
      lifespan: { min: 2200, max: 4800 },
      frequency: DROP_FREQ,
      quantity: 1,
      tint: DROP_TINTS,
      gravityY: 8,
      blendMode: "ADD",
      maxParticles: 10,
    });
    emitter.setDepth(DEPTH + 0.05);
    emitter.stop();
    return emitter;
  }

  /** Real precip + fog weather — not morning-only ground mist. */
  isBlockedByWeather() {
    const wx = this.scene.weatherFx?.classification;
    if (wx?.raining || wx?.snowing) return true;
    if (wx) {
      const blob = `${wx.sky || ""} ${wx.precip || ""} ${wx.label || ""}`.toLowerCase();
      if (/안개|fog|mist/.test(blob)) return true;
    }
    const rain = this.scene.windowRain;
    const snow = this.scene.snowFlakes;
    if (rain && !rain.forcedOff && (rain.forcedOn || rain.weatherForceOn)) {
      return true;
    }
    if (snow && !snow.forcedOff && (snow.forcedOn || snow.weatherForceOn)) {
      return true;
    }
    const fog = this.scene.fogMist;
    if (fog?.forcedOn) return true;
    if (fog?.cloudy) return true;
    return false;
  }

  shouldBeActive() {
    if (!this.enabled || !this.anchors.length) return false;
    if (this.isBlockedByWeather()) return false;
    if (this.forcedOn) return true;
    return this.scene.lightingPreset?.name === "morning";
  }

  /** Call from applyTimeOfDayLighting / weatherFx. */
  sync() {
    const want = this.shouldBeActive();
    if (!want) {
      this.active = false;
      this.mode = "off";
      this.gfx?.clear();
      this.gfx?.setVisible(false);
      for (const e of this.emitters) e.stop();
      this.publish();
      return;
    }

    this.mode = this.forcedOn ? "force" : "haze";
    this.gfx?.setVisible(true);
    this._drawHaze();
    for (const e of this.emitters) {
      if (!this.active) e.start();
    }
    this.active = true;
    this.publish();
  }

  _drawHaze() {
    const g = this.gfx;
    if (!g) return;
    g.clear();
    const tw = this.scene.map?.tileWidth ?? 32;
    const th = this.scene.map?.tileHeight ?? 32;
    const pulse = 0.85 + 0.15 * Math.sin(this._hazePhase);
    const alpha = HAZE_ALPHA * pulse;

    for (const a of this.anchors) {
      const left = a.x - tw / 2 + 2;
      const top = a.y - th / 2 + 2;
      const w = tw - 4;
      const h = th - 4;
      g.fillStyle(HAZE_COLOR, alpha * 0.55);
      g.fillRect(left, top, w, h);
      g.fillStyle(HAZE_COLOR, alpha);
      g.fillRect(left + 1, top + 1, w - 2, h * 0.45);
      // soft reflection streak
      g.fillStyle(0xe8f4fc, alpha * 0.7);
      g.fillRect(left + w * 0.15, top + 2, Math.max(2, w * 0.12), h * 0.55);
    }
  }

  /** Slow haze breathe — call from OfficeScene.update. */
  update(_time, delta) {
    if (!this.active || !this.gfx) return;
    this._hazePhase += (delta || 16) * 0.0012;
    this._drawHaze();
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forcedOn: this.forcedOn,
      forcedOff: this.forcedOff,
      active: this.active,
      mode: this.mode,
      emitterCount: this.emitters.length,
      windowTiles: this.tiles.length,
      depth: DEPTH,
      lighting: this.scene.lightingPreset?.name ?? null,
      blocked: this.isBlockedByWeather(),
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      condensation: this.snapshot(),
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
