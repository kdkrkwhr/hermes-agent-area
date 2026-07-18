/** Random FE-only office events: toast + particles. `?events=0` off, `?events=1` fast, `?events=happy_hour` force. */

import Phaser from "phaser";

const RANDOM_KINDS = [
  "standup",
  "coffee_rush",
  "quiet_hours",
  "rain_shower",
  "lunch_rush",
  "printer_jam",
  "parcel_delivery",
  "power_flicker",
  "fire_drill",
  "stretch_break",
  "water_cooler",
  "pizza_party",
  "paper_airplane",
  "phone_ring",
  "wet_floor",
  "all_hands",
  "wifi_outage",
  "happy_hour",
];
/** wifi_outage: soft gray overlay + idle bubbles (ms) — not full blackout */
const WIFI_MIN_MS = 2000;
const WIFI_MAX_MS = 4000;
const WIFI_LINES = ["와이파이?", "버퍼링…"];
const WIFI_GRAY = 0x7a7a88;
const WIFI_ALPHA = 0.22;
/** happy_hour: lounge gather + soft amber overlay (ms) */
const HAPPY_HOLD_MIN_MS = 6000;
const HAPPY_HOLD_MAX_MS = 10000;
const HAPPY_TOASTS = ["해피아워!", "칼퇴 각?"];
const HAPPY_AMBER = 0xe8a040;
const HAPPY_ALPHA = 0.15;
/** weekday 17–20: higher pick weight; Friday gets extra */
const HAPPY_HOUR_START = 17;
const HAPPY_HOUR_END = 20;
const HAPPY_WEIGHT = 3;
const HAPPY_FRIDAY_WEIGHT = 5;
/** phone_ring: bubble + ring SFX + green pulse (ms) */
const PHONE_MIN_MS = 3000;
const PHONE_MAX_MS = 5000;
const PHONE_LINES = ["여보세요?", "네 듣고 있어요"];
/** green tone — distinct from chatPing cyan (0x88aaff) */
const PHONE_PULSE_COLOR = 0x44dd88;
/** power_flicker: dark overlay flash duration range (ms) */
const FLICKER_MIN_MS = 600;
const FLICKER_MAX_MS = 1200;
/** fire_drill: red pulse + gather duration range (ms) */
const FIRE_DRILL_MIN_MS = 8000;
const FIRE_DRILL_MAX_MS = 12000;
/** stretch_break: bubble + scale pulse at desk (ms) */
const STRETCH_MIN_MS = 4000;
const STRETCH_MAX_MS = 7000;
const STRETCH_LINES = ["으쌰", "기지개"];
/** water_cooler: lounge chat bubble duration (ms) */
const WATER_CHAT_MIN_MS = 3000;
const WATER_CHAT_MAX_MS = 5000;
const WATER_COOLER_LINES = ["오늘 blocked 많네", "커피?", "standup 언제?"];
/** pizza_party: lounge gather hold (ms) */
const PIZZA_HOLD_MIN_MS = 8000;
const PIZZA_HOLD_MAX_MS = 12000;
/** all_hands: War Room meeting gather hold (ms) */
const ALL_HANDS_HOLD_MIN_MS = 8000;
const ALL_HANDS_HOLD_MAX_MS = 12000;
const COFFEE_GID = 16;
/** furniture tileset gid 36 (office printer) — missing → lobby/entrance fallback */
export const PRINTER_GID = 36;
const PARCEL_TEX = "fx-parcel";
const PARCEL_NEAR_TILES = 2.5;
const PARCEL_MIN_MS = 8000;
const PARCEL_MAX_MS = 12000;
/** paper_airplane: open-desk / hallway flyby (ms) */
const PAPER_TEX = "fx-paper-plane";
const PAPER_MIN_MS = 4000;
const PAPER_MAX_MS = 7000;
/** lunch hours local: higher pick weight for lunch_rush */
const LUNCH_HOUR_START = 11;
const LUNCH_HOUR_END = 14;
const LUNCH_WEIGHT = 4;
/** weekday afternoon: higher pick weight for water_cooler */
const WATER_HOUR_START = 14;
const WATER_HOUR_END = 17;
const WATER_WEIGHT = 3;
/** weekday late afternoon: higher pick weight for pizza_party */
const PIZZA_HOUR_START = 16;
const PIZZA_HOUR_END = 18;
const PIZZA_WEIGHT = 3;
/** while raining: higher pick weight for wet_floor */
const WET_FLOOR_RAIN_WEIGHT = 3;
/** wet_floor: yellow caution sign + toast (ms) */
const WET_FLOOR_MIN_MS = 6000;
const WET_FLOOR_MAX_MS = 10000;
const WET_FLOOR_TEX = "fx-wet-floor";

function parseEventsMode() {
  try {
    const raw = new URLSearchParams(location.search).get("events");
    if (raw === "0" || raw === "off" || raw === "false") {
      return { enabled: false, fast: false, forceKind: null };
    }
    if (raw === "1" || raw === "fast") {
      return { enabled: true, fast: true, forceKind: null };
    }
    if (raw && RANDOM_KINDS.includes(raw)) {
      return { enabled: true, fast: false, forceKind: raw };
    }
  } catch {
    /* ignore */
  }
  return { enabled: true, fast: false, forceKind: null };
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

/** Lobby AABB center, else entrance waypoint. */
function findParcelSpot(scene) {
  const lob = scene.waypoints?.lobby;
  if (
    lob &&
    Number.isFinite(lob.xMin) &&
    Number.isFinite(lob.xMax) &&
    Number.isFinite(lob.yMin) &&
    Number.isFinite(lob.yMax)
  ) {
    const tx = (lob.xMin + lob.xMax) / 2;
    const ty = (lob.yMin + lob.yMax) / 2;
    return {
      x: tx * scene.map.tileWidth + scene.map.tileWidth / 2,
      y: ty * scene.map.tileHeight + scene.map.tileHeight / 2,
      tx,
      ty,
    };
  }
  const ent = scene.waypoints?.entrance || { x: 20, y: 27 };
  const c = tileCenter(scene, ent.x, ent.y);
  return { ...c, tx: ent.x, ty: ent.y };
}

function ensureParcelTexture(scene) {
  if (scene.textures.exists(PARCEL_TEX)) return;
  const g = scene.make.graphics({ add: false });
  // cardboard box — short stack of brown rects + tape
  g.fillStyle(0xc4a574, 1);
  g.fillRect(1, 4, 14, 10);
  g.fillStyle(0xa88858, 1);
  g.fillRect(1, 4, 14, 3);
  g.fillStyle(0xe8d4a8, 1);
  g.fillRect(7, 4, 2, 10);
  g.fillRect(1, 8, 14, 2);
  g.fillStyle(0x8b6914, 1);
  g.fillRect(6, 2, 4, 2);
  g.generateTexture(PARCEL_TEX, 16, 16);
  g.destroy();
}

/** Tiny paper-plane diamond / folded triangle. */
function ensurePaperTexture(scene) {
  if (scene.textures.exists(PAPER_TEX)) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xf4f4ee, 1);
  g.fillTriangle(1, 7, 15, 2, 15, 12);
  g.fillStyle(0xd8d8d0, 1);
  g.fillTriangle(5, 7, 15, 5, 15, 9);
  g.lineStyle(1, 0xb8b8b0, 0.9);
  g.lineBetween(1, 7, 15, 2);
  g.lineBetween(1, 7, 15, 12);
  g.lineBetween(5, 7, 15, 7);
  g.generateTexture(PAPER_TEX, 16, 14);
  g.destroy();
}

/** Yellow A-frame wet-floor caution sign. */
function ensureWetFloorTexture(scene) {
  if (scene.textures.exists(WET_FLOOR_TEX)) return;
  const g = scene.make.graphics({ add: false });
  // A-frame body
  g.fillStyle(0xf0c830, 1);
  g.fillTriangle(12, 2, 2, 26, 22, 26);
  g.fillStyle(0xe0b020, 1);
  g.fillTriangle(12, 6, 5, 24, 19, 24);
  // black caution glyph
  g.fillStyle(0x1a1a14, 1);
  g.fillTriangle(12, 9, 8, 17, 16, 17);
  g.fillRect(11, 18, 2, 3);
  g.generateTexture(WET_FLOOR_TEX, 24, 28);
  g.destroy();
}

/**
 * Lobby west / hallway junction — avoid parcel center + entranceGate west stack.
 * @param {Phaser.Scene} scene
 */
function findWetFloorSpot(scene) {
  const lob = scene.waypoints?.lobby;
  const ent = scene.waypoints?.entrance || { x: 20, y: 27 };
  if (
    lob &&
    Number.isFinite(lob.xMin) &&
    Number.isFinite(lob.yMin) &&
    Number.isFinite(lob.yMax)
  ) {
    // west lobby edge toward corridor — empty walk tile
    const tx = lob.xMin + 0.6;
    const ty = (lob.yMin + lob.yMax) / 2;
    return {
      x: tx * scene.map.tileWidth + scene.map.tileWidth / 2,
      y: ty * scene.map.tileHeight + scene.map.tileHeight / 2,
      tx,
      ty,
    };
  }
  // hallway north of entrance
  const c = tileCenter(scene, ent.x - 4, ent.y - 1);
  return { ...c, tx: ent.x - 4, ty: ent.y - 1 };
}

function isRainingNow(scene) {
  if (scene.windowRain?.active) return true;
  if (scene.weatherFx?.classification?.raining) return true;
  return false;
}

function bossTileDist(scene, tx, ty) {
  const boss = scene.boss;
  if (!boss?.sprite || !scene.map) return Infinity;
  const tw = scene.map.tileWidth;
  const th = scene.map.tileHeight;
  const bx = boss.sprite.x / tw;
  const by = boss.sprite.y / th;
  return Math.hypot(bx - tx, by - ty);
}

/** tile coords of printer furniture, else lobby/entrance. */
export function findPrinterTile(scene) {
  const layer = scene.furniture;
  if (layer?.getTileAt) {
    for (let ty = 0; ty < scene.map.height; ty++) {
      for (let tx = 0; tx < scene.map.width; tx++) {
        const tile = layer.getTileAt(tx, ty);
        if (tile?.index === PRINTER_GID) return { x: tx, y: ty };
      }
    }
  }
  const ent = scene.waypoints?.entrance;
  if (ent) return { x: ent.x, y: ent.y };
  const lob = scene.waypoints?.lobby;
  if (lob) {
    return {
      x: Math.floor((lob.xMin + lob.xMax) / 2),
      y: Math.floor((lob.yMin + lob.yMax) / 2),
    };
  }
  return { x: 20, y: 27 };
}

/** live idle / mock break — skip running·blocked·chatting. */
function isStandupGatherable(agent) {
  const s = agent?.serverStatus;
  if (
    s === "running" ||
    s === "blocked" ||
    s === "chatting" ||
    s === "offline" ||
    s === "ready" ||
    s === "review" ||
    s === "todo"
  ) {
    return false;
  }
  if (agent.live) return s === "idle";
  return agent.getEffectKind?.() === "idle";
}

/** idle + waiting (ready/review) — all-hands company meeting. */
function isAllHandsGatherable(agent) {
  if (!agent?.sprite) return false;
  const s = agent?.serverStatus;
  if (
    s === "running" ||
    s === "blocked" ||
    s === "chatting" ||
    s === "offline" ||
    s === "todo"
  ) {
    return false;
  }
  if (agent.live) {
    return s === "idle" || s === "ready" || s === "review";
  }
  const kind = agent.getEffectKind?.();
  return (
    kind === "idle" ||
    kind === "ready" ||
    agent.currentKind === "review" ||
    agent.currentKind === "queue"
  );
}

/** idle or running (desk/focus) — stretch in place, no gather move. */
function isStretchEligible(agent) {
  if (!agent?.sprite) return false;
  const kind = agent.getEffectKind?.();
  return kind === "idle" || kind === "running";
}

/** idle/break only — wifi outage bubbles (mock break → idle kind). */
function isWifiEligible(agent) {
  if (!agent?.sprite) return false;
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
    this.forceKind = mode.forceKind || null;
    this.eventCount = 0;
    this.lastEvent = null;
    this.lastAt = 0;
    this._schedule = null;
    this._active = [];
    this._toastTimer = null;
    this._shipCooldownUntil = 0;
    this.standupGathered = 0;
    this.lunchGathered = 0;
    this.printerGathered = 0;
    this.fireDrillGathered = 0;
    this.stretchAffected = 0;
    this.waterCoolerGathered = 0;
    this.pizzaPartyGathered = 0;
    this.allHandsGathered = 0;
    this.wifiOutageAffected = 0;
    this.happyHourGathered = 0;
    this.parcelActive = false;
    this.parcelNearBoss = false;
    this.paperAirplaneActive = false;
    this.phoneRingTarget = null;
    this.wetFloorActive = false;
    /** ms timestamp — IdleChatter skips while now < this */
    this._gatherUntil = 0;
    /** Sticky while standup gather/hold runs (lastEvent may become ship_it). */
    this._standupGathering = false;
  }

  /** standup / lunch / printer gather in progress. */
  isGathering() {
    return this.scene.time.now < (this._gatherUntil || 0);
  }

  /** Extend gather window so ambient chatter stays paused. */
  markGathering(ms) {
    const until = this.scene.time.now + Math.max(0, ms | 0);
    this._gatherUntil = Math.max(this._gatherUntil || 0, until);
    this.publish();
  }

  start() {
    if (!this.enabled) {
      this.publish();
      return;
    }
    this.ensureToastHost();
    if (this.forceKind) {
      const delay = this.fast ? 200 : 600;
      this.scene.time.delayedCall(delay, () => {
        if (this.enabled && this.forceKind) this.fire(this.forceKind);
      });
    }
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
    const now = new Date();
    const hour = now.getHours();
    const weekday = now.getDay() >= 1 && now.getDay() <= 5;
    const lunchWindow =
      hour >= LUNCH_HOUR_START && hour < LUNCH_HOUR_END;
    const waterWindow =
      weekday && hour >= WATER_HOUR_START && hour < WATER_HOUR_END;
    const pizzaWindow =
      weekday && hour >= PIZZA_HOUR_START && hour < PIZZA_HOUR_END;
    const happyWindow =
      weekday && hour >= HAPPY_HOUR_START && hour < HAPPY_HOUR_END;
    const friday = now.getDay() === 5;
    const raining = isRainingNow(this.scene);
    const pool = [];
    for (const k of RANDOM_KINDS) {
      if (k === "quiet_hours" && !night) continue;
      let weight = 1;
      if (k === "lunch_rush" && lunchWindow) weight = LUNCH_WEIGHT;
      else if (k === "water_cooler" && waterWindow) weight = WATER_WEIGHT;
      else if (k === "pizza_party" && pizzaWindow) weight = PIZZA_WEIGHT;
      else if (k === "happy_hour" && happyWindow)
        weight = friday ? HAPPY_FRIDAY_WEIGHT : HAPPY_WEIGHT;
      else if (k === "wet_floor" && raining) weight = WET_FLOOR_RAIN_WEIGHT;
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
    else if (kind === "printer_jam") this.runPrinterJam();
    else if (kind === "parcel_delivery") this.runParcelDelivery();
    else if (kind === "power_flicker") this.runPowerFlicker();
    else if (kind === "fire_drill") this.runFireDrill();
    else if (kind === "stretch_break") this.runStretchBreak();
    else if (kind === "water_cooler") this.runWaterCooler();
    else if (kind === "pizza_party") this.runPizzaParty();
    else if (kind === "paper_airplane") this.runPaperAirplane();
    else if (kind === "phone_ring") this.runPhoneRing();
    else if (kind === "wet_floor") this.runWetFloor();
    else if (kind === "all_hands") this.runAllHands();
    else if (kind === "wifi_outage") this.runWifiOutage();
    else if (kind === "happy_hour") this.runHappyHour();

    this.publish();
  }

  /**
   * Wet floor: yellow caution sign in lobby/hallway + toast 6–10s.
   * Skip if gather is active. Visual only (no agent move).
   */
  runWetFloor() {
    if (this.isGathering()) return;

    const spot = findWetFloorSpot(this.scene);
    ensureWetFloorTexture(this.scene);
    this.wetFloorActive = true;
    this.showToast("미끄럼 주의!", 3200);

    const sign = this.scene.add.image(spot.x, spot.y - 2, WET_FLOOR_TEX);
    sign.setDepth(9);
    sign.setScale(1.35);
    sign.setAlpha(1);

    const life =
      WET_FLOOR_MIN_MS +
      Math.floor(Math.random() * (WET_FLOOR_MAX_MS - WET_FLOOR_MIN_MS + 1));
    const fadeMs = 700;

    const fade = this.scene.time.delayedCall(life, () => {
      this.scene.tweens.add({
        targets: sign,
        alpha: 0,
        y: sign.y - 6,
        duration: fadeMs,
        ease: "Sine.easeIn",
        onComplete: () => {
          sign.destroy();
          this.wetFloorActive = false;
          this.publish();
        },
      });
    });

    this.track(() => {
      fade.remove(false);
      this.scene.tweens.killTweensOf(sign);
      sign.destroy();
      this.wetFloorActive = false;
    });
    this.publish();
  }

  /**
   * Phone ring: one idle/running agent bubble + green pulse + ring SFX.
   * Skip if gather is active. Does not mark gathering.
   */
  runPhoneRing() {
    if (this.isGathering()) return;

    const agents = shuffleInPlace(
      (this.scene.agents || []).filter((a) => isStretchEligible(a)),
    );
    const agent = agents[0];
    if (!agent?.sprite) return;

    this.showToast("전화 왔어요", 2600);
    this.playPhoneRing();

    const duration =
      PHONE_MIN_MS +
      Math.floor(Math.random() * (PHONE_MAX_MS - PHONE_MIN_MS + 1));
    const pulses = 1 + Math.floor(Math.random() * 2); // 1–2
    const spr = agent.sprite;
    const x = spr.x;
    const y = spr.y - 6;

    this.phoneRingTarget = agent.def?.id ?? agent.def?.name ?? "agent";
    this.publish();

    agent._phoneBackup = agent.statusText;
    agent.setStatus(
      PHONE_LINES[Math.floor(Math.random() * PHONE_LINES.length)],
    );

    const pulseCleanups = [];
    for (let i = 0; i < pulses; i++) {
      const delay = i * 420;
      const call = this.scene.time.delayedCall(delay, () => {
        const cleanup = this.spawnPhonePulse(x, y);
        if (cleanup) pulseCleanups.push(cleanup);
      });
      pulseCleanups.push(() => call.remove(false));
    }

    const restore = this.scene.time.delayedCall(duration, () => {
      if (agent._phoneBackup != null) {
        if (
          !agent._expandTimer &&
          agent._bossGreetBackup == null &&
          agent._coffeeBackup == null &&
          agent._workBackup == null &&
          agent._specBackup == null &&
          agent._stretchBackup == null &&
          agent._waterBackup == null &&
          agent._wifiBackup == null
        ) {
          agent.setStatus(agent._phoneBackup);
        }
        agent._phoneBackup = null;
      }
      this.phoneRingTarget = null;
      this.publish();
    });

    this.track(() => {
      restore.remove(false);
      for (const fn of pulseCleanups) {
        try {
          fn();
        } catch {
          /* ignore */
        }
      }
      if (agent._phoneBackup != null) {
        agent.setStatus(agent._phoneBackup);
        agent._phoneBackup = null;
      }
      this.phoneRingTarget = null;
    });
  }

  /** Short green ADD stroke ring — slower/greener than chatPing cyan. */
  spawnPhonePulse(x, y) {
    const gfx = this.scene.add.graphics().setDepth(11);
    gfx.setBlendMode("ADD");
    const state = { r: 5, alpha: 0.95 };
    const draw = () => {
      gfx.clear();
      if (state.alpha <= 0.01) return;
      gfx.lineStyle(2.2, PHONE_PULSE_COLOR, state.alpha);
      gfx.strokeCircle(x, y, state.r);
    };
    draw();
    const tween = this.scene.tweens.add({
      targets: state,
      r: 32,
      alpha: 0,
      duration: 700,
      ease: "Sine.easeOut",
      onUpdate: draw,
      onComplete: () => {
        try {
          gfx.destroy();
        } catch {
          /* ignore */
        }
      },
    });
    return () => {
      tween.stop();
      try {
        gfx.destroy();
      } catch {
        /* ignore */
      }
    };
  }

  /** Two short ring beeps — skip if muted/locked. */
  playPhoneRing() {
    const audio = this.scene.officeAudio;
    if (!audio || audio.muted || !audio.unlocked) return;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      for (let i = 0; i < 2; i++) {
        const start = t0 + i * 0.16;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(740, start);
        osc.frequency.setValueAtTime(880, start + 0.05);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.045, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.13);
      }
    } catch {
      /* autoplay / headless */
    }
  }

  /**
   * Paper airplane flyby: procedural plane + sine path across open desk / hallway.
   * Visual only (fire() whoosh already respects mute). Skip if gather is active.
   */
  runPaperAirplane() {
    if (this.isGathering()) return;

    this.showToast("누가 비행기 날림", 2600);
    ensurePaperTexture(this.scene);

    const map = this.scene.map;
    const mapW = map.widthInPixels;
    const th = map.tileHeight;
    const desks = this.scene.waypoints?.desks || [];
    const open = desks.filter((d) => d.y <= 12);
    const band = open.length ? open : desks;
    let midY;
    if (band.length) {
      midY =
        (band.reduce((s, d) => s + d.y, 0) / band.length) * th + th / 2;
    } else {
      midY = map.heightInPixels * 0.28;
    }
    // occasional hallway band near break/meeting
    if (Math.random() < 0.35) {
      const br = this.scene.waypoints?.break || { x: 18, y: 16 };
      midY = br.y * th + th / 2;
    }

    const leftToRight = Math.random() < 0.5;
    const startX = leftToRight ? -18 : mapW + 18;
    const endX = leftToRight ? mapW + 18 : -18;
    const amp = 16 + Math.random() * 16;
    const waves = 2 + Math.random() * 1.2;
    const life =
      PAPER_MIN_MS +
      Math.floor(Math.random() * (PAPER_MAX_MS - PAPER_MIN_MS + 1));

    const plane = this.scene.add.image(startX, midY, PAPER_TEX);
    plane.setDepth(11);
    plane.setFlipX(!leftToRight);
    this.paperAirplaneActive = true;

    const state = { t: 0 };
    const tween = this.scene.tweens.add({
      targets: state,
      t: 1,
      duration: life,
      ease: "Linear",
      onUpdate: () => {
        const t = state.t;
        plane.x = startX + (endX - startX) * t;
        plane.y = midY + Math.sin(t * Math.PI * waves) * amp;
        plane.setAngle(
          Math.sin(t * Math.PI * waves) * 14 * (leftToRight ? 1 : -1),
        );
      },
      onComplete: () => {
        plane.destroy();
        this.paperAirplaneActive = false;
        this.publish();
      },
    });

    this.track(() => {
      tween.stop();
      plane.destroy();
      this.paperAirplaneActive = false;
    });
    this.publish();
  }

  /** Lobby parcel box sprite + toast; 8–12s fade. Near boss → E hint only. */
  runParcelDelivery() {
    const spot = findParcelSpot(this.scene);
    ensureParcelTexture(this.scene);
    const near =
      bossTileDist(this.scene, spot.tx, spot.ty) <= PARCEL_NEAR_TILES;
    this.parcelActive = true;
    this.parcelNearBoss = near;
    this.showToast(
      near ? "택배 도착 · E 수령" : "택배 도착",
      near ? 4000 : 2800,
    );

    const box = this.scene.add.image(spot.x, spot.y - 4, PARCEL_TEX);
    box.setDepth(9);
    box.setScale(1.4);
    box.setAlpha(1);

    const life =
      PARCEL_MIN_MS +
      Math.floor(Math.random() * (PARCEL_MAX_MS - PARCEL_MIN_MS + 1));
    const fadeMs = 900;

    // refresh E hint if 대장님 walks close while box is up
    const poll = this.scene.time.addEvent({
      delay: 400,
      loop: true,
      callback: () => {
        if (!this.parcelActive || !box.active) return;
        const nowNear =
          bossTileDist(this.scene, spot.tx, spot.ty) <= PARCEL_NEAR_TILES;
        if (nowNear && !this.parcelNearBoss) {
          this.parcelNearBoss = true;
          this.showToast("택배 도착 · E 수령", 3200);
          this.publish();
        }
      },
    });

    const fade = this.scene.time.delayedCall(life, () => {
      poll.remove(false);
      this.scene.tweens.add({
        targets: box,
        alpha: 0,
        y: box.y - 10,
        duration: fadeMs,
        ease: "Sine.easeIn",
        onComplete: () => {
          box.destroy();
          this.parcelActive = false;
          this.publish();
        },
      });
    });

    this.track(() => {
      poll.remove(false);
      fade.remove(false);
      this.scene.tweens.killTweensOf(box);
      box.destroy();
      this.parcelActive = false;
    });
    this.publish();
  }

  runRainShower() {
    this.showToast("우천");
    this.scene.windowRain?.pulseEvent(5000 + Math.floor(Math.random() * 4000));
  }

  runStandup() {
    if (this.isGathering()) return;

    this.showToast("스탠드업 타임");
    this._standupGathering = true;
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
    void this.gatherIdleToMeeting(meet).finally(() => {
      const left = Math.max(0, (this._gatherUntil || 0) - this.scene.time.now);
      this.scene.time.delayedCall(left + 80, () => {
        this._standupGathering = false;
        this.publish();
      });
    });
  }

  /**
   * Idle/break ≤3 → center ±1 ring; hold then lounge wander.
   * @param {string} metricKey snapshot field (standupGathered | printerGathered)
   */
  async gatherIdleToMeeting(meet, metricKey = "standupGathered") {
    const agents = this.scene.agents || [];
    const candidates = shuffleInPlace(
      agents.filter((a) => isStandupGatherable(a)),
    ).slice(0, 3);
    const spots = meetingOffsets(meet);
    const holdMs = 2500 + Math.floor(Math.random() * 1501);
    // pathfind + hold — keep IdleChatter paused for the whole window
    this.markGathering(holdMs + 10000);
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

    this[metricKey] = gathered;
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

  /** toast + spark at printer/lobby; idle 2–3 → ±1 ring. */
  runPrinterJam() {
    this.showToast("프린터 잼");
    const pt = findPrinterTile(this.scene);
    const { x, y } = tileCenter(this.scene, pt.x, pt.y);
    this.spawnSparkBurst(x, y - 8, 1800);
    void this.gatherIdleToMeeting(pt, "printerGathered");
  }

  spawnSparkBurst(x, y, ms = 1500) {
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
    const stop = this.scene.time.delayedCall(ms, () => {
      emitter.stop();
      this.scene.time.delayedCall(700, () => emitter.destroy());
    });
    this.track(() => {
      stop.remove(false);
      emitter.destroy();
    });
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
    this.markGathering(holdMs + 10000);
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
    this.spawnSparkBurst(x, y, 1500);
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

  /**
   * Fire drill: toast + alarm buzz + idle → entrance gather.
   * Red lighting pulse 8–12s. Skip if another gather is already running.
   */
  runFireDrill() {
    if (this.isGathering()) return;

    this.showToast("화재 대피 훈련", 3200);
    this.playAlarmBuzz();

    const ent = this.scene.waypoints?.entrance || { x: 20, y: 27 };
    void this.gatherIdleToMeeting(ent, "fireDrillGathered");

    const overlay = this.scene.lightingOverlay;
    const preset = this.scene.lightingPreset;
    if (!overlay || !preset) return;

    const duration =
      FIRE_DRILL_MIN_MS +
      Math.floor(Math.random() * (FIRE_DRILL_MAX_MS - FIRE_DRILL_MIN_MS + 1));
    const redColor = 0xc42828;
    const redAlpha = 0.14;
    // keep chatter paused for the full pulse window
    this.markGathering(duration + 500);

    const restoreOverlay = () => {
      const p = this.scene.lightingPreset;
      if (overlay && p) overlay.setFillStyle(p.color, p.alpha);
    };

    let on = true;
    overlay.setFillStyle(redColor, redAlpha);

    const pulse = this.scene.time.addEvent({
      delay: 380,
      loop: true,
      callback: () => {
        on = !on;
        if (on) overlay.setFillStyle(redColor, redAlpha);
        else restoreOverlay();
      },
    });

    const restore = this.scene.time.delayedCall(duration, () => {
      pulse.remove(false);
      restoreOverlay();
    });

    this.track(() => {
      pulse.remove(false);
      restore.remove(false);
      restoreOverlay();
    });
  }

  /**
   * Water cooler: toast + idle/break 2–4 → lounge/break chat 3–5s.
   * Droplet/sparkle ring at lounge. Skip if another gather is active.
   */
  runWaterCooler() {
    if (this.isGathering()) return;

    // lock early so printer/standup/ship don't race during pathfind
    this.markGathering(WATER_CHAT_MAX_MS + 12000);
    this.showToast("정수기 앞 잡담 중", 2800);
    const br = this.scene.waypoints?.break || { x: 31, y: 4 };
    const { x, y } = tileCenter(this.scene, br.x, br.y);
    this.spawnDropletRing(x, y - 6, 3500);
    void this.gatherIdleToWaterCooler();
  }

  /** Small blue droplet / sparkle ring around lounge center. */
  spawnDropletRing(x, y, ms = 3500) {
    const emitter = this.scene.add.particles(x, y, "fx-spark", {
      speed: { min: 28, max: 70 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 0.85, end: 0 },
      lifespan: { min: 450, max: 800 },
      frequency: 55,
      quantity: 3,
      tint: [0x7ec8ff, 0xa8e4ff, 0xffffff, 0x5ee0c8],
      blendMode: "ADD",
    });
    emitter.setDepth(12);
    const stop = this.scene.time.delayedCall(ms, () => {
      emitter.stop();
      this.scene.time.delayedCall(800, () => emitter.destroy());
    });
    this.track(() => {
      stop.remove(false);
      emitter.destroy();
    });
  }

  /** Idle/break 2–4 → lounge spots; chat bubbles 3–5s → wander restore. */
  async gatherIdleToWaterCooler() {
    const agents = this.scene.agents || [];
    const pool = shuffleInPlace(
      agents.filter((a) => isStandupGatherable(a)),
    );
    const want = Math.min(pool.length, 2 + Math.floor(Math.random() * 3));
    const candidates = pool.slice(0, want);
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
    const holdMs =
      WATER_CHAT_MIN_MS +
      Math.floor(Math.random() * (WATER_CHAT_MAX_MS - WATER_CHAT_MIN_MS + 1));
    this.markGathering(holdMs + 10000);
    const moved = [];
    let gathered = 0;

    for (let i = 0; i < candidates.length; i++) {
      const agent = candidates[i];
      // don't re-filter mid-loop — WS may flip serverStatus while prior agents pathfind
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
      agent._waterBackup = agent.statusText;
      agent.setStatus(
        WATER_COOLER_LINES[
          Math.floor(Math.random() * WATER_COOLER_LINES.length)
        ],
      );
    }

    this.waterCoolerGathered = gathered;
    this.publish();

    if (!moved.length) return;

    const restore = this.scene.time.delayedCall(holdMs, () => {
      for (const agent of moved) {
        if (agent._waterBackup != null) {
          if (
            !agent._expandTimer &&
            agent._bossGreetBackup == null &&
            agent._coffeeBackup == null &&
            agent._workBackup == null &&
            agent._specBackup == null &&
          agent._stretchBackup == null &&
          agent._phoneBackup == null &&
          agent._wifiBackup == null
        ) {
          agent.setStatus(agent._waterBackup);
          }
          agent._waterBackup = null;
        }
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

  /**
   * Pizza party: toast + steam/confetti at lounge + idle 2–4 gather 8–12s.
   * Skip if another gather (or chatter pause lock) is active.
   */
  runPizzaParty() {
    if (this.isGathering()) return;

    const holdMs =
      PIZZA_HOLD_MIN_MS +
      Math.floor(Math.random() * (PIZZA_HOLD_MAX_MS - PIZZA_HOLD_MIN_MS + 1));
    // lock early so standup/water/ship don't race during pathfind
    this.markGathering(holdMs + 12000);
    this.showToast("피자 왔어요", 3200);
    const br = this.scene.waypoints?.break || { x: 31, y: 4 };
    const { x, y } = tileCenter(this.scene, br.x, br.y);
    this.spawnSteamBurst(x, y - 8, Math.min(4500, holdMs));
    this.spawnPizzaConfetti(x, y - 10, 3500);
    void this.gatherIdleToPizzaParty(holdMs);
  }

  /** Light pizza-colored confetti ring at lounge center. */
  spawnPizzaConfetti(x, y, ms = 3500) {
    const emitter = this.scene.add.particles(x, y, "fx-spark", {
      speed: { min: 24, max: 78 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.75, end: 0 },
      alpha: { start: 0.9, end: 0 },
      lifespan: { min: 450, max: 900 },
      frequency: 50,
      quantity: 3,
      tint: [0xff6b4a, 0xffd166, 0xffffff, 0x7ec850, 0xff9f43],
      blendMode: "ADD",
    });
    emitter.setDepth(12);
    const stop = this.scene.time.delayedCall(ms, () => {
      emitter.stop();
      this.scene.time.delayedCall(800, () => emitter.destroy());
    });
    this.track(() => {
      stop.remove(false);
      emitter.destroy();
    });
  }

  /** Idle/break 2–4 → lounge spots; hold 8–12s → wander restore. */
  async gatherIdleToPizzaParty(holdMs) {
    const agents = this.scene.agents || [];
    const pool = shuffleInPlace(
      agents.filter((a) => isStandupGatherable(a)),
    );
    const want = Math.min(pool.length, 2 + Math.floor(Math.random() * 3));
    const candidates = pool.slice(0, want);
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
    const hold =
      holdMs ??
      PIZZA_HOLD_MIN_MS +
        Math.floor(Math.random() * (PIZZA_HOLD_MAX_MS - PIZZA_HOLD_MIN_MS + 1));
    this.markGathering(hold + 10000);
    const moved = [];
    let gathered = 0;

    for (let i = 0; i < candidates.length; i++) {
      const agent = candidates[i];
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
      agent.idleUntil = this.scene.time.now + hold + 400;
    }

    this.pizzaPartyGathered = gathered;
    this.publish();

    if (!moved.length) return;

    const restore = this.scene.time.delayedCall(hold, () => {
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

  /**
   * All-hands: toast + bell + idle/ready/review → War Room meeting 8–12s.
   * Skip if another gather is already running.
   */
  runAllHands() {
    if (this.isGathering()) return;

    const holdMs =
      ALL_HANDS_HOLD_MIN_MS +
      Math.floor(
        Math.random() * (ALL_HANDS_HOLD_MAX_MS - ALL_HANDS_HOLD_MIN_MS + 1),
      );
    // lock early so standup/fire/pizza don't race during pathfind
    this.markGathering(holdMs + 12000);
    this.showToast("올핸즈!", 3200);
    this.playBellChime();

    const meet = this.scene.waypoints?.meeting || { x: 17, y: 10 };
    const { x, y } = tileCenter(this.scene, meet.x, meet.y);
    const glow = this.scene.add.circle(x, y, 64, 0x7eb8ff, 0.38);
    glow.setDepth(7);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    const tween = this.scene.tweens.add({
      targets: glow,
      alpha: 0,
      scale: 1.4,
      duration: Math.min(3600, holdMs),
      ease: "Sine.easeOut",
      onComplete: () => glow.destroy(),
    });
    this.track(() => {
      tween.stop();
      glow.destroy();
    });

    void this.gatherIdleToAllHands(holdMs);
  }

  /** Idle + ready/review → meeting ±1 ring; hold 8–12s → wander restore. */
  async gatherIdleToAllHands(holdMs) {
    const agents = this.scene.agents || [];
    const candidates = shuffleInPlace(
      agents.filter((a) => isAllHandsGatherable(a)),
    );
    const meet = this.scene.waypoints?.meeting || { x: 17, y: 10 };
    const spots = meetingOffsets(meet);
    const hold =
      holdMs ??
      ALL_HANDS_HOLD_MIN_MS +
        Math.floor(
          Math.random() * (ALL_HANDS_HOLD_MAX_MS - ALL_HANDS_HOLD_MIN_MS + 1),
        );
    this.markGathering(hold + 10000);
    const moved = [];
    let gathered = 0;

    for (let i = 0; i < candidates.length; i++) {
      const agent = candidates[i];
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
      agent.idleUntil = this.scene.time.now + hold + 400;
    }

    this.allHandsGathered = gathered;
    this.publish();

    if (!moved.length) return;

    const restore = this.scene.time.delayedCall(hold, () => {
      for (const agent of moved) {
        if (!isAllHandsGatherable(agent) && !isStandupGatherable(agent)) {
          continue;
        }
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

  /**
   * Stretch break: toast + idle/running desk bubbles + y-scale pulse.
   * No gather move. Skip if standup/lunch/printer/fire_drill gather is active.
   */
  runStretchBreak() {
    if (this.isGathering()) return;

    this.showToast("스트레칭 타임", 2800);

    const duration =
      STRETCH_MIN_MS +
      Math.floor(Math.random() * (STRETCH_MAX_MS - STRETCH_MIN_MS + 1));
    const agents = (this.scene.agents || []).filter((a) => isStretchEligible(a));
    this.stretchAffected = agents.length;
    this.publish();

    const restores = [];

    for (const agent of agents) {
      const spr = agent.sprite;
      if (!spr) continue;

      agent._stretchBackup = agent.statusText;
      agent.setStatus(
        STRETCH_LINES[Math.floor(Math.random() * STRETCH_LINES.length)],
      );

      const baseScaleX = spr.scaleX;
      const baseScaleY = spr.scaleY;
      const tween = this.scene.tweens.add({
        targets: spr,
        scaleY: baseScaleY * 1.08,
        duration: Math.min(450, Math.floor(duration / 3)),
        yoyo: true,
        repeat: Math.max(0, Math.floor(duration / 900) - 1),
        ease: "Sine.easeInOut",
        onComplete: () => {
          spr.setScale(baseScaleX, baseScaleY);
        },
      });

      const restore = this.scene.time.delayedCall(duration, () => {
        this.scene.tweens.killTweensOf(spr);
        spr.setScale(baseScaleX, baseScaleY);
        if (agent._stretchBackup != null) {
          // don't clobber if interact/expand took the bubble
          if (
            !agent._expandTimer &&
            agent._bossGreetBackup == null &&
            agent._coffeeBackup == null &&
            agent._workBackup == null &&
            agent._specBackup == null &&
            agent._phoneBackup == null &&
            agent._wifiBackup == null
          ) {
            agent.setStatus(agent._stretchBackup);
          }
          agent._stretchBackup = null;
        }
      });

      restores.push(() => {
        restore.remove(false);
        this.scene.tweens.killTweensOf(spr);
        spr.setScale(baseScaleX, baseScaleY);
        if (agent._stretchBackup != null) {
          agent.setStatus(agent._stretchBackup);
          agent._stretchBackup = null;
        }
      });
    }

    this.track(() => {
      for (const fn of restores) {
        try {
          fn();
        } catch {
          /* ignore */
        }
      }
    });
  }

  /**
   * Wifi outage: toast + soft gray overlay 2–4s (not blackout) + idle/break
   * bubbles on 1–3 agents. Skip if gather is active.
   */
  runWifiOutage() {
    if (this.isGathering()) return;

    this.showToast("와이파이 끊김…", 2800);

    const duration =
      WIFI_MIN_MS +
      Math.floor(Math.random() * (WIFI_MAX_MS - WIFI_MIN_MS + 1));

    const overlay = this.scene.lightingOverlay;
    const preset = this.scene.lightingPreset;
    const restoreOverlay = () => {
      const p = this.scene.lightingPreset;
      if (overlay && p) overlay.setFillStyle(p.color, p.alpha);
    };
    if (overlay && preset) {
      overlay.setFillStyle(WIFI_GRAY, WIFI_ALPHA);
    }

    const pool = shuffleInPlace(
      (this.scene.agents || []).filter((a) => isWifiEligible(a)),
    );
    const want = Math.min(
      pool.length,
      1 + Math.floor(Math.random() * 3), // 1–3
    );
    const picked = pool.slice(0, want);
    this.wifiOutageAffected = picked.length;
    this.publish();

    const restores = [];
    for (const agent of picked) {
      agent._wifiBackup = agent.statusText;
      agent.setStatus(
        WIFI_LINES[Math.floor(Math.random() * WIFI_LINES.length)],
      );
      restores.push(agent);
    }

    const restore = this.scene.time.delayedCall(duration, () => {
      restoreOverlay();
      for (const agent of restores) {
        if (agent._wifiBackup != null) {
          if (
            !agent._expandTimer &&
            agent._bossGreetBackup == null &&
            agent._coffeeBackup == null &&
            agent._workBackup == null &&
            agent._specBackup == null &&
            agent._stretchBackup == null &&
            agent._phoneBackup == null &&
            agent._waterBackup == null
          ) {
            agent.setStatus(agent._wifiBackup);
          }
          agent._wifiBackup = null;
        }
      }
      this.wifiOutageAffected = 0;
      this.publish();
    });

    this.track(() => {
      restore.remove(false);
      restoreOverlay();
      for (const agent of restores) {
        if (agent._wifiBackup != null) {
          agent.setStatus(agent._wifiBackup);
          agent._wifiBackup = null;
        }
      }
      this.wifiOutageAffected = 0;
    });
  }


  /**
   * Happy hour: toast + amber overlay + idle/break → lounge gather 6–10s.
   * Soft amber (not wifi gray). Skip if another gather is active.
   * Clink SFX respects mute/lock via playHappyClink.
   */
  runHappyHour() {
    if (this.isGathering()) return;

    const holdMs =
      HAPPY_HOLD_MIN_MS +
      Math.floor(Math.random() * (HAPPY_HOLD_MAX_MS - HAPPY_HOLD_MIN_MS + 1));
    this.markGathering(holdMs + 12000);
    const toast =
      HAPPY_TOASTS[Math.floor(Math.random() * HAPPY_TOASTS.length)];
    this.showToast(toast, 3200);
    this.playHappyClink();

    const overlay = this.scene.lightingOverlay;
    const preset = this.scene.lightingPreset;
    const restoreOverlay = () => {
      const p = this.scene.lightingPreset;
      if (overlay && p) overlay.setFillStyle(p.color, p.alpha);
    };
    if (overlay && preset) {
      overlay.setFillStyle(HAPPY_AMBER, HAPPY_ALPHA);
    }

    const clearAmber = this.scene.time.delayedCall(holdMs, () => {
      restoreOverlay();
      this.publish();
    });
    this.track(() => {
      clearAmber.remove(false);
      restoreOverlay();
    });

    void this.gatherIdleToHappyHour(holdMs);
  }

  /** Idle/break 2–4 → lounge spots; hold 6–10s → wander restore. */
  async gatherIdleToHappyHour(holdMs) {
    const agents = this.scene.agents || [];
    const pool = shuffleInPlace(
      agents.filter((a) => isStandupGatherable(a)),
    );
    const want = Math.min(pool.length, 2 + Math.floor(Math.random() * 3));
    const candidates = pool.slice(0, want);
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
    const hold =
      holdMs ??
      HAPPY_HOLD_MIN_MS +
        Math.floor(Math.random() * (HAPPY_HOLD_MAX_MS - HAPPY_HOLD_MIN_MS + 1));
    this.markGathering(hold + 10000);
    const moved = [];
    let gathered = 0;

    for (let i = 0; i < candidates.length; i++) {
      const agent = candidates[i];
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
      agent.idleUntil = this.scene.time.now + hold + 400;
    }

    this.happyHourGathered = gathered;
    this.publish();

    if (!moved.length) return;

    const restore = this.scene.time.delayedCall(hold, () => {
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

  /** Soft glass clink for happy_hour — skip if muted/locked. */
  playHappyClink() {
    const audio = this.scene.officeAudio;
    if (!audio || audio.muted || !audio.unlocked) return;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const notes = [988, 1319]; // B5 → E6
      for (let i = 0; i < notes.length; i++) {
        const start = t0 + i * 0.07;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(notes[i], start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.04, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.24);
      }
    } catch {
      /* autoplay / headless */
    }
  }

  /** Brief blackout flicker on lighting overlay, then restore TOD preset. */
  runPowerFlicker() {
    this.showToast("정전");
    this.playBuzz();
    const overlay = this.scene.lightingOverlay;
    const preset = this.scene.lightingPreset;
    if (!overlay || !preset) return;

    const duration =
      FLICKER_MIN_MS +
      Math.floor(Math.random() * (FLICKER_MAX_MS - FLICKER_MIN_MS + 1));
    const darkColor = 0x0a0a14;
    const darkAlpha = 0.62;

    const restoreOverlay = () => {
      const p = this.scene.lightingPreset;
      if (overlay && p) overlay.setFillStyle(p.color, p.alpha);
    };

    let dark = true;
    overlay.setFillStyle(darkColor, darkAlpha);

    const pulse = this.scene.time.addEvent({
      delay: 70,
      loop: true,
      callback: () => {
        dark = !dark;
        if (dark) overlay.setFillStyle(darkColor, darkAlpha);
        else restoreOverlay();
      },
    });

    const restore = this.scene.time.delayedCall(duration, () => {
      pulse.remove(false);
      restoreOverlay();
    });

    this.track(() => {
      pulse.remove(false);
      restore.remove(false);
      restoreOverlay();
    });
  }

  showToast(text, holdMs = 2600) {
    const el = this.ensureToastHost();
    el.textContent = text;
    el.classList.add("is-visible");
    el.classList.remove("is-out");
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      el.classList.add("is-out");
      el.classList.remove("is-visible");
    }, holdMs);
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

  /** Short electrical buzz for power_flicker — skip if muted/locked. */
  playBuzz() {
    const audio = this.scene.officeAudio;
    if (!audio || audio.muted || !audio.unlocked) return;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(90, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.035, ctx.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.16);
    } catch {
      /* autoplay / headless */
    }
  }

  /** Short alarm chirp for fire_drill — skip if muted/locked. */
  playAlarmBuzz() {
    const audio = this.scene.officeAudio;
    if (!audio || audio.muted || !audio.unlocked) return;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      // two quick siren beeps
      for (let i = 0; i < 2; i++) {
        const start = t0 + i * 0.14;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(880, start);
        osc.frequency.exponentialRampToValueAtTime(660, start + 0.1);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.04, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.12);
      }
    } catch {
      /* autoplay / headless */
    }
  }

  /** Short bell/chime for all_hands — skip if muted/locked. */
  playBellChime() {
    const audio = this.scene.officeAudio;
    if (!audio || audio.muted || !audio.unlocked) return;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const notes = [784, 1046.5]; // G5 → C6
      for (let i = 0; i < notes.length; i++) {
        const start = t0 + i * 0.09;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(notes[i], start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.045, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.3);
      }
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
      printerGathered: this.printerGathered,
      fireDrillGathered: this.fireDrillGathered,
      stretchAffected: this.stretchAffected,
      waterCoolerGathered: this.waterCoolerGathered,
      pizzaPartyGathered: this.pizzaPartyGathered,
      allHandsGathered: this.allHandsGathered,
      wifiOutageAffected: this.wifiOutageAffected,
      happyHourGathered: this.happyHourGathered,
      parcelActive: this.parcelActive,
      parcelNearBoss: this.parcelNearBoss,
      paperAirplaneActive: this.paperAirplaneActive,
      phoneRingTarget: this.phoneRingTarget,
      wetFloorActive: this.wetFloorActive,
      gathering: this.isGathering(),
      gatherUntil: this._gatherUntil || 0,
      standupGathering: !!this._standupGathering,
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
