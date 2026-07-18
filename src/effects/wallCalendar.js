/** Open Desk north-wall soft pixel calendar (local MM/DD + weekday).
 *  `?calendar=0` off · `?calendar=force` smoke (faster/brighter pulse).
 */

import { TILE_SIZE } from "../constants.js";

const TEX_KEY = "fx-wall-calendar";
const GLOW_KEY = "fx-wall-calendar-glow";
/** Above furniture (0) / zone labels (5); below agents (10). Match wallClock. */
const DEPTH = 8;
const FACE_W = 30;
const FACE_H = 26;
/** Day poll — text only changes on local day rollover. */
const TICK_MS = 5000;
/** Soft ADD pulse period (ms). Force shortens. */
const PULSE_MS = 3200;
const FORCE_PULSE_MS = 1800;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * Query: omit = on. `0`/`off`/`false` = never. `force`/`1`/`on`/`true` = smoke.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function wallCalendarModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("calendar");
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

export function wallCalendarEnabledFromQuery() {
  return wallCalendarModeFromQuery().enabled;
}

/**
 * Open Desk north-wall center (between the two digital clocks).
 * @param {Phaser.Scene} scene
 */
export function openDeskCalendarAnchor(scene) {
  const tw = scene.map?.tileWidth ?? TILE_SIZE;
  const th = scene.map?.tileHeight ?? TILE_SIZE;
  const tx = 5.5;
  const ty = 1.12;
  return {
    tx,
    ty,
    x: tx * tw + tw / 2,
    y: ty * th + th / 2,
  };
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Local date line: `MM/DD`. */
export function formatLocalMmDd(date = new Date()) {
  return `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}`;
}

/** Local weekday abbr 일~토. */
export function formatLocalWeekday(date = new Date()) {
  return WEEKDAYS[date.getDay()] ?? "?";
}

/** Combined label for snapshot / smoke. */
export function formatLocalCalendarLabel(date = new Date()) {
  return `${formatLocalMmDd(date)} ${formatLocalWeekday(date)}`;
}

function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function ensureTextures(scene) {
  if (!scene.textures.exists(TEX_KEY)) {
    const g = scene.make.graphics({ add: false });
    // warm paper bezel
    g.fillStyle(0xf2ebe0, 1);
    g.fillRoundedRect(0, 0, FACE_W, FACE_H, 2);
    // soft charcoal rim
    g.lineStyle(1, 0x5a5048, 0.55);
    g.strokeRoundedRect(0.5, 0.5, FACE_W - 1, FACE_H - 1, 2);
    // header bar (tear-off feel)
    g.fillStyle(0xc45c4a, 1);
    g.fillRect(2, 2, FACE_W - 4, 5);
    // page face
    g.fillStyle(0xfffaf3, 1);
    g.fillRect(2, 8, FACE_W - 4, FACE_H - 10);
    // page corner fold hint
    g.fillStyle(0xe8dfd2, 1);
    g.fillTriangle(FACE_W - 8, FACE_H - 2, FACE_W - 2, FACE_H - 8, FACE_W - 2, FACE_H - 2);
    g.generateTexture(TEX_KEY, FACE_W, FACE_H);
    g.destroy();
  }
  if (!scene.textures.exists(GLOW_KEY)) {
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0xfff0c8, 1);
    g.fillEllipse(FACE_W / 2 + 4, FACE_H / 2 + 3, FACE_W + 10, FACE_H + 8);
    g.generateTexture(GLOW_KEY, FACE_W + 8, FACE_H + 6);
    g.destroy();
  }
}

/**
 * Soft pixel wall calendar on Open Desk north wall. Day-driven text + ADD pulse.
 */
export class WallCalendar {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    const mode = wallCalendarModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.anchor = null;
    this.face = null;
    this.glow = null;
    this.dateLabel = null;
    this.dayLabel = null;
    this.dateText = "";
    this.dayText = "";
    this.label = "";
    this._dayKey = "";
    this.active = false;
    this._timer = null;
    this._baseY = 0;
    this.periodMs = this.forced ? FORCE_PULSE_MS : PULSE_MS;

    if (this.enabled) {
      ensureTextures(scene);
      this.anchor = openDeskCalendarAnchor(scene);
      const { x, y } = this.anchor;
      this._baseY = y;

      this.glow = scene.add
        .image(x, y, GLOW_KEY)
        .setOrigin(0.5, 0.5)
        .setDepth(DEPTH - 0.05)
        .setBlendMode("ADD")
        .setAlpha(this.forced ? 0.18 : 0.08)
        .setScrollFactor(1);

      this.face = scene.add
        .image(x, y, TEX_KEY)
        .setOrigin(0.5, 0.5)
        .setDepth(DEPTH)
        .setScrollFactor(1);

      this.dateLabel = scene.add
        .text(x, y - 2, "--/--", {
          fontFamily: "Consolas, Segoe UI, monospace",
          fontSize: "8px",
          color: "#3a342e",
          align: "center",
        })
        .setOrigin(0.5, 0.5)
        .setDepth(DEPTH + 0.1)
        .setScrollFactor(1);

      this.dayLabel = scene.add
        .text(x, y + 7, "-", {
          fontFamily: "Segoe UI, sans-serif",
          fontSize: "8px",
          color: "#8a4038",
          align: "center",
        })
        .setOrigin(0.5, 0.5)
        .setDepth(DEPTH + 0.1)
        .setScrollFactor(1);

      this.active = true;
      this.refreshDate(true);
      this._timer = scene.time.addEvent({
        delay: TICK_MS,
        loop: true,
        callback: () => this.refreshDate(false),
      });
    }

    scene.events.once("shutdown", () => this.destroy());
    this.publish();
  }

  /**
   * @param {boolean} [force]
   */
  refreshDate(force = false) {
    if (!this.enabled || !this.active) return;
    const now = new Date();
    const key = dayKey(now);
    if (!force && key === this._dayKey) return;
    this._dayKey = key;
    this.dateText = formatLocalMmDd(now);
    this.dayText = formatLocalWeekday(now);
    this.label = formatLocalCalendarLabel(now);
    this.dateLabel?.setText(this.dateText);
    this.dayLabel?.setText(this.dayText);
    this.publish();
  }

  /** Re-read query / day (TOD lighting path). */
  sync() {
    if (!this.enabled || !this.active) return;
    this.refreshDate(false);
  }

  /**
   * Soft ADD glow pulse + tiny page-corner bob.
   * @param {number} time
   * @param {number} [_delta]
   */
  update(time, _delta) {
    if (!this.enabled || !this.active) return;
    const t = (time % this.periodMs) / this.periodMs;
    const wave = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
    const glowLo = this.forced ? 0.12 : 0.05;
    const glowHi = this.forced ? 0.32 : 0.14;
    this.glow?.setAlpha(glowLo + (glowHi - glowLo) * wave);

    // page corner soft bob (~0.4px)
    const bob = Math.sin(t * Math.PI * 2) * (this.forced ? 0.7 : 0.35);
    const y = this._baseY + bob;
    this.face?.setY(y);
    this.glow?.setY(y);
    this.dateLabel?.setY(y - 2);
    this.dayLabel?.setY(y + 7);
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      active: this.active,
      date: this.dateText || null,
      weekday: this.dayText || null,
      label: this.label || null,
      depth: DEPTH,
      periodMs: this.periodMs,
      anchor: this.anchor
        ? {
            x: this.anchor.x,
            y: this.anchor.y,
            tx: this.anchor.tx,
            ty: this.anchor.ty,
          }
        : null,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      wallCalendar: this.snapshot(),
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
    for (const obj of [this.glow, this.face, this.dateLabel, this.dayLabel]) {
      try {
        obj?.destroy();
      } catch {
        /* ignore */
      }
    }
    this.glow = null;
    this.face = null;
    this.dateLabel = null;
    this.dayLabel = null;
    this.anchor = null;
    this.active = false;
  }
}
