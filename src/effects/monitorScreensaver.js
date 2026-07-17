/** Idle/break desk monitor screensaver — dim bounce logo (visual only).
 *  Counterpart to monitorCode (running/chatting/focus). Code scroll wins when busy.
 *  `?screensaver=0` off · `?screensaver=force` smoke-force idle@desk.
 */

import { resolveDeskGlowKind } from "./deskGlow.js";
import {
  monitorCodeOffset,
  PANEL_W,
  PANEL_H,
  shouldShowMonitorCode,
} from "./monitorCode.js";
import { agentIsMoving, agentSeatedAtDesk } from "./rubberDuck.js";

/** Same depth as monitorCode — only one panel kind visible at a time. */
const DEPTH = 12;
const TEX_KEY = "fx-monitor-ss-bg";
const BOUNCE_MS = 2200;
const LOGO_W = 4;
const LOGO_H = 3;
const PAD = 2;

/**
 * Query: omit = on. `0`/`off`/`false` = never. `1`/`true`/`on`/`force` = force smoke.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function screensaverModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("screensaver");
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

export function screensaverEnabledFromQuery() {
  return screensaverModeFromQuery().enabled;
}

/** idle / break / offline (sleep) — not busy desk glow kinds. */
export function isScreensaverStatus(agent) {
  if (!agent) return false;
  if (shouldShowMonitorCode(agent)) return false;
  const glow = resolveDeskGlowKind(agent);
  if (glow === "running" || glow === "chatting" || glow === "focus") return false;

  const status = agent.serverStatus;
  if (status === "idle" || status === "break") return true;
  if (status === "offline") return true;
  if (status === "running" || status === "chatting" || status === "blocked") {
    return false;
  }
  if (status === "review" || status === "ready" || status === "todo") return false;

  const kind = agent.getEffectKind?.();
  if (kind === "idle" || kind === "sleep") return true;
  if (agent.currentKind === "break" || agent.currentKind === "sleep") return true;
  return false;
}

/**
 * Show when idle/break/offline + seated at desk (not moving).
 * Force: any screensaver-status agent (smoke), still hide while pathing / when code wins.
 */
export function shouldShowScreensaver(agent, forced = false) {
  if (!agent?.sprite) return false;
  if (shouldShowMonitorCode(agent)) return false;
  if (!isScreensaverStatus(agent)) return false;
  if (agentIsMoving(agent)) return false;
  if (forced) return true;
  return agentSeatedAtDesk(agent);
}

function ensureSharedTexture(scene) {
  if (scene.textures.exists(TEX_KEY)) return TEX_KEY;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  // dimmer than code panel — "asleep" monitor
  g.fillStyle(0x060a10, 0.94);
  g.fillRect(0, 0, PANEL_W, PANEL_H);
  g.lineStyle(1, 0x152028, 0.7);
  g.strokeRect(0, 0, PANEL_W, PANEL_H);
  g.generateTexture(TEX_KEY, PANEL_W, PANEL_H);
  g.destroy();
  return TEX_KEY;
}

/** Soft bounce logo + faint slip dots inside the panel. */
function drawScreensaver(gfx, timeMs) {
  gfx.clear();
  const t = timeMs / BOUNCE_MS;
  const phaseX = (Math.sin(t * Math.PI * 2) + 1) / 2;
  const phaseY = (Math.sin(t * Math.PI * 2 * 0.73 + 1.1) + 1) / 2;
  const maxX = PANEL_W - LOGO_W - PAD * 2;
  const maxY = PANEL_H - LOGO_H - PAD * 2;
  const lx = PAD + phaseX * maxX;
  const ly = PAD + phaseY * maxY;

  // faint slip / clock dots
  gfx.fillStyle(0x2a4a56, 0.35);
  gfx.fillRect(2, 2, 1, 1);
  gfx.fillRect(PANEL_W - 3, 2, 1, 1);
  gfx.fillRect(2, PANEL_H - 3, 1, 1);

  // dim bounce logo (rounded-ish block)
  gfx.fillStyle(0x3a7a88, 0.55);
  gfx.fillRect(lx, ly, LOGO_W, LOGO_H);
  gfx.fillStyle(0x5ee0c8, 0.28);
  gfx.fillRect(lx + 1, ly + 1, LOGO_W - 2, 1);
}

function makePanel(scene) {
  ensureSharedTexture(scene);
  const root = scene.add.container(0, 0).setDepth(DEPTH).setVisible(false);
  const bg = scene.add.image(0, 0, TEX_KEY).setOrigin(0.5, 0.5);
  const logo = scene.add.graphics();
  logo.setPosition(-PANEL_W / 2, -PANEL_H / 2);
  root.add([bg, logo]);
  return { root, bg, logo, visible: false };
}

/**
 * One screensaver panel per idle/break/offline desk agent.
 */
export class MonitorScreensaver {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    const mode = screensaverModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    /** @type {Map<string, object>} */
    this.panels = new Map();
    this._lastKey = "";

    scene.events.once("shutdown", () => this.destroy());
    this.sync(scene.time?.now ?? 0);
  }

  _ensure(id) {
    let panel = this.panels.get(id);
    if (panel) return panel;
    const cap = Math.max(1, this.scene.agents?.length || 1);
    if (this.panels.size >= cap) return null;
    panel = makePanel(this.scene);
    panel.agentId = id;
    this.panels.set(id, panel);
    return panel;
  }

  /**
   * @param {number} [timeMs]
   */
  sync(timeMs = 0) {
    if (!this.enabled) {
      for (const panel of this.panels.values()) {
        panel.root.setVisible(false);
        panel.visible = false;
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

      if (!shouldShowScreensaver(agent, this.forced)) {
        const existing = this.panels.get(id);
        if (existing) {
          existing.root.setVisible(false);
          existing.visible = false;
        }
        continue;
      }

      const panel = this._ensure(id);
      if (!panel) continue;

      drawScreensaver(panel.logo, t);
      const { ox, oy } = monitorCodeOffset(agent);
      panel.root.setPosition(agent.sprite.x + ox, agent.sprite.y + oy);
      panel.root.setVisible(true);
      panel.visible = true;
    }

    for (const [id, panel] of this.panels) {
      if (liveIds.has(id)) continue;
      panel.root.destroy();
      this.panels.delete(id);
    }

    this.publish();
  }

  snapshot() {
    const activeIds = [];
    for (const [id, panel] of this.panels) {
      if (!panel.visible) continue;
      activeIds.push(id);
    }
    return {
      enabled: this.enabled,
      forced: this.forced,
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
      monitorScreensaver: snap,
    };
  }

  destroy() {
    for (const panel of this.panels.values()) {
      try {
        panel.root.destroy();
      } catch {
        /* ignore */
      }
    }
    this.panels.clear();
    this.publish();
  }
}

export { DEPTH, TEX_KEY, BOUNCE_MS, LOGO_W, LOGO_H };
