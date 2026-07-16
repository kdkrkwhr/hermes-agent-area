/** Soft leaf-tip sway on plant furniture (GID 10/27/35). `?plantsway=0` off. */

/** plant / bigPlant / flowerPot — see gen_assets legend */
const PLANT_GIDS = new Set([10, 27, 35]);
/** Cap anchors — map has ~33 plants; don't scan every frame. */
const MAX_PLANTS = 40;
/** Above furniture (0); below zone labels (5) / rain (4). */
const DEPTH = 3;
const LEAF = 0x4aad68;
const LEAF_HI = 0x6ecf88;

/**
 * Query: omit = on. `0`/`off`/`false` = never.
 * @returns {boolean}
 */
export function plantSwayEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("plantsway");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

function isNightTod(name) {
  return name === "night" || name === "evening";
}

/**
 * Scan furniture once for plant GIDs; return tile centers (≤ MAX_PLANTS).
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number, gid: number }[]}
 */
export function findPlantTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (!layer?.getTileAt || !scene.map) return hits;

  const tw = scene.map.tileWidth ?? 32;
  const th = scene.map.tileHeight ?? 32;

  for (let ty = 0; ty < scene.map.height; ty++) {
    for (let tx = 0; tx < scene.map.width; tx++) {
      const tile = layer.getTileAt(tx, ty);
      if (!tile || !PLANT_GIDS.has(tile.index)) continue;
      hits.push({
        tx,
        ty,
        gid: tile.index,
        x: tx * tw + tw / 2,
        y: ty * th + th / 2,
      });
      if (hits.length >= MAX_PLANTS) return hits;
    }
  }
  return hits;
}

/**
 * Soft Graphics leaf tips that drift 1–2px with staggered sin phases.
 * Always on when enabled; evening/night only softens alpha.
 */
export class PlantSway {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.enabled = plantSwayEnabledFromQuery();
    this.tiles = this.enabled ? findPlantTiles(scene) : [];
    this.anchors = this.tiles.map((t, i) => ({
      ...t,
      /** Stagger so tips don't lockstep. */
      phase: (i * 1.37) % (Math.PI * 2),
      /** Period ms — 2.5–4s soft breeze. */
      period: 2500 + (i % 6) * 250,
      /** Amplitude px — 1–2. */
      amp: 1 + (i % 3) * 0.35,
      /** Tip sits near foliage top of the 32px plant tile. */
      oy: -10 - (i % 3),
    }));
    this.active = false;
    this.dim = false;
    this.gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  shouldBeActive() {
    return this.enabled && this.anchors.length > 0;
  }

  /** Call from applyTimeOfDayLighting — night/evening dims tip alpha. */
  sync() {
    if (!this.shouldBeActive()) {
      this.active = false;
      this.dim = false;
      this.gfx.clear();
      this.gfx.setVisible(false);
      this.publish();
      return;
    }
    const name = this.scene.lightingPreset?.name ?? "day";
    this.dim = isNightTod(name);
    this.active = true;
    this.gfx.setVisible(true);
    this.publish();
  }

  /**
   * Per-plant horizontal sin drift. Clear+redraw in one Graphics.
   * @param {number} [time] scene.time.now
   */
  update(time = this.scene.time.now) {
    if (!this.active) return;

    const baseA = this.dim ? 0.22 : 0.42;
    const g = this.gfx;
    g.clear();

    for (const a of this.anchors) {
      const wave = Math.sin((time / a.period) * Math.PI * 2 + a.phase);
      const dx = wave * a.amp;
      const x = a.x + dx;
      const y = a.y + a.oy;

      g.fillStyle(LEAF, baseA * 0.55);
      g.fillEllipse(x, y, 7, 4.5);
      g.fillStyle(LEAF_HI, Math.min(0.85, baseA * 1.1));
      g.fillEllipse(x + dx * 0.2, y - 1, 3.5, 2.2);
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      active: this.active,
      dim: this.dim,
      plantCount: this.anchors.length,
      plantTiles: this.tiles.length,
      lighting: this.scene.lightingPreset?.name ?? null,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      plantSway: this.snapshot(),
    };
  }

  destroy() {
    if (this.gfx) {
      try {
        this.gfx.destroy();
      } catch {
        /* ignore */
      }
      this.gfx = null;
    }
    this.active = false;
    this.anchors = [];
    this.tiles = [];
    this.publish();
  }
}

export { PLANT_GIDS, MAX_PLANTS, DEPTH as PLANT_SWAY_DEPTH };
