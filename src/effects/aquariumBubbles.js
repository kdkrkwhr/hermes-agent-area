/** Ambient GID-37 aquarium bubbles. Soft ADD. `?aquarium=0` off. */

const AQUARIUM_GID = 37;
/** Above furniture; near steam (9); below agent status burst (11). */
const DEPTH = 9;
/** Slow lounge drip — quieter than coffee steam day freq. */
const FREQ_DAY = 680;
const FREQ_NIGHT = 1100;
const ALPHA_DAY = 0.28;
const ALPHA_NIGHT = 0.14;
const FEED_BOOST_MS = 7000;
const FEED_FREQ_MULT = 0.42;
const FEED_ALPHA_BONUS = 0.18;

function feedAlphaFor(base) {
  return Math.min(0.72, base + FEED_ALPHA_BONUS);
}

function ensurePelletTexture(scene) {
  if (scene.textures.exists("fx-pellet")) return;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0xffd27a, 1);
  g.fillCircle(3, 3, 2.2);
  g.lineStyle(1, 0xfff4cf, 0.7);
  g.strokeCircle(3, 3, 2.2);
  g.generateTexture("fx-pellet", 6, 6);
  g.destroy();
}

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
    this.feedEmitters = [];
    this.active = false;
    this.dim = false;
    this.feedActiveUntil = 0;

    if (this.enabled && this.tiles.length) {
      ensureBubbleTexture(scene);
      ensurePelletTexture(scene);
      for (const t of this.tiles) {
        this.emitters.push(this._makeEmitter(t.x, t.y - 4));
        this.feedEmitters.push(this._makeFeedEmitter(t.x, t.y - 10));
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

  _makeFeedEmitter(x, y) {
    const emitter = this.scene.add.particles(x, y, "fx-pellet", {
      speedX: { min: -10, max: 10 },
      speedY: { min: 18, max: 34 },
      gravityY: 14,
      scale: { start: 0.85, end: 0.55 },
      alpha: { start: 0.92, end: 0.12 },
      lifespan: { min: 950, max: 1500 },
      frequency: 170,
      quantity: 1,
    });
    emitter.setDepth(10);
    emitter.stop();
    return emitter;
  }

  shouldBeActive() {
    return this.enabled && this.emitters.length > 0;
  }

  triggerFeed(durationMs = FEED_BOOST_MS) {
    if (!this.shouldBeActive()) return false;
    const now = this.scene.time.now;
    this.feedActiveUntil = Math.max(this.feedActiveUntil, now + durationMs);
    for (const emitter of this.feedEmitters) emitter.start();
    this.sync(now);
    return true;
  }

  /** Call from applyTimeOfDayLighting — night/evening dims alpha. */
  sync(time = this.scene.time.now) {
    if (!this.shouldBeActive()) {
      this.active = false;
      this.dim = false;
      this.feedActiveUntil = 0;
      for (const e of this.emitters) e.stop();
      for (const e of this.feedEmitters) e.stop();
      this.publish();
      return;
    }

    const name = this.scene.lightingPreset?.name ?? "day";
    this.dim = isNightTod(name);
    const feedActive = time < this.feedActiveUntil;
    const baseFreq = this.dim ? FREQ_NIGHT : FREQ_DAY;
    const baseAlpha = this.dim ? ALPHA_NIGHT : ALPHA_DAY;
    const freq = feedActive
      ? Math.max(150, Math.round(baseFreq * FEED_FREQ_MULT))
      : baseFreq;
    const alphaStart = feedActive ? feedAlphaFor(baseAlpha) : baseAlpha;

    for (const e of this.emitters) {
      e.setFrequency(freq);
      e.setParticleAlpha({ start: alphaStart, end: 0 });
      if (!this.active) e.start();
    }
    for (const e of this.feedEmitters) {
      if (feedActive) e.start();
      else e.stop();
    }
    this.active = true;
    this.publish();
  }

  update(time = this.scene.time.now) {
    if (!this.shouldBeActive()) return;
    const feedActive = time < this.feedActiveUntil;
    if (this._feedWasActive === feedActive) return;
    this._feedWasActive = feedActive;
    this.sync(time);
  }

  snapshot() {
    const now = this.scene.time.now;
    return {
      enabled: this.enabled,
      active: this.active,
      dim: this.dim,
      feedActive: now < this.feedActiveUntil,
      feedMsLeft: Math.max(0, Math.round(this.feedActiveUntil - now)),
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
    for (const e of this.feedEmitters) {
      try {
        e.destroy();
      } catch {
        /* ignore */
      }
    }
    this.emitters = [];
    this.feedEmitters = [];
    this.active = false;
    this.publish();
  }
}

export { AQUARIUM_GID, findAquariumTiles };
