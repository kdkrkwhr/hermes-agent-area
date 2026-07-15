/** North-facade rain streaks on ground GID-12 windows. `?rain=0` off, `?rain=1` force. */

/** Ground north glass facade (gen_assets: bright glass + sky → map gid 12). */
const WINDOW_GID = 12;
/** Above ground/furniture; below zone labels (5) / agents (10). */
const DEPTH = 4;
/** Cap emitters — full north row is ~36 tiles. */
const MAX_EMITTERS = 6;

/**
 * Query: omit = auto (evening/night + rare day shower).
 * `0`/`off`/`false` = never. `1`/`on`/`true` = always on.
 */
export function parseRainMode() {
  if (typeof location === "undefined") {
    return { forcedOff: false, forcedOn: false };
  }
  try {
    const raw = new URLSearchParams(location.search).get("rain");
    if (raw === "0" || raw === "off" || raw === "false") {
      return { forcedOff: true, forcedOn: false };
    }
    if (raw === "1" || raw === "on" || raw === "true") {
      return { forcedOff: false, forcedOn: true };
    }
  } catch {
    /* ignore */
  }
  return { forcedOff: false, forcedOn: false };
}

/**
 * Scan ground (then furniture) for WINDOW_GID; return tile centers.
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number }[]}
 */
export function findWindowTiles(scene) {
  const hits = [];
  const layers = [scene.ground, scene.furniture].filter(Boolean);
  const tw = scene.map?.tileWidth ?? 32;
  const th = scene.map?.tileHeight ?? 32;
  if (!scene.map) return hits;

  const seen = new Set();
  for (const layer of layers) {
    if (!layer?.getTileAt) continue;
    for (let ty = 0; ty < scene.map.height; ty++) {
      for (let tx = 0; tx < scene.map.width; tx++) {
        const tile = layer.getTileAt(tx, ty);
        if (!tile || tile.index !== WINDOW_GID) continue;
        const key = `${tx},${ty}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push({
          tx,
          ty,
          x: tx * tw + tw / 2,
          y: ty * th + th / 2,
        });
      }
    }
  }
  return hits;
}

/** Evenly sample tiles so we keep ≤ MAX_EMITTERS emitters. */
function sampleTiles(tiles, max = MAX_EMITTERS) {
  if (tiles.length <= max) return tiles.slice();
  const out = [];
  const step = (tiles.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    out.push(tiles[Math.round(i * step)]);
  }
  return out;
}

function rainConfig() {
  return {
    speedX: { min: -12, max: 6 },
    speedY: { min: 90, max: 160 },
    scale: { start: 0.55, end: 0.15 },
    alpha: { start: 0.55, end: 0 },
    lifespan: { min: 280, max: 480 },
    frequency: 55,
    quantity: 1,
    tint: [0xb8d4ef, 0x9cbcde, 0xd0e4f8],
    gravityY: 40,
  };
}

/**
 * Rain particles outside north windows. Syncs to TOD + optional event pulse.
 */
export class WindowRain {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    const mode = parseRainMode();
    this.forcedOff = mode.forcedOff;
    this.forcedOn = mode.forcedOn;
    this.tiles = findWindowTiles(scene);
    this.anchors = sampleTiles(this.tiles);
    this.emitters = [];
    this.active = false;
    this.eventUntil = 0;
    this.weatherForceOn = false;
    this._eventTimer = null;
    this._showerTimer = null;

    // Always build emitters when windows exist so snapshot.emitterCount stays useful;
    // forcedOff just keeps them stopped.
    if (this.anchors.length) {
      this._ensureTextures();
      this._createEmitters();
    }

    if (!this.forcedOff && !this.forcedOn) {
      this._scheduleDayShower();
    }

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  _ensureTextures() {
    registerRainTexture(this.scene);
  }

  _createEmitters() {
    for (const a of this.anchors) {
      // emit just above the window tile so streaks fall "outside" the pane
      const emitter = this.scene.add.particles(a.x, a.y - 10, "fx-rain", rainConfig());
      emitter.setDepth(DEPTH);
      emitter.stop();
      this.emitters.push(emitter);
    }
  }

  /** Day/morning rare shower — skipped when forced on/off. */
  _scheduleDayShower() {
    if (this._showerTimer) this._showerTimer.remove(false);
    const delay = 50000 + Math.floor(Math.random() * 70000);
    this._showerTimer = this.scene.time.delayedCall(delay, () => {
      const name = this.scene.lightingPreset?.name;
      if (name === "day" || name === "morning") {
        this.pulseEvent(4000 + Math.floor(Math.random() * 3000));
      }
      this._scheduleDayShower();
    });
  }

  /**
   * Temporary rain regardless of TOD (day shower / future office event hook).
   * @param {number} ms
   */
  pulseEvent(ms = 5000) {
    if (this.forcedOff) return;
    const until = this.scene.time.now + ms;
    this.eventUntil = Math.max(this.eventUntil, until);
    if (this._eventTimer) this._eventTimer.remove(false);
    this._eventTimer = this.scene.time.delayedCall(ms, () => this.sync());
    this.sync();
  }

  /**
   * Weather JSON rain — sustained force while raining.
   * Clear/cloudy → false so TOD / day-shower resume. `?rain=` still wins.
   * @param {boolean} on
   */
  setWeatherForceOn(on) {
    const next = !!on;
    if (next === this.weatherForceOn) {
      this.sync();
      return;
    }
    this.weatherForceOn = next;
    this.sync();
  }

  shouldBeActive() {
    if (this.forcedOff) return false;
    if (this.forcedOn) return true;
    if (this.weatherForceOn) return true;
    if (this.scene.time.now < this.eventUntil) return true;
    const name = this.scene.lightingPreset?.name;
    return name === "evening" || name === "night";
  }

  sync() {
    const want = this.shouldBeActive() && this.emitters.length > 0;
    if (want === this.active) {
      this.publish();
      return;
    }
    this.active = want;
    for (const e of this.emitters) {
      if (want) e.start();
      else e.stop();
    }
    this.publish();
  }

  snapshot() {
    return {
      enabled: !this.forcedOff,
      forcedOn: this.forcedOn,
      weatherForceOn: !!this.weatherForceOn,
      active: this.active,
      emitterCount: this.emitters.length,
      windowTiles: this.tiles.length,
      eventUntil: this.eventUntil || 0,
      lighting: this.scene.lightingPreset?.name ?? null,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      rain: this.snapshot(),
    };
  }

  destroy() {
    if (this._showerTimer) {
      this._showerTimer.remove(false);
      this._showerTimer = null;
    }
    if (this._eventTimer) {
      this._eventTimer.remove(false);
      this._eventTimer = null;
    }
    for (const e of this.emitters.splice(0)) {
      try {
        e.destroy();
      } catch {
        /* ignore */
      }
    }
    this.active = false;
    this.publish();
  }
}

/** Thin vertical streak for rain. Safe to call more than once. */
export function registerRainTexture(scene) {
  if (scene.textures.exists("fx-rain")) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xffffff, 1);
  g.fillRect(3, 0, 1, 7);
  g.fillRect(2, 1, 1, 2);
  g.generateTexture("fx-rain", 8, 8);
  g.destroy();
}

export { WINDOW_GID, MAX_EMITTERS };
