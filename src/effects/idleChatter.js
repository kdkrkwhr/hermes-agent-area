/** FE-only ambient flavor bubbles for idle/break lounge agents.
 *  `?chatter=0` off · `?chatter=1`/`fast` short interval.
 */

const POOL = [
  "커피 향 나네",
  "잠깐 눈 감아도 되지?",
  "밖에 날씨 괜찮나",
  "스트레칭 한 번…",
  "물 한 잔 할까",
  "의자 삐걱거리네",
  "환기 좀 해야 하는데",
  "간식 있냐",
  "졸린데 ㅋㅋ",
  "허리가 좀…",
  "에어컨 세다",
  "점심 뭐 먹지",
  "창문 쪽 밝네",
  "발 저리다",
];

const RESTORE_MS = 3000;
const INTERVAL_MIN = 15000;
const INTERVAL_MAX = 40000;
const FAST_MIN = 2500;
const FAST_MAX = 5000;

function parseChatterMode() {
  if (typeof location === "undefined") {
    return { enabled: true, fast: false };
  }
  try {
    const raw = new URLSearchParams(location.search).get("chatter");
    if (raw === "0" || raw === "off" || raw === "false") {
      return { enabled: false, fast: false };
    }
    if (raw === "1" || raw === "fast") {
      return { enabled: true, fast: true };
    }
  } catch {
    /* ignore */
  }
  return { enabled: true, fast: false };
}

/** @returns {boolean} */
export function chatterEnabledFromQuery() {
  return parseChatterMode().enabled;
}

function randBetween(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** idle/break only — never steal busy / interact / boss bubbles. */
export function isChatterEligible(agent) {
  if (!agent) return false;
  if (agent._expandTimer) return false;
  if (agent._bossGreetBackup != null) return false;
  if (agent._coffeeBackup != null) return false;
  if (agent._workBackup != null) return false;
  if (agent._specBackup != null) return false;
  if (agent._stretchBackup != null) return false;
  if (agent._waterBackup != null) return false;
  if (agent._chatterBackup != null) return false;

  const s = agent.serverStatus;
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
  if (agent.currentKind === "break") return true;
  return agent.getEffectKind?.() === "idle";
}

/**
 * Ambient lounge chatter. Owns bubble briefly then restores.
 */
export class IdleChatter {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = parseChatterMode();
    this.enabled = mode.enabled;
    this.fast = mode.fast;
    this.fired = 0;
    this.lastLine = null;
    this.lastAt = 0;
    this.lastAgentIds = [];
    this._timer = null;
    this._restores = [];
    this._lineCursor = 0;
    this._pool = shuffleInPlace([...POOL]);
  }

  start() {
    this.scene.events.once("shutdown", () => this.destroy());
    if (!this.enabled) {
      this.publish();
      return;
    }
    this.scheduleNext(this.fast ? 800 : 3000);
    this.publish();
  }

  scheduleNext(explicitMs) {
    if (this._timer) {
      this._timer.remove(false);
      this._timer = null;
    }
    if (!this.enabled) return;
    const ms =
      explicitMs ??
      (this.fast
        ? randBetween(FAST_MIN, FAST_MAX)
        : randBetween(INTERVAL_MIN, INTERVAL_MAX));
    this._timer = this.scene.time.delayedCall(ms, () => this.tick());
  }

  /** Pick next flavor line — avoid immediate repeats. */
  nextLine() {
    if (this._lineCursor >= this._pool.length) {
      this._pool = shuffleInPlace([...POOL]);
      this._lineCursor = 0;
    }
    const line = this._pool[this._lineCursor++];
    this.lastLine = line;
    return line;
  }

  tick() {
    this._timer = null;
    if (!this.enabled) return;

    if (this.scene.officeEvents?.isGathering?.()) {
      this.scheduleNext(this.fast ? 1500 : 5000);
      this.publish();
      return;
    }

    const agents = (this.scene.agents || []).filter((a) => isChatterEligible(a));
    if (!agents.length) {
      this.scheduleNext();
      this.publish();
      return;
    }

    shuffleInPlace(agents);
    const count = agents.length >= 2 && Math.random() < 0.45 ? 2 : 1;
    const picked = agents.slice(0, count);
    const ids = [];

    for (const agent of picked) {
      if (!isChatterEligible(agent)) continue;
      const line = this.nextLine();
      agent._chatterBackup = agent.statusText;
      agent.setStatus(line);
      ids.push(agent.def?.id ?? "?");

      const restore = this.scene.time.delayedCall(RESTORE_MS, () => {
        this._restores = this._restores.filter((t) => t !== restore);
        if (agent._chatterBackup == null) return;
        // don't clobber if another system took the bubble
        if (agent._expandTimer) {
          agent._chatterBackup = null;
          return;
        }
        if (
          agent._bossGreetBackup != null ||
          agent._coffeeBackup != null ||
          agent._workBackup != null ||
          agent._specBackup != null ||
          agent._stretchBackup != null ||
          agent._waterBackup != null
        ) {
          agent._chatterBackup = null;
          return;
        }
        agent.setStatus(agent._chatterBackup);
        agent._chatterBackup = null;
        this.publish();
      });
      this._restores.push(restore);
    }

    if (ids.length) {
      this.fired += 1;
      this.lastAt = this.scene.time.now;
      this.lastAgentIds = ids;
    }

    this.scheduleNext();
    this.publish();
  }

  /** Force one tick — smoke / debug. */
  fireNow() {
    if (this._timer) {
      this._timer.remove(false);
      this._timer = null;
    }
    this.tick();
  }

  snapshot() {
    return {
      enabled: this.enabled,
      fast: this.fast,
      fired: this.fired,
      poolSize: POOL.length,
      lastLine: this.lastLine,
      lastAt: this.lastAt,
      lastAgentIds: [...this.lastAgentIds],
      gathering: !!this.scene.officeEvents?.isGathering?.(),
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      chatter: this.snapshot(),
    };
  }

  destroy() {
    if (this._timer) {
      this._timer.remove(false);
      this._timer = null;
    }
    for (const t of this._restores) {
      try {
        t.remove(false);
      } catch {
        /* ignore */
      }
    }
    this._restores = [];
    this.publish();
  }
}
