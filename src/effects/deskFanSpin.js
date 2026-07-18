/** Desk stand fan (GID43) blade spin ambient.
 *  running/focus agent within ≤2 tiles → fast ADD spin streak.
 *  idle → slow wobble. `?deskfan=0|off|false` off · `?deskfan=force` smoke.
 *  Optional short whir via officeAudio (mute / ?sfx=0 respected).
 */

const DESK_FAN_GID = 43;
const MAX_FANS = 6;
/** Above furniture; below status burst (11). */
const DEPTH = 10;
const IDLE_PERIOD_MS = 4200;
const SPIN_PERIOD_MS = 520;
const FORCE_PERIOD_MS = 380;
const NEAR_TILES = 2;
const BLADE = 0xb8d8f0;
const STREAK = 0x88c8ee;
const HUB = 0xe8f4ff;

/**
 * Query: omit = on. `0`/`off`/`false` = never. `force`/`1`/`on`/`true` = smoke.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function deskFanModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("deskfan");
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

export function deskFanEnabledFromQuery() {
  return deskFanModeFromQuery().enabled;
}

/**
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number, phase: number }[]}
 */
export function findDeskFanTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (!layer?.getTileAt || !scene.map) return hits;

  const tw = scene.map.tileWidth ?? 32;
  const th = scene.map.tileHeight ?? 32;

  for (let ty = 0; ty < scene.map.height; ty++) {
    for (let tx = 0; tx < scene.map.width; tx++) {
      const tile = layer.getTileAt(tx, ty);
      if (!tile || tile.index !== DESK_FAN_GID) continue;
      hits.push({
        tx,
        ty,
        x: tx * tw + tw / 2,
        y: ty * th + th / 2 - 2,
        phase: (hits.length * 0.31) % 1,
      });
      if (hits.length >= MAX_FANS) return hits;
    }
  }
  return hits;
}

function agentBusyNearFan(scene, fans, reachTiles = NEAR_TILES) {
  const agents = scene.agents;
  if (!Array.isArray(agents) || !agents.length || !fans.length) {
    for (const f of fans) f.busy = false;
    return { near: false, spinning: 0 };
  }
  const tw = scene.map?.tileWidth ?? 32;
  const th = scene.map?.tileHeight ?? 32;
  const reach = Math.max(tw, th) * reachTiles;
  let spinning = 0;
  let anyNear = false;

  for (const fan of fans) {
    let fanSpin = false;
    for (const a of agents) {
      if (!a?.sprite?.active || !a.sprite.visible) continue;
      let kind = "";
      try {
        kind = a.getEffectKind?.() ?? "";
      } catch {
        kind = "";
      }
      if (kind !== "running" && a.currentKind !== "focus") continue;
      const dx = a.sprite.x - fan.x;
      const dy = a.sprite.y - fan.y;
      if (Math.hypot(dx, dy) <= reach) {
        fanSpin = true;
        anyNear = true;
        break;
      }
    }
    fan.busy = fanSpin;
    if (fanSpin) spinning += 1;
  }
  return { near: anyNear, spinning };
}

/**
 * Soft blade spin / idle wobble on desk fans.
 */
export class DeskFanSpin {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = deskFanModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.fans = this.enabled ? findDeskFanTiles(scene) : [];
    this.active = false;
    this.near = false;
    this.spinningCount = 0;
    this.periodMs = this.forced ? FORCE_PERIOD_MS : IDLE_PERIOD_MS;
    this._lastKey = "";
    this._lastWhirAt = 0;

    this.gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);
    this.gfx.setBlendMode("ADD");

    scene.events.once("shutdown", () => this.destroy());
    this.update(scene.time?.now ?? 0);
  }

  /**
   * @param {number} [time]
   */
  update(time = this.scene.time.now) {
    if (!this.enabled || !this.fans.length) {
      this.active = false;
      this.near = false;
      this.spinningCount = 0;
      this.gfx.clear();
      this.gfx.setVisible(false);
      this.publish();
      return;
    }

    if (this.forced) {
      this.near = true;
      this.spinningCount = this.fans.length;
      for (const f of this.fans) f.busy = true;
    } else {
      const prox = agentBusyNearFan(this.scene, this.fans);
      this.near = prox.near;
      this.spinningCount = prox.spinning;
    }
    this.periodMs = this.forced
      ? FORCE_PERIOD_MS
      : this.spinningCount > 0
        ? SPIN_PERIOD_MS
        : IDLE_PERIOD_MS;

    this.active = true;
    this.gfx.setVisible(true);
    this._draw(time);

    if (this.forced || this.spinningCount > 0) {
      this._maybeWhir(time);
    }

    this.publish();
  }

  /**
   * @param {number} time
   */
  _maybeWhir(time) {
    const audio = this.scene.officeAudio;
    if (!audio?.playFanWhir) return;
    const gap = this.forced ? 900 : 2200;
    if (this._lastWhirAt && time - this._lastWhirAt < gap) return;
    this._lastWhirAt = time;
    try {
      audio.playFanWhir();
    } catch {
      /* ignore */
    }
  }

  /**
   * @param {number} time
   */
  _draw(time) {
    const g = this.gfx;
    g.clear();

    const boost = this.forced ? 1.55 : this.spinningCount > 0 ? 1.2 : 0.75;

    for (const fan of this.fans) {
      const fanBusy = !!fan.busy;
      const period = this.forced
        ? FORCE_PERIOD_MS
        : fanBusy
          ? SPIN_PERIOD_MS
          : IDLE_PERIOD_MS;
      const ang =
        ((time / period) + fan.phase) * Math.PI * 2 * (fanBusy ? 1 : 0.35);
      const blades = 3;
      const r = fanBusy ? 9.5 : 8;

      g.fillStyle(HUB, 0.35 * boost);
      g.fillCircle(fan.x, fan.y, 2.2);

      for (let b = 0; b < blades; b++) {
        const a = ang + (b * Math.PI * 2) / blades;
        const x2 = fan.x + Math.cos(a) * r;
        const y2 = fan.y + Math.sin(a) * r;
        const midX = fan.x + Math.cos(a) * (r * 0.55);
        const midY = fan.y + Math.sin(a) * (r * 0.55);

        if (fanBusy) {
          g.lineStyle(3.2, STREAK, 0.22 * boost);
          g.beginPath();
          g.moveTo(fan.x, fan.y);
          g.lineTo(x2, y2);
          g.strokePath();
          g.fillStyle(STREAK, 0.18 * boost);
          g.fillEllipse(midX, midY, 10, 4.5);
        }

        g.lineStyle(1.6, BLADE, (fanBusy ? 0.75 : 0.4) * boost);
        g.beginPath();
        g.moveTo(fan.x, fan.y);
        g.lineTo(x2, y2);
        g.strokePath();
      }

      g.lineStyle(1, BLADE, 0.2 * boost);
      g.strokeCircle(fan.x, fan.y, r + 1.5);
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      active: this.active,
      near: this.near,
      fanCount: this.fans.length,
      spinningCount: this.spinningCount,
      fans: this.fans.map((a) => ({ tx: a.tx, ty: a.ty })),
      periodMs: this.periodMs,
      fanGid: DESK_FAN_GID,
      depth: DEPTH,
      mode: deskFanModeFromQuery(),
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
      deskFan: snap,
    };
  }

  destroy() {
    try {
      this.gfx?.destroy();
    } catch {
      /* ignore */
    }
    this.gfx = null;
    this.fans = [];
    this.active = false;
    this.publish();
  }
}

export { DESK_FAN_GID, DEPTH, IDLE_PERIOD_MS, SPIN_PERIOD_MS, FORCE_PERIOD_MS };
