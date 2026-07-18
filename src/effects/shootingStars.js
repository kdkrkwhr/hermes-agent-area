/** Night shooting-star streak over north GID-12 windows. `?stars=0` off, `?stars=1`/`force` force + short gap. */

import { findWindowTiles } from "./windowRain.js";

/** Same band as rain/snow/birds (4) — below lighting overlay (6) / agents (10). */
const DEPTH = 4;
/** Default gap between meteors (ms). */
const GAP_MIN_MS = 20000;
const GAP_MAX_MS = 50000;
/** `?stars=1` / `force` gap. */
const FORCE_GAP_MIN_MS = 1800;
const FORCE_GAP_MAX_MS = 3500;
/** First meteor when forced — smoke can catch it. */
const FORCE_FIRST_MS = 350;
/** Streak flight duration. */
const FLY_MIN_MS = 700;
const FLY_MAX_MS = 1200;
/** Soft cool-white ADD head. */
const COLOR = 0xd8e8ff;

/**
 * Query: omit = on (evening/night-gated).
 * `0`/`off`/`false` = never.
 * `1`/`on`/`true`/`force` = always (TOD ignore; still mute on precip/fog) + short gap.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function starsModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("stars");
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

function randBetween(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Soft ADD meteor streak outside north glass. Max one at a time.
 * Sync via applyTimeOfDayLighting + weather changes.
 */
export class ShootingStars {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    const mode = starsModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.tiles = this.enabled ? findWindowTiles(scene) : [];
    this.active = false;
    this.flying = false;
    this.flyCount = 0;
    this.depth = DEPTH;
    this._timer = null;
    this._tween = null;
    this._firstDone = false;
    this._gfx = null;
    this._trail = null;

    if (this.enabled && this.tiles.length) {
      this._gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);
      this._gfx.setBlendMode("ADD");
    }

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  /** Rain / snow / fog — hide stars. */
  isBlocked() {
    const wx = this.scene.weatherFx?.classification;
    if (wx?.raining || wx?.snowing) return true;
    const rain = this.scene.windowRain;
    const snow = this.scene.snowFlakes;
    if (rain && !rain.forcedOff && (rain.forcedOn || rain.weatherForceOn)) {
      return true;
    }
    if (snow && !snow.forcedOff && (snow.forcedOn || snow.weatherForceOn)) {
      return true;
    }
    const fog = this.scene.fogMist;
    if (fog && !fog.forcedOff && fog.active) return true;
    return false;
  }

  shouldBeActive() {
    if (!this.enabled || !this.tiles.length || !this._gfx) return false;
    if (this.isBlocked()) return false;
    if (this.forced) return true;
    const name = this.scene.lightingPreset?.name;
    return name === "evening" || name === "night";
  }

  /** Call from applyTimeOfDayLighting / weatherFx. */
  sync() {
    const want = this.shouldBeActive();
    if (!want) {
      this.active = false;
      this._clearTimer();
      this._killStar();
      this.publish();
      return;
    }
    this.active = true;
    if (!this.flying && !this._timer) {
      this._scheduleNext(/*immediateFirst*/ !this._firstDone && this.forced);
    }
    this.publish();
  }

  _gapMs() {
    if (this.forced) return randBetween(FORCE_GAP_MIN_MS, FORCE_GAP_MAX_MS);
    return randBetween(GAP_MIN_MS, GAP_MAX_MS);
  }

  _scheduleNext(immediateFirst = false) {
    this._clearTimer();
    if (!this.active || this.flying) return;
    const delay = immediateFirst ? FORCE_FIRST_MS : this._gapMs();
    this._timer = this.scene.time.delayedCall(delay, () => {
      this._timer = null;
      this._spawnStar();
    });
  }

  _clearTimer() {
    if (this._timer) {
      try {
        this._timer.remove(false);
      } catch {
        /* ignore */
      }
      this._timer = null;
    }
  }

  _killStar() {
    if (this._tween) {
      try {
        this._tween.stop();
      } catch {
        /* ignore */
      }
      this._tween = null;
    }
    this._trail = null;
    if (this._gfx) {
      this._gfx.clear();
      this._gfx.setVisible(false);
    }
    this.flying = false;
  }

  /** Window-band Y — average of sampled north panes ± small jitter. */
  _pickY() {
    const tiles = this.tiles;
    const avg =
      tiles.reduce((s, t) => s + t.y, 0) / Math.max(1, tiles.length);
    return avg - 18 - Math.random() * 22;
  }

  _spawnStar() {
    if (!this.active || this.flying || !this.tiles.length || !this._gfx) return;
    if (this.isBlocked()) {
      this.sync();
      return;
    }

    const map = this.scene.map;
    const mapW = map?.widthInPixels ?? 640;
    // Diagonal NW→SE or NE→SW — classic meteor slant
    const leftToRight = Math.random() < 0.55;
    const startX = leftToRight
      ? -40 + Math.random() * (mapW * 0.35)
      : mapW + 40 - Math.random() * (mapW * 0.35);
    const endX = leftToRight
      ? startX + 140 + Math.random() * 100
      : startX - 140 - Math.random() * 100;
    const startY = this._pickY() - 8 - Math.random() * 16;
    const endY = startY + 36 + Math.random() * 28;
    const life = randBetween(FLY_MIN_MS, FLY_MAX_MS);
    /** Trail length in px along path. */
    const trailLen = 28 + Math.random() * 18;

    this._trail = { startX, startY, endX, endY, trailLen, t: 0 };
    this._gfx.setVisible(true);
    this.flying = true;
    this._firstDone = true;
    this.publish();

    this._tween = this.scene.tweens.add({
      targets: this._trail,
      t: 1,
      duration: life,
      ease: "Cubic.easeOut",
      onUpdate: () => this._draw(),
      onComplete: () => {
        this._tween = null;
        this._trail = null;
        if (this._gfx) {
          this._gfx.clear();
          this._gfx.setVisible(false);
        }
        this.flying = false;
        this.flyCount += 1;
        this.publish();
        if (this.active) this._scheduleNext(false);
      },
    });
  }

  _draw() {
    const g = this._gfx;
    const tr = this._trail;
    if (!g || !tr) return;

    const t = tr.t;
    const hx = tr.startX + (tr.endX - tr.startX) * t;
    const hy = tr.startY + (tr.endY - tr.startY) * t;
    const dx = tr.endX - tr.startX;
    const dy = tr.endY - tr.startY;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    // fade in quick, hold, fade out
    const envelope =
      t < 0.12 ? t / 0.12 : t > 0.72 ? Math.max(0, (1 - t) / 0.28) : 1;
    const tx = hx - ux * tr.trailLen;
    const ty = hy - uy * tr.trailLen;

    g.clear();
    // soft outer glow
    g.lineStyle(4.5, COLOR, 0.12 * envelope);
    g.beginPath();
    g.moveTo(tx, ty);
    g.lineTo(hx, hy);
    g.strokePath();
    // mid streak
    g.lineStyle(2.2, COLOR, 0.35 * envelope);
    g.beginPath();
    g.moveTo(tx + ux * tr.trailLen * 0.25, ty + uy * tr.trailLen * 0.25);
    g.lineTo(hx, hy);
    g.strokePath();
    // bright head
    g.fillStyle(COLOR, 0.55 * envelope);
    g.fillCircle(hx, hy, 2.2);
    g.fillStyle(0xffffff, 0.75 * envelope);
    g.fillCircle(hx, hy, 1.1);
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      active: this.active,
      flying: this.flying,
      flyCount: this.flyCount,
      windowTiles: this.tiles.length,
      blocked: this.isBlocked(),
      depth: this.depth,
      lighting: this.scene.lightingPreset?.name ?? null,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      stars: this.snapshot(),
    };
  }

  destroy() {
    this._clearTimer();
    this._killStar();
    if (this._gfx) {
      try {
        this._gfx.destroy();
      } catch {
        /* ignore */
      }
      this._gfx = null;
    }
    this.active = false;
    this.tiles = [];
    this.publish();
  }
}
