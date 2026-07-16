/** Focus-zone deep-work headphones above agent head. `?headphones=0` off. */

import { TILE_SIZE } from "../constants.js";

/** Near nameplate(20)/bubbleBg(21)/bubbleText(22). */
const DEPTH = 23;
const ICON_SCALE = 1;
const HEAD_OX = 0;
const HEAD_OY = -48;
const CUP = 0x2a3340;
const BAND = 0x1a222c;
const ACCENT = 0x5ee0c8;

/** `?headphones=0` (or false/off) disables. Default on. */
export function headphonesEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("headphones");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

/** Tile near any focusDesks waypoint (AABB ±0.75 tile). */
export function agentNearFocusDesk(agent) {
  if (!agent?.sprite) return false;
  const tw = agent.tileSize || agent.scene?.map?.tileWidth || TILE_SIZE;
  const th = agent.scene?.map?.tileHeight || tw;
  const focus = agent.waypoints?.focusDesks || agent.scene?.waypoints?.focusDesks || [];
  if (!focus.length) return false;
  const tx = agent.sprite.x / tw;
  const ty = agent.sprite.y / th;
  for (const t of focus) {
    if (Math.abs(tx - (t.x + 0.5)) <= 0.85 && Math.abs(ty - (t.y + 0.5)) <= 0.85) {
      return true;
    }
  }
  return false;
}

/** Focus deep-work only — Open Desk / lounge / meeting / idle hidden. */
export function shouldShowFocusHeadphones(agent) {
  if (!agent) return false;
  const status = agent.serverStatus;
  const zone = agent.serverData?.zone || agent.currentKind;
  if (zone === "lounge" || zone === "break" || zone === "meeting" || zone === "review") {
    return false;
  }
  if (status === "idle" || status === "offline" || status === "ready" || status === "todo") {
    return false;
  }

  const atFocus =
    zone === "focus" ||
    agent.currentKind === "focus" ||
    agentNearFocusDesk(agent);

  if (!atFocus) return false;

  if (status === "running" || status === "chatting") return true;

  // mock wander before first snapshot — focus room implies deep work
  if (!agent.live && !status && agent.currentKind === "focus") return true;

  return false;
}

function drawHeadphones(gfx) {
  gfx.clear();
  // headband
  gfx.lineStyle(2.5, BAND, 0.95);
  gfx.beginPath();
  gfx.arc(0, -1, 7, Math.PI * 1.05, Math.PI * 1.95, false);
  gfx.strokePath();
  // ear cups
  gfx.fillStyle(CUP, 0.96);
  gfx.fillRoundedRect(-11, -2, 6, 8, 2);
  gfx.fillRoundedRect(5, -2, 6, 8, 2);
  // teal accent dots (active deep-work cue)
  gfx.fillStyle(ACCENT, 0.85);
  gfx.fillCircle(-8, 2, 1.2);
  gfx.fillCircle(8, 2, 1.2);
}

function makeIcon(scene) {
  const gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);
  drawHeadphones(gfx);
  gfx.setScale(ICON_SCALE);
  return gfx;
}

/**
 * One headphones icon per focus running/chatting agent. Follows sprite head.
 */
export class FocusHeadphones {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.enabled = headphonesEnabledFromQuery();
    /** @type {Map<string, { gfx: Phaser.GameObjects.Graphics, visible: boolean }>} */
    this.icons = new Map();
    this._lastKey = "";

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  _ensure(id) {
    let icon = this.icons.get(id);
    if (icon) return icon;
    const cap = Math.max(1, this.scene.agents?.length || 1);
    if (this.icons.size >= cap) return null;
    const gfx = makeIcon(this.scene);
    icon = { gfx, visible: false, agentId: id };
    this.icons.set(id, icon);
    return icon;
  }

  sync() {
    if (!this.enabled) {
      for (const icon of this.icons.values()) {
        icon.gfx.setVisible(false);
        icon.visible = false;
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

      if (!shouldShowFocusHeadphones(agent) || !agent.sprite) {
        const existing = this.icons.get(id);
        if (existing) {
          existing.gfx.setVisible(false);
          existing.visible = false;
        }
        continue;
      }

      const icon = this._ensure(id);
      if (!icon) continue;

      icon.gfx.setPosition(agent.sprite.x + HEAD_OX, agent.sprite.y + HEAD_OY);
      icon.gfx.setVisible(true);
      icon.visible = true;
    }

    for (const [id, icon] of this.icons) {
      if (liveIds.has(id)) continue;
      icon.gfx.destroy();
      this.icons.delete(id);
    }

    this.publish();
  }

  snapshot() {
    const activeIds = [];
    for (const [id, icon] of this.icons) {
      if (!icon.visible) continue;
      activeIds.push(id);
    }
    return {
      enabled: this.enabled,
      count: activeIds.length,
      activeIds,
      depth: DEPTH,
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
      focusHeadphones: snap,
    };
  }

  destroy() {
    for (const icon of this.icons.values()) {
      try {
        icon.gfx.destroy();
      } catch {
        /* ignore */
      }
    }
    this.icons.clear();
    this.publish();
  }
}

export { DEPTH, HEAD_OX, HEAD_OY };
