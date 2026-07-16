/** Open Desk north-wall digital clocks (local HH:MM). Always on; `?clock=0` off. */

import { TILE_SIZE } from "../constants.js";

const TEX_KEY = "fx-wall-clock";
/** Above furniture (0) / zone labels (5); below agents (10). */
const DEPTH = 8;
const FACE_W = 28;
const FACE_H = 18;
/** Minute poll — text only changes on minute rollover. */
const TICK_MS = 1000;

/**
 * Query: omit = on. `0`/`off`/`false` = never.
 * Independent of TOD lighting.
 * @returns {boolean}
 */
export function wallClockEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("clock");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

/**
 * Fixed Open Desk north-wall anchors (above desk row y=3).
 * Two stations: left (tx~3.5) + right (tx~7.5).
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number }[]}
 */
export function openDeskClockAnchors(scene) {
  const tw = scene.map?.tileWidth ?? TILE_SIZE;
  const th = scene.map?.tileHeight ?? TILE_SIZE;
  // north wall strip of work1 carpet — empty above monitors
  const spots = [
    { tx: 3.5, ty: 1.15 },
    { tx: 7.5, ty: 1.15 },
  ];
  return spots.map((s) => ({
    tx: s.tx,
    ty: s.ty,
    x: s.tx * tw + tw / 2,
    y: s.ty * th + th / 2,
  }));
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Local wall time HH:MM. */
export function formatLocalHhMm(date = new Date()) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function ensureClockTexture(scene) {
  if (scene.textures.exists(TEX_KEY)) return;
  const g = scene.make.graphics({ add: false });
  // cool charcoal bezel
  g.fillStyle(0x2a3340, 1);
  g.fillRoundedRect(0, 0, FACE_W, FACE_H, 3);
  // soft cyan rim
  g.lineStyle(1, 0x5a8aaa, 0.7);
  g.strokeRoundedRect(0.5, 0.5, FACE_W - 1, FACE_H - 1, 3);
  // LCD inset
  g.fillStyle(0x0e1822, 1);
  g.fillRoundedRect(3, 3, FACE_W - 6, FACE_H - 6, 2);
  g.generateTexture(TEX_KEY, FACE_W, FACE_H);
  g.destroy();
}

/**
 * 1–2 wall clocks on Open Desk north wall. Minute-driven HH:MM text.
 */
export class WallClock {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.enabled = wallClockEnabledFromQuery();
    this.anchors = [];
    this.faces = [];
    this.labels = [];
    this.timeText = "";
    this.active = false;
    this._timer = null;

    if (this.enabled) {
      ensureClockTexture(scene);
      this.anchors = openDeskClockAnchors(scene);
      for (const a of this.anchors) {
        const face = scene.add
          .image(a.x, a.y, TEX_KEY)
          .setOrigin(0.5, 0.5)
          .setDepth(DEPTH)
          .setScrollFactor(1);
        const label = scene.add
          .text(a.x, a.y, "--:--", {
            fontFamily: "Consolas, Segoe UI, monospace",
            fontSize: "9px",
            color: "#7ec8e0",
            align: "center",
          })
          .setOrigin(0.5, 0.5)
          .setDepth(DEPTH + 0.1)
          .setScrollFactor(1);
        this.faces.push(face);
        this.labels.push(label);
      }
      this.active = this.faces.length > 0;
      this.refreshTime(true);
      this._timer = scene.time.addEvent({
        delay: TICK_MS,
        loop: true,
        callback: () => this.refreshTime(false),
      });
    }

    scene.events.once("shutdown", () => this.destroy());
    this.publish();
  }

  /**
   * @param {boolean} [force]
   */
  refreshTime(force = false) {
    if (!this.enabled || !this.active) return;
    const next = formatLocalHhMm();
    if (!force && next === this.timeText) return;
    this.timeText = next;
    for (const label of this.labels) label.setText(next);
    this.publish();
  }

  snapshot() {
    return {
      enabled: this.enabled,
      active: this.active,
      time: this.timeText || null,
      clocks: this.anchors.map((a) => ({
        x: a.x,
        y: a.y,
        tx: a.tx,
        ty: a.ty,
      })),
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      wallClock: this.snapshot(),
    };
  }

  destroy() {
    if (this._timer) {
      try {
        this._timer.remove(false);
      } catch {
        /* ignore */
      }
      this._timer = null;
    }
    for (const face of this.faces) {
      try {
        face.destroy();
      } catch {
        /* ignore */
      }
    }
    for (const label of this.labels) {
      try {
        label.destroy();
      } catch {
        /* ignore */
      }
    }
    this.faces = [];
    this.labels = [];
    this.anchors = [];
    this.active = false;
  }
}
