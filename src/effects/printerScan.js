/** Idle GID-36 printer scan bar — top→bottom ADD sweep. `?printerscan=0` off. */

import { findPrinterTile, PRINTER_GID } from "./officeEvents.js";

/** Above furniture / steam (9); below status burst (11). */
const DEPTH = 10;
const SWEEP_MS = 2500;
const BAR_W = 24;
const BAR_H = 3;
const BAR_CYAN = 0x88eeff;
const BAR_WHITE = 0xffffff;

/**
 * Query: omit = on. `0`/`off`/`false` = never.
 * @returns {boolean}
 */
export function printerScanEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("printerscan");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

function tileBounds(scene, tx, ty) {
  const tw = scene.map?.tileWidth ?? 32;
  const th = scene.map?.tileHeight ?? 32;
  return {
    tx,
    ty,
    cx: tx * tw + tw / 2,
    cy: ty * th + th / 2,
    left: tx * tw,
    top: ty * th,
    w: tw,
    h: th,
  };
}

/**
 * Ambient cyan/white scan bar on the open-desk printer tile.
 * Pauses while officeEvents gather (printer_jam, standup, etc.) runs.
 */
export class PrinterScan {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.enabled = printerScanEnabledFromQuery();
    this.anchor = null;
    this.bounds = null;
    this.phase = 0;
    this.active = false;
    this.paused = false;
    this._lastKey = "";

    if (this.enabled) {
      const pt = findPrinterTile(scene);
      this.anchor = pt;
      this.bounds = tileBounds(scene, pt.x, pt.y);
    }

    this.gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);
    this.gfx.setBlendMode("ADD");

    scene.events.once("shutdown", () => this.destroy());
    this.update(scene.time.now, 0);
  }

  isPaused() {
    return this.scene.officeEvents?.isGathering?.() ?? false;
  }

  /**
   * @param {number} _now
   * @param {number} [delta=16]
   */
  update(_now, delta = 16) {
    if (!this.enabled || !this.bounds) {
      this.active = false;
      this.paused = false;
      this.gfx.clear();
      this.gfx.setVisible(false);
      this.publish();
      return;
    }

    this.paused = this.isPaused();
    if (this.paused) {
      this.active = false;
      this.gfx.clear();
      this.gfx.setVisible(false);
      this.publish();
      return;
    }

    const dt = typeof delta === "number" && delta > 0 ? delta : 16;
    this.phase = (this.phase + dt / SWEEP_MS) % 1;
    this.active = true;
    this._draw();
    this.publish();
  }

  _draw() {
    const b = this.bounds;
    const y = b.top + this.phase * b.h;
    const g = this.gfx;
    g.clear();
    g.setVisible(true);

    const x0 = b.cx - BAR_W / 2;
    g.fillStyle(BAR_CYAN, 0.14);
    g.fillRect(x0, y - BAR_H * 2, BAR_W, BAR_H * 5);

    g.fillStyle(BAR_CYAN, 0.5);
    g.fillRect(x0, y - BAR_H / 2, BAR_W, BAR_H);

    g.fillStyle(BAR_WHITE, 0.38);
    g.fillRect(b.cx - BAR_W * 0.28, y - 1, BAR_W * 0.56, 2);
  }

  snapshot() {
    return {
      enabled: this.enabled,
      active: this.active,
      paused: this.paused,
      phase: this.phase,
      sweepMs: SWEEP_MS,
      printerGid: PRINTER_GID,
      printerTile: this.anchor,
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
      printerScan: snap,
    };
  }

  destroy() {
    try {
      this.gfx.destroy();
    } catch {
      /* ignore */
    }
    this.active = false;
    this.publish();
  }
}

export { DEPTH, SWEEP_MS, PRINTER_GID };
