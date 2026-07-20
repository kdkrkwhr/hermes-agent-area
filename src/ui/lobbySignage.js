/** Lobby wall TV — kanban / stock / news rotation. `?signage=0` disables. */

import { parseKanbanStats } from "../kanbanPanel.js";
import { TILE_SIZE } from "../constants.js";
import { newsHeadlines, loadDeskBrief } from "./deskBriefPanel.js";

const TEX_KEY = "lobby-signage-tv";
/** Above furniture (0); below agent sprites (10). */
const DEPTH = 8;
const REFRESH_MS = 3000;
/** Mode flip between kanban / stock / news (3–5s band). */
const MODE_MS = 4000;
const NEWS_POLL_MS = 60000;
const CRAWL_PX_PER_S = 18;
const TV_W = 72;
const TV_H = 48;
const SCREEN_W = TV_W - 12;

const COLOR_KANBAN_TITLE = "#6ec8f0";
const COLOR_KANBAN_L1 = "#e8f4ff";
const COLOR_KANBAN_L2 = "#b0c4d8";
const COLOR_NEWS_TITLE = "#f0c878";
const COLOR_NEWS_BODY = "#fff8e8";
const COLOR_STOCK_TITLE = "#7ee0c8";
const COLOR_STOCK_BODY = "#d8fff4";

function parseSignageEnabled() {
  if (typeof location === "undefined") return true;
  try {
    const q = new URLSearchParams(location.search).get("signage");
    return q !== "0" && q !== "false" && q !== "off";
  } catch {
    return true;
  }
}

/**
 * Fixed world point: lobby AABB center X, north-wall Y.
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tileX: number, tileY: number }}
 */
function lobbySignageAnchor(scene) {
  const tw = scene.map?.tileWidth ?? TILE_SIZE;
  const th = scene.map?.tileHeight ?? TILE_SIZE;
  const lob = scene.waypoints?.lobby;
  const xMin = Number.isFinite(lob?.xMin) ? lob.xMin : 14;
  const xMax = Number.isFinite(lob?.xMax) ? lob.xMax : 25;
  const yMin = Number.isFinite(lob?.yMin) ? lob.yMin : 26;
  const tileX = (xMin + xMax) / 2;
  // north wall of lobby walk tiles — slightly above floor strip
  const tileY = yMin - 0.55;
  return {
    x: tileX * tw + tw / 2,
    y: tileY * th + th / 2,
    tileX,
    tileY,
  };
}

function formatSignageLines(snapshot) {
  const stats = parseKanbanStats(snapshot?.stats?.raw);
  const agents = snapshot?.agents ?? [];
  const idle = agents.filter((a) => a.status === "idle").length;
  const done = stats.done ?? 0;
  return {
    line1: `R ${stats.running}  B ${stats.blocked}`,
    line2: `Q ${stats.ready}  Rev ${stats.review}`,
    running: stats.running,
    blocked: stats.blocked,
    ready: stats.ready,
    review: stats.review,
    idle,
    done,
  };
}

function ensureTvTexture(scene) {
  if (scene.textures.exists(TEX_KEY)) return;
  const g = scene.make.graphics({ add: false });
  // bezel
  g.fillStyle(0x1a1e24, 1);
  g.fillRoundedRect(0, 0, TV_W, TV_H, 3);
  // screen
  g.fillStyle(0x0b1520, 1);
  g.fillRoundedRect(4, 4, TV_W - 8, TV_H - 14, 2);
  // soft cyan glow edge
  g.lineStyle(1, 0x3a8ec8, 0.55);
  g.strokeRoundedRect(4.5, 4.5, TV_W - 9, TV_H - 15, 2);
  // stand lip
  g.fillStyle(0x2a3038, 1);
  g.fillRect(TV_W / 2 - 10, TV_H - 8, 20, 3);
  g.fillStyle(0x3a424c, 1);
  g.fillRect(TV_W / 2 - 16, TV_H - 5, 32, 3);
  g.generateTexture(TEX_KEY, TV_W, TV_H);
  g.destroy();
}

/**
 * Desk-brief / WS stock pack → one crawl line (KOSPI/KOSDAQ + optional tickers).
 * @param {object|null|undefined} stock
 * @returns {string}
 */
export function formatStockCrawl(stock) {
  if (!stock || typeof stock !== "object") return "";
  const parts = [];
  const pushIdx = (label, row) => {
    if (!row || (row.index == null && row.price == null)) return;
    const up =
      row.status === "up" ||
      String(row.change || "").trim().startsWith("+") ||
      Number(row.change_pct ?? row.changePct) > 0;
    const arrow = up ? "↑" : "↓";
    const idx = row.index ?? row.price ?? "—";
    const ch = row.change != null ? String(row.change) : "";
    parts.push(`${label} ${idx} ${arrow}${ch ? ` ${ch}` : ""}`.trim());
  };
  pushIdx("KOSPI", stock.kospi);
  pushIdx("KOSDAQ", stock.kosdaq);
  const items = Array.isArray(stock.items)
    ? stock.items
    : Array.isArray(stock.markets)
      ? stock.markets
      : Array.isArray(stock.stock)
        ? stock.stock
        : [];
  for (const item of items.slice(0, 4)) {
    if (!item) continue;
    const name = item.name || item.code || item.symbol;
    if (!name) continue;
    const up =
      item.status === "up" ||
      String(item.change || "").trim().startsWith("+") ||
      Number(item.change_pct ?? item.changePct) > 0;
    const arrow = up ? "↑" : "↓";
    const price = item.price ?? item.index ?? "";
    const ch = item.change != null ? String(item.change) : "";
    parts.push(`${name} ${price} ${arrow}${ch ? ` ${ch}` : ""}`.trim());
  }
  return parts.filter(Boolean).join("   ·   ");
}

/** Build mode list: always kanban; stock/news when data exists. */
function buildModes(headlines, stockLine) {
  const modes = ["kanban"];
  if (stockLine) modes.push("stock");
  if (Array.isArray(headlines) && headlines.length > 0) modes.push("news");
  return modes;
}

export class LobbySignage {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.enabled = parseSignageEnabled();
    this.anchor = null;
    this.tv = null;
    this.title = null;
    this.line1 = null;
    this.line2 = null;
    this.lastKey = "";
    this.counts = { running: 0, blocked: 0, idle: 0, done: 0 };
    this.headlines = [];
    this.headlineIdx = 0;
    this.stockLine = "";
    this.stockHint = "";
    this.mode = "kanban";
    this.modes = ["kanban"];
    this._kanbanFmt = null;
    this._timer = null;
    this._modeTimer = null;
    this._newsPoll = null;
    this._crawlTween = null;
    if (!this.enabled) return;

    ensureTvTexture(scene);
    this.anchor = lobbySignageAnchor(scene);
    const { x, y } = this.anchor;

    this.tv = scene.add
      .image(x, y, TEX_KEY)
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH)
      .setScrollFactor(1);

    this.title = scene.add
      .text(x, y - 12, "KANBAN", {
        fontFamily: "Consolas, Segoe UI, monospace",
        fontSize: "9px",
        color: COLOR_KANBAN_TITLE,
        align: "center",
      })
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH + 0.1)
      .setScrollFactor(1);

    this.line1 = scene.add
      .text(x, y - 1, "R 0  B 0", {
        fontFamily: "Consolas, Segoe UI, monospace",
        fontSize: "10px",
        color: COLOR_KANBAN_L1,
        align: "center",
      })
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH + 0.1)
      .setScrollFactor(1);

    this.line2 = scene.add
      .text(x, y + 10, "Q 0  Rev 0", {
        fontFamily: "Consolas, Segoe UI, monospace",
        fontSize: "10px",
        color: COLOR_KANBAN_L2,
        align: "center",
      })
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH + 0.1)
      .setScrollFactor(1);

    this._timer = scene.time.addEvent({
      delay: REFRESH_MS,
      loop: true,
      callback: () => this.refreshFromScene(),
    });

    this._modeTimer = scene.time.addEvent({
      delay: MODE_MS,
      loop: true,
      callback: () => this.advanceMode(),
    });

    this._newsPoll = scene.time.addEvent({
      delay: NEWS_POLL_MS,
      loop: true,
      callback: () => void this.pollNews(),
    });
    void this.pollNews();

    if (scene.lastSnapshot) this.updateFromSnapshot(scene.lastSnapshot);
    this.applyMode(true);
  }

  refreshFromScene() {
    const snap = this.scene?.lastSnapshot;
    if (snap) this.updateFromSnapshot(snap);
    // also pick up brief cache if panel/WS already filled it
    const cachedNews =
      typeof window !== "undefined"
        ? window.__HERMES_AREA__?.deskBrief?.news ??
          window.__HERMES_AREA__?.brief?.news ??
          null
        : null;
    const cachedStock =
      typeof window !== "undefined"
        ? window.__HERMES_AREA__?.deskBrief?.stock ??
          window.__HERMES_AREA__?.brief?.stock ??
          null
        : null;
    if (cachedNews) this.updateNews({ news: cachedNews });
    else if (this.scene?.deskBriefPanel?.lastPayload?.news) {
      this.updateNews(this.scene.deskBriefPanel.lastPayload);
    }
    if (cachedStock) this.updateStock(cachedStock);
    else if (this.scene?.deskBriefPanel?.lastPayload?.stock) {
      this.updateStock(this.scene.deskBriefPanel.lastPayload.stock);
    }
  }

  async pollNews() {
    if (!this.enabled) return;
    try {
      const pack = await loadDeskBrief();
      if (pack?.news) this.updateNews(pack);
      if (pack?.stock) this.updateStock(pack.stock);
    } catch {
      /* offline / Pages — keep last headlines */
    }
  }

  /**
   * Desk-brief / WS news pack → headlines for crawl mode.
   * Accepts full brief `{ news }` or a bare news object.
   * @param {object|null|undefined} pack
   */
  updateNews(pack) {
    if (!this.enabled) return;
    const news = pack?.news ?? (pack?.markets || pack?.items ? pack : null);
    const next = newsHeadlines(news, 12).map((h) =>
      String(h?.title || "")
        .replace(/\s+/g, " ")
        .trim(),
    ).filter(Boolean);
    const key = next.join("\n");
    const prevKey = this.headlines.join("\n");
    this.headlines = next;
    if (this.headlineIdx >= next.length) this.headlineIdx = 0;
    this.modes = buildModes(next, this.stockLine);
    if (!next.length && this.mode === "news") {
      this.mode = "kanban";
      this.applyMode(true);
    } else if (key !== prevKey && this.mode === "news") {
      this.applyMode(true);
    }
    this.publishBriefCache(news, undefined);
  }

  /**
   * Desk-brief / WS stock → soft cyan crawl line. No stock → kanban-only modes.
   * @param {object|null|undefined} stockOrPack
   */
  updateStock(stockOrPack) {
    if (!this.enabled) return;
    const stock =
      stockOrPack?.stock && typeof stockOrPack.stock === "object"
        ? stockOrPack.stock
        : stockOrPack;
    const line = formatStockCrawl(stock);
    const prev = this.stockLine;
    this.stockLine = line;
    this.stockHint = line
      ? line.length > 22
        ? `${line.slice(0, 20)}…`
        : line
      : "";
    this.modes = buildModes(this.headlines, this.stockLine);
    if (!line && this.mode === "stock") {
      this.mode = "kanban";
      this.applyMode(true);
    } else if (line && line !== prev && this.mode === "stock") {
      this.applyMode(true);
    }
    this.publishBriefCache(undefined, stock);
  }

  publishBriefCache(news, stock) {
    if (typeof window === "undefined") return;
    const prev = (window.__HERMES_AREA__ || {}).brief || {};
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      brief: {
        ...prev,
        news: news !== undefined ? news ?? null : prev.news ?? null,
        stock: stock !== undefined ? stock ?? null : prev.stock ?? null,
        headlines: this.headlines.slice(),
        stockLine: this.stockLine || null,
      },
    };
  }

  advanceMode() {
    if (!this.enabled) return;
    this.modes = buildModes(this.headlines, this.stockLine);
    if (this.modes.length < 2) {
      if (this.mode !== "kanban") {
        this.mode = "kanban";
        this.applyMode(true);
      }
      return;
    }
    const i = this.modes.indexOf(this.mode);
    this.mode = this.modes[(i + 1) % this.modes.length];
    if (this.mode === "news") {
      this.headlineIdx = (this.headlineIdx + 1) % Math.max(1, this.headlines.length);
    }
    this.applyMode(true);
  }

  /** Same source as the DOM kanban panel (`lastSnapshot`). */
  updateFromSnapshot(snapshot) {
    if (!this.enabled || !this.line1 || !snapshot) return;
    const fmt = formatSignageLines(snapshot);
    this._kanbanFmt = fmt;
    this.counts = {
      running: fmt.running,
      blocked: fmt.blocked,
      ready: fmt.ready,
      review: fmt.review,
      idle: fmt.idle,
      done: fmt.done,
    };
    const key = `${fmt.line1}|${fmt.line2}`;
    if (key === this.lastKey && this.mode === "kanban") return;
    this.lastKey = key;
    if (this.mode === "kanban") this.applyMode(false);
  }

  stopCrawl() {
    this._crawlTween?.stop?.();
    this._crawlTween = null;
    if (this.line1) {
      this.line1.setOrigin(0.5, 0.5);
      if (this.anchor) this.line1.setX(this.anchor.x);
    }
  }

  startCrawl(fullText) {
    this.stopCrawl();
    if (!this.line1 || !this.anchor) return;
    const x = this.anchor.x;
    const y = this.anchor.y;
    this.line1.setText(fullText);
    this.line1.setColor(COLOR_NEWS_BODY);
    this.line1.setOrigin(0, 0.5);
    const tw = this.line1.width || 0;
    if (tw <= SCREEN_W) {
      this.line1.setOrigin(0.5, 0.5);
      this.line1.setPosition(x, y - 1);
      this.line2?.setText("");
      return;
    }
    // soft left→right crawl; reset loop while in news mode
    const startX = x - SCREEN_W / 2 + 2;
    const endX = x - SCREEN_W / 2 - tw - 8;
    const dur = Math.max(4000, Math.round(((startX - endX) / CRAWL_PX_PER_S) * 1000));
    this.line1.setPosition(startX, y - 1);
    this.line2?.setText("");
    this._crawlTween = this.scene.tweens.add({
      targets: this.line1,
      x: endX,
      duration: dur,
      ease: "Linear",
      repeat: -1,
    });
  }

  /**
   * @param {boolean} forceFlip — fade titles when switching modes
   */
  applyMode(forceFlip) {
    if (!this.enabled || !this.title || !this.line1 || !this.line2) return;
    const x = this.anchor?.x ?? 0;
    const y = this.anchor?.y ?? 0;

    if (this.mode === "stock" && this.stockLine) {
      this.stopCrawl();
      this.title.setText("STOCK");
      this.title.setColor(COLOR_STOCK_TITLE);
      this.line2.setColor(COLOR_STOCK_BODY);
      this.line2.setText(this.stockHint || "KOSPI");
      this.line2.setPosition(x, y + 10);
      this.startCrawl(`◆ ${this.stockLine}   `);
      if (this.line1) this.line1.setColor(COLOR_STOCK_BODY);
      if (forceFlip) {
        this.title.setAlpha(0.35);
        this.scene.tweens.add({ targets: this.title, alpha: 1, duration: 220 });
      }
      return;
    }

    if (this.mode === "news" && this.headlines.length) {
      this.stopCrawl();
      const headline = this.headlines[this.headlineIdx] || this.headlines[0];
      this.title.setText("NEWS");
      this.title.setColor(COLOR_NEWS_TITLE);
      this.line2.setColor(COLOR_NEWS_BODY);
      // 2-line flip: title NEWS + crawl on line1; line2 shows short trunc hint
      const short =
        headline.length > 22 ? `${headline.slice(0, 20)}…` : headline;
      this.line2.setText(short);
      this.line2.setPosition(x, y + 10);
      this.startCrawl(`◆ ${headline}   `);
      if (forceFlip) {
        this.title.setAlpha(0.35);
        this.scene.tweens.add({ targets: this.title, alpha: 1, duration: 220 });
      }
      return;
    }

    // kanban
    this.stopCrawl();
    const fmt = this._kanbanFmt || formatSignageLines(this.scene?.lastSnapshot);
    this.title.setText("KANBAN");
    this.title.setColor(COLOR_KANBAN_TITLE);
    this.line1.setColor(COLOR_KANBAN_L1);
    this.line2.setColor(COLOR_KANBAN_L2);
    this.line1.setOrigin(0.5, 0.5);
    this.line1.setPosition(x, y - 1);
    this.line1.setText(fmt?.line1 ?? "R 0  B 0");
    this.line2.setPosition(x, y + 10);
    this.line2.setText(fmt?.line2 ?? "Q 0  Rev 0");
    if (forceFlip) {
      this.title.setAlpha(0.35);
      this.scene.tweens.add({ targets: this.title, alpha: 1, duration: 220 });
    }
  }

  snapshot() {
    const display =
      this.mode === "stock" && this.stockLine
        ? `STOCK · ${this.stockLine}`
        : this.mode === "news" && this.headlines.length
          ? `NEWS · ${this.headlines[this.headlineIdx] || this.headlines[0]}`
          : this.lastKey
            ? this.lastKey.replace("|", " · ")
            : null;
    return {
      enabled: this.enabled,
      text: display,
      mode: this.mode,
      modes: this.modes.slice(),
      headlines: this.headlines.slice(),
      headlineIdx: this.headlineIdx,
      stockLine: this.stockLine || null,
      counts: { ...this.counts },
      x: this.tv?.x ?? this.anchor?.x ?? null,
      y: this.tv?.y ?? this.anchor?.y ?? null,
      tileX: this.anchor?.tileX ?? null,
      tileY: this.anchor?.tileY ?? null,
      depth: DEPTH,
      refreshMs: REFRESH_MS,
      modeMs: MODE_MS,
    };
  }

  destroy() {
    this.stopCrawl();
    this._timer?.remove?.(false);
    this._modeTimer?.remove?.(false);
    this._newsPoll?.remove?.(false);
    this._timer = null;
    this._modeTimer = null;
    this._newsPoll = null;
    this.tv?.destroy();
    this.title?.destroy();
    this.line1?.destroy();
    this.line2?.destroy();
    this.tv = null;
    this.title = null;
    this.line1 = null;
    this.line2 = null;
  }
}

export {
  parseSignageEnabled,
  lobbySignageAnchor,
  formatSignageLines,
  buildModes,
  TEX_KEY,
  DEPTH,
  REFRESH_MS,
  MODE_MS,
};
