/** Daytime bird silhouette flyby over north GID-12 windows. `?birds=0` off, `?birds=1` force, `?birds=fast` short gap. */

import { findWindowTiles } from "./windowRain.js";

/** Same band as rain/snow (4) — below lighting (6) / agents (10). */
const DEPTH = 4;
const TEX_A = "fx-bird-a";
const TEX_B = "fx-bird-b";
/** Default gap between flybys (ms). */
const GAP_MIN_MS = 25000;
const GAP_MAX_MS = 60000;
/** `?birds=fast` gap. */
const FAST_GAP_MIN_MS = 2000;
const FAST_GAP_MAX_MS = 4500;
/** First bird when forced / fast — smoke can catch it. */
const FORCE_FIRST_MS = 400;
/** Fly duration across the facade. */
const FLY_MIN_MS = 3200;
const FLY_MAX_MS = 5200;

/**
 * Query: omit = on (morning/day-gated).
 * `0`/`off`/`false` = never.
 * `1`/`on`/`true`/`force` = always (TOD ignore; still mute on precip).
 * `fast` = force + short interval.
 * @returns {{ enabled: boolean, forced: boolean, fast: boolean }}
 */
export function birdsModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false, fast: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("birds");
    if (v == null || v === "") {
      return { enabled: true, forced: false, fast: false };
    }
    if (v === "0" || v === "false" || v === "off") {
      return { enabled: false, forced: false, fast: false };
    }
    if (v === "fast") {
      return { enabled: true, forced: true, fast: true };
    }
    if (v === "1" || v === "true" || v === "on" || v === "force") {
      return { enabled: true, forced: true, fast: false };
    }
    return { enabled: true, forced: false, fast: false };
  } catch {
    return { enabled: true, forced: false, fast: false };
  }
}

/** Small dark bird silhouettes — right-facing; flipX for L←R. */
function ensureBirdTextures(scene) {
  if (!scene.textures.exists(TEX_A)) {
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0x1a1a22, 1);
    // body + head
    g.fillEllipse(10, 6, 12, 6);
    g.fillCircle(16, 5, 2.4);
    // beak
    g.fillTriangle(18, 5, 22, 5.5, 18, 6.5);
    // wing up
    g.fillTriangle(6, 5, 12, 1, 14, 5);
    // tail
    g.fillTriangle(2, 5, 0, 3, 0, 8);
    g.generateTexture(TEX_A, 22, 12);
    g.destroy();
  }
  if (!scene.textures.exists(TEX_B)) {
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0x22222c, 1);
    g.fillEllipse(9, 7, 11, 5);
    g.fillCircle(15, 6, 2.2);
    g.fillTriangle(17, 6, 21, 6.2, 17, 7.2);
    // wing mid / flatter
    g.fillTriangle(5, 6, 11, 3, 13, 6.5);
    g.fillTriangle(1, 6, 0, 4, 0, 9);
    g.generateTexture(TEX_B, 22, 12);
    g.destroy();
  }
}

function randBetween(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Morning/day bird flybys outside north glass. Max one at a time.
 * Sync via applyTimeOfDayLighting + weather changes.
 */
export class WindowBirds {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    const mode = birdsModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.fast = mode.fast;
    this.tiles = this.enabled ? findWindowTiles(scene) : [];
    this.active = false;
    this.flying = false;
    this.flyCount = 0;
    this._timer = null;
    this._bird = null;
    this._tween = null;
    this._firstDone = false;

    if (this.enabled && this.tiles.length) {
      ensureBirdTextures(scene);
    }

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  /** Real precip only (weather / ?rain=1 / ?snow=1) — not TOD evening rain décor. */
  isPrecip() {
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
    return false;
  }

  shouldBeActive() {
    if (!this.enabled || !this.tiles.length) return false;
    if (this.isPrecip()) return false;
    if (this.forced) return true;
    const name = this.scene.lightingPreset?.name;
    return name === "morning" || name === "day";
  }

  /** Call from applyTimeOfDayLighting / weatherFx — stop on evening/night/precip. */
  sync() {
    const want = this.shouldBeActive();
    if (!want) {
      this.active = false;
      this._clearTimer();
      this._killBird();
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
    if (this.fast) return randBetween(FAST_GAP_MIN_MS, FAST_GAP_MAX_MS);
    return randBetween(GAP_MIN_MS, GAP_MAX_MS);
  }

  _scheduleNext(immediateFirst = false) {
    this._clearTimer();
    if (!this.active || this.flying) return;
    const delay = immediateFirst ? FORCE_FIRST_MS : this._gapMs();
    this._timer = this.scene.time.delayedCall(delay, () => {
      this._timer = null;
      this._spawnBird();
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

  _killBird() {
    if (this._tween) {
      try {
        this._tween.stop();
      } catch {
        /* ignore */
      }
      this._tween = null;
    }
    if (this._bird) {
      try {
        this._bird.destroy();
      } catch {
        /* ignore */
      }
      this._bird = null;
    }
    this.flying = false;
  }

  /** Window-band Y — average of sampled north panes ± small jitter. */
  _pickY() {
    const tiles = this.tiles;
    const avg =
      tiles.reduce((s, t) => s + t.y, 0) / Math.max(1, tiles.length);
    // fly just above pane centers (outside glass)
    return avg - 10 - Math.random() * 14;
  }

  _spawnBird() {
    if (!this.active || this.flying || !this.tiles.length) return;
    if (this.isPrecip()) {
      this.sync();
      return;
    }

    const map = this.scene.map;
    const mapW = map?.widthInPixels ?? 640;
    const leftToRight = Math.random() < 0.5;
    const startX = leftToRight ? -24 : mapW + 24;
    const endX = leftToRight ? mapW + 24 : -24;
    const midY = this._pickY();
    const amp = 6 + Math.random() * 10;
    const waves = 1.4 + Math.random() * 1.2;
    const life = randBetween(FLY_MIN_MS, FLY_MAX_MS);
    const tex = Math.random() < 0.5 ? TEX_A : TEX_B;

    const bird = this.scene.add.image(startX, midY, tex);
    bird.setDepth(DEPTH);
    bird.setAlpha(0.78);
    bird.setFlipX(!leftToRight);
    bird.setScale(0.85 + Math.random() * 0.25);

    this._bird = bird;
    this.flying = true;
    this._firstDone = true;
    this.publish();

    const state = { t: 0 };
    this._tween = this.scene.tweens.add({
      targets: state,
      t: 1,
      duration: life,
      ease: "Linear",
      onUpdate: () => {
        const t = state.t;
        bird.x = startX + (endX - startX) * t;
        bird.y = midY + Math.sin(t * Math.PI * waves) * amp;
        bird.setAngle(
          Math.sin(t * Math.PI * waves) * 10 * (leftToRight ? 1 : -1),
        );
      },
      onComplete: () => {
        this._tween = null;
        try {
          bird.destroy();
        } catch {
          /* ignore */
        }
        this._bird = null;
        this.flying = false;
        this.flyCount += 1;
        this.publish();
        if (this.active) this._scheduleNext(false);
      },
    });
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      fast: this.fast,
      active: this.active,
      flying: this.flying,
      flyCount: this.flyCount,
      windowTiles: this.tiles.length,
      precip: this.isPrecip(),
      lighting: this.scene.lightingPreset?.name ?? null,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      birds: this.snapshot(),
    };
  }

  destroy() {
    this._clearTimer();
    this._killBird();
    this.active = false;
    this.tiles = [];
    this.publish();
  }
}
