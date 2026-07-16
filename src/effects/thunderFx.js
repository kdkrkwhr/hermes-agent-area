/** Rain-only lightning flash + optional thunder rumble. `?thunder=0` off, `?thunder=1` fast. */

import Phaser from "phaser";

/** Above agents/celebrate; brief ADD flash over the map. */
const DEPTH = 14;
/** Normal cooldown between strike groups (ms). */
const COOLDOWN_MIN = 25000;
const COOLDOWN_MAX = 90000;
/** `?thunder=1` — short gap so QA can see flashes. */
const FAST_COOLDOWN_MIN = 2500;
const FAST_COOLDOWN_MAX = 6000;
/** Single flash duration (ms). */
const FLASH_MIN = 80;
const FLASH_MAX = 180;

/**
 * Query: omit = auto (rain-gated). `0`/`off`/`false` = never.
 * `1`/`on`/`true` = force fast interval (still rain-gated, still no snow).
 * @returns {{ forcedOff: boolean, fast: boolean }}
 */
export function parseThunderMode() {
  if (typeof location === "undefined") {
    return { forcedOff: false, fast: false };
  }
  try {
    const raw = new URLSearchParams(location.search).get("thunder");
    if (raw === "0" || raw === "off" || raw === "false") {
      return { forcedOff: true, fast: false };
    }
    if (raw === "1" || raw === "on" || raw === "true") {
      return { forcedOff: false, fast: true };
    }
  } catch {
    /* ignore */
  }
  return { forcedOff: false, fast: false };
}

function randBetween(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Intermittent lightning while WindowRain is active. Never while snowing.
 */
export class ThunderFx {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ mapW: number, mapH: number }} dims
   */
  constructor(scene, dims) {
    this.scene = scene;
    const mode = parseThunderMode();
    this.forcedOff = mode.forcedOff;
    this.fast = mode.fast;
    this.flashCount = 0;
    this.lastAt = null;
    this._timer = null;
    this._flashTimers = [];

    this.overlay = scene.add.rectangle(0, 0, dims.mapW, dims.mapH, 0xd8eeff, 0);
    this.overlay.setOrigin(0, 0);
    this.overlay.setDepth(DEPTH);
    this.overlay.setScrollFactor(1);
    this.overlay.setBlendMode(Phaser.BlendModes.ADD);

    scene.events.once("shutdown", () => this.destroy());

    if (!this.forcedOff) {
      this._scheduleNext();
    }
    this.publish();
  }

  /** Rain visually on, and not snowing. `?rain=1` counts. */
  canStrike() {
    if (this.forcedOff) return false;
    const rain = this.scene.windowRain;
    const snow = this.scene.snowFlakes;
    if (snow?.active) return false;
    if (rain?.weatherSnowing && !rain?.forcedOn) return false;
    if (snow && !snow.forcedOff && (snow.forcedOn || snow.weatherForceOn) && !rain?.forcedOn) {
      return false;
    }
    return !!rain?.active;
  }

  _cooldownMs() {
    if (this.fast) return randBetween(FAST_COOLDOWN_MIN, FAST_COOLDOWN_MAX);
    return randBetween(COOLDOWN_MIN, COOLDOWN_MAX);
  }

  _scheduleNext() {
    if (this.forcedOff || !this.scene?.sys?.isActive?.()) return;
    if (this._timer) {
      this._timer.remove(false);
      this._timer = null;
    }
    this._timer = this.scene.time.delayedCall(this._cooldownMs(), () => {
      this._timer = null;
      this._tryStrike();
    });
  }

  _tryStrike() {
    if (!this.canStrike()) {
      this._scheduleNext();
      this.publish();
      return;
    }
    this._runStrike();
  }

  _runStrike() {
    const flashes = Math.random() < 0.45 ? 2 : 1;
    this.flashCount += 1;
    this.lastAt = Date.now();
    this.scene.officeAudio?.playThunderSfx?.();

    let delay = 0;
    for (let i = 0; i < flashes; i++) {
      const dur = randBetween(FLASH_MIN, FLASH_MAX);
      const startAt = delay;
      const tOn = this.scene.time.delayedCall(startAt, () => this._setFlash(true));
      const tOff = this.scene.time.delayedCall(startAt + dur, () => {
        this._setFlash(false);
      });
      this._flashTimers.push(tOn, tOff);
      delay += dur + randBetween(40, 120);
    }

    const done = this.scene.time.delayedCall(delay + 20, () => {
      this._setFlash(false);
      this._flashTimers = [];
      this._scheduleNext();
      this.publish();
    });
    this._flashTimers.push(done);
    this.publish();
  }

  _setFlash(on) {
    const overlay = this.overlay;
    if (!overlay || !overlay.active) return;
    if (on) {
      // white → soft cyan, bright ADD
      const cyan = Math.random() < 0.55;
      overlay.setFillStyle(cyan ? 0xc8e8ff : 0xffffff, cyan ? 0.55 : 0.7);
    } else {
      overlay.setFillStyle(0xd8eeff, 0);
    }
  }

  snapshot() {
    return {
      enabled: !this.forcedOff,
      fast: this.fast,
      canStrike: this.canStrike(),
      flashCount: this.flashCount,
      lastAt: this.lastAt,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      thunder: this.snapshot(),
    };
  }

  destroy() {
    if (this._timer) {
      this._timer.remove(false);
      this._timer = null;
    }
    for (const t of this._flashTimers.splice(0)) {
      try {
        t?.remove?.(false);
      } catch {
        /* ignore */
      }
    }
    this._setFlash(false);
    try {
      this.overlay?.destroy();
    } catch {
      /* ignore */
    }
    this.overlay = null;
  }
}

export { DEPTH as THUNDER_DEPTH, COOLDOWN_MIN, COOLDOWN_MAX };
