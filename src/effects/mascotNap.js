/** Ambient mascot nap — evening/night or long idle → pathfind to sleepRug/Nap Pod,
 *  curl 8–16s + soft fx-zzz, then wander again.
 *  `?mascotnap=0` off · `?mascotnap=force` (+ `?tod=night`) smoke.
 *  Requires mascot (`?mascot=0` → no-op). Skips while zoomies/pet active.
 */

import { findNapPodTiles } from "./napPodBreathe.js";
import { findSleepRugTiles } from "./sleepRugSheen.js";

/** Soft ambient cadence (ms). Forced = near-immediate. */
const INTERVAL_MIN_MS = 48000;
const INTERVAL_MAX_MS = 90000;
const FORCE_FIRST_MS = 600;
const FORCE_INTERVAL_MS = 14000;
/** Day/morning only nap after this much consecutive idle (path empty). */
const LONG_IDLE_MS = 28000;
/** Curl hold at spot. */
const NAP_MIN_MS = 8000;
const NAP_MAX_MS = 16000;
const FORCE_NAP_MS = 10000;
/** Arrive threshold (tiles). */
const ARRIVE_DIST = 0.65;
/** Pathfind timeout — abort approach. */
const APPROACH_MAX_MS = 18000;

/**
 * Query: omit = on. `0`/`off`/`false` = never. `force`/`1`/`true`/`on` = smoke.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function mascotNapModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("mascotnap");
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

export function mascotNapEnabledFromQuery() {
  return mascotNapModeFromQuery().enabled;
}

function pickInterval(forced) {
  if (forced) return FORCE_INTERVAL_MS;
  return INTERVAL_MIN_MS + Math.random() * (INTERVAL_MAX_MS - INTERVAL_MIN_MS);
}

function pickNapMs(forced) {
  if (forced) return FORCE_NAP_MS;
  return NAP_MIN_MS + Math.random() * (NAP_MAX_MS - NAP_MIN_MS);
}

function lightingName(scene) {
  return scene.lightingPreset?.name || "day";
}

function isSleepTod(name) {
  return name === "evening" || name === "night";
}

/**
 * Candidate nap tiles: walkable neighbors of sleep rugs / nap pods, plus sleep wp.
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number }[]}
 */
export function collectNapSpots(scene) {
  const spots = [];
  const seen = new Set();
  const layer = scene.collision || scene.collisionLayer;
  const push = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0) return;
    if (scene.map) {
      if (ix >= scene.map.width || iy >= scene.map.height) return;
    }
    // skip collision tiles when we can
    if (layer?.getTileAt) {
      const t = layer.getTileAt(ix, iy);
      if (t && t.index > 0) return;
    }
    const key = `${ix},${iy}`;
    if (seen.has(key)) return;
    seen.add(key);
    spots.push({ x: ix, y: iy });
  };

  const rugs = findSleepRugTiles(scene);
  const pods = findNapPodTiles(scene);
  for (const a of [...rugs, ...pods]) {
    // prefer neighbors — furniture tile itself is often blocked
    for (const [dx, dy] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
      [0, 2],
      [2, 0],
      [-2, 0],
    ]) {
      push(a.tx + dx, a.ty + dy);
    }
  }

  const sleep = scene.waypoints?.sleep || { x: 31, y: 21 };
  push(sleep.x, sleep.y);
  push(sleep.x + 1, sleep.y);
  push(sleep.x - 1, sleep.y);
  push(sleep.x, sleep.y + 1);
  push(sleep.x, sleep.y - 1);
  push(sleep.x + 1, sleep.y + 1);
  push(sleep.x - 1, sleep.y + 1);

  // sort: closest to sleep wp first (stable ambient target)
  spots.sort((a, b) => {
    const da = Math.hypot(a.x - sleep.x, a.y - sleep.y);
    const db = Math.hypot(b.x - sleep.x, b.y - sleep.y);
    return da - db;
  });

  return spots;
}

/**
 * Ambient director — owns schedule; Mascot owns curl/Zzz pose.
 */
export class MascotNap {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    const mode = mascotNapModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    /** @type {"idle"|"pathing"|"sleeping"} */
    this.state = "idle";
    this.nextAt = 0;
    this.napUntil = 0;
    this.approachUntil = 0;
    this.target = null;
    this._idleSince = 0;
    this._lastFireAt = 0;
    this.spots = this.enabled ? collectNapSpots(scene) : [];
    this.fireCount = 0;

    if (this.enabled) {
      const now = scene.time?.now ?? 0;
      this.nextAt = now + (this.forced ? FORCE_FIRST_MS : pickInterval(false) * 0.35);
      this._idleSince = now;
    }

    scene.events.once("shutdown", () => this.destroy());
    this.publish();
  }

  mascot() {
    return this.scene.mascot || null;
  }

  blockedByOther(m) {
    return !!(m?.isZoomies?.() || m?.isPetting?.());
  }

  shouldOfferNap(now, m) {
    if (this.forced) return true;
    const tod = lightingName(this.scene);
    if (isSleepTod(tod)) return true;
    // day/morning: only after long idle (path empty + not busy)
    const idle =
      !m.path?.length && !m.busy && !m.isNapping?.() && !this.blockedByOther(m);
    if (!idle) {
      this._idleSince = now;
      return false;
    }
    return now - this._idleSince >= LONG_IDLE_MS;
  }

  scheduleNext(now) {
    this.nextAt = now + pickInterval(this.forced);
  }

  pickTarget(m, exclude = null) {
    const spots = this.spots.length ? this.spots : collectNapSpots(this.scene);
    this.spots = spots;
    if (!spots.length) return null;
    const here = m.tilePos?.() || { x: 0, y: 0 };
    const ex = exclude ? `${exclude.x},${exclude.y}` : null;
    let others = spots.filter((s) => s.x !== here.x || s.y !== here.y);
    if (ex) others = others.filter((s) => `${s.x},${s.y}` !== ex);
    const pool = others.length ? others : spots;
    // forced: bias toward sleep cluster (front of sorted list)
    if (this.forced) {
      const top = pool.slice(0, Math.min(6, pool.length));
      return top[Math.floor(Math.random() * top.length)];
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  cancelApproach() {
    const m = this.mascot();
    if (m) {
      m.clearNapTravel?.();
      if (this.state === "pathing") {
        m.path = [];
        m.pathIndex = 0;
      }
    }
    this.state = "idle";
    this.target = null;
    this.approachUntil = 0;
  }

  endSleep() {
    const m = this.mascot();
    m?.endNap?.();
    this.state = "idle";
    this.napUntil = 0;
    this.target = null;
    const now = this.scene.time.now;
    this.scheduleNext(now);
    this.publish();
  }

  async beginApproach(now, attempt = 0) {
    const m = this.mascot();
    if (!m?.sprite || this.blockedByOther(m) || m.isNapping?.()) {
      this.scheduleNext(now);
      return;
    }
    const dest = this.pickTarget(m);
    if (!dest) {
      this.scheduleNext(now);
      return;
    }

    this.state = "pathing";
    this.target = dest;
    this.approachUntil = now + APPROACH_MAX_MS;
    m.beginNapTravel?.();

    const from = m.tilePos();
    try {
      const path = await this.scene.pathfinder.findPath(
        from.x,
        from.y,
        dest.x,
        dest.y,
      );
      // stale? another mode stole the mascot
      if (this.state !== "pathing" || this.mascot() !== m) return;
      if (this.blockedByOther(m)) {
        this.cancelApproach();
        this.scheduleNext(this.scene.time.now);
        this.publish();
        return;
      }
      if (!path.length) {
        const here = m.tilePos();
        const near =
          Math.hypot(here.x - dest.x, here.y - dest.y) <= ARRIVE_DIST;
        if (near) {
          this.startCurl(m);
        } else if (attempt < 4) {
          // try another sleep-zone neighbor
          this.cancelApproach();
          await this.beginApproach(this.scene.time.now, attempt + 1);
        } else {
          this.cancelApproach();
          this.scheduleNext(this.scene.time.now);
          this.publish();
        }
        return;
      }
      m.path = path.slice(1);
      m.pathIndex = 0;
      // empty after slice → already on dest tile
      if (!m.path.length) {
        this.startCurl(m);
      }
    } catch {
      this.cancelApproach();
      this.scheduleNext(this.scene.time.now);
    }
    this.publish();
  }

  startCurl(m) {
    const hold = pickNapMs(this.forced);
    const now = this.scene.time.now;
    this.state = "sleeping";
    this.napUntil = now + hold;
    this.approachUntil = 0;
    this.fireCount += 1;
    this._lastFireAt = now;
    m.startNap?.(hold);
    this.publish();
  }

  /**
   * @param {number} [time]
   * @param {number} [_delta]
   */
  update(time = this.scene.time.now, _delta = 16) {
    if (!this.enabled) return;
    const m = this.mascot();
    if (!m?.sprite) {
      if (this.state !== "idle") this.cancelApproach();
      return;
    }

    // zoomies/pet win — drop nap attempt
    if (this.blockedByOther(m)) {
      if (this.state === "sleeping") this.endSleep();
      else if (this.state === "pathing") {
        this.cancelApproach();
        this.scheduleNext(time + 4000);
      }
      this._idleSince = time;
      this.publish();
      return;
    }

    if (this.state === "sleeping") {
      if (!m.isNapping?.(time) || time >= this.napUntil) {
        this.endSleep();
      }
      return;
    }

    if (this.state === "pathing") {
      if (time >= this.approachUntil) {
        this.cancelApproach();
        this.scheduleNext(time);
        this.publish();
        return;
      }
      const here = m.tilePos();
      const t = this.target;
      const near =
        t && Math.hypot(here.x - t.x, here.y - t.y) <= ARRIVE_DIST;
      if (near) {
        m.path = [];
        m.pathIndex = 0;
        this.startCurl(m);
        return;
      }
      // path finished but still far — abort (unreachable / blocked)
      if (!m.path?.length && !m.busy) {
        this.cancelApproach();
        this.scheduleNext(time);
        this.publish();
      }
      return;
    }

    // idle scheduler
    if (!m.path?.length && !m.busy) {
      /* keep _idleSince */
    } else {
      this._idleSince = time;
    }

    if (time < this.nextAt) return;
    if (!this.shouldOfferNap(time, m)) {
      this.scheduleNext(time);
      return;
    }

    void this.beginApproach(time);
  }

  snapshot() {
    const m = this.mascot();
    return {
      enabled: this.enabled,
      forced: this.forced,
      state: this.state,
      active: this.state === "sleeping" || this.state === "pathing",
      sleeping: this.state === "sleeping" || !!m?.isNapping?.(),
      pathing: this.state === "pathing",
      nextAt: this.nextAt,
      napUntil: this.napUntil,
      fireCount: this.fireCount,
      lastFireAt: this._lastFireAt,
      spotCount: this.spots.length,
      target: this.target,
      lighting: lightingName(this.scene),
      hasMascot: !!m?.sprite,
      mode: mascotNapModeFromQuery(),
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      mascotNap: this.snapshot(),
    };
  }

  destroy() {
    this.cancelApproach();
    const m = this.mascot();
    m?.endNap?.();
    this.enabled = false;
    this.state = "idle";
  }
}
