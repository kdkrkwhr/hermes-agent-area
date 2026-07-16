/** War Room projector beam + slide flicker. `?projector=0` off, `?projector=1` force. */

import { TILE_SIZE } from "../constants.js";

/** Above rain (4); below lighting overlay (6) / agents (10). */
const DEPTH = 5;
/** Cool projector shaft (ADD). */
const BEAM_COLOR = 0xb8d8ff;
/** Soft slide rectangle on the board face. */
const SLIDE_COLOR = 0xe8f4ff;
const WHITEBOARD_GID = 15;
const MEETING_RADIUS = 10;
/** Fade in/out when trigger starts/ends. */
const FADE_MS = 700;
/** Base beam alpha (x layer weights). */
const ALPHA_BASE = 0.14;
/** Half-width at the board (px). Tip narrower toward table. */
const BEAM_HALF = 22;

/**
 * Query: omit = auto (standup / meeting≥2). `0`/`off`/`false` = never.
 * `1`/`on`/`true`/`force` = always on.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function projectorModeFromQuery() {
  if (typeof location === "undefined") return { enabled: true, forced: false };
  try {
    const v = new URLSearchParams(location.search).get("projector");
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

/**
 * Centroid of furniture whiteboard tiles near the War Room meeting spot.
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tiles: number }}
 */
function findBoardAnchor(scene) {
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

function meetingWorld(scene) {
  const m = scene.waypoints?.meeting || { x: 18, y: 9 };
  const tw = scene.map?.tileWidth ?? TILE_SIZE;
  const th = scene.map?.tileHeight ?? TILE_SIZE;
  return { x: m.x * tw + tw / 2, y: m.y * th + th / 2, tx: m.x, ty: m.y };
}

function agentTile(agent) {
  return agent?.tilePos?.() ?? null;
}

/** Agents standing in the meeting ring (±pad tiles). */
function countAgentsInMeeting(scene, pad = 2) {
  const m = scene.waypoints?.meeting || { x: 18, y: 9 };
  let n = 0;
  for (const a of scene.agents || []) {
    const t = agentTile(a);
    if (!t) continue;
    if (Math.abs(t.x - m.x) <= pad && Math.abs(t.y - m.y) <= pad) n += 1;
  }
  return n;
}

function standupGathering(scene) {
  const oe = scene.officeEvents;
  if (!oe) return false;
  // Prefer sticky flag — ship_it can overwrite lastEvent mid-gather.
  if (oe._standupGathering) return true;
  if (!oe.isGathering?.()) return false;
  return oe.lastEvent === "standup";
}

/**
 * Diagonal ADD cone from War Room whiteboard toward the meeting table,
 * plus a weak slide-face flicker while active.
 */
export class MeetingProjector {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    const mode = projectorModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.active = false;
    this.reason = null;
    this.meetingCount = 0;
    this.fade = 0;
    this._lastPublish = "";
    this.flickerPeriod = 500 + Math.random() * 1500;
    this.slidePhase = Math.random() * Math.PI * 2;
    this.board = this.enabled ? findBoardAnchor(scene) : null;
    this.meetPx = this.enabled ? meetingWorld(scene) : null;

    this.beamGfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);
    this.beamGfx.setBlendMode("ADD");
    this.slideGfx = scene.add.graphics().setDepth(DEPTH + 0.5).setVisible(false);
    this.slideGfx.setBlendMode("ADD");

    scene.events.once("shutdown", () => this.destroy());
    this.publish();
  }

  /**
   * @returns {{ want: boolean, reason: string|null }}
   */
  shouldBeActive() {
    if (!this.enabled || !this.board) {
      return { want: false, reason: null };
    }
    if (this.forced) return { want: true, reason: "force" };
    if (standupGathering(this.scene)) {
      return { want: true, reason: "standup" };
    }
    this.meetingCount = countAgentsInMeeting(this.scene);
    if (this.meetingCount >= 2) {
      return { want: true, reason: "meeting" };
    }
    return { want: false, reason: null };
  }

  /**
   * @param {number} time
   * @param {number} [delta]
   */
  update(time, delta = 16) {
    if (!this.enabled || !this.board) {
      if (this.active || this.fade > 0) {
        this.active = false;
        this.fade = 0;
        this.reason = null;
        this.beamGfx.clear().setVisible(false);
        this.slideGfx.clear().setVisible(false);
        this.publish();
      }
      return;
    }

    const { want, reason } = this.shouldBeActive();
    if (want) this.reason = reason;
    else if (this.fade <= 0) this.reason = null;

    if (!want) {
      this.meetingCount = countAgentsInMeeting(this.scene);
    }

    const target = want ? 1 : 0;
    const step = Math.max(0.001, delta) / FADE_MS;
    if (this.fade < target) this.fade = Math.min(1, this.fade + step);
    else if (this.fade > target) this.fade = Math.max(0, this.fade - step);

    const wasActive = this.active;
    this.active = this.fade > 0.02;

    if (!this.active) {
      this.beamGfx.clear().setVisible(false);
      this.slideGfx.clear().setVisible(false);
      if (wasActive) this.publish();
      return;
    }

    this.beamGfx.setVisible(true);
    this.slideGfx.setVisible(true);
    this._drawBeam();
    this._drawSlide(time);
    this.publish();
  }

  _drawBeam() {
    const board = this.board;
    const tip = this.meetPx || meetingWorld(this.scene);
    const g = this.beamGfx;
    g.clear();

    const dx = tip.x - board.x;
    const dy = tip.y - board.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    // perpendicular
    const px = -uy;
    const py = ux;

    const tipHalf = BEAM_HALF * 0.38;
    const nearL = { x: board.x + px * BEAM_HALF, y: board.y + py * BEAM_HALF };
    const nearR = { x: board.x - px * BEAM_HALF, y: board.y - py * BEAM_HALF };
    const tipL = { x: tip.x + px * tipHalf, y: tip.y + py * tipHalf };
    const tipR = { x: tip.x - px * tipHalf, y: tip.y - py * tipHalf };

    const layers = [
      { scale: 1.4, alpha: ALPHA_BASE * 0.32 * this.fade },
      { scale: 1.0, alpha: ALPHA_BASE * 0.72 * this.fade },
      { scale: 0.5, alpha: ALPHA_BASE * 1.1 * this.fade },
    ];

    for (const layer of layers) {
      const s = layer.scale;
      const nL = {
        x: board.x + (nearL.x - board.x) * s,
        y: board.y + (nearL.y - board.y) * s,
      };
      const nR = {
        x: board.x + (nearR.x - board.x) * s,
        y: board.y + (nearR.y - board.y) * s,
      };
      const tL = {
        x: tip.x + (tipL.x - tip.x) * s,
        y: tip.y + (tipL.y - tip.y) * s,
      };
      const tR = {
        x: tip.x + (tipR.x - tip.x) * s,
        y: tip.y + (tipR.y - tip.y) * s,
      };
      g.fillStyle(BEAM_COLOR, layer.alpha);
      g.fillTriangle(nL.x, nL.y, nR.x, nR.y, tR.x, tR.y);
      g.fillTriangle(nL.x, nL.y, tR.x, tR.y, tL.x, tL.y);
    }
  }

  _drawSlide(time) {
    const board = this.board;
    const g = this.slideGfx;
    g.clear();
    // 0.5–2s period — mild alpha wobble on the "slide" face
    const period = this.flickerPeriod;
    const wobble =
      0.55 +
      0.45 *
        (0.5 +
          0.5 *
            Math.sin((time / period) * Math.PI * 2 + this.slidePhase));
    const alpha = 0.1 * wobble * this.fade;
    const tw = this.scene.map?.tileWidth ?? TILE_SIZE;
    const w = tw * 1.6;
    const h = tw * 0.9;
    g.fillStyle(SLIDE_COLOR, alpha);
    g.fillRoundedRect(board.x - w / 2, board.y - h / 2 - 4, w, h, 3);
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      active: this.active,
      reason: this.active ? this.reason : null,
      fade: Math.round(this.fade * 100) / 100,
      meetingCount: this.meetingCount,
      boardTiles: this.board?.tiles ?? 0,
      flickerPeriod: Math.round(this.flickerPeriod),
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    const snap = this.snapshot();
    const key = JSON.stringify(snap);
    if (key === this._lastPublish) return;
    this._lastPublish = key;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      meetingProjector: snap,
    };
  }

  destroy() {
    for (const g of [this.beamGfx, this.slideGfx]) {
      if (!g) continue;
      try {
        g.destroy();
      } catch {
        /* ignore */
      }
    }
    this.beamGfx = null;
    this.slideGfx = null;
    this.active = false;
    this.fade = 0;
    this.publish();
  }
}
