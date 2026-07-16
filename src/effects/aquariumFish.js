/** Ambient GID-37 aquarium fish. Soft sprites. `?fish=0` off. */

import { findAquariumTiles } from "./aquariumBubbles.js";

/** Below bubbles (9); above furniture (0). */
const DEPTH = 8;
/** 1–2 fish per tank. */
const FISH_PER_TANK = 2;
/** Water inset inside 32px tile (matches gen_assets tank). */
const INSET_X = 7;
const INSET_TOP = 6;
const INSET_BOT = 10;
const ALPHA_DAY = 0.92;
const ALPHA_NIGHT = 0.55;
const TINTS = [0xff8c3c, 0xffc850, 0x5ec8ff, 0xff6b9a];

/**
 * Query: omit = on. `0`/`off`/`false` = never.
 * @returns {boolean}
 */
export function fishEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("fish");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

function isNightTod(name) {
  return name === "night" || name === "evening";
}

/** Small fish silhouette → texture (right-facing). */
function ensureFishTexture(scene) {
  if (scene.textures.exists("fx-fish")) return;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  // body
  g.fillStyle(0xffffff, 1);
  g.fillEllipse(5, 4, 8, 5);
  // tail
  g.fillTriangle(1, 4, 0, 1, 0, 7);
  // eye
  g.fillStyle(0x1a1a28, 1);
  g.fillCircle(7, 3.5, 1);
  g.generateTexture("fx-fish", 10, 8);
  g.destroy();
}

/**
 * Slow left-right swim inside each aquarium tile AABB.
 * Bubbles stay at depth 9; fish at 8 so they coexist.
 */
export class AquariumFish {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.enabled = fishEnabledFromQuery();
    this.tiles = this.enabled ? findAquariumTiles(scene) : [];
    this.fish = [];
    this.active = false;
    this.dim = false;

    if (this.enabled && this.tiles.length) {
      ensureFishTexture(scene);
      const tw = scene.map?.tileWidth ?? 32;
      const th = scene.map?.tileHeight ?? 32;
      let n = 0;
      for (const t of this.tiles) {
        const left = t.tx * tw + INSET_X;
        const right = (t.tx + 1) * tw - INSET_X;
        const top = t.ty * th + INSET_TOP;
        const bottom = (t.ty + 1) * th - INSET_BOT;
        const midX = (left + right) / 2;
        const midY = (top + bottom) / 2;
        const ampX = Math.max(2, (right - left) / 2 - 4);
        const count = FISH_PER_TANK;
        for (let i = 0; i < count; i++) {
          const sprite = scene.add
            .image(midX, midY, "fx-fish")
            .setDepth(DEPTH)
            .setAlpha(ALPHA_DAY)
            .setTint(TINTS[n % TINTS.length])
            .setVisible(false);
          this.fish.push({
            sprite,
            midX,
            midY: midY + (i === 0 ? -1.5 : 1.5),
            ampX: ampX * (0.85 + (i % 2) * 0.15),
            bobAmp: 1.2 + (i % 2) * 0.4,
            period: 4200 + (n % 5) * 500,
            bobPeriod: 2100 + (n % 3) * 300,
            phase: (n * 1.7) % (Math.PI * 2),
            bobPhase: (n * 2.3) % (Math.PI * 2),
          });
          n += 1;
        }
      }
    }

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  shouldBeActive() {
    return this.enabled && this.fish.length > 0;
  }

  /** Call from applyTimeOfDayLighting — night/evening dims alpha. */
  sync() {
    if (!this.shouldBeActive()) {
      this.active = false;
      this.dim = false;
      for (const f of this.fish) f.sprite.setVisible(false);
      this.publish();
      return;
    }

    const name = this.scene.lightingPreset?.name ?? "day";
    this.dim = isNightTod(name);
    const alpha = this.dim ? ALPHA_NIGHT : ALPHA_DAY;
    for (const f of this.fish) {
      f.sprite.setAlpha(alpha);
      f.sprite.setVisible(true);
    }
    this.active = true;
    this.publish();
  }

  /**
   * Sin swim x + light y bob. Flip when direction reverses.
   * @param {number} [time] scene.time.now
   */
  update(time = this.scene.time.now) {
    if (!this.active) return;

    for (const f of this.fish) {
      const wave = Math.sin((time / f.period) * Math.PI * 2 + f.phase);
      const bob = Math.sin((time / f.bobPeriod) * Math.PI * 2 + f.bobPhase);
      const dx = wave * f.ampX;
      const x = f.midX + dx;
      const y = f.midY + bob * f.bobAmp;
      f.sprite.setPosition(x, y);
      // right-facing texture: flip when swimming left (wave < 0)
      f.sprite.setFlipX(wave < 0);
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      active: this.active,
      dim: this.dim,
      fishCount: this.fish.length,
      aquariumTiles: this.tiles.length,
      lighting: this.scene.lightingPreset?.name ?? null,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      aquariumFish: this.snapshot(),
    };
  }

  destroy() {
    for (const f of this.fish) {
      try {
        f.sprite.destroy();
      } catch {
        /* ignore */
      }
    }
    this.fish = [];
    this.active = false;
    this.publish();
  }
}

export { DEPTH as AQUARIUM_FISH_DEPTH, FISH_PER_TANK };
