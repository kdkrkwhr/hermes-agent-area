/** FE-only ambient "sorry" bubble when two walkers brush past.
 *  `?bump=0|off|false` off · `?bump=1|force` ignore pair CD (smoke).
 *  Agents + boss. Visual only — no path/collision/highFive rewrite.
 */

/** Near agent bubble / nameplate depth (Agent bubbleBg=21). */
const DEPTH = 21;
/** Tile euclidean — casual brush (tighter than highFive 1.2). */
const DIST_TILES = 0.55;
/** Per-pair cooldown range (ms). */
const PAIR_CD_MIN_MS = 8000;
const PAIR_CD_MAX_MS = 12000;
/** Sample interval — don't O(n²) every frame on big fleets. */
const SAMPLE_MS = 200;
/** Max concurrent sorry bubbles. */
const MAX_ACTIVE = 2;
/** Bubble hold before restore. */
const BUBBLE_MS = 1400;
/** Lines — short, mixed KR/EN. */
const LINES = ["엇", "미안", "Oops"];

/**
 * Query: omit = on.
 * `0`/`off`/`false` = never.
 * `1`/`on`/`true`/`force` = on + forced (smoke: skip pair CD).
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function bumpModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("bump");
    if (v == null || v === "") {
      return { enabled: true, forced: false };
    }
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

export function bumpEnabledFromQuery() {
  return bumpModeFromQuery().enabled;
}

function pairKey(idA, idB) {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

function pairCdMs() {
  return (
    PAIR_CD_MIN_MS +
    Math.floor(Math.random() * (PAIR_CD_MAX_MS - PAIR_CD_MIN_MS + 1))
  );
}

function tileOf(entity) {
  if (typeof entity?.tilePos === "function") {
    return entity.tilePos();
  }
  const ts = entity?.tileSize || 32;
  const spr = entity?.sprite;
  if (!spr) return { x: 0, y: 0 };
  return {
    x: Math.floor(spr.x / ts),
    y: Math.floor(spr.y / ts),
  };
}

function tileDist(a, b) {
  const ta = tileOf(a);
  const tb = tileOf(b);
  return Math.hypot(ta.x - tb.x, ta.y - tb.y);
}

function entityId(entity) {
  if (entity?.def?.id) return entity.def.id;
  if (entity === entity?.scene?.boss) return "boss";
  return null;
}

/** Walking agent (path) or boss (_moving). */
function isMoving(entity) {
  if (!entity?.sprite?.active || !entity.sprite.visible) return false;
  if (entity?.def?.id) {
    return Array.isArray(entity.path) && entity.path.length > 0;
  }
  // boss / non-agent walker
  return !!entity._moving;
}

function isOfflineOrSleep(agent) {
  if (!agent?.def?.id) return false; // boss ok
  if (agent.serverStatus === "offline" || agent.serverStatus === "sleep") {
    return true;
  }
  if (agent.currentKind === "sleep") return true;
  if (agent.getEffectKind?.() === "sleep") return true;
  return false;
}

/** Skip if bubble already owned by another FX / expand. */
function canOwnBubble(agent) {
  if (!agent?.def?.id) return true; // boss uses own showBubble
  if (agent._expandTimer) return false;
  if (agent._bumpBackup != null) return false;
  if (agent._bossGreetBackup != null) return false;
  if (agent._coffeeBackup != null) return false;
  if (agent._workBackup != null) return false;
  if (agent._specBackup != null) return false;
  if (agent._stretchBackup != null) return false;
  if (agent._waterBackup != null) return false;
  if (agent._phoneBackup != null) return false;
  if (agent._chatterBackup != null) return false;
  if (agent._overtimeBackup != null) return false;
  return true;
}

function highFiveBusy(scene, idA, idB) {
  const hf = scene.agentHighFive;
  if (!hf?.enabled) return false;
  if (hf._pulsing?.has?.(idA) || hf._pulsing?.has?.(idB)) return true;
  // same pair just slapped — leave the sparkle alone
  if (hf.lastPair && hf.lastPair === pairKey(idA, idB)) {
    const age = scene.time.now - (hf.lastAt || 0);
    if (age >= 0 && age < 600) return true;
  }
  return false;
}

/**
 * Ambient bump-sorry director — tick from OfficeScene.updateVisualEffects.
 */
export class AgentBumpSorry {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = bumpModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    /** @type {Map<string, number>} pairKey → ready-at ms */
    this._pairReadyAt = new Map();
    this._accumMs = 0;
    this.fireCount = 0;
    this.lastAt = null;
    this.lastPair = null;
    this.lastLine = null;
    /** @type {Set<string>} active bubble entity ids */
    this._active = new Set();
    /** @type {Phaser.Time.TimerEvent[]} */
    this._restores = [];
    this._lineCursor = 0;

    scene.events.once("shutdown", () => this.destroy());
  }

  nextLine() {
    const line = LINES[this._lineCursor % LINES.length];
    this._lineCursor += 1;
    this.lastLine = line;
    return line;
  }

  /** Call each frame while scene is live. */
  update(_time, delta) {
    if (!this.enabled) return;
    this._accumMs += delta || 0;
    if (this._accumMs < SAMPLE_MS) return;
    this._accumMs = 0;
    this._sample();
  }

  _movers() {
    const list = [];
    for (const a of this.scene.agents || []) {
      if (!isMoving(a)) continue;
      if (isOfflineOrSleep(a)) continue;
      list.push(a);
    }
    const boss = this.scene.boss;
    if (boss && isMoving(boss)) list.push(boss);
    return list;
  }

  _sample() {
    if (this.scene.officeEvents?.isGathering?.()) return;
    if (this._active.size >= MAX_ACTIVE) return;

    const movers = this._movers();
    if (movers.length < 2) return;

    const now = this.scene.time.now;
    let best = null;
    let bestDist = Infinity;

    for (let i = 0; i < movers.length; i++) {
      for (let j = i + 1; j < movers.length; j++) {
        const a = movers[i];
        const b = movers[j];
        const idA = entityId(a);
        const idB = entityId(b);
        if (!idA || !idB) continue;
        const d = tileDist(a, b);
        if (d > DIST_TILES) continue;
        if (highFiveBusy(this.scene, idA, idB)) continue;
        const key = pairKey(idA, idB);
        if (!this.forced) {
          const ready = this._pairReadyAt.get(key) || 0;
          if (now < ready) continue;
        }
        if (!pickSpeaker(a, b)) continue;
        if (d < bestDist) {
          bestDist = d;
          best = { a, b, key };
        }
      }
    }

    if (!best) return;
    const speaker = pickSpeaker(best.a, best.b);
    if (!speaker) return;
    this._showOn(speaker, best.key, now);
  }

  _showOn(entity, key, now) {
    const id = entityId(entity);
    if (!id || this._active.has(id)) return;
    if (this._active.size >= MAX_ACTIVE) return;

    this._pairReadyAt.set(key, now + pairCdMs());
    this.fireCount += 1;
    this.lastAt = now;
    this.lastPair = key;
    const line = this.nextLine();

    this._active.add(id);

    if (entity === this.scene.boss || !entity.def?.id) {
      entity.showBubble?.(line);
      const restore = this.scene.time.delayedCall(BUBBLE_MS, () => {
        this._restores = this._restores.filter((t) => t !== restore);
        this._active.delete(id);
        try {
          entity.hideBubble?.();
        } catch {
          /* ignore */
        }
        this.publish();
      });
      this._restores.push(restore);
      this.publish();
      return;
    }

    entity._bumpBackup = entity.statusText;
    entity.setStatus(line);

    const restore = this.scene.time.delayedCall(BUBBLE_MS, () => {
      this._restores = this._restores.filter((t) => t !== restore);
      this._active.delete(id);
      if (entity._bumpBackup == null) {
        this.publish();
        return;
      }
      if (entity._expandTimer) {
        entity._bumpBackup = null;
        this.publish();
        return;
      }
      if (
        entity._bossGreetBackup != null ||
        entity._coffeeBackup != null ||
        entity._workBackup != null ||
        entity._specBackup != null ||
        entity._stretchBackup != null ||
        entity._waterBackup != null ||
        entity._phoneBackup != null ||
        entity._chatterBackup != null ||
        entity._overtimeBackup != null
      ) {
        entity._bumpBackup = null;
        this.publish();
        return;
      }
      entity.setStatus(entity._bumpBackup);
      entity._bumpBackup = null;
      this.publish();
    });
    this._restores.push(restore);
    this.publish();
  }

  /** Force one sample — smoke / debug. */
  fireNow() {
    this._accumMs = SAMPLE_MS;
    this._sample();
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      distTiles: DIST_TILES,
      sampleMs: SAMPLE_MS,
      maxActive: MAX_ACTIVE,
      bubbleMs: BUBBLE_MS,
      pairCdMinMs: PAIR_CD_MIN_MS,
      pairCdMaxMs: PAIR_CD_MAX_MS,
      fireCount: this.fireCount,
      lastAt: this.lastAt,
      lastPair: this.lastPair,
      lastLine: this.lastLine,
      activeCount: this._active.size,
      activeIds: [...this._active],
      depth: DEPTH,
      lines: [...LINES],
      gathering: !!this.scene.officeEvents?.isGathering?.(),
      mode: bumpModeFromQuery(),
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      bump: this.snapshot(),
    };
  }

  destroy() {
    for (const t of this._restores) {
      try {
        t.remove(false);
      } catch {
        /* ignore */
      }
    }
    this._restores = [];
    this._pairReadyAt.clear();
    this._active.clear();
    this.publish();
  }
}

/** Prefer agent over boss for the sorry line. null if neither can speak. */
function pickSpeaker(a, b) {
  const aIsBoss = !a?.def?.id;
  const bIsBoss = !b?.def?.id;
  const order = aIsBoss && !bIsBoss ? [b, a] : bIsBoss && !aIsBoss ? [a, b] : [a, b];
  for (const e of order) {
    if (canOwnBubble(e)) return e;
  }
  return null;
}

export { DEPTH, DIST_TILES, LINES, MAX_ACTIVE, SAMPLE_MS, BUBBLE_MS };
