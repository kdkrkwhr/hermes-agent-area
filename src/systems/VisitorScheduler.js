/**
 * Independent spawn scheduler using native setTimeout.
 * Reads ?visitor query parameter:
 *   ?visitor=1  → fast (10-30s)
 *   ?visitor=0  → disabled
 *   absent/other → default (90-180s)
 *
 * HMR-safe: module-scoped active instance cleared before re-registration.
 * URL-change-aware: listen for popstate / hashchange to re-sync the interval.
 */

const FAST_MIN_MS = 10_000;
const FAST_MAX_MS = 30_000;
const DEFAULT_MIN_MS = 90_000;
const DEFAULT_MAX_MS = 180_000;

/** module-scoped — HMR re‑evaluation clears the previous instance */
let _activeInstance = null;

function parseQuery() {
  if (typeof location === "undefined" || !location) {
    return { enabled: true, fast: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("visitor");
    if (v === "0" || v === "false" || v === "off") {
      return { enabled: false, fast: false };
    }
    if (v === "1" || v === "fast") return { enabled: true, fast: true };
  } catch {
    /* ignore */
  }
  return { enabled: true, fast: false };
}

function randomDelay(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export class VisitorScheduler {
  /**
   * @param {(scheduler: VisitorScheduler) => void} onTick
   *   Called when the timer fires. The tick is expected to attempt a spawn.
   *   The scheduler does NOT guard against concurrent spawns — that is the
   *   responsibility of the spawn logic (e.g. VisitorDirector.spawn).
   */
  constructor(onTick) {
    this.onTick = onTick;
    this._timerId = null;
    this._enabled = false;
    this._fast = false;

    // HMR guard: destroy the previous instance so timers don't pile up
    if (_activeInstance) {
      _activeInstance.destroy();
    }
    _activeInstance = this;

    this._onUrlChange = () => this.resync();
    this._applyQuery();
    this._startTimer();
    this._listenUrl();
  }

  /** Re-read the URL and re-start the timer with the new interval. */
  resync() {
    this._stopTimer();
    this._applyQuery();
    this._startTimer();
  }

  /** Stop the timer and release all listeners. Idempotent. */
  destroy() {
    this._stopTimer();
    this._unlistenUrl();
    this._enabled = false;
    if (_activeInstance === this) _activeInstance = null;
  }

  /* ── internal ──────────────────────────────────────────────── */

  _applyQuery() {
    const mode = parseQuery();
    this._enabled = mode.enabled;
    this._fast = mode.fast;
  }

  _startTimer() {
    if (!this._enabled) return;
    this._stopTimer(); // defensive: clear any orphaned timer
    this._scheduleTick();
  }

  _stopTimer() {
    if (this._timerId != null) {
      clearTimeout(this._timerId);
      this._timerId = null;
    }
  }

  _scheduleTick() {
    const min = this._fast ? FAST_MIN_MS : DEFAULT_MIN_MS;
    const max = this._fast ? FAST_MAX_MS : DEFAULT_MAX_MS;
    this._timerId = setTimeout(() => {
      this._timerId = null;
      if (this._enabled && this.onTick) {
        try {
          this.onTick(this);
        } catch {
          /* ignore */
        }
      }
      // re-schedule with a new random delay (each cycle is randomized)
      if (this._enabled) this._scheduleTick();
    }, randomDelay(min, max));
  }

  _listenUrl() {
    try {
      window.addEventListener("popstate", this._onUrlChange);
      window.addEventListener("hashchange", this._onUrlChange);
    } catch {
      /* ignore */
    }
  }

  _unlistenUrl() {
    try {
      window.removeEventListener("popstate", this._onUrlChange);
      window.removeEventListener("hashchange", this._onUrlChange);
    } catch {
      /* ignore */
    }
  }
}