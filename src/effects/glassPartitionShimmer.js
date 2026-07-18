/** War Room glass partition (GID 17) soft ADD edge shimmer on near pass.
 *  Floor/furniture scan, ≤~24 tiles (sampling OK). Overlay only — map untouched.
 *  Agent / boss / visitor ≤1.5 tiles → one shimmer cycle + cooldown (no SFX).
 *  `?glassfx=0|off|false` off · `?glassfx=force` smoke (short CD, auto-pulse).
 */

const GLASS_GID = 17;
const MAX_TILES = 24;
/** Above furniture(0) / doorswing(1.6); below rain(4) / agents(10). */
const DEPTH = 2.2;
/** Tile distance — approach trigger. */
const DIST_TILES = 1.5;
const COOLDOWN_MS = 3200;
const FORCE_COOLDOWN_MS = 700;
const SHIMMER_MS = 480;
const EDGE = 0xb8e8f0;
const EDGE_HOT = 0xe8ffff;

/**
 * Query: omit = on. `0`/`off`/`false` = never. `force` = short auto-pulse.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function glassFxModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("glassfx");
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

export function glassFxEnabledFromQuery() {
  return glassFxModeFromQuery().enabled;
}

/**
 * Scan ground + furniture for glass-partition GID 17 (cap MAX_TILES, stride sample).
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number, gid: number }[]}
 */
export function findGlassPartitionTiles(scene) {
  const hits = [];
  const layers = [scene.ground, scene.furniture].filter(Boolean);
  if (!layers.length || !scene.map) return hits;

  const tw = scene.map.tileWidth ?? 32;
  const th = scene.map.tileHeight ?? 32;
  const seen = new Set();
  const all = [];

  for (const layer of layers) {
    if (!layer?.getTileAt) continue;
    for (let ty = 0; ty < scene.map.height; ty++) {
      for (let tx = 0; tx < scene.map.width; tx++) {
        const tile = layer.getTileAt(tx, ty);
        if (!tile || tile.index !== GLASS_GID) continue;
        const key = `${tx},${ty}`;
        if (seen.has(key)) continue;
        seen.add(key);
        all.push({
          tx,
          ty,
          gid: tile.index,
          x: tx * tw + tw / 2,
          y: ty * th + th / 2,
        });
      }
    }
  }

  if (all.length <= MAX_TILES) return all;

  // Even sample across the wall run so corners + mid-edges stay represented.
  const step = all.length / MAX_TILES;
  for (let i = 0; i < MAX_TILES; i++) {
    hits.push(all[Math.min(all.length - 1, Math.floor(i * step))]);
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

function tileDist(ent, glass, tw) {
  const ta = entityTile(ent, tw);
  if (!ta) return Infinity;
  return Math.hypot(ta.x - glass.tx, ta.y - glass.ty);
}

function isLiveEntity(ent) {
  if (!ent?.sprite?.active || !ent.sprite.visible) return false;
  if (ent.alive === false) return false;
  return true;
}

/** Boss / any agent / visitor near the partition. */
function collectPassers(scene) {
  const out = [];
  for (const a of scene.agents || []) {
    if (isLiveEntity(a)) out.push(a);
  }
  if (isLiveEntity(scene.boss)) out.push(scene.boss);
  const visitor = scene.visitorDirector?.visitor;
  if (visitor && isLiveEntity(visitor)) out.push(visitor);
  return out;
}

/**
 * Soft ADD vertical edge wash along the glass tile.
 * @param {Phaser.Scene} scene
 * @param {{ x: number, y: number }} tile
 * @param {number} peak
 * @returns {Phaser.GameObjects.Graphics}
 */
function makeShimmerGfx(scene, tile, peak) {
  const tw = scene.map?.tileWidth ?? 32;
  const th = scene.map?.tileHeight ?? 32;
  const gfx = scene.add.graphics().setDepth(DEPTH);
  gfx.setBlendMode("ADD");
  // outer cool wash
  gfx.fillStyle(EDGE, peak * 0.28);
  gfx.fillEllipse(tile.x, tile.y, tw * 0.55, th * 0.95);
  // bright edge core (vertical seam)
  gfx.fillStyle(EDGE_HOT, peak * 0.55);
  gfx.fillRect(tile.x - 2, tile.y - th * 0.42, 4, th * 0.84);
  gfx.fillStyle(0xffffff, peak * 0.4);
  gfx.fillRect(tile.x - 1, tile.y - th * 0.3, 2, th * 0.6);
  return gfx;
}

/**
 * Ambient glass-partition shimmer — tick from OfficeScene.updateVisualEffects.
 */
export class GlassPartitionShimmer {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = glassFxModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.tiles = this.enabled ? findGlassPartitionTiles(scene) : [];
    /** @type {{ key: string, tx: number, ty: number, x: number, y: number, readyAt: number, shimmerCount: number, tweening: boolean }[]} */
    this.panes = [];
    this.shimmerCount = 0;
    this.lastAt = null;
    this.lastKey = null;
    this.active = false;

    if (this.enabled) {
      for (const t of this.tiles) {
        this.panes.push({
          key: `${t.tx},${t.ty}`,
          tx: t.tx,
          ty: t.ty,
          x: t.x,
          y: t.y,
          readyAt: 0,
          shimmerCount: 0,
          tweening: false,
        });
      }
    }

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  shouldBeActive() {
    return this.enabled && this.panes.length > 0;
  }

  cooldown() {
    return this.forced ? FORCE_COOLDOWN_MS : COOLDOWN_MS;
  }

  sync() {
    this.active = this.shouldBeActive();
    this.publish();
  }

  /**
   * @param {{ key: string, x: number, y: number, readyAt: number, shimmerCount: number, tweening: boolean }} pane
   * @param {number} now
   */
  _shimmer(pane, now) {
    if (pane.tweening) return;
    const scene = this.scene;
    pane.tweening = true;
    pane.readyAt = now + this.cooldown();
    pane.shimmerCount += 1;
    this.shimmerCount += 1;
    this.lastAt = now;
    this.lastKey = pane.key;

    const peak = this.forced ? 0.55 : 0.38;
    const gfx = makeShimmerGfx(scene, pane, peak);
    gfx.setAlpha(0);
    const proxy = { a: 0 };

    scene.tweens.add({
      targets: proxy,
      a: 1,
      duration: SHIMMER_MS * 0.35,
      yoyo: true,
      hold: SHIMMER_MS * 0.15,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        try {
          if (gfx.active) gfx.setAlpha(proxy.a);
        } catch {
          /* ignore */
        }
      },
      onComplete: () => {
        pane.tweening = false;
        try {
          gfx.destroy();
        } catch {
          /* ignore */
        }
        this.publish();
      },
    });

    this.publish();
  }

  update(_time, _delta) {
    if (!this.active) return;
    const now = this.scene.time.now;
    const tw = this.scene.map?.tileWidth ?? 32;

    if (this.forced) {
      for (const pane of this.panes) {
        if (pane.tweening || now < pane.readyAt) continue;
        this._shimmer(pane, now);
        // one pane per tick — avoid full-wall flash
        break;
      }
      return;
    }

    const passers = collectPassers(this.scene);
    for (const pane of this.panes) {
      if (pane.tweening || now < pane.readyAt) continue;
      let near = false;
      for (const ent of passers) {
        if (tileDist(ent, pane, tw) <= DIST_TILES) {
          near = true;
          break;
        }
      }
      if (near) this._shimmer(pane, now);
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      active: this.active,
      paneCount: this.panes.length,
      glassTiles: this.tiles.length,
      distTiles: DIST_TILES,
      depth: DEPTH,
      shimmerCount: this.shimmerCount,
      lastAt: this.lastAt,
      lastKey: this.lastKey,
      glassGid: GLASS_GID,
      mode: glassFxModeFromQuery(),
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      glassfx: this.snapshot(),
    };
  }

  destroy() {
    this.panes = [];
    this.tiles = [];
    this.active = false;
    this.publish();
  }
}

export {
  GLASS_GID,
  MAX_TILES,
  DEPTH as GLASS_FX_DEPTH,
  DIST_TILES as GLASS_FX_DIST,
};
