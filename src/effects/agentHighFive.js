/** FE-only ambient high-five when two walking agents pass close.
 *  `?highfive=0|off|false` off · `?highfive=1|force` force · `?highfive=fast` short CD.
 *  Agents only (no boss / visitor / mascot). Visual + soft SFX — no path/bubble steal.
 */

/** Near celebrate / chatPing depth. */
const DEPTH = 11;
/** Tile euclidean — close pass. */
const DIST_TILES = 1.2;
/** Per-pair cooldown (default). */
const PAIR_CD_MS = 12000;
/** Global throttle so many pairs don't spam. */
const GLOBAL_CD_MS = 3500;
/** `?highfive=fast` cooldowns. */
const FAST_PAIR_CD_MS = 2500;
const FAST_GLOBAL_CD_MS = 1200;
/** Scale pulse duration (ms). */
const PULSE_MS = 280;
const SCALE_PEAK = 1.12;
/** Sparkle burst lifetime. */
const SPARK_LIFE_MS = 520;

/**
 * Query: omit = on.
 * `0`/`off`/`false` = never.
 * `1`/`on`/`true`/`force` = on + forced (smoke-friendly).
 * `fast` = forced + short cooldowns.
 * @returns {{ enabled: boolean, forced: boolean, fast: boolean }}
 */
export function highFiveModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false, fast: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("highfive");
    if (v == null || v === "") {
      return { enabled: true, forced: false, fast: false };
    }
    if (v === "0" || v === "false" || v === "off") {
      return { enabled: false, forced: false, fast: false };
    }
    if (v === "fast") {
      return { enabled: true, forced: true, fast: true };
    }
    if (v === "1" || v === "true" || v === "on" || v === "force") {
      return { enabled: true, forced: true, fast: false };
    }
    return { enabled: true, forced: false, fast: false };
  } catch {
    return { enabled: true, forced: false, fast: false };
  }
}

export function highFiveEnabledFromQuery() {
  return highFiveModeFromQuery().enabled;
}

function pairKey(idA, idB) {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

function isMovingAgent(agent) {
  if (!agent?.sprite?.active || !agent.sprite.visible) return false;
  if (!agent.def?.id) return false;
  // path walkers (Agent)
  if (Array.isArray(agent.path) && agent.path.length > 0) return true;
  return false;
}

function tileDist(a, b) {
  const ta = a.tilePos?.() ?? {
    x: Math.floor(a.sprite.x / (a.tileSize || 32)),
    y: Math.floor(a.sprite.y / (a.tileSize || 32)),
  };
  const tb = b.tilePos?.() ?? {
    x: Math.floor(b.sprite.x / (b.tileSize || 32)),
    y: Math.floor(b.sprite.y / (b.tileSize || 32)),
  };
  const dx = ta.x - tb.x;
  const dy = ta.y - tb.y;
  return Math.hypot(dx, dy);
}

function ensureSparkTexture(scene) {
  if (scene.textures.exists("fx-spark")) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xffffff, 1);
  g.fillCircle(4, 4, 3);
  g.generateTexture("fx-spark", 8, 8);
  g.destroy();
}

/**
 * Ambient high-five director — tick from OfficeScene.updateVisualEffects.
 */
export class AgentHighFive {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = highFiveModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.fast = mode.fast;
    /** @type {Map<string, number>} pairKey → ready-at ms */
    this._pairReadyAt = new Map();
    this._globalReadyAt = 0;
    this.fireCount = 0;
    this.lastAt = null;
    this.lastPair = null;
    /** @type {Set<string>} sprites currently pulsing */
    this._pulsing = new Set();

    if (this.enabled) {
      ensureSparkTexture(scene);
    }

    scene.events.once("shutdown", () => this.destroy());

    // force/fast: nudge first chance sooner for smoke
    if (this.enabled && this.forced) {
      this._globalReadyAt = 0;
    }
  }

  pairCooldownMs() {
    return this.fast ? FAST_PAIR_CD_MS : PAIR_CD_MS;
  }

  globalCooldownMs() {
    return this.fast ? FAST_GLOBAL_CD_MS : GLOBAL_CD_MS;
  }

  /** Call each frame while scene is live. */
  update(_time, _delta) {
    if (!this.enabled) return;
    const agents = this.scene.agents;
    if (!Array.isArray(agents) || agents.length < 2) return;

    const now = this.scene.time.now;
    if (now < this._globalReadyAt) return;

    const movers = agents.filter(isMovingAgent);
    if (movers.length < 2) return;

    let best = null;
    let bestDist = Infinity;

    for (let i = 0; i < movers.length; i++) {
      for (let j = i + 1; j < movers.length; j++) {
        const a = movers[i];
        const b = movers[j];
        const d = tileDist(a, b);
        if (d > DIST_TILES) continue;
        const key = pairKey(a.def.id, b.def.id);
        const ready = this._pairReadyAt.get(key) || 0;
        if (now < ready) continue;
        if (d < bestDist) {
          bestDist = d;
          best = { a, b, key };
        }
      }
    }

    if (!best) return;
    this._fire(best.a, best.b, best.key, now);
  }

  /**
   * @param {*} a
   * @param {*} b
   * @param {string} key
   * @param {number} now
   */
  _fire(a, b, key, now) {
    this._pairReadyAt.set(key, now + this.pairCooldownMs());
    this._globalReadyAt = now + this.globalCooldownMs();
    this.fireCount += 1;
    this.lastAt = now;
    this.lastPair = key;

    const mx = (a.sprite.x + b.sprite.x) / 2;
    const my = (a.sprite.y + b.sprite.y) / 2 - 10;

    this._pulseSprite(a);
    this._pulseSprite(b);
    this._sparkle(mx, my);
    this.scene.officeAudio?.playHighFiveSfx?.();
  }

  /** Short scale bump — restore base scale; skip if already pulsing. */
  _pulseSprite(agent) {
    const spr = agent?.sprite;
    if (!spr?.active) return;
    const id = agent.def?.id;
    if (id && this._pulsing.has(id)) return;
    if (id) this._pulsing.add(id);

    const baseX = spr.scaleX || 1;
    const baseY = spr.scaleY || 1;
    // tiny hand/shoulder nudge toward midpoint via scale only
    this.scene.tweens.add({
      targets: spr,
      scaleX: baseX * SCALE_PEAK,
      scaleY: baseY * SCALE_PEAK,
      duration: PULSE_MS * 0.45,
      yoyo: true,
      ease: "Back.easeOut",
      onComplete: () => {
        try {
          if (spr.active) {
            spr.setScale(baseX, baseY);
          }
        } catch {
          /* ignore */
        }
        if (id) this._pulsing.delete(id);
      },
    });
  }

  _sparkle(x, y) {
    const scene = this.scene;
    ensureSparkTexture(scene);
    const emitter = scene.add.particles(x, y, "fx-spark", {
      speed: { min: 36, max: 90 },
      angle: { min: 0, max: 360 },
      gravityY: 20,
      scale: { start: 0.85, end: 0 },
      alpha: { start: 0.95, end: 0 },
      lifespan: { min: 280, max: SPARK_LIFE_MS },
      quantity: 10,
      frequency: -1,
      tint: [0xfff2a8, 0xffc978, 0xffffff, 0x7eecc8],
      blendMode: "ADD",
    });
    emitter.setDepth(DEPTH);
    emitter.explode(10);

    // soft slap ring
    const gfx = scene.add.graphics().setDepth(DEPTH);
    gfx.setBlendMode("ADD");
    const state = { r: 4, alpha: 0.85 };
    const draw = () => {
      gfx.clear();
      if (state.alpha <= 0.02) return;
      gfx.lineStyle(2, 0xffe08a, state.alpha);
      gfx.strokeCircle(x, y, state.r);
    };
    draw();
    scene.tweens.add({
      targets: state,
      r: 22,
      alpha: 0,
      duration: 380,
      ease: "Cubic.easeOut",
      onUpdate: draw,
      onComplete: () => {
        try {
          gfx.destroy();
        } catch {
          /* ignore */
        }
      },
    });

    scene.time.delayedCall(SPARK_LIFE_MS + 200, () => {
      try {
        emitter.destroy();
      } catch {
        /* ignore */
      }
    });
  }

  destroy() {
    this._pairReadyAt.clear();
    this._pulsing.clear();
  }

  /** Compact smoke/debug snapshot for window.__HERMES_AREA__. */
  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      fast: this.fast,
      pairCdMs: this.pairCooldownMs(),
      globalCdMs: this.globalCooldownMs(),
      distTiles: DIST_TILES,
      fireCount: this.fireCount,
      lastAt: this.lastAt,
      lastPair: this.lastPair,
      mode: highFiveModeFromQuery(),
    };
  }
}
