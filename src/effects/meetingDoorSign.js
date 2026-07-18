/** War Room glass-door (GID11) floating '회의중' strip LED.
 *  ON: meeting waypoint agents ≥2, or officeEvents standup/all_hands gather.
 *  Soft rose/amber pulse + short fade. `?meetingsign=0` off · `?meetingsign=force` always.
 */

import { findGlassDoorTiles } from "./glassDoorSwing.js";
import { TILE_SIZE } from "../constants.js";

const TEX_KEY = "fx-meeting-door-sign";
/** Above doorswing(1.6) / furniture; below agents(10) / nameplate(20). */
const DEPTH = 8.2;
const SIGN_W = 52;
const SIGN_H = 16;
/** Soft rose panel + amber edge — distinct from DND rose and EXIT neon. */
const PANEL = 0x3a2018;
const EDGE = 0xf0a060;
const GLOW_ROSE = 0xff6688;
const GLOW_AMBER = 0xffaa55;
const LABEL = "#ffe0c8";
const LABEL_SUB = "#f0a878";
/** Bob amplitude (px). */
const BOB_PX = 1.5;
const BOB_MS = 2400;
/** Pulse period (ms) for rose↔amber glow. */
const PULSE_MS = 1800;
/** Fade in/out when trigger starts/ends. */
const FADE_MS = 520;
/** Only doors near War Room meeting. */
const DOOR_RADIUS = 8;
/** Placard sits above door lintel, slightly into corridor. */
const ANCHOR_OY = -18;
const MEETING_PAD = 2;

/**
 * Query: omit = occupancy/gather-driven. `0`/`off`/`false` = never.
 * `force`/`1`/`on`/`true` = always on.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function meetingSignModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("meetingsign");
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

export function meetingSignEnabledFromQuery() {
  return meetingSignModeFromQuery().enabled;
}

function ensureTexture(scene) {
  if (scene.textures.exists(TEX_KEY)) return;
  const g = scene.make.graphics({ add: false });
  // hang stub
  g.fillStyle(EDGE, 0.8);
  g.fillRect(SIGN_W / 2 - 1, 0, 2, 3);
  // dark strip panel
  g.fillStyle(PANEL, 1);
  g.fillRoundedRect(0, 3, SIGN_W, SIGN_H, 2);
  // amber LED frame
  g.lineStyle(1.5, EDGE, 0.95);
  g.strokeRoundedRect(0.75, 3.75, SIGN_W - 1.5, SIGN_H - 1.5, 2);
  // inner soft rose edge
  g.lineStyle(1, GLOW_ROSE, 0.35);
  g.strokeRoundedRect(2.5, 5.5, SIGN_W - 5, SIGN_H - 5, 1);
  g.generateTexture(TEX_KEY, SIGN_W, SIGN_H + 3);
  g.destroy();
}

/**
 * Glass doors closest to War Room meeting — one sign at door-pair centroid.
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number, doors: number } | null}
 */
export function findWarRoomDoorAnchor(scene) {
  const meet = scene.waypoints?.meeting || { x: 18, y: 9 };
  const doors = findGlassDoorTiles(scene).filter((d) => {
    const dist = Math.hypot(d.tx - meet.x, d.ty - meet.y);
    return dist <= DOOR_RADIUS;
  });
  const tw = scene.map?.tileWidth ?? TILE_SIZE;
  const th = scene.map?.tileHeight ?? TILE_SIZE;

  if (!doors.length) {
    // fallback: south of meeting (hallway side of War Room)
    return {
      x: meet.x * tw + tw / 2,
      y: (meet.y + 3) * th + th / 2 + ANCHOR_OY,
      tx: meet.x,
      ty: meet.y + 3,
      doors: 0,
    };
  }

  // Prefer southern-most doors (corridor side), then centroid
  doors.sort((a, b) => b.ty - a.ty || a.tx - b.tx);
  const southTy = doors[0].ty;
  const band = doors.filter((d) => d.ty === southTy);
  const sx = band.reduce((s, d) => s + d.tx, 0) / band.length;
  const sy = southTy;
  return {
    x: sx * tw + tw / 2,
    y: sy * th + th / 2 + ANCHOR_OY,
    tx: Math.round(sx * 10) / 10,
    ty: sy,
    doors: doors.length,
  };
}

function agentTile(agent) {
  return agent?.tilePos?.() ?? null;
}

function countAgentsInMeeting(scene, pad = MEETING_PAD) {
  const m = scene.waypoints?.meeting || { x: 18, y: 9 };
  let n = 0;
  for (const a of scene.agents || []) {
    const t = agentTile(a);
    if (!t) continue;
    if (Math.abs(t.x - m.x) <= pad && Math.abs(t.y - m.y) <= pad) n += 1;
  }
  return n;
}

function meetingGatherActive(scene) {
  const oe = scene.officeEvents;
  if (!oe) return false;
  // Prefer sticky flag — ship_it can overwrite lastEvent mid-gather.
  if (oe._standupGathering) return true;
  if (!oe.isGathering?.()) return false;
  return oe.lastEvent === "standup" || oe.lastEvent === "all_hands" || oe.lastEvent === "review_huddle";
}

/**
 * Soft floating meeting-in-progress strip at War Room glass door.
 */
export class MeetingDoorSign {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = meetingSignModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.active = false;
    this.reason = null;
    this.meetingCount = 0;
    this.fade = 0;
    this.phase = Math.random();
    this._lastKey = "";
    this.anchor = this.enabled ? findWarRoomDoorAnchor(scene) : null;

    this.root = null;
    this.glow = null;
    this.panel = null;
    this.label = null;
    this.sub = null;

    if (this.enabled && this.anchor) {
      ensureTexture(scene);
      const { x, y } = this.anchor;
      this.root = scene.add
        .container(x, y)
        .setDepth(DEPTH)
        .setVisible(false)
        .setAlpha(0);
      this.glow = scene.add
        .ellipse(0, 1, SIGN_W + 16, SIGN_H + 12, GLOW_AMBER, 0.22)
        .setBlendMode("ADD");
      this.panel = scene.add.image(0, 2, TEX_KEY).setOrigin(0.5, 0.5);
      this.label = scene.add
        .text(0, -1, "회의중", {
          fontFamily: "Segoe UI, sans-serif",
          fontSize: "9px",
          fontStyle: "bold",
          color: LABEL,
          align: "center",
        })
        .setOrigin(0.5, 0.5);
      this.sub = scene.add
        .text(0, 8, "IN MEETING", {
          fontFamily: "Consolas, Segoe UI, monospace",
          fontSize: "5px",
          color: LABEL_SUB,
          align: "center",
        })
        .setOrigin(0.5, 0.5);
      this.root.add([this.glow, this.panel, this.label, this.sub]);
    }

    scene.events.once("shutdown", () => this.destroy());
    this.publish();
  }

  /**
   * @returns {{ want: boolean, reason: string|null }}
   */
  shouldBeActive() {
    if (!this.enabled || !this.anchor || !this.root) {
      return { want: false, reason: null };
    }
    if (this.forced) return { want: true, reason: "force" };
    if (meetingGatherActive(this.scene)) {
      const oe = this.scene.officeEvents;
      const kind =
        oe?._standupGathering || oe?.lastEvent === "standup"
          ? "standup"
          : oe?.lastEvent === "review_huddle"
            ? "review_huddle"
            : "all_hands";
      return { want: true, reason: kind };
    }
    this.meetingCount = countAgentsInMeeting(this.scene);
    if (this.meetingCount >= 2) {
      return { want: true, reason: "meeting" };
    }
    return { want: false, reason: null };
  }

  /** Refresh after lighting / roster changes. */
  sync() {
    this.publish();
  }

  /**
   * @param {number} [time]
   * @param {number} [delta]
   */
  update(time = this.scene.time.now, delta = 16) {
    if (!this.enabled || !this.anchor || !this.root) {
      if (this.active || this.fade > 0) {
        this.active = false;
        this.fade = 0;
        this.reason = null;
        this.root?.setVisible(false).setAlpha(0);
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
      this.root.setVisible(false).setAlpha(0);
      if (wasActive) this.publish();
      return;
    }

    const bob =
      Math.sin((time / BOB_MS) * Math.PI * 2 + this.phase * Math.PI * 2) *
      BOB_PX;
    this.root.setVisible(true);
    this.root.setAlpha(this.fade);
    this.root.setPosition(this.anchor.x, this.anchor.y + bob);

    // rose ↔ amber soft pulse on glow
    const pulse =
      0.5 +
      0.5 * Math.sin((time / PULSE_MS) * Math.PI * 2 + this.phase * Math.PI);
    const glowA = (0.14 + 0.16 * pulse) * this.fade;
    this.glow.setAlpha(glowA);
    const tint = pulse > 0.5 ? GLOW_AMBER : GLOW_ROSE;
    this.glow.setFillStyle(tint, glowA);

    this.publish();
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      active: this.active,
      reason: this.active ? this.reason : null,
      fade: Math.round(this.fade * 100) / 100,
      meetingCount: this.meetingCount,
      doorTiles: this.anchor?.doors ?? 0,
      anchor: this.anchor
        ? { tx: this.anchor.tx, ty: this.anchor.ty }
        : null,
      depth: DEPTH,
      bobPx: BOB_PX,
      mode: meetingSignModeFromQuery(),
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
      meetingDoorSign: snap,
    };
  }

  destroy() {
    try {
      this.root?.destroy();
    } catch {
      /* ignore */
    }
    this.root = null;
    this.glow = null;
    this.panel = null;
    this.label = null;
    this.sub = null;
    this.active = false;
    this.fade = 0;
    this.publish();
  }
}

export { DEPTH, BOB_PX, ANCHOR_OY, FADE_MS, DOOR_RADIUS };
