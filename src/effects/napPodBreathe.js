/** Nap Pod (GID 14) soft ADD oval breathe glow. TOD-scaled; optional ambient Zzz.
 *  `?nappod=0` off · `?nappod=1` force strong (TOD ignore).
 */

const NAP_GID = 14;
/** Cap — map has a couple nap tiles near sleep waypoint. */
const MAX_PODS = 8;
/**
 * Above furniture (0) / lighting (6); below agent status Zzz (9).
 * Soft underlay so offline agent Zzz still reads on top.
 */
const GLOW_DEPTH = 7;
const ZZZ_DEPTH = 8;
/** Cool moonlit sleep tint (ADD). */
const GLOW_COLOR = 0xb8c8f0;
/** Ellipse radii in px (tile 32). */
const RX = 22;
const RY = 14;
/** Breathe period mid of 2.5–4s. */
const PERIOD_MS = 3200;

/**
 * Query: omit = on (TOD-scaled).
 * `0`/`off`/`false` = never.
 * `1`/`on`/`true`/`force` = always strong (TOD ignore).
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function napPodModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("nappod");
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

export function napPodEnabledFromQuery() {
  return napPodModeFromQuery().enabled;
}

/**
 * Scan furniture for NAP_GID; return tile centers (≤ MAX_PODS).
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number }[]}
 */
export function findNapPodTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (!layer?.getTileAt || !scene.map) return hits;

  const tw = scene.map.tileWidth ?? 32;
  const th = scene.map.tileHeight ?? 32;

  for (let ty = 0; ty < scene.map.height; ty++) {
    for (let tx = 0; tx < scene.map.width; tx++) {
      const tile = layer.getTileAt(tx, ty);
      if (!tile || tile.index !== NAP_GID) continue;
      hits.push({
        tx,
        ty,
        x: tx * tw + tw / 2,
        y: ty * th + th / 2,
      });
      if (hits.length >= MAX_PODS) return hits;
    }
  }
  return hits;
}

/** evening/night strong · morning/day weak · forced = night peak. */
function intensityScale(lightingName, forced) {
  if (forced) return 1;
  if (lightingName === "evening" || lightingName === "night") return 1;
  if (lightingName === "morning") return 0.42;
  return 0.35; // day / unknown
}

/**
 * Soft oval breathe glow on Nap Pod tiles. Sync via applyTimeOfDayLighting.
 */
export class NapPodBreathe {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    const mode = napPodModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.anchors = this.enabled ? findNapPodTiles(scene) : [];
    this.active = false;
    this.todScale = 1;
    this.gfx = scene.add.graphics().setDepth(GLOW_DEPTH).setVisible(false);
    this.gfx.setBlendMode("ADD");
    /** @type {Phaser.GameObjects.Particles.ParticleEmitter[]} */
    this.zzzEmitters = [];
    if (this.enabled && this.anchors.length) {
      this._spawnAmbientZzz();
    }
    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  _spawnAmbientZzz() {
    // 1–2 sparse Zzz above the pod cluster — quieter than agent offline emitters
    const count = Math.min(2, this.anchors.length);
    for (let i = 0; i < count; i++) {
      const a = this.anchors[i];
      const em = this.scene.add.particles(a.x + 2, a.y - 10, "fx-zzz", {
        speedX: { min: -4, max: 8 },
        speedY: { min: -14, max: -6 },
        scale: { start: 0.7, end: 0.15 },
        alpha: { start: 0.45, end: 0 },
        lifespan: { min: 900, max: 1400 },
        frequency: 900 + i * 280,
        quantity: 1,
        tint: [0xb8c8e8, 0xd0d8f0],
        rotate: { min: -10, max: 12 },
      });
      em.setDepth(ZZZ_DEPTH);
      em.stop();
      this.zzzEmitters.push(em);
    }
  }

  shouldBeActive() {
    return this.enabled && this.anchors.length > 0;
  }

  /** Call from applyTimeOfDayLighting — refresh TOD scale. */
  sync() {
    const want = this.shouldBeActive();
    if (!want) {
      this.active = false;
      this.gfx.clear();
      this.gfx.setVisible(false);
      for (const em of this.zzzEmitters) em.stop();
      this.publish();
      return;
    }
    this.todScale = intensityScale(
      this.scene.lightingPreset?.name,
      this.forced,
    );
    this.active = true;
    this.gfx.setVisible(true);
    for (const em of this.zzzEmitters) {
      if (!em.emitting) em.start();
    }
    this.publish();
  }

  /**
   * Slow alpha pulse. Clear+redraw all pods in one Graphics.
   * @param {number} [time] scene.time.now
   */
  update(time = this.scene.time.now) {
    if (!this.active) return;

    const phase = (Math.sin((time / PERIOD_MS) * Math.PI * 2) + 1) / 2;
    const base = (0.18 + phase * 0.2) * this.todScale;

    this.gfx.clear();
    for (const a of this.anchors) {
      // soft stacked ellipses (pixelArt — no blur/filter)
      this.gfx.fillStyle(GLOW_COLOR, base * 0.35);
      this.gfx.fillEllipse(a.x, a.y, RX * 2.2, RY * 2.2);
      this.gfx.fillStyle(GLOW_COLOR, base * 0.6);
      this.gfx.fillEllipse(a.x, a.y, RX * 1.35, RY * 1.35);
      this.gfx.fillStyle(GLOW_COLOR, base * 0.95);
      this.gfx.fillEllipse(a.x, a.y, RX * 0.7, RY * 0.7);
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      active: this.active,
      podCount: this.anchors.length,
      pods: this.anchors.map((a) => ({ tx: a.tx, ty: a.ty })),
      todScale: this.todScale,
      lighting: this.scene.lightingPreset?.name ?? null,
      ambientZzz: this.zzzEmitters.length,
      napPodGid: NAP_GID,
      mode: napPodModeFromQuery(),
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      nappod: this.snapshot(),
    };
  }

  destroy() {
    for (const em of this.zzzEmitters) {
      try {
        em.destroy();
      } catch {
        /* ignore */
      }
    }
    this.zzzEmitters = [];
    this.gfx?.destroy();
    this.gfx = null;
    this.anchors = [];
    this.active = false;
  }
}
