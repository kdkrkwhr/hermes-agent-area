/** Focus dual desk (GID 26) soft dual-monitor LED / ADD screen pulse.
 *  Furniture ambient only — distinct from deskGlow (agent head) / monitorCode (Open Desk scroll).
 *  `?dualdesk=0|off|false` off · `?dualdesk=force` smoke (short CD, no proximity gate).
 */

const DUAL_DESK_GID = 26;
const MAX_DESKS = 8;
/** Above round-table props(6); below deskSticky(8) / deskGlow(11) / monitorCode(12). */
const DEPTH = 7;
/** Tile distance — proximity or focusDesks occupancy. */
const DIST_TILES = 2;
const COOLDOWN_MS = 3600;
const FORCE_COOLDOWN_MS = 800;
const PULSE_MS = 420;
/** Focus-zone warm amber — Open Desk uses teal/blue code scroll. */
const LED_AMBER = 0xffb347;
const LED_WARM = 0xffd080;
const GLOW = 0xff9944;

/**
 * Query: omit = on. `0`/`off`/`false` = never. `force`/`1`/`on`/`true` = smoke.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function dualDeskModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("dualdesk");
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

export function dualDeskEnabledFromQuery() {
  return dualDeskModeFromQuery().enabled;
}

/**
 * Scan furniture for dual-desk GID 26; return tile centers (≤ MAX_DESKS).
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number, phase: number }[]}
 */
export function findDualDeskTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (!layer?.getTileAt || !scene.map) return hits;

  const tw = scene.map.tileWidth ?? 32;
  const th = scene.map.tileHeight ?? 32;

  for (let ty = 0; ty < scene.map.height; ty++) {
    for (let tx = 0; tx < scene.map.width; tx++) {
      const tile = layer.getTileAt(tx, ty);
      if (!tile || tile.index !== DUAL_DESK_GID) continue;
      hits.push({
        tx,
        ty,
        x: tx * tw + tw / 2,
        y: ty * th + th / 2,
        phase: (hits.length * 0.31) % 1,
      });
      if (hits.length >= MAX_DESKS) return hits;
    }
  }
  return hits;
}

function tileDist(entity, desk) {
  const ta = entity.tilePos?.() ?? {
    x: Math.floor(entity.sprite.x / (entity.tileSize || 32)),
    y: Math.floor(entity.sprite.y / (entity.tileSize || 32)),
  };
  const dx = ta.x - desk.tx;
  const dy = ta.y - desk.ty;
  return Math.hypot(dx, dy);
}

/** focus / running deep-work — chatting alone does not stamp (Open Desk owns that vibe). */
function isFocusOrRunning(agent) {
  if (!agent?.sprite?.active || !agent.sprite.visible) return false;
  const status = agent.serverStatus;
  const zone = agent.serverData?.zone || agent.currentKind;
  if (status === "running") return true;
  if (zone === "focus" || agent.currentKind === "focus") return true;
  // mock wander before first snapshot
  if (!agent.live && !status && agent.currentKind === "focus") return true;
  return false;
}

function isIdlePass(agent) {
  if (!agent?.sprite?.active || !agent.sprite.visible) return false;
  if (isFocusOrRunning(agent)) return false;
  if (agent.serverStatus === "idle") return true;
  if (agent.currentKind === "break") return true;
  const kind = agent.getEffectKind?.();
  return kind === "idle";
}

/** Agent tile equals any focusDesks waypoint. */
function agentOnFocusDesk(agent, scene) {
  const focus = agent.waypoints?.focusDesks || scene?.waypoints?.focusDesks || [];
  if (!focus.length || !agent?.sprite) return false;
  const tw = agent.tileSize || scene?.map?.tileWidth || 32;
  const th = scene?.map?.tileHeight || tw;
  const tx = Math.floor(agent.sprite.x / tw);
  const ty = Math.floor(agent.sprite.y / th);
  for (const t of focus) {
    if (t.x === tx && t.y === ty) return true;
  }
  return false;
}

/**
 * Ambient dual-monitor LED on Focus dual desks — tick from OfficeScene.updateVisualEffects.
 */
export class DualDeskIdle {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = dualDeskModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.anchors = this.enabled ? findDualDeskTiles(scene) : [];
    /** @type {{ key: string, tx: number, ty: number, x: number, y: number, phase: number, readyAt: number, pulsing: boolean, pulseCount: number, pulseUntil: number, residual: number }[]} */
    this.desks = this.anchors.map((a) => ({
      key: `${a.tx},${a.ty}`,
      tx: a.tx,
      ty: a.ty,
      x: a.x,
      y: a.y,
      phase: a.phase,
      readyAt: 0,
      pulsing: false,
      pulseCount: 0,
      pulseUntil: 0,
      residual: 0,
    }));
    this.pulseCount = 0;
    this.lastAt = null;
    this.lastKey = null;
    this.active = false;
    this._lastKey = "";

    this.gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);
    this.gfx.setBlendMode("ADD");

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  cooldownMs() {
    return this.forced ? FORCE_COOLDOWN_MS : COOLDOWN_MS;
  }

  shouldBeActive() {
    return this.enabled && this.desks.length > 0;
  }

  sync() {
    if (!this.shouldBeActive()) {
      this.active = false;
      this.gfx.clear();
      this.gfx.setVisible(false);
      this.publish();
      return;
    }
    this.gfx.setVisible(true);
    this.publish();
  }

  /**
   * @param {number} [time]
   * @param {number} [_delta]
   */
  update(time = this.scene.time.now, _delta = 16) {
    if (!this.shouldBeActive()) {
      this.active = false;
      this.gfx.clear();
      this.gfx.setVisible(false);
      this.publish();
      return;
    }

    const agents = Array.isArray(this.scene.agents) ? this.scene.agents : [];
    const focusRun = agents.filter((a) => isFocusOrRunning(a));
    const idlePass = agents.filter((a) => isIdlePass(a));
    const now = time;

    for (const desk of this.desks) {
      let nearFocus = this.forced;
      let nearIdle = false;

      if (!nearFocus) {
        for (const agent of focusRun) {
          const d = tileDist(agent, desk);
          // ≤2 tiles, or sitting on focusDesks with a slightly looser reach
          if (
            d <= DIST_TILES ||
            (agentOnFocusDesk(agent, this.scene) && d <= DIST_TILES + 0.6)
          ) {
            nearFocus = true;
            break;
          }
        }
      }
      if (!nearFocus) {
        for (const agent of idlePass) {
          if (tileDist(agent, desk) <= DIST_TILES) {
            nearIdle = true;
            break;
          }
        }
      }

      // residual: faint idle pass glow (optional), decay when empty
      const targetResidual = nearIdle && !nearFocus ? 0.35 : 0;
      desk.residual += (targetResidual - desk.residual) * 0.08;

      if (nearFocus && !desk.pulsing && now >= desk.readyAt) {
        this._startPulse(desk, now);
      }
      if (desk.pulsing && now >= desk.pulseUntil) {
        desk.pulsing = false;
      }
    }

    this.active = true;
    this.gfx.setVisible(true);
    this._draw(now);
    this.publish();
  }

  _startPulse(desk, now) {
    desk.pulsing = true;
    desk.readyAt = now + this.cooldownMs();
    desk.pulseUntil = now + PULSE_MS;
    desk.pulseCount += 1;
    this.pulseCount += 1;
    this.lastAt = now;
    this.lastKey = desk.key;
  }

  /**
   * Soft dual-monitor LEDs + one-shot ADD screen pulse.
   * @param {number} time
   */
  _draw(time) {
    const g = this.gfx;
    g.clear();

    for (const desk of this.desks) {
      const pulsing = desk.pulsing && time < desk.pulseUntil;
      let pulseA = 0;
      if (pulsing) {
        const t = 1 - (desk.pulseUntil - time) / PULSE_MS;
        // single soft rise/fall
        pulseA = Math.sin(Math.min(1, Math.max(0, t)) * Math.PI);
      }
      const residual = desk.residual * (this.forced ? 0 : 1);
      const base = this.forced
        ? 0.22 + ((Math.sin(time / 900 + desk.phase * Math.PI * 2) + 1) / 2) * 0.18
        : residual * 0.12;
      const a = Math.min(0.95, base + pulseA * 0.72);
      if (a < 0.02) continue;

      const cy = desk.y - 5;
      // two monitors side-by-side
      const mids = [-7, 7];
      for (const ox of mids) {
        const mx = desk.x + ox;
        // outer glow
        g.fillStyle(GLOW, a * 0.28);
        g.fillEllipse(mx, cy, 14, 11);
        g.fillStyle(LED_AMBER, a * 0.4);
        g.fillEllipse(mx, cy, 10, 8);
        // screen rect
        g.fillStyle(LED_AMBER, a * 0.55);
        g.fillRect(mx - 5, cy - 4, 10, 7);
        g.fillStyle(LED_WARM, Math.min(0.9, a * 0.75));
        g.fillRect(mx - 4, cy - 3, 8, 5);
        // tiny LED under bezel
        const blink =
          pulsing || this.forced
            ? (Math.sin((time / 280 + desk.phase) * Math.PI * 2) + 1) / 2
            : residual;
        g.fillStyle(LED_AMBER, Math.min(0.95, (0.15 + blink * 0.55) * Math.max(a, residual)));
        g.fillCircle(mx, cy + 6, 1.4);
      }
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      active: this.shouldBeActive() && this.active,
      deskCount: this.desks.length,
      deskTiles: this.anchors.length,
      desks: this.desks.map((d) => ({ tx: d.tx, ty: d.ty, pulseCount: d.pulseCount })),
      dualDeskGid: DUAL_DESK_GID,
      distTiles: DIST_TILES,
      depth: DEPTH,
      cooldownMs: this.cooldownMs(),
      pulseCount: this.pulseCount,
      lastAt: this.lastAt,
      lastKey: this.lastKey,
      mode: dualDeskModeFromQuery(),
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
      dualDesk: snap,
    };
  }

  destroy() {
    try {
      this.gfx?.destroy();
    } catch {
      /* ignore */
    }
    this.gfx = null;
    this.desks = [];
    this.anchors = [];
    this.active = false;
    this.publish();
  }
}

export { DUAL_DESK_GID, MAX_DESKS, DEPTH as DUAL_DESK_DEPTH, DIST_TILES };
