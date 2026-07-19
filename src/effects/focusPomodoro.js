/**
 * Focus deep-work pomodoro ring under nameplate (outside progress bar).
 * 25 min cycle from task_elapsed_s, else scene-clock pulse.
 * `?pomodoro=0` off · `?pomodoro=force` smoke/mock always on at focus.
 */

import { TILE_SIZE } from "../constants.js";
import { agentNearFocusDesk } from "./focusHeadphones.js";

/** Just under progressGfx(20); above DND(18). */
export const POMODORO_DEPTH = 19.5;
/** 25 minutes. */
export const POMODORO_CYCLE_S = 1500;
/** Soft mint — matches focus headphones accent, not urgency rose. */
export const RING_COLOR = 0x5ee0c8;
export const RING_TRACK = 0x1a3030;
export const FLASH_COLOR = 0xa8ffe8;

/** Outer ring radius (px) — progress bar stays inside (~14 half-width). */
const OUTER_R = 20;
const INNER_R = 15;
const LINE_W = 2.2;
/** Ring center under nameplate (progress sits at y-36). */
const RING_OY = -36;

/**
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function pomodoroModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("pomodoro");
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
 * Focus desks + running/deep-work only.
 * Open Desk / lounge / idle hidden. Force bypasses occupancy for smoke.
 */
export function shouldShowFocusPomodoro(agent, mode) {
  if (!agent?.sprite) return false;
  const m = mode ?? pomodoroModeFromQuery();
  if (!m.enabled) return false;

  const status = agent.serverStatus;
  const zone = agent.serverData?.zone || agent.currentKind;

  // idle / lounge / open-desk never — even under ?pomodoro=force
  if (
    status === "idle" ||
    status === "offline" ||
    status === "ready" ||
    status === "todo"
  ) {
    return false;
  }
  if (zone === "lounge" || zone === "break" || zone === "meeting" || zone === "review") {
    return false;
  }

  const atFocus =
    zone === "focus" ||
    agent.currentKind === "focus" ||
    agentNearFocusDesk(agent);

  if (!atFocus) return false;
  if (m.forced) return true;
  if (status === "running") return true;
  // mock wander before first snapshot — focus room implies deep work
  if (!agent.live && !status && agent.currentKind === "focus") return true;
  return false;
}

/**
 * Fill 0..1 for the current 25m cycle.
 * Prefer task_elapsed_s % cycle; else scene-clock pulse.
 * @param {object} agent
 * @param {number} sceneTimeMs
 * @param {{ enabled: boolean, forced: boolean }} mode
 */
export function resolvePomodoroFill(agent, sceneTimeMs, mode) {
  const m = mode ?? pomodoroModeFromQuery();
  const cycle = POMODORO_CYCLE_S;
  const elapsed = agent?.serverData?.task_elapsed_s;

  if (typeof elapsed === "number" && Number.isFinite(elapsed) && elapsed >= 0) {
    const t = elapsed % cycle;
    return Math.max(0, Math.min(1, t / cycle));
  }

  // no elapsed — soft clock pulse (or forced visible mid-fill)
  const sec = (sceneTimeMs ?? 0) / 1000;
  if (m.forced) {
    // smoke-friendly: ~65% fill + slow drift so ring reads in screenshots
    return 0.55 + 0.1 * ((Math.sin(sec * 0.7) + 1) / 2);
  }
  return (sec % cycle) / cycle;
}

/**
 * Draw track + arc fill around nameplate/progress.
 * @param {Phaser.GameObjects.Graphics} gfx
 * @param {number} fill 0..1
 * @param {{ flash?: number }} [opts] flash 0..1 mint overlay
 */
export function drawPomodoroRing(gfx, fill, opts = {}) {
  gfx.clear();
  const f = Math.max(0, Math.min(1, fill));
  const flash = opts.flash ?? 0;

  // track
  gfx.lineStyle(LINE_W, RING_TRACK, 0.55);
  gfx.beginPath();
  gfx.arc(0, 0, OUTER_R, 0, Math.PI * 2, false);
  gfx.strokePath();

  // soft outer glow
  gfx.lineStyle(LINE_W + 1.5, RING_COLOR, 0.12 + flash * 0.35);
  gfx.beginPath();
  gfx.arc(0, 0, OUTER_R + 1.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f, false);
  gfx.strokePath();

  // fill arc (clockwise from 12 o'clock)
  if (f > 0.001) {
    const a = 0.72 + flash * 0.28;
    gfx.lineStyle(LINE_W, RING_COLOR, a);
    gfx.beginPath();
    gfx.arc(0, 0, OUTER_R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f, false);
    gfx.strokePath();
  }

  // inner gap so progressGfx (BAR_W=28) stays visually inside
  gfx.lineStyle(1, RING_TRACK, 0.25);
  gfx.beginPath();
  gfx.arc(0, 0, INNER_R, 0, Math.PI * 2, false);
  gfx.strokePath();

  if (flash > 0.02) {
    gfx.fillStyle(FLASH_COLOR, flash * 0.35);
    gfx.fillCircle(0, 0, OUTER_R + 4);
  }
}

function makeRing(scene) {
  return scene.add.graphics().setDepth(POMODORO_DEPTH).setVisible(false);
}

/**
 * One soft pomodoro ring per focus running agent. Follows sprite under nameplate.
 */
export class FocusPomodoro {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.mode = pomodoroModeFromQuery();
    /** @type {Map<string, {
     *   gfx: Phaser.GameObjects.Graphics,
     *   visible: boolean,
     *   fill: number,
     *   prevFill: number,
     *   flashUntil: number,
     *   cycleIndex: number,
     * }>} */
    this.rings = new Map();
    this._lastKey = "";
    this._dingCount = 0;

    scene.events.once("shutdown", () => this.destroy());
    this.sync(scene.time?.now ?? 0);
  }

  _ensure(id) {
    let ring = this.rings.get(id);
    if (ring) return ring;
    const cap = Math.max(1, this.scene.agents?.length || 1);
    if (this.rings.size >= cap) return null;
    const gfx = makeRing(this.scene);
    ring = {
      gfx,
      visible: false,
      fill: 0,
      prevFill: 0,
      flashUntil: 0,
      cycleIndex: -1,
      agentId: id,
    };
    this.rings.set(id, ring);
    return ring;
  }

  /**
   * Detect cycle wrap → mint flash + soft ding (mute / ?sfx=0 respected).
   */
  _maybeComplete(ring, fill, now, agent) {
    const prev = ring.prevFill;
    const wrapped = prev > 0.85 && fill < 0.15;
    const elapsed = agent?.serverData?.task_elapsed_s;
    let cycleIdx = ring.cycleIndex;
    if (typeof elapsed === "number" && Number.isFinite(elapsed) && elapsed >= 0) {
      cycleIdx = Math.floor(elapsed / POMODORO_CYCLE_S);
    }
    const cycleBump =
      cycleIdx >= 0 && ring.cycleIndex >= 0 && cycleIdx > ring.cycleIndex;

    if (wrapped || cycleBump) {
      ring.flashUntil = now + 480;
      this._dingCount += 1;
      this.scene.officeAudio?.playPomodoroDing?.();
    }
    if (cycleIdx >= 0) ring.cycleIndex = cycleIdx;
    ring.prevFill = fill;
  }

  /**
   * @param {number} [nowMs]
   */
  sync(nowMs) {
    const now = nowMs ?? this.scene.time?.now ?? 0;
    this.mode = pomodoroModeFromQuery();

    if (!this.mode.enabled) {
      for (const ring of this.rings.values()) {
        ring.gfx.setVisible(false);
        ring.visible = false;
      }
      this.publish();
      return;
    }

    const agents = this.scene.agents || [];
    const liveIds = new Set();

    for (const agent of agents) {
      const id = agent?.def?.id;
      if (!id) continue;
      liveIds.add(id);

      if (!shouldShowFocusPomodoro(agent, this.mode) || !agent.sprite) {
        const existing = this.rings.get(id);
        if (existing) {
          existing.gfx.setVisible(false);
          existing.visible = false;
        }
        continue;
      }

      const ring = this._ensure(id);
      if (!ring) continue;

      const fill = resolvePomodoroFill(agent, now, this.mode);
      this._maybeComplete(ring, fill, now, agent);
      ring.fill = fill;

      const flash =
        ring.flashUntil > now
          ? Math.max(0, (ring.flashUntil - now) / 480)
          : 0;

      ring.gfx.setPosition(agent.sprite.x, agent.sprite.y + RING_OY);
      drawPomodoroRing(ring.gfx, fill, { flash });
      ring.gfx.setVisible(true);
      ring.visible = true;
    }

    for (const [id, ring] of this.rings) {
      if (liveIds.has(id)) continue;
      ring.gfx.destroy();
      this.rings.delete(id);
    }

    this.publish();
  }

  snapshot() {
    const active = [];
    for (const [id, ring] of this.rings) {
      if (!ring.visible) continue;
      active.push({
        id,
        fill: Math.round(ring.fill * 1000) / 1000,
        flashing: ring.flashUntil > (this.scene.time?.now ?? 0),
      });
    }
    return {
      enabled: this.mode.enabled,
      forced: this.mode.forced,
      cycleS: POMODORO_CYCLE_S,
      depth: POMODORO_DEPTH,
      color: RING_COLOR,
      outerR: OUTER_R,
      innerR: INNER_R,
      dingCount: this._dingCount,
      count: active.length,
      agents: active,
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
      focusPomodoro: snap,
    };
  }

  destroy() {
    for (const ring of this.rings.values()) {
      try {
        ring.gfx.destroy();
      } catch {
        /* ignore */
      }
    }
    this.rings.clear();
    this.publish();
  }
}

export { RING_OY, OUTER_R, INNER_R, TILE_SIZE };
