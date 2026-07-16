/** CEO office achievement shelf from recent done kanban tasks. `?trophy=0` disables. */

import { TILE_SIZE } from "../constants.js";

const DEPTH = 9;
const REFRESH_MS = 3500;
const MAX_ITEMS = 4;
const SHELF_W = 144;
const SHELF_H = 78;
const RANKS = ["G", "S", "B", "N"];
const COLORS = [0xf3c96a, 0xc7d3de, 0xc98a64, 0x62c8ff];

export function parseTrophyEnabled() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("trophy");
    return v !== "0" && v !== "false" && v !== "off";
  } catch {
    return true;
  }
}

function trophyShelfAnchor(scene) {
  const tw = scene.map?.tileWidth ?? TILE_SIZE;
  const th = scene.map?.tileHeight ?? TILE_SIZE;
  const ceo = scene.waypoints?.ceoOffice;
  const xMax = Number.isFinite(ceo?.xMax) ? ceo.xMax : 34;
  const yMin = Number.isFinite(ceo?.yMin) ? ceo.yMin : 2;
  return {
    x: (xMax - 1.35) * tw + tw / 2,
    y: (yMin + 2.65) * th + th / 2,
    tileX: xMax - 1.35,
    tileY: yMin + 2.65,
  };
}

function truncate(text, max = 14) {
  const raw = String(text || "").trim();
  if (!raw) return "done";
  return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
}

function rankColor(i) {
  return COLORS[i % COLORS.length];
}

function toEpoch(task) {
  return Number(task?.completed_at || task?.created_at || task?.started_at || 0) || 0;
}

function buildShelfItems(snapshot) {
  const groups = snapshot?.deskKanban?.by_assignee;
  if (!Array.isArray(groups)) return [];
  return groups
    .filter((group) => Array.isArray(group?.done) && group.done.length)
    .map((group) => {
      const recent = [...group.done].sort((a, b) => toEpoch(b) - toEpoch(a))[0];
      return {
        assignee: String(group.display_name || group.assignee || "agent"),
        title: truncate(recent?.title, 14),
        doneCount: group.done.length,
        completedAt: toEpoch(recent),
      };
    })
    .sort((a, b) => b.completedAt - a.completedAt)
    .slice(0, MAX_ITEMS);
}

export class AchievementShelf {
  constructor(scene) {
    this.scene = scene;
    this.enabled = parseTrophyEnabled();
    this.anchor = trophyShelfAnchor(scene);
    this.root = null;
    this.back = null;
    this.header = null;
    this.shelfBar = null;
    this.badges = [];
    this.items = [];
    this.visible = false;
    this.source = "empty";
    this._lastKey = "";
    this._timer = null;

    if (this.enabled) this.create();
    this.publish();
    scene.events.once("shutdown", () => this.destroy());
  }

  create() {
    const { x, y } = this.anchor;
    this.root = this.scene.add.container(x, y).setDepth(DEPTH).setScrollFactor(1);

    this.back = this.scene.add
      .rectangle(0, 0, SHELF_W, SHELF_H, 0x121922, 0.82)
      .setStrokeStyle(1, 0x4da6d8, 0.35);
    this.header = this.scene.add.text(0, -29, "HALL OF DONE", {
      fontFamily: "Consolas, Segoe UI, monospace",
      fontSize: "9px",
      color: "#77d3ff",
      align: "center",
    }).setOrigin(0.5, 0.5);
    this.shelfBar = this.scene.add.rectangle(0, 7, 118, 4, 0x6d5844, 0.95);
    this.root.add([this.back, this.header, this.shelfBar]);

    const slots = [
      { x: -34, y: -9 },
      { x: 34, y: -9 },
      { x: -34, y: 18 },
      { x: 34, y: 18 },
    ];
    this.badges = slots.map((slot, i) => this.createBadge(slot, i));
    this.root.add(this.badges.map((b) => b.wrap));
    this.root.setVisible(false);
  }

  createBadge(slot, i) {
    const wrap = this.scene.add.container(slot.x, slot.y);
    const card = this.scene.add
      .rectangle(0, 0, 62, 22, 0x0b1520, 0.92)
      .setStrokeStyle(1, 0x284255, 0.8);
    const medal = this.scene.add.circle(-22, 0, 6, rankColor(i), 1);
    const rank = this.scene.add.text(-22, 0, RANKS[i] || "N", {
      fontFamily: "Consolas, Segoe UI, monospace",
      fontSize: "8px",
      color: "#0f1419",
    }).setOrigin(0.5, 0.5);
    const assignee = this.scene.add.text(-11, -4, "", {
      fontFamily: "Consolas, Segoe UI, monospace",
      fontSize: "8px",
      color: "#eef6ff",
    }).setOrigin(0, 0.5);
    const detail = this.scene.add.text(-11, 5, "", {
      fontFamily: "Consolas, Segoe UI, monospace",
      fontSize: "7px",
      color: "#9dc3dd",
    }).setOrigin(0, 0.5);
    wrap.add([card, medal, rank, assignee, detail]);
    wrap.setVisible(false);
    return { wrap, assignee, detail };
  }

  refreshFromScene() {
    this.updateFromSnapshot(this.scene?.lastSnapshot);
  }

  updateFromSnapshot(snapshot) {
    if (!this.enabled || !this.root) return;
    const items = buildShelfItems(snapshot);
    const source = snapshot?.deskKanban?.source || (snapshot?.mock ? "mock" : "empty");
    const visible = items.length >= 2;
    const key = JSON.stringify({ source, visible, items });
    if (key === this._lastKey) return;
    this._lastKey = key;
    this.items = items;
    this.source = source;
    this.visible = visible;
    this.root.setVisible(visible);

    this.badges.forEach((badge, i) => {
      const item = items[i];
      badge.wrap.setVisible(!!item && visible);
      if (!item) return;
      badge.assignee.setText(truncate(item.assignee, 10));
      badge.detail.setText(`${item.title} +${item.doneCount}`);
    });
    this.publish();
  }

  start() {
    if (!this.enabled || !this.scene?.time) return;
    this._timer = this.scene.time.addEvent({
      delay: REFRESH_MS,
      loop: true,
      callback: () => this.refreshFromScene(),
    });
    this.refreshFromScene();
  }

  snapshot() {
    return {
      enabled: this.enabled,
      visible: this.visible,
      source: this.source,
      items: this.items.map((item) => ({
        assignee: item.assignee,
        title: item.title,
        doneCount: item.doneCount,
      })),
      x: this.root?.x ?? this.anchor?.x ?? null,
      y: this.root?.y ?? this.anchor?.y ?? null,
      depth: DEPTH,
      refreshMs: REFRESH_MS,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      trophyShelf: this.snapshot(),
    };
  }

  destroy() {
    this._timer?.remove?.(false);
    this._timer = null;
    this.root?.destroy(true);
    this.root = null;
    this.visible = false;
    this.publish();
  }
}

export { buildShelfItems, trophyShelfAnchor, DEPTH, REFRESH_MS };
