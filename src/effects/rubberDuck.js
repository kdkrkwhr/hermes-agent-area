/** Blocked-desk rubber duck companion. Soft bob on monitor/desk corner.
 *  `?duck=0` off · `?duck=1`/`force` smoke-force on mock blocked.
 */

import { resolveDeskGlowKind } from "./deskGlow.js";
import { deskStickyAnchor } from "./deskSticky.js";

/** Near deskGlow(11); under nameplate(20). */
const DEPTH = 12;
const TEX_KEY = "fx-rubber-duck";
const TEX_W = 12;
const TEX_H = 12;
const BOB_PX = 1.5;
const BOB_MS = 900;
/** Desk corner nudge from sticky anchor — toward monitor. */
const CORNER_OX = 16;
const CORNER_OY = -10;

/**
 * Query: omit = on. `0`/`off`/`false` = never. `1`/`true`/`on`/`force` = force mock blocked.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function duckModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("duck");
    if (v == null || v === "") return { enabled: true, forced: false };
    if (v === "0" || v === "false" || v === "off") {
      return { enabled: false, forced: false };
    }
    if (v === "1" || v === "true" || v === "on" || v === "force") {
      return { enabled: true, forced: true };
    }
    return { enabled: true, forced: false };
  } catch {
    return { enabled: true, forced: false };
  }
}

export function duckEnabledFromQuery() {
  return duckModeFromQuery().enabled;
}

/** blocked (or review→glow blocked) only — running/chatting/idle/focus/offline hide. */
export function isBlockedForDuck(agent) {
  if (!agent) return false;
  const status = agent.serverStatus;
  if (status === "blocked" || status === "review") return true;
  return resolveDeskGlowKind(agent) === "blocked";
}

/** Open desk / focus seat — duck lives on that surface. */
export function agentSeatedAtDesk(agent) {
  if (!agent) return false;
  const zone = agent.serverData?.zone || agent.currentKind;
  if (zone === "desk" || zone === "focus") return true;
  if (agent.currentKind === "desk" || agent.currentKind === "focus") return true;
  return false;
}

export function agentIsMoving(agent) {
  return Array.isArray(agent?.path) && agent.path.length > 0;
}

/**
 * Show when blocked + seated at desk (not moving).
 * Force: any blocked agent (mock smoke), still hide while pathing.
 */
export function shouldShowRubberDuck(agent, forced = false) {
  if (!agent?.sprite) return false;
  if (!isBlockedForDuck(agent)) return false;
  if (agentIsMoving(agent)) return false;
  if (forced) return true;
  return agentSeatedAtDesk(agent);
}

/** Tiny yellow duck silhouette — body + beak + eye. */
export function ensureDuckTexture(scene) {
  if (scene.textures.exists(TEX_KEY)) return TEX_KEY;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  // body
  g.fillStyle(0xffd24a, 1);
  g.fillCircle(5, 7, 4);
  // head
  g.fillCircle(8, 4, 3);
  // beak
  g.fillStyle(0xff8c2a, 1);
  g.fillTriangle(10, 4, 12, 5, 10, 6);
  // eye
  g.fillStyle(0x2a2418, 1);
  g.fillCircle(8, 3, 1);
  g.generateTexture(TEX_KEY, TEX_W, TEX_H);
  g.destroy();
  return TEX_KEY;
}

export function duckWorldPos(agent, timeMs = 0) {
  const anchor = deskStickyAnchor(agent);
  const bob = Math.sin((timeMs / BOB_MS) * Math.PI * 2) * BOB_PX;
  return {
    x: anchor.x + CORNER_OX,
    y: anchor.y + CORNER_OY + bob,
    tileX: anchor.tileX ?? null,
    tileY: anchor.tileY ?? null,
  };
}

function makeDuck(scene) {
  ensureDuckTexture(scene);
  const img = scene.add
    .image(0, 0, TEX_KEY)
    .setDepth(DEPTH)
    .setOrigin(0.5, 0.85)
    .setVisible(false);
  return img;
}

/**
 * One duck per blocked desk agent. Soft bob; fades out when moving.
 */
export class RubberDuck {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    const mode = duckModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    /** @type {Map<string, { img: Phaser.GameObjects.Image, visible: boolean, alpha: number }>} */
    this.ducks = new Map();
    this._lastKey = "";

    scene.events.once("shutdown", () => this.destroy());
    this.sync(scene.time?.now ?? 0);
  }

  _ensure(id) {
    let duck = this.ducks.get(id);
    if (duck) return duck;
    const cap = Math.max(1, this.scene.agents?.length || 1);
    if (this.ducks.size >= cap) return null;
    const img = makeDuck(this.scene);
    duck = { img, visible: false, alpha: 0, agentId: id, tileX: null, tileY: null };
    this.ducks.set(id, duck);
    return duck;
  }

  /**
   * @param {number} [timeMs]
   */
  sync(timeMs = 0) {
    if (!this.enabled) {
      for (const duck of this.ducks.values()) {
        duck.img.setVisible(false);
        duck.img.setAlpha(0);
        duck.visible = false;
        duck.alpha = 0;
      }
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

      const show = shouldShowRubberDuck(agent, this.forced);
      const duck = this._ensure(id);
      if (!duck) continue;

      if (!show) {
        // soft fade when walking away / status clear
        const next = Math.max(0, duck.alpha - 0.12);
        duck.alpha = next;
        duck.img.setAlpha(next);
        if (next <= 0.02) {
          duck.img.setVisible(false);
          duck.visible = false;
          duck.alpha = 0;
        } else {
          duck.img.setVisible(true);
          duck.visible = false;
        }
        continue;
      }

      const pos = duckWorldPos(agent, t);
      duck.img.setPosition(pos.x, pos.y);
      duck.tileX = pos.tileX;
      duck.tileY = pos.tileY;
      duck.alpha = Math.min(1, duck.alpha + 0.18);
      duck.img.setAlpha(duck.alpha);
      duck.img.setVisible(true);
      duck.visible = true;
    }

    for (const [id, duck] of this.ducks) {
      if (liveIds.has(id)) continue;
      duck.img.destroy();
      this.ducks.delete(id);
    }

    this.publish();
  }

  snapshot() {
    const items = [];
    for (const [id, duck] of this.ducks) {
      if (!duck.visible) continue;
      items.push({
        id,
        x: Math.round(duck.img.x),
        y: Math.round(duck.img.y),
        tileX: duck.tileX ?? null,
        tileY: duck.tileY ?? null,
        visible: true,
      });
    }
    return {
      enabled: this.enabled,
      forced: this.forced,
      count: items.length,
      depth: DEPTH,
      ducks: items,
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
      rubberDuck: snap,
    };
  }

  destroy() {
    for (const duck of this.ducks.values()) {
      try {
        duck.img.destroy();
      } catch {
        /* ignore */
      }
    }
    this.ducks.clear();
    this.publish();
  }
}

export { DEPTH, TEX_KEY, TEX_W, TEX_H, BOB_PX, CORNER_OX, CORNER_OY };
