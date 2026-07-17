/** Lounge sofa (GID 9) cushion squash when idle agents sit within 2 tiles.
 *  `?sofa=0|off|false` off · `?sofa=force` smoke-friendly (short CD).
 */

import { registerDustTexture } from "./dustMotes.js";

const SOFA_GID = 9;
const MAX_SOFAS = 8;
/** Above furniture (0); below zone labels (5). Distinct from beanbag(2)/plant(3). */
const DEPTH = 2;
/** Tile distance — proximity trigger. */
const DIST_TILES = 2;
const COOLDOWN_MS = 3200;
const FORCE_COOLDOWN_MS = 700;
const SQUASH_Y = 0.94;
const BOUNCE_MS = 420;

/**
 * Query: omit = on. `0`/`off`/`false` = never. `force` = short CD.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function sofaModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("sofa");
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

export function sofaEnabledFromQuery() {
  return sofaModeFromQuery().enabled;
}

/**
 * Scan furniture for sofa GID 9; return tile centers (≤ MAX_SOFAS).
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number, gid: number, tile: Phaser.Tilemaps.Tile }[]}
 */
export function findSofaTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (!layer?.getTileAt || !scene.map) return hits;

  const tw = scene.map.tileWidth ?? 32;
  const th = scene.map.tileHeight ?? 32;

  for (let ty = 0; ty < scene.map.height; ty++) {
    for (let tx = 0; tx < scene.map.width; tx++) {
      const tile = layer.getTileAt(tx, ty);
      if (!tile || tile.index !== SOFA_GID) continue;
      hits.push({
        tx,
        ty,
        gid: tile.index,
        x: tx * tw + tw / 2,
        y: ty * th + th / 2,
        tile,
      });
      if (hits.length >= MAX_SOFAS) return hits;
    }
  }
  return hits;
}

function tileDistToSofa(agent, sofa) {
  const ta = agent.tilePos?.() ?? {
    x: Math.floor(agent.sprite.x / (agent.tileSize || 32)),
    y: Math.floor(agent.sprite.y / (agent.tileSize || 32)),
  };
  const dx = ta.x - sofa.tx;
  const dy = ta.y - sofa.ty;
  return Math.hypot(dx, dy);
}

/** idle / break / lounge — not desk/focus/meeting/review. */
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

/**
 * @param {Phaser.Scene} scene
 * @param {Phaser.Tilemaps.Tile} tile
 */
function makeSofaSprite(scene, tile) {
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
 * Ambient sofa cushion squash — tick from OfficeScene.updateVisualEffects.
 */
export class SofaCushion {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = sofaModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.tiles = this.enabled ? findSofaTiles(scene) : [];
    /** @type {{ key: string, tx: number, ty: number, x: number, y: number, sprite: Phaser.GameObjects.Image, readyAt: number, squashing: boolean, squashCount: number }[]} */
    this.sofas = [];
    this.squashCount = 0;
    this.lastAt = null;
    this.lastKey = null;

    if (this.enabled) {
      registerDustTexture(scene);
      for (const t of this.tiles) {
        const sprite = makeSofaSprite(scene, t.tile);
        this.sofas.push({
          key: `${t.tx},${t.ty}`,
          tx: t.tx,
          ty: t.ty,
          x: t.x,
          y: t.y,
          sprite,
          readyAt: 0,
          squashing: false,
          squashCount: 0,
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
    return this.enabled && this.sofas.length > 0;
  }

  sync() {
    if (!this.shouldBeActive()) {
      for (const s of this.sofas) {
        try {
          s.sprite?.setVisible(false);
        } catch {
          /* ignore */
        }
      }
      this.publish();
      return;
    }
    for (const s of this.sofas) {
      s.sprite?.setVisible(true);
    }
    this.publish();
  }

  update(_time, _delta) {
    if (!this.shouldBeActive()) return;
    const agents = this.scene.agents;
    if (!Array.isArray(agents) || !agents.length) return;

    const now = this.scene.time.now;
    const nearAgents = agents.filter((a) => isLoungeIdleAgent(a));
    if (!nearAgents.length && !this.forced) return;

    for (const sofa of this.sofas) {
      if (now < sofa.readyAt || sofa.squashing) continue;
      let near = this.forced;
      if (!near) {
        for (const agent of nearAgents) {
          if (tileDistToSofa(agent, sofa) <= DIST_TILES) {
            near = true;
            break;
          }
        }
      }
      if (!near) continue;
      this._squash(sofa, now);
    }
  }

  _squash(sofa, now) {
    const spr = sofa.sprite;
    if (!spr?.active) return;

    sofa.squashing = true;
    sofa.readyAt = now + this.cooldownMs();
    sofa.squashCount += 1;
    this.squashCount += 1;
    this.lastAt = now;
    this.lastKey = sofa.key;

    this.scene.tweens.killTweensOf(spr);
    spr.setScale(1, SQUASH_Y);
    this.scene.tweens.add({
      targets: spr,
      scaleY: 1,
      duration: BOUNCE_MS,
      ease: "Sine.easeOut",
      onComplete: () => {
        sofa.squashing = false;
        try {
          if (spr.active) spr.setScale(1, 1);
        } catch {
          /* ignore */
        }
        this.publish();
      },
    });

    this._dustPuff(sofa.x, sofa.y - 8);
    this.publish();
  }

  /** Weaker dust than beanbag — soft cushion settle. */
  _dustPuff(x, y) {
    const scene = this.scene;
    if (!scene.textures.exists("fx-dust")) return;
    const emitter = scene.add.particles(x, y, "fx-dust", {
      speed: { min: 4, max: 16 },
      angle: { min: 220, max: 320 },
      gravityY: 8,
      scale: { start: 0.28, end: 0.04 },
      alpha: { start: 0.22, end: 0 },
      lifespan: { min: 200, max: 420 },
      quantity: 3,
      frequency: -1,
      tint: [0xd0c4b0, 0xc0b098, 0xe0d8c8],
      blendMode: "NORMAL",
    });
    emitter.setDepth(DEPTH + 1);
    emitter.explode(3);
    scene.time.delayedCall(500, () => {
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
      sofaCount: this.sofas.length,
      sofaTiles: this.tiles.length,
      distTiles: DIST_TILES,
      cooldownMs: this.cooldownMs(),
      squashCount: this.squashCount,
      lastAt: this.lastAt,
      lastKey: this.lastKey,
      mode: sofaModeFromQuery(),
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      sofa: this.snapshot(),
    };
  }

  destroy() {
    for (const s of this.sofas) {
      try {
        this.scene.tweens.killTweensOf(s.sprite);
        s.sprite?.destroy();
      } catch {
        /* ignore */
      }
    }
    this.sofas = [];
    this.tiles = [];
    this.publish();
  }
}

export { SOFA_GID, MAX_SOFAS, DEPTH as SOFA_DEPTH };
