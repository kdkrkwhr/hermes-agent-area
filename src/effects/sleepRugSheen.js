/** Sleep rug (GID 28) soft sheen / dust ambient.
 *  Walk on rug or idle near Nap Pod → soft cool ADD flash + dust puff.
 *  Distinct from rugSheen (GID 18 warm cream): cool lavender, quieter.
 *  evening/night alpha slightly lower. `?sleeprug=0` off · `?sleeprug=force` smoke.
 */

import { registerDustTexture } from "./dustMotes.js";
import { findNapPodTiles } from "./napPodBreathe.js";

const SLEEP_RUG_GID = 28;
/** Map has 2 sleep rugs — keep headroom. */
const MAX_RUGS = 8;
/** Above furniture (0); below footprints (~8) / agents (10). Match rugSheen. */
const DEPTH = 4;
const COOLDOWN_MS = 2800;
const FORCE_COOLDOWN_MS = 550;
/** Idle-near Nap Pod trigger distance (tiles). */
const NAP_IDLE_DIST = 2;
/** Rare idle edge sheen on rugs themselves. */
const IDLE_MIN_MS = 10000;
const IDLE_MAX_MS = 18000;
const FORCE_IDLE_MS = 900;
/** Cool sleep lavender (ADD) — not rugSheen warm cream. */
const SHEEN_COLOR = 0xc8d4ec;
const SHEEN_MS = 480;
const RX = 17;
const RY = 9;

/**
 * Query: omit = on. `0`/`off`/`false` = never. `force` = short CD + auto-pulse.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function sleepRugModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("sleeprug");
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

export function sleepRugEnabledFromQuery() {
  return sleepRugModeFromQuery().enabled;
}

/**
 * Scan furniture for sleep rug GID 28; return tile centers (≤ MAX_RUGS).
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number, gid: number }[]}
 */
export function findSleepRugTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (!layer?.getTileAt || !scene.map) return hits;

  const tw = scene.map.tileWidth ?? 32;
  const th = scene.map.tileHeight ?? 32;

  for (let ty = 0; ty < scene.map.height; ty++) {
    for (let tx = 0; tx < scene.map.width; tx++) {
      const tile = layer.getTileAt(tx, ty);
      if (!tile || tile.index !== SLEEP_RUG_GID) continue;
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

/** evening/night slightly quieter; day/morning full soft; forced = peak. */
function alphaScale(lightingName, forced) {
  if (forced) return 1;
  if (lightingName === "evening" || lightingName === "night") return 0.72;
  return 1;
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

function isIdleNearNap(ent) {
  if (!ent?.sprite?.active || !ent.sprite.visible) return false;
  if (isMovingEntity(ent)) return false;
  const kind = ent.getEffectKind?.();
  // sleep / break / idle — Nap Pod dwellers + lounge idle near sleep zone
  if (kind === "sleep" || kind === "idle" || kind === "break") return true;
  if (ent.currentKind === "sleep") return true;
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

/** Idle agents/boss near Nap Pod (for soft ambient sheen on rugs). */
function collectNapIdlers(scene) {
  const out = [];
  for (const a of scene.agents || []) {
    if (isIdleNearNap(a)) out.push(a);
  }
  if (isIdleNearNap(scene.boss)) out.push(scene.boss);
  return out;
}

function tileDist(ax, ay, bx, by) {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

function pickIdleInterval(forced) {
  if (forced) return FORCE_IDLE_MS;
  return (
    IDLE_MIN_MS + Math.floor(Math.random() * (IDLE_MAX_MS - IDLE_MIN_MS + 1))
  );
}

/**
 * Ambient sleep-rug sheen — tick from OfficeScene.updateVisualEffects.
 */
export class SleepRugSheen {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = sleepRugModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.tiles = this.enabled ? findSleepRugTiles(scene) : [];
    this.napAnchors = this.enabled ? findNapPodTiles(scene) : [];
    /** @type {{ key: string, tx: number, ty: number, x: number, y: number, readyAt: number, flashCount: number }[]} */
    this.rugs = [];
    this.flashCount = 0;
    this.idleCount = 0;
    this.napIdleCount = 0;
    this.lastAt = null;
    this.lastKey = null;
    this.lastKind = null;
    this.nextIdleAt = 0;
    this.todAlpha = 1;

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
    this.todAlpha = alphaScale(
      this.scene.lightingPreset?.name,
      this.forced,
    );
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
        break;
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

      // Nap Pod idle nearby → soft sheen on a ready sleep rug (cooldown)
      const idlers = collectNapIdlers(this.scene);
      if (idlers.length && this.napAnchors.length) {
        for (const ent of idlers) {
          const t = entityTile(ent, tw);
          if (!t) continue;
          let nearNap = false;
          for (const nap of this.napAnchors) {
            if (tileDist(t.x, t.y, nap.tx, nap.ty) <= NAP_IDLE_DIST) {
              nearNap = true;
              break;
            }
          }
          if (!nearNap) continue;
          const ready = this.rugs.filter((r) => now >= r.readyAt);
          if (!ready.length) break;
          const rug = ready[Math.floor(Math.random() * ready.length)];
          this._flash(rug, now, "napIdle", true);
          this.napIdleCount += 1;
          break; // one nap-idle flash per tick
        }
      }
    }

    // rare idle edge sheen — skip when force already pulses
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
   * Soft cool ADD oval flash + light dust (walk/force) or weaker idle glow.
   * @param {{ key: string, tx: number, ty: number, x: number, y: number, readyAt: number, flashCount: number }} rug
   * @param {number} now
   * @param {"walk"|"force"|"idle"|"napIdle"} kind
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

    const tod = this.todAlpha;
    const alphaPeak = (idleWeak ? 0.1 : 0.32) * tod;
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
      duration: idleWeak ? SHEEN_MS * 1.25 : SHEEN_MS,
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

  /** Soft cool carpet dust — lavender, quieter than lounge rugSheen. */
  _dustPuff(x, y) {
    const scene = this.scene;
    if (!scene.textures.exists("fx-dust")) return;
    const a = 0.22 * this.todAlpha;
    const emitter = scene.add.particles(x, y, "fx-dust", {
      speed: { min: 5, max: 18 },
      angle: { min: 210, max: 330 },
      gravityY: 8,
      scale: { start: 0.28, end: 0.04 },
      alpha: { start: a, end: 0 },
      lifespan: { min: 220, max: 480 },
      quantity: 3,
      frequency: -1,
      tint: [0xd0dce8, 0xb8c8e0, 0xe8eef8],
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
      napAnchors: this.napAnchors.length,
      cooldownMs: this.cooldownMs(),
      flashCount: this.flashCount,
      idleCount: this.idleCount,
      napIdleCount: this.napIdleCount,
      todAlpha: this.todAlpha,
      lastAt: this.lastAt,
      lastKey: this.lastKey,
      lastKind: this.lastKind,
      sleepRugGid: SLEEP_RUG_GID,
      lighting: this.scene.lightingPreset?.name ?? null,
      mode: sleepRugModeFromQuery(),
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      sleeprug: this.snapshot(),
    };
  }

  destroy() {
    this.rugs = [];
    this.tiles = [];
    this.napAnchors = [];
    this.publish();
  }
}

export { SLEEP_RUG_GID, MAX_RUGS, DEPTH as SLEEP_RUG_DEPTH };
