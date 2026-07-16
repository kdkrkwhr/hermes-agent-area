/** Open Desk / Focus sticky note with running task title. `?sticky=0` off. */

import { TILE_SIZE } from "../constants.js";

/** Above furniture; near dust(8)/shadow(9); below agent sprite(10). */
const DEPTH = 8;
const NOTE_W = 42;
const NOTE_H = 30;
const MAX_CHARS = 36;
const PAPER = 0xfff3a0;
const INK = "#3a3420";
const EDGE = 0xd4b84a;

/** `?sticky=0` (or false/off) disables. Default on. */
export function stickyEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("sticky");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

/** running/chatting (and mock desk/focus wander) own a sticky. */
export function shouldShowDeskSticky(agent) {
  if (!agent) return false;
  const status = agent.serverStatus;
  if (status === "running" || status === "chatting") {
    const zone = agent.serverData?.zone || agent.currentKind;
    return zone === "desk" || zone === "focus" || !zone;
  }
  // mock wander before first snapshot — desk/focus room implies coding
  if (!agent.live && !status && (agent.currentKind === "desk" || agent.currentKind === "focus")) {
    return true;
  }
  return false;
}

/** Prefer task_title → bubble → statusText → fallback. */
export function resolveStickyTitle(agent) {
  const d = agent?.serverData;
  const raw =
    d?.task_title ||
    d?.bubble ||
    agent?.statusText ||
    agent?.bubbleText?.text ||
    "";
  const text = String(raw).replace(/\s+/g, " ").trim();
  return text || "작업 중";
}

function truncateTitle(text, max = MAX_CHARS) {
  const raw = String(text || "").trim() || "작업 중";
  if (raw.length <= max) return raw;
  return `${raw.slice(0, Math.max(0, max - 1))}…`;
}

/** Desk/focus tile world px — sticky sits on the desk, not the head. */
export function deskStickyAnchor(agent) {
  const tw = agent?.tileSize || agent?.scene?.map?.tileWidth || TILE_SIZE;
  const th = agent?.scene?.map?.tileHeight || tw;
  const wp = agent?.waypoints || agent?.scene?.waypoints || {};
  const zone = agent?.serverData?.zone || agent?.currentKind;
  const home = agent?.def?.homeDesk ?? 0;

  let tile = null;
  if (zone === "focus") {
    const focus = wp.focusDesks || [];
    tile = focus[home % Math.max(1, focus.length)] || focus[0] || null;
  }
  if (!tile) {
    const desks = wp.desks || [];
    tile = desks[home % Math.max(1, desks.length)] || desks[0] || null;
  }
  if (!tile && agent?.sprite) {
    return { x: agent.sprite.x + 10, y: agent.sprite.y - 6 };
  }
  if (!tile) return { x: 0, y: 0 };

  // slight offset toward monitor / desk surface (not agent feet)
  return {
    x: tile.x * tw + tw / 2 + 10,
    y: tile.y * th + th / 2 - 4,
    tileX: tile.x,
    tileY: tile.y,
  };
}

function makeNote(scene) {
  const root = scene.add.container(0, 0).setDepth(DEPTH).setVisible(false);
  const paper = scene.add
    .rectangle(0, 0, NOTE_W, NOTE_H, PAPER, 0.94)
    .setStrokeStyle(1, EDGE, 0.9);
  // tiny folded corner hint
  const fold = scene.add
    .rectangle(NOTE_W / 2 - 4, -NOTE_H / 2 + 4, 8, 8, 0xe8d878, 0.95)
    .setOrigin(0.5, 0.5);
  const label = scene.add
    .text(0, 1, "", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "8px",
      color: INK,
      align: "center",
      wordWrap: { width: NOTE_W - 6 },
      lineSpacing: -2,
    })
    .setOrigin(0.5, 0.5);
  root.add([paper, fold, label]);
  return { root, paper, fold, label };
}

/**
 * One sticky per agent (cap = agent count). Anchored to desk/focus tile.
 */
export class DeskSticky {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.enabled = stickyEnabledFromQuery();
    /** @type {Map<string, { root: Phaser.GameObjects.Container, label: Phaser.GameObjects.Text, title: string, visible: boolean }>} */
    this.notes = new Map();
    this._lastKey = "";

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  _ensure(id) {
    let note = this.notes.get(id);
    if (note) return note;
    // hard cap = current agent roster size
    const cap = Math.max(1, this.scene.agents?.length || 1);
    if (this.notes.size >= cap) return null;
    const made = makeNote(this.scene);
    note = {
      root: made.root,
      label: made.label,
      title: "",
      visible: false,
      agentId: id,
    };
    this.notes.set(id, note);
    return note;
  }

  sync() {
    if (!this.enabled) {
      for (const note of this.notes.values()) {
        note.root.setVisible(false);
        note.visible = false;
      }
      this.publish();
      return;
    }

    const agents = this.scene.agents || [];
    const liveIds = new Set();

    for (const agent of agents) {
      const id = agent?.def?.id;
      if (!id) continue;
      liveIds.add(id);

      if (!shouldShowDeskSticky(agent)) {
        const existing = this.notes.get(id);
        if (existing) {
          existing.root.setVisible(false);
          existing.visible = false;
        }
        continue;
      }

      const note = this._ensure(id);
      if (!note) continue;

      const title = truncateTitle(resolveStickyTitle(agent));
      if (note.title !== title) {
        note.title = title;
        note.label.setText(title);
      }

      const anchor = deskStickyAnchor(agent);
      note.root.setPosition(anchor.x, anchor.y);
      note.root.setVisible(true);
      note.visible = true;
      note.tileX = anchor.tileX ?? null;
      note.tileY = anchor.tileY ?? null;
    }

    // drop orphans (agent removed)
    for (const [id, note] of this.notes) {
      if (liveIds.has(id)) continue;
      note.root.destroy(true);
      this.notes.delete(id);
    }

    this.publish();
  }

  snapshot() {
    const items = [];
    for (const [id, note] of this.notes) {
      if (!note.visible) continue;
      items.push({
        id,
        title: note.title,
        x: Math.round(note.root.x),
        y: Math.round(note.root.y),
        tileX: note.tileX ?? null,
        tileY: note.tileY ?? null,
      });
    }
    return {
      enabled: this.enabled,
      count: items.length,
      depth: DEPTH,
      notes: items,
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
      deskSticky: snap,
    };
  }

  destroy() {
    for (const note of this.notes.values()) {
      try {
        note.root.destroy(true);
      } catch {
        /* ignore */
      }
    }
    this.notes.clear();
    this.publish();
  }
}

export { DEPTH, NOTE_W, NOTE_H };
