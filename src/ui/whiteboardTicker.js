/** World-space kanban mini-ticker on War Room whiteboard. `?ticker=0` disables. */

import { parseKanbanStats } from "../kanbanPanel.js";
import { TILE_SIZE } from "../constants.js";

const WHITEBOARD_GID = 15;
/** Above furniture (0) / zone labels (5); below agent sprites (10). */
const DEPTH = 8;
/** Prefer boards near meeting waypoint (skip distant gid-15 desks). */
const MEETING_RADIUS = 10;

function parseTickerEnabled() {
  if (typeof location === "undefined") return true;
  const q = new URLSearchParams(location.search).get("ticker");
  return q !== "0" && q !== "false" && q !== "off";
}

/**
 * Centroid of furniture whiteboard tiles near the War Room meeting spot.
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tiles: number }}
 */
function findWhiteboardAnchor(scene) {
  const meet = scene.waypoints?.meeting || { x: 18, y: 9 };
  const layer = scene.furniture;
  const tw = scene.map?.tileWidth ?? TILE_SIZE;
  const th = scene.map?.tileHeight ?? TILE_SIZE;
  const hits = [];

  if (layer?.getTileAt && scene.map) {
    for (let ty = 0; ty < scene.map.height; ty++) {
      for (let tx = 0; tx < scene.map.width; tx++) {
        const tile = layer.getTileAt(tx, ty);
        if (!tile || tile.index !== WHITEBOARD_GID) continue;
        const dist = Math.hypot(tx - meet.x, ty - meet.y);
        if (dist <= MEETING_RADIUS) hits.push({ tx, ty });
      }
    }
  }

  if (!hits.length) {
    // fallback: wall board above meeting table (office-map furniture gid 15)
    return {
      x: 17.5 * tw + tw / 2,
      y: 5 * th + th / 2,
      tiles: 0,
    };
  }

  const sx = hits.reduce((s, h) => s + h.tx, 0) / hits.length;
  const sy = hits.reduce((s, h) => s + h.ty, 0) / hits.length;
  return {
    x: sx * tw + tw / 2,
    y: sy * th + th / 2 - 2,
    tiles: hits.length,
  };
}

function formatTickerLine(snapshot) {
  const stats = parseKanbanStats(snapshot?.stats?.raw);
  return `R ${stats.running} · B ${stats.blocked} · Q ${stats.ready} · Rev ${stats.review}`;
}

export class WhiteboardTicker {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.enabled = parseTickerEnabled();
    this.label = null;
    this.anchor = null;
    this.lastText = "";
    if (!this.enabled) return;

    this.anchor = findWhiteboardAnchor(scene);
    this.label = scene.add
      .text(this.anchor.x, this.anchor.y, "R 0 · B 0 · Q 0 · Rev 0", {
        fontFamily: "Consolas, Segoe UI, monospace",
        fontSize: "12px",
        color: "#d8e8f8",
        stroke: "#0b1016",
        strokeThickness: 4,
        align: "center",
      })
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH)
      .setScrollFactor(1);
  }

  /** Refresh counts from the same snapshot the kanban panel uses. */
  updateFromSnapshot(snapshot) {
    if (!this.enabled || !this.label || !snapshot) return;
    const text = formatTickerLine(snapshot);
    if (text === this.lastText) return;
    this.lastText = text;
    this.label.setText(text);
  }

  snapshot() {
    return {
      enabled: this.enabled,
      text: this.lastText || null,
      x: this.label?.x ?? this.anchor?.x ?? null,
      y: this.label?.y ?? this.anchor?.y ?? null,
      tiles: this.anchor?.tiles ?? 0,
    };
  }

  destroy() {
    this.label?.destroy();
    this.label = null;
  }
}

export { parseTickerEnabled, findWhiteboardAnchor, formatTickerLine, WHITEBOARD_GID };
