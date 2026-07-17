/** Executive chair (GID 32) idle swivel when idle/break agents or Boss are within 2 tiles.
 *  Independent of Open Desk GID7 chairSwivel.
 *  `?execchair=0|off|false` off · `?execchair=force` smoke-friendly (short CD).
 */

const EXEC_CHAIR_GID = 32;
const MAX_CHAIRS = 4;
/** Above furniture (0); same band as Open Desk chair (1); below sofa/beanbag (2). */
const DEPTH = 1;
/** Tile distance — proximity trigger. */
const DIST_TILES = 2;
const COOLDOWN_MS = 3600;
const FORCE_COOLDOWN_MS = 700;
/** Swivel angle range (degrees) — slightly tighter than Open Desk. */
const ANGLE_MIN = 3;
const ANGLE_MAX = 7;
const SWING_MS = 300;
const HOLD_MS = 400;
const RETURN_MS = 340;

/**
 * Query: omit = on. `0`/`off`/`false` = never. `force` = short CD.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function execChairModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("execchair");
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

export function execChairEnabledFromQuery() {
  return execChairModeFromQuery().enabled;
}

/**
 * Scan furniture for executive chair GID 32; return tile centers (≤ MAX_CHAIRS).
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number, gid: number, tile: Phaser.Tilemaps.Tile }[]}
 */
export function findExecChairTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (!layer?.getTileAt || !scene.map) return hits;

  const tw = scene.map.tileWidth ?? 32;
  const th = scene.map.tileHeight ?? 32;

  for (let ty = 0; ty < scene.map.height; ty++) {
    for (let tx = 0; tx < scene.map.width; tx++) {
      const tile = layer.getTileAt(tx, ty);
      if (!tile || tile.index !== EXEC_CHAIR_GID) continue;
      hits.push({
        tx,
        ty,
        gid: tile.index,
        x: tx * tw + tw / 2,
        y: ty * th + th / 2,
        tile,
      });
      if (hits.length >= MAX_CHAIRS) return hits;
    }
  }
  return hits;
}

function tileDistToChair(entity, chair) {
  const ta = entity.tilePos?.() ?? {
    x: Math.floor(entity.sprite.x / (entity.tileSize || 32)),
    y: Math.floor(entity.sprite.y / (entity.tileSize || 32)),
  };
  const dx = ta.x - chair.tx;
  const dy = ta.y - chair.ty;
  return Math.hypot(dx, dy);
}

/** idle / break agents — CEO desk zone OK (chair sits in front of mahogany desk). */
function isIdleOrBreakAgent(agent) {
  if (!agent?.sprite?.active || !agent.sprite.visible) return false;
  if (agent.currentKind === "break") return true;
  const kind = agent.getEffectKind?.();
  if (kind === "idle") return true;
  if (agent.serverStatus === "idle") return true;
  return false;
}

function isBossNear(scene, chair) {
  const boss = scene.boss;
  if (!boss?.sprite?.active || !boss.sprite.visible) return false;
  return tileDistToChair(boss, chair) <= DIST_TILES;
}

function randomSwivelAngle() {
  const mag = ANGLE_MIN + Math.random() * (ANGLE_MAX - ANGLE_MIN);
  return Math.random() < 0.5 ? -mag : mag;
}

/**
 * @param {Phaser.Scene} scene
 * @param {Phaser.Tilemaps.Tile} tile
 */
function makeChairSprite(scene, tile) {
  const tileset = tile.tileset;
  const frame = tile.index - tileset.firstgid;
  const cx = tile.pixelX + tile.width / 2;
  const cy = tile.pixelY + tile.height;
  // tileset.name="office" (map) ≠ load key "office-tiles" — wrong key = green/black missing tex
  const texKey = tileset.image?.key ?? "office-tiles";
  const spr = scene.add.image(cx, cy, texKey, frame);
  spr.setOrigin(0.5, 1);
  spr.setDepth(DEPTH);
  try {
    tile.alpha = 0;
  } catch {
    /* ignore */
  }
  return spr;
}

/**
 * Ambient executive chair swivel — tick from OfficeScene.updateVisualEffects.
 */
export class ExecChairSwivel {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = execChairModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.tiles = this.enabled ? findExecChairTiles(scene) : [];
    /** @type {{ key: string, tx: number, ty: number, x: number, y: number, sprite: Phaser.GameObjects.Image, readyAt: number, swiveling: boolean, swivelCount: number }[]} */
    this.chairs = [];
    this.swivelCount = 0;
    this.lastAt = null;
    this.lastKey = null;

    if (this.enabled) {
      for (const t of this.tiles) {
        const sprite = makeChairSprite(scene, t.tile);
        this.chairs.push({
          key: `${t.tx},${t.ty}`,
          tx: t.tx,
          ty: t.ty,
          x: t.x,
          y: t.y,
          sprite,
          readyAt: 0,
          swiveling: false,
          swivelCount: 0,
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
    return this.enabled && this.chairs.length > 0;
  }

  sync() {
    if (!this.shouldBeActive()) {
      for (const c of this.chairs) {
        try {
          c.sprite?.setVisible(false);
        } catch {
          /* ignore */
        }
      }
      this.publish();
      return;
    }
    for (const c of this.chairs) {
      c.sprite?.setVisible(true);
    }
    this.publish();
  }

  update(_time, _delta) {
    if (!this.shouldBeActive()) return;
    const agents = this.scene.agents;
    const now = this.scene.time.now;
    const nearAgents = Array.isArray(agents)
      ? agents.filter((a) => isIdleOrBreakAgent(a))
      : [];
    if (!nearAgents.length && !this.forced && !this.scene.boss) return;

    for (const chair of this.chairs) {
      if (now < chair.readyAt || chair.swiveling) continue;
      let near = this.forced;
      if (!near) {
        if (isBossNear(this.scene, chair)) {
          near = true;
        } else {
          for (const agent of nearAgents) {
            if (tileDistToChair(agent, chair) <= DIST_TILES) {
              near = true;
              break;
            }
          }
        }
      }
      if (!near) continue;
      this._swivel(chair, now);
    }
  }

  _swivel(chair, now) {
    const spr = chair.sprite;
    if (!spr?.active) return;

    chair.swiveling = true;
    chair.readyAt = now + this.cooldownMs();
    chair.swivelCount += 1;
    this.swivelCount += 1;
    this.lastAt = now;
    this.lastKey = chair.key;

    const angle = randomSwivelAngle();
    this.scene.tweens.killTweensOf(spr);
    spr.setAngle(0);

    this.scene.tweens.chain({
      targets: spr,
      tweens: [
        { angle, duration: SWING_MS, ease: "Sine.easeOut" },
        { angle, duration: HOLD_MS },
        { angle: 0, duration: RETURN_MS, ease: "Sine.easeInOut" },
      ],
      onComplete: () => {
        chair.swiveling = false;
        try {
          if (spr.active) spr.setAngle(0);
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
      chairCount: this.chairs.length,
      chairTiles: this.tiles.length,
      distTiles: DIST_TILES,
      depth: DEPTH,
      cooldownMs: this.cooldownMs(),
      swivelCount: this.swivelCount,
      lastAt: this.lastAt,
      lastKey: this.lastKey,
      mode: execChairModeFromQuery(),
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      execChair: this.snapshot(),
    };
  }

  destroy() {
    for (const c of this.chairs) {
      try {
        this.scene.tweens.killTweensOf(c.sprite);
        c.sprite?.destroy();
      } catch {
        /* ignore */
      }
    }
    this.chairs = [];
    this.tiles = [];
    this.publish();
  }
}

export { EXEC_CHAIR_GID, MAX_CHAIRS, DEPTH as EXEC_CHAIR_DEPTH };
