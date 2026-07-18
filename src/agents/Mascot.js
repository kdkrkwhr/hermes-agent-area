/** Ambient lounge/corridor cat — no click, no chat. `?mascot=0` disables. */

import {
  createSpriteShadow,
  updateSpriteShadow,
} from "../effects/spriteShadow.js";
import {
  createFootprintTrail,
  updateFootprintTrail,
} from "../effects/footprintTrail.js";

const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };
const SPEED = 52; // lazy lounge pace (agents ~200)
/** mascot_zoomies dash pace — still under agent sprint feel */
const ZOOMIES_SPEED = 210;
const SHEET = "char-mascot";
const ID = "mascot";

/** Default on; `?mascot=0|false|off` skips spawn. */
export function mascotEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  const v = new URLSearchParams(location.search).get("mascot");
  if (v == null || v === "") return true;
  return !(v === "0" || v === "false" || v === "off");
}

export class Mascot {
  constructor(scene, startTile, waypoints) {
    this.scene = scene;
    this.waypoints = waypoints;
    this.tileSize = scene.map.tileWidth;
    this.path = [];
    this.pathIndex = 0;
    this.busy = false;
    this.idleUntil = scene.time.now + 800;
    this.lastDir = "down";
    /** @type {number} pet-mode end time (scene.time.now); 0 = off */
    this.petUntil = 0;
    this._petBaseY = null;
    /** @type {number} zoomies end time (scene.time.now); 0 = off */
    this.zoomiesUntil = 0;
    /** @type {{x:number,y:number}[]} remaining lounge dash targets */
    this.zoomiesQueue = [];
    this._zoomiesBusy = false;
    /** @type {number} ambient nap end time (scene.time.now); 0 = off */
    this.napUntil = 0;
    /** traveling toward sleep spot (blocks wander) */
    this._napTraveling = false;
    this._napBaseY = null;
    /** @type {Phaser.GameObjects.Particles.ParticleEmitter|null} */
    this._napZzz = null;

    const px = startTile.x * this.tileSize + this.tileSize / 2;
    const py = startTile.y * this.tileSize + this.tileSize / 2;

    this.sprite = scene.add.sprite(px, py, SHEET, 0);
    this.sprite.setDepth(9); // slightly under agents (10)
    this.sprite.setOrigin(0.5, 0.85);
    // soft foot shadow — see ?shadow=0; under mascot (9 → 8)
    this.shadowGfx = createSpriteShadow(scene, { depth: 8 });
    this.footprintTrail = createFootprintTrail(scene, { depth: 7 });

    this.ensureAnims();
    this.sprite.anims.play(`${ID}-idle-down`, true);
  }

  isPetting(time = this.scene.time.now) {
    return time < (this.petUntil || 0);
  }

  isZoomies(time = this.scene.time.now) {
    return time < (this.zoomiesUntil || 0);
  }

  isNapping(time = this.scene.time.now) {
    return time < (this.napUntil || 0);
  }

  /** True while pathing to a nap spot or curling. */
  isNapBusy() {
    return this._napTraveling || this.isNapping();
  }

  beginNapTravel() {
    this._napTraveling = true;
    this.busy = false;
  }

  clearNapTravel() {
    this._napTraveling = false;
  }

  /**
   * Soft curl + fx-zzz for ambient nap. Caller must skip if zoomies/pet active.
   * @param {number} durationMs
   */
  startNap(durationMs) {
    if (this.isZoomies() || this.isPetting()) return;
    this._napTraveling = false;
    this.path = [];
    this.pathIndex = 0;
    this.busy = false;
    const now = this.scene.time.now;
    this.napUntil = now + Math.max(1200, durationMs || 8000);
    this.lastDir = "down";
    const idleKey = `${ID}-idle-down`;
    try {
      this.sprite.anims.play(idleKey, true);
    } catch {
      /* ignore */
    }
    this.scene.tweens.killTweensOf(this.sprite);
    this._napBaseY = this.sprite.y;
    this.sprite.setScale(1, 1);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleY: 0.72,
      scaleX: 1.12,
      y: this.sprite.y + 3,
      duration: 380,
      ease: "Sine.easeOut",
    });
    this._ensureNapZzz();
  }

  endNap() {
    if (!this.napUntil && !this._napZzz) {
      this._napTraveling = false;
      return;
    }
    this.napUntil = 0;
    this._napTraveling = false;
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setScale(1, 1);
    if (this._napBaseY != null) {
      this.sprite.y = this._napBaseY;
      this._napBaseY = null;
    }
    this._killNapZzz();
    this.idleUntil = this.scene.time.now + 1400 + Math.random() * 1200;
  }

  _ensureNapZzz() {
    this._killNapZzz();
    if (!this.scene.textures.exists("fx-zzz")) return;
    const em = this.scene.add.particles(0, 0, "fx-zzz", {
      follow: this.sprite,
      followOffset: { x: 2, y: -22 },
      speedX: { min: -5, max: 10 },
      speedY: { min: -20, max: -9 },
      scale: { start: 1.05, end: 0.25 },
      alpha: { start: 0.85, end: 0 },
      lifespan: { min: 1000, max: 1500 },
      frequency: 340,
      quantity: 1,
      tint: [0xb8c8e8, 0xd0d8f0, 0x9aacc8],
      rotate: { min: -10, max: 14 },
    });
    em.setDepth(9);
    this._napZzz = em;
  }

  _killNapZzz() {
    if (!this._napZzz) return;
    try {
      this._napZzz.stop();
      this._napZzz.destroy();
    } catch {
      /* ignore */
    }
    this._napZzz = null;
  }

  /**
   * Stop wander, face toward a world point (boss), short idle bounce.
   * @param {number} durationMs
   * @param {number} [faceX]
   * @param {number} [faceY]
   */
  startPet(durationMs, faceX, faceY) {
    if (this.isNapping()) this.endNap();
    if (this.isZoomies()) this.endZoomies();
    const now = this.scene.time.now;
    this.path = [];
    this.pathIndex = 0;
    this.busy = false;
    this.petUntil = now + Math.max(400, durationMs || 5000);
    if (typeof faceX === "number" && typeof faceY === "number") {
      this.lastDir = this.facingFromDelta(
        faceX - this.sprite.x,
        faceY - this.sprite.y,
      );
    }
    const idleKey = `${ID}-idle-${this.lastDir || "down"}`;
    try {
      this.sprite.anims.play(idleKey, true);
    } catch {
      /* ignore */
    }
    this.scene.tweens.killTweensOf(this.sprite);
    this._petBaseY = this.sprite.y;
    this.sprite.setScale(1, 1);
    const repeats = Math.max(3, Math.floor((durationMs || 5000) / 450));
    this.scene.tweens.add({
      targets: this.sprite,
      scaleY: 1.14,
      y: this.sprite.y - 5,
      duration: 200,
      yoyo: true,
      repeat: repeats,
      ease: "Sine.easeInOut",
    });
  }

  endPet() {
    if (!this.petUntil) return;
    this.petUntil = 0;
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setScale(1, 1);
    if (this._petBaseY != null) {
      this.sprite.y = this._petBaseY;
      this._petBaseY = null;
    }
    this.idleUntil = this.scene.time.now + 1200 + Math.random() * 800;
  }

  /**
   * Fast dash through lounge waypoints for `durationMs`, then back to wander.
   * @param {number} durationMs
   * @param {{x:number,y:number}[]} destinations
   */
  startZoomies(durationMs, destinations) {
    if (this.isNapping()) this.endNap();
    if (this.isPetting()) this.endPet();
    this.path = [];
    this.pathIndex = 0;
    this.busy = false;
    this._zoomiesBusy = false;
    const now = this.scene.time.now;
    this.zoomiesUntil = now + Math.max(1200, durationMs || 5000);
    this.zoomiesQueue = Array.isArray(destinations)
      ? destinations.filter((d) => d && Number.isFinite(d.x) && Number.isFinite(d.y))
      : [];
    void this.dashNextZoomies();
  }

  endZoomies() {
    if (!this.zoomiesUntil && !this.zoomiesQueue.length) return;
    this.zoomiesUntil = 0;
    this.zoomiesQueue = [];
    this._zoomiesBusy = false;
    this.path = [];
    this.pathIndex = 0;
    this.idleUntil = this.scene.time.now + 900 + Math.random() * 1100;
  }

  /** Pathfind to the next queued lounge tile (mascot pathfinder only). */
  async dashNextZoomies() {
    if (!this.isZoomies() || this._zoomiesBusy) return;
    if (!this.zoomiesQueue.length) return;
    this._zoomiesBusy = true;
    const dest = this.zoomiesQueue.shift();
    const from = this.tilePos();
    try {
      const path = await this.scene.pathfinder.findPath(
        from.x,
        from.y,
        dest.x,
        dest.y,
      );
      if (path.length) {
        this.path = path.slice(1);
        this.pathIndex = 0;
      } else if (this.zoomiesQueue.length) {
        this._zoomiesBusy = false;
        void this.dashNextZoomies();
        return;
      }
    } catch {
      /* ignore */
    } finally {
      this._zoomiesBusy = false;
    }
  }

  syncShadow() {
    updateSpriteShadow(this.shadowGfx, this.sprite, {
      moving: this.path.length > 0,
      width: 16,
      height: 6,
    });
    updateFootprintTrail(this.footprintTrail, this.sprite, {
      moving: this.path.length > 0,
      width: 8,
      height: 4,
      dir: this.lastDir || "down",
    });
  }

  ensureAnims() {
    const scene = this.scene;
    for (const dir of ["down", "left", "right", "up"]) {
      const row = DIR_ROW[dir];
      const walkKey = `${ID}-walk-${dir}`;
      const idleKey = `${ID}-idle-${dir}`;
      if (!scene.anims.exists(walkKey)) {
        scene.anims.create({
          key: walkKey,
          frames: scene.anims.generateFrameNumbers(SHEET, {
            frames: [row * 3, row * 3 + 1, row * 3 + 2, row * 3 + 1],
          }),
          frameRate: 5,
          repeat: -1,
        });
      }
      if (!scene.anims.exists(idleKey)) {
        scene.anims.create({
          key: idleKey,
          frames: [{ key: SHEET, frame: row * 3 }],
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

  loungeSpots() {
    const lou = this.waypoints?.lounge;
    if (Array.isArray(lou) && lou.length) return lou;
    const b = this.waypoints?.break || { x: 31, y: 4 };
    return [b, { x: b.x + 1, y: b.y + 1 }, { x: b.x - 1, y: b.y + 2 }];
  }

  pickLoungeSpot() {
    const spots = this.loungeSpots();
    const here = this.tilePos();
    const others = spots.filter((s) => s.x !== here.x || s.y !== here.y);
    const pool = others.length ? others : spots;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  async wander() {
    if (this.busy || this.isZoomies() || this.isPetting() || this.isNapBusy()) {
      return;
    }
    this.busy = true;
    const dest = this.pickLoungeSpot();
    const from = this.tilePos();
    try {
      const path = await this.scene.pathfinder.findPath(
        from.x,
        from.y,
        dest.x,
        dest.y,
      );
      if (!path.length) {
        this.idleUntil = this.scene.time.now + 2000 + Math.random() * 2000;
        return;
      }
      this.path = path.slice(1);
      this.pathIndex = 0;
    } catch {
      this.idleUntil = this.scene.time.now + 2500;
    } finally {
      this.busy = false;
    }
  }

  facingFromDelta(dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "left" : "right";
    return dy < 0 ? "up" : "down";
  }

  /** Shared tile-step mover; returns true when a path node was consumed. */
  stepAlongPath(time, delta, speed) {
    if (!this.path.length) return false;
    const target = this.path[this.pathIndex];
    const tx = target.x * this.tileSize + this.tileSize / 2;
    const ty = target.y * this.tileSize + this.tileSize / 2;
    const dx = tx - this.sprite.x;
    const dy = ty - this.sprite.y;
    const dist = Math.hypot(dx, dy);
    const step = (speed * delta) / 1000;

    if (dist <= step) {
      this.sprite.setPosition(tx, ty);
      this.pathIndex += 1;
      if (this.pathIndex >= this.path.length) {
        this.path = [];
        this.pathIndex = 0;
        return true;
      }
    } else {
      this.sprite.x += (dx / dist) * step;
      this.sprite.y += (dy / dist) * step;
      const dir = this.facingFromDelta(dx, dy);
      this.lastDir = dir;
      const walkKey = `${ID}-walk-${dir}`;
      if (this.sprite.anims.currentAnim?.key !== walkKey) {
        this.sprite.anims.play(walkKey, true);
      }
    }
    return false;
  }

  update(time, delta) {
    if (this.zoomiesUntil && time >= this.zoomiesUntil) {
      this.endZoomies();
    }
    if (this.petUntil && time >= this.petUntil) {
      this.endPet();
    }
    if (this.napUntil && time >= this.napUntil) {
      this.endNap();
    }

    if (this.isZoomies(time)) {
      if (!this.path.length) {
        const idleKey = `${ID}-idle-${this.lastDir || "down"}`;
        if (this.sprite.anims.currentAnim?.key !== idleKey) {
          try {
            this.sprite.anims.play(idleKey, true);
          } catch {
            /* ignore */
          }
        }
        if (!this._zoomiesBusy && this.zoomiesQueue.length) {
          void this.dashNextZoomies();
        }
        this.syncShadow();
        return;
      }
      const finished = this.stepAlongPath(time, delta, ZOOMIES_SPEED);
      if (finished && this.zoomiesQueue.length) {
        void this.dashNextZoomies();
      }
      this.syncShadow();
      return;
    }

    if (this.isPetting(time)) {
      const idleKey = `${ID}-idle-${this.lastDir || "down"}`;
      if (this.sprite.anims.currentAnim?.key !== idleKey) {
        try {
          this.sprite.anims.play(idleKey, true);
        } catch {
          /* ignore */
        }
      }
      this.syncShadow();
      return;
    }

    if (this.isNapping(time)) {
      const idleKey = `${ID}-idle-down`;
      if (this.sprite.anims.currentAnim?.key !== idleKey) {
        try {
          this.sprite.anims.play(idleKey, true);
        } catch {
          /* ignore */
        }
      }
      this.syncShadow();
      return;
    }

    if (!this.path.length) {
      const idleKey = `${ID}-idle-${this.lastDir || "down"}`;
      if (this.sprite.anims.currentAnim?.key !== idleKey) {
        this.sprite.anims.play(idleKey, true);
      }
      if (
        !this.busy &&
        !this._napTraveling &&
        time >= this.idleUntil
      ) {
        // long pauses so we don't clog agent pathfinding
        this.idleUntil = time + 3500 + Math.random() * 6500;
        this.wander();
      }
      this.syncShadow();
      return;
    }

    const finished = this.stepAlongPath(time, delta, SPEED);
    if (finished) {
      this.idleUntil = time + 3000 + Math.random() * 5500;
    }
    this.syncShadow();
  }
}
