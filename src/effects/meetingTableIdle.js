/** Meeting table leaf (GID 8) soft paper bob when idle/break/chatting agents or Boss are within 2 tiles.
 *  Overlay only — does not hide furniture tiles. `?meettable=0|off|false` off · `?meettable=force` smoke.
 */

const MEETING_TABLE_GID = 8;
const MAX_TABLES = 6;
/** Above chair(1)/sofa·beanbag(2)/plant(3); distinct from rug(4). Props sit on table surface. */
const DEPTH = 6;
/** Tile distance — proximity or linger-on-table trigger. */
const DIST_TILES = 2;
const COOLDOWN_MS = 3600;
const FORCE_COOLDOWN_MS = 750;
const BOB_MS = 520;
const BOB_Y = 2.5;

/**
 * Query: omit = on. `0`/`off`/`false` = never. `force` = short CD, no proximity gate.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function meetingTableModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("meettable");
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

export function meetingTableEnabledFromQuery() {
  return meetingTableModeFromQuery().enabled;
}

/**
 * Scan furniture for meeting-table leaf GID 8; return tile centers (≤ MAX_TABLES).
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number, gid: number, tile: Phaser.Tilemaps.Tile }[]}
 */
export function findMeetingTableTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (!layer?.getTileAt || !scene.map) return hits;

  const tw = scene.map.tileWidth ?? 32;
  const th = scene.map.tileHeight ?? 32;

  for (let ty = 0; ty < scene.map.height; ty++) {
    for (let tx = 0; tx < scene.map.width; tx++) {
      const tile = layer.getTileAt(tx, ty);
      if (!tile || tile.index !== MEETING_TABLE_GID) continue;
      hits.push({
        tx,
        ty,
        gid: tile.index,
        x: tx * tw + tw / 2,
        y: ty * th + th / 2,
        tile,
      });
      if (hits.length >= MAX_TABLES) return hits;
    }
  }
  return hits;
}

function tileDistToTable(entity, table) {
  const ta = entity.tilePos?.() ?? {
    x: Math.floor(entity.sprite.x / (entity.tileSize || 32)),
    y: Math.floor(entity.sprite.y / (entity.tileSize || 32)),
  };
  const dx = ta.x - table.tx;
  const dy = ta.y - table.ty;
  return Math.hypot(dx, dy);
}

/** idle / break / chatting — chatting is NOT collapsed to running here. */
function isIdleBreakOrChatAgent(agent) {
  if (!agent?.sprite?.active || !agent.sprite.visible) return false;
  if (agent.serverStatus === "chatting") return true;
  if (agent.currentKind === "break") return true;
  if (agent.serverStatus === "idle") return true;
  const kind = agent.getEffectKind?.();
  if (kind === "idle") return true;
  return false;
}

function isBossNear(scene, table) {
  const boss = scene.boss;
  if (!boss?.sprite?.active || !boss.sprite.visible) return false;
  return tileDistToTable(boss, table) <= DIST_TILES;
}

function registerPaperTexture(scene) {
  if (scene.textures.exists("fx-mt-paper")) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xfff8ee, 1);
  g.fillRect(0, 0, 11, 9);
  g.lineStyle(1, 0xd0c4b0, 0.85);
  g.strokeRect(0, 0, 11, 9);
  g.lineStyle(1, 0xb8a890, 0.5);
  g.lineBetween(2, 2, 9, 2);
  g.lineBetween(2, 4, 8, 4);
  g.lineBetween(2, 6, 7, 6);
  g.generateTexture("fx-mt-paper", 11, 9);
  g.destroy();
}

function registerDocTexture(scene) {
  if (scene.textures.exists("fx-mt-doc")) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xe8f0ff, 1);
  g.fillRect(0, 0, 8, 10);
  g.lineStyle(1, 0xa8b8d0, 0.8);
  g.strokeRect(0, 0, 8, 10);
  g.fillStyle(0x6a90c8, 0.55);
  g.fillRect(1, 1, 6, 2);
  g.lineStyle(1, 0x90a8c0, 0.45);
  g.lineBetween(2, 5, 6, 5);
  g.lineBetween(2, 7, 5, 7);
  g.generateTexture("fx-mt-doc", 8, 10);
  g.destroy();
}

/**
 * Tiny paper + doc overlays on a meeting-table leaf tile (furniture stays visible).
 * @param {Phaser.Scene} scene
 * @param {{ x: number, y: number }} tile
 */
function makeTableProps(scene, tile) {
  const paper = scene.add.image(tile.x - 4, tile.y - 3, "fx-mt-paper");
  paper.setDepth(DEPTH);
  paper.setAlpha(0.9);
  paper.setAngle(-6);
  const doc = scene.add.image(tile.x + 5, tile.y - 2, "fx-mt-doc");
  doc.setDepth(DEPTH);
  doc.setAlpha(0.88);
  doc.setAngle(10);
  return { paper, doc };
}

/**
 * Ambient meeting-table leaf paper bob — tick from OfficeScene.updateVisualEffects.
 */
export class MeetingTableIdle {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = meetingTableModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.tiles = this.enabled ? findMeetingTableTiles(scene) : [];
    /** @type {{ key: string, tx: number, ty: number, x: number, y: number, paper: Phaser.GameObjects.Image, doc: Phaser.GameObjects.Image, paperY: number, docY: number, readyAt: number, bobbing: boolean, bobCount: number }[]} */
    this.tables = [];
    this.bobCount = 0;
    this.lastAt = null;
    this.lastKey = null;

    if (this.enabled && this.tiles.length) {
      registerPaperTexture(scene);
      registerDocTexture(scene);
      for (const t of this.tiles) {
        const { paper, doc } = makeTableProps(scene, t);
        this.tables.push({
          key: `${t.tx},${t.ty}`,
          tx: t.tx,
          ty: t.ty,
          x: t.x,
          y: t.y,
          paper,
          doc,
          paperY: paper.y,
          docY: doc.y,
          readyAt: 0,
          bobbing: false,
          bobCount: 0,
        });
      }
    }

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  cooldownMs() {
    return this.forced ? FORCE_COOLDOWN_MS : COOLDOWN_MS;
  }

  shouldBeActive() {
    return this.enabled && this.tables.length > 0;
  }

  sync() {
    if (!this.shouldBeActive()) {
      for (const t of this.tables) {
        try {
          t.paper?.setVisible(false);
          t.doc?.setVisible(false);
        } catch {
          /* ignore */
        }
      }
      this.publish();
      return;
    }
    for (const t of this.tables) {
      t.paper?.setVisible(true);
      t.doc?.setVisible(true);
    }
    this.publish();
  }

  update(_time, _delta) {
    if (!this.shouldBeActive()) return;
    const agents = this.scene.agents;
    const now = this.scene.time.now;
    const nearAgents = Array.isArray(agents)
      ? agents.filter((a) => isIdleBreakOrChatAgent(a))
      : [];
    if (!nearAgents.length && !this.forced && !this.scene.boss) return;

    for (const table of this.tables) {
      if (now < table.readyAt || table.bobbing) continue;
      let near = this.forced;
      if (!near) {
        if (isBossNear(this.scene, table)) {
          near = true;
        } else {
          for (const agent of nearAgents) {
            if (tileDistToTable(agent, table) <= DIST_TILES) {
              near = true;
              break;
            }
          }
        }
      }
      if (!near) continue;
      this._bob(table, now);
    }
  }

  _bob(table, now) {
    const paper = table.paper;
    const doc = table.doc;
    if (!paper?.active || !doc?.active) return;

    table.bobbing = true;
    table.readyAt = now + this.cooldownMs();
    table.bobCount += 1;
    this.bobCount += 1;
    this.lastAt = now;
    this.lastKey = table.key;

    this.scene.tweens.killTweensOf(paper);
    this.scene.tweens.killTweensOf(doc);
    paper.y = table.paperY;
    doc.y = table.docY;
    paper.angle = -6;
    doc.angle = 10;

    // soft bob + slight doc angle wiggle
    this.scene.tweens.add({
      targets: paper,
      y: table.paperY - BOB_Y,
      duration: BOB_MS / 2,
      yoyo: true,
      ease: "Sine.easeInOut",
    });
    this.scene.tweens.add({
      targets: doc,
      y: table.docY - (BOB_Y - 0.5),
      angle: 16,
      duration: BOB_MS / 2,
      delay: 50,
      yoyo: true,
      ease: "Sine.easeInOut",
      onComplete: () => {
        table.bobbing = false;
        try {
          if (paper.active) {
            paper.y = table.paperY;
            paper.angle = -6;
          }
          if (doc.active) {
            doc.y = table.docY;
            doc.angle = 10;
          }
        } catch {
          /* ignore */
        }
        this.publish();
      },
    });

    this.publish();
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      active: this.shouldBeActive(),
      tileCount: this.tiles.length,
      tableCount: this.tables.length,
      distTiles: DIST_TILES,
      depth: DEPTH,
      cooldownMs: this.cooldownMs(),
      bobCount: this.bobCount,
      lastAt: this.lastAt,
      lastKey: this.lastKey,
      mode: meetingTableModeFromQuery(),
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      meetingTable: this.snapshot(),
    };
  }

  destroy() {
    for (const t of this.tables) {
      try {
        this.scene.tweens.killTweensOf(t.paper);
        this.scene.tweens.killTweensOf(t.doc);
        t.paper?.destroy();
        t.doc?.destroy();
      } catch {
        /* ignore */
      }
    }
    this.tables = [];
    this.tiles = [];
    this.publish();
  }
}

export { MEETING_TABLE_GID, MAX_TABLES, DEPTH as MEETING_TABLE_DEPTH };
