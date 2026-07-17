/** Lobby umbrella stand — visible while WindowRain / WeatherFx rain is on.
 * `?umbrella=0|off|false` disables.
 */

import { TILE_SIZE } from "../constants.js";

const TEX_STAND = "fx-umbrella-stand";
const TEX_UMBRELLA = "fx-umbrella";
/** Above furniture; below agents (10). Avoid gate depth 7.5 / signage 8. */
const DEPTH = 8.5;
const STAND_W = 22;
const STAND_H = 28;
const UMB_W = 18;
const UMB_H = 20;

/** `?umbrella=0|false|off` disables. Default on. */
export function parseUmbrellaEnabled() {
  if (typeof location === "undefined") return true;
  try {
    const q = new URLSearchParams(location.search).get("umbrella");
    return q !== "0" && q !== "false" && q !== "off";
  } catch {
    return true;
  }
}

/**
 * East lobby floor — away from entranceGate (west), signage (center-north),
 * and parcel_delivery lobby AABB center.
 * @param {Phaser.Scene} scene
 */
export function umbrellaStandAnchor(scene) {
  const tw = scene.map?.tileWidth ?? TILE_SIZE;
  const th = scene.map?.tileHeight ?? TILE_SIZE;
  const lob = scene.waypoints?.lobby;
  const xMax = Number.isFinite(lob?.xMax) ? lob.xMax : 25;
  const yMin = Number.isFinite(lob?.yMin) ? lob.yMin : 26;
  const yMax = Number.isFinite(lob?.yMax) ? lob.yMax : 28;
  // east strip, mid lobby Y — empty walk tile
  const tileX = xMax - 1.15;
  const tileY = (yMin + yMax) / 2;
  return {
    x: tileX * tw + tw / 2,
    y: tileY * th + th / 2,
    tileX,
    tileY,
  };
}

function ensureTextures(scene) {
  if (!scene.textures.exists(TEX_STAND)) {
    const g = scene.make.graphics({ add: false });
    // metal base
    g.fillStyle(0x3a4450, 1);
    g.fillEllipse(STAND_W / 2, STAND_H - 4, 16, 6);
    g.fillStyle(0x2a323c, 1);
    g.fillRect(STAND_W / 2 - 2, 6, 4, STAND_H - 12);
    g.fillStyle(0x5a6878, 1);
    g.fillRect(STAND_W / 2 - 5, 4, 10, 4);
    // drip tray
    g.fillStyle(0x4a5560, 0.9);
    g.fillRoundedRect(3, STAND_H - 8, STAND_W - 6, 5, 1);
    g.generateTexture(TEX_STAND, STAND_W, STAND_H);
    g.destroy();
  }
  if (!scene.textures.exists(TEX_UMBRELLA)) {
    const g = scene.make.graphics({ add: false });
    // folded umbrella — navy canopy + shaft
    g.fillStyle(0x2a3a68, 1);
    g.fillTriangle(UMB_W / 2, 2, 3, 12, UMB_W - 3, 12);
    g.fillStyle(0x1a2848, 1);
    g.fillTriangle(UMB_W / 2, 4, 6, 12, UMB_W - 6, 12);
    g.fillStyle(0x6a7280, 1);
    g.fillRect(UMB_W / 2 - 1, 12, 2, 7);
    g.fillStyle(0xc45a4a, 1);
    g.fillCircle(UMB_W / 2, UMB_H - 2, 2);
    g.generateTexture(TEX_UMBRELLA, UMB_W, UMB_H);
    g.destroy();
  }
}

/**
 * Ambient lobby prop: stand + 2–3 folded umbrellas while raining.
 */
export class LobbyUmbrellaStand {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.enabled = parseUmbrellaEnabled();
    this.anchor = null;
    this.root = null;
    this.stand = null;
    this.umbrellas = [];
    this.visible = false;
    this.raining = false;

    if (!this.enabled) {
      this.publish();
      return;
    }

    ensureTextures(scene);
    this.anchor = umbrellaStandAnchor(scene);
    const { x, y } = this.anchor;

    this.root = scene.add.container(x, y).setDepth(DEPTH).setScrollFactor(1);

    this.stand = scene.add.image(0, 4, TEX_STAND).setOrigin(0.5, 1);
    this.root.add(this.stand);

    const slots = [
      { x: -5, y: -10, angle: -8 },
      { x: 1, y: -12, angle: 4 },
      { x: 6, y: -9, angle: 12 },
    ];
    this.umbrellas = slots.map((s) => {
      const img = scene.add
        .image(s.x, s.y, TEX_UMBRELLA)
        .setOrigin(0.5, 1)
        .setAngle(s.angle)
        .setScale(0.95);
      this.root.add(img);
      return img;
    });

    this.root.setVisible(false);
    this.visible = false;

    scene.events.once("shutdown", () => this.destroy());
    this.publish();
  }

  /** Rain if WindowRain is emitting or WeatherFx classifies rain. */
  isRaining() {
    const rain = this.scene.windowRain;
    if (rain?.active) return true;
    if (this.scene.weatherFx?.classification?.raining) return true;
    return false;
  }

  sync() {
    if (!this.enabled || !this.root) return;
    const raining = this.isRaining();
    if (raining === this.raining && raining === this.visible) return;
    this.raining = raining;
    this.visible = raining;
    this.root.setVisible(raining);
    this.publish();
  }

  update() {
    this.sync();
  }

  snapshot() {
    return {
      enabled: this.enabled,
      visible: this.visible,
      raining: this.raining,
      tileX: this.anchor?.tileX ?? null,
      tileY: this.anchor?.tileY ?? null,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      umbrella: this.snapshot(),
    };
  }

  destroy() {
    try {
      this.root?.destroy(true);
    } catch {
      /* ignore */
    }
    this.root = null;
    this.stand = null;
    this.umbrellas = [];
    this.visible = false;
    this.publish();
  }
}
