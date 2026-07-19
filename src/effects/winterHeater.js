/** Winter radiator/heater ambient — soft amber ADD glow + thin heat shimmer.
 * Dec–Feb calendar ON; spring/summer OFF.
 * `?heater=0` off · `?heater=1|force` force · `?heater=summer` smoke off-season.
 * weatherFx snowing(=cold)/cloudy → alpha↑; evening/night → glow↑.
 */

import { TILE_SIZE } from "../constants.js";
import { registerDustTexture } from "./dustMotes.js";

/** Above furniture; below agents (10). Near lampGlow(7) / umbrella(8.5). */
const DEPTH = 8;
/** Cap sites — Open Desk + lounge + lobby walls. */
const MAX_SITES = 4;
/** Soft amber / warm white — indoor heat vibe. */
const GLOW_COLOR = 0xffa040;
const SHIMMER_TINTS = [0xffb060, 0xffc878, 0xff9040, 0xffe0a0];
const GLOW_RADIUS = 22;
const SHIMMER_FREQ = 520;
const ALPHA_BASE = 0.22;
/** Optional hiss — rare; mute / ?sfx=0 skip via officeAudio. */
const HISS_GAP_MS = 48000;

/**
 * Query: omit = calendar. `0`/`off`/`false` = never.
 * `force`/`1`/`on`/`true` = always. `summer` = force off-season (smoke).
 * @returns {{ forcedOff: boolean, forcedOn: boolean, forceSummer: boolean }}
 */
export function parseHeaterMode() {
  if (typeof location === "undefined") {
    return { forcedOff: false, forcedOn: false, forceSummer: false };
  }
  try {
    const raw = new URLSearchParams(location.search).get("heater");
    if (raw == null || raw === "") {
      return { forcedOff: false, forcedOn: false, forceSummer: false };
    }
    const v = String(raw).toLowerCase();
    if (v === "0" || v === "off" || v === "false") {
      return { forcedOff: true, forcedOn: false, forceSummer: false };
    }
    if (v === "summer") {
      return { forcedOff: false, forcedOn: false, forceSummer: true };
    }
    if (v === "force" || v === "1" || v === "on" || v === "true") {
      return { forcedOff: false, forcedOn: true, forceSummer: false };
    }
  } catch {
    /* ignore */
  }
  return { forcedOff: false, forcedOn: false, forceSummer: false };
}

/** Dec–Feb → true. @param {number} month 1–12 */
export function isWinterMonth(month) {
  return month === 12 || month === 1 || month === 2;
}

/**
 * Wall-near anchors: Open Desk / lounge / lobby (no new GID).
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number, zone: string }[]}
 */
export function findHeaterAnchors(scene) {
  const tw = scene.map?.tileWidth ?? TILE_SIZE;
  const th = scene.map?.tileHeight ?? TILE_SIZE;
  /** Fixed wall strips — empty floor beside walls, not blocking path. */
  const seeds = [
    { tx: 1.2, ty: 6, zone: "open" },
    { tx: 10.5, ty: 2.2, zone: "open" },
    { tx: 15.2, ty: 17, zone: "lounge" },
    { tx: 24, ty: 26.4, zone: "lobby" },
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

function registerHeatTexture(scene) {
  if (scene.textures.exists("fx-heat")) return;
  registerDustTexture(scene);
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xffffff, 1);
  g.fillEllipse(2, 4, 3, 7);
  g.generateTexture("fx-heat", 4, 8);
  g.destroy();
}

function heatTexKey(scene) {
  if (scene.textures.exists("fx-heat")) return "fx-heat";
  return "fx-dust";
}

/**
 * weatherFx boost: snowing (=cold) / cloudy raise alpha.
 * @param {Phaser.Scene} scene
 * @returns {number} 0..~0.35
 */
export function weatherAlphaBoost(scene) {
  const cls = scene.weatherFx?.classification;
  if (!cls) return 0;
  let b = 0;
  if (cls.snowing || cls.cold) b += 0.18;
  if (cls.cloudy) b += 0.12;
  return b;
}

function todGlowMul(name) {
  if (name === "night") return 1.45;
  if (name === "evening") return 1.35;
  if (name === "morning") return 0.85;
  return 1;
}

/**
 * Soft amber radiator glow + vertical heat shimmer near zone walls.
 */
export class WinterHeater {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = parseHeaterMode();
    this.forcedOff = mode.forcedOff;
    this.forcedOn = mode.forcedOn;
    this.forceSummer = mode.forceSummer;
    this.enabled = !this.forcedOff;
    this.anchors = this.enabled ? findHeaterAnchors(scene) : [];
    /** @type {Phaser.GameObjects.Particles.ParticleEmitter[]} */
    this.emitters = [];
    this.gfx = null;
    this.active = false;
    this.mode = "off";
    this._lastKey = "";
    this._lastHissAt = 0;
    this._alpha = ALPHA_BASE;

    if (this.enabled && this.anchors.length) {
      registerHeatTexture(scene);
      this.gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);
      this.gfx.setBlendMode("ADD");
      for (const a of this.anchors) {
        this.emitters.push(this._makeEmitter(a.x, a.y - 4));
      }
    }

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  _makeEmitter(x, y) {
    const key = heatTexKey(this.scene);
    const emitter = this.scene.add.particles(x, y, key, {
      speedX: { min: -4, max: 4 },
      speedY: { min: -22, max: -10 },
      scale: { start: 0.55, end: 0.1 },
      alpha: { start: 0.28, end: 0 },
      lifespan: { min: 700, max: 1400 },
      frequency: SHIMMER_FREQ,
      quantity: 1,
      tint: SHIMMER_TINTS,
      blendMode: "ADD",
      maxParticles: 8,
      advance: 400,
    });
    emitter.setDepth(DEPTH);
    emitter.stop();
    return emitter;
  }

  /** @returns {boolean} */
  inSeason() {
    if (this.forceSummer) return false;
    const month = new Date().getMonth() + 1;
    return isWinterMonth(month);
  }

  shouldBeActive() {
    if (this.forcedOff || !this.anchors.length) return false;
    if (this.forcedOn) return true;
    return this.inSeason();
  }

  /** Resolve alpha from TOD + weather. */
  resolveAlpha() {
    const tod = this.scene.lightingPreset?.name ?? "day";
    const base = ALPHA_BASE * todGlowMul(tod);
    return Math.min(0.72, base + weatherAlphaBoost(this.scene));
  }

  /** Call from applyTimeOfDayLighting / weatherFx. */
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
    this.mode = want
      ? this.forcedOn
        ? "force"
        : "winter"
      : this.forceSummer
        ? "summer"
        : "off";
    this._alpha = this.resolveAlpha();

    if (!want) {
      if (this.active) {
        for (const e of this.emitters) e.stop();
      }
      this.active = false;
      this.gfx.clear();
      this.gfx.setVisible(false);
      this.publish();
      return;
    }

    const wasOff = !this.active;
    for (const e of this.emitters) {
      e.setFrequency(SHIMMER_FREQ);
      e.setParticleAlpha({ start: Math.min(0.45, this._alpha + 0.08), end: 0 });
      if (!this.active) e.start();
    }
    this.active = true;
    this.gfx.setVisible(true);
    if (wasOff) this._maybeHiss();
    this.publish();
  }

  _maybeHiss() {
    const audio = this.scene.officeAudio;
    if (!audio?.sfxOk?.()) return;
    const now = this.scene.time?.now ?? 0;
    if (this._lastHissAt && now - this._lastHissAt < HISS_GAP_MS) return;
    this._lastHissAt = now;
    audio.playHeaterHiss?.();
  }

  /**
   * Slow breathe glow. @param {number} [time]
   */
  update(time = this.scene.time.now) {
    if (!this.active || !this.gfx) return;
    const phase = (Math.sin((time / 2800) * Math.PI * 2) + 1) / 2;
    const base = this._alpha * (0.7 + phase * 0.35);
    const g = this.gfx;
    g.clear();
    for (const a of this.anchors) {
      g.fillStyle(GLOW_COLOR, base * 0.35);
      g.fillCircle(a.x, a.y, GLOW_RADIUS);
      g.fillStyle(GLOW_COLOR, base * 0.55);
      g.fillCircle(a.x, a.y, GLOW_RADIUS * 0.55);
      g.fillStyle(GLOW_COLOR, base * 0.9);
      g.fillCircle(a.x, a.y - 2, GLOW_RADIUS * 0.28);
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forcedOn: this.forcedOn,
      forcedOff: this.forcedOff,
      forceSummer: this.forceSummer,
      active: this.active,
      mode: this.mode,
      tod: this.scene.lightingPreset?.name ?? null,
      alpha: this._alpha,
      weatherBoost: weatherAlphaBoost(this.scene),
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
      heater: snap,
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

export { DEPTH as HEATER_DEPTH, MAX_SITES as HEATER_MAX_SITES };
