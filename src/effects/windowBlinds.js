/** TOD-synced venetian blinds on north GID-12 windows.
 * morning/day: mostly open · evening: half · night: mostly closed.
 * `?blinds=0` off · `?blinds=1` force on (ignore accidental off).
 */

import { findWindowTiles } from "./windowRain.js";

/** Above outdoor window FX (rain/snow/birds/season 4, sunbeam/city 5); below lighting (6). */
const DEPTH = 5.5;
/** Thin slats per pane — 3–5 is enough. */
const SLAT_COUNT = 4;
/** Cool gray-blue rail/slat — reads as interior hardware on glass. */
const SLAT_COLOR = 0x3a4558;
const SLAT_HI = 0x6a7a90;
const SLAT_ALPHA = 0.7;
/** TOD cover fraction: 0 = fully open, 1 = fully closed. */
const COVER_BY_TOD = {
  morning: 0.12,
  day: 0.14,
  evening: 0.5,
  night: 0.88,
};
/** Tween duration range on TOD change (ms). */
const TWEEN_MIN_MS = 600;
const TWEEN_MAX_MS = 1200;

/**
 * Query: omit = on (TOD-gated cover).
 * `0`/`off`/`false` = never.
 * `1`/`on`/`true`/`force` = force enabled.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function blindsModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("blinds");
    if (v == null || v === "") {
      return { enabled: true, forced: false };
    }
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
 * @param {string | null | undefined} name
 * @returns {number}
 */
export function coverForTod(name) {
  if (name && Object.prototype.hasOwnProperty.call(COVER_BY_TOD, name)) {
    return COVER_BY_TOD[name];
  }
  return COVER_BY_TOD.day;
}

/**
 * Interior blinds overlay on north glass. Sync via applyTimeOfDayLighting.
 */
export class WindowBlinds {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    const mode = blindsModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.tiles = this.enabled ? findWindowTiles(scene) : [];
    this.active = false;
    /** Current cover 0..1 (tweened). */
    this.cover = coverForTod(scene.lightingPreset?.name);
    this.targetCover = this.cover;
    this._tween = null;
    /** First sync (constructor → applyTimeOfDayLighting) snaps; later TOD changes tween. */
    this._primed = false;
    this.gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);

    scene.events.once("shutdown", () => this.destroy());
  }

  shouldBeActive() {
    return this.enabled && this.tiles.length > 0;
  }

  /**
   * Call from applyTimeOfDayLighting. Tweens cover on TOD change.
   * @param {{ immediate?: boolean }} [opts]
   */
  sync(opts = {}) {
    if (!this.shouldBeActive()) {
      this._killTween();
      this.active = false;
      this.gfx.clear();
      this.gfx.setVisible(false);
      this.publish();
      return;
    }

    this.active = true;
    this.gfx.setVisible(true);
    const want = coverForTod(this.scene.lightingPreset?.name);
    const snap = opts.immediate || !this._primed;
    this._primed = true;

    if (snap) {
      this._killTween();
      this.cover = want;
      this.targetCover = want;
      this._draw();
      this.publish();
      return;
    }

    if (Math.abs(want - this.targetCover) < 0.005) {
      this.publish();
      return;
    }

    this._tweenTo(want);
    this.publish();
  }

  /**
   * @param {number} want
   */
  _tweenTo(want) {
    this.targetCover = want;
    this._killTween();
    const duration =
      TWEEN_MIN_MS + Math.floor(Math.random() * (TWEEN_MAX_MS - TWEEN_MIN_MS + 1));
    this._tween = this.scene.tweens.add({
      targets: this,
      cover: want,
      duration,
      ease: "Sine.easeInOut",
      onUpdate: () => this._draw(),
      onComplete: () => {
        this._tween = null;
        this.cover = want;
        this._draw();
        this.publish();
      },
    });
  }

  _killTween() {
    if (this._tween) {
      try {
        this._tween.stop();
      } catch {
        /* ignore */
      }
      this._tween = null;
    }
  }

  _draw() {
    const g = this.gfx;
    g.clear();
    const tw = this.scene.map?.tileWidth ?? 32;
    const th = this.scene.map?.tileHeight ?? 32;
    const cover = Math.max(0, Math.min(1, this.cover));
    if (cover < 0.02) return;

    for (const t of this.tiles) {
      const left = t.x - tw / 2;
      const top = t.y - th / 2;
      const coverH = Math.max(4, th * cover);

      // top rail
      g.fillStyle(SLAT_COLOR, Math.min(0.95, SLAT_ALPHA + 0.15));
      g.fillRect(left + 1, top + 1, tw - 2, 2);

      for (let i = 0; i < SLAT_COUNT; i++) {
        const tNorm = SLAT_COUNT <= 1 ? 0 : i / (SLAT_COUNT - 1);
        const y = top + 3 + tNorm * (coverH - 5);
        g.fillStyle(SLAT_COLOR, SLAT_ALPHA);
        g.fillRect(left + 2, y, tw - 4, 2);
        g.fillStyle(SLAT_HI, SLAT_ALPHA * 0.35);
        g.fillRect(left + 2, y, tw - 4, 1);
      }
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      active: this.active,
      cover: Math.round(this.cover * 1000) / 1000,
      targetCover: Math.round(this.targetCover * 1000) / 1000,
      windowTiles: this.tiles.length,
      slatCount: SLAT_COUNT,
      depth: DEPTH,
      lighting: this.scene.lightingPreset?.name ?? null,
      tweening: !!this._tween,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      blinds: this.snapshot(),
    };
  }

  destroy() {
    this._killTween();
    if (this.gfx) {
      try {
        this.gfx.destroy();
      } catch {
        /* ignore */
      }
      this.gfx = null;
    }
    this.active = false;
    this.tiles = [];
    this.publish();
  }
}
