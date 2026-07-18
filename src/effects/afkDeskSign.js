/** Desk AFK / BRB placard ? idle|ready at desk for ?90s (status signal).
 *  Hide on running/blocked/chatting/offline or leave desk.
 *  `?afk=0` off ? `?afk=force` skip idle wait (smoke).
 */

import { TILE_SIZE } from "../constants.js";
import { agentIsMoving, agentSeatedAtDesk } from "./rubberDuck.js";
import { deskStickyAnchor } from "./deskSticky.js";

const TEX_KEY = "fx-afk-desk-sign";
/** Above monitor glow(11)/screensaver(12); below nameplate(20)/bubble(21?22). */
const DEPTH = 14;
/** ~0.6 tile width. */
const SIGN_W = Math.round(TILE_SIZE * 0.6);
const SIGN_H = 16;
const PANEL = 0x1a2430;
const EDGE = 0x7a9ab0;
const GLOW = 0x88b8d0;
const LABEL_MAIN = "#c8e0f0";
const LABEL_SUB = "#8aabbc";
const BOB_PX = 1.5;
const BOB_MS = 2400;
/** Continuous idle|ready at desk before placard. */
const IDLE_MS = 90_000;
/** Placard sits on desk surface near sticky. */
const ANCHOR_OX = -6;
const ANCHOR_OY = -18;

/**
 * Query: omit = on. `0`/`off`/`false` = never. `force`/`1`/`on`/`true` = skip 90s.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function afkModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("afk");
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

export function afkEnabledFromQuery() {
  return afkModeFromQuery().enabled;
}

/** idle / ready only ? busy + offline hide immediately. */
export function isAfkCandidateStatus(agent) {
  if (!agent?.sprite?.active || !agent.sprite.visible) return false;
  const status = agent.serverStatus;
  if (status === "idle" || status === "ready") return true;
  // mock wander before snapshot ? desk seat with no busy status ? idle
  if (!agent.live && !status && agentSeatedAtDesk(agent)) return true;
  return false;
}

/**
 * Eligible when idle|ready + seated at desk + not pathing.
 * Force skips the 90s clock only ? still needs candidate + desk.
 */
export function shouldTrackAfk(agent) {
  if (!agent?.sprite) return false;
  if (!isAfkCandidateStatus(agent)) return false;
  if (agentIsMoving(agent)) return false;
  return agentSeatedAtDesk(agent);
}

function ensureTexture(scene) {
  if (scene.textures.exists(TEX_KEY)) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(EDGE, 0.7);
  g.fillRect(SIGN_W / 2 - 1, 0, 2, 3);
  g.fillStyle(PANEL, 1);
  g.fillRoundedRect(0, 3, SIGN_W, SIGN_H, 2);
  g.lineStyle(1, EDGE, 0.85);
  g.strokeRoundedRect(0.5, 3.5, SIGN_W - 1, SIGN_H - 1, 2);
  g.generateTexture(TEX_KEY, SIGN_W, SIGN_H + 3);
  g.destroy();
}

function makeSign(scene) {
  ensureTexture(scene);
  const root = scene.add.container(0, 0).setDepth(DEPTH).setVisible(false);
  const glow = scene.add
    .ellipse(0, 1, SIGN_W + 10, SIGN_H + 8, GLOW, 0.14)
    .setBlendMode("ADD");
  const panel = scene.add.image(0, 2, TEX_KEY).setOrigin(0.5, 0.5);
  const main = scene.add
    .text(0, -1, "BRB", {
      fontFamily: "Consolas, Segoe UI, monospace",
      fontSize: "8px",
      fontStyle: "bold",
      color: LABEL_MAIN,
      align: "center",
    })
    .setOrigin(0.5, 0.5);
  const sub = scene.add
    .text(0, 7, "????", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "6px",
      color: LABEL_SUB,
      align: "center",
    })
    .setOrigin(0.5, 0.5);
  root.add([glow, panel, main, sub]);
  return { root, glow, panel, main, sub, visible: false };
}

function signWorldPos(agent, timeMs = 0, phase = 0) {
  const anchor = deskStickyAnchor(agent);
  const bob =
    Math.sin((timeMs / BOB_MS) * Math.PI * 2 + phase * Math.PI * 2) * BOB_PX;
  return {
    x: anchor.x + ANCHOR_OX,
    y: anchor.y + ANCHOR_OY + bob,
  };
}

/**
 * One AFK placard per idle/ready desk agent (after IDLE_MS, or force).
 */
export class AfkDeskSign {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = afkModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    /** @type {Map<string, object>} */
    this.signs = new Map();
    /** @type {Map<string, number>} agentId ? scene time when idle@desk started */
    this._idleSince = new Map();
    this._lastKey = "";

    scene.events.once("shutdown", () => this.destroy());
    this.sync(scene.time?.now ?? 0);
  }

  _ensure(id, phase) {
    let sign = this.signs.get(id);
    if (sign) return sign;
    const cap = Math.max(1, this.scene.agents?.length || 1);
    if (this.signs.size >= cap) return null;
    sign = makeSign(this.scene);
    sign.agentId = id;
    sign.phase = phase ?? (this.signs.size * 0.37) % 1;
    this.signs.set(id, sign);
    return sign;
  }

  /**
   * @param {number} [timeMs]
   */
  sync(timeMs = this.scene.time?.now ?? 0) {
    if (!this.enabled) {
      for (const sign of this.signs.values()) {
        sign.root.setVisible(false);
        sign.visible = false;
      }
      this._idleSince.clear();
      this.publish();
      return;
    }

    const agents = this.scene.agents || [];
    const liveIds = new Set();
    const t = timeMs || this.scene.time?.now || 0;

    for (const agent of agents) {
      const id = agent?.def?.id;
      if (!id) continue;
      liveIds.add(id);

      if (!shouldTrackAfk(agent)) {
        this._idleSince.delete(id);
        const existing = this.signs.get(id);
        if (existing) {
          existing.root.setVisible(false);
          existing.visible = false;
        }
        continue;
      }

      let since = this._idleSince.get(id);
      if (since == null) {
        since = t;
        this._idleSince.set(id, since);
      }

      const elapsed = t - since;
      const want = this.forced || elapsed >= IDLE_MS;
      if (!want) {
        const existing = this.signs.get(id);
        if (existing) {
          existing.root.setVisible(false);
          existing.visible = false;
        }
        continue;
      }

      const sign = this._ensure(id);
      if (!sign) continue;

      const pos = signWorldPos(agent, t, sign.phase);
      sign.root.setPosition(pos.x, pos.y);
      sign.root.setVisible(true);
      sign.visible = true;
    }

    for (const [id, sign] of this.signs) {
      if (liveIds.has(id)) continue;
      try {
        sign.root.destroy();
      } catch {
        /* ignore */
      }
      this.signs.delete(id);
      this._idleSince.delete(id);
    }

    this.publish();
  }

  /**
   * @param {number} [time]
   * @param {number} [_delta]
   */
  update(time = this.scene.time.now, _delta = 16) {
    this.sync(time);
  }

  snapshot() {
    const activeIds = [];
    for (const [id, sign] of this.signs) {
      if (!sign.visible) continue;
      activeIds.push(id);
    }
    return {
      enabled: this.enabled,
      forced: this.forced,
      count: activeIds.length,
      activeIds,
      idleMs: IDLE_MS,
      depth: DEPTH,
      signW: SIGN_W,
      mode: afkModeFromQuery(),
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
      afkDeskSign: snap,
    };
  }

  destroy() {
    for (const sign of this.signs.values()) {
      try {
        sign.root?.destroy();
      } catch {
        /* ignore */
      }
    }
    this.signs.clear();
    this._idleSince.clear();
    this.publish();
  }
}

export { DEPTH, IDLE_MS, SIGN_W, SIGN_H, BOB_PX, TEX_KEY };
