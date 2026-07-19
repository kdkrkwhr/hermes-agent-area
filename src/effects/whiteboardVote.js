/** War Room whiteboard (GID15) vote/reaction stickers. Soft bob.
 *  `?wbvote=0` off · `?wbvote=1|force` always dense (smoke).
 */

import { parseKanbanStats } from "../kanbanPanel.js";
import {
  findWhiteboardAnchor,
  WHITEBOARD_GID,
} from "../ui/whiteboardTicker.js";

/** Above scribble (7); below ticker (8). */
const DEPTH = 7.5;
const MAX_STICKERS = 6;
const IDLE_COUNT = 3;
const BUSY_COUNT = 6;
const SWAP_MS_MIN = 60000;
const SWAP_MS_MAX = 120000;
const FORCE_SWAP_MS_MIN = 1800;
const FORCE_SWAP_MS_MAX = 3200;
const BOB_MS = 2800;
const BOB_PX = 1.4;
const TEX_DOT = "fx-wbvote-dot";
const TEX_CHECK = "fx-wbvote-check";
const TEX_CROSS = "fx-wbvote-cross";
const PASTELS = [0xfff3a0, 0xffc8d8, 0xc8e8ff, 0xd4f5c8, 0xe8d4ff, 0xffe0b8];

/**
 * Query: omit = on. `0`/`off`/`false` = never.
 * `1`/`on`/`true`/`force` = always dense + fast swap.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function wbvoteModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("wbvote");
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

export function wbvoteEnabledFromQuery() {
  return wbvoteModeFromQuery().enabled;
}

function pickSwapMs(forced) {
  if (forced) {
    return (
      FORCE_SWAP_MS_MIN +
      Math.floor(Math.random() * (FORCE_SWAP_MS_MAX - FORCE_SWAP_MS_MIN + 1))
    );
  }
  return (
    SWAP_MS_MIN + Math.floor(Math.random() * (SWAP_MS_MAX - SWAP_MS_MIN + 1))
  );
}

function ensureTextures(scene) {
  if (!scene.textures.exists(TEX_DOT)) {
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(1, 1, 10, 10, 1.5);
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(4, 4, 2.2);
    g.generateTexture(TEX_DOT, 12, 12);
    g.destroy();
  }
  if (!scene.textures.exists(TEX_CHECK)) {
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(1, 1, 10, 10, 1.5);
    g.lineStyle(1.6, 0x2a8a4a, 1);
    g.beginPath();
    g.moveTo(3, 6.5);
    g.lineTo(5.2, 8.5);
    g.lineTo(9, 3.5);
    g.strokePath();
    g.generateTexture(TEX_CHECK, 12, 12);
    g.destroy();
  }
  if (!scene.textures.exists(TEX_CROSS)) {
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(1, 1, 10, 10, 1.5);
    g.lineStyle(1.5, 0xb04050, 1);
    g.beginPath();
    g.moveTo(3.5, 3.5);
    g.lineTo(8.5, 8.5);
    g.moveTo(8.5, 3.5);
    g.lineTo(3.5, 8.5);
    g.strokePath();
    g.generateTexture(TEX_CROSS, 12, 12);
    g.destroy();
  }
}

function pickTexKey() {
  const r = Math.random();
  if (r < 0.45) return TEX_DOT;
  if (r < 0.75) return TEX_CHECK;
  return TEX_CROSS;
}

function randomBoardOffset() {
  return {
    ox: (Math.random() - 0.5) * 40,
    oy: (Math.random() - 0.5) * 24 + 4,
  };
}

/**
 * Soft vote/reaction stickers on War Room whiteboard.
 */
export class WhiteboardVote {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = wbvoteModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.anchor = this.enabled ? findWhiteboardAnchor(scene) : null;
    /** @type {{ img: Phaser.GameObjects.Image, ox: number, oy: number, phase: number, bornAt: number }[]} */
    this.stickers = [];
    this.nextSwapAt = 0;
    this.swapCount = 0;
    this.burstCount = 0;
    this.lastAt = null;
    this.lastReason = null;
    this.density = "idle";
    this._lastKey = "";

    if (this.enabled && this.anchor) {
      ensureTextures(scene);
      const now = scene.time?.now ?? 0;
      const n = this.targetCount();
      for (let i = 0; i < n; i++) this._spawnOne("init");
      this.nextSwapAt = now + pickSwapMs(this.forced);
    }

    scene.events.once("shutdown", () => this.destroy());
    this.publish();
  }

  shouldRun() {
    return this.enabled && !!this.anchor;
  }

  /**
   * High density when review agents ≥1, kanban review ≥1,
   * or review_huddle / sprint_retro / bug_bash is the latest event. Force = always busy.
   */
  isBusy() {
    if (this.forced) return true;
    const agents = this.scene.agents || [];
    for (const a of agents) {
      if (a?.serverStatus === "review" || a?.currentKind === "review") {
        return true;
      }
    }
    const ev = this.scene.officeEvents?.lastEvent;
    if (ev === "review_huddle" || ev === "sprint_retro" || ev === "bug_bash")
      return true;
    try {
      const stats = parseKanbanStats(this.scene.lastSnapshot?.stats?.raw);
      if ((stats?.review ?? 0) >= 1) return true;
    } catch {
      /* ignore */
    }
    return false;
  }

  targetCount() {
    if (!this.shouldRun()) return 0;
    return this.isBusy() ? BUSY_COUNT : IDLE_COUNT;
  }

  /**
   * @param {number} now
   * @param {number} [_delta]
   */
  update(now, _delta = 16) {
    if (!this.shouldRun()) {
      this.publish();
      return;
    }

    const busy = this.isBusy();
    this.density = busy ? "busy" : "idle";
    const want = this.targetCount();

    // soft bob
    const t = now / BOB_MS;
    for (const s of this.stickers) {
      const bob = Math.sin(t * Math.PI * 2 + s.phase) * BOB_PX;
      s.img.setPosition(this.anchor.x + s.ox, this.anchor.y + s.oy + bob);
    }

    // grow toward target without waiting for swap (review → denser)
    while (this.stickers.length < want) {
      this._spawnOne("density");
    }

    if (now >= this.nextSwapAt) {
      this._swapOne();
      this.nextSwapAt = now + pickSwapMs(this.forced);
    }

    this.publish();
  }

  /** Add or replace one sticker (cap MAX). */
  _swapOne() {
    if (!this.shouldRun()) return;
    const want = this.targetCount();
    if (this.stickers.length < want) {
      this._spawnOne("swap");
    } else if (this.stickers.length > 0) {
      this._removeOldest();
      this._spawnOne("swap");
    }
    this.swapCount += 1;
    this.lastAt = this.scene.time?.now ?? Date.now();
    this.lastReason = "swap";
  }

  /**
   * E-key / smoke burst — spawn 1 sticker (replace if at max).
   * @param {string} [reason]
   */
  burst(reason = "burst") {
    if (!this.shouldRun()) return null;
    ensureTextures(this.scene);
    if (this.stickers.length >= MAX_STICKERS) this._removeOldest();
    const s = this._spawnOne(reason);
    this.burstCount += 1;
    this.lastAt = this.scene.time?.now ?? Date.now();
    this.lastReason = reason;
    this.publish();
    return s;
  }

  _spawnOne(reason = "init") {
    if (!this.shouldRun()) return null;
    ensureTextures(this.scene);
    if (this.stickers.length >= MAX_STICKERS) return null;

    const { ox, oy } = randomBoardOffset();
    const tint = PASTELS[Math.floor(Math.random() * PASTELS.length)];
    const targetScale = 0.85 + Math.random() * 0.35;
    const img = this.scene.add
      .image(this.anchor.x + ox, this.anchor.y + oy, pickTexKey())
      .setDepth(DEPTH)
      .setTint(tint)
      .setAlpha(0.88)
      .setScale(targetScale * 0.4)
      .setAngle((Math.random() - 0.5) * 28);

    const sticker = {
      img,
      ox,
      oy,
      phase: Math.random() * Math.PI * 2,
      bornAt: this.scene.time?.now ?? Date.now(),
      reason,
    };
    this.stickers.push(sticker);

    this.scene.tweens.add({
      targets: img,
      scaleX: targetScale,
      scaleY: targetScale,
      duration: 220,
      ease: "Back.easeOut",
    });

    return sticker;
  }

  _removeOldest() {
    const s = this.stickers.shift();
    if (!s) return;
    try {
      s.img.destroy();
    } catch {
      /* ignore */
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      active: this.shouldRun(),
      tiles: this.anchor?.tiles ?? 0,
      x: this.anchor?.x ?? null,
      y: this.anchor?.y ?? null,
      count: this.stickers.length,
      target: this.targetCount(),
      density: this.density,
      busy: this.isBusy(),
      swapCount: this.swapCount,
      burstCount: this.burstCount,
      lastAt: this.lastAt,
      lastReason: this.lastReason,
      depth: DEPTH,
      whiteboardGid: WHITEBOARD_GID,
      mode: wbvoteModeFromQuery(),
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    const snap = this.snapshot();
    const key = JSON.stringify(snap);
    if (key === this._lastKey) return;
    this._lastKey = key;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      whiteboardVote: snap,
    };
  }

  destroy() {
    for (const s of this.stickers) {
      try {
        s.img.destroy();
      } catch {
        /* ignore */
      }
    }
    this.stickers = [];
    this.anchor = null;
    this.publish();
  }
}

export {
  DEPTH as WBVOTE_DEPTH,
  MAX_STICKERS,
  IDLE_COUNT,
  BUSY_COUNT,
  SWAP_MS_MIN,
  SWAP_MS_MAX,
};
