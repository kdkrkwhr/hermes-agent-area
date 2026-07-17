/** Tiny scrolling pseudo-code on desk monitors for running/chatting/focus. */

import { resolveDeskGlowKind, deskFxEnabledFromQuery } from "./deskGlow.js";

/** Near desk glow(11); under nameplate(20)/bubble(21). */
const DEPTH = 12;
const PANEL_W = 11;
const PANEL_H = 14;
const LINE_H = 4;
const VISIBLE_LINES = 3;
const SCROLL_MS = 420;
const CURSOR_MS = 380;
const TEX_KEY = "fx-monitor-code-bg";

const LINE_COLORS = {
  running: 0x5ee0c8,
  chatting: 0x88aaff,
  focus: 0xffb347,
};

/** Fake code rows as [dash lengths] — shared across agents. */
const CODE_ROWS = [
  [5, 2, 3],
  [2, 6],
  [4, 1, 4],
  [7],
  [3, 3, 2],
  [1, 5, 2],
  [6, 2],
  [2, 2, 4],
];

/** `?codescroll=0` disables. Also off when `?deskfx=0`. Default on. */
export function codeScrollEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    if (!deskFxEnabledFromQuery()) return false;
    const v = new URLSearchParams(location.search).get("codescroll");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

/** running/chatting/focus only — blocked keeps glow, no scroll. */
export function shouldShowMonitorCode(agent) {
  const kind = resolveDeskGlowKind(agent);
  return kind === "running" || kind === "chatting" || kind === "focus";
}

function ensureSharedTexture(scene) {
  if (scene.textures.exists(TEX_KEY)) return TEX_KEY;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0x0a1218, 0.92);
  g.fillRect(0, 0, PANEL_W, PANEL_H);
  g.lineStyle(1, 0x1e2a36, 0.85);
  g.strokeRect(0, 0, PANEL_W, PANEL_H);
  g.generateTexture(TEX_KEY, PANEL_W, PANEL_H);
  g.destroy();
  return TEX_KEY;
}

/** Facing-aware offset near desk glow; nudged down so bubbles/progress clear. */
export function monitorCodeOffset(agent) {
  const dir = agent?.lastDir || "down";
  let ox = 7;
  let oy = -8;
  if (dir === "left") {
    ox = -12;
    oy = -8;
  } else if (dir === "right") {
    ox = 12;
    oy = -8;
  } else if (dir === "up") {
    ox = 0;
    oy = -16;
  }
  return { ox, oy };
}

function drawLines(gfx, kind, scrollPx, cursorOn) {
  gfx.clear();
  const color = LINE_COLORS[kind] ?? LINE_COLORS.running;
  const rowCount = CODE_ROWS.length;
  const period = rowCount * LINE_H;
  const base = ((scrollPx % period) + period) % period;

  for (let i = 0; i < VISIBLE_LINES + 1; i++) {
    const y = i * LINE_H - (base % LINE_H) + 1;
    if (y < 0 || y > PANEL_H - 2) continue;
    const rowIdx = (Math.floor(base / LINE_H) + i) % rowCount;
    const dashes = CODE_ROWS[rowIdx];
    let x = 1;
    gfx.fillStyle(color, 0.75);
    for (const len of dashes) {
      const w = Math.min(len, PANEL_W - 2 - x);
      if (w > 0) gfx.fillRect(x, y, w, 2);
      x += len + 1;
      if (x >= PANEL_W - 1) break;
    }
  }

  if (cursorOn) {
    gfx.fillStyle(color, 0.95);
    gfx.fillRect(PANEL_W - 3, PANEL_H - 4, 1, 3);
  }
}

function makePanel(scene) {
  ensureSharedTexture(scene);
  const root = scene.add.container(0, 0).setDepth(DEPTH).setVisible(false);
  const bg = scene.add.image(0, 0, TEX_KEY).setOrigin(0.5, 0.5);
  const lines = scene.add.graphics();
  lines.setPosition(-PANEL_W / 2, -PANEL_H / 2);
  root.add([bg, lines]);
  return { root, bg, lines, scroll: Math.random() * CODE_ROWS.length * LINE_H };
}

/**
 * One tiny code panel per running/chatting/focus agent. Shared bg texture.
 */
export class MonitorCode {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.enabled = codeScrollEnabledFromQuery();
    /** @type {Map<string, object>} */
    this.panels = new Map();
    this._lastKey = "";

    scene.events.once("shutdown", () => this.destroy());
    this.sync(0);
  }

  _ensure(id) {
    let panel = this.panels.get(id);
    if (panel) return panel;
    const cap = Math.max(1, this.scene.agents?.length || 1);
    if (this.panels.size >= cap) return null;
    panel = makePanel(this.scene);
    panel.visible = false;
    panel.kind = "running";
    panel.agentId = id;
    this.panels.set(id, panel);
    return panel;
  }

  /**
   * @param {number} [delta=16]
   */
  sync(delta = 16) {
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
    const dt = typeof delta === "number" && delta > 0 ? delta : 16;

    for (const agent of agents) {
      const id = agent?.def?.id;
      if (!id) continue;
      liveIds.add(id);

      if (!shouldShowMonitorCode(agent) || !agent.sprite) {
        const existing = this.panels.get(id);
        if (existing) {
          existing.root.setVisible(false);
          existing.visible = false;
        }
        continue;
      }

      const panel = this._ensure(id);
      if (!panel) continue;

      const kind = resolveDeskGlowKind(agent) || "running";
      panel.kind = kind;
      panel.scroll += (dt / SCROLL_MS) * LINE_H;
      const cursorOn = Math.floor(this.scene.time.now / CURSOR_MS) % 2 === 0;
      drawLines(panel.lines, kind, panel.scroll, cursorOn);

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
    const kinds = {};
    for (const [id, panel] of this.panels) {
      if (!panel.visible) continue;
      activeIds.push(id);
      kinds[id] = panel.kind;
    }
    return {
      enabled: this.enabled,
      count: activeIds.length,
      activeIds,
      kinds,
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
      monitorCode: snap,
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

export { DEPTH, PANEL_W, PANEL_H, TEX_KEY };
