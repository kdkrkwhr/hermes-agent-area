/** Evening/night soft amber desk boost for status=running agents.
 *  Distinct from deskGlow (monitor LED) / lampGlow (furniture lamps).
 *  Soft ADD wash + rare flavor bubble (`야근…` / `아직도야?`).
 *  morning/day off. idle/blocked/chatting never.
 *  `?overtime=0` off · `?overtime=force` smoke (TOD ignore, short CD).
 */

import { TILE_SIZE } from "../constants.js";

/** Under deskGlow(11); above deskSticky(8) / dualDesk(7). */
const DEPTH = 10.7;
/** Warm amber — distinct from running teal (0x5ee0c8) / focus orange (0xffb347). */
const AMBER = 0xffb060;
const AMBER_SOFT = 0xffd090;
/** Slow breathe — stays below deskGlow visual weight. */
const PERIOD_MS = 2400;
/** Soft peak alpha — avoid stacking hard with deskGlow/lampGlow. */
const ALPHA_MIN = 0.06;
const ALPHA_MAX = 0.16;
const GLOW_W = 28;
const GLOW_H = 16;

const LINES = ["야근…", "아직도야?", "조금만 더…"];
const BUBBLE_MS = 2800;
const CD_MIN_MS = 25000;
const CD_MAX_MS = 45000;
const FORCE_CD_MS = 2200;

/**
 * Query: omit = TOD-driven. `0`/`off`/`false` = never.
 * `force`/`1`/`on`/`true` = always (TOD ignore) + short bubble CD.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function overtimeModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("overtime");
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

export function overtimeEnabledFromQuery() {
  return overtimeModeFromQuery().enabled;
}

/** evening/night lighting, or local clock 20–06 (when no preset). */
export function isOvertimeWindow(scene, forced = false) {
  if (forced) return true;
  const name = scene?.lightingPreset?.name;
  if (name === "evening" || name === "night") return true;
  if (name === "morning" || name === "day") return false;
  // no lighting yet — fall back to wall clock 20–06
  try {
    const h = new Date().getHours();
    return h >= 20 || h < 6;
  } catch {
    return false;
  }
}

/** running only — never chatting/blocked/idle. */
export function isOvertimeRunning(agent) {
  if (!agent) return false;
  const s = agent.serverStatus;
  if (s === "running") return true;
  // mock wander before first snapshot — desk/focus room implies coding
  if (!agent.live && !s && (agent.currentKind === "desk" || agent.currentKind === "focus")) {
    return true;
  }
  return false;
}

function hasForeignBubble(agent) {
  if (!agent) return true;
  if (agent._expandTimer) return true;
  return (
    agent._bossGreetBackup != null ||
    agent._coffeeBackup != null ||
    agent._workBackup != null ||
    agent._specBackup != null ||
    agent._stretchBackup != null ||
    agent._waterBackup != null ||
    agent._phoneBackup != null ||
    agent._chatterBackup != null ||
    agent._overtimeBackup != null ||
    agent._bumpBackup != null
  );
}

/** Bubble ownership OK? */
export function isOvertimeBubbleEligible(agent) {
  if (!isOvertimeRunning(agent)) return false;
  if (hasForeignBubble(agent)) return false;
  if (!agent.sprite?.visible) return false;
  return true;
}

/** Desk surface px — soft wash on the desk, not the head LED. */
export function overtimeDeskAnchor(agent) {
  const tw = agent?.tileSize || agent?.scene?.map?.tileWidth || TILE_SIZE;
  const th = agent?.scene?.map?.tileHeight || tw;
  const wp = agent?.waypoints || agent?.scene?.waypoints || {};
  const zone = agent?.serverData?.zone || agent?.currentKind;
  const home = agent?.def?.homeDesk ?? 0;

  let tile = null;
  if (zone === "focus") {
    const focus = wp.focusDesks || [];
    tile = focus[home % Math.max(1, focus.length)] || focus[0] || null;
  }
  if (!tile) {
    const desks = wp.desks || [];
    tile = desks[home % Math.max(1, desks.length)] || desks[0] || null;
  }
  if (!tile && agent?.sprite) {
    return { x: agent.sprite.x + 8, y: agent.sprite.y - 4 };
  }
  if (!tile) return { x: 0, y: 0 };

  return {
    x: tile.x * tw + tw / 2 + 6,
    y: tile.y * th + th / 2 - 2,
    tileX: tile.x,
    tileY: tile.y,
  };
}

function randBetween(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function makeGlow(scene) {
  const ellipse = scene.add
    .ellipse(0, 0, GLOW_W, GLOW_H, AMBER, ALPHA_MAX)
    .setDepth(DEPTH)
    .setBlendMode("ADD")
    .setVisible(false)
    .setScrollFactor(1);
  return ellipse;
}

/**
 * Per-running-agent amber desk wash + rare overtime bubble.
 */
export class OvertimeDesk {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = overtimeModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    /** @type {Map<string, { glow: Phaser.GameObjects.Ellipse, visible: boolean, tileX: number|null, tileY: number|null }>} */
    this.glows = new Map();
    this.active = false;
    this.todOk = false;
    this.boostCount = 0;
    this.bubbleCount = 0;
    this.lastLine = null;
    this.lastAgentId = null;
    this.lastBubbleAt = 0;
    this.nextBubbleAt = 0;
    this._pool = shuffleInPlace([...LINES]);
    this._lineCursor = 0;
    this._restores = [];
    this._lastKey = "";

    scene.events.once("shutdown", () => this.destroy());
    // first bubble after a full cooldown — avoid frame-0 spam
    this.nextBubbleAt =
      (scene.time?.now ?? 0) + (this.forced ? FORCE_CD_MS : randBetween(CD_MIN_MS, CD_MAX_MS));
    this.sync();
  }

  shouldShow() {
    if (!this.enabled) return false;
    return isOvertimeWindow(this.scene, this.forced);
  }

  /** Call from applyTimeOfDayLighting. */
  sync() {
    this.todOk = this.shouldShow();
    this.active = this.todOk;
    if (!this.todOk) {
      for (const entry of this.glows.values()) {
        entry.glow.setVisible(false);
        entry.visible = false;
      }
      this.boostCount = 0;
    }
    this.publish();
  }

  _ensure(id) {
    let entry = this.glows.get(id);
    if (entry) return entry;
    const glow = makeGlow(this.scene);
    entry = { glow, visible: false, tileX: null, tileY: null };
    this.glows.set(id, entry);
    return entry;
  }

  nextLine() {
    if (this._lineCursor >= this._pool.length) {
      this._pool = shuffleInPlace([...LINES]);
      this._lineCursor = 0;
    }
    const line = this._pool[this._lineCursor++];
    this.lastLine = line;
    return line;
  }

  pickCooldownMs() {
    if (this.forced) return FORCE_CD_MS;
    return randBetween(CD_MIN_MS, CD_MAX_MS);
  }

  /** Soft breathe + bubble schedule. Call from updateVisualEffects. */
  update(now = this.scene.time?.now ?? 0) {
    if (!this.enabled || !this.todOk) {
      for (const entry of this.glows.values()) {
        entry.glow.setVisible(false);
        entry.visible = false;
      }
      this.boostCount = 0;
      this.publish();
      return;
    }

    const agents = this.scene.agents || [];
    const liveIds = new Set();
    let boosts = 0;

    const phase = (Math.sin((now / PERIOD_MS) * Math.PI * 2) + 1) / 2;
    const alpha = ALPHA_MIN + phase * (ALPHA_MAX - ALPHA_MIN);

    for (const agent of agents) {
      const id = agent?.def?.id;
      if (!id) continue;
      liveIds.add(id);

      if (!isOvertimeRunning(agent) || !agent.sprite?.visible) {
        const existing = this.glows.get(id);
        if (existing) {
          existing.glow.setVisible(false);
          existing.visible = false;
        }
        continue;
      }

      const entry = this._ensure(id);
      const anchor = overtimeDeskAnchor(agent);
      entry.glow.setPosition(anchor.x, anchor.y);
      entry.glow.setFillStyle(AMBER, alpha);
      entry.glow.setVisible(true);
      entry.visible = true;
      entry.tileX = anchor.tileX ?? null;
      entry.tileY = anchor.tileY ?? null;
      boosts += 1;
    }

    for (const [id, entry] of this.glows) {
      if (liveIds.has(id)) continue;
      entry.glow.destroy();
      this.glows.delete(id);
    }

    this.boostCount = boosts;

    if (boosts > 0 && now >= this.nextBubbleAt) {
      this.tryBubble(now);
    }

    this.publish();
  }

  tryBubble(now) {
    if (this.scene.officeEvents?.isGathering?.()) {
      this.nextBubbleAt = now + (this.forced ? 800 : 5000);
      return;
    }

    const candidates = (this.scene.agents || []).filter((a) =>
      isOvertimeBubbleEligible(a),
    );
    if (!candidates.length) {
      this.nextBubbleAt = now + (this.forced ? 600 : 4000);
      return;
    }

    const agent = candidates[Math.floor(Math.random() * candidates.length)];
    const line = this.nextLine();
    agent._overtimeBackup = agent.statusText;
    agent.setStatus(line);

    this.bubbleCount += 1;
    this.lastAgentId = agent.def?.id ?? null;
    this.lastBubbleAt = now;
    this.nextBubbleAt = now + this.pickCooldownMs();

    const restore = this.scene.time.delayedCall(BUBBLE_MS, () => {
      this._restores = this._restores.filter((t) => t !== restore);
      if (agent._overtimeBackup == null) return;
      if (agent._expandTimer) {
        agent._overtimeBackup = null;
        return;
      }
      if (
        agent._bossGreetBackup != null ||
        agent._coffeeBackup != null ||
        agent._workBackup != null ||
        agent._specBackup != null ||
        agent._stretchBackup != null ||
        agent._waterBackup != null ||
        agent._phoneBackup != null ||
        agent._chatterBackup != null
      ) {
        agent._overtimeBackup = null;
        return;
      }
      agent.setStatus(agent._overtimeBackup);
      agent._overtimeBackup = null;
      this.publish();
    });
    this._restores.push(restore);
  }

  /** Force one bubble tick — smoke. */
  fireNow() {
    this.nextBubbleAt = 0;
    this.tryBubble(this.scene.time?.now ?? 0);
  }

  snapshot() {
    const desks = [];
    for (const [id, entry] of this.glows) {
      if (!entry.visible) continue;
      desks.push({
        id,
        x: Math.round(entry.glow.x),
        y: Math.round(entry.glow.y),
        tileX: entry.tileX,
        tileY: entry.tileY,
      });
    }
    return {
      enabled: this.enabled,
      forced: this.forced,
      active: this.active && this.boostCount > 0,
      todOk: this.todOk,
      boostCount: this.boostCount,
      bubbleCount: this.bubbleCount,
      lastLine: this.lastLine,
      lastAgentId: this.lastAgentId,
      lastBubbleAt: this.lastBubbleAt,
      depth: DEPTH,
      color: AMBER,
      softColor: AMBER_SOFT,
      lines: [...LINES],
      desks,
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
      overtime: snap,
    };
  }

  destroy() {
    for (const t of this._restores) {
      try {
        t.remove(false);
      } catch {
        /* ignore */
      }
    }
    this._restores = [];
    for (const entry of this.glows.values()) {
      try {
        entry.glow.destroy();
      } catch {
        /* ignore */
      }
    }
    this.glows.clear();
    this.publish();
  }
}

export { DEPTH, AMBER, LINES };
