/** Soft ADD butterfly/bee orbit over flower pots (GID 35). morning/day only.
 *  `?pollinator=0` off · `?pollinator=force` always on + faster orbit (smoke).
 */

/** flowerPot — see gen_assets legend / plantSway PLANT_GIDS */
const FLOWER_GID = 35;
/** Cap — Open Desk + lounge has a handful of flower pots. */
const MAX_POTS = 8;
/** Near plantSway (3); below agents (10). Slightly above leaf tips. */
const DEPTH = 3.5;
/** Soft warm bee / butterfly tints (ADD). */
const BEE = 0xffe08a;
const BEE_HI = 0xfff6c8;
const BUTTERFLY = 0xffb0d8;
const BUTTERFLY_HI = 0xffe0f0;

/**
 * Query: omit = on (morning/day-gated).
 * `0`/`off`/`false` = never.
 * `1`/`on`/`true`/`force` = always (TOD ignore; still mute on precip) + short period.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function pollinatorModeFromQuery() {
  if (typeof location === "undefined") return { enabled: true, forced: false };
  try {
    const v = new URLSearchParams(location.search).get("pollinator");
    if (v == null || v === "") return { enabled: true, forced: false };
    if (v === "0" || v === "false" || v === "off") {
      return { enabled: false, forced: false };
    }
    if (v === "1" || v === "true" || v === "on" || v === "force") {
      return { enabled: true, forced: true };
    }
    return { enabled: true, forced: false };
  } catch {
    return { enabled: true, forced: false };
  }
}

/**
 * Scan furniture once for flowerPot GID; return tile centers (≤ MAX_POTS).
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number, gid: number }[]}
 */
export function findFlowerPotTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (!layer?.getTileAt || !scene.map) return hits;

  const tw = scene.map.tileWidth ?? 32;
  const th = scene.map.tileHeight ?? 32;

  for (let ty = 0; ty < scene.map.height; ty++) {
    for (let tx = 0; tx < scene.map.width; tx++) {
      const tile = layer.getTileAt(tx, ty);
      if (!tile || tile.index !== FLOWER_GID) continue;
      hits.push({
        tx,
        ty,
        gid: tile.index,
        x: tx * tw + tw / 2,
        y: ty * th + th / 2,
      });
      if (hits.length >= MAX_POTS) return hits;
    }
  }
  return hits;
}

/**
 * 1–2 soft bugs per pot — slow orbit above the bloom.
 * @param {{ x: number, y: number }[]} pots
 * @param {boolean} forced faster periods for smoke
 */
function buildBugs(pots, forced) {
  const bugs = [];
  let i = 0;
  for (const pot of pots) {
    const n = 1 + (i % 2); // alternate 1 then 2
    for (let k = 0; k < n; k++) {
      const seed = i * 5 + k * 11;
      const isBee = (seed + k) % 2 === 0;
      // normal: 4–8s · force: 2–3.2s (smoke catches motion)
      const period = forced
        ? 2000 + (seed % 4) * 300
        : 4000 + (seed % 5) * 800;
      bugs.push({
        cx: pot.x,
        /** Bloom sits near top of the 32px flower pot. */
        cy: pot.y - 8,
        kind: isBee ? "bee" : "butterfly",
        /** Orbit radius ~8–12px (spec ~10). */
        radius: 8 + (seed % 5),
        period,
        phase: (seed * 1.19) % (Math.PI * 2),
        ellipt: 0.78 + ((seed % 4) * 0.06),
        /** Counter-orbit so pair doesn't lockstep. */
        dir: k % 2 === 0 ? 1 : -1,
      });
    }
    i += 1;
  }
  return bugs;
}

/**
 * Morning/day soft ADD pollinators over flower pots. One Graphics, scanned once.
 */
export class PlantPollinators {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    const mode = pollinatorModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.pots = this.enabled ? findFlowerPotTiles(scene) : [];
    this.bugs = this.enabled ? buildBugs(this.pots, this.forced) : [];
    this.active = false;
    this.depth = DEPTH;
    this.gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);
    this.gfx.setBlendMode("ADD");
    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  /** Real precip — hide bugs (same contract as birds). */
  isPrecip() {
    const wx = this.scene.weatherFx?.classification;
    if (wx?.raining || wx?.snowing) return true;
    const rain = this.scene.windowRain;
    const snow = this.scene.snowFlakes;
    if (rain && !rain.forcedOff && (rain.forcedOn || rain.weatherForceOn)) {
      return true;
    }
    if (snow && !snow.forcedOff && (snow.forcedOn || snow.weatherForceOn)) {
      return true;
    }
    return false;
  }

  shouldBeActive() {
    if (!this.enabled || !this.bugs.length) return false;
    if (this.isPrecip()) return false;
    if (this.forced) return true;
    const name = this.scene.lightingPreset?.name;
    return name === "morning" || name === "day";
  }

  /** Call from applyTimeOfDayLighting / weatherFx. */
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
   * Slow orbital redraw.
   * @param {number} [time] scene.time.now
   */
  update(time = this.scene.time.now) {
    if (!this.active) return;

    const g = this.gfx;
    g.clear();

    for (const b of this.bugs) {
      const ang = (time / b.period) * Math.PI * 2 * b.dir + b.phase;
      const x = b.cx + Math.cos(ang) * b.radius;
      const y = b.cy + Math.sin(ang) * b.radius * b.ellipt;
      const flutter = (Math.sin(time / 280 + b.phase) + 1) / 2;
      const alpha = 0.28 + flutter * 0.42;
      const isBee = b.kind === "bee";
      const col = isBee ? BEE : BUTTERFLY;
      const hi = isBee ? BEE_HI : BUTTERFLY_HI;
      // soft body
      g.fillStyle(col, alpha * 0.35);
      g.fillEllipse(x, y, isBee ? 5.5 : 7, isBee ? 3.5 : 4.5);
      // wing flick — butterfly wider, bee tighter
      const wing = 1.2 + flutter * (isBee ? 1.4 : 2.2);
      g.fillStyle(col, alpha * 0.55);
      g.fillEllipse(x - wing, y - 0.5, isBee ? 3 : 4.5, isBee ? 2 : 2.8);
      g.fillEllipse(x + wing, y - 0.5, isBee ? 3 : 4.5, isBee ? 2 : 2.8);
      // bright core
      g.fillStyle(hi, Math.min(0.95, alpha));
      g.fillCircle(x, y, isBee ? 1.1 : 1.3);
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      active: this.active,
      count: this.bugs.length,
      potCount: this.pots.length,
      depth: this.depth,
      precip: this.isPrecip(),
      lighting: this.scene.lightingPreset?.name ?? null,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      pollinator: this.snapshot(),
    };
  }

  destroy() {
    if (this.gfx) {
      try {
        this.gfx.destroy();
      } catch {
        /* ignore */
      }
      this.gfx = null;
    }
    this.active = false;
    this.bugs = [];
    this.pots = [];
    this.publish();
  }
}

export { FLOWER_GID, MAX_POTS, DEPTH as POLLINATOR_DEPTH };
