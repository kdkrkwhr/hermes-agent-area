/** Lounge water cooler idle: soft LED + intermittent droplet drip (GID41).
 *  `?cooler=0|off|false` off · `?cooler=force` smoke (faster/brighter).
 *  During E-key cooler interact: pulse strengthens.
 */

const WATER_COOLER_GID = 41;
const MAX_COOLERS = 4;
/** Above furniture / steam (9); below status burst (11). */
const DEPTH = 10;
const PERIOD_MS = 3200;
const FORCE_PERIOD_MS = 1600;
/** Soft cyan LED on cooler body. */
const LED_CYAN = 0x66e8ff;
const LED_WHITE = 0xffffff;
const COOLER_GLOW = 0x44c8ee;
/** Droplet blues. */
const DROP_BLUE = 0x7ec8ff;
const DROP_CYAN = 0x5ee0c8;

/**
 * Query: omit = on. `0`/`off`/`false` = never. `force`/`1`/`on`/`true` = smoke.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function waterCoolerIdleModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("cooler");
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

export function waterCoolerIdleEnabledFromQuery() {
  return waterCoolerIdleModeFromQuery().enabled;
}

/**
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number, phase: number }[]}
 */
export function findWaterCoolerIdleTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (!layer?.getTileAt || !scene.map) return hits;

  const tw = scene.map.tileWidth ?? 32;
  const th = scene.map.tileHeight ?? 32;

  for (let ty = 0; ty < scene.map.height; ty++) {
    for (let tx = 0; tx < scene.map.width; tx++) {
      const tile = layer.getTileAt(tx, ty);
      if (!tile || tile.index !== WATER_COOLER_GID) continue;
      hits.push({
        tx,
        ty,
        x: tx * tw + tw / 2,
        y: ty * th + th / 2,
        phase: (hits.length * 0.37) % 1,
      });
      if (hits.length >= MAX_COOLERS) return hits;
    }
  }
  return hits;
}

/**
 * Soft cooler LED + intermittent droplet drip.
 */
export class WaterCoolerIdle {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = waterCoolerIdleModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.coolers = this.enabled ? findWaterCoolerIdleTiles(scene) : [];
    this.active = false;
    this.interacting = false;
    this.periodMs = this.forced ? FORCE_PERIOD_MS : PERIOD_MS;
    this._lastKey = "";

    this.gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);
    this.gfx.setBlendMode("ADD");

    scene.events.once("shutdown", () => this.destroy());
    this.update(scene.time?.now ?? 0);
  }

  isInteracting() {
    return !!this.scene.roomInteract?.coolerActive?.();
  }

  /**
   * @param {number} [time]
   */
  update(time = this.scene.time.now) {
    if (!this.enabled || !this.coolers.length) {
      this.active = false;
      this.interacting = false;
      this.gfx.clear();
      this.gfx.setVisible(false);
      this.publish();
      return;
    }

    this.interacting = this.isInteracting();
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

    const boost = this.interacting ? 1.9 : this.forced ? 1.4 : 1;
    const period = this.periodMs;

    for (const a of this.coolers) {
      const t = time / period + a.phase;
      const wave = (Math.sin(t * Math.PI * 2) + 1) / 2;
      const base = (0.14 + wave * 0.26) * boost;

      // soft LED near jug
      const ledX = a.x - 3;
      const ledY = a.y - 8;
      g.fillStyle(COOLER_GLOW, base * 0.28);
      g.fillEllipse(ledX, ledY, 14, 10);
      g.fillStyle(LED_CYAN, Math.min(0.95, base * 0.85));
      g.fillCircle(ledX, ledY, 2.1);
      g.fillStyle(LED_WHITE, Math.min(0.7, base * 0.45));
      g.fillCircle(ledX, ledY, 1.0);

      // intermittent drip from spout → cup ledge
      const dripPhase = (t * 2 + a.phase) % 1;
      const dripping =
        this.forced || this.interacting || dripPhase > 0.55;
      if (!dripping) continue;

      const fall = ((dripPhase - 0.55) / 0.45) % 1;
      const spoutX = a.x + 1;
      const spoutY = a.y + 1;
      const dropY = spoutY + fall * 10;
      const alpha = (1 - fall) * (0.55 + base * 0.35);

      g.fillStyle(DROP_CYAN, alpha * 0.35);
      g.fillEllipse(spoutX, dropY, 6, 8);
      g.fillStyle(DROP_BLUE, Math.min(0.9, alpha));
      g.fillCircle(spoutX, dropY, 1.6);
      g.fillStyle(LED_WHITE, Math.min(0.55, alpha * 0.6));
      g.fillCircle(spoutX - 0.4, dropY - 0.5, 0.7);
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      active: this.active,
      interacting: this.interacting,
      coolerCount: this.coolers.length,
      coolers: this.coolers.map((a) => ({ tx: a.tx, ty: a.ty })),
      periodMs: this.periodMs,
      coolerGid: WATER_COOLER_GID,
      depth: DEPTH,
      mode: waterCoolerIdleModeFromQuery(),
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
      waterCoolerIdle: snap,
    };
  }

  destroy() {
    try {
      this.gfx?.destroy();
    } catch {
      /* ignore */
    }
    this.gfx = null;
    this.coolers = [];
    this.active = false;
    this.publish();
  }
}

export {
  WATER_COOLER_GID,
  DEPTH,
  PERIOD_MS,
  FORCE_PERIOD_MS,
};
