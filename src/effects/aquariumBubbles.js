/** Ambient GID-37 aquarium bubbles. Soft ADD. `?aquarium=0` off. */

const AQUARIUM_GID = 37;
/** Above furniture; near steam (9); below agent status burst (11). */
const DEPTH = 9;
/** Slow lounge drip — quieter than coffee steam day freq. */
const FREQ_DAY = 680;
const FREQ_NIGHT = 1100;
const ALPHA_DAY = 0.28;
const ALPHA_NIGHT = 0.14;

/**
 * Query: omit = on. `0`/`off`/`false` = never.
 * @returns {boolean}
 */
export function aquariumEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("aquarium");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

function isNightTod(name) {
  return name === "night" || name === "evening";
}

function tileCenter(scene, tx, ty) {
  const tw = scene.map.tileWidth;
  const th = scene.map.tileHeight;
  return { x: tx * tw + tw / 2, y: ty * th + th / 2, tx, ty };
}

/**
 * Scan furniture once for aquarium GIDs.
 * @param {Phaser.Scene} scene
 * @returns {{x:number,y:number,tx:number,ty:number}[]}
 */
function findAquariumTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (!layer?.getTileAt || !scene.map) return hits;
  for (let ty = 0; ty < scene.map.height; ty++) {
    for (let tx = 0; tx < scene.map.width; tx++) {
      const tile = layer.getTileAt(tx, ty);
      if (tile?.index === AQUARIUM_GID) hits.push(tileCenter(scene, tx, ty));
    }
  }
  return hits;
}

function ensureBubbleTexture(scene) {
  if (scene.textures.exists("fx-bubble")) return;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0xffffff, 1);
  g.fillCircle(4, 4, 3);
  g.lineStyle(1, 0xffffff, 0.6);
  g.strokeCircle(4, 4, 3);
  g.generateTexture("fx-bubble", 8, 8);
  g.destroy();
}

/**
 * One weak ADD emitter per aquarium tile (usually 1–2).
 * Sync via applyTimeOfDayLighting — night/evening just dims base alpha.
 */
export class AquariumBubbles {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.enabled = aquariumEnabledFromQuery();
    this.tiles = this.enabled ? findAquariumTiles(scene) : [];
    this.emitters = [];
    this.active = false;
    this.dim = false;

    if (this.enabled && this.tiles.length) {
      ensureBubbleTexture(scene);
      for (const t of this.tiles) {
        this.emitters.push(this._makeEmitter(t.x, t.y - 4));
      }
    }

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  _makeEmitter(x, y) {
    const emitter = this.scene.add.particles(x, y, "fx-bubble", {
      speedX: { min: -6, max: 6 },
      speedY: { min: -22, max: -10 },
      scale: { start: 0.45, end: 0.1 },
      alpha: { start: ALPHA_DAY, end: 0 },
      lifespan: { min: 800, max: 1400 },
      frequency: FREQ_DAY,
      quantity: 1,
      tint: 0xa8e8ff,
      blendMode: "ADD",
    });
    emitter.setDepth(DEPTH);
    emitter.stop();
    return emitter;
  }

  shouldBeActive() {
    return this.enabled && this.emitters.length > 0;
  }

  /** Call from applyTimeOfDayLighting — night/evening dims alpha. */
  sync() {
    if (!this.shouldBeActive()) {
      this.active = false;
      this.dim = false;
      for (const e of this.emitters) e.stop();
      this.publish();
      return;
    }

    const name = this.scene.lightingPreset?.name ?? "day";
    this.dim = isNightTod(name);
    const freq = this.dim ? FREQ_NIGHT : FREQ_DAY;
    const alphaStart = this.dim ? ALPHA_NIGHT : ALPHA_DAY;

    for (const e of this.emitters) {
      e.setFrequency(freq);
      e.setParticleAlpha({ start: alphaStart, end: 0 });
      if (!this.active) e.start();
    }
    this.active = true;
    this.publish();
  }

  snapshot() {
    return {
      enabled: this.enabled,
      active: this.active,
      dim: this.dim,
      emitterCount: this.emitters.length,
      aquariumTiles: this.tiles.length,
      lighting: this.scene.lightingPreset?.name ?? null,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      aquarium: this.snapshot(),
    };
  }

  destroy() {
    for (const e of this.emitters) {
      try {
        e.destroy();
      } catch {
        /* ignore */
      }
    }
    this.emitters = [];
    this.active = false;
    this.publish();
  }
}

export { AQUARIUM_GID, findAquariumTiles };
