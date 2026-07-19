import { pickStatus } from "../mock.js";
import {
  createDeskGlow,
  updateDeskGlow,
  focusFxEnabledFromQuery,
} from "../effects/deskGlow.js";
import {
  createSpriteShadow,
  updateSpriteShadow,
} from "../effects/spriteShadow.js";
import {
  createFootprintTrail,
  updateFootprintTrail,
  destroyFootprintTrail,
} from "../effects/footprintTrail.js";
import {
  createStatusFootRing,
  updateStatusFootRing,
  resolveStatusRingKey,
} from "../effects/statusFootRing.js";
import {
  createSkillChips,
  updateSkillChips,
  destroySkillChips,
} from "../effects/skillChips.js";
import {
  createThinkingDots,
  updateThinkingDots,
  destroyThinkingDots,
} from "../effects/thinkingDots.js";
import {
  urgencyModeFromQuery,
  resolveUrgencyProgress,
  maybeSpawnUrgencySweat,
  URGENCY_PULSE,
} from "../effects/runtimeUrgency.js";

const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };
const SPEED = 200; // match BE 200px/s @ 32px tiles

function truncateBubble(text, maxChars = 28) {
  const raw = String(text ?? "").replace(/\s+/g, " ").trim();
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, Math.max(0, maxChars - 1))}…`;
}

/** Compact task clock: 14s / 3m / 1h20m. Null/NaN → null (hide). */
export function formatTaskElapsed(seconds) {
  if (seconds == null || typeof seconds !== "number" || !Number.isFinite(seconds)) {
    return null;
  }
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h${m}m`;
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
      .text(px, py - 40, def.displayName, {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "16px",
        color: "#c8e8f4",
        align: "center",
        stroke: "#0b1016",
        strokeThickness: 6,
      })
      .setOrigin(0.5, 1)
      .setDepth(20);

    this.bubbleBg = scene.add.graphics().setDepth(21);
    this.bubbleText = scene.add
      .text(px, py - 52, "", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "12px",
        color: "#0e1620",
        align: "center",
        wordWrap: { width: 96 },
      })
      .setOrigin(0.5, 1)
      .setDepth(22);

    // thin progress under nameplate (running/chatting only)
    this.progressGfx = scene.add.graphics().setDepth(20).setVisible(false);
    // elapsed next to bar (task_elapsed_s); hidden when null
    this.elapsedLabel = scene.add
      .text(px + 18, py - 34, "", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "10px",
        color: "#a8d4e0",
        align: "left",
        stroke: "#0b1016",
        strokeThickness: 4,
      })
      .setOrigin(0, 0.5)
      .setDepth(20)
      .setVisible(false);
    // desk monitor glow (running/chatting) — see ?deskfx=0
    this.deskGlowGfx = createDeskGlow(scene);
    // soft foot shadow — see ?shadow=0; depth just under sprite (10 → 9)
    this.shadowGfx = createSpriteShadow(scene, { depth: 9 });
    // status-color soft foot ring — see ?statusring=0; above shadow, below sprite
    this.statusRingGfx = createStatusFootRing(scene, { depth: 9.5 });
    // walk footprint trail — see ?footprints=0; under shadow/sprite
    this.footprintTrail = createFootprintTrail(scene, { depth: 8 });
    // skill chips under nameplate — see ?skills=0 / ?skills=force
    this.skillChips = createSkillChips(scene);
    // chatting "..." above nameplate — see ?think=0 / ?think=force
    this.thinkingDots = createThinkingDots(scene);

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
      if (this.serverStatus === "chatting") return "running";
      if (this.serverStatus === "offline") return "sleep";
      if (this.serverStatus === "review") return "blocked";
      if (this.serverStatus === "ready" || this.serverStatus === "todo") return "ready";
      return this.serverStatus;
    }
    if (this.currentKind === "desk" || this.currentKind === "focus") return "running";
    if (this.currentKind === "meeting" || this.currentKind === "review") return "blocked";
    if (this.currentKind === "queue") return "ready";
    if (this.currentKind === "sleep") return "sleep";
    if (this.currentKind === "break") return "idle";
    return "idle";
  }

  drawBubble() {
    const padX = 6;
    const padY = 4;
    const w = this.bubbleText.width + padX * 2;
    const h = this.bubbleText.height + padY * 2;
    const x = this.sprite.x - w / 2;
    // clears nameplate + head even when wrapped tall
    const y = this.sprite.y - 76 - h;

    this.bubbleBg.clear();
    this.bubbleBg.fillStyle(0xd8f4f0, 0.94);
    this.bubbleBg.fillRoundedRect(x, y, w, h, 4);
    this.bubbleBg.lineStyle(2, 0x2a4a56, 1);
    this.bubbleBg.strokeRoundedRect(x, y, w, h, 4);
    this.bubbleBg.fillStyle(0xd8f4f0, 0.94);
    this.bubbleBg.fillTriangle(
      this.sprite.x - 4,
      y + h,
      this.sprite.x + 4,
      y + h,
      this.sprite.x,
      y + h + 6,
    );

    this.bubbleText.setPosition(this.sprite.x, y + h - padY);
  }

  /** Under-nameplate bar: fill if task_progress set, else indeterminate pulse.
   *  progress≥0.8 (or ?urgency=force) → rose/red soft pulse; sweat droplets occasional. */
  drawProgressBar() {
    const gfx = this.progressGfx;
    if (!gfx) return;

    const status = this.serverStatus;
    const show = status === "running" || status === "chatting";
    if (!show) {
      gfx.clear();
      gfx.setVisible(false);
      this._urgency = { progress: null, urgent: false, color: null };
      this.drawElapsedLabel(false);
      return;
    }

    const BAR_W = 28;
    const BAR_H = 4;
    const x = this.sprite.x - BAR_W / 2;
    const y = this.sprite.y - 36;

    gfx.setVisible(true);
    gfx.clear();
    gfx.fillStyle(0x0b1016, 0.88);
    gfx.fillRect(x, y, BAR_W, BAR_H);

    const mode = urgencyModeFromQuery();
    const resolved = resolveUrgencyProgress(this, mode);
    this._urgency = resolved;

    if (typeof resolved.progress === "number" && Number.isFinite(resolved.progress)) {
      const fill = Math.max(0, Math.min(1, resolved.progress));
      const fw = Math.max(1, Math.round(BAR_W * fill));
      if (resolved.urgent) {
        // soft pulse — rose/red, distinct from overtime amber / deskGlow teal
        const t = this.scene.time.now / 1000;
        const phase = (Math.sin(t * 4.2) + 1) / 2;
        const a = 0.72 + phase * 0.28;
        gfx.fillStyle(resolved.color, a);
        gfx.fillRect(x, y, fw, BAR_H);
        gfx.fillStyle(URGENCY_PULSE, 0.12 + phase * 0.28);
        gfx.fillRect(x, y, fw, BAR_H);
      } else {
        gfx.fillStyle(resolved.color, 1);
        gfx.fillRect(x, y, fw, BAR_H);
      }
      maybeSpawnUrgencySweat(this, resolved.urgent, mode, this.scene.time.now);
    } else {
      // indeterminate: slide a chunk; clock-driven so it pulses between WS polls
      // (no task_progress / max → no urgency)
      const t = this.scene.time.now / 1000;
      const phase = (Math.sin(t * 2.6) + 1) / 2;
      const seg = Math.max(6, Math.round(BAR_W * 0.35));
      const ox = x + (BAR_W - seg) * phase;
      gfx.fillStyle(0x7ec8e8, 1);
      gfx.fillRect(ox, y, seg, BAR_H);
    }

    this.drawElapsedLabel(true, x + BAR_W + 3, y + BAR_H / 2);
  }

  /** Short clock beside the bar; hidden when task_elapsed_s is null. */
  drawElapsedLabel(barVisible, lx, ly) {
    const label = this.elapsedLabel;
    if (!label) return;
    if (!barVisible) {
      label.setVisible(false);
      return;
    }
    const text = formatTaskElapsed(this.serverData?.task_elapsed_s);
    if (!text) {
      label.setVisible(false);
      return;
    }
    label.setText(text);
    label.setPosition(lx, ly);
    label.setVisible(true);
  }

  tilePos() {
    return {
      x: Math.floor(this.sprite.x / this.tileSize),
      y: Math.floor(this.sprite.y / this.tileSize),
    };
  }

  pickDestination() {
    const kinds = ["desk", "meeting", "break", "break", "break"];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    this.currentKind = kind;
    if (kind === "desk") {
      return { ...this.waypoints.desks[this.def.homeDesk], kind };
    }
    if (kind === "meeting") return { ...this.waypoints.meeting, kind };
    return this.pickLoungeSpot();
  }

  loungeSpots() {
    const lou = this.waypoints?.lounge;
    if (Array.isArray(lou) && lou.length) return lou;
    const b = this.waypoints?.break || { x: 31, y: 4 };
    return [
      b,
      { x: b.x - 2, y: b.y + 1 },
      { x: b.x + 2, y: b.y },
      { x: b.x + 4, y: b.y - 1 },
      { x: b.x - 1, y: b.y + 3 },
      { x: b.x + 3, y: b.y + 2 },
    ];
  }

  pickLoungeSpot() {
    const spots = this.loungeSpots();
    const here = this.tilePos();
    const others = spots.filter((s) => s.x !== here.x || s.y !== here.y);
    const pool = others.length ? others : spots;
    const dest = pool[Math.floor(Math.random() * pool.length)];
    this.currentKind = "break";
    return { ...dest, kind: "break" };
  }

  /** Pathfind to tile; empty/fail → false, no throw. */
  async moveToTile(tx, ty) {
    if (this.busy) return false;
    this.busy = true;
    try {
      const from = this.tilePos();
      if (from.x === tx && from.y === ty) {
        this.path = [];
        this.pathIndex = 0;
        return true;
      }
      const path = await this.scene.pathfinder.findPath(
        from.x,
        from.y,
        tx,
        ty,
      );
      if (!path.length) return false;
      this.path = path.slice(1);
      this.pathIndex = 0;
      return true;
    } catch {
      return false;
    } finally {
      this.busy = false;
    }
  }

  async wanderLounge() {
    if (this.busy) return;
    // live+idle: stroll lounge; mock: same path when break-biased
    if (this.live && this.serverStatus && this.serverStatus !== "idle") return;
    this.busy = true;
    const dest = this.pickLoungeSpot();
    const from = this.tilePos();
    const path = await this.scene.pathfinder.findPath(from.x, from.y, dest.x, dest.y);
    if (!path.length) {
      this.busy = false;
      this.idleUntil = this.scene.time.now + 1500;
      return;
    }
    this.path = path.slice(1);
    this.pathIndex = 0;
    // keep live bubble ("휴식 중 ☕"); mock refreshes break flavor
    if (!this.live) this.setStatus(pickStatus(this.def, "break"));
    this.busy = false;
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

  setDisplayName(name) {
    const next = String(name || "").trim();
    if (!next || next === this.def.displayName) return;
    this.def.displayName = next;
    this.nameLabel.setText(next);
  }

  destroy() {
    this.sprite?.destroy();
    this.nameLabel?.destroy();
    this.bubbleBg?.destroy();
    this.bubbleText?.destroy();
    this.progressGfx?.destroy();
    this.elapsedLabel?.destroy();
    this.deskGlowGfx?.destroy();
    this.shadowGfx?.destroy();
    this.statusRingGfx?.destroy();
    this.statusRingGfx = null;
    destroyFootprintTrail(this.footprintTrail);
    this.footprintTrail = null;
    destroySkillChips(this.skillChips);
    this.skillChips = null;
    destroyThinkingDots(this.thinkingDots);
    this.thinkingDots = null;
  }

  async applyServer(agentMsg) {
    if (!agentMsg) return;
    if (agentMsg.displayName) this.setDisplayName(agentMsg.displayName);
    const prevStatus = this.serverStatus;
    this.serverData = { ...agentMsg, displayName: this.def.displayName };
    this.serverStatus = agentMsg.status;
    // don't clobber event-owned bubbles (stretch / water cooler / phone / bug bash)
    if (
      agentMsg.bubble &&
      this._stretchBackup == null &&
      this._waterBackup == null &&
      this._phoneBackup == null &&
      this._bugBashBackup == null
    ) {
      this.setStatus(agentMsg.bubble);
    }

    const alpha = agentMsg.status === "offline" ? 0.45 : 1;
    this.sprite.setAlpha(alpha);
    this.nameLabel.setAlpha(alpha);
    this.progressGfx?.setAlpha(alpha);
    this.elapsedLabel?.setAlpha(alpha);

    let zone = agentMsg.zone;
    let destX = agentMsg.dest_x ?? agentMsg.x;
    let destY = agentMsg.dest_y ?? agentMsg.y;

    // ?focusfx=0 → force Open Desk tile (regression)
    if (zone === "focus" && !focusFxEnabledFromQuery()) {
      zone = "desk";
      this.serverData.zone = "desk";
      const desks = this.waypoints?.desks || [];
      const d = desks[(this.def.homeDesk ?? 0) % Math.max(1, desks.length)];
      if (d) {
        destX = d.x * this.tileSize + this.tileSize / 2;
        destY = d.y * this.tileSize + this.tileSize / 2;
      }
    }

    if (destX == null || destY == null) return;

    // zone hint for FX (sleep = Nap Pod Zzz; break = lounge steam; focus = desk glow)
    if (zone === "sleep" || agentMsg.status === "offline") {
      this.currentKind = "sleep";
    } else if (zone === "meeting" || agentMsg.status === "blocked") {
      this.currentKind = "meeting";
    } else if (zone === "review" || agentMsg.status === "review") {
      this.currentKind = "review";
    } else if (zone === "queue" || agentMsg.status === "ready" || agentMsg.status === "todo") {
      this.currentKind = "queue";
    } else if (zone === "focus") {
      this.currentKind = "focus";
    } else if (
      zone === "desk" ||
      agentMsg.status === "running" ||
      agentMsg.status === "chatting"
    ) {
      this.currentKind = "desk";
    }

    // idle: stroll lounge locally — don't yank back to BE dest every poll
    if (agentMsg.status === "idle") {
      this.currentKind = "break";
      if (prevStatus === "idle") {
        // already resting — wanderLounge drives movement
        if (!this.path.length && this.scene.time.now >= this.idleUntil) {
          this.idleUntil = this.scene.time.now + 800;
          this.wanderLounge();
        }
        return;
      }
      // first enter idle — walk to lounge, then wander
      this._liveDestKey = "";
      this.idleUntil = this.scene.time.now + 600;
    } else if (prevStatus === "idle") {
      // left rest — clear lounge wander latch
      this._liveDestKey = "";
    }

    const tx = Math.floor(destX / this.tileSize);
    const ty = Math.floor(destY / this.tileSize);
    const key = `${tx},${ty}:${agentMsg.status}:${zone || ""}`;
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
      if (!this.busy && time >= this.idleUntil) {
        if (this.serverStatus === "offline" || this.currentKind === "sleep") {
          // Nap Pod — stay put (no lounge wander / mock roam)
          this.idleUntil = time + 999999;
        } else if (this.live && this.serverStatus === "idle") {
          this.idleUntil = time + 2200 + Math.random() * 3800;
          this.wanderLounge();
        } else if (!this.live) {
          this.idleUntil = time + 1800 + Math.random() * 2500;
          this.goRandom();
        }
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
    this.nameLabel.setPosition(this.sprite.x, this.sprite.y - 40);
    this.drawBubble();
    this.drawProgressBar();
    updateDeskGlow(
      this.deskGlowGfx,
      this,
      this.scene.deskFxEnabled !== false,
    );
    updateSpriteShadow(this.shadowGfx, this.sprite, {
      moving: this.path.length > 0,
    });
    updateStatusFootRing(this.statusRingGfx, this.sprite, {
      moving: this.path.length > 0,
      statusKey: resolveStatusRingKey(this),
    });
    updateFootprintTrail(this.footprintTrail, this.sprite, {
      moving: this.path.length > 0,
      dir: this.lastDir || "down",
    });
    updateSkillChips(this.skillChips, this);
    updateThinkingDots(this.thinkingDots, this);
  }
}
