/** War Room glass-door (GID11) free/busy schedule tablet.
 *  Busy: agents≥2 / standup gather → rose/amber `회의중`.
 *  Free: soft slate `비어있음` + fake next-slot rotation (60–120s).
 *  `?meetingsign=0` off · `force` always busy · `tablet`/`forceFree` always free.
 */

import { findGlassDoorTiles } from "./glassDoorSwing.js";
import { TILE_SIZE } from "../constants.js";

const TEX_BUSY = "fx-meeting-door-sign-busy";
const TEX_FREE = "fx-meeting-door-sign-free";
/** Above doorswing(1.6) / furniture; below agents(10) / nameplate(20). */
const DEPTH = 8.2;
const SIGN_W = 64;
const SIGN_H = 20;
/** Soft rose panel + amber edge — busy. */
const PANEL_BUSY = 0x3a2018;
const EDGE_BUSY = 0xf0a060;
const GLOW_ROSE = 0xff6688;
const GLOW_AMBER = 0xffaa55;
const LABEL_BUSY = "#ffe0c8";
const LABEL_BUSY_SUB = "#f0a878";
/** Soft slate — free / vacant tablet. */
const PANEL_FREE = 0x1e2834;
const EDGE_FREE = 0x7a92a8;
const GLOW_SLATE = 0x88aacc;
const LABEL_FREE = "#d0dce8";
const LABEL_FREE_SUB = "#9ab0c4";
/** Bob amplitude (px). */
const BOB_PX = 1.5;
const BOB_MS = 2400;
/** Pulse period (ms) for rose↔amber glow (busy only). */
const PULSE_MS = 1800;
/** Free↔busy crossfade (ms). Task: 200–400. */
const STATE_FADE_MS = 280;
/** Boot fade-in when sign first appears. */
const BOOT_FADE_MS = 320;
/** Only doors near War Room meeting. */
const DOOR_RADIUS = 8;
/** Placard sits above door lintel, slightly into corridor. */
const ANCHOR_OY = -18;
const MEETING_PAD = 2;
/** Fake next-slot rotation window (ms). */
const SLOT_MIN_MS = 60_000;
const SLOT_MAX_MS = 120_000;

/** Decorative fake bookings — no BE calendar. */
const FAKE_SLOTS = [
  "14:00–15:00 스탠드업",
  "예약 없음",
  "16:30–17:00 리뷰",
  "10:00–11:00 1:1",
  "예약 없음",
  "15:00–15:30 싱크",
  "17:00–18:00 레트로",
];

/**
 * Query: omit = occupancy/gather-driven.
 * `0`/`off`/`false` = never.
 * `force`/`1`/`on`/`true` = always busy (회의중).
 * `tablet`/`free`/`forceFree` = always free tablet (smoke).
 * @returns {{ enabled: boolean, forced: boolean, forceFree: boolean }}
 */
export function meetingSignModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false, forceFree: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("meetingsign");
    if (v == null || v === "") {
      return { enabled: true, forced: false, forceFree: false };
    }
    if (v === "0" || v === "false" || v === "off") {
      return { enabled: false, forced: false, forceFree: false };
    }
    if (v === "force" || v === "1" || v === "true" || v === "on") {
      return { enabled: true, forced: true, forceFree: false };
    }
    if (v === "tablet" || v === "free" || v === "forceFree") {
      return { enabled: true, forced: false, forceFree: true };
    }
    return { enabled: true, forced: false, forceFree: false };
  } catch {
    return { enabled: true, forced: false, forceFree: false };
  }
}

export function meetingSignEnabledFromQuery() {
  return meetingSignModeFromQuery().enabled;
}

function paintPanel(g, panel, edge, accent) {
  g.fillStyle(edge, 0.8);
  g.fillRect(SIGN_W / 2 - 1, 0, 2, 3);
  g.fillStyle(panel, 1);
  g.fillRoundedRect(0, 3, SIGN_W, SIGN_H, 2);
  g.lineStyle(1.5, edge, 0.95);
  g.strokeRoundedRect(0.75, 3.75, SIGN_W - 1.5, SIGN_H - 1.5, 2);
  g.lineStyle(1, accent, 0.35);
  g.strokeRoundedRect(2.5, 5.5, SIGN_W - 5, SIGN_H - 5, 1);
}

function ensureTextures(scene) {
  if (!scene.textures.exists(TEX_BUSY)) {
    const g = scene.make.graphics({ add: false });
    paintPanel(g, PANEL_BUSY, EDGE_BUSY, GLOW_ROSE);
    g.generateTexture(TEX_BUSY, SIGN_W, SIGN_H + 3);
    g.destroy();
  }
  if (!scene.textures.exists(TEX_FREE)) {
    const g = scene.make.graphics({ add: false });
    paintPanel(g, PANEL_FREE, EDGE_FREE, GLOW_SLATE);
    g.generateTexture(TEX_FREE, SIGN_W, SIGN_H + 3);
    g.destroy();
  }
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
    return {
      x: meet.x * tw + tw / 2,
      y: (meet.y + 3) * th + th / 2 + ANCHOR_OY,
      tx: meet.x,
      ty: meet.y + 3,
      doors: 0,
    };
  }

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
  if (oe._standupGathering) return true;
  if (!oe.isGathering?.()) return false;
  return (
    oe.lastEvent === "standup" ||
    oe.lastEvent === "all_hands" ||
    oe.lastEvent === "review_huddle" ||
    oe.lastEvent === "sprint_retro" ||
    oe.lastEvent === "bug_bash"
  );
}

function nextSlotPeriod() {
  return SLOT_MIN_MS + Math.random() * (SLOT_MAX_MS - SLOT_MIN_MS);
}

/**
 * Soft floating free/busy tablet at War Room glass door.
 */
export class MeetingDoorSign {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = meetingSignModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.forceFree = mode.forceFree;
    /** @type {'free'|'busy'|null} */
    this.state = null;
    this.reason = null;
    this.meetingCount = 0;
    /** 0 = free visual, 1 = busy visual — start already at target for force modes */
    this.busyBlend = mode.forced ? 1 : 0;
    /** Overall visibility (boot / disable). */
    this.fade = 0;
    this.phase = Math.random();
    this._lastKey = "";
    this.slotIndex = Math.floor(Math.random() * FAKE_SLOTS.length);
    this.slotLabel = FAKE_SLOTS[this.slotIndex];
    this._nextSlotAt = 0;
    this.anchor = this.enabled ? findWarRoomDoorAnchor(scene) : null;

    this.root = null;
    this.glow = null;
    this.panelBusy = null;
    this.panelFree = null;
    this.label = null;
    this.sub = null;

    if (this.enabled && this.anchor) {
      ensureTextures(scene);
      const { x, y } = this.anchor;
      this.root = scene.add
        .container(x, y)
        .setDepth(DEPTH)
        .setVisible(false)
        .setAlpha(0);
      this.glow = scene.add
        .ellipse(0, 2, SIGN_W + 16, SIGN_H + 12, GLOW_SLATE, 0.16)
        .setBlendMode("ADD");
      this.panelFree = scene.add.image(0, 2, TEX_FREE).setOrigin(0.5, 0.5);
      this.panelBusy = scene.add
        .image(0, 2, TEX_BUSY)
        .setOrigin(0.5, 0.5)
        .setAlpha(0);
      this.label = scene.add
        .text(0, -2, "비어있음", {
          fontFamily: "Segoe UI, sans-serif",
          fontSize: "9px",
          fontStyle: "bold",
          color: LABEL_FREE,
          align: "center",
        })
        .setOrigin(0.5, 0.5);
      this.sub = scene.add
        .text(0, 8, this.slotLabel, {
          fontFamily: "Consolas, Segoe UI, monospace",
          fontSize: "5px",
          color: LABEL_FREE_SUB,
          align: "center",
        })
        .setOrigin(0.5, 0.5);
      this.root.add([
        this.glow,
        this.panelFree,
        this.panelBusy,
        this.label,
        this.sub,
      ]);
      if (mode.forced) {
        this.applyVisual(1, scene.time.now);
      }
      this._nextSlotAt =
        scene.time.now + nextSlotPeriod() * (0.15 + Math.random() * 0.2);
    }

    scene.events.once("shutdown", () => this.destroy());
    this.publish();
  }

  /**
   * @returns {{ wantBusy: boolean, reason: string|null }}
   */
  shouldBeBusy() {
    if (!this.enabled || !this.anchor || !this.root) {
      return { wantBusy: false, reason: null };
    }
    if (this.forceFree) return { wantBusy: false, reason: "tablet" };
    if (this.forced) return { wantBusy: true, reason: "force" };
    if (meetingGatherActive(this.scene)) {
      const oe = this.scene.officeEvents;
      const kind =
        oe?._standupGathering || oe?.lastEvent === "standup"
          ? "standup"
          : oe?.lastEvent === "review_huddle"
            ? "review_huddle"
            : oe?.lastEvent === "sprint_retro"
              ? "sprint_retro"
              : oe?.lastEvent === "bug_bash"
                ? "bug_bash"
                : "all_hands";
      return { wantBusy: true, reason: kind };
    }
    this.meetingCount = countAgentsInMeeting(this.scene);
    if (this.meetingCount >= 2) {
      return { wantBusy: true, reason: "meeting" };
    }
    return { wantBusy: false, reason: null };
  }

  /** @deprecated prefer shouldBeBusy — kept for callers expecting want */
  shouldBeActive() {
    const { wantBusy, reason } = this.shouldBeBusy();
    return { want: this.enabled && !!this.anchor, reason: wantBusy ? reason : "free" };
  }

  /** Refresh after lighting / roster changes. */
  sync() {
    this.publish();
  }

  rotateSlot(time) {
    if (this.busyBlend > 0.5) return;
    if (time < this._nextSlotAt) return;
    this.slotIndex = (this.slotIndex + 1) % FAKE_SLOTS.length;
    this.slotLabel = FAKE_SLOTS[this.slotIndex];
    this._nextSlotAt = time + nextSlotPeriod();
    if (this.busyBlend < 0.5 && this.sub) {
      this.sub.setText(this.slotLabel);
    }
  }

  applyVisual(busyBlend, time) {
    const t = Math.max(0, Math.min(1, busyBlend));
    this.panelFree?.setAlpha(1 - t);
    this.panelBusy?.setAlpha(t);

    if (t >= 0.5) {
      this.label?.setText("회의중").setColor(LABEL_BUSY);
      this.sub?.setText("IN MEETING").setColor(LABEL_BUSY_SUB);
    } else {
      this.label?.setText("비어있음").setColor(LABEL_FREE);
      this.sub?.setText(this.slotLabel).setColor(LABEL_FREE_SUB);
    }

    const pulse =
      0.5 +
      0.5 * Math.sin((time / PULSE_MS) * Math.PI * 2 + this.phase * Math.PI);
    if (t > 0.05) {
      const glowA = (0.14 + 0.16 * pulse) * t;
      const tint = pulse > 0.5 ? GLOW_AMBER : GLOW_ROSE;
      this.glow.setFillStyle(tint, glowA);
      this.glow.setAlpha(glowA);
    } else {
      const glowA = 0.1 + 0.04 * pulse;
      this.glow.setFillStyle(GLOW_SLATE, glowA);
      this.glow.setAlpha(glowA);
    }
  }

  /**
   * @param {number} [time]
   * @param {number} [delta]
   */
  update(time = this.scene.time.now, delta = 16) {
    if (!this.enabled || !this.anchor || !this.root) {
      if (this.fade > 0 || this.state) {
        this.state = null;
        this.reason = null;
        this.fade = 0;
        this.busyBlend = 0;
        this.root?.setVisible(false).setAlpha(0);
        this.publish();
      }
      return;
    }

    const { wantBusy, reason } = this.shouldBeBusy();
    this.reason = wantBusy ? reason : this.forceFree ? "tablet" : "free";
    this.state = wantBusy ? "busy" : "free";
    if (!wantBusy) {
      this.meetingCount = countAgentsInMeeting(this.scene);
    }

    // boot visibility
    const visTarget = 1;
    const bootStep = Math.max(0.001, delta) / BOOT_FADE_MS;
    if (this.fade < visTarget) this.fade = Math.min(1, this.fade + bootStep);

    // free↔busy blend
    const busyTarget = wantBusy ? 1 : 0;
    const stateStep = Math.max(0.001, delta) / STATE_FADE_MS;
    if (this.busyBlend < busyTarget) {
      this.busyBlend = Math.min(1, this.busyBlend + stateStep);
    } else if (this.busyBlend > busyTarget) {
      this.busyBlend = Math.max(0, this.busyBlend - stateStep);
    }

    this.rotateSlot(time);

    const bob =
      Math.sin((time / BOB_MS) * Math.PI * 2 + this.phase * Math.PI * 2) *
      BOB_PX;
    this.root.setVisible(true);
    this.root.setAlpha(this.fade);
    this.root.setPosition(this.anchor.x, this.anchor.y + bob);
    this.applyVisual(this.busyBlend, time);

    this.publish();
  }

  get active() {
    return this.enabled && this.fade > 0.02 && !!this.root;
  }

  set active(_v) {
    /* snapshot / legacy — driven by fade */
  }

  snapshot() {
    const busy = this.busyBlend >= 0.5;
    return {
      enabled: this.enabled,
      forced: this.forced,
      forceFree: this.forceFree,
      active: this.active,
      state: this.enabled ? (busy ? "busy" : "free") : null,
      reason: this.enabled ? this.reason : null,
      fade: Math.round(this.fade * 100) / 100,
      busyBlend: Math.round(this.busyBlend * 100) / 100,
      meetingCount: this.meetingCount,
      slot: busy ? null : this.slotLabel,
      doorTiles: this.anchor?.doors ?? 0,
      anchor: this.anchor
        ? { tx: this.anchor.tx, ty: this.anchor.ty }
        : null,
      depth: DEPTH,
      bobPx: BOB_PX,
      stateFadeMs: STATE_FADE_MS,
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
    this.panelBusy = null;
    this.panelFree = null;
    this.label = null;
    this.sub = null;
    this.state = null;
    this.fade = 0;
    this.busyBlend = 0;
    this.publish();
  }
}

/** @deprecated alias — free↔busy uses STATE_FADE_MS */
const FADE_MS = STATE_FADE_MS;

export {
  DEPTH,
  BOB_PX,
  ANCHOR_OY,
  STATE_FADE_MS,
  FADE_MS,
  DOOR_RADIUS,
  FAKE_SLOTS,
  SLOT_MIN_MS,
  SLOT_MAX_MS,
};
