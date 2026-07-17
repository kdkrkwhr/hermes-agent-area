/** Lobby EXIT neon — evening/night ADD breathing blink.
 *  morning/day off. `?exitneon=0` off · `?exitneon=force` smoke (+tod=night).
 */

import { TILE_SIZE } from "../constants.js";

const TEX_KEY = "fx-exit-neon";
/** Near gate (7.5) / signage (8); below agents (10). */
const DEPTH = 7.3;
const SIGN_W = 52;
const SIGN_H = 22;
/** Warm red-orange — distinct from gate LED teal/cyan. */
const NEON = 0xff6a2a;
const NEON_SOFT = 0xff9040;
/** Slow breathe period (ms). */
const PERIOD = 2800;

/**
 * Query: omit = TOD-driven. `0`/`off`/`false` = never. `force`/`1`/`on`/`true` = always.
 * @returns {{ forcedOff: boolean, forcedOn: boolean }}
 */
export function parseExitNeonMode() {
  if (typeof location === "undefined") {
    return { forcedOff: false, forcedOn: false };
  }
  try {
    const raw = new URLSearchParams(location.search).get("exitneon");
    if (raw === "0" || raw === "off" || raw === "false") {
      return { forcedOff: true, forcedOn: false };
    }
    if (raw === "force" || raw === "1" || raw === "on" || raw === "true") {
      return { forcedOff: false, forcedOn: true };
    }
  } catch {
    /* ignore */
  }
  return { forcedOff: false, forcedOn: false };
}

/**
 * Above entrance doorway — east of gate stack, south of lobby TV signage.
 * @param {Phaser.Scene} scene
 */
export function exitNeonAnchor(scene) {
  const tw = scene.map?.tileWidth ?? TILE_SIZE;
  const th = scene.map?.tileHeight ?? TILE_SIZE;
  const ent = scene.waypoints?.entrance || { x: 20, y: 27 };
  // slightly north of entrance walk tile (door lintel), centered on doorway
  const tileX = ent.x + 0.15;
  const tileY = ent.y - 0.85;
  return {
    x: tileX * tw + tw / 2,
    y: tileY * th + th / 2,
    tileX,
    tileY,
    entrance: ent,
  };
}

function ensureTexture(scene) {
  if (scene.textures.exists(TEX_KEY)) return;
  const g = scene.make.graphics({ add: false });
  // dark bezel
  g.fillStyle(0x1a1010, 1);
  g.fillRoundedRect(0, 0, SIGN_W, SIGN_H, 2);
  // warm neon frame
  g.lineStyle(2, NEON, 0.85);
  g.strokeRoundedRect(1.5, 1.5, SIGN_W - 3, SIGN_H - 3, 2);
  g.lineStyle(1, NEON_SOFT, 0.45);
  g.strokeRoundedRect(3.5, 3.5, SIGN_W - 7, SIGN_H - 7, 1);
  g.generateTexture(TEX_KEY, SIGN_W, SIGN_H);
  g.destroy();
}

/**
 * Evening/night EXIT neon. Sync via applyTimeOfDayLighting; breathe in update.
 */
export class ExitNeon {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = parseExitNeonMode();
    this.forcedOff = mode.forcedOff;
    this.forcedOn = mode.forcedOn;
    this.enabled = !this.forcedOff;
    this.anchor = null;
    this.panel = null;
    this.label = null;
    this.glow = null;
    this.active = false;
    this.mode = "off";

    if (!this.enabled) {
      this.publish();
      return;
    }

    ensureTexture(scene);
    this.anchor = exitNeonAnchor(scene);
    const { x, y } = this.anchor;

    this.glow = scene.add
      .ellipse(x, y, SIGN_W + 18, SIGN_H + 12, NEON, 0.22)
      .setDepth(DEPTH - 0.1)
      .setBlendMode("ADD")
      .setVisible(false)
      .setScrollFactor(1);

    this.panel = scene.add
      .image(x, y, TEX_KEY)
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH)
      .setBlendMode("ADD")
      .setVisible(false)
      .setScrollFactor(1);

    this.label = scene.add
      .text(x, y, "EXIT", {
        fontFamily: "Consolas, Segoe UI, monospace",
        fontSize: "11px",
        fontStyle: "bold",
        color: "#ff8040",
        align: "center",
      })
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH + 0.1)
      .setBlendMode("ADD")
      .setVisible(false)
      .setScrollFactor(1);

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  shouldBeActive() {
    if (this.forcedOff || !this.panel) return false;
    if (this.forcedOn) return true;
    const name = this.scene.lightingPreset?.name;
    return name === "evening" || name === "night";
  }

  /** Call from applyTimeOfDayLighting — evening/night (or force) only. */
  sync() {
    if (!this.enabled || !this.panel) {
      this.active = false;
      this.mode = "off";
      this._setVisible(false);
      this.publish();
      return;
    }

    const want = this.shouldBeActive();
    this.mode = want ? (this.forcedOn ? "force" : "neon") : "off";
    this.active = want;
    this._setVisible(want);
    this.publish();
  }

  _setVisible(v) {
    this.glow?.setVisible(v);
    this.panel?.setVisible(v);
    this.label?.setVisible(v);
  }

  /**
   * Slow ADD alpha breathe. No strobe.
   * @param {number} [time] scene.time.now
   */
  update(time = this.scene.time.now) {
    if (!this.active) return;
    const wave = (Math.sin((time / PERIOD) * Math.PI * 2) + 1) / 2;
    // mostly lit, gentle dim — readable EXIT at night
    const a = 0.55 + wave * 0.4;
    this.panel?.setAlpha(a);
    this.label?.setAlpha(Math.min(1, a * 1.05));
    this.glow?.setAlpha(0.12 + wave * 0.28);
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forcedOn: this.forcedOn,
      forcedOff: this.forcedOff,
      active: this.active,
      mode: this.mode,
      tod: this.scene.lightingPreset?.name ?? null,
      x: this.anchor?.x ?? null,
      y: this.anchor?.y ?? null,
      tileX: this.anchor?.tileX ?? null,
      tileY: this.anchor?.tileY ?? null,
      depth: DEPTH,
      color: NEON,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      exitNeon: this.snapshot(),
    };
  }

  destroy() {
    this.glow?.destroy();
    this.panel?.destroy();
    this.label?.destroy();
    this.glow = null;
    this.panel = null;
    this.label = null;
    this.active = false;
    this.publish();
  }
}
