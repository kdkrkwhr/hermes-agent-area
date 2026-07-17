/** Per-room boss interactions: lounge mini-game, desk expand, meeting, nap, lobby. */

import { mountMinigame2048 } from "./ui/minigame2048.js";
import { mountNapMode } from "./ui/napMode.js";
import { findPlantTiles } from "./effects/plantSway.js";
import {
  findLobbyPosterTiles,
  posterEnabledFromQuery,
} from "./effects/lobbyPoster.js";
import { findBookshelfTiles } from "./effects/bookshelfPages.js";

const COFFEE_GID = 16;
const AQUARIUM_GID = 37;
const VENDING_GID = 38;
const LINGER_MS = 4500;
const AQUAFEED_MS = 7000;
const AQUAFEED_COOLDOWN_MS = 15000;
/** Mascot pet: 4–6s active, 12s cooldown, ~2.0 tile proximity. */
const MASCOTPET_MS_MIN = 4000;
const MASCOTPET_MS_MAX = 6000;
const MASCOTPET_COOLDOWN_MS = 12000;
const MASCOTPET_NEAR_TILES = 2.0;
/** Plant water: 2–4s drip + sway boost, 12–15s cooldown, ≤2.0 tile. */
const PLANTWATER_MS_MIN = 2000;
const PLANTWATER_MS_MAX = 4000;
const PLANTWATER_COOLDOWN_MS_MIN = 12000;
const PLANTWATER_COOLDOWN_MS_MAX = 15000;
const PLANTWATER_NEAR_TILES = 2.0;
/** Vending: 1–2s snack burst, 12–20s cooldown, ≤2.0 tile. */
const VENDING_MS_MIN = 1000;
const VENDING_MS_MAX = 2000;
const VENDING_COOLDOWN_MS_MIN = 12000;
const VENDING_COOLDOWN_MS_MAX = 20000;
const VENDING_NEAR_TILES = 2.0;
/** Poster quote: 8s cooldown, ≤2.0 tile. */
const POSTER_COOLDOWN_MS = 8000;
const POSTER_NEAR_TILES = 2.0;
const POSTER_QUOTES = [
  "출근은 선택, 퇴근은 필수",
  "일단 커밋부터",
  "이거 어제 됐는데?",
  "재현 안 됨 = 버그 아님",
  "회의 한 번 더 하죠",
  "PR 리뷰 부탁 (아님)",
  "로컬에선 되는데요",
  "약속의 월요일",
  "오늘도 야근 각",
  "LGTM 👍",
  "빌드 깨졌네 ㅋㅋ",
  "커피 없인 못 살아",
  "버그는 피처다",
  "일단 머지하고 보자",
  "스프린트 끝났다구요?",
  "WIP라고 써놨잖아",
];
/** Bookshelf tip: 3–5s toast, 12–18s cooldown, ≤2.0 tile. */
const BOOKSHELF_MS_MIN = 3000;
const BOOKSHELF_MS_MAX = 5000;
const BOOKSHELF_COOLDOWN_MS_MIN = 12000;
const BOOKSHELF_COOLDOWN_MS_MAX = 18000;
const BOOKSHELF_NEAR_TILES = 2.0;
const BOOKSHELF_TIPS = [
  "Hermes 스킬은 SKILL.md 한 장이면 충분함",
  "cron no_agent면 LLM 토큰 안 씀",
  "?help=0 으로 도움말 끄기",
  "kanban_complete 전 smoke 한 번 돌리기",
  "delegate_task는 배경에서 끝남",
  "메모리엔 선호·환경만 — 작업 로그 X",
  "L키로 시간대·BGM 톤 바꿔보기",
  "?beanbag=force 는 스모크용",
  "WS 끊기면 mock 에이전트로 폴백",
  "skills_list → skill_view 로 절차 로드",
  "playwright smoke는 ?events=0&sfx=0 추천",
  "가상사무실 FX 대부분 ?쿼리=0 로 끔",
  "칸반 blocked면 clarify 말고 kanban_block",
  "Hermes gateway 8642 — tunnel 바뀌면 PWA 주소 갱신",
  "대장님 = Boss WASD · E로 상호작용",
];
const VENDING_TOASTS = [
  "딸깍… 콜라!",
  "딸깍… 사이다!",
  "딸깍… 초코바!",
  "딸깍… 감자칩!",
];
const VISIT_KEY = "hermes-area-visit-count";
const TYPING_FRAMES = ["·", "··", "···"];
const HEART_TINTS = [0xff6699, 0xff88aa, 0xff4466, 0xffaacc];
const DROP_TINTS = [0x6ec8ff, 0x4ab0ee, 0x9ad8ff, 0x3a9ad4];
const SNACK_TINTS = [0xff5555, 0x4aa0ff, 0xffc44a, 0xff88aa, 0x88dd66];

function tileCenter(scene, tx, ty) {
  const tw = scene.map.tileWidth;
  const th = scene.map.tileHeight;
  return { x: tx * tw + tw / 2, y: ty * th + th / 2, tx, ty };
}

function findCoffeeTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (layer?.getTileAt && scene.map) {
    for (let ty = 0; ty < scene.map.height; ty++) {
      for (let tx = 0; tx < scene.map.width; tx++) {
        const tile = layer.getTileAt(tx, ty);
        if (tile?.index === COFFEE_GID) hits.push(tileCenter(scene, tx, ty));
      }
    }
  }
  if (!hits.length) {
    const br = scene.waypoints?.break || { x: 18, y: 16 };
    hits.push(tileCenter(scene, br.x + 3, br.y - 1));
  }
  return hits;
}

function findAquariumTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (layer?.getTileAt && scene.map) {
    for (let ty = 0; ty < scene.map.height; ty++) {
      for (let tx = 0; tx < scene.map.width; tx++) {
        const tile = layer.getTileAt(tx, ty);
        if (tile?.index === AQUARIUM_GID) hits.push(tileCenter(scene, tx, ty));
      }
    }
  }
  if (!hits.length) {
    const br = scene.waypoints?.break || { x: 18, y: 16 };
    hits.push(tileCenter(scene, br.x + 4, br.y - 2));
  }
  return hits;
}

function findVendingTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (layer?.getTileAt && scene.map) {
    for (let ty = 0; ty < scene.map.height; ty++) {
      for (let tx = 0; tx < scene.map.width; tx++) {
        const tile = layer.getTileAt(tx, ty);
        if (tile?.index === VENDING_GID) hits.push(tileCenter(scene, tx, ty));
      }
    }
  }
  if (!hits.length) {
    const br = scene.waypoints?.break || { x: 18, y: 16 };
    hits.push(tileCenter(scene, br.x + 6, br.y + 1));
  }
  return hits;
}

function bossTile(scene) {
  return scene.bossTile?.() ?? null;
}

function agentWorkText(agent) {
  const d = agent?.serverData;
  return (
    d?.task_title ||
    d?.bubble ||
    agent?.statusText ||
    "작업 중..."
  );
}

function truncate(text, n = 48) {
  const raw = String(text ?? "").replace(/\s+/g, " ").trim();
  if (raw.length <= n) return raw;
  return `${raw.slice(0, Math.max(0, n - 1))}…`;
}

function isWorking(agent) {
  const s = agent?.serverStatus;
  if (s === "running" || s === "chatting") return true;
  if (agent?.live) return false;
  return agent?.getEffectKind?.() === "running";
}

function inMeetingZone(scene, tile, pad = 2) {
  if (!tile) return false;
  const m = scene.waypoints?.meeting || { x: 18, y: 9 };
  return Math.abs(tile.x - m.x) <= pad && Math.abs(tile.y - m.y) <= pad;
}

function agentTile(agent) {
  return agent?.tilePos?.() ?? null;
}

function nearSleep(scene) {
  const sleep = scene.waypoints?.sleep || { x: 31, y: 21 };
  const b = scene.boss?.sprite;
  if (!b) return false;
  const tw = scene.map.tileWidth;
  const bx = b.x / tw;
  const by = b.y / tw;
  return Math.hypot(bx - sleep.x, by - sleep.y) <= 2.4;
}

function nearCoffee(scene, coffeeTiles) {
  const b = scene.boss?.sprite;
  if (!b) return false;
  for (const c of coffeeTiles) {
    if (Math.hypot(b.x - c.x, b.y - c.y) <= 56) return true;
  }
  return false;
}

function nearAquarium(scene, aquariumTiles) {
  const b = scene.boss?.sprite;
  if (!b) return false;
  for (const c of aquariumTiles) {
    if (Math.hypot(b.x - c.x, b.y - c.y) <= 62) return true;
  }
  return false;
}

function aquariumFeedEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("aquafeed");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

/** Default on; `?mascotpet=0|false|off` disables (mascot spawn still needs `?mascot≠0`). */
function mascotPetEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("mascotpet");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

function nearMascot(scene) {
  const m = scene.mascot?.sprite;
  const b = scene.boss?.sprite;
  if (!m || !b || !scene.map) return false;
  const reach = scene.map.tileWidth * MASCOTPET_NEAR_TILES;
  return Math.hypot(b.x - m.x, b.y - m.y) <= reach;
}

/** Default on; `?plantwater=0|false|off` disables. */
function plantWaterEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("plantwater");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

/** Default on; `?vending=0|false|off` disables. */
function vendingEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("vending");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

/** Default on; `?bookshelftip=0|false|off` disables E-tip only (ambient FX still on). */
function bookshelfTipEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("bookshelftip");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

function nearPlant(scene, plantTiles) {
  const b = scene.boss?.sprite;
  if (!b || !scene.map || !plantTiles?.length) return false;
  const reach = scene.map.tileWidth * PLANTWATER_NEAR_TILES;
  for (const p of plantTiles) {
    if (Math.hypot(b.x - p.x, b.y - p.y) <= reach) return true;
  }
  return false;
}

function nearVending(scene, vendingTiles) {
  const b = scene.boss?.sprite;
  if (!b || !scene.map || !vendingTiles?.length) return false;
  const reach = scene.map.tileWidth * VENDING_NEAR_TILES;
  for (const v of vendingTiles) {
    if (Math.hypot(b.x - v.x, b.y - v.y) <= reach) return true;
  }
  return false;
}

function nearPoster(scene, posterTiles) {
  const b = scene.boss?.sprite;
  if (!b || !scene.map || !posterTiles?.length) return false;
  const reach = scene.map.tileWidth * POSTER_NEAR_TILES;
  for (const p of posterTiles) {
    if (Math.hypot(b.x - p.x, b.y - p.y) <= reach) return true;
  }
  return false;
}

function nearestPoster(scene, posterTiles) {
  const b = scene.boss?.sprite;
  if (!b || !posterTiles?.length) return null;
  let best = null;
  let bestD = Infinity;
  for (const p of posterTiles) {
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function nearestVending(scene, vendingTiles) {
  const b = scene.boss?.sprite;
  if (!b || !vendingTiles?.length) return null;
  let best = null;
  let bestD = Infinity;
  for (const v of vendingTiles) {
    const d = Math.hypot(b.x - v.x, b.y - v.y);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}

function nearestPlant(scene, plantTiles) {
  const b = scene.boss?.sprite;
  if (!b || !plantTiles?.length) return null;
  let best = null;
  let bestD = Infinity;
  for (const p of plantTiles) {
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function nearBookshelf(scene, bookshelfTiles) {
  const b = scene.boss?.sprite;
  if (!b || !scene.map || !bookshelfTiles?.length) return false;
  const reach = scene.map.tileWidth * BOOKSHELF_NEAR_TILES;
  for (const s of bookshelfTiles) {
    if (Math.hypot(b.x - s.x, b.y - s.y) <= reach) return true;
  }
  return false;
}

function nearestBookshelf(scene, bookshelfTiles) {
  const b = scene.boss?.sprite;
  if (!b || !bookshelfTiles?.length) return null;
  let best = null;
  let bestD = Infinity;
  for (const s of bookshelfTiles) {
    const d = Math.hypot(b.x - s.x, b.y - s.y);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function ensureHeartTexture(scene) {
  if (scene.textures.exists("fx-heart")) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xffffff, 1);
  // tiny heart: two bumps + diamond tip
  g.fillCircle(3, 3, 2.2);
  g.fillCircle(7, 3, 2.2);
  g.fillTriangle(1, 4, 9, 4, 5, 9);
  g.generateTexture("fx-heart", 10, 10);
  g.destroy();
}

function ensureDropTexture(scene) {
  if (scene.textures.exists("fx-waterdrop")) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xffffff, 1);
  g.fillCircle(3, 2.5, 2.2);
  g.fillTriangle(1, 3, 5, 3, 3, 7);
  g.generateTexture("fx-waterdrop", 6, 8);
  g.destroy();
}

function ensureSnackTexture(scene) {
  if (scene.textures.exists("fx-snack")) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xffffff, 1);
  // tiny can / snack brick
  g.fillRect(1, 1, 6, 8);
  g.fillStyle(0xffffff, 0.55);
  g.fillRect(2, 2, 4, 2);
  g.generateTexture("fx-snack", 8, 10);
  g.destroy();
}

function burstMascotHearts(scene, x, y) {
  if (!scene?.add) return null;
  ensureHeartTexture(scene);
  const qty = 6 + Math.floor(Math.random() * 5); // 6–10
  const emitter = scene.add.particles(x, y - 12, "fx-heart", {
    speed: { min: 24, max: 68 },
    angle: { min: 220, max: 320 },
    gravityY: -18,
    scale: { start: 0.95, end: 0.2 },
    alpha: { start: 0.95, end: 0 },
    lifespan: { min: 700, max: 1200 },
    quantity: qty,
    frequency: -1,
    tint: HEART_TINTS,
    blendMode: "NORMAL",
    rotate: { min: -20, max: 20 },
  });
  emitter.setDepth(12);
  emitter.explode(qty);
  scene.time.delayedCall(1400, () => {
    try {
      emitter.destroy();
    } catch {
      /* ignore */
    }
  });
  return { emitter, qty };
}

/** Continuous drip for `durationMs` (2–4s), then destroy. */
function burstPlantWater(scene, x, y, durationMs = 3000) {
  if (!scene?.add) return null;
  ensureDropTexture(scene);
  const emitter = scene.add.particles(x, y - 16, "fx-waterdrop", {
    speedX: { min: -22, max: 22 },
    speedY: { min: 18, max: 55 },
    gravityY: 90,
    scale: { start: 0.9, end: 0.25 },
    alpha: { start: 0.9, end: 0 },
    lifespan: { min: 450, max: 900 },
    quantity: 1,
    frequency: 70,
    tint: DROP_TINTS,
    blendMode: "NORMAL",
    rotate: { min: -15, max: 15 },
  });
  emitter.setDepth(12);
  const dur = Math.max(800, durationMs);
  scene.time.delayedCall(dur, () => {
    try {
      emitter.stop();
    } catch {
      /* ignore */
    }
  });
  scene.time.delayedCall(dur + 1000, () => {
    try {
      emitter.destroy();
    } catch {
      /* ignore */
    }
  });
  return { emitter, durationMs: dur };
}

/** Snack/can burst for 1–2s at vending dispense slot. */
function burstVendingSnack(scene, x, y, durationMs = 1500) {
  if (!scene?.add) return null;
  ensureSnackTexture(scene);
  const qty = 5 + Math.floor(Math.random() * 4); // 5–8
  const emitter = scene.add.particles(x, y - 4, "fx-snack", {
    speed: { min: 30, max: 90 },
    angle: { min: 200, max: 340 },
    gravityY: 120,
    scale: { start: 1.0, end: 0.2 },
    alpha: { start: 0.95, end: 0 },
    lifespan: { min: 500, max: 1100 },
    quantity: 1,
    frequency: 90,
    tint: SNACK_TINTS,
    blendMode: "NORMAL",
    rotate: { min: -40, max: 40 },
  });
  emitter.setDepth(12);
  emitter.explode(qty);
  const dur = Math.max(800, durationMs);
  scene.time.delayedCall(dur, () => {
    try {
      emitter.stop();
    } catch {
      /* ignore */
    }
  });
  scene.time.delayedCall(dur + 900, () => {
    try {
      emitter.destroy();
    } catch {
      /* ignore */
    }
  });
  return { emitter, qty, durationMs: dur };
}

function loungeAgents(scene) {
  return (scene.agents || []).filter((a) => {
    if (a.serverStatus === "idle" || a.currentKind === "break") return true;
    const t = agentTile(a);
    const br = scene.waypoints?.break || { x: 18, y: 16 };
    if (!t) return false;
    return Math.hypot(t.x - br.x, t.y - br.y) <= 4;
  });
}

function bumpVisitCount() {
  let n = 1;
  try {
    n = (Number(localStorage.getItem(VISIT_KEY) || 0) || 0) + 1;
    localStorage.setItem(VISIT_KEY, String(n));
  } catch {
    n = 1;
  }
  return n;
}

function readVisitCount() {
  try {
    return Number(localStorage.getItem(VISIT_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

export class RoomInteract {
  constructor(scene) {
    this.scene = scene;
    this.coffeeTiles = findCoffeeTiles(scene);
    this.aquariumTiles = findAquariumTiles(scene);
    this.vendingTiles = findVendingTiles(scene);
    this.plantTiles = findPlantTiles(scene);
    this.posterTiles = findLobbyPosterTiles(scene);
    this.bookshelfTiles = findBookshelfTiles(scene);
    this.minigame = null;
    this.nap = null;
    this.lastScore = null;
    this.meetingActive = false;
    this._lingerAgentId = null;
    this._lingerSince = 0;
    this._coffeeSaid = new Set();
    this._typedAt = 0;
    this._typeIdx = 0;
    this._lobbyWelcomed = false;
    this.visitCount = readVisitCount();
    this.lastHint = null;
    this.lastAction = null;
    this.aquariumFeedEnabled = aquariumFeedEnabledFromQuery();
    this.aquaFeedActiveUntil = 0;
    this.aquaFeedCooldownUntil = 0;
    this.lastFeedAt = 0;
    this.mascotPetEnabled = mascotPetEnabledFromQuery();
    this.mascotPetActiveUntil = 0;
    this.mascotPetCooldownUntil = 0;
    this.lastPetAt = 0;
    this._lastHeartQty = 0;
    this.plantWaterEnabled = plantWaterEnabledFromQuery();
    this.plantWaterActiveUntil = 0;
    this.plantWaterCooldownUntil = 0;
    this.lastWaterAt = 0;
    this._lastWaterPlant = null;
    this.vendingEnabled = vendingEnabledFromQuery();
    this.vendingActiveUntil = 0;
    this.vendingCooldownUntil = 0;
    this.lastVendAt = 0;
    this._lastVendTile = null;
    this._lastVendToast = null;
    this._lastSnackQty = 0;
    this.posterEnabled = posterEnabledFromQuery();
    this.posterCooldownUntil = 0;
    this.lastPosterAt = 0;
    this._lastPosterQuote = null;
    this._lastPosterTile = null;
    this.bookshelfTipEnabled = bookshelfTipEnabledFromQuery();
    this.bookshelfActiveUntil = 0;
    this.bookshelfCooldownUntil = 0;
    this.lastBookshelfAt = 0;
    this._lastBookshelfTip = null;
    this._lastBookshelfTile = null;
  }

  /** Call once after map ready — entry welcome. */
  greetOnStart() {
    const n = bumpVisitCount();
    this.visitCount = n;
    this.showToast(`환영합니다, 대장님! · 방문 #${n}`);
    this.lastAction = { kind: "lobby_welcome", visitCount: n };
    this.publish();
  }

  showToast(text, ms = 2600) {
    let el = document.querySelector(".room-toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "room-toast";
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.add("is-on");
    if (this._toastTimer) window.clearTimeout(this._toastTimer);
    this._toastTimer = window.setTimeout(() => {
      el.classList.remove("is-on");
    }, ms);
  }

  hintKind() {
    // priority: coffee > aquafeed > vending > nap > mascotpet > plantwater > poster > bookshelf > work
    if (nearCoffee(this.scene, this.coffeeTiles)) return "coffee";
    if (
      this.aquariumFeedEnabled &&
      nearAquarium(this.scene, this.aquariumTiles) &&
      !this.aquaFeedActive()
    ) {
      return "aquarium";
    }
    if (
      this.vendingEnabled &&
      nearVending(this.scene, this.vendingTiles) &&
      !this.vendingActive()
    ) {
      return "vending";
    }
    if (nearSleep(this.scene)) return "nap";
    if (
      this.mascotPetEnabled &&
      this.scene.mascot &&
      nearMascot(this.scene) &&
      !this.mascotPetActive()
    ) {
      return "mascotpet";
    }
    if (
      this.plantWaterEnabled &&
      nearPlant(this.scene, this.plantTiles) &&
      !this.plantWaterActive()
    ) {
      return "plantwater";
    }
    if (
      this.posterEnabled &&
      nearPoster(this.scene, this.posterTiles) &&
      !this.posterCoolingDown()
    ) {
      return "poster";
    }
    if (
      this.bookshelfTipEnabled &&
      nearBookshelf(this.scene, this.bookshelfTiles) &&
      !this.bookshelfActive()
    ) {
      return "bookshelf";
    }
    const near = this.scene.boss?._nearAgent;
    if (near && isWorking(near)) return "work";
    return null;
  }

  hintLabel() {
    const k = this.hintKind();
    if (k === "coffee") return "E 미니게임";
    if (k === "aquarium") {
      if (this.aquaFeedCoolingDown()) {
        return `먹이 쿨다운 ${this.aquaFeedCooldownLeftSec()}s`;
      }
      return "E 먹이주기";
    }
    if (k === "vending") {
      if (this.vendingCoolingDown()) {
        return `자판기 쿨다운 ${this.vendingCooldownLeftSec()}s`;
      }
      return "E 스낵뽑기";
    }
    if (k === "nap") return "E 낮잠";
    if (k === "mascotpet") {
      if (this.mascotPetCoolingDown()) {
        return `쓰다듬기 쿨다운 ${this.mascotPetCooldownLeftSec()}s`;
      }
      return "E 쓰다듬기";
    }
    if (k === "plantwater") {
      if (this.plantWaterCoolingDown()) {
        return `물주기 쿨다운 ${this.plantWaterCooldownLeftSec()}s`;
      }
      return "E 물주기";
    }
    if (k === "poster") {
      if (this.posterCoolingDown()) {
        return `포스터 쿨다운 ${this.posterCooldownLeftSec()}s`;
      }
      return "E 한마디";
    }
    if (k === "bookshelf") {
      if (this.bookshelfCoolingDown()) {
        return `책장 쿨다운 ${this.bookshelfCooldownLeftSec()}s`;
      }
      return "E Hermes 팁";
    }
    if (k === "work") return "E 작업내용";
    return null;
  }

  /** E/Space when not handled by desk-brief. Returns true if consumed. */
  tryInteract() {
    if (this.minigame?.isOpen?.() || this.nap?.isOn?.()) return true;

    if (nearCoffee(this.scene, this.coffeeTiles)) {
      this.openMinigame();
      return true;
    }
    if (this.aquariumFeedEnabled && nearAquarium(this.scene, this.aquariumTiles)) {
      return this.startAquariumFeed();
    }
    if (this.vendingEnabled && nearVending(this.scene, this.vendingTiles)) {
      return this.startVending();
    }
    if (nearSleep(this.scene)) {
      this.openNap();
      return true;
    }
    if (
      this.mascotPetEnabled &&
      this.scene.mascot &&
      nearMascot(this.scene)
    ) {
      return this.startMascotPet();
    }
    if (this.plantWaterEnabled && nearPlant(this.scene, this.plantTiles)) {
      return this.startPlantWater();
    }
    if (this.posterEnabled && nearPoster(this.scene, this.posterTiles)) {
      return this.startPosterQuote();
    }
    if (
      this.bookshelfTipEnabled &&
      nearBookshelf(this.scene, this.bookshelfTiles)
    ) {
      return this.startBookshelfTip();
    }

    const near = this.scene.boss?._nearAgent;
    if (near && isWorking(near)) {
      this.expandWorkBubble(near);
      return true;
    }
    return false;
  }

  openMinigame() {
    if (this.minigame?.isOpen?.()) return;
    this.lastAction = { kind: "minigame_open" };
    // spectator chatter
    for (const a of loungeAgents(this.scene).slice(0, 3)) {
      if (!a._specBackup) a._specBackup = a.statusText;
      a.setStatus("관전 중 👀");
    }
    this.minigame = mountMinigame2048({
      onClose: (result) => {
        this.minigame = null;
        this.lastScore = result;
        this.lastAction = { kind: "minigame_score", ...result };
        this.showToast(
          result.won
            ? `2048 클리어! ${result.score}점`
            : `커피브레이크 끝 · ${result.score}점`,
        );
        for (const a of this.scene.agents || []) {
          if (a._specBackup != null) {
            a.setStatus(a._specBackup);
            a._specBackup = null;
          }
        }
        this.publish();
      },
    });
    this.publish();
  }

  aquaFeedActive() {
    return this.scene.time.now < this.aquaFeedActiveUntil;
  }

  aquaFeedCoolingDown() {
    return this.scene.time.now < this.aquaFeedCooldownUntil;
  }

  aquaFeedCooldownLeftSec() {
    return Math.max(
      1,
      Math.ceil((this.aquaFeedCooldownUntil - this.scene.time.now) / 1000),
    );
  }

  startAquariumFeed() {
    if (!this.aquariumFeedEnabled) return false;
    if (this.aquaFeedActive()) return true;
    if (this.aquaFeedCoolingDown()) {
      this.showToast(`먹이 쿨다운 ${this.aquaFeedCooldownLeftSec()}초`);
      this.lastAction = {
        kind: "aquarium_feed_cooldown",
        cooldownSec: this.aquaFeedCooldownLeftSec(),
      };
      this.publish();
      return true;
    }
    const now = this.scene.time.now;
    this.lastFeedAt = now;
    this.aquaFeedActiveUntil = now + AQUAFEED_MS;
    this.aquaFeedCooldownUntil = now + AQUAFEED_COOLDOWN_MS;
    this.scene.aquariumFish?.triggerFeed?.(AQUAFEED_MS);
    this.scene.aquariumBubbles?.triggerFeed?.(AQUAFEED_MS);
    this.scene.officeAudio?.playAquariumBloop?.();
    this.showToast("먹이 투하! 물고기 집합");
    this.lastAction = { kind: "aquarium_feed_start", startedAt: now };
    this.publish();
    return true;
  }

  mascotPetActive() {
    return this.scene.time.now < this.mascotPetActiveUntil;
  }

  mascotPetCoolingDown() {
    return this.scene.time.now < this.mascotPetCooldownUntil;
  }

  mascotPetCooldownLeftSec() {
    return Math.max(
      1,
      Math.ceil((this.mascotPetCooldownUntil - this.scene.time.now) / 1000),
    );
  }

  startMascotPet() {
    if (!this.mascotPetEnabled || !this.scene.mascot) return false;
    if (this.mascotPetActive()) return true;
    if (this.mascotPetCoolingDown()) {
      this.showToast(`쓰다듬기 쿨다운 ${this.mascotPetCooldownLeftSec()}초`);
      this.lastAction = {
        kind: "mascot_pet_cooldown",
        cooldownSec: this.mascotPetCooldownLeftSec(),
      };
      this.publish();
      return true;
    }
    const now = this.scene.time.now;
    const dur =
      MASCOTPET_MS_MIN +
      Math.floor(Math.random() * (MASCOTPET_MS_MAX - MASCOTPET_MS_MIN + 1));
    this.lastPetAt = now;
    this.mascotPetActiveUntil = now + dur;
    this.mascotPetCooldownUntil = now + MASCOTPET_COOLDOWN_MS;
    const boss = this.scene.boss?.sprite;
    const mascot = this.scene.mascot;
    mascot.startPet?.(dur, boss?.x, boss?.y);
    const burst = burstMascotHearts(
      this.scene,
      mascot.sprite.x,
      mascot.sprite.y,
    );
    this._lastHeartQty = burst?.qty ?? 0;
    this.scene.officeAudio?.playMascotMeow?.();
    this.showToast("쓰다듬기 ♥");
    this.lastAction = {
      kind: "mascot_pet_start",
      startedAt: now,
      durationMs: dur,
      hearts: this._lastHeartQty,
    };
    this.publish();
    return true;
  }

  plantWaterActive() {
    return this.scene.time.now < this.plantWaterActiveUntil;
  }

  plantWaterCoolingDown() {
    return this.scene.time.now < this.plantWaterCooldownUntil;
  }

  plantWaterCooldownLeftSec() {
    return Math.max(
      1,
      Math.ceil((this.plantWaterCooldownUntil - this.scene.time.now) / 1000),
    );
  }

  startPlantWater() {
    if (!this.plantWaterEnabled) return false;
    if (this.plantWaterActive()) return true;
    if (this.plantWaterCoolingDown()) {
      this.showToast(`물주기 쿨다운 ${this.plantWaterCooldownLeftSec()}초`);
      this.lastAction = {
        kind: "plant_water_cooldown",
        cooldownSec: this.plantWaterCooldownLeftSec(),
      };
      this.publish();
      return true;
    }
    const plant = nearestPlant(this.scene, this.plantTiles);
    if (!plant) return false;
    const now = this.scene.time.now;
    const dur =
      PLANTWATER_MS_MIN +
      Math.floor(Math.random() * (PLANTWATER_MS_MAX - PLANTWATER_MS_MIN + 1));
    const cool =
      PLANTWATER_COOLDOWN_MS_MIN +
      Math.floor(
        Math.random() *
          (PLANTWATER_COOLDOWN_MS_MAX - PLANTWATER_COOLDOWN_MS_MIN + 1),
      );
    this.lastWaterAt = now;
    this.plantWaterActiveUntil = now + dur;
    this.plantWaterCooldownUntil = now + cool;
    this._lastWaterPlant = { tx: plant.tx, ty: plant.ty, gid: plant.gid };
    burstPlantWater(this.scene, plant.x, plant.y, dur);
    this.scene.plantSway?.boost?.(dur);
    this.scene.officeAudio?.playPlantDrip?.();
    this.showToast("물주기 💧");
    this.lastAction = {
      kind: "plant_water_start",
      startedAt: now,
      durationMs: dur,
      cooldownMs: cool,
      plant: this._lastWaterPlant,
    };
    this.publish();
    return true;
  }

  posterCoolingDown() {
    return this.scene.time.now < this.posterCooldownUntil;
  }

  posterCooldownLeftSec() {
    return Math.max(
      1,
      Math.ceil((this.posterCooldownUntil - this.scene.time.now) / 1000),
    );
  }

  startPosterQuote() {
    if (!this.posterEnabled) return false;
    if (this.posterCoolingDown()) {
      this.showToast(`포스터 쿨다운 ${this.posterCooldownLeftSec()}초`);
      this.lastAction = {
        kind: "poster_cooldown",
        cooldownSec: this.posterCooldownLeftSec(),
      };
      this.publish();
      return true;
    }
    const poster = nearestPoster(this.scene, this.posterTiles);
    if (!poster) return false;
    const now = this.scene.time.now;
    const quote =
      POSTER_QUOTES[Math.floor(Math.random() * POSTER_QUOTES.length)] ??
      POSTER_QUOTES[0];
    this.lastPosterAt = now;
    this.posterCooldownUntil = now + POSTER_COOLDOWN_MS;
    this._lastPosterQuote = quote;
    this._lastPosterTile = { tx: poster.tx, ty: poster.ty };
    this.showToast(quote);
    this.lastAction = {
      kind: "poster_quote",
      startedAt: now,
      quote,
      poster: this._lastPosterTile,
      cooldownMs: POSTER_COOLDOWN_MS,
    };
    this.publish();
    return true;
  }

  vendingActive() {
    return this.scene.time.now < this.vendingActiveUntil;
  }

  vendingCoolingDown() {
    return this.scene.time.now < this.vendingCooldownUntil;
  }

  vendingCooldownLeftSec() {
    return Math.max(
      1,
      Math.ceil((this.vendingCooldownUntil - this.scene.time.now) / 1000),
    );
  }

  startVending() {
    if (!this.vendingEnabled) return false;
    if (this.vendingActive()) return true;
    if (this.vendingCoolingDown()) {
      this.showToast(`자판기 쿨다운 ${this.vendingCooldownLeftSec()}초`);
      this.lastAction = {
        kind: "vending_cooldown",
        cooldownSec: this.vendingCooldownLeftSec(),
      };
      this.publish();
      return true;
    }
    const machine = nearestVending(this.scene, this.vendingTiles);
    if (!machine) return false;
    const now = this.scene.time.now;
    const dur =
      VENDING_MS_MIN +
      Math.floor(Math.random() * (VENDING_MS_MAX - VENDING_MS_MIN + 1));
    const cool =
      VENDING_COOLDOWN_MS_MIN +
      Math.floor(
        Math.random() *
          (VENDING_COOLDOWN_MS_MAX - VENDING_COOLDOWN_MS_MIN + 1),
      );
    const toast =
      VENDING_TOASTS[Math.floor(Math.random() * VENDING_TOASTS.length)];
    this.lastVendAt = now;
    this.vendingActiveUntil = now + dur;
    this.vendingCooldownUntil = now + cool;
    this._lastVendTile = { tx: machine.tx, ty: machine.ty };
    this._lastVendToast = toast;
    const burst = burstVendingSnack(this.scene, machine.x, machine.y, dur);
    this._lastSnackQty = burst?.qty ?? 0;
    this.scene.officeAudio?.playVendingClick?.();
    this.showToast(toast);
    this.lastAction = {
      kind: "vending_start",
      startedAt: now,
      durationMs: dur,
      cooldownMs: cool,
      toast,
      snacks: this._lastSnackQty,
      machine: this._lastVendTile,
    };
    this.publish();
    return true;
  }

  bookshelfActive() {
    return this.scene.time.now < this.bookshelfActiveUntil;
  }

  bookshelfCoolingDown() {
    return this.scene.time.now < this.bookshelfCooldownUntil;
  }

  bookshelfCooldownLeftSec() {
    return Math.max(
      1,
      Math.ceil((this.bookshelfCooldownUntil - this.scene.time.now) / 1000),
    );
  }

  startBookshelfTip() {
    if (!this.bookshelfTipEnabled) return false;
    if (this.bookshelfActive()) return true;
    if (this.bookshelfCoolingDown()) {
      this.showToast(`책장 쿨다운 ${this.bookshelfCooldownLeftSec()}초`);
      this.lastAction = {
        kind: "bookshelf_tip_cooldown",
        cooldownSec: this.bookshelfCooldownLeftSec(),
      };
      this.publish();
      return true;
    }
    const shelf = nearestBookshelf(this.scene, this.bookshelfTiles);
    if (!shelf) return false;
    const now = this.scene.time.now;
    const dur =
      BOOKSHELF_MS_MIN +
      Math.floor(Math.random() * (BOOKSHELF_MS_MAX - BOOKSHELF_MS_MIN + 1));
    const cool =
      BOOKSHELF_COOLDOWN_MS_MIN +
      Math.floor(
        Math.random() *
          (BOOKSHELF_COOLDOWN_MS_MAX - BOOKSHELF_COOLDOWN_MS_MIN + 1),
      );
    const tip =
      BOOKSHELF_TIPS[Math.floor(Math.random() * BOOKSHELF_TIPS.length)];
    this.lastBookshelfAt = now;
    this.bookshelfActiveUntil = now + dur;
    this.bookshelfCooldownUntil = now + cool;
    this._lastBookshelfTip = tip;
    this._lastBookshelfTile = { tx: shelf.tx, ty: shelf.ty };
    this.scene.bookshelfPages?.triggerPageTurn?.();
    this.showToast(`📚 ${tip}`, Math.max(3200, dur));
    this.lastAction = {
      kind: "bookshelf_tip_start",
      startedAt: now,
      durationMs: dur,
      cooldownMs: cool,
      tip,
      shelf: this._lastBookshelfTile,
    };
    this.publish();
    return true;
  }

  openNap() {
    if (this.nap?.isOn?.()) return;
    this.lastAction = { kind: "nap_start" };
    this.showToast("낮잠 모드");
    this.nap = mountNapMode({
      durationMs: 10000,
      onDone: () => {
        this.nap = null;
        this.lastAction = { kind: "nap_end" };
        this.showToast("기상!");
        this.publish();
      },
    });
    this.publish();
  }

  expandWorkBubble(agent) {
    const shown = truncate(agentWorkText(agent), 64);
    if (!agent._workBackup) agent._workBackup = agent.statusText;
    agent.bubbleText.setWordWrapWidth(160);
    agent.bubbleText.setText(shown);
    agent.drawBubble();
    this.lastAction = {
      kind: "work_expand",
      agentId: agent.def?.id,
      text: shown,
    };
    if (agent._expandTimer) agent._expandTimer.remove(false);
    agent._expandTimer = this.scene.time.delayedCall(4000, () => {
      agent.bubbleText.setWordWrapWidth(96);
      if (agent._workBackup != null) {
        agent.setStatus(agent._workBackup);
        agent._workBackup = null;
      }
      agent._expandTimer = null;
    });
    this.publish();
  }

  update(time) {
    this.updateTyping(time);
    this.updateLinger(time);
    this.updateMeeting(time);
    this.updateLobbyWelcome();
    if (this.aquaFeedActiveUntil && time >= this.aquaFeedActiveUntil) {
      this.aquaFeedActiveUntil = 0;
      this.lastAction = {
        kind: "aquarium_feed_end",
        lastFeedAt: this.lastFeedAt,
      };
      this.publish();
    }
    if (this.mascotPetActiveUntil && time >= this.mascotPetActiveUntil) {
      this.mascotPetActiveUntil = 0;
      this.lastAction = {
        kind: "mascot_pet_end",
        lastPetAt: this.lastPetAt,
      };
      this.publish();
    }
    if (this.plantWaterActiveUntil && time >= this.plantWaterActiveUntil) {
      this.plantWaterActiveUntil = 0;
      this.lastAction = {
        kind: "plant_water_end",
        lastWaterAt: this.lastWaterAt,
      };
      this.publish();
    }
    if (this.vendingActiveUntil && time >= this.vendingActiveUntil) {
      this.vendingActiveUntil = 0;
      this.lastAction = {
        kind: "vending_end",
        lastVendAt: this.lastVendAt,
      };
      this.publish();
    }
    if (this.bookshelfActiveUntil && time >= this.bookshelfActiveUntil) {
      this.bookshelfActiveUntil = 0;
      this.lastAction = {
        kind: "bookshelf_tip_end",
        lastBookshelfAt: this.lastBookshelfAt,
      };
      this.publish();
    }
  }

  updateTyping(time) {
    if (time - this._typedAt < 420) return;
    this._typedAt = time;
    this._typeIdx = (this._typeIdx + 1) % TYPING_FRAMES.length;
    const dots = TYPING_FRAMES[this._typeIdx];
    for (const a of this.scene.agents || []) {
      if (!isWorking(a)) continue;
      if (a._expandTimer) continue; // expanded view owns the bubble
      if (a._bossGreetBackup != null) continue;
      const base = truncate(agentWorkText(a), 22);
      a.setStatus(`${base}${dots}`);
    }
  }

  updateLinger(time) {
    const near = this.scene.boss?._nearAgent;
    if (!near || !isWorking(near)) {
      this._lingerAgentId = null;
      this._lingerSince = 0;
      return;
    }
    const id = near.def?.id;
    if (id !== this._lingerAgentId) {
      this._lingerAgentId = id;
      this._lingerSince = time;
      return;
    }
    if (time - this._lingerSince < LINGER_MS) return;
    if (this._coffeeSaid.has(id)) return;
    this._coffeeSaid.add(id);
    if (!near._coffeeBackup) near._coffeeBackup = near.statusText;
    near.setStatus("커피 한잔?");
    this.lastAction = { kind: "coffee_ask", agentId: id };
    this.scene.time.delayedCall(2800, () => {
      if (near._coffeeBackup != null && !near._expandTimer) {
        near.setStatus(near._coffeeBackup);
        near._coffeeBackup = null;
      }
    });
    this.publish();
  }

  updateMeeting() {
    const tile = bossTile(this.scene);
    const bossIn = inMeetingZone(this.scene, tile, 2);
    const agentsThere = (this.scene.agents || []).filter((a) => {
      if (a.currentKind === "meeting" || a.serverStatus === "blocked") return true;
      return inMeetingZone(this.scene, agentTile(a), 2);
    });

    if (bossIn && agentsThere.length && !this.meetingActive) {
      this.meetingActive = true;
      this.lastAction = {
        kind: "meeting_start",
        agents: agentsThere.map((a) => a.def?.id),
      };
      this.showToast("회의 시작");
      this.scene.whiteboardTicker?.updateFromSnapshot?.(
        this.scene.lastSnapshot,
      );
      // flash ticker style
      const label = this.scene.whiteboardTicker?.label;
      if (label) {
        label.setColor("#ffe08a");
        this.scene.time.delayedCall(1800, () => {
          try {
            label.setColor("#d8e8f8");
          } catch {
            /* ignore */
          }
        });
      }
      for (const a of agentsThere) {
        // face toward boss
        const bx = this.scene.boss.sprite.x;
        const by = this.scene.boss.sprite.y;
        const dx = bx - a.sprite.x;
        const dy = by - a.sprite.y;
        const dir =
          Math.abs(dx) > Math.abs(dy)
            ? dx < 0
              ? "left"
              : "right"
            : dy < 0
              ? "up"
              : "down";
        a.lastDir = dir;
        const idleKey = `${a.def.id}-idle-${dir}`;
        try {
          a.sprite.anims.play(idleKey, true);
        } catch {
          /* ignore */
        }
        const report = truncate(
          a.serverData?.task_title ||
            a.statusText ||
            "칸반 진행 보고드립니다",
          28,
        );
        a.setStatus(report);
      }
      this.publish();
    } else if (!bossIn || !agentsThere.length) {
      this.meetingActive = false;
    }
  }

  updateLobbyWelcome() {
    const inLobby = this.scene.isInLobbyZone?.(bossTile(this.scene));
    if (inLobby && !this._lobbyWelcomed) {
      this._lobbyWelcomed = true;
      this.showToast(`로비 · 방문 #${this.visitCount || readVisitCount()}`, 2200);
      this.lastAction = {
        kind: "lobby_enter",
        visitCount: this.visitCount || readVisitCount(),
      };
      this.publish();
    } else if (!inLobby) {
      this._lobbyWelcomed = false;
    }
  }

  mascotPetSnapshot() {
    return {
      enabled: !!this.mascotPetEnabled && !!this.scene.mascot,
      active: this.mascotPetActive(),
      cooldown: this.mascotPetCoolingDown(),
      cooldownMsLeft: Math.max(
        0,
        Math.round(this.mascotPetCooldownUntil - this.scene.time.now),
      ),
      lastPetAt: this.lastPetAt || null,
      hearts: this._lastHeartQty || 0,
    };
  }

  plantWaterSnapshot() {
    return {
      enabled: !!this.plantWaterEnabled,
      active: this.plantWaterActive(),
      cooldown: this.plantWaterCoolingDown(),
      cooldownMsLeft: Math.max(
        0,
        Math.round(this.plantWaterCooldownUntil - this.scene.time.now),
      ),
      lastWaterAt: this.lastWaterAt || null,
      plantCount: this.plantTiles?.length ?? 0,
      lastPlant: this._lastWaterPlant,
    };
  }

  bookshelfSnapshot() {
    return {
      enabled: !!this.bookshelfTipEnabled,
      active: this.bookshelfActive(),
      cooldown: this.bookshelfCoolingDown(),
      cooldownMsLeft: Math.max(
        0,
        Math.round(this.bookshelfCooldownUntil - this.scene.time.now),
      ),
      lastBookshelfAt: this.lastBookshelfAt || null,
      shelfCount: this.bookshelfTiles?.length ?? 0,
      lastTip: this._lastBookshelfTip,
      lastShelf: this._lastBookshelfTile,
    };
  }

  vendingSnapshot() {
    return {
      enabled: !!this.vendingEnabled,
      active: this.vendingActive(),
      cooldown: this.vendingCoolingDown(),
      cooldownMsLeft: Math.max(
        0,
        Math.round(this.vendingCooldownUntil - this.scene.time.now),
      ),
      lastVendAt: this.lastVendAt || null,
      vendingCount: this.vendingTiles?.length ?? 0,
      lastMachine: this._lastVendTile,
      lastToast: this._lastVendToast,
      snacks: this._lastSnackQty || 0,
    };
  }

  posterSnapshot() {
    return {
      enabled: !!this.posterEnabled,
      cooldown: this.posterCoolingDown(),
      cooldownMsLeft: Math.max(
        0,
        Math.round(this.posterCooldownUntil - this.scene.time.now),
      ),
      lastPosterAt: this.lastPosterAt || null,
      posterCount: this.posterTiles?.length ?? 0,
      lastQuote: this._lastPosterQuote,
      lastPoster: this._lastPosterTile,
    };
  }

  snapshot() {
    return {
      visitCount: this.visitCount || readVisitCount(),
      lastScore: this.lastScore,
      meetingActive: this.meetingActive,
      minigameOpen: !!this.minigame?.isOpen?.(),
      napOn: !!this.nap?.isOn?.(),
      hint: this.hintKind(),
      lastAction: this.lastAction,
      coffeeTiles: this.coffeeTiles.map((c) => ({ tx: c.tx, ty: c.ty })),
      aquariumTiles: this.aquariumTiles.map((c) => ({ tx: c.tx, ty: c.ty })),
      vendingTiles: this.vendingTiles.map((v) => ({ tx: v.tx, ty: v.ty })),
      plantTiles: this.plantTiles.map((p) => ({
        tx: p.tx,
        ty: p.ty,
        gid: p.gid,
      })),
      bookshelfTiles: this.bookshelfTiles.map((s) => ({
        tx: s.tx,
        ty: s.ty,
        gid: s.gid,
      })),
      posterTiles: this.posterTiles.map((p) => ({ tx: p.tx, ty: p.ty })),
      aquafeedEnabled: this.aquariumFeedEnabled,
      aquafeedActive: this.aquaFeedActive(),
      aquafeedCooldown: this.aquaFeedCoolingDown(),
      aquafeedCooldownMsLeft: Math.max(
        0,
        Math.round(this.aquaFeedCooldownUntil - this.scene.time.now),
      ),
      lastFeedAt: this.lastFeedAt || null,
      mascotPetEnabled: !!this.mascotPetEnabled && !!this.scene.mascot,
      mascotPetActive: this.mascotPetActive(),
      mascotPetCooldown: this.mascotPetCoolingDown(),
      lastPetAt: this.lastPetAt || null,
      plantWaterEnabled: !!this.plantWaterEnabled,
      plantWaterActive: this.plantWaterActive(),
      plantWaterCooldown: this.plantWaterCoolingDown(),
      lastWaterAt: this.lastWaterAt || null,
      vendingEnabled: !!this.vendingEnabled,
      vendingActive: this.vendingActive(),
      vendingCooldown: this.vendingCoolingDown(),
      lastVendAt: this.lastVendAt || null,
      posterEnabled: !!this.posterEnabled,
      posterCooldown: this.posterCoolingDown(),
      lastPosterAt: this.lastPosterAt || null,
      lastPosterQuote: this._lastPosterQuote,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      roomInteract: this.snapshot(),
      mascotPet: this.mascotPetSnapshot(),
      plantWater: this.plantWaterSnapshot(),
      vending: this.vendingSnapshot(),
      posterQuote: this.posterSnapshot(),
      bookshelfTip: this.bookshelfSnapshot(),
    };
  }
}

export {
  findCoffeeTiles,
  findAquariumTiles,
  findVendingTiles,
  COFFEE_GID,
  AQUARIUM_GID,
  VENDING_GID,
  nearCoffee,
  nearAquarium,
  nearVending,
  nearSleep,
  nearMascot,
  nearPlant,
  mascotPetEnabledFromQuery,
  plantWaterEnabledFromQuery,
  vendingEnabledFromQuery,
  bookshelfTipEnabledFromQuery,
  nearBookshelf,
  BOOKSHELF_TIPS,
};
