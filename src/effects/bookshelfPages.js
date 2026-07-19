/** CEO office bookshelf (GID34) ambient page-turn particles. `?bookshelf=0` off · `?bookshelf=force` smoke. */

import { registerDustTexture } from "./dustMotes.js";

const BOOKSHELF_GID = 34;
const MAX_SHELVES = 16;
/** Above furniture; below status burst (11). */
const DEPTH = 9;
const MIN_INTERVAL_MS = 8000;
const MAX_INTERVAL_MS = 15000;
const FORCE_INTERVAL_MS = 1200;
/** Ambient bursts only when boss is within this many tiles. */
const NEAR_TILES = 3;
const PAGE_TINTS = [0xfff8e8, 0xf5ecd8, 0xe8dcc8, 0xffffff, 0xffe8c0];

/**
 * Query: omit = on. `0`/`off`/`false` = never. `force` = short interval, no proximity gate.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function bookshelfModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("bookshelf");
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

export function bookshelfEnabledFromQuery() {
  return bookshelfModeFromQuery().enabled;
}

/**
 * Scan furniture for bookshelf GID 34.
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number, gid: number }[]}
 */
export function findBookshelfTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (!layer?.getTileAt || !scene.map) return hits;

  const tw = scene.map.tileWidth ?? 32;
  const th = scene.map.tileHeight ?? 32;

  for (let ty = 0; ty < scene.map.height; ty++) {
    for (let tx = 0; tx < scene.map.width; tx++) {
      const tile = layer.getTileAt(tx, ty);
      if (!tile || tile.index !== BOOKSHELF_GID) continue;
      hits.push({
        tx,
        ty,
        gid: tile.index,
        x: tx * tw + tw / 2,
        y: ty * th + th / 2,
      });
      if (hits.length >= MAX_SHELVES) return hits;
    }
  }
  return hits;
}

function registerPageTexture(scene) {
  if (scene.textures.exists("fx-page")) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xffffff, 1);
  g.fillRect(1, 0, 4, 5);
  g.fillStyle(0xeeeeee, 0.55);
  g.fillRect(1, 0, 4, 1);
  g.generateTexture("fx-page", 6, 6);
  g.destroy();
}

function bossNearBookshelf(scene, tiles, reachTiles = NEAR_TILES) {
  const b = scene.boss?.sprite;
  if (!b || !tiles?.length) return false;
  const reach = (scene.map?.tileWidth ?? 32) * reachTiles;
  for (const t of tiles) {
    if (Math.hypot(b.x - t.x, b.y - t.y) <= reach) return true;
  }
  return false;
}

function pickInterval(forced) {
  if (forced) return FORCE_INTERVAL_MS;
  return (
    MIN_INTERVAL_MS +
    Math.floor(Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS + 1))
  );
}

/**
 * Ambient page flutter on CEO bookshelf tiles — tick from OfficeScene.updateVisualEffects.
 */
export class BookshelfPages {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = bookshelfModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.tiles = this.enabled ? findBookshelfTiles(scene) : [];
    this.nextAt = 0;
    this.pageCount = 0;
    this.lastAt = null;
    this.lastTile = null;
    this.active = false;
    this._lastKey = "";

    if (this.enabled && this.tiles.length) {
      registerPageTexture(scene);
      registerDustTexture(scene);
      this.nextAt = scene.time.now + pickInterval(this.forced);
    }

    scene.events.once("shutdown", () => this.destroy());
    this.publish();
  }

  shouldRun() {
    return this.enabled && this.tiles.length > 0;
  }

  nearEnough() {
    if (this.forced) return true;
    return bossNearBookshelf(this.scene, this.tiles);
  }

  /**
   * @param {number} now
   * @param {number} [_delta]
   */
  update(now, _delta = 16) {
    if (!this.shouldRun()) {
      this.active = false;
      this.publish();
      return;
    }

    this.active = this.nearEnough();
    if (!this.active) {
      this.publish();
      return;
    }

    if (now < this.nextAt) {
      this.publish();
      return;
    }

    const tile = this.tiles[Math.floor(Math.random() * this.tiles.length)];
    this.burstAt(tile.x, tile.y - 4, now);
    this.nextAt = now + pickInterval(this.forced);
    this.publish();
  }

  /** Manual page flip (E-key interact). */
  triggerPageTurn() {
    if (!this.shouldRun()) return false;
    const tile = this.tiles[Math.floor(Math.random() * this.tiles.length)];
    this.burstAt(tile.x, tile.y - 4, this.scene.time.now, { strong: true });
    this.nextAt = this.scene.time.now + pickInterval(this.forced);
    this.publish();
    return true;
  }

  /**
   * Soft page-flutter boost for docs_day (and similar). Immediate strong burst
   * plus 2–3 follow-ups over `ms`. No-op if shelves disabled/empty.
   * @param {number} [ms=3500]
   * @returns {boolean}
   */
  boost(ms = 3500) {
    if (!this.shouldRun() || !this.tiles.length) return false;
    const scene = this.scene;
    const now = scene.time.now;
    const life = Math.max(800, ms | 0);
    const fire = () => {
      if (!this.shouldRun() || !this.tiles.length) return;
      const tile = this.tiles[Math.floor(Math.random() * this.tiles.length)];
      this.burstAt(tile.x, tile.y - 4, scene.time.now, { strong: true });
    };
    fire();
    const follow = 2 + Math.floor(Math.random() * 2);
    for (let i = 1; i <= follow; i++) {
      const delay = Math.floor((life / (follow + 1)) * i);
      scene.time.delayedCall(delay, fire);
    }
    this.nextAt = now + life + pickInterval(this.forced);
    this.publish();
    return true;
  }

  burstAt(x, y, now, { strong = false } = {}) {
    const scene = this.scene;
    if (!scene.textures.exists("fx-page")) registerPageTexture(scene);

    const qty = strong ? 7 + Math.floor(Math.random() * 4) : 4 + Math.floor(Math.random() * 3);
    const emitter = scene.add.particles(x, y, "fx-page", {
      speed: { min: strong ? 18 : 10, max: strong ? 52 : 34 },
      angle: { min: 240, max: 300 },
      gravityY: strong ? -8 : -4,
      scale: { start: strong ? 0.9 : 0.65, end: 0.12 },
      alpha: { start: 0.85, end: 0 },
      lifespan: { min: 380, max: strong ? 900 : 700 },
      quantity: qty,
      frequency: -1,
      tint: PAGE_TINTS,
      rotate: { min: -50, max: 50 },
      blendMode: "NORMAL",
    });
    emitter.setDepth(DEPTH);
    emitter.explode(qty);

    if (scene.textures.exists("fx-dust")) {
      const dust = scene.add.particles(x, y + 2, "fx-dust", {
        speed: { min: 6, max: 22 },
        angle: { min: 250, max: 290 },
        gravityY: 6,
        scale: { start: 0.3, end: 0.05 },
        alpha: { start: 0.28, end: 0 },
        lifespan: { min: 300, max: 600 },
        quantity: strong ? 5 : 3,
        frequency: -1,
        tint: [0xd8c4a8, 0xc8b090],
        blendMode: "NORMAL",
      });
      dust.setDepth(DEPTH);
      dust.explode(strong ? 5 : 3);
      scene.time.delayedCall(700, () => {
        try {
          dust.destroy();
        } catch {
          /* ignore */
        }
      });
    }

    scene.time.delayedCall(1000, () => {
      try {
        emitter.destroy();
      } catch {
        /* ignore */
      }
    });

    this.pageCount += 1;
    this.lastAt = now;
    this.lastTile = { x, y };
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      active: this.shouldRun() && this.active,
      shelfCount: this.tiles.length,
      nearTiles: NEAR_TILES,
      pageCount: this.pageCount,
      lastAt: this.lastAt,
      lastTile: this.lastTile,
      bookshelfGid: BOOKSHELF_GID,
      mode: bookshelfModeFromQuery(),
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
      bookshelf: snap,
    };
  }

  destroy() {
    this.tiles = [];
    this.active = false;
    this.publish();
  }
}

export { BOOKSHELF_GID, MAX_SHELVES, DEPTH as BOOKSHELF_DEPTH };
