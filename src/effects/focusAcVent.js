/** Focus dualDesk AC vent cool mist — soft cyan downward drift.
 *  morning/day on · evening/night off.
 *  `?acvent=0|off|false` off · `?acvent=force` smoke (+tod=day).
 */

import { findDualDeskTiles, DUAL_DESK_GID } from "./dualDeskIdle.js";
import { registerFogTexture } from "./fogMist.js";
import { registerDustTexture } from "./dustMotes.js";

/** Below dualDesk LED(7) / deskSticky(8) / deskGlow(11) / headphones(23). */
const DEPTH = 6;
/** Cap emitters — keep cheap next to dualDeskIdle / headphones. */
const MAX_EMITTERS = 3;
const FREQ = 380;
const ALPHA = 0.14;
/** Soft cyan / cool-white — distinct from warm dualDesk amber. */
const TINTS = [0xa8e8ff, 0xc0f0ff, 0x88d8f0, 0xd0f4ff];

/**
 * Query: omit = TOD-driven. `0`/`off`/`false` = never. `force`/`1`/`on`/`true` = always.
 * @returns {{ forcedOff: boolean, forcedOn: boolean }}
 */
export function parseAcVentMode() {
  if (typeof location === "undefined") {
    return { forcedOff: false, forcedOn: false };
  }
  try {
    const raw = new URLSearchParams(location.search).get("acvent");
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

function isCoolTod(name) {
  return name === "morning" || name === "day";
}

/**
 * Prefer dualDesk GID26 tiles; fall back to focusDesks waypoints. Cap MAX_EMITTERS.
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number, source: string }[]}
 */
export function findAcVentAnchors(scene) {
  const desks = findDualDeskTiles(scene).slice(0, MAX_EMITTERS);
  if (desks.length) {
    return desks.map((d) => ({
      x: d.x,
      y: d.y - 14,
      tx: d.tx,
      ty: d.ty,
      source: "dualDesk",
    }));
  }

  const tw = scene.map?.tileWidth ?? 32;
  const th = scene.map?.tileHeight ?? 32;
  const focus = scene.waypoints?.focusDesks || [];
  const out = [];
  for (const t of focus) {
    if (out.length >= MAX_EMITTERS) break;
    out.push({
      x: t.x * tw + tw / 2,
      y: t.y * th + th / 2 - 14,
      tx: t.x,
      ty: t.y,
      source: "focusDesks",
    });
  }
  return out;
}

function textureKey(scene) {
  if (scene.textures.exists("fx-fog")) return "fx-fog";
  return "fx-dust";
}

/**
 * Cool mist emitters above Focus desks. Sync via applyTimeOfDayLighting.
 */
export class FocusAcVent {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = parseAcVentMode();
    this.forcedOff = mode.forcedOff;
    this.forcedOn = mode.forcedOn;
    this.enabled = !this.forcedOff;
    this.anchors = this.enabled ? findAcVentAnchors(scene) : [];
    /** @type {Phaser.GameObjects.Particles.ParticleEmitter[]} */
    this.emitters = [];
    this.active = false;
    this.mode = "off";
    this._lastKey = "";

    if (this.enabled && this.anchors.length) {
      registerFogTexture(scene);
      registerDustTexture(scene);
      for (const a of this.anchors) {
        this.emitters.push(this._makeEmitter(a.x, a.y));
      }
    }

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  _makeEmitter(x, y) {
    const key = textureKey(this.scene);
    const emitter = this.scene.add.particles(x, y, key, {
      speedX: { min: -14, max: 14 },
      speedY: { min: 6, max: 18 },
      scale: { start: 0.9, end: 1.8 },
      alpha: { start: ALPHA, end: 0 },
      lifespan: { min: 1400, max: 2600 },
      frequency: FREQ,
      quantity: 1,
      tint: TINTS,
      gravityY: 4,
      blendMode: "ADD",
      advance: 800,
      maxParticles: 12,
    });
    emitter.setDepth(DEPTH);
    emitter.stop();
    return emitter;
  }

  shouldBeActive() {
    if (this.forcedOff || !this.emitters.length) return false;
    if (this.forcedOn) return true;
    return isCoolTod(this.scene.lightingPreset?.name);
  }

  /** Call from applyTimeOfDayLighting. */
  sync() {
    if (!this.enabled || !this.emitters.length) {
      this.active = false;
      this.mode = "off";
      for (const e of this.emitters) e.stop();
      this.publish();
      return;
    }

    const want = this.shouldBeActive();
    this.mode = want ? (this.forcedOn ? "force" : "cool") : "off";

    if (!want) {
      if (this.active) {
        for (const e of this.emitters) e.stop();
      }
      this.active = false;
      this.publish();
      return;
    }

    for (const e of this.emitters) {
      e.setFrequency(FREQ);
      e.setParticleAlpha({ start: ALPHA, end: 0 });
      if (!this.active) e.start();
    }
    this.active = true;
    this.publish();
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forcedOn: this.forcedOn,
      forcedOff: this.forcedOff,
      active: this.active,
      mode: this.mode,
      tod: this.scene.lightingPreset?.name ?? null,
      emitterCount: this.emitters.length,
      maxEmitters: MAX_EMITTERS,
      anchors: this.anchors.map((a) => ({
        tx: a.tx,
        ty: a.ty,
        source: a.source,
      })),
      dualDeskGid: DUAL_DESK_GID,
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
      acvent: snap,
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
    this.active = false;
    this.publish();
  }
}

export { DEPTH as AC_VENT_DEPTH, MAX_EMITTERS as AC_VENT_MAX_EMITTERS };
