/** Round table (GID 23) soft mug/paper bob when idle/break/chatting agents or Boss are within 2 tiles.
 *  Overlay only — does not hide furniture tiles. `?roundtable=0|off|false` off · `?roundtable=force` smoke.
 */

const ROUND_TABLE_GID = 23;
const MAX_TABLES = 6;
/** Above chair(1)/sofa·beanbag(2)/plant(3); distinct from rug(4). Props sit on table surface. */
const DEPTH = 6;
/** Tile distance — proximity or linger-on-table trigger. */
const DIST_TILES = 2;
const COOLDOWN_MS = 3400;
const FORCE_COOLDOWN_MS = 700;
const BOB_MS = 480;
const BOB_Y = 3;

/**
 * Query: omit = on. `0`/`off`/`false` = never. `force` = short CD, no proximity gate.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function roundTableModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("roundtable");
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

export function roundTableEnabledFromQuery() {
  return roundTableModeFromQuery().enabled;
}

/**
 * Scan furniture for round table GID 23; return tile centers (≤ MAX_TABLES).
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number, gid: number, tile: Phaser.Tilemaps.Tile }[]}
 */
export function findRoundTableTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (!layer?.getTileAt || !scene.map) return hits;

  const tw = scene.map.tileWidth ?? 32;
  const th = scene.map.tileHeight ?? 32;

  for (let ty = 0; ty < scene.map.height; ty++) {
    for (let tx = 0; tx < scene.map.width; tx++) {
      const tile = layer.getTileAt(tx, ty);
      if (!tile || tile.index !== ROUND_TABLE_GID) continue;
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

function registerMugTexture(scene) {
  if (scene.textures.exists("fx-rt-mug")) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xffffff, 1);
  g.fillCircle(5, 5, 4);
  g.fillStyle(0xcccccc, 1);
  g.fillRect(8, 3, 3, 2);
  g.fillStyle(0x8b5a2b, 1);
  g.fillCircle(5, 5, 2.2);
  g.generateTexture("fx-rt-mug", 12, 10);
  g.destroy();
}

function registerPaperTexture(scene) {
  if (scene.textures.exists("fx-rt-paper")) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, 10, 8);
  g.lineStyle(1, 0xd8d0c0, 0.9);
  g.strokeRect(0, 0, 10, 8);
  g.lineStyle(1, 0xb0a890, 0.55);
  g.lineBetween(2, 2, 8, 2);
  g.lineBetween(2, 4, 7, 4);
  g.lineBetween(2, 6, 6, 6);
  g.generateTexture("fx-rt-paper", 10, 8);
  g.destroy();
}

/**
 * Tiny mug + paper overlays on a round-table tile (furniture stays visible).
 * @param {Phaser.Scene} scene
 * @param {{ x: number, y: number }} tile
 */
function makeTableProps(scene, tile) {
  const mug = scene.add.image(tile.x - 5, tile.y - 4, "fx-rt-mug");
  mug.setDepth(DEPTH);
  mug.setAlpha(0.92);
  const paper = scene.add.image(tile.x + 6, tile.y - 2, "fx-rt-paper");
  paper.setDepth(DEPTH);
  paper.setAlpha(0.88);
  paper.setAngle(-8);
  return { mug, paper };
}

/**
 * Ambient round-table mug/paper bob — tick from OfficeScene.updateVisualEffects.
 */
export class RoundTableIdle {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = roundTableModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.tiles = this.enabled ? findRoundTableTiles(scene) : [];
    /** @type {{ key: string, tx: number, ty: number, x: number, y: number, mug: Phaser.GameObjects.Image, paper: Phaser.GameObjects.Image, mugY: number, paperY: number, readyAt: number, bobbing: boolean, bobCount: number }[]} */
    this.tables = [];
    this.bobCount = 0;
    this.lastAt = null;
    this.lastKey = null;

    if (this.enabled && this.tiles.length) {
      registerMugTexture(scene);
      registerPaperTexture(scene);
      for (const t of this.tiles) {
        const { mug, paper } = makeTableProps(scene, t);
        this.tables.push({
          key: `${t.tx},${t.ty}`,
          tx: t.tx,
          ty: t.ty,
          x: t.x,
          y: t.y,
          mug,
          paper,
          mugY: mug.y,
          paperY: paper.y,
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
          t.mug?.setVisible(false);
          t.paper?.setVisible(false);
        } catch {
          /* ignore */
        }
      }
      this.publish();
      return;
    }
    for (const t of this.tables) {
      t.mug?.setVisible(true);
      t.paper?.setVisible(true);
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
    const mug = table.mug;
    const paper = table.paper;
    if (!mug?.active || !paper?.active) return;

    table.bobbing = true;
    table.readyAt = now + this.cooldownMs();
    table.bobCount += 1;
    this.bobCount += 1;
    this.lastAt = now;
    this.lastKey = table.key;

    this.scene.tweens.killTweensOf(mug);
    this.scene.tweens.killTweensOf(paper);
    mug.y = table.mugY;
    paper.y = table.paperY;

    // soft alternate bob — mug first, paper slightly delayed
    this.scene.tweens.add({
      targets: mug,
      y: table.mugY - BOB_Y,
      duration: BOB_MS / 2,
      yoyo: true,
      ease: "Sine.easeInOut",
    });
    this.scene.tweens.add({
      targets: paper,
      y: table.paperY - (BOB_Y - 1),
      duration: BOB_MS / 2,
      delay: 60,
      yoyo: true,
      ease: "Sine.easeInOut",
      onComplete: () => {
        table.bobbing = false;
        try {
          if (mug.active) mug.y = table.mugY;
          if (paper.active) paper.y = table.paperY;
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
      tableCount: this.tables.length,
      tableTiles: this.tiles.length,
      distTiles: DIST_TILES,
      depth: DEPTH,
      cooldownMs: this.cooldownMs(),
      bobCount: this.bobCount,
      lastAt: this.lastAt,
      lastKey: this.lastKey,
      mode: roundTableModeFromQuery(),
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      roundTable: this.snapshot(),
    };
  }

  destroy() {
    for (const t of this.tables) {
      try {
        this.scene.tweens.killTweensOf(t.mug);
        this.scene.tweens.killTweensOf(t.paper);
        t.mug?.destroy();
        t.paper?.destroy();
      } catch {
        /* ignore */
      }
    }
    this.tables = [];
    this.tiles = [];
    this.publish();
  }
}

export { ROUND_TABLE_GID, MAX_TABLES, DEPTH as ROUND_TABLE_DEPTH };
