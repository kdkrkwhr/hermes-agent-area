/** Lobby entrance — turnstile + LED visit counter + pass light. `?gate=0` off. */

import { TILE_SIZE } from "../constants.js";

const TEX_TURNSTILE = "entrance-turnstile";
const TEX_LED = "entrance-led";
const DEPTH = 7.5;
const TURNSTILE_W = 28;
const TURNSTILE_H = 36;
const LED_W = 44;
const LED_H = 22;

/** `?gate=0|false|off` disables. Default on. */
export function parseGateEnabled() {
  if (typeof location === "undefined") return true;
  try {
    const q = new URLSearchParams(location.search).get("gate");
    return q !== "0" && q !== "false" && q !== "off";
  } catch {
    return true;
  }
}

/**
 * West of entrance tile — avoids lobby TV signage (center-north wall).
 * @param {Phaser.Scene} scene
 */
export function entranceGateAnchor(scene) {
  const tw = scene.map?.tileWidth ?? TILE_SIZE;
  const th = scene.map?.tileHeight ?? TILE_SIZE;
  const ent = scene.waypoints?.entrance || { x: 20, y: 27 };
  const tileX = ent.x - 1.35;
  const tileY = ent.y - 0.2;
  return {
    x: tileX * tw + tw / 2,
    y: tileY * th + th / 2,
    tileX,
    tileY,
    entrance: ent,
  };
}

function ensureTextures(scene) {
  if (!scene.textures.exists(TEX_TURNSTILE)) {
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0x3a4450, 1);
    g.fillRoundedRect(0, 0, TURNSTILE_W, TURNSTILE_H, 3);
    g.fillStyle(0x5a6878, 1);
    g.fillRect(TURNSTILE_W / 2 - 2, 4, 4, TURNSTILE_H - 8);
    g.lineStyle(2, 0x6ec8f0, 0.7);
    g.lineBetween(6, 8, TURNSTILE_W - 6, TURNSTILE_H - 10);
    g.lineBetween(6, TURNSTILE_H - 10, TURNSTILE_W - 6, 8);
    g.generateTexture(TEX_TURNSTILE, TURNSTILE_W, TURNSTILE_H);
    g.destroy();
  }
  if (!scene.textures.exists(TEX_LED)) {
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0x141a22, 1);
    g.fillRoundedRect(0, 0, LED_W, LED_H, 2);
    g.lineStyle(1, 0x3a8ec8, 0.6);
    g.strokeRoundedRect(0.5, 0.5, LED_W - 1, LED_H - 1, 2);
    g.fillStyle(0x1e2830, 1);
    g.fillRect(4, 4, LED_W - 8, LED_H - 8);
    g.generateTexture(TEX_LED, LED_W, LED_H);
    g.destroy();
  }
}

export class EntranceGate {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.enabled = parseGateEnabled();
    this.anchor = null;
    this.turnstile = null;
    this.ledPanel = null;
    this.ledText = null;
    this.passLight = null;
    this.visitCount = 0;
    this.lastEvent = null;
    this._pulseTween = null;
    this._barTween = null;

    if (!this.enabled) return;

    ensureTextures(scene);
    this.anchor = entranceGateAnchor(scene);
    const { x, y } = this.anchor;

    this.turnstile = scene.add
      .image(x + 18, y + 4, TEX_TURNSTILE)
      .setOrigin(0.5, 0.85)
      .setDepth(DEPTH)
      .setScrollFactor(1);

    this.ledPanel = scene.add
      .image(x - 8, y - 14, TEX_LED)
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH)
      .setScrollFactor(1);

    this.ledText = scene.add
      .text(x - 8, y - 14, "IN 0", {
        fontFamily: "Consolas, Segoe UI, monospace",
        fontSize: "9px",
        color: "#5ee0c8",
        align: "center",
      })
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH + 0.1)
      .setScrollFactor(1);

    this.passLight = scene.add
      .circle(x + 18, y - 18, 5, 0x2a3848, 0.35)
      .setDepth(DEPTH - 0.1)
      .setScrollFactor(1);

    this._onVisitorSpawned = (data) => this.onVisitorEntered(data);
    this._onVisitorDespawned = (data) => this.onVisitorExited(data);
    this._onClockOutOpen = () => this.onClockOutOpen();
    this._onClockOutConfirm = () => this.onClockOutConfirm();

    scene.events.on("visitor-spawned", this._onVisitorSpawned);
    scene.events.on("visitor-despawned", this._onVisitorDespawned);
    scene.events.on("clock-out-open", this._onClockOutOpen);
    scene.events.on("clock-out-confirm", this._onClockOutConfirm);

    scene.events.once("shutdown", () => this.destroy());

    const vd = scene.visitorDirector;
    if (vd?.visitCount) this.setCount(vd.visitCount);
  }

  setCount(n) {
    this.visitCount = Math.max(0, n | 0);
    this.ledText?.setText(`IN ${this.visitCount}`);
  }

  pulseLight(color, peakAlpha = 0.95, duration = 420) {
    if (!this.passLight) return;
    this._pulseTween?.stop?.();
    this.passLight.setFillStyle(color, 0.2);
    this._pulseTween = this.scene.tweens.add({
      targets: this.passLight,
      alpha: { from: 0.25, to: peakAlpha },
      duration: duration * 0.35,
      yoyo: true,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.passLight.setFillStyle(0x2a3848, 0.35);
        this.passLight.setAlpha(0.35);
      },
    });
  }

  animateTurnstile(inward = true) {
    if (!this.turnstile) return;
    this._barTween?.stop?.();
    const base = inward ? 0 : 0.22;
    const target = inward ? 0.22 : 0;
    this.turnstile.setRotation(base);
    this._barTween = this.scene.tweens.add({
      targets: this.turnstile,
      rotation: target,
      duration: 280,
      yoyo: true,
      ease: "Quad.easeOut",
      onComplete: () => this.turnstile.setRotation(0),
    });
  }

  playBeep(kind = "in") {
    const audio = this.scene.officeAudio;
    audio?.playGateBeep?.(kind);
  }

  onVisitorEntered(data) {
    if (!this.enabled) return;
    const count = data?.count ?? this.visitCount + 1;
    this.setCount(count);
    this.lastEvent = "enter";
    this.animateTurnstile(true);
    this.pulseLight(0x5ee0c8, 0.9);
    this.playBeep("in");
  }

  onVisitorExited(data) {
    if (!this.enabled) return;
    if (data?.count != null) this.setCount(data.count);
    this.lastEvent = "exit";
    this.animateTurnstile(false);
    this.pulseLight(0x8ab4d8, 0.55, 320);
    this.playBeep("out");
  }

  onClockOutOpen() {
    if (!this.enabled) return;
    this.lastEvent = "clock-out-open";
    this.pulseLight(0xffb040, 0.75, 600);
    this.ledText?.setColor("#ffb040");
  }

  onClockOutConfirm() {
    if (!this.enabled) return;
    this.lastEvent = "clock-out";
    this.pulseLight(0xff6060, 0.95, 500);
    this.ledText?.setText("OUT");
    this.ledText?.setColor("#ff8080");
    this.playBeep("out");
    this.scene.tweens.add({
      targets: this.turnstile,
      alpha: 0.35,
      duration: 400,
      yoyo: true,
      ease: "Sine.easeInOut",
    });
  }

  snapshot() {
    return {
      enabled: this.enabled,
      visitCount: this.visitCount,
      lastEvent: this.lastEvent,
      x: this.turnstile?.x ?? this.anchor?.x ?? null,
      y: this.turnstile?.y ?? this.anchor?.y ?? null,
      tileX: this.anchor?.tileX ?? null,
      tileY: this.anchor?.tileY ?? null,
      depth: DEPTH,
    };
  }

  destroy() {
    this._pulseTween?.stop?.();
    this._barTween?.stop?.();
    const ev = this.scene?.events;
    ev?.off?.("visitor-spawned", this._onVisitorSpawned);
    ev?.off?.("visitor-despawned", this._onVisitorDespawned);
    ev?.off?.("clock-out-open", this._onClockOutOpen);
    ev?.off?.("clock-out-confirm", this._onClockOutConfirm);
    this.turnstile?.destroy();
    this.ledPanel?.destroy();
    this.ledText?.destroy();
    this.passLight?.destroy();
    this.turnstile = null;
    this.ledPanel = null;
    this.ledText = null;
    this.passLight = null;
  }
}
