/** Lobby coat rack idle: soft bob; raining → wet drip/tint (GID44).
 *  `?coatrack=0|off|false` off · `?coatrack=force` smoke (wet always + faster).
 */

const COAT_RACK_GID = 44;
const MAX_RACKS = 4;
/** Above furniture; below status burst (11). */
const DEPTH = 10;
const PERIOD_MS = 3600;
const FORCE_PERIOD_MS = 1800;
/** Soft coat blues / wet cyan. */
const COAT_NAVY = 0x4a6a9a;
const COAT_WET = 0x66c8ee;
const DROP_BLUE = 0x7ec8ff;
const DROP_CYAN = 0x5ee0c8;
const LED_WHITE = 0xffffff;

/**
 * Query: omit = on. `0`/`off`/`false` = never. `force`/`1`/`on`/`true` = smoke.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function coatRackIdleModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("coatrack");
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

export function coatRackIdleEnabledFromQuery() {
  return coatRackIdleModeFromQuery().enabled;
}

/**
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number, phase: number }[]}
 */
export function findCoatRackTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (!layer?.getTileAt || !scene.map) return hits;

  const tw = scene.map.tileWidth ?? 32;
  const th = scene.map.tileHeight ?? 32;

  for (let ty = 0; ty < scene.map.height; ty++) {
    for (let tx = 0; tx < scene.map.width; tx++) {
      const tile = layer.getTileAt(tx, ty);
      if (!tile || tile.index !== COAT_RACK_GID) continue;
      hits.push({
        tx,
        ty,
        x: tx * tw + tw / 2,
        y: ty * th + th / 2,
        phase: (hits.length * 0.41) % 1,
      });
      if (hits.length >= MAX_RACKS) return hits;
    }
  }
  return hits;
}

/**
 * Soft coat bob + wet drip while raining (or ?coatrack=force).
 */
export class CoatRackIdle {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = coatRackIdleModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.racks = this.enabled ? findCoatRackTiles(scene) : [];
    this.active = false;
    this.wet = false;
    this.periodMs = this.forced ? FORCE_PERIOD_MS : PERIOD_MS;
    this._lastKey = "";

    this.gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);
    this.gfx.setBlendMode("ADD");

    scene.events.once("shutdown", () => this.destroy());
    this.update(scene.time?.now ?? 0);
  }

  /** Rain if WindowRain is emitting or WeatherFx classifies rain. */
  isRaining() {
    if (this.forced) return true;
    const rain = this.scene.windowRain;
    if (rain?.active) return true;
    if (this.scene.weatherFx?.classification?.raining) return true;
    return false;
  }

  /**
   * @param {number} [time]
   */
  update(time = this.scene.time.now) {
    if (!this.enabled || !this.racks.length) {
      this.active = false;
      this.wet = false;
      this.gfx.clear();
      this.gfx.setVisible(false);
      this.publish();
      return;
    }

    this.wet = this.isRaining();
    this.active = true;
    this.gfx.setVisible(true);
    this._draw(time);
    this.publish();
  }

  /**
   * @param {number} time
   */
  _draw(time) {
    const g = this.gfx;
    g.clear();

    const period = this.periodMs;
    const wetBoost = this.wet ? 1.55 : 1;

    for (const a of this.racks) {
      const t = time / period + a.phase;
      const wave = (Math.sin(t * Math.PI * 2) + 1) / 2;
      const bob = Math.sin(t * Math.PI * 2) * 1.2;
      const base = (0.12 + wave * 0.22) * wetBoost;

      // soft coat glow (bobs slightly)
      const cx = a.x - 2;
      const cy = a.y + 1 + bob;
      g.fillStyle(this.wet ? COAT_WET : COAT_NAVY, base * 0.32);
      g.fillEllipse(cx, cy, 16, 18);
      g.fillStyle(this.wet ? COAT_WET : COAT_NAVY, Math.min(0.55, base * 0.7));
      g.fillEllipse(cx, cy - 2, 10, 12);

      if (!this.wet) continue;

      // drip from coat hem while wet
      const dripPhase = (t * 2.2 + a.phase) % 1;
      const dripping = this.forced || dripPhase > 0.42;
      if (!dripping) continue;

      const fall = ((dripPhase - 0.42) / 0.58) % 1;
      const spoutX = cx + (a.phase > 0.5 ? 2 : -1);
      const spoutY = cy + 6;
      const dropY = spoutY + fall * 11;
      const alpha = (1 - fall) * (0.5 + base * 0.4);

      g.fillStyle(DROP_CYAN, alpha * 0.35);
      g.fillEllipse(spoutX, dropY, 5, 7);
      g.fillStyle(DROP_BLUE, Math.min(0.9, alpha));
      g.fillCircle(spoutX, dropY, 1.5);
      g.fillStyle(LED_WHITE, Math.min(0.5, alpha * 0.55));
      g.fillCircle(spoutX - 0.3, dropY - 0.4, 0.6);
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      active: this.active,
      wet: this.wet,
      rackCount: this.racks.length,
      racks: this.racks.map((a) => ({ tx: a.tx, ty: a.ty })),
      periodMs: this.periodMs,
      coatRackGid: COAT_RACK_GID,
      depth: DEPTH,
      mode: coatRackIdleModeFromQuery(),
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    const snap = this.snapshot();
    const key = JSON.stringify(snap);
    if (key === this._lastKey) return;
    this._lastKey = key;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      coatRackIdle: snap,
    };
  }

  destroy() {
    try {
      this.gfx?.destroy();
    } catch {
      /* ignore */
    }
    this.gfx = null;
    this.racks = [];
    this.active = false;
    this.publish();
  }
}

export {
  COAT_RACK_GID,
  DEPTH,
  PERIOD_MS,
  FORCE_PERIOD_MS,
};
