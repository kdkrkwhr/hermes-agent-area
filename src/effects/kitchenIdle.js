/** Lounge kitchen idle: fridge (GID39) soft LED + microwave (GID40) clock blink.
 *  `?kitchen=0|off|false` off · `?kitchen=force` smoke (faster/brighter).
 *  During E-key fridge/microwave interact: pulse strengthens.
 */

const FRIDGE_GID = 39;
const MICROWAVE_GID = 40;
const MAX_EACH = 4;
/** Above furniture / steam (9); below status burst (11). */
const DEPTH = 10;
const PERIOD_MS = 2800;
const FORCE_PERIOD_MS = 1400;
/** Soft cyan fridge LED. */
const LED_CYAN = 0x66e8ff;
const LED_WHITE = 0xffffff;
const FRIDGE_GLOW = 0x44c8ee;
/** Microwave clock green. */
const CLOCK_GREEN = 0x50dc98;
const CLOCK_GLOW = 0x3ab878;

/**
 * Query: omit = on. `0`/`off`/`false` = never. `force`/`1`/`on`/`true` = smoke.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function kitchenIdleModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("kitchen");
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

export function kitchenIdleEnabledFromQuery() {
  return kitchenIdleModeFromQuery().enabled;
}

/**
 * @param {Phaser.Scene} scene
 * @param {number} gid
 * @param {number} max
 * @returns {{ x: number, y: number, tx: number, ty: number, phase: number, gid: number }[]}
 */
function findKitchenTiles(scene, gid, max) {
  const hits = [];
  const layer = scene.furniture;
  if (!layer?.getTileAt || !scene.map) return hits;

  const tw = scene.map.tileWidth ?? 32;
  const th = scene.map.tileHeight ?? 32;

  for (let ty = 0; ty < scene.map.height; ty++) {
    for (let tx = 0; tx < scene.map.width; tx++) {
      const tile = layer.getTileAt(tx, ty);
      if (!tile || tile.index !== gid) continue;
      hits.push({
        tx,
        ty,
        gid,
        x: tx * tw + tw / 2,
        y: ty * th + th / 2,
        phase: (hits.length * 0.41) % 1,
      });
      if (hits.length >= max) return hits;
    }
  }
  return hits;
}

export function findFridgeIdleTiles(scene) {
  return findKitchenTiles(scene, FRIDGE_GID, MAX_EACH);
}

export function findMicrowaveIdleTiles(scene) {
  return findKitchenTiles(scene, MICROWAVE_GID, MAX_EACH);
}

/**
 * Soft fridge LED + microwave clock blink on lounge kitchen appliances.
 */
export class KitchenIdle {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = kitchenIdleModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.fridges = this.enabled ? findFridgeIdleTiles(scene) : [];
    this.microwaves = this.enabled ? findMicrowaveIdleTiles(scene) : [];
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
    const ri = this.scene.roomInteract;
    return !!(ri?.fridgeActive?.() || ri?.microwaveActive?.());
  }

  /**
   * @param {number} [time]
   */
  update(time = this.scene.time.now) {
    if (!this.enabled || (!this.fridges.length && !this.microwaves.length)) {
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

    const boost = this.interacting ? 1.85 : this.forced ? 1.35 : 1;
    const period = this.periodMs;

    for (const a of this.fridges) {
      const t = time / period + a.phase;
      const wave = (Math.sin(t * Math.PI * 2) + 1) / 2;
      const base = (0.16 + wave * 0.24) * boost;
      const ledY = a.y - 8;
      const ledX = a.x - 4;

      g.fillStyle(FRIDGE_GLOW, base * 0.3);
      g.fillEllipse(ledX, ledY, 14, 10);
      g.fillStyle(LED_CYAN, Math.min(0.95, base * 0.85));
      g.fillCircle(ledX, ledY, 2.2);
      g.fillStyle(LED_WHITE, Math.min(0.75, base * 0.5));
      g.fillCircle(ledX, ledY, 1.1);
    }

    for (const a of this.microwaves) {
      const t = time / period + a.phase;
      // clock colon blink — sharper than fridge breathe
      const blink = (Math.sin(t * Math.PI * 2) + 1) / 2;
      const on = blink > 0.35 || this.forced || this.interacting;
      const base = (on ? 0.35 + blink * 0.4 : 0.08) * boost;
      const panelY = a.y - 2;
      const panelX = a.x + 5;

      g.fillStyle(CLOCK_GLOW, base * 0.35);
      g.fillEllipse(panelX, panelY, 16, 10);
      g.fillStyle(CLOCK_GREEN, Math.min(0.95, base * 0.9));
      g.fillRect(panelX - 5, panelY - 2, 10, 4);
      g.fillStyle(LED_WHITE, Math.min(0.7, base * 0.45));
      g.fillRect(panelX - 1, panelY - 1, 2, 2);
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      active: this.active,
      interacting: this.interacting,
      fridgeCount: this.fridges.length,
      microwaveCount: this.microwaves.length,
      fridges: this.fridges.map((a) => ({ tx: a.tx, ty: a.ty })),
      microwaves: this.microwaves.map((a) => ({ tx: a.tx, ty: a.ty })),
      periodMs: this.periodMs,
      fridgeGid: FRIDGE_GID,
      microwaveGid: MICROWAVE_GID,
      depth: DEPTH,
      mode: kitchenIdleModeFromQuery(),
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
      kitchenIdle: snap,
    };
  }

  destroy() {
    try {
      this.gfx?.destroy();
    } catch {
      /* ignore */
    }
    this.gfx = null;
    this.fridges = [];
    this.microwaves = [];
    this.active = false;
    this.publish();
  }
}

export { FRIDGE_GID, MICROWAVE_GID, DEPTH, PERIOD_MS, FORCE_PERIOD_MS };
