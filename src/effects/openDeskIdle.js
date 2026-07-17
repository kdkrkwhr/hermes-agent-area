/** Open Desk (GID 6) soft cyan/white monitor LED when idle.
 *  Furniture ambient only — deskGlow / monitorCode win on busy desks.
 *  `?opendeskidle=0|off|false` off · `?opendeskidle=force` always on (smoke).
 */

import { resolveDeskGlowKind } from "./deskGlow.js";

const OPEN_DESK_GID = 6;
const MAX_DESKS = 4;
/** Above furniture (0); below deskSticky(8) / deskGlow(11) / monitorCode(12). */
const DEPTH = 7;
/** Sit tiles sit ~2 below furniture GID — match that reach. */
const DIST_TILES = 2.6;
const PULSE_MS = 520;
const COOLDOWN_MS = 4800;
const FORCE_COOLDOWN_MS = 1100;
/** Soft cyan / cool white — dualDesk uses warm amber. */
const LED_CYAN = 0x5ee0c8;
const LED_WHITE = 0xd8f6ff;
const GLOW = 0x6ec8e8;

/**
 * Query: omit = on. `0`/`off`/`false` = never. `force`/`1`/`on`/`true` = smoke.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function openDeskIdleModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("opendeskidle");
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

export function openDeskIdleEnabledFromQuery() {
  return openDeskIdleModeFromQuery().enabled;
}

/**
 * Scan furniture for open-desk GID 6; return tile centers (≤ MAX_DESKS).
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number, phase: number }[]}
 */
export function findOpenDeskTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (!layer?.getTileAt || !scene.map) return hits;

  const tw = scene.map.tileWidth ?? 32;
  const th = scene.map.tileHeight ?? 32;

  for (let ty = 0; ty < scene.map.height; ty++) {
    for (let tx = 0; tx < scene.map.width; tx++) {
      const tile = layer.getTileAt(tx, ty);
      if (!tile || tile.index !== OPEN_DESK_GID) continue;
      hits.push({
        tx,
        ty,
        x: tx * tw + tw / 2,
        y: ty * th + th / 2,
        phase: (hits.length * 0.27) % 1,
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

/** Busy glow kinds — deskGlow owns these desks. */
function isBusyGlow(agent) {
  if (!agent?.sprite?.active || !agent.sprite.visible) return false;
  const kind = resolveDeskGlowKind(agent);
  return (
    kind === "running" ||
    kind === "chatting" ||
    kind === "blocked" ||
    kind === "focus"
  );
}

/**
 * Ambient open-desk LED — tick from OfficeScene.updateVisualEffects.
 */
export class OpenDeskIdle {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = openDeskIdleModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.anchors = this.enabled ? findOpenDeskTiles(scene) : [];
    /** @type {{ key: string, tx: number, ty: number, x: number, y: number, phase: number, readyAt: number, pulsing: boolean, pulseCount: number, pulseUntil: number, idle: boolean }[]} */
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
      idle: true,
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
    const busy = agents.filter((a) => isBusyGlow(a));
    const now = time;

    for (const desk of this.desks) {
      let occupiedBusy = false;
      if (!this.forced) {
        for (const agent of busy) {
          if (tileDist(agent, desk) <= DIST_TILES) {
            occupiedBusy = true;
            break;
          }
        }
      }

      desk.idle = this.forced || !occupiedBusy;

      if (desk.idle && !desk.pulsing && now >= desk.readyAt) {
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
   * Soft single-monitor cyan/white LED — quieter than dualDeskIdle.
   * @param {number} time
   */
  _draw(time) {
    const g = this.gfx;
    g.clear();

    for (const desk of this.desks) {
      if (!desk.idle) continue;

      const pulsing = desk.pulsing && time < desk.pulseUntil;
      let pulseA = 0;
      if (pulsing) {
        const t = 1 - (desk.pulseUntil - time) / PULSE_MS;
        pulseA = Math.sin(Math.min(1, Math.max(0, t)) * Math.PI) * 0.45;
      }

      // slow idle breathe — weaker than dualDesk force ambient
      const breathe =
        (Math.sin(time / 1400 + desk.phase * Math.PI * 2) + 1) / 2;
      const base = this.forced ? 0.18 + breathe * 0.14 : 0.1 + breathe * 0.1;
      const a = Math.min(0.75, base + pulseA);
      if (a < 0.03) continue;

      const mx = desk.x;
      const cy = desk.y - 4;

      g.fillStyle(GLOW, a * 0.22);
      g.fillEllipse(mx, cy, 16, 12);
      g.fillStyle(LED_CYAN, a * 0.32);
      g.fillEllipse(mx, cy, 11, 8);
      g.fillStyle(LED_CYAN, a * 0.45);
      g.fillRect(mx - 5, cy - 4, 10, 7);
      g.fillStyle(LED_WHITE, Math.min(0.7, a * 0.55));
      g.fillRect(mx - 4, cy - 3, 8, 5);

      const blink = (Math.sin((time / 420 + desk.phase) * Math.PI * 2) + 1) / 2;
      g.fillStyle(LED_WHITE, Math.min(0.85, (0.12 + blink * 0.4) * a));
      g.fillCircle(mx, cy + 6, 1.2);
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      active: this.shouldBeActive() && this.active,
      deskCount: this.desks.length,
      deskTiles: this.anchors.length,
      idleCount: this.desks.filter((d) => d.idle).length,
      desks: this.desks.map((d) => ({
        tx: d.tx,
        ty: d.ty,
        idle: d.idle,
        pulseCount: d.pulseCount,
      })),
      openDeskGid: OPEN_DESK_GID,
      distTiles: DIST_TILES,
      depth: DEPTH,
      cooldownMs: this.cooldownMs(),
      pulseCount: this.pulseCount,
      lastAt: this.lastAt,
      lastKey: this.lastKey,
      mode: openDeskIdleModeFromQuery(),
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
      openDeskIdle: snap,
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

export { OPEN_DESK_GID, MAX_DESKS, DEPTH as OPEN_DESK_IDLE_DEPTH, DIST_TILES };
