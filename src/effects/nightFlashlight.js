/** Evening/night security flashlight cone patrol along walkable corridors.
 * `?flashlight=0` off. `?flashlight=1` force (TOD ignore). `?flashlight=fast` force + short loop.
 */

/** Near lighting overlay (6); below agents (10). Above overlay so ADD reads through dim. */
const DEPTH = 6.5;
/** Cool security beam (ADD). */
const BEAM_COLOR = 0xd8ecff;
const CORE_COLOR = 0xfff8e0;
/** Cone length / half-angle (rad). */
const CONE_LEN = 96;
const CONE_HALF = 0.42;
/** Default full-loop period (ms). Fast query shortens. */
const PERIOD_MS = 52000;
const PERIOD_FAST_MS = 14000;

/**
 * Query: omit = on (evening/night-gated).
 * `0`/`off`/`false` = never.
 * `1`/`on`/`true`/`force` = always (TOD ignore).
 * `fast` = always + short patrol period.
 * @returns {{ enabled: boolean, forced: boolean, fast: boolean }}
 */
export function flashlightModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false, fast: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("flashlight");
    if (v == null || v === "") return { enabled: true, forced: false, fast: false };
    if (v === "0" || v === "false" || v === "off") {
      return { enabled: false, forced: false, fast: false };
    }
    if (v === "fast") return { enabled: true, forced: true, fast: true };
    if (v === "1" || v === "true" || v === "on" || v === "force") {
      return { enabled: true, forced: true, fast: false };
    }
    return { enabled: true, forced: false, fast: false };
  } catch {
    return { enabled: true, forced: false, fast: false };
  }
}

/** Patrol anchors: lobby → west corridor → Open Desk south hall → mid hall → lobby. */
const PATROL_ANCHORS = [
  { x: 20, y: 27 },
  { x: 12, y: 26 },
  { x: 12, y: 20 },
  { x: 5, y: 13 },
  { x: 14, y: 13 },
  { x: 18, y: 12 },
  { x: 20, y: 20 },
  { x: 20, y: 27 },
];

/**
 * Walkability from collision layer (0 = walkable).
 * @param {Phaser.Tilemaps.TilemapLayer} layer
 */
function walkGrid(layer) {
  const w = layer.width;
  const h = layer.height;
  const grid = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      const tile = layer.getTileAt(x, y);
      row.push(!(tile && tile.index > 0));
    }
    grid.push(row);
  }
  return grid;
}

/**
 * BFS tile path (4-neighbor). Empty if blocked.
 * @param {boolean[][]} grid
 * @param {{ x: number, y: number }} from
 * @param {{ x: number, y: number }} to
 */
function bfsPath(grid, from, to) {
  const h = grid.length;
  const w = grid[0]?.length || 0;
  if (!w || !h) return [];
  const ok = (x, y) => x >= 0 && y >= 0 && x < w && y < h && grid[y][x];
  if (!ok(from.x, from.y) || !ok(to.x, to.y)) return [];
  const key = (x, y) => `${x},${y}`;
  const q = [{ x: from.x, y: from.y }];
  const prev = new Map([[key(from.x, from.y), null]]);
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  while (q.length) {
    const cur = q.shift();
    if (cur.x === to.x && cur.y === to.y) {
      const out = [];
      let k = key(cur.x, cur.y);
      while (k) {
        const [x, y] = k.split(",").map(Number);
        out.push({ x, y });
        k = prev.get(k);
      }
      return out.reverse();
    }
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const nk = key(nx, ny);
      if (prev.has(nk) || !ok(nx, ny)) continue;
      prev.set(nk, key(cur.x, cur.y));
      q.push({ x: nx, y: ny });
    }
  }
  return [];
}

/**
 * Stitch BFS segments through anchors into pixel centers + cumulative distance.
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, dist: number }[]}
 */
function buildPatrolPixels(scene) {
  const layer = scene.collision;
  if (!layer) return [];
  const grid = walkGrid(layer);
  const tw = scene.map.tileWidth;
  const th = scene.map.tileHeight;
  const tiles = [];
  for (let i = 0; i < PATROL_ANCHORS.length - 1; i++) {
    const seg = bfsPath(grid, PATROL_ANCHORS[i], PATROL_ANCHORS[i + 1]);
    if (!seg.length) continue;
    const start = i === 0 ? 0 : 1; // skip duplicate join tiles
    for (let j = start; j < seg.length; j++) tiles.push(seg[j]);
  }
  if (tiles.length < 2) return [];

  const pts = [];
  let dist = 0;
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const x = t.x * tw + tw / 2;
    const y = t.y * th + th / 2;
    if (i > 0) {
      const p = pts[i - 1];
      dist += Math.hypot(x - p.x, y - p.y);
    }
    pts.push({ x, y, dist });
  }
  return pts;
}

/**
 * Sample position + facing along closed polyline by distance along path.
 * @param {{ x: number, y: number, dist: number }[]} pts
 * @param {number} d
 */
function samplePath(pts, d) {
  const total = pts[pts.length - 1].dist;
  if (total <= 0) {
    return { x: pts[0].x, y: pts[0].y, angle: 0 };
  }
  let t = d % total;
  if (t < 0) t += total;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].dist >= t) {
      const a = pts[i - 1];
      const b = pts[i];
      const span = b.dist - a.dist || 1;
      const u = (t - a.dist) / span;
      const x = a.x + (b.x - a.x) * u;
      const y = a.y + (b.y - a.y) * u;
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      return { x, y, angle };
    }
  }
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  return {
    x: last.x,
    y: last.y,
    angle: Math.atan2(last.y - prev.y, last.x - prev.x),
  };
}

/**
 * Soft ADD flashlight cone that patrols lobby ↔ corridor ↔ Open Desk south hall.
 * Pure visual — no physics, no toast, no agent path interference.
 */
export class NightFlashlight {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    const mode = flashlightModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.fast = mode.fast;
    this.periodMs = mode.fast ? PERIOD_FAST_MS : PERIOD_MS;
    this.path = this.enabled ? buildPatrolPixels(scene) : [];
    this.pathLen = this.path.length ? this.path[this.path.length - 1].dist : 0;
    this.active = false;
    this.x = this.path[0]?.x ?? 0;
    this.y = this.path[0]?.y ?? 0;
    this.angle = 0;
    this.gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);
    this.gfx.setBlendMode("ADD");
    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  shouldBeActive() {
    if (!this.enabled || this.pathLen < 8) return false;
    if (this.forced) return true;
    const name = this.scene.lightingPreset?.name;
    return name === "evening" || name === "night";
  }

  /** Call from applyTimeOfDayLighting — hide on morning/day (unless forced). */
  sync() {
    const want = this.shouldBeActive();
    if (!want) {
      this.active = false;
      this.gfx.clear();
      this.gfx.setVisible(false);
      this.publish();
      return;
    }
    this.active = true;
    this.gfx.setVisible(true);
    this.publish();
  }

  /**
   * Advance along patrol + redraw cone.
   * @param {number} [time] scene.time.now
   */
  update(time = this.scene.time.now) {
    if (!this.active || this.pathLen < 8) return;

    const dist = ((time % this.periodMs) / this.periodMs) * this.pathLen;
    const s = samplePath(this.path, dist);
    this.x = s.x;
    this.y = s.y;
    this.angle = s.angle;
    this._draw();
  }

  _draw() {
    const g = this.gfx;
    g.clear();

    const ang = this.angle;
    const tipX = this.x + Math.cos(ang) * CONE_LEN;
    const tipY = this.y + Math.sin(ang) * CONE_LEN;
    const left = ang - CONE_HALF;
    const right = ang + CONE_HALF;
    const lX = this.x + Math.cos(left) * CONE_LEN;
    const lY = this.y + Math.sin(left) * CONE_LEN;
    const rX = this.x + Math.cos(right) * CONE_LEN;
    const rY = this.y + Math.sin(right) * CONE_LEN;

    // soft stacked cone — outer wash → mid → hot core
    const layers = [
      { scale: 1.25, alpha: 0.06, color: BEAM_COLOR },
      { scale: 1.0, alpha: 0.12, color: BEAM_COLOR },
      { scale: 0.62, alpha: 0.2, color: BEAM_COLOR },
      { scale: 0.28, alpha: 0.28, color: CORE_COLOR },
    ];
    for (const layer of layers) {
      const s = layer.scale;
      const midX = this.x + (tipX - this.x) * s;
      const midY = this.y + (tipY - this.y) * s;
      const aX = this.x + (lX - this.x) * s;
      const aY = this.y + (lY - this.y) * s;
      const bX = this.x + (rX - this.x) * s;
      const bY = this.y + (rY - this.y) * s;
      g.fillStyle(layer.color, layer.alpha);
      g.fillTriangle(this.x, this.y, aX, aY, midX, midY);
      g.fillTriangle(this.x, this.y, midX, midY, bX, bY);
    }

    // tiny body glow at apex
    g.fillStyle(CORE_COLOR, 0.45);
    g.fillCircle(this.x, this.y, 3.5);
    g.fillStyle(0xffffff, 0.7);
    g.fillCircle(this.x, this.y, 1.4);
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      fast: this.fast,
      active: this.active,
      pathTiles: this.path.length,
      pathLen: Math.round(this.pathLen),
      periodMs: this.periodMs,
      x: Math.round(this.x),
      y: Math.round(this.y),
      lighting: this.scene.lightingPreset?.name ?? null,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      flashlight: this.snapshot(),
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
    this.path = [];
    this.publish();
  }
}
