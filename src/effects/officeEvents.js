/** Random FE-only office events: toast + particles. `?events=0` off, `?events=1` fast. */

import Phaser from "phaser";

const RANDOM_KINDS = ["standup", "coffee_rush", "quiet_hours"];
const COFFEE_GID = 16;

function parseEventsMode() {
  try {
    const raw = new URLSearchParams(location.search).get("events");
    if (raw === "0" || raw === "off" || raw === "false") {
      return { enabled: false, fast: false };
    }
    if (raw === "1" || raw === "fast") return { enabled: true, fast: true };
  } catch {
    /* ignore */
  }
  return { enabled: true, fast: false };
}

function tileCenter(scene, tx, ty) {
  const tw = scene.map.tileWidth;
  const th = scene.map.tileHeight;
  return { x: tx * tw + tw / 2, y: ty * th + th / 2 };
}

function findCoffeeTile(scene) {
  const layer = scene.furniture;
  if (layer?.getTileAt) {
    for (let ty = 0; ty < scene.map.height; ty++) {
      for (let tx = 0; tx < scene.map.width; tx++) {
        const tile = layer.getTileAt(tx, ty);
        if (tile?.index === COFFEE_GID) return tileCenter(scene, tx, ty);
      }
    }
  }
  const br = scene.waypoints?.break;
  return br ? tileCenter(scene, br.x, br.y) : tileCenter(scene, 35, 5);
}

export class OfficeEvents {
  constructor(scene) {
    this.scene = scene;
    const mode = parseEventsMode();
    this.enabled = mode.enabled;
    this.fast = mode.fast;
    this.eventCount = 0;
    this.lastEvent = null;
    this.lastAt = 0;
    this._schedule = null;
    this._active = [];
    this._toastTimer = null;
    this._shipCooldownUntil = 0;
  }

  start() {
    if (!this.enabled) {
      this.publish();
      return;
    }
    this.ensureToastHost();
    this.scheduleNext(this.fast ? 800 : 2000);
    this.scene.events.once("shutdown", () => this.destroy());
    this.publish();
  }

  destroy() {
    if (this._schedule) {
      this._schedule.remove(false);
      this._schedule = null;
    }
    for (const cleanup of this._active.splice(0)) {
      try {
        cleanup();
      } catch {
        /* ignore */
      }
    }
    if (this._toastTimer) {
      clearTimeout(this._toastTimer);
      this._toastTimer = null;
    }
    document.getElementById("office-toast")?.remove();
    this.enabled = false;
    this.publish();
  }

  scheduleNext(explicitMs) {
    if (!this.enabled) return;
    if (this._schedule) this._schedule.remove(false);
    const min = this.fast ? 1500 : 45000;
    const max = this.fast ? 4500 : 90000;
    const delay =
      explicitMs != null
        ? explicitMs
        : min + Math.floor(Math.random() * (max - min + 1));
    this._schedule = this.scene.time.delayedCall(delay, () => {
      this.fireRandom();
      this.scheduleNext();
    });
  }

  fireRandom() {
    if (!this.enabled) return;
    const night = this.scene.lightingPreset?.name === "night";
    const pool = RANDOM_KINDS.filter((k) => k !== "quiet_hours" || night);
    if (!pool.length) return;
    const kind = pool[Math.floor(Math.random() * pool.length)];
    this.fire(kind);
  }

  /** Reactive: running → other status. Cooldown avoids spam. */
  onStatusTransition(prevKind, nextKind, agent) {
    if (!this.enabled) return;
    if (prevKind !== "running") return;
    if (!nextKind || nextKind === "running") return;
    const now = this.scene.time.now;
    if (now < this._shipCooldownUntil) return;
    this._shipCooldownUntil = now + (this.fast ? 4000 : 20000);
    this.fire("ship_it", agent);
  }

  fire(kind, agent = null) {
    if (!this.enabled) return;
    this.eventCount += 1;
    this.lastEvent = kind;
    this.lastAt = Date.now();
    this.playWhoosh();

    if (kind === "standup") this.runStandup();
    else if (kind === "coffee_rush") this.runCoffeeRush();
    else if (kind === "ship_it") this.runShipIt(agent);
    else if (kind === "quiet_hours") this.runQuietHours();

    this.publish();
  }

  runStandup() {
    this.showToast("스탠드업 타임");
    const meet = this.scene.waypoints?.meeting || { x: 17, y: 10 };
    const { x, y } = tileCenter(this.scene, meet.x, meet.y);
    const glow = this.scene.add.circle(x, y, 56, 0x5ee0c8, 0.4);
    glow.setDepth(7);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    const tween = this.scene.tweens.add({
      targets: glow,
      alpha: 0,
      scale: 1.35,
      duration: 2800,
      ease: "Sine.easeOut",
      onComplete: () => glow.destroy(),
    });
    this.track(() => {
      tween.stop();
      glow.destroy();
    });
  }

  runCoffeeRush() {
    this.showToast("커피 러시");
    const { x, y } = findCoffeeTile(this.scene);
    const emitter = this.scene.add.particles(x, y - 8, "fx-steam", {
      speedX: { min: -18, max: 18 },
      speedY: { min: -48, max: -20 },
      scale: { start: 0.9, end: 0.1 },
      alpha: { start: 0.55, end: 0 },
      lifespan: { min: 500, max: 900 },
      frequency: 70,
      quantity: 2,
      tint: 0xeeeeee,
    });
    emitter.setDepth(11);
    const stop = this.scene.time.delayedCall(3000, () => {
      emitter.stop();
      this.scene.time.delayedCall(900, () => emitter.destroy());
    });
    this.track(() => {
      stop.remove(false);
      emitter.destroy();
    });
  }

  runShipIt(agent) {
    this.showToast("Ship it!");
    const spr = agent?.sprite;
    const x = spr?.x ?? this.scene.map.widthInPixels / 2;
    const y = (spr?.y ?? this.scene.map.heightInPixels / 2) - 24;
    const emitter = this.scene.add.particles(x, y, "fx-spark", {
      speed: { min: 50, max: 140 },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 },
      lifespan: { min: 400, max: 700 },
      frequency: 40,
      quantity: 4,
      tint: [0xfff066, 0xff6b9d, 0x5ee0c8, 0xffffff],
      blendMode: "ADD",
    });
    emitter.setDepth(12);
    const stop = this.scene.time.delayedCall(1500, () => {
      emitter.stop();
      this.scene.time.delayedCall(700, () => emitter.destroy());
    });
    this.track(() => {
      stop.remove(false);
      emitter.destroy();
    });
  }

  runQuietHours() {
    this.showToast("조용한 시간");
    const overlay = this.scene.lightingOverlay;
    const preset = this.scene.lightingPreset;
    if (!overlay || !preset) return;
    const boosted = Math.min(0.32, (preset.alpha || 0) + 0.08);
    overlay.setFillStyle(preset.color, boosted);
    const restore = this.scene.time.delayedCall(4000, () => {
      if (this.scene.lightingPreset) {
        overlay.setFillStyle(
          this.scene.lightingPreset.color,
          this.scene.lightingPreset.alpha,
        );
      }
    });
    this.track(() => {
      restore.remove(false);
      if (this.scene.lightingPreset) {
        overlay.setFillStyle(
          this.scene.lightingPreset.color,
          this.scene.lightingPreset.alpha,
        );
      }
    });
  }

  showToast(text) {
    const el = this.ensureToastHost();
    el.textContent = text;
    el.classList.add("is-visible");
    el.classList.remove("is-out");
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      el.classList.add("is-out");
      el.classList.remove("is-visible");
    }, 2600);
  }

  ensureToastHost() {
    let el = document.getElementById("office-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "office-toast";
      el.className = "office-toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    return el;
  }

  playWhoosh() {
    const audio = this.scene.officeAudio;
    if (!audio || audio.muted || !audio.unlocked) return;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(420, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.04, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.24);
    } catch {
      /* autoplay / headless */
    }
  }

  track(cleanup) {
    this._active.push(cleanup);
  }

  snapshot() {
    return {
      enabled: this.enabled,
      fast: this.fast,
      eventCount: this.eventCount,
      lastEvent: this.lastEvent,
      lastAt: this.lastAt,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      events: this.snapshot(),
    };
  }
}
