/** Lobby/queue corridor robot vacuum ambient. Slow AABB bounce patrol.
 *  `?vacuum=0` off · `?vacuum=1`/`force` on · `?vacuum=fast` ~3× speed.
 */

/** Above furniture (0); below footprints (8) / agents (10). */
const DEPTH = 4;
const TRAIL_DEPTH = 3;
/** Tile travel time at normal speed. */
const SEC_PER_TILE = 1.2;
const FAST_MULT = 3;
/** Dust puffs behind the bot. */
const TRAIL_INTERVAL_MS = 140;
const TRAIL_FADE_MS = 420;
const TRAIL_MAX = 8;
const BODY_R = 7;
const INSET_PX = 10;

/**
 * Query: omit = on (slow).
 * `0`/`off`/`false` = never.
 * `1`/`on`/`true`/`force` = on (smoke).
 * `fast` = on + faster patrol.
 * @returns {{ enabled: boolean, forced: boolean, fast: boolean }}
 */
export function vacuumModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false, fast: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("vacuum");
    if (v == null || v === "") return { enabled: true, forced: false, fast: false };
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

export function vacuumEnabledFromQuery() {
  return vacuumModeFromQuery().enabled;
}

/**
 * Corridor patrol AABB in world px from lobby waypoint (else entrance↔queue line).
 * @param {Phaser.Scene} scene
 * @returns {{ left: number, right: number, top: number, bottom: number, tw: number, th: number }|null}
 */
export function resolveVacuumBounds(scene) {
  const tw = scene.map?.tileWidth ?? 32;
  const th = scene.map?.tileHeight ?? 32;
  const lob = scene.waypoints?.lobby;
  if (
    lob &&
    Number.isFinite(lob.xMin) &&
    Number.isFinite(lob.yMin) &&
    Number.isFinite(lob.xMax) &&
    Number.isFinite(lob.yMax)
  ) {
    return {
      left: lob.xMin * tw + INSET_PX,
      right: (lob.xMax + 1) * tw - INSET_PX,
      top: lob.yMin * th + INSET_PX,
      bottom: (lob.yMax + 1) * th - INSET_PX,
      tw,
      th,
    };
  }

  const ent = scene.waypoints?.entrance || { x: 20, y: 27 };
  const queue = scene.waypoints?.queue;
  let xMin = ent.x;
  let xMax = ent.x;
  let y = ent.y;
  if (Array.isArray(queue) && queue.length) {
    for (const q of queue) {
      xMin = Math.min(xMin, q.x);
      xMax = Math.max(xMax, q.x);
      y = q.y ?? y;
    }
  }
  return {
    left: xMin * tw + INSET_PX,
    right: (xMax + 1) * tw - INSET_PX,
    top: y * th + INSET_PX,
    bottom: (y + 1) * th - INSET_PX,
    tw,
    th,
  };
}

/** Small round Roomba-ish texture. */
function ensureVacuumTexture(scene) {
  if (scene.textures.exists("fx-vacuum")) return;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  const cx = 10;
  const cy = 10;
  g.fillStyle(0x6a7380, 1);
  g.fillCircle(cx, cy, BODY_R);
  g.fillStyle(0x4a5560, 1);
  g.fillCircle(cx, cy, BODY_R - 2);
  g.fillStyle(0x9aa3ad, 1);
  g.fillCircle(cx - 1, cy - 1, 2.5);
  g.fillStyle(0x2c333c, 1);
  g.fillCircle(cx + 3, cy - 3, 1.4);
  g.lineStyle(1, 0x3a424c, 0.85);
  g.strokeCircle(cx, cy, BODY_R - 0.5);
  g.generateTexture("fx-vacuum", 20, 20);
  g.destroy();
}

/**
 * Always one vacuum. Bounce on corridor AABB; ignore agents/boss.
 */
export class RobotVacuum {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    const mode = vacuumModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.fast = mode.fast;
    this.active = false;
    this.bounds = null;
    this.sprite = null;
    this.vx = 0;
    this.vy = 0;
    this.trail = [];
    this._lastTrail = 0;

    if (this.enabled) {
      this.bounds = resolveVacuumBounds(scene);
      if (this.bounds && this.bounds.right > this.bounds.left) {
        ensureVacuumTexture(scene);
        const b = this.bounds;
        const x = (b.left + b.right) / 2;
        const y = (b.top + b.bottom) / 2;
        this.sprite = scene.add
          .image(x, y, "fx-vacuum")
          .setDepth(DEPTH)
          .setVisible(false);
        const speed =
          (b.tw / SEC_PER_TILE) * (this.fast ? FAST_MULT : 1);
        // start mostly along the long corridor axis
        const horiz = b.right - b.left >= b.bottom - b.top;
        const angle = horiz
          ? (Math.random() < 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.35
          : (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) +
            (Math.random() - 0.5) * 0.35;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
      }
    }

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  shouldBeActive() {
    return this.enabled && !!this.sprite && !!this.bounds;
  }

  sync() {
    if (!this.shouldBeActive()) {
      this.active = false;
      this.sprite?.setVisible(false);
      this.publish();
      return;
    }
    this.active = true;
    this.sprite.setVisible(true);
    this.publish();
  }

  /**
   * @param {number} [time]
   * @param {number} [delta]
   */
  update(time = this.scene.time.now, delta = 16) {
    if (!this.active || !this.sprite || !this.bounds) return;

    const dt = Math.min(0.05, Math.max(0, delta / 1000));
    let x = this.sprite.x + this.vx * dt;
    let y = this.sprite.y + this.vy * dt;
    const b = this.bounds;
    const r = BODY_R;

    if (x - r < b.left) {
      x = b.left + r;
      this.vx = Math.abs(this.vx);
    } else if (x + r > b.right) {
      x = b.right - r;
      this.vx = -Math.abs(this.vx);
    }
    if (y - r < b.top) {
      y = b.top + r;
      this.vy = Math.abs(this.vy);
    } else if (y + r > b.bottom) {
      y = b.bottom - r;
      this.vy = -Math.abs(this.vy);
    }

    this.sprite.setPosition(x, y);
    // subtle spin while rolling
    this.sprite.rotation += (Math.abs(this.vx) + Math.abs(this.vy)) * dt * 0.08;

    if (time - this._lastTrail >= TRAIL_INTERVAL_MS) {
      this._lastTrail = time;
      this._spawnTrail(x, y);
    }
  }

  _spawnTrail(x, y) {
    while (this.trail.length >= TRAIL_MAX) {
      this._killTrail(this.trail.shift());
    }
    const backX = x - Math.sign(this.vx || 1) * 4;
    const backY = y - Math.sign(this.vy || 0) * 3;
    const gfx = this.scene.add.graphics().setDepth(TRAIL_DEPTH);
    gfx.fillStyle(0xc8b89a, 0.28);
    gfx.fillCircle(backX, backY, 2.2);
    gfx.fillStyle(0xd8c8a8, 0.18);
    gfx.fillCircle(backX + 1.5, backY - 1, 1.4);
    const mark = { gfx, tween: null };
    this.trail.push(mark);
    mark.tween = this.scene.tweens.add({
      targets: gfx,
      alpha: 0,
      duration: TRAIL_FADE_MS,
      ease: "Quad.easeOut",
      onComplete: () => {
        const i = this.trail.indexOf(mark);
        if (i >= 0) this.trail.splice(i, 1);
        try {
          gfx.destroy();
        } catch {
          /* ignore */
        }
      },
    });
  }

  _killTrail(mark) {
    if (!mark) return;
    try {
      mark.tween?.stop?.();
    } catch {
      /* ignore */
    }
    try {
      mark.gfx?.destroy?.();
    } catch {
      /* ignore */
    }
  }

  snapshot() {
    const b = this.bounds;
    const tw = b?.tw ?? 32;
    const th = b?.th ?? 32;
    const x = this.sprite?.x ?? null;
    const y = this.sprite?.y ?? null;
    return {
      enabled: this.enabled,
      forced: this.forced,
      fast: this.fast,
      active: this.active,
      x,
      y,
      tx: x != null ? Math.floor(x / tw) : null,
      ty: y != null ? Math.floor(y / th) : null,
      vx: this.vx,
      vy: this.vy,
      trail: this.trail.length,
      bounds: b
        ? {
            left: b.left,
            right: b.right,
            top: b.top,
            bottom: b.bottom,
          }
        : null,
      mode: vacuumModeFromQuery(),
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      vacuum: this.snapshot(),
    };
  }

  destroy() {
    while (this.trail.length) {
      this._killTrail(this.trail.shift());
    }
    try {
      this.sprite?.destroy();
    } catch {
      /* ignore */
    }
    this.sprite = null;
    this.bounds = null;
    this.active = false;
    this.publish();
  }
}

export { DEPTH as VACUUM_DEPTH, SEC_PER_TILE };
