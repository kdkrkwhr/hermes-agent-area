/** Rug (GID 18) walk sheen / dust ambient. Soft ADD flash when stepping on rug.
 *  Distinct from footprintTrail (dark ellipses): warm cream ADD oval + light dust.
 *  `?rug=0|off|false` off · `?rug=force` smoke (short CD, auto-pulse).
 */

import { registerDustTexture } from "./dustMotes.js";

const RUG_GID = 18;
/** Map has ~22 rugs — keep them all. */
const MAX_RUGS = 24;
/** Above furniture (0); below footprints (~8) / agents (10). */
const DEPTH = 4;
const COOLDOWN_MS = 2400;
const FORCE_COOLDOWN_MS = 550;
/** Rare idle edge sheen (not spam). */
const IDLE_MIN_MS = 9000;
const IDLE_MAX_MS = 16000;
const FORCE_IDLE_MS = 900;
/** Soft warm sheen (ADD) — not footprint brown. */
const SHEEN_COLOR = 0xffe8c8;
const SHEEN_MS = 420;
const RX = 18;
const RY = 10;

/**
 * Query: omit = on. `0`/`off`/`false` = never. `force` = short CD + auto-pulse.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function rugModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("rug");
    if (v == null || v === "") return { enabled: true, forced: false };
    if (v === "0" || v === "false" || v === "off") {
      return { enabled: false, forced: false };
    }
    if (v === "force" || v === "1" || v === "true" || v === "on") {
      return { enabled: true, forced: true };
    }
    return { enabled: true, forced: false };
  } catch {
    return { enabled: true, forced: false };
  }
}

export function rugEnabledFromQuery() {
  return rugModeFromQuery().enabled;
}

/**
 * Scan furniture for rug GID 18; return tile centers (≤ MAX_RUGS).
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number, gid: number }[]}
 */
export function findRugTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (!layer?.getTileAt || !scene.map) return hits;

  const tw = scene.map.tileWidth ?? 32;
  const th = scene.map.tileHeight ?? 32;

  for (let ty = 0; ty < scene.map.height; ty++) {
    for (let tx = 0; tx < scene.map.width; tx++) {
      const tile = layer.getTileAt(tx, ty);
      if (!tile || tile.index !== RUG_GID) continue;
      hits.push({
        tx,
        ty,
        gid: tile.index,
        x: tx * tw + tw / 2,
        y: ty * th + th / 2,
      });
      if (hits.length >= MAX_RUGS) return hits;
    }
  }
  return hits;
}

function entityTile(ent, tw) {
  if (ent?.tilePos) return ent.tilePos();
  if (!ent?.sprite) return null;
  const size = ent.tileSize || tw || 32;
  return {
    x: Math.floor(ent.sprite.x / size),
    y: Math.floor(ent.sprite.y / size),
  };
}

function isMovingEntity(ent) {
  if (!ent?.sprite?.active || !ent.sprite.visible) return false;
  if (ent._moving === true) return true;
  if (Array.isArray(ent.path) && ent.path.length > 0) return true;
  return false;
}

/** Agents + boss + visitor + mascot while walking. */
function collectWalkers(scene) {
  const out = [];
  for (const a of scene.agents || []) {
    if (isMovingEntity(a)) out.push(a);
  }
  if (isMovingEntity(scene.boss)) out.push(scene.boss);
  const visitor = scene.visitorDirector?.visitor;
  if (visitor?.alive !== false && isMovingEntity(visitor)) out.push(visitor);
  if (isMovingEntity(scene.mascot)) out.push(scene.mascot);
  return out;
}

function pickIdleInterval(forced) {
  if (forced) return FORCE_IDLE_MS;
  return (
    IDLE_MIN_MS + Math.floor(Math.random() * (IDLE_MAX_MS - IDLE_MIN_MS + 1))
  );
}

/**
 * Ambient rug walk sheen — tick from OfficeScene.updateVisualEffects.
 */
export class RugSheen {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = rugModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.tiles = this.enabled ? findRugTiles(scene) : [];
    /** @type {{ key: string, tx: number, ty: number, x: number, y: number, readyAt: number, flashCount: number }[]} */
    this.rugs = [];
    this.flashCount = 0;
    this.idleCount = 0;
    this.lastAt = null;
    this.lastKey = null;
    this.lastKind = null;
    this.nextIdleAt = 0;

    if (this.enabled) {
      registerDustTexture(scene);
      for (const t of this.tiles) {
        this.rugs.push({
          key: `${t.tx},${t.ty}`,
          tx: t.tx,
          ty: t.ty,
          x: t.x,
          y: t.y,
          readyAt: 0,
          flashCount: 0,
        });
      }
      this.nextIdleAt =
        (scene.time?.now ?? 0) + pickIdleInterval(this.forced);
    }

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  cooldownMs() {
    return this.forced ? FORCE_COOLDOWN_MS : COOLDOWN_MS;
  }

  shouldBeActive() {
    return this.enabled && this.rugs.length > 0;
  }

  sync() {
    this.publish();
  }

  /**
   * @param {number} [_time]
   * @param {number} [_delta]
   */
  update(_time, _delta) {
    if (!this.shouldBeActive()) return;

    const now = this.scene.time.now;
    const tw = this.scene.map?.tileWidth ?? 32;

    if (this.forced) {
      for (const rug of this.rugs) {
        if (now < rug.readyAt) continue;
        this._flash(rug, now, "force");
        break; // one per frame — avoid full-map spam
      }
    } else {
      const walkers = collectWalkers(this.scene);
      if (walkers.length) {
        for (const rug of this.rugs) {
          if (now < rug.readyAt) continue;
          let hit = false;
          for (const ent of walkers) {
            const t = entityTile(ent, tw);
            if (!t) continue;
            if (t.x === rug.tx && t.y === rug.ty) {
              hit = true;
              break;
            }
          }
          if (!hit) continue;
          this._flash(rug, now, "walk");
        }
      }
    }

    // optional idle edge sheen — rare, weak (skip when force already pulses)
    if (!this.forced && now >= this.nextIdleAt) {
      this.nextIdleAt = now + pickIdleInterval(false);
      const ready = this.rugs.filter((r) => now >= r.readyAt);
      if (ready.length) {
        const rug = ready[Math.floor(Math.random() * ready.length)];
        this._flash(rug, now, "idle", true);
      }
    }
  }

  /**
   * Soft ADD oval flash + light dust (walk) or weaker idle glow.
   * @param {{ key: string, tx: number, ty: number, x: number, y: number, readyAt: number, flashCount: number }} rug
   * @param {number} now
   * @param {"walk"|"force"|"idle"} kind
   * @param {boolean} [idleWeak]
   */
  _flash(rug, now, kind, idleWeak = false) {
    const scene = this.scene;
    rug.readyAt = now + this.cooldownMs();
    rug.flashCount += 1;
    this.flashCount += 1;
    if (idleWeak) this.idleCount += 1;
    this.lastAt = now;
    this.lastKey = rug.key;
    this.lastKind = kind;

    const alphaPeak = idleWeak ? 0.12 : 0.38;
    const rx = idleWeak ? RX * 0.85 : RX;
    const ry = idleWeak ? RY * 0.85 : RY;

    const gfx = scene.add.graphics().setDepth(DEPTH);
    gfx.setBlendMode("ADD");
    gfx.fillStyle(SHEEN_COLOR, alphaPeak * 0.45);
    gfx.fillEllipse(rug.x, rug.y + 2, rx * 2.1, ry * 2.1);
    gfx.fillStyle(SHEEN_COLOR, alphaPeak * 0.75);
    gfx.fillEllipse(rug.x, rug.y + 2, rx * 1.35, ry * 1.35);
    gfx.fillStyle(SHEEN_COLOR, alphaPeak);
    gfx.fillEllipse(rug.x, rug.y + 2, rx * 0.7, ry * 0.7);

    scene.tweens.add({
      targets: gfx,
      alpha: 0,
      duration: idleWeak ? SHEEN_MS * 1.2 : SHEEN_MS,
      ease: "Sine.easeOut",
      onComplete: () => {
        try {
          gfx.destroy();
        } catch {
          /* ignore */
        }
      },
    });

    if (!idleWeak) {
      this._dustPuff(rug.x, rug.y + 4);
    }

    this.publish();
  }

  /** Soft carpet dust — lighter / warmer than beanbag; not footprint-dark. */
  _dustPuff(x, y) {
    const scene = this.scene;
    if (!scene.textures.exists("fx-dust")) return;
    const emitter = scene.add.particles(x, y, "fx-dust", {
      speed: { min: 6, max: 22 },
      angle: { min: 210, max: 330 },
      gravityY: 10,
      scale: { start: 0.3, end: 0.04 },
      alpha: { start: 0.28, end: 0 },
      lifespan: { min: 200, max: 460 },
      quantity: 3,
      frequency: -1,
      tint: [0xffe8d0, 0xf0d8b8, 0xfff5e6],
      blendMode: "ADD",
    });
    emitter.setDepth(DEPTH + 1);
    emitter.explode(3);
    scene.time.delayedCall(520, () => {
      try {
        emitter.destroy();
      } catch {
        /* ignore */
      }
    });
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      active: this.shouldBeActive(),
      rugCount: this.rugs.length,
      rugTiles: this.tiles.length,
      cooldownMs: this.cooldownMs(),
      flashCount: this.flashCount,
      idleCount: this.idleCount,
      lastAt: this.lastAt,
      lastKey: this.lastKey,
      lastKind: this.lastKind,
      rugGid: RUG_GID,
      mode: rugModeFromQuery(),
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      rug: this.snapshot(),
    };
  }

  destroy() {
    this.rugs = [];
    this.tiles = [];
    this.publish();
  }
}

export { RUG_GID, MAX_RUGS, DEPTH as RUG_DEPTH };
