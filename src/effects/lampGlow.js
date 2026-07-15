/** Soft ADD-blend floor-lamp glow (furniture GID 20). evening/night only. `?lampglow=0` off. */

const LAMP_GID = 20;
/** Cap anchors — map currently has ~18; don't scan every frame. */
const MAX_LAMPS = 24;
/** Above lighting overlay (6); below status emitters (9) / agents (10). */
const DEPTH = 7;
const GLOW_COLOR = 0xffe08a;
/** Outer glow radius in px (tile is 32). */
const RADIUS = 28;

/** `?lampglow=0` (or false/off) disables. Default on. */
export function lampGlowEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("lampglow");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

/**
 * Scan furniture once for LAMP_GID; return tile centers (≤ MAX_LAMPS).
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number }[]}
 */
export function findLampTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (!layer?.getTileAt || !scene.map) return hits;

  const tw = scene.map.tileWidth ?? 32;
  const th = scene.map.tileHeight ?? 32;

  for (let ty = 0; ty < scene.map.height; ty++) {
    for (let tx = 0; tx < scene.map.width; tx++) {
      const tile = layer.getTileAt(tx, ty);
      if (!tile || tile.index !== LAMP_GID) continue;
      hits.push({
        tx,
        ty,
        x: tx * tw + tw / 2,
        y: ty * th + th / 2,
      });
      if (hits.length >= MAX_LAMPS) return hits;
    }
  }
  return hits;
}

/**
 * Night/evening floor-lamp glow. One Graphics, scanned once at construct.
 */
export class LampGlow {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.enabled = lampGlowEnabledFromQuery();
    this.anchors = this.enabled ? findLampTiles(scene) : [];
    this.active = false;
    this.gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);
    this.gfx.setBlendMode("ADD");
    scene.events.once("shutdown", () => this.destroy());
  }

  shouldBeActive() {
    if (!this.enabled || !this.anchors.length) return false;
    const name = this.scene.lightingPreset?.name;
    return name === "evening" || name === "night";
  }

  /** Call from applyTimeOfDayLighting — hide on morning/day. */
  sync() {
    const want = this.shouldBeActive();
    if (!want) {
      this.active = false;
      this.gfx.clear();
      this.gfx.setVisible(false);
      this.publish();
      return;
    }
    this.active = true;
    this.gfx.setVisible(true);
    this.publish();
  }

  /**
   * Slow alpha pulse. Clear+redraw all lamps in one Graphics.
   * @param {number} [time] scene.time.now
   */
  update(time = this.scene.time.now) {
    if (!this.active) return;

    // ~2.4s period — slow breathe
    const phase = (Math.sin((time / 2400) * Math.PI * 2) + 1) / 2;
    const base = 0.28 + phase * 0.22;

    this.gfx.clear();
    for (const a of this.anchors) {
      // soft stacked circles (pixelArt — no blur/filter)
      this.gfx.fillStyle(GLOW_COLOR, base * 0.4);
      this.gfx.fillCircle(a.x, a.y, RADIUS);
      this.gfx.fillStyle(GLOW_COLOR, base * 0.65);
      this.gfx.fillCircle(a.x, a.y, RADIUS * 0.55);
      this.gfx.fillStyle(GLOW_COLOR, base * 0.95);
      this.gfx.fillCircle(a.x, a.y, RADIUS * 0.28);
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      active: this.active,
      lampCount: this.anchors.length,
      lighting: this.scene.lightingPreset?.name ?? null,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      lampGlow: this.snapshot(),
    };
  }

  destroy() {
    this.gfx?.destroy();
    this.gfx = null;
    this.anchors = [];
  }
}
