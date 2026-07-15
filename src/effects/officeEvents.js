/** Random FE-only office events: toast + particles. `?events=0` off, `?events=1` fast. */

import Phaser from "phaser";

const RANDOM_KINDS = [
  "standup",
  "coffee_rush",
  "quiet_hours",
  "rain_shower",
  "lunch_rush",
];
const COFFEE_GID = 16;
/** lunch hours local: higher pick weight for lunch_rush */
const LUNCH_HOUR_START = 11;
const LUNCH_HOUR_END = 14;
const LUNCH_WEIGHT = 4;

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

/** live idle / mock break — skip running·blocked·chatting. */
function isStandupGatherable(agent) {
  const s = agent?.serverStatus;
  if (s === "running" || s === "blocked" || s === "chatting" || s === "offline") {
    return false;
  }
  if (agent.live) return s === "idle";
  return agent.getEffectKind?.() === "idle";
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** meeting ±1 tile ring, center first then neighbors. */
function meetingOffsets(meet) {
  const spots = [{ x: meet.x, y: meet.y }];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      spots.push({ x: meet.x + dx, y: meet.y + dy });
    }
  }
  return spots;
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
    this.standupGathered = 0;
    this.lunchGathered = 0;
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
    const hour = new Date().getHours();
    const lunchWindow =
      hour >= LUNCH_HOUR_START && hour < LUNCH_HOUR_END;
    const pool = [];
    for (const k of RANDOM_KINDS) {
      if (k === "quiet_hours" && !night) continue;
      const weight =
        k === "lunch_rush" && lunchWindow ? LUNCH_WEIGHT : 1;
      for (let i = 0; i < weight; i++) pool.push(k);
    }
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
    else if (kind === "rain_shower") this.runRainShower();
    else if (kind === "lunch_rush") this.runLunchRush();

    this.publish();
  }

  runRainShower() {
    this.showToast("우천");
    this.scene.windowRain?.pulseEvent(5000 + Math.floor(Math.random() * 4000));
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
    void this.gatherIdleToMeeting(meet);
  }

  /** Idle/break ≤3 → meeting ±1; 2.5–4s 후 lounge wander 복귀. */
  async gatherIdleToMeeting(meet) {
    const agents = this.scene.agents || [];
    const candidates = shuffleInPlace(
      agents.filter((a) => isStandupGatherable(a)),
    ).slice(0, 3);
    const spots = meetingOffsets(meet);
    const holdMs = 2500 + Math.floor(Math.random() * 1501);
    const moved = [];
    let gathered = 0;

    for (let i = 0; i < candidates.length; i++) {
      const agent = candidates[i];
      if (!isStandupGatherable(agent)) continue;
      const spot = spots[i % spots.length];
      let ok = false;
      try {
        ok = await agent.moveToTile(spot.x, spot.y);
        if (!ok) {
          // try other ±1 slots before giving up
          for (const alt of spots) {
            if (alt.x === spot.x && alt.y === spot.y) continue;
            ok = await agent.moveToTile(alt.x, alt.y);
            if (ok) break;
          }
        }
      } catch {
        ok = false;
      }
      if (!ok) continue;
      gathered += 1;
      moved.push(agent);
      agent.idleUntil = this.scene.time.now + holdMs + 400;
    }

    this.standupGathered = gathered;
    this.publish();

    if (!moved.length) return;

    const restore = this.scene.time.delayedCall(holdMs, () => {
      for (const agent of moved) {
        if (!isStandupGatherable(agent)) continue;
        agent.idleUntil = this.scene.time.now + 200;
        try {
          if (agent.live && agent.serverStatus === "idle") {
            void agent.wanderLounge();
          } else if (!agent.live) {
            void agent.goRandom();
          }
        } catch {
          /* ignore */
        }
      }
    });
    this.track(() => restore.remove(false));
  }

  runCoffeeRush() {
    this.showToast("커피 러시");
    const { x, y } = findCoffeeTile(this.scene);
    this.spawnSteamBurst(x, y - 8, 3000);
  }

  /** toast + lounge steam + idle ≤3 → break/lounge 3–5s → wander. */
  runLunchRush() {
    this.showToast("점심 타임");
    const br = this.scene.waypoints?.break || { x: 31, y: 4 };
    const { x, y } = tileCenter(this.scene, br.x, br.y);
    this.spawnSteamBurst(x, y - 8, 4000);
    void this.gatherIdleToLounge();
  }

  spawnSteamBurst(x, y, ms = 3000) {
    const emitter = this.scene.add.particles(x, y, "fx-steam", {
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
    const stop = this.scene.time.delayedCall(ms, () => {
      emitter.stop();
      this.scene.time.delayedCall(900, () => emitter.destroy());
    });
    this.track(() => {
      stop.remove(false);
      emitter.destroy();
    });
  }

  /** Idle/break ≤3 → lounge spots; 3–5s 후 lounge wander 복귀. */
  async gatherIdleToLounge() {
    const agents = this.scene.agents || [];
    const candidates = shuffleInPlace(
      agents.filter((a) => isStandupGatherable(a)),
    ).slice(0, 3);
    const br = this.scene.waypoints?.break || { x: 31, y: 4 };
    const lou = this.scene.waypoints?.lounge;
    const spots =
      Array.isArray(lou) && lou.length
        ? shuffleInPlace([...lou])
        : [
            br,
            { x: br.x - 1, y: br.y + 1 },
            { x: br.x + 1, y: br.y },
            { x: br.x + 2, y: br.y - 1 },
            { x: br.x - 2, y: br.y },
          ];
    const holdMs = 3000 + Math.floor(Math.random() * 2001);
    const moved = [];
    let gathered = 0;

    for (let i = 0; i < candidates.length; i++) {
      const agent = candidates[i];
      if (!isStandupGatherable(agent)) continue;
      const spot = spots[i % spots.length];
      let ok = false;
      try {
        ok = await agent.moveToTile(spot.x, spot.y);
        if (!ok) {
          for (const alt of spots) {
            if (alt.x === spot.x && alt.y === spot.y) continue;
            ok = await agent.moveToTile(alt.x, alt.y);
            if (ok) break;
          }
        }
      } catch {
        ok = false;
      }
      if (!ok) continue;
      gathered += 1;
      moved.push(agent);
      agent.idleUntil = this.scene.time.now + holdMs + 400;
    }

    this.lunchGathered = gathered;
    this.publish();

    if (!moved.length) return;

    const restore = this.scene.time.delayedCall(holdMs, () => {
      for (const agent of moved) {
        if (!isStandupGatherable(agent)) continue;
        agent.idleUntil = this.scene.time.now + 200;
        try {
          if (agent.live && agent.serverStatus === "idle") {
            void agent.wanderLounge();
          } else if (!agent.live) {
            void agent.goRandom();
          }
        } catch {
          /* ignore */
        }
      }
    });
    this.track(() => restore.remove(false));
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
      standupGathered: this.standupGathered,
      lunchGathered: this.lunchGathered,
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
