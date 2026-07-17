/** CEO office city window (furniture GID 33) TOD twinkle.
 *  Evening/night: warm/gold ADD city lights (tone distinct from north GID12 cityLights).
 *  Morning/day: faint cool sky pulse.
 *  `?ceowindow=0` off · `?ceowindow=force` smoke (night peak, TOD ignore).
 */

const CEO_WINDOW_GID = 33;
/** Cap — map has exactly 7 CEO north panes. */
const MAX_LIGHTS = 7;
/**
 * Same band as cityLights (5) — above rain (4), below lighting (6).
 * Positions don't overlap GID12 north facade (ty=0 vs ty=2).
 */
const DEPTH = 5;
/** Warmer / gold mix vs GID12 cool+warm — CEO reads more amber. */
const NIGHT_COLORS = [0xffd78a, 0xffc050, 0xffe8b0, 0xffb060];
/** Soft cool sky for morning/day pulse. */
const DAY_COLORS = [0xc8dcff, 0xb0ccf5, 0xd8e8ff];

/**
 * Query: omit = on (TOD-gated).
 * `0`/`off`/`false` = never.
 * `force`/`1`/`on`/`true` = night-peak always.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function ceoWindowModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("ceowindow");
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

/**
 * Scan furniture for GID33; return tile centers (≤ MAX_LIGHTS).
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number }[]}
 */
export function findCeoWindowTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (!layer?.getTileAt || !scene.map) return hits;

  const tw = scene.map.tileWidth ?? 32;
  const th = scene.map.tileHeight ?? 32;

  for (let ty = 0; ty < scene.map.height; ty++) {
    for (let tx = 0; tx < scene.map.width; tx++) {
      const tile = layer.getTileAt(tx, ty);
      if (!tile || tile.index !== CEO_WINDOW_GID) continue;
      hits.push({
        tx,
        ty,
        x: tx * tw + tw / 2,
        y: ty * th + th / 2,
      });
      if (hits.length >= MAX_LIGHTS) return hits;
    }
  }
  return hits;
}

/**
 * Soft ADD twinkle on CEO city panes. Sync via applyTimeOfDayLighting.
 */
export class CeoCityWindow {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    const mode = ceoWindowModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.tiles = this.enabled ? findCeoWindowTiles(scene) : [];
    this.anchors = this.tiles.map((t, i) => ({
      ...t,
      phase: (i * 1.9) % (Math.PI * 2),
      period: 2400 + (i % 5) * 380,
      nightColor: NIGHT_COLORS[i % NIGHT_COLORS.length],
      dayColor: DAY_COLORS[i % DAY_COLORS.length],
      ox: ((i % 3) - 1) * 3,
      oy: -4 - (i % 3),
    }));
    this.active = false;
    /** @type {'night'|'day'|null} */
    this.mode = null;
    this.gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);
    this.gfx.setBlendMode("ADD");

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  shouldBeActive() {
    return this.enabled && this.anchors.length > 0;
  }

  /** evening/night (or force) → warm twinkle; morning/day → faint sky pulse. */
  resolveMode() {
    if (this.forced) return "night";
    const name = this.scene.lightingPreset?.name;
    if (name === "evening" || name === "night") return "night";
    return "day";
  }

  /** Call from applyTimeOfDayLighting. */
  sync() {
    const want = this.shouldBeActive();
    if (!want) {
      this.active = false;
      this.mode = null;
      this.gfx.clear();
      this.gfx.setVisible(false);
      this.publish();
      return;
    }
    this.mode = this.resolveMode();
    this.active = true;
    this.gfx.setVisible(true);
    this.publish();
  }

  /**
   * Soft per-pane alpha pulse. Clear+redraw in one Graphics.
   * @param {number} [time] scene.time.now
   */
  update(time = this.scene.time.now) {
    if (!this.active) return;

    const night = this.mode === "night";
    const g = this.gfx;
    g.clear();

    for (const a of this.anchors) {
      const wave = (Math.sin((time / a.period) * Math.PI * 2 + a.phase) + 1) / 2;
      // night: mostly dim, gentle peak; day: much quieter sky wash
      const alpha = night ? 0.16 + wave * 0.42 : 0.05 + wave * 0.12;
      const color = night ? a.nightColor : a.dayColor;
      const x = a.x + a.ox;
      const y = a.y + a.oy;
      const r0 = night ? 6 : 7;
      const r1 = night ? 3.2 : 4;
      const r2 = night ? 1.5 : 1.8;

      g.fillStyle(color, alpha * 0.32);
      g.fillCircle(x, y, r0);
      g.fillStyle(color, alpha * 0.68);
      g.fillCircle(x, y, r1);
      g.fillStyle(color, Math.min(0.95, alpha * 1.05));
      g.fillCircle(x, y, r2);
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      active: this.active,
      mode: this.mode,
      lightCount: this.anchors.length,
      windowTiles: this.tiles.length,
      tiles: this.anchors.map((a) => ({ tx: a.tx, ty: a.ty })),
      lighting: this.scene.lightingPreset?.name ?? null,
      depth: DEPTH,
      ceoWindowGid: CEO_WINDOW_GID,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      ceoWindow: this.snapshot(),
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
    this.publish();
  }
}

export { CEO_WINDOW_GID, MAX_LIGHTS, DEPTH as CEO_WINDOW_DEPTH };
