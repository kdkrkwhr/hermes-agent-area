/** Focus dualDesk (GID26) soft 'DND' / '방해금지' floating placard.
 *  Shows when a running/focus agent sits at that desk (max 1 per desk).
 *  `?dnd=0|off|false` off · `?dnd=force` always on (smoke).
 */

import { findDualDeskTiles, DUAL_DESK_GID } from "./dualDeskIdle.js";

const TEX_KEY = "fx-dnd-sign";
/** Above furniture / dualDesk LED(7) / sticky(8); below nameplate(20). */
const DEPTH = 18;
const SIGN_W = 44;
const SIGN_H = 20;
/** Soft rose — distinct from dualDesk amber + headphones teal. */
const PANEL = 0x3a1820;
const EDGE = 0xe07080;
const GLOW = 0xff6688;
const LABEL_MAIN = "#ffc0c8";
const LABEL_SUB = "#e88898";
/** Bob amplitude (px). */
const BOB_PX = 2;
const BOB_MS = 2200;
/** Tile reach — match dualDeskIdle proximity. */
const DIST_TILES = 2;
const MAX_DESKS = 8;
/** Placard sits above monitor cluster. */
const ANCHOR_OY = -26;

/**
 * Query: omit = occupancy-driven. `0`/`off`/`false` = never.
 * `force`/`1`/`on`/`true` = always on every dual desk.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function dndModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("dnd");
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

export function dndEnabledFromQuery() {
  return dndModeFromQuery().enabled;
}

function ensureTexture(scene) {
  if (scene.textures.exists(TEX_KEY)) return;
  const g = scene.make.graphics({ add: false });
  // hang stub at top
  g.fillStyle(EDGE, 0.75);
  g.fillRect(SIGN_W / 2 - 1, 0, 2, 3);
  g.fillStyle(PANEL, 1);
  g.fillRoundedRect(0, 3, SIGN_W, SIGN_H, 3);
  g.lineStyle(1.5, EDGE, 0.9);
  g.strokeRoundedRect(0.75, 3.75, SIGN_W - 1.5, SIGN_H - 1.5, 3);
  g.generateTexture(TEX_KEY, SIGN_W, SIGN_H + 3);
  g.destroy();
}

function tileDist(entity, desk) {
  const ta = entity.tilePos?.() ?? {
    x: Math.floor(entity.sprite.x / (entity.tileSize || 32)),
    y: Math.floor(entity.sprite.y / (entity.tileSize || 32)),
  };
  const dx = ta.x - desk.tx;
  const dy = ta.y - desk.ty;
  return Math.hypot(dx, dy);
}

/** running / focus deep-work — chatting alone does not stamp (Open Desk vibe). */
function isFocusOrRunning(agent) {
  if (!agent?.sprite?.active || !agent.sprite.visible) return false;
  const status = agent.serverStatus;
  const zone = agent.serverData?.zone || agent.currentKind;
  if (status === "running") return true;
  if (zone === "focus" || agent.currentKind === "focus") return true;
  if (!agent.live && !status && agent.currentKind === "focus") return true;
  return false;
}

function agentOnFocusDesk(agent, scene) {
  const focus = agent.waypoints?.focusDesks || scene?.waypoints?.focusDesks || [];
  if (!focus.length || !agent?.sprite) return false;
  const tw = agent.tileSize || scene?.map?.tileWidth || 32;
  const th = scene?.map?.tileHeight || tw;
  const tx = Math.floor(agent.sprite.x / tw);
  const ty = Math.floor(agent.sprite.y / th);
  for (const t of focus) {
    if (t.x === tx && t.y === ty) return true;
  }
  return false;
}

function makeSign(scene, phase) {
  ensureTexture(scene);
  const root = scene.add.container(0, 0).setDepth(DEPTH).setVisible(false);
  const glow = scene.add
    .ellipse(0, 1, SIGN_W + 14, SIGN_H + 10, GLOW, 0.18)
    .setBlendMode("ADD");
  const panel = scene.add.image(0, 2, TEX_KEY).setOrigin(0.5, 0.5);
  const dnd = scene.add
    .text(0, -2, "DND", {
      fontFamily: "Consolas, Segoe UI, monospace",
      fontSize: "9px",
      fontStyle: "bold",
      color: LABEL_MAIN,
      align: "center",
    })
    .setOrigin(0.5, 0.5);
  const sub = scene.add
    .text(0, 7, "방해금지", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "6px",
      color: LABEL_SUB,
      align: "center",
    })
    .setOrigin(0.5, 0.5);
  root.add([glow, panel, dnd, sub]);
  return { root, glow, panel, dnd, sub, phase, visible: false };
}

/**
 * Soft floating DND placard above Focus dual desks — tick from OfficeScene.
 */
export class FocusDndSign {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = dndModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.anchors = this.enabled ? findDualDeskTiles(scene).slice(0, MAX_DESKS) : [];
    /** @type {{ key: string, tx: number, ty: number, x: number, y: number, phase: number, root: Phaser.GameObjects.Container, visible: boolean, agentId: string|null }[]} */
    this.signs = this.anchors.map((a, i) => {
      const made = makeSign(scene, a.phase ?? (i * 0.31) % 1);
      return {
        key: `${a.tx},${a.ty}`,
        tx: a.tx,
        ty: a.ty,
        x: a.x,
        y: a.y + ANCHOR_OY,
        phase: a.phase ?? (i * 0.31) % 1,
        root: made.root,
        visible: false,
        agentId: null,
      };
    });
    this.activeCount = 0;
    this._lastKey = "";

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  shouldBeActive() {
    return this.enabled && this.signs.length > 0;
  }

  /** Occupancy refresh (also used after lighting/agent roster changes). */
  sync() {
    if (!this.shouldBeActive()) {
      for (const s of this.signs) {
        s.root.setVisible(false);
        s.visible = false;
        s.agentId = null;
      }
      this.activeCount = 0;
      this.publish();
      return;
    }
    this.publish();
  }

  /**
   * @param {number} [time]
   * @param {number} [_delta]
   */
  update(time = this.scene.time.now, _delta = 16) {
    if (!this.shouldBeActive()) {
      this.sync();
      return;
    }

    const agents = Array.isArray(this.scene.agents) ? this.scene.agents : [];
    const focusRun = agents.filter((a) => isFocusOrRunning(a));
    let active = 0;

    // first claim wins per desk — max 1 sign / dual desk
    const claimed = new Set();

    for (const sign of this.signs) {
      let want = this.forced;
      let agentId = null;

      if (!want) {
        for (const agent of focusRun) {
          const id = agent?.def?.id;
          if (id && claimed.has(id)) continue;
          const d = tileDist(agent, sign);
          if (
            d <= DIST_TILES ||
            (agentOnFocusDesk(agent, this.scene) && d <= DIST_TILES + 0.6)
          ) {
            want = true;
            agentId = id || null;
            if (id) claimed.add(id);
            break;
          }
        }
      }

      sign.visible = want;
      sign.agentId = want ? agentId : null;
      sign.root.setVisible(want);

      if (!want) continue;
      active += 1;
      const bob =
        Math.sin((time / BOB_MS) * Math.PI * 2 + sign.phase * Math.PI * 2) *
        BOB_PX;
      sign.root.setPosition(sign.x, sign.y + bob);
    }

    this.activeCount = active;
    this.publish();
  }

  snapshot() {
    const active = this.signs.filter((s) => s.visible);
    return {
      enabled: this.enabled,
      forced: this.forced,
      active: this.shouldBeActive() && this.activeCount > 0,
      activeCount: this.activeCount,
      deskCount: this.signs.length,
      desks: this.signs.map((s) => ({
        key: s.key,
        tx: s.tx,
        ty: s.ty,
        visible: s.visible,
        agentId: s.agentId,
      })),
      activeKeys: active.map((s) => s.key),
      dualDeskGid: DUAL_DESK_GID,
      distTiles: DIST_TILES,
      depth: DEPTH,
      bobPx: BOB_PX,
      mode: dndModeFromQuery(),
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
      focusDnd: snap,
    };
  }

  destroy() {
    for (const s of this.signs) {
      try {
        s.root?.destroy();
      } catch {
        /* ignore */
      }
    }
    this.signs = [];
    this.activeCount = 0;
    this.publish();
  }
}

export { DEPTH, BOB_PX, ANCHOR_OY };
