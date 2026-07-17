/** Mahogany desk (GID 31) gold-trim TOD gleam.
 *  Evening/night: soft ADD gold sweep along trim (period 3–5s).
 *  Morning/day: faint specular tick only.
 *  Boss / agent near ceoDesk → one boosted gleam.
 *  `?maho=0` off · `?maho=force` smoke (night peak, short CD).
 *  Overlay only — does not hide tiles; desk-brief click untouched.
 */

const MAHO_DESK_GID = 31;
/** Map has exactly 5 CEO desk tiles. */
const MAX_DESKS = 5;
/** Above furniture (0) / chair(1); below rug(4) / agents(10). */
const DEPTH = 3;
/** Soft gold matching tileset trim ~ (196,160,90). */
const GOLD = 0xc4a05a;
const GOLD_HOT = 0xffe8b0;
const PERIOD_MIN_MS = 3000;
const PERIOD_MAX_MS = 5000;
const FORCE_PERIOD_MS = 800;
const SWEEP_MS = 520;
const DAY_TICK_MS = 9000;
const FORCE_DAY_TICK_MS = 1100;
/** Tile distance for ceoDesk proximity boost. */
const PROX_TILES = 2.25;
const BOOST_COOLDOWN_MS = 4200;
const FORCE_BOOST_CD_MS = 900;

/**
 * Query: omit = on (TOD-gated).
 * `0`/`off`/`false` = never.
 * `force`/`1`/`on`/`true` = night peak + short CD.
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function mahoModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("maho");
    if (v == null || v === "") return { enabled: true, forced: false };
    if (v === "0" || v === "false" || v === "off") {
      return { enabled: false, forced: false };
    }
    if (v === "force" || v === "1" || v === "true" || v === "on") {
      return { enabled: true, forced: true };
    }
    return { enabled: true, forced: false };
  } catch {
    return { enabled: true, forced: false };
  }
}

export function mahoEnabledFromQuery() {
  return mahoModeFromQuery().enabled;
}

/**
 * Scan furniture for mahoDesk GID 31; return tile centers (≤ MAX_DESKS).
 * @param {Phaser.Scene} scene
 * @returns {{ x: number, y: number, tx: number, ty: number, gid: number }[]}
 */
export function findMahoDeskTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (!layer?.getTileAt || !scene.map) return hits;

  const tw = scene.map.tileWidth ?? 32;
  const th = scene.map.tileHeight ?? 32;

  for (let ty = 0; ty < scene.map.height; ty++) {
    for (let tx = 0; tx < scene.map.width; tx++) {
      const tile = layer.getTileAt(tx, ty);
      if (!tile || tile.index !== MAHO_DESK_GID) continue;
      hits.push({
        tx,
        ty,
        gid: tile.index,
        x: tx * tw + tw / 2,
        y: ty * th + th / 2,
      });
      if (hits.length >= MAX_DESKS) return hits;
    }
  }
  return hits;
}

function pickPeriod(forced) {
  if (forced) return FORCE_PERIOD_MS;
  return (
    PERIOD_MIN_MS +
    Math.floor(Math.random() * (PERIOD_MAX_MS - PERIOD_MIN_MS + 1))
  );
}

function pickDayTick(forced) {
  if (forced) return FORCE_DAY_TICK_MS;
  return DAY_TICK_MS + Math.floor(Math.random() * 4000);
}

function entityTile(ent, tw) {
  if (ent?.tilePos) return ent.tilePos();
  if (!ent?.sprite) return null;
  const size = ent.tileSize || tw || 32;
  return {
    x: Math.floor(ent.sprite.x / size),
    y: Math.floor(ent.sprite.y / size),
  };
}

function isVisibleEnt(ent) {
  return !!(ent?.sprite?.active && ent.sprite.visible);
}

/**
 * Ambient gold-trim gleam — tick from OfficeScene.updateVisualEffects.
 */
export class MahoDeskGleam {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const mode = mahoModeFromQuery();
    this.enabled = mode.enabled;
    this.forced = mode.forced;
    this.tiles = this.enabled ? findMahoDeskTiles(scene) : [];
    /** @type {{ key: string, tx: number, ty: number, x: number, y: number, readyAt: number, gleamCount: number, phase: number }[]} */
    this.desks = [];
    this.gleamCount = 0;
    this.boostCount = 0;
    this.dayTickCount = 0;
    this.lastAt = null;
    this.lastKey = null;
    this.lastKind = null;
    this.nextBoostAt = 0;
    /** @type {'night'|'day'|null} */
    this.todMode = null;
    this.active = false;

    if (this.enabled) {
      for (let i = 0; i < this.tiles.length; i++) {
        const t = this.tiles[i];
        this.desks.push({
          key: `${t.tx},${t.ty}`,
          tx: t.tx,
          ty: t.ty,
          x: t.x,
          y: t.y,
          readyAt: (scene.time?.now ?? 0) + i * 400 + pickPeriod(this.forced) * 0.3,
          gleamCount: 0,
          phase: (i * 1.7) % (Math.PI * 2),
        });
      }
    }

    scene.events.once("shutdown", () => this.destroy());
    this.sync();
  }

  shouldBeActive() {
    return this.enabled && this.desks.length > 0;
  }

  resolveTodMode() {
    if (this.forced) return "night";
    const name = this.scene.lightingPreset?.name;
    if (name === "evening" || name === "night") return "night";
    return "day";
  }

  /** Call from applyTimeOfDayLighting. */
  sync() {
    if (!this.shouldBeActive()) {
      this.active = false;
      this.todMode = null;
      this.publish();
      return;
    }
    this.todMode = this.resolveTodMode();
    this.active = true;
    this.publish();
  }

  boostCd() {
    return this.forced ? FORCE_BOOST_CD_MS : BOOST_COOLDOWN_MS;
  }

  /**
   * Soft horizontal gold sweep along desk trim (tile top band).
   * @param {{ key: string, tx: number, ty: number, x: number, y: number, readyAt: number, gleamCount: number }} desk
   * @param {number} now
   * @param {"night"|"day"|"boost"|"force"} kind
   */
  _gleam(desk, now, kind) {
    const scene = this.scene;
    const night = kind === "night" || kind === "boost" || kind === "force";
    const boosted = kind === "boost";
    const dayWeak = kind === "day";

    desk.readyAt = now + (dayWeak ? pickDayTick(this.forced) : pickPeriod(this.forced));
    desk.gleamCount += 1;
    this.gleamCount += 1;
    if (dayWeak) this.dayTickCount += 1;
    if (boosted) this.boostCount += 1;
    this.lastAt = now;
    this.lastKey = desk.key;
    this.lastKind = kind;

    const peak = dayWeak ? 0.1 : boosted ? 0.55 : 0.34;
    // gold trim sits near top of desk tile (~oy+6 in gen_assets)
    const trimY = desk.y - 6;
    const halfW = dayWeak ? 8 : boosted ? 15 : 12;

    const gfx = scene.add.graphics().setDepth(DEPTH);
    gfx.setBlendMode("ADD");
    gfx.setAlpha(1);

    // soft outer wash
    gfx.fillStyle(GOLD, peak * 0.35);
    gfx.fillEllipse(desk.x, trimY, halfW * 2.4, dayWeak ? 3.5 : 5.5);
    // trim core
    gfx.fillStyle(GOLD_HOT, peak * 0.7);
    gfx.fillEllipse(desk.x - halfW * 0.35, trimY, halfW * 1.1, dayWeak ? 2.2 : 3.2);
    gfx.fillStyle(0xffffff, peak * 0.45);
    gfx.fillEllipse(desk.x - halfW * 0.55, trimY, halfW * 0.45, dayWeak ? 1.4 : 2);

    // sweep: drift highlight left→right then fade
    const startX = desk.x - halfW * 0.6;
    const endX = desk.x + halfW * 0.55;
    const proxy = { t: 0, a: 1 };
    const spark = scene.add.graphics().setDepth(DEPTH + 1);
    spark.setBlendMode("ADD");

    scene.tweens.add({
      targets: proxy,
      t: 1,
      a: 0,
      duration: dayWeak ? SWEEP_MS * 0.7 : boosted ? SWEEP_MS * 1.15 : SWEEP_MS,
      ease: "Sine.easeOut",
      onUpdate: () => {
        const x = startX + (endX - startX) * proxy.t;
        spark.clear();
        spark.fillStyle(GOLD_HOT, peak * 0.85 * proxy.a);
        spark.fillEllipse(x, trimY, dayWeak ? 4 : 7, dayWeak ? 1.6 : 2.6);
        spark.fillStyle(0xffffff, peak * 0.55 * proxy.a);
        spark.fillEllipse(x, trimY, dayWeak ? 2 : 3.2, dayWeak ? 1 : 1.5);
        gfx.setAlpha(proxy.a);
      },
      onComplete: () => {
        try {
          spark.destroy();
          gfx.destroy();
        } catch {
          /* ignore */
        }
      },
    });

    this.publish();
  }

  /** Boss or any visible agent within PROX_TILES of ceoDesk waypoint. */
  _nearCeoDesk() {
    const desk = this.scene.waypoints?.ceoDesk;
    if (!desk) return false;
    const tw = this.scene.map?.tileWidth ?? 32;
    const check = (ent) => {
      if (!isVisibleEnt(ent)) return false;
      const t = entityTile(ent, tw);
      if (!t) return false;
      return Math.hypot(t.x - desk.x, t.y - desk.y) <= PROX_TILES;
    };
    if (check(this.scene.boss)) return true;
    for (const a of this.scene.agents || []) {
      if (check(a)) return true;
    }
    return false;
  }

  /**
   * @param {number} [_time]
   * @param {number} [_delta]
   */
  update(_time, _delta) {
    if (!this.active) return;
    const now = this.scene.time.now;
    const night = this.todMode === "night";

    // proximity boost — one stronger gleam, shared CD
    if (now >= this.nextBoostAt && (this.forced || this._nearCeoDesk())) {
      const ready = this.desks.filter((d) => now >= d.readyAt);
      if (ready.length) {
        const desk = ready[Math.floor(Math.random() * ready.length)];
        this.nextBoostAt = now + this.boostCd();
        this._gleam(desk, now, this.forced ? "force" : "boost");
        return;
      }
    }

    for (const desk of this.desks) {
      if (now < desk.readyAt) continue;
      if (night || this.forced) {
        this._gleam(desk, now, this.forced ? "force" : "night");
      } else {
        // morning/day: rare weak specular tick (staggered per desk)
        this._gleam(desk, now, "day");
      }
      // one desk per tick — avoid spam across all 5
      break;
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      forced: this.forced,
      active: this.active,
      todMode: this.todMode,
      deskCount: this.desks.length,
      deskTiles: this.tiles.length,
      gleamCount: this.gleamCount,
      boostCount: this.boostCount,
      dayTickCount: this.dayTickCount,
      lastAt: this.lastAt,
      lastKey: this.lastKey,
      lastKind: this.lastKind,
      depth: DEPTH,
      mahoDeskGid: MAHO_DESK_GID,
      lighting: this.scene.lightingPreset?.name ?? null,
      mode: mahoModeFromQuery(),
      desks: this.desks.map((d) => ({ key: d.key, gleamCount: d.gleamCount })),
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      maho: this.snapshot(),
    };
  }

  destroy() {
    this.desks = [];
    this.tiles = [];
    this.active = false;
    this.publish();
  }
}

export { MAHO_DESK_GID, MAX_DESKS, DEPTH as MAHO_DESK_DEPTH };
