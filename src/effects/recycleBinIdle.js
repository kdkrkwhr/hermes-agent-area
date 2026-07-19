/** Lounge recycle bin idle: soft paper rustle / bob (GID45).
 *  `?recycle=0|off|false` off · `?recycle=force` smoke (faster/brighter).
 */

const RECYCLE_BIN_GID = 45;
const MAX_BINS = 4;
/** Above furniture; below status burst (11). */
const DEPTH = 10;
const PERIOD_MS = 3200;
const FORCE_PERIOD_MS = 1600;
/** Soft paper cream / bin blue-yellow glints. */
const PAPER = 0xf5f0e6;
const PAPER2 = 0xffffff;
const BIN_BLUE = 0x4a96dc;
const BIN_YELLOW = 0xe6be3c;

/**
 * Query: omit = on. `0`/`off`/`false` = never. `force`/`1`/`on`/`true` = smoke.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function recycleBinIdleModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("recycle");
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

export function recycleBinIdleEnabledFromQuery() {
  return recycleBinIdleModeFromQuery().enabled;
}

/**
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number, phase: number }[]}
 */
export function findRecycleBinTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (!layer?.getTileAt || !scene.map) return hits;

  const tw = scene.map.tileWidth ?? 32;
  const th = scene.map.tileHeight ?? 32;

  for (let ty = 0; ty < scene.map.height; ty++) {
    for (let tx = 0; tx < scene.map.width; tx++) {
      const tile = layer.getTileAt(tx, ty);
      if (!tile || tile.index !== RECYCLE_BIN_GID) continue;
      hits.push({
        tx,
        ty,
        x: tx * tw + tw / 2,
        y: ty * th + th / 2,
        phase: (hits.length * 0.41) % 1,
      });
      if (hits.length >= MAX_BINS) return hits;
    }
  }
  return hits;
}

/**
 * Soft paper bob / rustle on lounge recycle bins.
 */
export class RecycleBinIdle {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = recycleBinIdleModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.bins = this.enabled ? findRecycleBinTiles(scene) : [];
    this.active = false;
    this.interacting = false;
    this.periodMs = this.forced ? FORCE_PERIOD_MS : PERIOD_MS;
    this._lastKey = "";

    this.gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);
    this.gfx.setBlendMode("ADD");

    scene.events.once("shutdown", () => this.destroy());
    this.update(scene.time?.now ?? 0);
  }

  isInteracting() {
    return !!this.scene.roomInteract?.recycleActive?.();
  }

  /**
   * @param {number} [time]
   */
  update(time = this.scene.time.now) {
    if (!this.enabled || !this.bins.length) {
      this.active = false;
      this.interacting = false;
      this.gfx.clear();
      this.gfx.setVisible(false);
      this.publish();
      return;
    }

    this.interacting = this.isInteracting();
    this.active = true;
    this.gfx.setVisible(true);
    this._draw(time);
    this.publish();
  }

  /**
   * @param {number} time
   */
  _draw(time) {
    const g = this.gfx;
    g.clear();

    const boost = this.interacting ? 1.75 : this.forced ? 1.35 : 1;
    const period = this.periodMs;

    for (const a of this.bins) {
      const t = time / period + a.phase;
      const wave = (Math.sin(t * Math.PI * 2) + 1) / 2;
      const bob = Math.sin(t * Math.PI * 2) * (this.forced ? 1.6 : 1.0);
      const base = (0.1 + wave * 0.22) * boost;

      // soft dual-bin glints
      g.fillStyle(BIN_BLUE, base * 0.28);
      g.fillEllipse(a.x - 4, a.y + 1, 10, 12);
      g.fillStyle(BIN_YELLOW, base * 0.28);
      g.fillEllipse(a.x + 4, a.y + 1, 10, 12);

      // paper peek bobbing in the blue slot
      const px = a.x - 3 + Math.sin(t * Math.PI * 2 + 0.4) * 0.6;
      const py = a.y - 4 + bob;
      g.fillStyle(PAPER, Math.min(0.85, base * 0.9));
      g.fillRect(px - 2, py - 3, 4, 5);
      g.fillStyle(PAPER2, Math.min(0.55, base * 0.45));
      g.fillRect(px - 1, py - 2, 2, 1);

      // occasional rustle flake when forced / interacting
      if (!this.forced && !this.interacting && wave < 0.55) continue;
      const flakePhase = (t * 1.8 + a.phase) % 1;
      if (flakePhase < 0.35 && !this.forced && !this.interacting) continue;
      const fall = flakePhase;
      const fx = a.x + 2 + Math.sin(fall * 6) * 3;
      const fy = a.y - 2 + fall * 10;
      const alpha = (1 - fall) * (0.35 + base * 0.4);
      g.fillStyle(PAPER, alpha);
      g.fillRect(fx, fy, 2, 3);
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      active: this.active,
      interacting: this.interacting,
      binCount: this.bins.length,
      bins: this.bins.map((a) => ({ tx: a.tx, ty: a.ty })),
      periodMs: this.periodMs,
      recycleBinGid: RECYCLE_BIN_GID,
      depth: DEPTH,
      mode: recycleBinIdleModeFromQuery(),
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
      recycleBinIdle: snap,
    };
  }

  destroy() {
    try {
      this.gfx?.destroy();
    } catch {
      /* ignore */
    }
    this.gfx = null;
    this.bins = [];
    this.active = false;
    this.publish();
  }
}

export {
  RECYCLE_BIN_GID,
  DEPTH,
  PERIOD_MS,
  FORCE_PERIOD_MS,
};
