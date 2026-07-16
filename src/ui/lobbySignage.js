/** Lobby wall TV — kanban counts from lastSnapshot. `?signage=0` disables. */

import { parseKanbanStats } from "../kanbanPanel.js";
import { TILE_SIZE } from "../constants.js";

const TEX_KEY = "lobby-signage-tv";
/** Above furniture (0); below agent sprites (10). */
const DEPTH = 8;
const REFRESH_MS = 3000;
const TV_W = 72;
const TV_H = 48;

function parseSignageEnabled() {
  if (typeof location === "undefined") return true;
  try {
    const q = new URLSearchParams(location.search).get("signage");
    return q !== "0" && q !== "false" && q !== "off";
  } catch {
    return true;
  }
}

/**
 * Fixed world point: lobby AABB center X, north-wall Y.
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tileX: number, tileY: number }}
 */
function lobbySignageAnchor(scene) {
  const tw = scene.map?.tileWidth ?? TILE_SIZE;
  const th = scene.map?.tileHeight ?? TILE_SIZE;
  const lob = scene.waypoints?.lobby;
  const xMin = Number.isFinite(lob?.xMin) ? lob.xMin : 14;
  const xMax = Number.isFinite(lob?.xMax) ? lob.xMax : 25;
  const yMin = Number.isFinite(lob?.yMin) ? lob.yMin : 26;
  const tileX = (xMin + xMax) / 2;
  // north wall of lobby walk tiles — slightly above floor strip
  const tileY = yMin - 0.55;
  return {
    x: tileX * tw + tw / 2,
    y: tileY * th + th / 2,
    tileX,
    tileY,
  };
}

function formatSignageLines(snapshot) {
  const stats = parseKanbanStats(snapshot?.stats?.raw);
  const agents = snapshot?.agents ?? [];
  const idle = agents.filter((a) => a.status === "idle").length;
  const done = stats.done ?? 0;
  return {
    line1: `R ${stats.running}  B ${stats.blocked}`,
    line2: `Q ${stats.ready}  Rev ${stats.review}`,
    running: stats.running,
    blocked: stats.blocked,
    ready: stats.ready,
    review: stats.review,
    idle,
    done,
  };
}

function ensureTvTexture(scene) {
  if (scene.textures.exists(TEX_KEY)) return;
  const g = scene.make.graphics({ add: false });
  // bezel
  g.fillStyle(0x1a1e24, 1);
  g.fillRoundedRect(0, 0, TV_W, TV_H, 3);
  // screen
  g.fillStyle(0x0b1520, 1);
  g.fillRoundedRect(4, 4, TV_W - 8, TV_H - 14, 2);
  // soft cyan glow edge
  g.lineStyle(1, 0x3a8ec8, 0.55);
  g.strokeRoundedRect(4.5, 4.5, TV_W - 9, TV_H - 15, 2);
  // stand lip
  g.fillStyle(0x2a3038, 1);
  g.fillRect(TV_W / 2 - 10, TV_H - 8, 20, 3);
  g.fillStyle(0x3a424c, 1);
  g.fillRect(TV_W / 2 - 16, TV_H - 5, 32, 3);
  g.generateTexture(TEX_KEY, TV_W, TV_H);
  g.destroy();
}

export class LobbySignage {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.enabled = parseSignageEnabled();
    this.anchor = null;
    this.tv = null;
    this.title = null;
    this.line1 = null;
    this.line2 = null;
    this.lastKey = "";
    this.counts = { running: 0, blocked: 0, idle: 0, done: 0 };
    this._timer = null;
    if (!this.enabled) return;

    ensureTvTexture(scene);
    this.anchor = lobbySignageAnchor(scene);
    const { x, y } = this.anchor;

    this.tv = scene.add
      .image(x, y, TEX_KEY)
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH)
      .setScrollFactor(1);

    this.title = scene.add
      .text(x, y - 12, "KANBAN", {
        fontFamily: "Consolas, Segoe UI, monospace",
        fontSize: "9px",
        color: "#6ec8f0",
        align: "center",
      })
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH + 0.1)
      .setScrollFactor(1);

    this.line1 = scene.add
      .text(x, y - 1, "R 0  B 0", {
        fontFamily: "Consolas, Segoe UI, monospace",
        fontSize: "10px",
        color: "#e8f4ff",
        align: "center",
      })
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH + 0.1)
      .setScrollFactor(1);

    this.line2 = scene.add
      .text(x, y + 10, "Q 0  Rev 0", {
        fontFamily: "Consolas, Segoe UI, monospace",
        fontSize: "10px",
        color: "#b0c4d8",
        align: "center",
      })
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH + 0.1)
      .setScrollFactor(1);

    this._timer = scene.time.addEvent({
      delay: REFRESH_MS,
      loop: true,
      callback: () => this.refreshFromScene(),
    });

    if (scene.lastSnapshot) this.updateFromSnapshot(scene.lastSnapshot);
  }

  refreshFromScene() {
    const snap = this.scene?.lastSnapshot;
    if (snap) this.updateFromSnapshot(snap);
  }

  /** Same source as the DOM kanban panel (`lastSnapshot`). */
  updateFromSnapshot(snapshot) {
    if (!this.enabled || !this.line1 || !snapshot) return;
    const fmt = formatSignageLines(snapshot);
    const key = `${fmt.line1}|${fmt.line2}`;
    this.counts = {
      running: fmt.running,
      blocked: fmt.blocked,
      ready: fmt.ready,
      review: fmt.review,
      idle: fmt.idle,
      done: fmt.done,
    };
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.line1.setText(fmt.line1);
    this.line2.setText(fmt.line2);
  }

  snapshot() {
    return {
      enabled: this.enabled,
      text: this.lastKey ? this.lastKey.replace("|", " · ") : null,
      counts: { ...this.counts },
      x: this.tv?.x ?? this.anchor?.x ?? null,
      y: this.tv?.y ?? this.anchor?.y ?? null,
      tileX: this.anchor?.tileX ?? null,
      tileY: this.anchor?.tileY ?? null,
      depth: DEPTH,
      refreshMs: REFRESH_MS,
    };
  }

  destroy() {
    this._timer?.remove?.(false);
    this._timer = null;
    this.tv?.destroy();
    this.title?.destroy();
    this.line1?.destroy();
    this.line2?.destroy();
    this.tv = null;
    this.title = null;
    this.line1 = null;
    this.line2 = null;
  }
}

export {
  parseSignageEnabled,
  lobbySignageAnchor,
  formatSignageLines,
  TEX_KEY,
  DEPTH,
  REFRESH_MS,
};
