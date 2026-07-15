import { pickStatus } from "../mock.js";

const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };
const SPEED = 100; // match BE 100px/s

function truncateBubble(text, maxChars = 28) {
  const raw = String(text ?? "").replace(/\s+/g, " ").trim();
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, Math.max(0, maxChars - 1))}…`;
}

export class Agent {
  constructor(scene, def, startTile, waypoints) {
    this.scene = scene;
    this.def = def;
    this.waypoints = waypoints;
    this.tileSize = scene.map.tileWidth;
    this.path = [];
    this.pathIndex = 0;
    this.busy = false;
    this.idleUntil = 0;
    this.currentKind = "desk";
    this.live = false;
    this._liveDestKey = "";
    this.serverStatus = null;
    this.serverData = null;

    const px = startTile.x * this.tileSize + this.tileSize / 2;
    const py = startTile.y * this.tileSize + this.tileSize / 2;

    this.sprite = scene.add.sprite(px, py, def.sheet, 0);
    this.sprite.setDepth(10);
    this.sprite.setOrigin(0.5, 0.85);
    this.sprite.setInteractive({ useHandCursor: true, pixelPerfect: true });
    this.sprite.on("pointerdown", () => {
      if (scene.onAgentSpriteClick) scene.onAgentSpriteClick(this);
    });

    this.nameLabel = scene.add
      .text(px, py - 20, def.displayName, {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "8px",
        color: "#c8e8f4",
        align: "center",
        stroke: "#0b1016",
        strokeThickness: 3,
        resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(20);

    this.bubbleBg = scene.add.graphics().setDepth(21);
    this.bubbleText = scene.add
      .text(px, py - 26, "", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "6px",
        color: "#0e1620",
        align: "center",
        wordWrap: { width: 48 },
        resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(22);

    this.setStatus(pickStatus(def, "desk"));
    this.ensureAnims();
    this.sprite.anims.play(`${def.id}-idle-down`, true);
  }

  setLive(on) {
    this.live = !!on;
    if (this.live) {
      this.path = [];
      this.pathIndex = 0;
      this.busy = false;
    }
  }

  ensureAnims() {
    const scene = this.scene;
    const id = this.def.id;
    const dirs = ["down", "left", "right", "up"];
    for (const dir of dirs) {
      const row = DIR_ROW[dir];
      const walkKey = `${id}-walk-${dir}`;
      const idleKey = `${id}-idle-${dir}`;
      if (!scene.anims.exists(walkKey)) {
        scene.anims.create({
          key: walkKey,
          frames: scene.anims.generateFrameNumbers(this.def.sheet, {
            frames: [row * 3, row * 3 + 1, row * 3 + 2, row * 3 + 1],
          }),
          frameRate: 8,
          repeat: -1,
        });
      }
      if (!scene.anims.exists(idleKey)) {
        scene.anims.create({
          key: idleKey,
          frames: [{ key: this.def.sheet, frame: row * 3 }],
          frameRate: 1,
        });
      }
    }
  }

  setStatus(text) {
    this.statusText = text;
    // long live-WS lines must not bury the sprite — keep short display
    const shown = truncateBubble(text, 28);
    this.bubbleText.setText(shown);
    this.drawBubble();
  }

  /** Particle/lighting hook: live server status or mock room kind. */
  getEffectKind() {
    if (this.live && this.serverStatus) {
      // chatting uses same desk FX as running
      return this.serverStatus === "chatting" ? "running" : this.serverStatus;
    }
    if (this.currentKind === "desk") return "running";
    if (this.currentKind === "meeting") return "blocked";
    if (this.currentKind === "break" || this.currentKind === "sleep") return "idle";
    return "idle";
  }

  drawBubble() {
    const padX = 3;
    const padY = 2;
    const w = this.bubbleText.width + padX * 2;
    const h = this.bubbleText.height + padY * 2;
    const x = this.sprite.x - w / 2;
    // clears nameplate + head even when wrapped tall
    const y = this.sprite.y - 38 - h;

    this.bubbleBg.clear();
    this.bubbleBg.fillStyle(0xd8f4f0, 0.94);
    this.bubbleBg.fillRoundedRect(x, y, w, h, 2);
    this.bubbleBg.lineStyle(1, 0x2a4a56, 1);
    this.bubbleBg.strokeRoundedRect(x, y, w, h, 2);
    this.bubbleBg.fillStyle(0xd8f4f0, 0.94);
    this.bubbleBg.fillTriangle(
      this.sprite.x - 2,
      y + h,
      this.sprite.x + 2,
      y + h,
      this.sprite.x,
      y + h + 3,
    );

    this.bubbleText.setPosition(this.sprite.x, y + h - padY);
  }

  tilePos() {
    return {
      x: Math.floor(this.sprite.x / this.tileSize),
      y: Math.floor(this.sprite.y / this.tileSize),
    };
  }

  pickDestination() {
    const kinds = ["desk", "meeting", "break", "sleep"];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    this.currentKind = kind;
    if (kind === "desk") {
      return { ...this.waypoints.desks[this.def.homeDesk], kind };
    }
    if (kind === "meeting") return { ...this.waypoints.meeting, kind };
    if (kind === "sleep" && this.waypoints.sleep) {
      return { ...this.waypoints.sleep, kind };
    }
    return { ...this.waypoints.break, kind };
  }

  async goRandom() {
    if (this.live || this.busy) return;
    this.busy = true;
    const dest = this.pickDestination();
    const from = this.tilePos();
    const path = await this.scene.pathfinder.findPath(from.x, from.y, dest.x, dest.y);
    if (!path.length) {
      this.busy = false;
      this.idleUntil = this.scene.time.now + 1200;
      return;
    }
    this.path = path.slice(1);
    this.pathIndex = 0;
    this.setStatus(pickStatus(this.def, dest.kind));
    this.busy = false;
  }

  async applyServer(agentMsg) {
    if (!agentMsg) return;
    this.serverData = { ...agentMsg, displayName: this.def.displayName };
    this.serverStatus = agentMsg.status;
    if (agentMsg.bubble) this.setStatus(agentMsg.bubble);

    const alpha = agentMsg.status === "offline" ? 0.45 : 1;
    this.sprite.setAlpha(alpha);
    this.nameLabel.setAlpha(alpha);

    const destX = agentMsg.dest_x ?? agentMsg.x;
    const destY = agentMsg.dest_y ?? agentMsg.y;
    if (destX == null || destY == null) return;

    const tx = Math.floor(destX / this.tileSize);
    const ty = Math.floor(destY / this.tileSize);
    const key = `${tx},${ty}:${agentMsg.status}`;
    if (key === this._liveDestKey && this.path.length) return;
    if (key === this._liveDestKey && !this.path.length) {
      // already arrived
      return;
    }
    this._liveDestKey = key;

    if (this.busy) return;
    this.busy = true;
    const from = this.tilePos();
    if (from.x === tx && from.y === ty) {
      this.busy = false;
      return;
    }
    const path = await this.scene.pathfinder.findPath(from.x, from.y, tx, ty);
    this.path = path.length ? path.slice(1) : [];
    this.pathIndex = 0;
    this.busy = false;
  }

  facingFromDelta(dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "left" : "right";
    return dy < 0 ? "up" : "down";
  }

  update(time, delta) {
    if (!this.path.length) {
      const dir = this.lastDir || "down";
      const idleKey = `${this.def.id}-idle-${dir}`;
      if (this.sprite.anims.currentAnim?.key !== idleKey) {
        this.sprite.anims.play(idleKey, true);
      }
      if (!this.live && !this.busy && time >= this.idleUntil) {
        this.idleUntil = time + 1800 + Math.random() * 2500;
        this.goRandom();
      }
      this.syncUi();
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
      }
    } else {
      this.sprite.x += (dx / dist) * step;
      this.sprite.y += (dy / dist) * step;
      const dir = this.facingFromDelta(dx, dy);
      this.lastDir = dir;
      const walkKey = `${this.def.id}-walk-${dir}`;
      if (this.sprite.anims.currentAnim?.key !== walkKey) {
        this.sprite.anims.play(walkKey, true);
      }
    }

    this.syncUi();
  }

  syncUi() {
    this.nameLabel.setPosition(this.sprite.x, this.sprite.y - 20);
    this.drawBubble();
  }
}
