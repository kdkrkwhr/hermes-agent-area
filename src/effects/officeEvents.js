/** Random FE-only office events: toast + particles. `?events=0` off, `?events=1` fast. */

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
];
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
const COFFEE_GID = 16;
/** furniture tileset gid 36 (office printer) — missing → lobby/entrance fallback */
const PRINTER_GID = 36;
const PARCEL_TEX = "fx-parcel";
const PARCEL_NEAR_TILES = 2.5;
const PARCEL_MIN_MS = 8000;
const PARCEL_MAX_MS = 12000;
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
function findPrinterTile(scene) {
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

/** idle or running (desk/focus) — stretch in place, no gather move. */
function isStretchEligible(agent) {
  if (!agent?.sprite) return false;
  const kind = agent.getEffectKind?.();
  return kind === "idle" || kind === "running";
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
    this.printerGathered = 0;
    this.fireDrillGathered = 0;
    this.stretchAffected = 0;
    this.parcelActive = false;
    this.parcelNearBoss = false;
    /** ms timestamp — IdleChatter skips while now < this */
    this._gatherUntil = 0;
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
    else if (kind === "printer_jam") this.runPrinterJam();
    else if (kind === "parcel_delivery") this.runParcelDelivery();
    else if (kind === "power_flicker") this.runPowerFlicker();
    else if (kind === "fire_drill") this.runFireDrill();
    else if (kind === "stretch_break") this.runStretchBreak();

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
            agent._specBackup == null
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
      parcelActive: this.parcelActive,
      parcelNearBoss: this.parcelNearBoss,
      gathering: this.isGathering(),
      gatherUntil: this._gatherUntil || 0,
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
