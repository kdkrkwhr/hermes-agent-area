/** FE-only lobby visitor walk-by. No click/chat. `?visitor=0` off, `?visitor=1` fast. */

import {
  createSpriteShadow,
  updateSpriteShadow,
} from "../effects/spriteShadow.js";
import { VisitorScheduler } from "../systems/VisitorScheduler.js";

const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };
const SPEED = 110;
const SHEETS = ["char-onion", "char-mushroom", "char-claude"];
const TINTS = [0x8eb4d8, 0xb8a0d0, 0x90c8a8];
const WANDER_MIN_MS = 8000;
const WANDER_MAX_MS = 14000;

/** `?visitor=0|false|off` disables. `?visitor=1|fast` shortens interval. Default on. */
export function visitorModeFromQuery() {
  if (typeof location === "undefined") return { enabled: true, fast: false };
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

function entranceTile(waypoints) {
  return waypoints?.entrance || { x: 20, y: 27 };
}

function lobbyAABB(waypoints) {
  const lob = waypoints?.lobby;
  if (
    lob &&
    Number.isFinite(lob.xMin) &&
    Number.isFinite(lob.xMax) &&
    Number.isFinite(lob.yMin) &&
    Number.isFinite(lob.yMax)
  ) {
    return lob;
  }
  const e = entranceTile(waypoints);
  return { xMin: e.x - 3, yMin: e.y - 1, xMax: e.x + 3, yMax: e.y + 1 };
}

function pickLobbyTile(aabb, avoid = null) {
  const xs = [];
  const ys = [];
  for (let x = aabb.xMin; x <= aabb.xMax; x++) xs.push(x);
  for (let y = aabb.yMin; y <= aabb.yMax; y++) ys.push(y);
  if (!xs.length || !ys.length) return entranceTile({});
  for (let i = 0; i < 12; i++) {
    const t = {
      x: xs[Math.floor(Math.random() * xs.length)],
      y: ys[Math.floor(Math.random() * ys.length)],
    };
    if (!avoid || t.x !== avoid.x || t.y !== avoid.y) return t;
  }
  return {
    x: xs[Math.floor(Math.random() * xs.length)],
    y: ys[Math.floor(Math.random() * ys.length)],
  };
}

export class Visitor {
  constructor(scene, startTile) {
    this.scene = scene;
    this.tileSize = scene.map.tileWidth;
    this.path = [];
    this.pathIndex = 0;
    this.busy = false;
    this.lastDir = "down";
    this.phase = "enter"; // enter | wander | exit | done
    this.wanderUntil = 0;
    this.idleUntil = 0;
    this.alive = true;

    const sheetIdx = Math.floor(Math.random() * SHEETS.length);
    this.sheet = SHEETS[sheetIdx];
    this.id = `visitor-${sheetIdx}-${(scene.time.now | 0) % 100000}`;

    const px = startTile.x * this.tileSize + this.tileSize / 2;
    const py = startTile.y * this.tileSize + this.tileSize / 2;

    this.sprite = scene.add.sprite(px, py, this.sheet, 0);
    this.sprite.setDepth(9);
    this.sprite.setOrigin(0.5, 0.85);
    this.sprite.setTint(TINTS[sheetIdx % TINTS.length]);
    this.sprite.setAlpha(0.88);
    // not interactive — ambient only
    this.shadowGfx = createSpriteShadow(scene, { depth: 8 });

    this.ensureAnims();
    this.sprite.anims.play(`${this.id}-idle-down`, true);
  }

  ensureAnims() {
    const scene = this.scene;
    const sheet = this.sheet;
    for (const dir of ["down", "left", "right", "up"]) {
      const row = DIR_ROW[dir];
      const walkKey = `${this.id}-walk-${dir}`;
      const idleKey = `${this.id}-idle-${dir}`;
      if (!scene.anims.exists(walkKey)) {
        scene.anims.create({
          key: walkKey,
          frames: scene.anims.generateFrameNumbers(sheet, {
            frames: [row * 3, row * 3 + 1, row * 3 + 2, row * 3 + 1],
          }),
          frameRate: 6,
          repeat: -1,
        });
      }
      if (!scene.anims.exists(idleKey)) {
        scene.anims.create({
          key: idleKey,
          frames: [{ key: sheet, frame: row * 3 }],
          frameRate: 1,
        });
      }
    }
  }

  tilePos() {
    return {
      x: Math.floor(this.sprite.x / this.tileSize),
      y: Math.floor(this.sprite.y / this.tileSize),
    };
  }

  syncShadow() {
    updateSpriteShadow(this.shadowGfx, this.sprite, {
      moving: this.path.length > 0,
      width: 16,
      height: 6,
    });
  }

  facingFromDelta(dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "left" : "right";
    return dy < 0 ? "up" : "down";
  }

  async goTo(dest) {
    if (this.busy || !this.alive) return false;
    this.busy = true;
    const from = this.tilePos();
    try {
      const path = await this.scene.pathfinder.findPath(
        from.x,
        from.y,
        dest.x,
        dest.y,
      );
      if (!path.length) return false;
      this.path = path.slice(1);
      this.pathIndex = 0;
      return this.path.length > 0 || (from.x === dest.x && from.y === dest.y);
    } catch {
      return false;
    } finally {
      this.busy = false;
    }
  }

  async beginVisit() {
    const lob = lobbyAABB(this.scene.waypoints);
    const dest = pickLobbyTile(lob);
    const ok = await this.goTo(dest);
    if (!ok) {
      this.phase = "exit";
      return;
    }
    // already at dest (empty path) → start wander clock
    if (!this.path.length) {
      const now = this.scene.time.now;
      this.phase = "wander";
      this.wanderUntil =
        now + WANDER_MIN_MS + Math.random() * (WANDER_MAX_MS - WANDER_MIN_MS);
      this.idleUntil = now + 400;
    }
  }

  async wanderStep() {
    if (this.busy || this.path.length || this.phase !== "wander") return;
    const lob = lobbyAABB(this.scene.waypoints);
    const dest = pickLobbyTile(lob, this.tilePos());
    await this.goTo(dest);
  }

  async beginExit() {
    this.phase = "exit";
    if (this.busy || this.path.length) return;
    const ent = entranceTile(this.scene.waypoints);
    const here = this.tilePos();
    if (here.x === ent.x && here.y === ent.y) {
      this.finish();
      return;
    }
    const ok = await this.goTo(ent);
    if (!ok) {
      // path blocked — still despawn so we don't leak
      this.finish();
    }
  }

  /** Clean up scene object and internal state. Returns the resolved promise from the cycle if one was set. */
  finish() {
    const cb = this._doneResolve;
    this.phase = "done";
    this.alive = false;
    this.path = [];
    try {
      this.shadowGfx?.destroy?.();
    } catch {
      /* ignore */
    }
    try {
      this.sprite?.destroy?.();
    } catch {
      /* ignore */
    }
    this.shadowGfx = null;
    this.sprite = null;
    if (cb) {
      this._doneResolve = null;
      cb(true);
    }
  }

  /** Alias for finish() — conforms to task spec method name. */
  despawn() {
    this.finish();
  }

  update(time, delta) {
    if (!this.alive || !this.sprite) return;

    if (!this.path.length) {
      const idleKey = `${this.id}-idle-${this.lastDir || "down"}`;
      if (this.sprite.anims.currentAnim?.key !== idleKey) {
        this.sprite.anims.play(idleKey, true);
      }

      if (this.phase === "wander" && !this.busy) {
        if (time >= this.wanderUntil) {
          this.beginExit();
        } else if (time >= this.idleUntil) {
          this.idleUntil = time + 700 + Math.random() * 900;
          this.wanderStep();
        }
      } else if (this.phase === "exit" && !this.busy) {
        this.beginExit();
      }
      this.syncShadow();
      return;
    }

    const target = this.path[this.pathIndex];
    const tx = target.x * this.tileSize + this.tileSize / 2;
    const ty = target.y * this.tileSize + this.tileSize / 2;
    const dx = tx - this.sprite.x;
    const dy = ty - this.sprite.y;
    const dist = Math.hypot(dx, dy);
    const step = (SPEED * delta) / 1000;

    if (dist <= step) {
      this.sprite.setPosition(tx, ty);
      this.pathIndex += 1;
      if (this.pathIndex >= this.path.length) {
        this.path = [];
        this.pathIndex = 0;
        if (this.phase === "enter") {
          this.phase = "wander";
          this.wanderUntil =
            time +
            WANDER_MIN_MS +
            Math.random() * (WANDER_MAX_MS - WANDER_MIN_MS);
          this.idleUntil = time + 400;
        } else if (this.phase === "exit") {
          this.finish();
        }
      }
    } else {
      this.sprite.x += (dx / dist) * step;
      this.sprite.y += (dy / dist) * step;
      const dir = this.facingFromDelta(dx, dy);
      this.lastDir = dir;
      const walkKey = `${this.id}-walk-${dir}`;
      if (this.sprite.anims.currentAnim?.key !== walkKey) {
        this.sprite.anims.play(walkKey, true);
      }
    }
    this.syncShadow();
  }
}

export class VisitorDirector {
  constructor(scene) {
    this.scene = scene;
    const mode = visitorModeFromQuery();
    this.enabled = mode.enabled;
    this.fast = mode.fast;
    this.visitor = null;
    this.visitCount = 0;
    this.lastPhase = null;

    // independent scheduler using native setTimeout — decoupled from game loop
    this._scheduler = new VisitorScheduler(() => this.spawnVisit());
    // initial spawn after short delay (preserves existing behavior)
    if (this.enabled) {
      const initDelay = this.fast ? 400 : 2500;
      setTimeout(() => {
        if (this.enabled) this.spawnVisit();
      }, initDelay);
    }
    scene.events.once("shutdown", () => this.destroy());
    this.publish();
  }

  destroy() {
    this._scheduler?.destroy();
    this._scheduler = null;
    this.visitor?.finish?.();
    this.visitor = null;
    this.enabled = false;
    this.publish();
  }

  /** Test/hook: spawn one visitor immediately (skips if already active). */
  spawnNow() {
    if (!this.enabled) return false;
    return this.spawnVisit();
  }

  /**
   * Public spawn per task spec: returns a Promise that resolves when the
   * visitor has fully despawned (or immediately on failure). Accepts optional
   * callback with signature (success: boolean).
   */
  spawn(callback) {
    if (!this.enabled) {
      const p = Promise.resolve(false);
      if (callback) callback(false);
      return p;
    }
    if (this.visitor?.alive) {
      const p = Promise.resolve(false);
      if (callback) callback(false);
      return p;
    }

    const ok = this.spawnVisit();
    if (!ok) {
      const p = Promise.resolve(false);
      if (callback) callback(false);
      return p;
    }

    return new Promise((resolve) => {
      this.visitor._doneResolve = (success) => {
        if (callback) callback(success);
        resolve(success);
      };
    });
  }

  spawnVisit() {
    if (!this.enabled) return false;
    if (this.visitor?.alive) return false;

    const ent = entranceTile(this.scene.waypoints);
    this.visitor = new Visitor(this.scene, ent);
    this.visitCount += 1;
    this.lastPhase = "enter";
    this.visitor.beginVisit();
    // emit custom event so UI layer can react (toast, etc.)
    this.scene.events.emit("visitor-spawned", {
      visitor: this.visitor,
      count: this.visitCount,
    });
    this.publish();
    return true;
  }

  update(time, delta) {
    if (!this.visitor) return;
    this.visitor.update(time, delta);
    this.lastPhase = this.visitor.phase;
    if (!this.visitor.alive) {
      const count = this.visitCount;
      this.visitor = null;
      this.scene.events.emit("visitor-despawned", { count });
      this.publish();
    } else if ((time / 500) | 0 !== this._lastPubBucket) {
      this._lastPubBucket = (time / 500) | 0;
      this.publish();
    }
  }

  snapshot() {
    const v = this.visitor;
    return {
      enabled: this.enabled,
      fast: this.fast,
      visitCount: this.visitCount,
      active: !!(v && v.alive),
      phase: v?.alive ? v.phase : null,
      sheet: v?.alive ? v.sheet : null,
      tile: v?.alive && v.sprite ? v.tilePos() : null,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      visitor: this.snapshot(),
    };
  }
}
