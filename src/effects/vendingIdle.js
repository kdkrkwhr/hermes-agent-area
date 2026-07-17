/** Lounge vending (GID 38) idle LED/LCD soft ADD glow pulse.
 *  `?vendingidle=0|off|false` off · `?vendingidle=force` smoke (faster/brighter).
 *  During E-key vending_start: pulse strengthens; otherwise soft 2–4s breathe.
 */

const VENDING_GID = 38;
const MAX_MACHINES = 8;
/** Above furniture / steam (9); below status burst (11). */
const DEPTH = 10;
/** Idle breathe mid of 2–4s. */
const PERIOD_MS = 3000;
const FORCE_PERIOD_MS = 1600;
/** Soft cyan LCD / LED tint (ADD). */
const LED_CYAN = 0x66e8ff;
const LED_WHITE = 0xffffff;
const GLOW = 0x44c8ee;

/**
 * Query: omit = on. `0`/`off`/`false` = never. `force`/`1`/`on`/`true` = smoke.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function vendingIdleModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("vendingidle");
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

export function vendingIdleEnabledFromQuery() {
  return vendingIdleModeFromQuery().enabled;
}

/**
 * Scan furniture for GID 38 (no fake fallback — visual only).
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number, phase: number }[]}
 */
export function findVendingIdleTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (!layer?.getTileAt || !scene.map) return hits;

  const tw = scene.map.tileWidth ?? 32;
  const th = scene.map.tileHeight ?? 32;

  for (let ty = 0; ty < scene.map.height; ty++) {
    for (let tx = 0; tx < scene.map.width; tx++) {
      const tile = layer.getTileAt(tx, ty);
      if (!tile || tile.index !== VENDING_GID) continue;
      hits.push({
        tx,
        ty,
        x: tx * tw + tw / 2,
        y: ty * th + th / 2,
        /** Stagger machines so they don't blink in lockstep. */
        phase: (hits.length * 0.37) % 1,
      });
      if (hits.length >= MAX_MACHINES) return hits;
    }
  }
  return hits;
}

/**
 * Soft front-panel LED/LCD glow on lounge vending machines.
 */
export class VendingIdle {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = vendingIdleModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.anchors = this.enabled ? findVendingIdleTiles(scene) : [];
    this.active = false;
    this.dispensing = false;
    this.periodMs = this.forced ? FORCE_PERIOD_MS : PERIOD_MS;
    this._lastKey = "";

    this.gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);
    this.gfx.setBlendMode("ADD");

    scene.events.once("shutdown", () => this.destroy());
    this.update(scene.time?.now ?? 0);
  }

  isDispensing() {
    return this.scene.roomInteract?.vendingActive?.() ?? false;
  }

  /**
   * @param {number} [time]
   */
  update(time = this.scene.time.now) {
    if (!this.enabled || !this.anchors.length) {
      this.active = false;
      this.dispensing = false;
      this.gfx.clear();
      this.gfx.setVisible(false);
      this.publish();
      return;
    }

    this.dispensing = this.isDispensing();
    this.active = true;
    this.gfx.setVisible(true);
    this._draw(time);
    this.publish();
  }

  /**
   * Soft stacked LED strip + panel glow. Boost while snack dispense runs.
   * @param {number} time
   */
  _draw(time) {
    const g = this.gfx;
    g.clear();

    const boost = this.dispensing ? 1.85 : this.forced ? 1.35 : 1;
    const period = this.periodMs;

    for (const a of this.anchors) {
      const t = time / period + a.phase;
      const wave = (Math.sin(t * Math.PI * 2) + 1) / 2;
      // soft blink — never fully off (idle presence)
      const base = (0.14 + wave * 0.22) * boost;
      const panelY = a.y - 6;

      // outer soft glow (panel)
      g.fillStyle(GLOW, base * 0.28);
      g.fillEllipse(a.x, panelY, 28, 18);
      g.fillStyle(GLOW, base * 0.45);
      g.fillEllipse(a.x, panelY, 18, 12);

      // LCD bar
      const barW = 18;
      const barH = 4;
      const x0 = a.x - barW / 2;
      const y0 = panelY - barH / 2;
      g.fillStyle(LED_CYAN, base * 0.55);
      g.fillRect(x0 - 1, y0 - 1, barW + 2, barH + 2);
      g.fillStyle(LED_CYAN, Math.min(0.95, base * 0.9));
      g.fillRect(x0, y0, barW, barH);
      g.fillStyle(LED_WHITE, Math.min(0.7, base * 0.55));
      g.fillRect(a.x - 4, y0 + 1, 8, 1);

      // three soft LED dots under the LCD
      const dotY = panelY + 7;
      const dots = [-6, 0, 6];
      for (let i = 0; i < dots.length; i++) {
        const blink = (Math.sin((t + i * 0.22) * Math.PI * 2) + 1) / 2;
        const da = (0.2 + blink * 0.55) * boost;
        g.fillStyle(LED_CYAN, Math.min(0.95, da * 0.7));
        g.fillCircle(a.x + dots[i], dotY, 1.6);
        g.fillStyle(LED_WHITE, Math.min(0.8, da * 0.45));
        g.fillCircle(a.x + dots[i], dotY, 0.8);
      }
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      active: this.active,
      dispensing: this.dispensing,
      machineCount: this.anchors.length,
      machines: this.anchors.map((a) => ({ tx: a.tx, ty: a.ty })),
      periodMs: this.periodMs,
      vendingGid: VENDING_GID,
      depth: DEPTH,
      mode: vendingIdleModeFromQuery(),
    };
  }

  publish() {
    if (typeof location === "undefined" && typeof window === "undefined") return;
    if (typeof window === "undefined") return;
    const snap = this.snapshot();
    const key = JSON.stringify(snap);
    if (key === this._lastKey) return;
    this._lastKey = key;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      vendingIdle: snap,
    };
  }

  destroy() {
    try {
      this.gfx?.destroy();
    } catch {
      /* ignore */
    }
    this.gfx = null;
    this.anchors = [];
    this.active = false;
    this.publish();
  }
}

export { VENDING_GID, DEPTH, PERIOD_MS, FORCE_PERIOD_MS };
