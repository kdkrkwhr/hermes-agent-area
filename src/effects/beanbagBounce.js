/** Lounge beanbag (GID 24) squash bounce when idle agents pass within 2 tiles.
 *  `?beanbag=0|off|false` off · `?beanbag=force` smoke-friendly (short CD, no walk required).
 */

import { registerDustTexture } from "./dustMotes.js";

const BEANBAG_GID = 24;
const MAX_BEANBAGS = 12;
/** Above furniture (0); below zone labels (5). */
const DEPTH = 2;
/** Tile distance — pass-by trigger. */
const DIST_TILES = 2;
const COOLDOWN_MS = 2800;
const FORCE_COOLDOWN_MS = 600;
const SQUASH_Y = 0.92;
const BOUNCE_MS = 380;

/**
 * Query: omit = on. `0`/`off`/`false` = never. `force` = short CD + triggers without walk.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function beanbagModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("beanbag");
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

export function beanbagEnabledFromQuery() {
  return beanbagModeFromQuery().enabled;
}

/**
 * Scan furniture for beanbag GID 24; return tile centers.
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number, gid: number }[]}
 */
export function findBeanbagTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (!layer?.getTileAt || !scene.map) return hits;

  const tw = scene.map.tileWidth ?? 32;
  const th = scene.map.tileHeight ?? 32;

  for (let ty = 0; ty < scene.map.height; ty++) {
    for (let tx = 0; tx < scene.map.width; tx++) {
      const tile = layer.getTileAt(tx, ty);
      if (!tile || tile.index !== BEANBAG_GID) continue;
      hits.push({
        tx,
        ty,
        gid: tile.index,
        x: tx * tw + tw / 2,
        y: ty * th + th / 2,
        tile,
      });
      if (hits.length >= MAX_BEANBAGS) return hits;
    }
  }
  return hits;
}

function tileDistToBeanbag(agent, bean) {
  const ta = agent.tilePos?.() ?? {
    x: Math.floor(agent.sprite.x / (agent.tileSize || 32)),
    y: Math.floor(agent.sprite.y / (agent.tileSize || 32)),
  };
  const dx = ta.x - bean.tx;
  const dy = ta.y - bean.ty;
  return Math.hypot(dx, dy);
}

function isLoungeIdleAgent(agent) {
  if (!agent?.sprite?.active || !agent.sprite.visible) return false;
  const kind = agent.getEffectKind?.();
  if (kind !== "idle") return false;
  if (agent.currentKind === "desk" || agent.currentKind === "focus") return false;
  if (agent.currentKind === "meeting" || agent.currentKind === "review") return false;
  const zone = agent.serverData?.zone;
  if (zone === "desk" || zone === "focus" || zone === "meeting" || zone === "review") {
    return false;
  }
  return true;
}

function isPassingAgent(agent, forced) {
  if (!isLoungeIdleAgent(agent)) return false;
  if (forced) return true;
  return Array.isArray(agent.path) && agent.path.length > 0;
}

/**
 * @param {Phaser.Scene} scene
 * @param {Phaser.Tilemaps.Tile} tile
 */
function makeBeanbagSprite(scene, tile) {
  const tileset = tile.tileset;
  const frame = tile.index - tileset.firstgid;
  const cx = tile.pixelX + tile.width / 2;
  const cy = tile.pixelY + tile.height;
  const spr = scene.add.image(cx, cy, tileset.name, frame);
  spr.setOrigin(0.5, 1);
  spr.setDepth(DEPTH);
  try {
    tile.alpha = 0;
  } catch {
    /* ignore */
  }
  return spr;
}

/**
 * Ambient beanbag squash — tick from OfficeScene.updateVisualEffects.
 */
export class BeanbagBounce {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = beanbagModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.tiles = this.enabled ? findBeanbagTiles(scene) : [];
    /** @type {{ key: string, tx: number, ty: number, x: number, y: number, sprite: Phaser.GameObjects.Image, readyAt: number, bouncing: boolean, bounceCount: number }[]} */
    this.beans = [];
    this.bounceCount = 0;
    this.lastAt = null;
    this.lastKey = null;

    if (this.enabled) {
      registerDustTexture(scene);
      for (const t of this.tiles) {
        const sprite = makeBeanbagSprite(scene, t.tile);
        this.beans.push({
          key: `${t.tx},${t.ty}`,
          tx: t.tx,
          ty: t.ty,
          x: t.x,
          y: t.y,
          sprite,
          readyAt: 0,
          bouncing: false,
          bounceCount: 0,
        });
      }
    }

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  cooldownMs() {
    return this.forced ? FORCE_COOLDOWN_MS : COOLDOWN_MS;
  }

  shouldBeActive() {
    return this.enabled && this.beans.length > 0;
  }

  sync() {
    if (!this.shouldBeActive()) {
      for (const b of this.beans) {
        try {
          b.sprite?.setVisible(false);
        } catch {
          /* ignore */
        }
      }
      this.publish();
      return;
    }
    for (const b of this.beans) {
      b.sprite?.setVisible(true);
    }
    this.publish();
  }

  update(_time, _delta) {
    if (!this.shouldBeActive()) return;
    const agents = this.scene.agents;
    if (!Array.isArray(agents) || !agents.length) return;

    const now = this.scene.time.now;
    const movers = agents.filter((a) => isPassingAgent(a, this.forced));
    if (!movers.length) return;

    for (const bean of this.beans) {
      if (now < bean.readyAt || bean.bouncing) continue;
      let near = false;
      for (const agent of movers) {
        if (tileDistToBeanbag(agent, bean) <= DIST_TILES) {
          near = true;
          break;
        }
      }
      if (!near) continue;
      this._bounce(bean, now);
    }
  }

  _bounce(bean, now) {
    const spr = bean.sprite;
    if (!spr?.active) return;

    bean.bouncing = true;
    bean.readyAt = now + this.cooldownMs();
    bean.bounceCount += 1;
    this.bounceCount += 1;
    this.lastAt = now;
    this.lastKey = bean.key;

    this.scene.tweens.killTweensOf(spr);
    spr.setScale(1, SQUASH_Y);
    this.scene.tweens.add({
      targets: spr,
      scaleY: 1,
      duration: BOUNCE_MS,
      ease: "Back.easeOut",
      onComplete: () => {
        bean.bouncing = false;
        try {
          if (spr.active) spr.setScale(1, 1);
        } catch {
          /* ignore */
        }
        this.publish();
      },
    });

    this._dustPuff(bean.x, bean.y - 6);
    this.publish();
  }

  _dustPuff(x, y) {
    const scene = this.scene;
    if (!scene.textures.exists("fx-dust")) return;
    const emitter = scene.add.particles(x, y, "fx-dust", {
      speed: { min: 8, max: 28 },
      angle: { min: 200, max: 340 },
      gravityY: 12,
      scale: { start: 0.35, end: 0.05 },
      alpha: { start: 0.35, end: 0 },
      lifespan: { min: 220, max: 480 },
      quantity: 4,
      frequency: -1,
      tint: [0xd8c4a8, 0xc8b090, 0xe8dcc8],
      blendMode: "NORMAL",
    });
    emitter.setDepth(DEPTH + 1);
    emitter.explode(4);
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
      beanbagCount: this.beans.length,
      beanbagTiles: this.tiles.length,
      distTiles: DIST_TILES,
      cooldownMs: this.cooldownMs(),
      bounceCount: this.bounceCount,
      lastAt: this.lastAt,
      lastKey: this.lastKey,
      mode: beanbagModeFromQuery(),
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      beanbag: this.snapshot(),
    };
  }

  destroy() {
    for (const b of this.beans) {
      try {
        this.scene.tweens.killTweensOf(b.sprite);
        b.sprite?.destroy();
      } catch {
        /* ignore */
      }
    }
    this.beans = [];
    this.tiles = [];
    this.publish();
  }
}

export { BEANBAG_GID, MAX_BEANBAGS, DEPTH as BEANBAG_DEPTH };
