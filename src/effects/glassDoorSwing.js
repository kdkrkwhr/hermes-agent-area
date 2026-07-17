/** Glass door (GID 11) open-swing when Boss / agents / visitors pass within 1.25 tiles.
 *  Ground-layer openings (furniture has none). Overlay only — map tiles untouched.
 *  `?doorswing=0|off|false` off · `?doorswing=force` smoke (short CD, auto-open).
 */

const DOOR_GID = 11;
const MAX_DOORS = 20;
/** Above walk-path hints (1.5); below furniture sprites (~2+). */
const DEPTH = 1.6;
/** Tile distance — pass-through trigger. */
const DIST_TILES = 1.25;
const OPEN_MS = 280;
const CLOSE_MS = 340;
const FORCE_HOLD_MS = 420;
const FORCE_COOLDOWN_MS = 700;
/** Closed leaf covers ~half the opening; open swings toward hinge. */
const LEAF_W = 14;
const LEAF_H = 28;
const OPEN_ANGLE = -68;
const GLASS_FILL = 0xa8e8e0;
const GLASS_EDGE = 0x2a9a88;

/**
 * Query: omit = on. `0`/`off`/`false` = never. `force` = short auto-swing.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function doorSwingModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("doorswing");
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

export function doorSwingEnabledFromQuery() {
  return doorSwingModeFromQuery().enabled;
}

/**
 * Scan ground (and furniture fallback) for glass-door GID 11.
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number, gid: number, hinge: "L"|"R" }[]}
 */
export function findGlassDoorTiles(scene) {
  const hits = [];
  const layers = [scene.ground, scene.furniture].filter(Boolean);
  if (!layers.length || !scene.map) return hits;

  const tw = scene.map.tileWidth ?? 32;
  const th = scene.map.tileHeight ?? 32;
  const seen = new Set();

  for (const layer of layers) {
    if (!layer?.getTileAt) continue;
    for (let ty = 0; ty < scene.map.height; ty++) {
      for (let tx = 0; tx < scene.map.width; tx++) {
        const tile = layer.getTileAt(tx, ty);
        if (!tile || tile.index !== DOOR_GID) continue;
        const key = `${tx},${ty}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // Pair with neighbor to the right → left hinge; else right hinge for right-of-pair.
        const right = layer.getTileAt(tx + 1, ty);
        const left = layer.getTileAt(tx - 1, ty);
        let hinge = "L";
        if (left && left.index === DOOR_GID && !(right && right.index === DOOR_GID)) {
          hinge = "R";
        }
        hits.push({
          tx,
          ty,
          gid: tile.index,
          x: tx * tw + tw / 2,
          y: ty * th + th / 2,
          hinge,
        });
        if (hits.length >= MAX_DOORS) return hits;
      }
    }
  }
  return hits;
}

function entityTile(ent, tw) {
  if (ent?.tilePos) return ent.tilePos();
  if (!ent?.sprite) return null;
  const size = ent.tileSize || tw || 32;
  return {
    x: Math.floor(ent.sprite.x / size),
    y: Math.floor(ent.sprite.y / size),
  };
}

function tileDistToDoor(ent, door, tw) {
  const ta = entityTile(ent, tw);
  if (!ta) return Infinity;
  const dx = ta.x - door.tx;
  const dy = ta.y - door.ty;
  return Math.hypot(dx, dy);
}

function isLiveEntity(ent) {
  if (!ent?.sprite?.active || !ent.sprite.visible) return false;
  if (ent.alive === false) return false;
  return true;
}

/** Boss / any agent / visitor near the door (mascot optional). */
function collectPassers(scene) {
  const out = [];
  for (const a of scene.agents || []) {
    if (isLiveEntity(a)) out.push(a);
  }
  if (isLiveEntity(scene.boss)) out.push(scene.boss);
  const visitor = scene.visitorDirector?.visitor;
  if (visitor && isLiveEntity(visitor)) out.push(visitor);
  return out;
}

/**
 * @param {Phaser.Scene} scene
 * @param {{ x: number, y: number, hinge: "L"|"R" }} door
 */
function makeLeaf(scene, door) {
  const tw = scene.map?.tileWidth ?? 32;
  const th = scene.map?.tileHeight ?? 32;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(GLASS_FILL, 0.42);
  g.fillRoundedRect(0, 0, LEAF_W, LEAF_H, 2);
  g.lineStyle(1.5, GLASS_EDGE, 0.75);
  g.strokeRoundedRect(0.5, 0.5, LEAF_W - 1, LEAF_H - 1, 2);
  g.lineStyle(1, 0xffffff, 0.35);
  g.lineBetween(3, 4, 3, LEAF_H - 4);
  const key = `fx-glass-door-${door.hinge}`;
  if (!scene.textures.exists(key)) {
    g.generateTexture(key, LEAF_W, LEAF_H);
  }
  g.destroy();

  const hingeX =
    door.hinge === "L" ? door.x - tw / 2 + 2 : door.x + tw / 2 - 2;
  const hingeY = door.y - th / 2 + (th - LEAF_H) / 2 + LEAF_H / 2;
  const spr = scene.add.image(hingeX, hingeY, key);
  spr.setOrigin(door.hinge === "L" ? 0 : 1, 0.5);
  spr.setDepth(DEPTH);
  spr.setAngle(0);
  return spr;
}

/**
 * Ambient glass-door swing — tick from OfficeScene.updateVisualEffects.
 */
export class GlassDoorSwing {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = doorSwingModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.tiles = this.enabled ? findGlassDoorTiles(scene) : [];
    /** @type {{ key: string, tx: number, ty: number, x: number, y: number, hinge: "L"|"R", sprite: Phaser.GameObjects.Image, open: boolean, tweening: boolean, readyAt: number, swingCount: number }[]} */
    this.doors = [];
    this.swingCount = 0;
    this.openCount = 0;
    this.lastAt = null;
    this.lastKey = null;

    if (this.enabled) {
      for (const t of this.tiles) {
        const sprite = makeLeaf(scene, t);
        this.doors.push({
          key: `${t.tx},${t.ty}`,
          tx: t.tx,
          ty: t.ty,
          x: t.x,
          y: t.y,
          hinge: t.hinge,
          sprite,
          open: false,
          tweening: false,
          readyAt: 0,
          swingCount: 0,
        });
      }
    }

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  shouldBeActive() {
    return this.enabled && this.doors.length > 0;
  }

  sync() {
    if (!this.shouldBeActive()) {
      for (const d of this.doors) {
        try {
          d.sprite?.setVisible(false);
        } catch {
          /* ignore */
        }
      }
      this.publish();
      return;
    }
    for (const d of this.doors) {
      d.sprite?.setVisible(true);
    }
    this.publish();
  }

  update(_time, _delta) {
    if (!this.shouldBeActive()) return;
    const now = this.scene.time.now;
    const tw = this.scene.map?.tileWidth ?? 32;

    if (this.forced) {
      for (const door of this.doors) {
        if (door.tweening || now < door.readyAt) continue;
        this._swing(door, !door.open, now);
      }
      return;
    }

    const passers = collectPassers(this.scene);
    for (const door of this.doors) {
      if (door.tweening) continue;
      let near = false;
      for (const ent of passers) {
        if (tileDistToDoor(ent, door, tw) <= DIST_TILES) {
          near = true;
          break;
        }
      }
      if (near && !door.open) this._swing(door, true, now);
      else if (!near && door.open) this._swing(door, false, now);
    }
  }

  /**
   * @param {{ sprite: Phaser.GameObjects.Image, open: boolean, tweening: boolean, readyAt: number, swingCount: number, key: string, hinge: "L"|"R" }} door
   * @param {boolean} open
   * @param {number} now
   */
  _swing(door, open, now) {
    const spr = door.sprite;
    if (!spr?.active) return;

    door.tweening = true;
    door.open = open;
    door.swingCount += 1;
    this.swingCount += 1;
    if (open) this.openCount += 1;
    this.lastAt = now;
    this.lastKey = door.key;

    const target = open ? OPEN_ANGLE * (door.hinge === "R" ? -1 : 1) : 0;
    const duration = open ? OPEN_MS : CLOSE_MS;

    this.scene.tweens.killTweensOf(spr);
    this.scene.tweens.add({
      targets: spr,
      angle: target,
      duration,
      ease: open ? "Sine.easeOut" : "Sine.easeInOut",
      onComplete: () => {
        door.tweening = false;
        try {
          if (spr.active) spr.setAngle(target);
        } catch {
          /* ignore */
        }
        if (this.forced) {
          const hold = open ? FORCE_HOLD_MS : FORCE_COOLDOWN_MS;
          door.readyAt = (this.scene.time?.now ?? now) + hold;
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
      doorCount: this.doors.length,
      doorTiles: this.tiles.length,
      openDoors: this.doors.filter((d) => d.open).length,
      distTiles: DIST_TILES,
      depth: DEPTH,
      swingCount: this.swingCount,
      openCount: this.openCount,
      lastAt: this.lastAt,
      lastKey: this.lastKey,
      mode: doorSwingModeFromQuery(),
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      doorSwing: this.snapshot(),
    };
  }

  destroy() {
    for (const d of this.doors) {
      try {
        this.scene.tweens.killTweensOf(d.sprite);
        d.sprite?.destroy();
      } catch {
        /* ignore */
      }
    }
    this.doors = [];
    this.tiles = [];
    this.publish();
  }
}

export { DOOR_GID, MAX_DOORS, DEPTH as DOOR_SWING_DEPTH, DIST_TILES };
