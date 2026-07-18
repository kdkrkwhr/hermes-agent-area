/** Focus server rack (GID42) LED soft blink / chase ambient.
 *  `?rack=0|off|false` off · `?rack=force` smoke (faster chase).
 *  Running agents → slightly faster period (optional load feel).
 *  Proximity: soft hint label only (no E-key).
 */

const SERVER_RACK_GID = 42;
const MAX_RACKS = 4;
/** Above furniture; below status burst (11). */
const DEPTH = 10;
const PERIOD_MS = 2600;
const FORCE_PERIOD_MS = 1100;
/** Min period when many agents running. */
const BUSY_PERIOD_MS = 1600;
const HINT_NEAR_TILES = 2.2;
const LED_COLORS = [0x50dc98, 0x66e8ff, 0xff6a4a, 0xffd060];
const GLOW = 0x44c8ee;

/**
 * Query: omit = on. `0`/`off`/`false` = never. `force`/`1`/`on`/`true` = smoke.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function serverRackModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("rack");
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

export function serverRackEnabledFromQuery() {
  return serverRackModeFromQuery().enabled;
}

/**
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number, phase: number }[]}
 */
export function findServerRackTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (!layer?.getTileAt || !scene.map) return hits;

  const tw = scene.map.tileWidth ?? 32;
  const th = scene.map.tileHeight ?? 32;

  for (let ty = 0; ty < scene.map.height; ty++) {
    for (let tx = 0; tx < scene.map.width; tx++) {
      const tile = layer.getTileAt(tx, ty);
      if (!tile || tile.index !== SERVER_RACK_GID) continue;
      hits.push({
        tx,
        ty,
        x: tx * tw + tw / 2,
        y: ty * th + th / 2,
        phase: (hits.length * 0.29) % 1,
      });
      if (hits.length >= MAX_RACKS) return hits;
    }
  }
  return hits;
}

function countRunningAgents(scene) {
  const agents = scene.agents;
  if (!Array.isArray(agents) || !agents.length) return 0;
  let n = 0;
  for (const a of agents) {
    try {
      if (a?.getEffectKind?.() === "running") n += 1;
    } catch {
      /* ignore */
    }
  }
  return n;
}

function bossNearRack(scene, racks, reachTiles = HINT_NEAR_TILES) {
  const boss = scene.boss?.sprite;
  if (!boss || !racks.length) return null;
  const tw = scene.map?.tileWidth ?? 32;
  const th = scene.map?.tileHeight ?? 32;
  const reach = Math.max(tw, th) * reachTiles;
  let best = null;
  let bestD = Infinity;
  for (const r of racks) {
    const dx = boss.x - r.x;
    const dy = boss.y - r.y;
    const d = Math.hypot(dx, dy);
    if (d < bestD && d <= reach) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

/**
 * Soft LED chase/blink on Focus server racks.
 */
export class ServerRackLeds {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = serverRackModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.racks = this.enabled ? findServerRackTiles(scene) : [];
    this.active = false;
    this.near = false;
    this.runningCount = 0;
    this.periodMs = this.forced ? FORCE_PERIOD_MS : PERIOD_MS;
    this._lastKey = "";

    this.gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);
    this.gfx.setBlendMode("ADD");

    this.hint = scene.add
      .text(0, 0, "서버랙", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "11px",
        color: "#a8e8ff",
        stroke: "#102028",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH + 0.2)
      .setVisible(false)
      .setAlpha(0.85);

    scene.events.once("shutdown", () => this.destroy());
    this.update(scene.time?.now ?? 0);
  }

  /**
   * @param {number} [time]
   */
  update(time = this.scene.time.now) {
    if (!this.enabled || !this.racks.length) {
      this.active = false;
      this.near = false;
      this.gfx.clear();
      this.gfx.setVisible(false);
      this.hint?.setVisible(false);
      this.publish();
      return;
    }

    this.runningCount = countRunningAgents(this.scene);
    if (this.forced) {
      this.periodMs = FORCE_PERIOD_MS;
    } else {
      // more running → slightly faster chase (cap at BUSY)
      const t = Math.min(1, this.runningCount / 4);
      this.periodMs = PERIOD_MS + (BUSY_PERIOD_MS - PERIOD_MS) * t;
    }

    this.active = true;
    this.gfx.setVisible(true);
    this._draw(time);

    const nearRack = bossNearRack(this.scene, this.racks);
    this.near = !!nearRack;
    if (nearRack && this.hint) {
      this.hint.setPosition(nearRack.x, nearRack.y - 18);
      this.hint.setVisible(true);
    } else if (this.hint) {
      this.hint.setVisible(false);
    }

    this.publish();
  }

  /**
   * @param {number} time
   */
  _draw(time) {
    const g = this.gfx;
    g.clear();

    const boost = this.forced ? 1.45 : 1;
    const period = this.periodMs;
    const cols = 4;
    const rows = 4;

    for (const a of this.racks) {
      const chase = ((time / period) + a.phase) % 1;
      const activeCol = Math.floor(chase * cols) % cols;

      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const lx = a.x - 8 + c * 5.2;
          const ly = a.y - 10 + r * 4.2;
          const onCol = c === activeCol;
          const wave = onCol
            ? 0.55 + 0.4 * Math.sin((time / (period * 0.35) + r * 0.4) * Math.PI * 2)
            : 0.12 + 0.08 * ((r + c) % 3);
          const alpha = Math.min(0.95, wave * boost);
          const color = LED_COLORS[c % LED_COLORS.length];

          if (onCol) {
            g.fillStyle(GLOW, alpha * 0.28);
            g.fillEllipse(lx, ly, 8, 6);
          }
          g.fillStyle(color, alpha);
          g.fillCircle(lx, ly, onCol ? 1.8 : 1.1);
          if (onCol) {
            g.fillStyle(0xffffff, Math.min(0.7, alpha * 0.55));
            g.fillCircle(lx, ly, 0.7);
          }
        }
      }
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      active: this.active,
      near: this.near,
      rackCount: this.racks.length,
      racks: this.racks.map((a) => ({ tx: a.tx, ty: a.ty })),
      periodMs: this.periodMs,
      runningCount: this.runningCount,
      rackGid: SERVER_RACK_GID,
      depth: DEPTH,
      mode: serverRackModeFromQuery(),
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
      serverRack: snap,
    };
  }

  destroy() {
    try {
      this.gfx?.destroy();
    } catch {
      /* ignore */
    }
    try {
      this.hint?.destroy();
    } catch {
      /* ignore */
    }
    this.gfx = null;
    this.hint = null;
    this.racks = [];
    this.active = false;
    this.publish();
  }
}

export { SERVER_RACK_GID, DEPTH, PERIOD_MS, FORCE_PERIOD_MS, BUSY_PERIOD_MS };
