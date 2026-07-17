/** War Room whiteboard (GID15) soft marker/chalk strokes. `?scribble=0` off · `?scribble=force` smoke. */

import {
  findWhiteboardAnchor,
  formatTickerLine,
  WHITEBOARD_GID,
} from "../ui/whiteboardTicker.js";

/** Below ticker (8); above furniture (0). */
const DEPTH = 7;
const MIN_IDLE_MS = 25000;
const MAX_IDLE_MS = 50000;
const FORCE_IDLE_MS = 1800;
/** Soft chalk / dry-erase marker tones. */
const STROKE_COLORS = [0x3a4a5c, 0x4a6078, 0x2e4050, 0x5a6e82, 0x455868];
const FADE_MS_MIN = 700;
const FADE_MS_MAX = 1400;

/**
 * Query: omit = on. `0`/`off`/`false` = never. `force` = immediate stroke + short idle.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function scribbleModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("scribble");
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

export function scribbleEnabledFromQuery() {
  return scribbleModeFromQuery().enabled;
}

function pickIdleMs(forced) {
  if (forced) return FORCE_IDLE_MS;
  return (
    MIN_IDLE_MS + Math.floor(Math.random() * (MAX_IDLE_MS - MIN_IDLE_MS + 1))
  );
}

/**
 * Soft marker scribble on War Room whiteboard — tick from OfficeScene.updateVisualEffects.
 * Bursts on ticker text change or 25–50s idle (force: immediate + short loop).
 */
export class WhiteboardScribble {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = scribbleModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.anchor = this.enabled ? findWhiteboardAnchor(scene) : null;
    this.nextAt = 0;
    this.strokeCount = 0;
    this.lastAt = null;
    this.lastReason = null;
    this.lastTickerText = "";
    this._lastKey = "";
    /** @type {Phaser.GameObjects.Graphics[]} */
    this._live = [];

    if (this.enabled && this.anchor) {
      const now = scene.time?.now ?? 0;
      if (this.forced) {
        this.burst("force");
        this.nextAt = now + pickIdleMs(true);
      } else {
        this.nextAt = now + pickIdleMs(false);
      }
    }

    scene.events.once("shutdown", () => this.destroy());
    this.publish();
  }

  shouldRun() {
    return this.enabled && !!this.anchor;
  }

  /**
   * Same snapshot path as WhiteboardTicker — fire when counts change.
   * @param {object|null} snapshot
   */
  updateFromSnapshot(snapshot) {
    if (!this.shouldRun() || !snapshot) return;
    const text = formatTickerLine(snapshot);
    if (!text || text === this.lastTickerText) return;
    this.lastTickerText = text;
    this.burst("ticker");
    this.nextAt = (this.scene.time?.now ?? 0) + pickIdleMs(this.forced);
    this.publish();
  }

  /**
   * @param {number} now
   * @param {number} [_delta]
   */
  update(now, _delta = 16) {
    if (!this.shouldRun()) {
      this.publish();
      return;
    }
    if (now < this.nextAt) {
      this.publish();
      return;
    }
    this.burst("idle");
    this.nextAt = now + pickIdleMs(this.forced);
    this.publish();
  }

  /**
   * Spawn 2–4 short chalk strokes near the board centroid, then fade out.
   * @param {string} reason
   */
  burst(reason = "idle") {
    if (!this.shouldRun()) return;
    const scene = this.scene;
    const ax = this.anchor.x;
    const ay = this.anchor.y;
    const n = 2 + Math.floor(Math.random() * 3);

    for (let i = 0; i < n; i++) {
      const g = scene.add.graphics().setDepth(DEPTH);
      const ox = (Math.random() - 0.5) * 36;
      const oy = (Math.random() - 0.5) * 22 + 6;
      const len = 10 + Math.random() * 18;
      const ang = (Math.random() - 0.5) * 1.1;
      const x0 = ax + ox;
      const y0 = ay + oy;
      const x1 = x0 + Math.cos(ang) * len;
      const y1 = y0 + Math.sin(ang) * len * 0.55;
      const color =
        STROKE_COLORS[Math.floor(Math.random() * STROKE_COLORS.length)];
      const alpha = 0.35 + Math.random() * 0.28;
      const w = 1.2 + Math.random() * 1.4;
      g.lineStyle(w, color, alpha);
      g.beginPath();
      g.moveTo(x0, y0);
      // slight mid wobble so it reads as hand stroke, not ruler
      const mx = (x0 + x1) / 2 + (Math.random() - 0.5) * 3;
      const my = (y0 + y1) / 2 + (Math.random() - 0.5) * 2.5;
      g.lineTo(mx, my);
      g.lineTo(x1, y1);
      g.strokePath();

      this._live.push(g);
      const fadeMs =
        FADE_MS_MIN + Math.floor(Math.random() * (FADE_MS_MAX - FADE_MS_MIN + 1));
      scene.tweens.add({
        targets: g,
        alpha: 0,
        duration: fadeMs,
        ease: "Sine.easeOut",
        onComplete: () => {
          try {
            g.destroy();
          } catch {
            /* ignore */
          }
          const idx = this._live.indexOf(g);
          if (idx >= 0) this._live.splice(idx, 1);
        },
      });
    }

    this.strokeCount += n;
    this.lastAt = scene.time?.now ?? Date.now();
    this.lastReason = reason;
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      active: this.shouldRun(),
      tiles: this.anchor?.tiles ?? 0,
      x: this.anchor?.x ?? null,
      y: this.anchor?.y ?? null,
      strokeCount: this.strokeCount,
      lastAt: this.lastAt,
      lastReason: this.lastReason,
      live: this._live.length,
      depth: DEPTH,
      whiteboardGid: WHITEBOARD_GID,
      mode: scribbleModeFromQuery(),
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
      whiteboardScribble: snap,
    };
  }

  destroy() {
    for (const g of this._live) {
      try {
        g.destroy();
      } catch {
        /* ignore */
      }
    }
    this._live = [];
    this.anchor = null;
    this.publish();
  }
}

export { DEPTH as SCRIBBLE_DEPTH, MIN_IDLE_MS, MAX_IDLE_MS };
