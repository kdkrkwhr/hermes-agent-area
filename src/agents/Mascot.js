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

  /**
   * Stop wander, face toward a world point (boss), short idle bounce.
   * @param {number} durationMs
   * @param {number} [faceX]
   * @param {number} [faceY]
   */
  startPet(durationMs, faceX, faceY) {
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
    if (this.busy) return;
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

  update(time, delta) {
    if (this.petUntil && time >= this.petUntil) {
      this.endPet();
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

    if (!this.path.length) {
      const idleKey = `${ID}-idle-${this.lastDir || "down"}`;
      if (this.sprite.anims.currentAnim?.key !== idleKey) {
        this.sprite.anims.play(idleKey, true);
      }
      if (!this.busy && time >= this.idleUntil) {
        // long pauses so we don't clog agent pathfinding
        this.idleUntil = time + 3500 + Math.random() * 6500;
        this.wander();
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
        this.idleUntil = time + 3000 + Math.random() * 5500;
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
    this.syncShadow();
  }
}
