/** Per-room boss interactions: lounge mini-game, desk expand, meeting, nap, lobby. */

import { mountMinigame2048 } from "./ui/minigame2048.js";
import { mountNapMode } from "./ui/napMode.js";
import { findPlantTiles } from "./effects/plantSway.js";
import {
  findLobbyPosterTiles,
  posterEnabledFromQuery,
} from "./effects/lobbyPoster.js";
import { findBookshelfTiles } from "./effects/bookshelfPages.js";
import {
  findServerRackTiles,
  serverRackEnabledFromQuery,
} from "./effects/serverRackLeds.js";
import { PRINTER_GID } from "./effects/officeEvents.js";

const COFFEE_GID = 16;
const AQUARIUM_GID = 37;
const VENDING_GID = 38;
const FRIDGE_GID = 39;
const MICROWAVE_GID = 40;
const WATER_COOLER_GID = 41;
const COAT_RACK_GID = 44;
const RECYCLE_BIN_GID = 45;
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
/** Printer print: 1–1.5s paper burst, 12–20s cooldown, ≤2.0 tile. */
const PRINTER_MS_MIN = 1000;
const PRINTER_MS_MAX = 1500;
const PRINTER_COOLDOWN_MS_MIN = 12000;
const PRINTER_COOLDOWN_MS_MAX = 20000;
const PRINTER_NEAR_TILES = 2.0;
/** Fridge / microwave / cooler: short toast, 12–20s cooldown, ≤2.0 tile. */
const KITCHEN_MS_MIN = 800;
const KITCHEN_MS_MAX = 1400;
const KITCHEN_COOLDOWN_MS_MIN = 12000;
const KITCHEN_COOLDOWN_MS_MAX = 20000;
const KITCHEN_NEAR_TILES = 2.0;
/** Focus server rack: 1–1.5s LED burst + toast, 12–20s cooldown, ≤2.0 tile. */
const RACK_MS_MIN = 1000;
const RACK_MS_MAX = 1500;
const RACK_COOLDOWN_MS_MIN = 12000;
const RACK_COOLDOWN_MS_MAX = 20000;
const RACK_NEAR_TILES = 2.0;
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
  "?sofa=force 는 소파 쿠션 스모크용",
  "?chair=force 는 Open Desk 의자 스월 스모크용",
  "?doorswing=force 는 유리문 스윙 스모크용",
  "?glassfx=force 는 War Room 유리파티션 shimmer 스모크용",
  "?exitneon=force 는 야간 EXIT 네온 스모크용",
  "?roundtable=force 는 원탁 머그/서류 bob 스모크용",
  "?meettable=force 는 War Room 테이블 leaf 서류 bob 스모크용",
  "?dnd=force 는 Focus 방해금지 사인 스모크용",
  "?afk=force 는 자리비움 팻말 스모크용",
  "?statusring=0 으로 발밑 상태색 링 끄기",
  "WS 끊기면 mock 에이전트로 폴백",
  "skills_list → skill_view 로 절차 로드",
  "?coatrack=force 는 로비 코트랙 wet 스모크용",
  "?recycle=force 는 라운지 분리수거함 스모크용",
  "?rack=force 는 Focus 서버랙 LED 스모크용",
  "?printer=force 는 Open Desk 프린터 출력 스모크용",
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
const FRIDGE_TOASTS = [
  "찬바람 스윽…",
  "우유 아직 있네",
  "야식 후보 탐색 중",
  "냉장고 문 조심",
];
const MICROWAVE_TOASTS = [
  "띵~ 데워졌다",
  "1분 돌리는 중…",
  "컵라면 각",
  "뜨거우니까 조심",
];
const COOLER_TOASTS = [
  "시원하다",
  "한 모금…",
  "컵 채우는 중",
  "물맛 괜찮네",
];
const COAT_RACK_TOASTS_HANG = [
  "코트 걸었다",
  "우비 걸어둠",
  "옷걸이에 탁",
];
const COAT_RACK_TOASTS_TAKE = [
  "코트 벗었다",
  "코트 챙김",
  "옷 가져감",
];
const RECYCLE_TOASTS = [
  "분리수거 각!",
  "종이만!",
  "재활용 고고",
  "쓰레기통에 탁",
];
const VISIT_KEY = "hermes-area-visit-count";
const TYPING_FRAMES = ["·", "··", "···"];
const HEART_TINTS = [0xff6699, 0xff88aa, 0xff4466, 0xffaacc];
const DROP_TINTS = [0x6ec8ff, 0x4ab0ee, 0x9ad8ff, 0x3a9ad4];
const SNACK_TINTS = [0xff5555, 0x4aa0ff, 0xffc44a, 0xff88aa, 0x88dd66];
const PAPER_TINTS = [0xffffff, 0xf5f0e6, 0xe8eef5, 0xfff8dc];
const PRINTER_TOASTS = ["출력 중…", "인쇄 중…", "찌르륵… 출력!"];

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

function findFridgeTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (layer?.getTileAt && scene.map) {
    for (let ty = 0; ty < scene.map.height; ty++) {
      for (let tx = 0; tx < scene.map.width; tx++) {
        const tile = layer.getTileAt(tx, ty);
        if (tile?.index === FRIDGE_GID) hits.push(tileCenter(scene, tx, ty));
      }
    }
  }
  return hits;
}

function findMicrowaveTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (layer?.getTileAt && scene.map) {
    for (let ty = 0; ty < scene.map.height; ty++) {
      for (let tx = 0; tx < scene.map.width; tx++) {
        const tile = layer.getTileAt(tx, ty);
        if (tile?.index === MICROWAVE_GID) hits.push(tileCenter(scene, tx, ty));
      }
    }
  }
  return hits;
}

function findWaterCoolerTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (layer?.getTileAt && scene.map) {
    for (let ty = 0; ty < scene.map.height; ty++) {
      for (let tx = 0; tx < scene.map.width; tx++) {
        const tile = layer.getTileAt(tx, ty);
        if (tile?.index === WATER_COOLER_GID) hits.push(tileCenter(scene, tx, ty));
      }
    }
  }
  return hits;
}

function findCoatRackInteractTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (layer?.getTileAt && scene.map) {
    for (let ty = 0; ty < scene.map.height; ty++) {
      for (let tx = 0; tx < scene.map.width; tx++) {
        const tile = layer.getTileAt(tx, ty);
        if (tile?.index === COAT_RACK_GID) hits.push(tileCenter(scene, tx, ty));
      }
    }
  }
  return hits;
}

function findRecycleBinInteractTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (layer?.getTileAt && scene.map) {
    for (let ty = 0; ty < scene.map.height; ty++) {
      for (let tx = 0; tx < scene.map.width; tx++) {
        const tile = layer.getTileAt(tx, ty);
        if (tile?.index === RECYCLE_BIN_GID) hits.push(tileCenter(scene, tx, ty));
      }
    }
  }
  return hits;
}

/** Real GID36 printer furniture only — no entrance fallback. */
function findPrinterTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (layer?.getTileAt && scene.map) {
    for (let ty = 0; ty < scene.map.height; ty++) {
      for (let tx = 0; tx < scene.map.width; tx++) {
        const tile = layer.getTileAt(tx, ty);
        if (tile?.index === PRINTER_GID) hits.push(tileCenter(scene, tx, ty));
      }
    }
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

/** Default on; `?fridge=0|false|off` disables E-interact (idle FX uses ?kitchen). */
function fridgeEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("fridge");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

/** Default on; `?microwave=0|false|off` disables E-interact. */
function microwaveEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("microwave");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

/** Default on; `?cooler=0|false|off` disables E-interact (idle FX uses same query). */
function coolerEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("cooler");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

/** Default on; `?coatrack=0|false|off` disables E-interact (idle FX uses same query). */
function coatRackEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("coatrack");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

/** Default on; `?recycle=0|false|off` disables E-interact (idle FX uses same query). */
function recycleEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("recycle");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

/** Default on; `?rack=0|false|off` disables E-interact (same query as LED FX). */
function rackEnabledFromQuery() {
  return serverRackEnabledFromQuery();
}

function countRunningAgents(scene) {
  const agents = scene?.agents;
  if (!Array.isArray(agents) || !agents.length) return 0;
  let n = 0;
  for (const a of agents) {
    try {
      if (a?.getEffectKind?.() === "running") n += 1;
    } catch {
      /* ignore */
    }
  }
  return n;
}

function rackToastForLoad(running) {
  if (running <= 0) {
    const idle = ["랙 idle…", "대기열 비었음", "로그 quiet", "랙 온도 정상"];
    return idle[Math.floor(Math.random() * idle.length)];
  }
  const busy = [
    `CPU 로드 ${running}…`,
    "로그 tail OK",
    "랙 온도 정상",
    `CPU 로드 ${running} · 로그 OK`,
  ];
  return busy[Math.floor(Math.random() * busy.length)];
}

/** Default on; `?printer=0|false|off` disables E print. `force` stays on (smoke auto-fire). */
function printerEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("printer");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

/** `?printer=force` → smoke auto-print once after boot. */
function printerForceFromQuery() {
  if (typeof location === "undefined") return false;
  try {
    return new URLSearchParams(location.search).get("printer") === "force";
  } catch {
    return false;
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

function nearFridge(scene, fridgeTiles) {
  const b = scene.boss?.sprite;
  if (!b || !scene.map || !fridgeTiles?.length) return false;
  const reach = scene.map.tileWidth * KITCHEN_NEAR_TILES;
  for (const f of fridgeTiles) {
    if (Math.hypot(b.x - f.x, b.y - f.y) <= reach) return true;
  }
  return false;
}

function nearMicrowave(scene, microwaveTiles) {
  const b = scene.boss?.sprite;
  if (!b || !scene.map || !microwaveTiles?.length) return false;
  const reach = scene.map.tileWidth * KITCHEN_NEAR_TILES;
  for (const m of microwaveTiles) {
    if (Math.hypot(b.x - m.x, b.y - m.y) <= reach) return true;
  }
  return false;
}

function nearPrinter(scene, printerTiles) {
  const b = scene.boss?.sprite;
  if (!b || !scene.map || !printerTiles?.length) return false;
  const reach = scene.map.tileWidth * PRINTER_NEAR_TILES;
  for (const p of printerTiles) {
    if (Math.hypot(b.x - p.x, b.y - p.y) <= reach) return true;
  }
  return false;
}

function nearCooler(scene, coolerTiles) {
  const b = scene.boss?.sprite;
  if (!b || !scene.map || !coolerTiles?.length) return false;
  const reach = scene.map.tileWidth * KITCHEN_NEAR_TILES;
  for (const c of coolerTiles) {
    if (Math.hypot(b.x - c.x, b.y - c.y) <= reach) return true;
  }
  return false;
}

function nearCoatRack(scene, coatRackTiles) {
  const b = scene.boss?.sprite;
  if (!b || !scene.map || !coatRackTiles?.length) return false;
  const reach = scene.map.tileWidth * KITCHEN_NEAR_TILES;
  for (const c of coatRackTiles) {
    if (Math.hypot(b.x - c.x, b.y - c.y) <= reach) return true;
  }
  return false;
}

function nearRecycle(scene, recycleTiles) {
  const b = scene.boss?.sprite;
  if (!b || !scene.map || !recycleTiles?.length) return false;
  const reach = scene.map.tileWidth * KITCHEN_NEAR_TILES;
  for (const c of recycleTiles) {
    if (Math.hypot(b.x - c.x, b.y - c.y) <= reach) return true;
  }
  return false;
}

function nearRack(scene, rackTiles) {
  const b = scene.boss?.sprite;
  if (!b || !scene.map || !rackTiles?.length) return false;
  const reach = scene.map.tileWidth * RACK_NEAR_TILES;
  for (const r of rackTiles) {
    if (Math.hypot(b.x - r.x, b.y - r.y) <= reach) return true;
  }
  return false;
}

function nearestRack(scene, rackTiles) {
  const b = scene.boss?.sprite;
  if (!b || !rackTiles?.length) return null;
  let best = null;
  let bestD = Infinity;
  for (const r of rackTiles) {
    const d = Math.hypot(b.x - r.x, b.y - r.y);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

function nearestCoatRack(scene, coatRackTiles) {
  const b = scene.boss?.sprite;
  if (!b || !coatRackTiles?.length) return null;
  let best = null;
  let bestD = Infinity;
  for (const c of coatRackTiles) {
    const d = Math.hypot(b.x - c.x, b.y - c.y);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function nearestRecycle(scene, recycleTiles) {
  const b = scene.boss?.sprite;
  if (!b || !recycleTiles?.length) return null;
  let best = null;
  let bestD = Infinity;
  for (const c of recycleTiles) {
    const d = Math.hypot(b.x - c.x, b.y - c.y);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
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

function nearestFridge(scene, fridgeTiles) {
  const b = scene.boss?.sprite;
  if (!b || !fridgeTiles?.length) return null;
  let best = null;
  let bestD = Infinity;
  for (const f of fridgeTiles) {
    const d = Math.hypot(b.x - f.x, b.y - f.y);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best;
}

function nearestMicrowave(scene, microwaveTiles) {
  const b = scene.boss?.sprite;
  if (!b || !microwaveTiles?.length) return null;
  let best = null;
  let bestD = Infinity;
  for (const m of microwaveTiles) {
    const d = Math.hypot(b.x - m.x, b.y - m.y);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

function nearestPrinter(scene, printerTiles) {
  const b = scene.boss?.sprite;
  if (!b || !printerTiles?.length) return null;
  let best = null;
  let bestD = Infinity;
  for (const p of printerTiles) {
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function nearestCooler(scene, coolerTiles) {
  const b = scene.boss?.sprite;
  if (!b || !coolerTiles?.length) return null;
  let best = null;
  let bestD = Infinity;
  for (const c of coolerTiles) {
    const d = Math.hypot(b.x - c.x, b.y - c.y);
    if (d < bestD) {
      bestD = d;
      best = c;
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

function ensurePaperTexture(scene) {
  if (scene.textures.exists("fx-paper")) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, 7, 9);
  g.fillStyle(0xcccccc, 0.5);
  g.fillRect(1, 2, 5, 1);
  g.fillRect(1, 4, 4, 1);
  g.fillRect(1, 6, 5, 1);
  g.generateTexture("fx-paper", 7, 9);
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

/** Paper sheet burst for 1–1.5s at printer tray. */
function burstPrinterPaper(scene, x, y, durationMs = 1200) {
  if (!scene?.add) return null;
  ensurePaperTexture(scene);
  const qty = 6 + Math.floor(Math.random() * 5); // 6–10
  const emitter = scene.add.particles(x, y - 2, "fx-paper", {
    speed: { min: 28, max: 95 },
    angle: { min: 200, max: 340 },
    gravityY: 140,
    scale: { start: 1.05, end: 0.25 },
    alpha: { start: 0.95, end: 0 },
    lifespan: { min: 450, max: 1000 },
    quantity: 1,
    frequency: 80,
    tint: PAPER_TINTS,
    blendMode: "NORMAL",
    rotate: { min: -55, max: 55 },
  });
  emitter.setDepth(12);
  emitter.explode(qty);
  const dur = Math.max(900, durationMs);
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

/** Soft paper toss into recycle bin for 1–1.5s. */
function burstRecyclePaper(scene, x, y, durationMs = 1200) {
  if (!scene?.add) return null;
  ensurePaperTexture(scene);
  const qty = 4 + Math.floor(Math.random() * 4); // 4–7
  const emitter = scene.add.particles(x, y - 6, "fx-paper", {
    speed: { min: 18, max: 70 },
    angle: { min: 240, max: 300 },
    gravityY: 160,
    scale: { start: 0.95, end: 0.2 },
    alpha: { start: 0.9, end: 0 },
    lifespan: { min: 400, max: 900 },
    quantity: 1,
    frequency: 90,
    tint: PAPER_TINTS,
    blendMode: "NORMAL",
    rotate: { min: -70, max: 70 },
  });
  emitter.setDepth(12);
  emitter.explode(qty);
  const dur = Math.max(900, durationMs);
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
    this.fridgeTiles = findFridgeTiles(scene);
    this.microwaveTiles = findMicrowaveTiles(scene);
    this.coolerTiles = findWaterCoolerTiles(scene);
    this.coatRackTiles = findCoatRackInteractTiles(scene);
    this.recycleTiles = findRecycleBinInteractTiles(scene);
    this.rackTiles = findServerRackTiles(scene);
    this.printerTiles = findPrinterTiles(scene);
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
    this.fridgeEnabled = fridgeEnabledFromQuery();
    this.fridgeActiveUntil = 0;
    this.fridgeCooldownUntil = 0;
    this.lastFridgeAt = 0;
    this._lastFridgeTile = null;
    this._lastFridgeToast = null;
    this.microwaveEnabled = microwaveEnabledFromQuery();
    this.microwaveActiveUntil = 0;
    this.microwaveCooldownUntil = 0;
    this.lastMicrowaveAt = 0;
    this._lastMicrowaveTile = null;
    this._lastMicrowaveToast = null;
    this.coolerEnabled = coolerEnabledFromQuery();
    this.coolerActiveUntil = 0;
    this.coolerCooldownUntil = 0;
    this.lastCoolerAt = 0;
    this._lastCoolerTile = null;
    this._lastCoolerToast = null;
    this.coatRackEnabled = coatRackEnabledFromQuery();
    this.coatRackActiveUntil = 0;
    this.coatRackCooldownUntil = 0;
    this.lastCoatRackAt = 0;
    this._lastCoatRackTile = null;
    this._lastCoatRackToast = null;
    this._coatHung = false;

    this.recycleEnabled = recycleEnabledFromQuery();
    this.recycleActiveUntil = 0;
    this.recycleCooldownUntil = 0;
    this.lastRecycleAt = 0;
    this._lastRecycleTile = null;
    this._lastRecycleToast = null;
    this._lastRecyclePaperQty = 0;
    this.rackEnabled = rackEnabledFromQuery();
    this.rackActiveUntil = 0;
    this.rackCooldownUntil = 0;
    this.lastRackAt = 0;
    this._lastRackTile = null;
    this._lastRackToast = null;
    this._lastRackRunning = 0;
    this.printerEnabled = printerEnabledFromQuery();
    this.printerActiveUntil = 0;
    this.printerCooldownUntil = 0;
    this.lastPrintAt = 0;
    this._lastPrintTile = null;
    this._lastPrintToast = null;
    this._lastPaperQty = 0;
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

    if (this.printerEnabled && printerForceFromQuery()) {
      this.scene.time.delayedCall(900, () => {
        const machine = this.printerTiles?.[0];
        if (!machine || !this.scene.boss?.sprite) return;
        this.scene.boss.sprite.setPosition(machine.x + 12, machine.y + 18);
        this.startPrinterPrint();
      });
    }
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
    // priority: coffee > aquafeed > vending > fridge > microwave > cooler > recycle > coatrack > rack > printer > nap > mascotpet > plantwater > poster > bookshelf > work
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
    if (
      this.fridgeEnabled &&
      nearFridge(this.scene, this.fridgeTiles) &&
      !this.fridgeActive()
    ) {
      return "fridge";
    }
    if (
      this.microwaveEnabled &&
      nearMicrowave(this.scene, this.microwaveTiles) &&
      !this.microwaveActive()
    ) {
      return "microwave";
    }
    if (
      this.coolerEnabled &&
      nearCooler(this.scene, this.coolerTiles) &&
      !this.coolerActive()
    ) {
      return "cooler";
    }
    if (
      this.recycleEnabled &&
      nearRecycle(this.scene, this.recycleTiles) &&
      !this.recycleActive()
    ) {
      return "recycle";
    }
    if (
      this.coatRackEnabled &&
      nearCoatRack(this.scene, this.coatRackTiles) &&
      !this.coatRackActive()
    ) {
      return "coatrack";
    }
    if (
      this.rackEnabled &&
      nearRack(this.scene, this.rackTiles) &&
      !this.rackActive()
    ) {
      return "rack";
    }
    if (
      this.printerEnabled &&
      nearPrinter(this.scene, this.printerTiles) &&
      !this.printerActive()
    ) {
      return "printer";
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
    if (k === "fridge") {
      if (this.fridgeCoolingDown()) {
        return `냉장고 쿨다운 ${this.fridgeCooldownLeftSec()}s`;
      }
      return "E 냉장고";
    }
    if (k === "microwave") {
      if (this.microwaveCoolingDown()) {
        return `전자레인지 쿨다운 ${this.microwaveCooldownLeftSec()}s`;
      }
      return "E 데우기";
    }
    if (k === "cooler") {
      if (this.coolerCoolingDown()) {
        return `정수기 쿨다운 ${this.coolerCooldownLeftSec()}s`;
      }
      return "E 물마시기";
    }
    if (k === "recycle") {
      if (this.recycleCoolingDown()) {
        return `분리수거 쿨다운 ${this.recycleCooldownLeftSec()}s`;
      }
      return "E 분리수거";
    }
    if (k === "coatrack") {
      if (this.coatRackCoolingDown()) {
        return `코트랙 쿨다운 ${this.coatRackCooldownLeftSec()}s`;
      }
      return this._coatHung ? "E 코트 벗기" : "E 코트 걸기";
    }
    if (k === "rack") {
      if (this.rackCoolingDown()) {
        return `서버랙 쿨다운 ${this.rackCooldownLeftSec()}s`;
      }
      return "E 서버랙";
    }
    if (k === "printer") {
      if (this.printerCoolingDown()) {
        return `프린터 쿨다운 ${this.printerCooldownLeftSec()}s`;
      }
      return "E 출력";
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
    if (this.fridgeEnabled && nearFridge(this.scene, this.fridgeTiles)) {
      return this.startFridge();
    }
    if (this.microwaveEnabled && nearMicrowave(this.scene, this.microwaveTiles)) {
      return this.startMicrowave();
    }
    if (this.coolerEnabled && nearCooler(this.scene, this.coolerTiles)) {
      return this.startCooler();
    }
    if (this.recycleEnabled && nearRecycle(this.scene, this.recycleTiles)) {
      return this.startRecycle();
    }
    if (this.coatRackEnabled && nearCoatRack(this.scene, this.coatRackTiles)) {
      return this.startCoatRack();
    }
    if (this.rackEnabled && nearRack(this.scene, this.rackTiles)) {
      return this.startRack();
    }
    if (this.printerEnabled && nearPrinter(this.scene, this.printerTiles)) {
      return this.startPrinterPrint();
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

  fridgeActive() {
    return this.scene.time.now < this.fridgeActiveUntil;
  }

  fridgeCoolingDown() {
    return this.scene.time.now < this.fridgeCooldownUntil;
  }

  fridgeCooldownLeftSec() {
    return Math.max(
      1,
      Math.ceil((this.fridgeCooldownUntil - this.scene.time.now) / 1000),
    );
  }

  startFridge() {
    if (!this.fridgeEnabled) return false;
    if (this.fridgeActive()) return true;
    if (this.fridgeCoolingDown()) {
      this.showToast(`냉장고 쿨다운 ${this.fridgeCooldownLeftSec()}초`);
      this.lastAction = {
        kind: "fridge_cooldown",
        cooldownSec: this.fridgeCooldownLeftSec(),
      };
      this.publish();
      return true;
    }
    const machine = nearestFridge(this.scene, this.fridgeTiles);
    if (!machine) return false;
    const now = this.scene.time.now;
    const dur =
      KITCHEN_MS_MIN +
      Math.floor(Math.random() * (KITCHEN_MS_MAX - KITCHEN_MS_MIN + 1));
    const cool =
      KITCHEN_COOLDOWN_MS_MIN +
      Math.floor(
        Math.random() *
          (KITCHEN_COOLDOWN_MS_MAX - KITCHEN_COOLDOWN_MS_MIN + 1),
      );
    const toast =
      FRIDGE_TOASTS[Math.floor(Math.random() * FRIDGE_TOASTS.length)];
    this.lastFridgeAt = now;
    this.fridgeActiveUntil = now + dur;
    this.fridgeCooldownUntil = now + cool;
    this._lastFridgeTile = { tx: machine.tx, ty: machine.ty };
    this._lastFridgeToast = toast;
    this.scene.officeAudio?.playFridgeHiss?.();
    this.showToast(toast);
    this.lastAction = {
      kind: "fridge_start",
      startedAt: now,
      durationMs: dur,
      cooldownMs: cool,
      toast,
      machine: this._lastFridgeTile,
    };
    this.publish();
    return true;
  }

  microwaveActive() {
    return this.scene.time.now < this.microwaveActiveUntil;
  }

  microwaveCoolingDown() {
    return this.scene.time.now < this.microwaveCooldownUntil;
  }

  microwaveCooldownLeftSec() {
    return Math.max(
      1,
      Math.ceil((this.microwaveCooldownUntil - this.scene.time.now) / 1000),
    );
  }

  startMicrowave() {
    if (!this.microwaveEnabled) return false;
    if (this.microwaveActive()) return true;
    if (this.microwaveCoolingDown()) {
      this.showToast(`전자레인지 쿨다운 ${this.microwaveCooldownLeftSec()}초`);
      this.lastAction = {
        kind: "microwave_cooldown",
        cooldownSec: this.microwaveCooldownLeftSec(),
      };
      this.publish();
      return true;
    }
    const machine = nearestMicrowave(this.scene, this.microwaveTiles);
    if (!machine) return false;
    const now = this.scene.time.now;
    const dur =
      KITCHEN_MS_MIN +
      Math.floor(Math.random() * (KITCHEN_MS_MAX - KITCHEN_MS_MIN + 1));
    const cool =
      KITCHEN_COOLDOWN_MS_MIN +
      Math.floor(
        Math.random() *
          (KITCHEN_COOLDOWN_MS_MAX - KITCHEN_COOLDOWN_MS_MIN + 1),
      );
    const toast =
      MICROWAVE_TOASTS[Math.floor(Math.random() * MICROWAVE_TOASTS.length)];
    this.lastMicrowaveAt = now;
    this.microwaveActiveUntil = now + dur;
    this.microwaveCooldownUntil = now + cool;
    this._lastMicrowaveTile = { tx: machine.tx, ty: machine.ty };
    this._lastMicrowaveToast = toast;
    this.scene.officeAudio?.playMicrowaveDing?.();
    this.showToast(toast);
    this.lastAction = {
      kind: "microwave_start",
      startedAt: now,
      durationMs: dur,
      cooldownMs: cool,
      toast,
      machine: this._lastMicrowaveTile,
    };
    this.publish();
    return true;
  }

  coolerActive() {
    return this.scene.time.now < this.coolerActiveUntil;
  }

  coolerCoolingDown() {
    return this.scene.time.now < this.coolerCooldownUntil;
  }

  coolerCooldownLeftSec() {
    return Math.max(
      1,
      Math.ceil((this.coolerCooldownUntil - this.scene.time.now) / 1000),
    );
  }

  startCooler() {
    if (!this.coolerEnabled) return false;
    if (this.coolerActive()) return true;
    if (this.coolerCoolingDown()) {
      this.showToast(`정수기 쿨다운 ${this.coolerCooldownLeftSec()}초`);
      this.lastAction = {
        kind: "cooler_cooldown",
        cooldownSec: this.coolerCooldownLeftSec(),
      };
      this.publish();
      return true;
    }
    const machine = nearestCooler(this.scene, this.coolerTiles);
    if (!machine) return false;
    const now = this.scene.time.now;
    const dur =
      KITCHEN_MS_MIN +
      Math.floor(Math.random() * (KITCHEN_MS_MAX - KITCHEN_MS_MIN + 1));
    const cool =
      KITCHEN_COOLDOWN_MS_MIN +
      Math.floor(
        Math.random() *
          (KITCHEN_COOLDOWN_MS_MAX - KITCHEN_COOLDOWN_MS_MIN + 1),
      );
    const toast =
      COOLER_TOASTS[Math.floor(Math.random() * COOLER_TOASTS.length)];
    this.lastCoolerAt = now;
    this.coolerActiveUntil = now + dur;
    this.coolerCooldownUntil = now + cool;
    this._lastCoolerTile = { tx: machine.tx, ty: machine.ty };
    this._lastCoolerToast = toast;
    this.scene.officeAudio?.playCoolerSip?.();
    this.showToast(toast);
    this.lastAction = {
      kind: "cooler_start",
      startedAt: now,
      durationMs: dur,
      cooldownMs: cool,
      toast,
      machine: this._lastCoolerTile,
    };
    this.publish();
    return true;
  }

  coatRackActive() {
    return this.scene.time.now < this.coatRackActiveUntil;
  }

  coatRackCoolingDown() {
    return this.scene.time.now < this.coatRackCooldownUntil;
  }

  coatRackCooldownLeftSec() {
    return Math.max(
      1,
      Math.ceil((this.coatRackCooldownUntil - this.scene.time.now) / 1000),
    );
  }

  startCoatRack() {
    if (!this.coatRackEnabled) return false;
    if (this.coatRackActive()) return true;
    if (this.coatRackCoolingDown()) {
      this.showToast(`코트랙 쿨다운 ${this.coatRackCooldownLeftSec()}초`);
      this.lastAction = {
        kind: "coatrack_cooldown",
        cooldownSec: this.coatRackCooldownLeftSec(),
      };
      this.publish();
      return true;
    }
    const machine = nearestCoatRack(this.scene, this.coatRackTiles);
    if (!machine) return false;
    const now = this.scene.time.now;
    const dur =
      KITCHEN_MS_MIN +
      Math.floor(Math.random() * (KITCHEN_MS_MAX - KITCHEN_MS_MIN + 1));
    const cool =
      KITCHEN_COOLDOWN_MS_MIN +
      Math.floor(
        Math.random() *
          (KITCHEN_COOLDOWN_MS_MAX - KITCHEN_COOLDOWN_MS_MIN + 1),
      );
    this._coatHung = !this._coatHung;
    const toasts = this._coatHung ? COAT_RACK_TOASTS_HANG : COAT_RACK_TOASTS_TAKE;
    const toast = toasts[Math.floor(Math.random() * toasts.length)];
    this.lastCoatRackAt = now;
    this.coatRackActiveUntil = now + dur;
    this.coatRackCooldownUntil = now + cool;
    this._lastCoatRackTile = { tx: machine.tx, ty: machine.ty };
    this._lastCoatRackToast = toast;
    this.scene.officeAudio?.playCoatRustle?.();
    this.showToast(toast);
    this.lastAction = {
      kind: "coatrack_start",
      startedAt: now,
      durationMs: dur,
      cooldownMs: cool,
      toast,
      hung: this._coatHung,
      machine: this._lastCoatRackTile,
    };
    this.publish();
    return true;
  }

  recycleActive() {
    return this.scene.time.now < this.recycleActiveUntil;
  }

  recycleCoolingDown() {
    return this.scene.time.now < this.recycleCooldownUntil;
  }

  recycleCooldownLeftSec() {
    return Math.max(
      1,
      Math.ceil((this.recycleCooldownUntil - this.scene.time.now) / 1000),
    );
  }

  startRecycle() {
    if (!this.recycleEnabled) return false;
    if (this.recycleActive()) return true;
    if (this.recycleCoolingDown()) {
      this.showToast(`분리수거 쿨다운 ${this.recycleCooldownLeftSec()}초`);
      this.lastAction = {
        kind: "recycle_cooldown",
        cooldownSec: this.recycleCooldownLeftSec(),
      };
      this.publish();
      return true;
    }
    const machine = nearestRecycle(this.scene, this.recycleTiles);
    if (!machine) return false;
    const now = this.scene.time.now;
    const dur =
      KITCHEN_MS_MIN +
      Math.floor(Math.random() * (KITCHEN_MS_MAX - KITCHEN_MS_MIN + 1));
    const cool =
      KITCHEN_COOLDOWN_MS_MIN +
      Math.floor(
        Math.random() *
          (KITCHEN_COOLDOWN_MS_MAX - KITCHEN_COOLDOWN_MS_MIN + 1),
      );
    const toast =
      RECYCLE_TOASTS[Math.floor(Math.random() * RECYCLE_TOASTS.length)];
    this.lastRecycleAt = now;
    this.recycleActiveUntil = now + dur;
    this.recycleCooldownUntil = now + cool;
    this._lastRecycleTile = { tx: machine.tx, ty: machine.ty };
    this._lastRecycleToast = toast;
    const burst = burstRecyclePaper(this.scene, machine.x, machine.y, dur);
    this._lastRecyclePaperQty = burst?.qty ?? 0;
    this.scene.officeAudio?.playCoatRustle?.();
    this.showToast(toast);
    this.lastAction = {
      kind: "recycle_start",
      startedAt: now,
      durationMs: dur,
      cooldownMs: cool,
      toast,
      papers: this._lastRecyclePaperQty,
      machine: this._lastRecycleTile,
    };
    this.publish();
    return true;
  }

  rackActive() {
    return this.scene.time.now < this.rackActiveUntil;
  }

  rackCoolingDown() {
    return this.scene.time.now < this.rackCooldownUntil;
  }

  rackCooldownLeftSec() {
    return Math.max(
      1,
      Math.ceil((this.rackCooldownUntil - this.scene.time.now) / 1000),
    );
  }

  startRack() {
    if (!this.rackEnabled) return false;
    if (this.rackActive()) return true;
    if (this.rackCoolingDown()) {
      this.showToast(`서버랙 쿨다운 ${this.rackCooldownLeftSec()}초`);
      this.lastAction = {
        kind: "rack_cooldown",
        cooldownSec: this.rackCooldownLeftSec(),
      };
      this.publish();
      return true;
    }
    const machine = nearestRack(this.scene, this.rackTiles);
    if (!machine) return false;
    const now = this.scene.time.now;
    const dur =
      RACK_MS_MIN +
      Math.floor(Math.random() * (RACK_MS_MAX - RACK_MS_MIN + 1));
    const cool =
      RACK_COOLDOWN_MS_MIN +
      Math.floor(
        Math.random() * (RACK_COOLDOWN_MS_MAX - RACK_COOLDOWN_MS_MIN + 1),
      );
    const running = countRunningAgents(this.scene);
    const toast = rackToastForLoad(running);
    this.lastRackAt = now;
    this.rackActiveUntil = now + dur;
    this.rackCooldownUntil = now + cool;
    this._lastRackTile = { tx: machine.tx, ty: machine.ty };
    this._lastRackToast = toast;
    this._lastRackRunning = running;
    this.scene.officeAudio?.playServerRackBlip?.();
    this.showToast(toast);
    this.lastAction = {
      kind: "rack_start",
      startedAt: now,
      durationMs: dur,
      cooldownMs: cool,
      toast,
      running,
      machine: this._lastRackTile,
    };
    this.publish();
    return true;
  }

  printerActive() {
    return this.scene.time.now < this.printerActiveUntil;
  }

  printerCoolingDown() {
    return this.scene.time.now < this.printerCooldownUntil;
  }

  printerCooldownLeftSec() {
    return Math.max(
      1,
      Math.ceil((this.printerCooldownUntil - this.scene.time.now) / 1000),
    );
  }

  /** printer_jam gather 중이면 용지 걸림 toast만. */
  isPrinterJamActive() {
    const oe = this.scene.officeEvents;
    if (!oe?.isGathering?.()) return false;
    return oe.lastEvent === "printer_jam";
  }

  startPrinterPrint() {
    if (!this.printerEnabled) return false;
    if (this.printerActive()) return true;
    if (this.isPrinterJamActive()) {
      this.showToast("용지 걸림…");
      this.lastAction = {
        kind: "printer_jam_block",
        at: this.scene.time.now,
      };
      this.publish();
      return true;
    }
    if (this.printerCoolingDown()) {
      this.showToast(`프린터 쿨다운 ${this.printerCooldownLeftSec()}초`);
      this.lastAction = {
        kind: "printer_cooldown",
        cooldownSec: this.printerCooldownLeftSec(),
      };
      this.publish();
      return true;
    }
    const machine = nearestPrinter(this.scene, this.printerTiles);
    if (!machine) return false;
    const now = this.scene.time.now;
    const dur =
      PRINTER_MS_MIN +
      Math.floor(Math.random() * (PRINTER_MS_MAX - PRINTER_MS_MIN + 1));
    const cool =
      PRINTER_COOLDOWN_MS_MIN +
      Math.floor(
        Math.random() *
          (PRINTER_COOLDOWN_MS_MAX - PRINTER_COOLDOWN_MS_MIN + 1),
      );
    const toast =
      PRINTER_TOASTS[Math.floor(Math.random() * PRINTER_TOASTS.length)];
    this.lastPrintAt = now;
    this.printerActiveUntil = now + dur;
    this.printerCooldownUntil = now + cool;
    this._lastPrintTile = { tx: machine.tx, ty: machine.ty };
    this._lastPrintToast = toast;
    const burst = burstPrinterPaper(this.scene, machine.x, machine.y, dur);
    this._lastPaperQty = burst?.qty ?? 0;
    this.scene.officeAudio?.playPrinterClick?.();
    this.showToast(toast);
    this.lastAction = {
      kind: "printer_print_start",
      startedAt: now,
      durationMs: dur,
      cooldownMs: cool,
      toast,
      papers: this._lastPaperQty,
      machine: this._lastPrintTile,
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
    if (this.fridgeActiveUntil && time >= this.fridgeActiveUntil) {
      this.fridgeActiveUntil = 0;
      this.lastAction = {
        kind: "fridge_end",
        lastFridgeAt: this.lastFridgeAt,
      };
      this.publish();
    }
    if (this.microwaveActiveUntil && time >= this.microwaveActiveUntil) {
      this.microwaveActiveUntil = 0;
      this.lastAction = {
        kind: "microwave_end",
        lastMicrowaveAt: this.lastMicrowaveAt,
      };
      this.publish();
    }
    if (this.coolerActiveUntil && time >= this.coolerActiveUntil) {
      this.coolerActiveUntil = 0;
      this.lastAction = {
        kind: "cooler_end",
        lastCoolerAt: this.lastCoolerAt,
      };
      this.publish();
    }
    if (this.coatRackActiveUntil && time >= this.coatRackActiveUntil) {
      this.coatRackActiveUntil = 0;
      this.lastAction = {
        kind: "coatrack_end",
        lastCoatRackAt: this.lastCoatRackAt,
      };
      this.publish();
    }
    if (this.recycleActiveUntil && time >= this.recycleActiveUntil) {
      this.recycleActiveUntil = 0;
      this.lastAction = {
        kind: "recycle_end",
        lastRecycleAt: this.lastRecycleAt,
      };
      this.publish();
    }
    if (this.rackActiveUntil && time >= this.rackActiveUntil) {
      this.rackActiveUntil = 0;
      this.lastAction = {
        kind: "rack_end",
        lastRackAt: this.lastRackAt,
      };
      this.publish();
    }
    if (this.printerActiveUntil && time >= this.printerActiveUntil) {
      this.printerActiveUntil = 0;
      this.lastAction = {
        kind: "printer_print_end",
        lastPrintAt: this.lastPrintAt,
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

  fridgeSnapshot() {
    return {
      enabled: !!this.fridgeEnabled,
      active: this.fridgeActive(),
      cooldown: this.fridgeCoolingDown(),
      cooldownMsLeft: Math.max(
        0,
        Math.round(this.fridgeCooldownUntil - this.scene.time.now),
      ),
      lastFridgeAt: this.lastFridgeAt || null,
      fridgeCount: this.fridgeTiles?.length ?? 0,
      lastMachine: this._lastFridgeTile,
      lastToast: this._lastFridgeToast,
    };
  }

  microwaveSnapshot() {
    return {
      enabled: !!this.microwaveEnabled,
      active: this.microwaveActive(),
      cooldown: this.microwaveCoolingDown(),
      cooldownMsLeft: Math.max(
        0,
        Math.round(this.microwaveCooldownUntil - this.scene.time.now),
      ),
      lastMicrowaveAt: this.lastMicrowaveAt || null,
      microwaveCount: this.microwaveTiles?.length ?? 0,
      lastMachine: this._lastMicrowaveTile,
      lastToast: this._lastMicrowaveToast,
    };
  }

  coolerSnapshot() {
    return {
      enabled: !!this.coolerEnabled,
      active: this.coolerActive(),
      cooldown: this.coolerCoolingDown(),
      cooldownMsLeft: Math.max(
        0,
        Math.round(this.coolerCooldownUntil - this.scene.time.now),
      ),
      lastCoolerAt: this.lastCoolerAt || null,
      coolerCount: this.coolerTiles?.length ?? 0,
      lastMachine: this._lastCoolerTile,
      lastToast: this._lastCoolerToast,
    };
  }

  coatRackSnapshot() {
    return {
      enabled: !!this.coatRackEnabled,
      active: this.coatRackActive(),
      cooldown: this.coatRackCoolingDown(),
      cooldownMsLeft: Math.max(
        0,
        Math.round(this.coatRackCooldownUntil - this.scene.time.now),
      ),
      lastCoatRackAt: this.lastCoatRackAt || null,
      coatRackCount: this.coatRackTiles?.length ?? 0,
      hung: !!this._coatHung,
      lastMachine: this._lastCoatRackTile,
      lastToast: this._lastCoatRackToast,
    };
  }

  recycleSnapshot() {
    return {
      enabled: !!this.recycleEnabled,
      active: this.recycleActive(),
      cooldown: this.recycleCoolingDown(),
      cooldownMsLeft: Math.max(
        0,
        Math.round(this.recycleCooldownUntil - this.scene.time.now),
      ),
      lastRecycleAt: this.lastRecycleAt || null,
      recycleCount: this.recycleTiles?.length ?? 0,
      lastMachine: this._lastRecycleTile,
      lastToast: this._lastRecycleToast,
      papers: this._lastRecyclePaperQty || 0,
    };
  }

  rackSnapshot() {
    return {
      enabled: !!this.rackEnabled,
      active: this.rackActive(),
      cooldown: this.rackCoolingDown(),
      cooldownMsLeft: Math.max(
        0,
        Math.round(this.rackCooldownUntil - this.scene.time.now),
      ),
      lastRackAt: this.lastRackAt || null,
      rackCount: this.rackTiles?.length ?? 0,
      lastMachine: this._lastRackTile,
      lastToast: this._lastRackToast,
      running: this._lastRackRunning ?? 0,
    };
  }

  printerSnapshot() {
    return {
      enabled: !!this.printerEnabled,
      active: this.printerActive(),
      cooldown: this.printerCoolingDown(),
      cooldownMsLeft: Math.max(
        0,
        Math.round(this.printerCooldownUntil - this.scene.time.now),
      ),
      lastPrintAt: this.lastPrintAt || null,
      printerCount: this.printerTiles?.length ?? 0,
      lastMachine: this._lastPrintTile,
      lastToast: this._lastPrintToast,
      papers: this._lastPaperQty || 0,
      jamBlocked: this.isPrinterJamActive(),
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
      fridgeTiles: this.fridgeTiles.map((f) => ({ tx: f.tx, ty: f.ty })),
      microwaveTiles: this.microwaveTiles.map((m) => ({ tx: m.tx, ty: m.ty })),
      coolerTiles: this.coolerTiles.map((c) => ({ tx: c.tx, ty: c.ty })),
      recycleTiles: this.recycleTiles.map((c) => ({ tx: c.tx, ty: c.ty })),
      coatRackTiles: this.coatRackTiles.map((c) => ({ tx: c.tx, ty: c.ty })),
      rackTiles: this.rackTiles.map((r) => ({ tx: r.tx, ty: r.ty })),
      printerTiles: this.printerTiles.map((p) => ({ tx: p.tx, ty: p.ty })),
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
      fridgeEnabled: !!this.fridgeEnabled,
      fridgeActive: this.fridgeActive(),
      fridgeCooldown: this.fridgeCoolingDown(),
      microwaveEnabled: !!this.microwaveEnabled,
      microwaveActive: this.microwaveActive(),
      microwaveCooldown: this.microwaveCoolingDown(),
      coolerEnabled: !!this.coolerEnabled,
      coolerActive: this.coolerActive(),
      coolerCooldown: this.coolerCoolingDown(),
      recycleEnabled: !!this.recycleEnabled,
      recycleActive: this.recycleActive(),
      recycleCooldown: this.recycleCoolingDown(),
      coatRackEnabled: !!this.coatRackEnabled,
      coatRackActive: this.coatRackActive(),
      coatRackCooldown: this.coatRackCoolingDown(),
      coatHung: !!this._coatHung,
      rackEnabled: !!this.rackEnabled,
      rackActive: this.rackActive(),
      rackCooldown: this.rackCoolingDown(),
      lastRackAt: this.lastRackAt || null,
      printerEnabled: !!this.printerEnabled,
      printerActive: this.printerActive(),
      printerCooldown: this.printerCoolingDown(),
      lastPrintAt: this.lastPrintAt || null,
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
      fridge: this.fridgeSnapshot(),
      microwave: this.microwaveSnapshot(),
      cooler: this.coolerSnapshot(),
      recycle: this.recycleSnapshot(),
      coatRack: this.coatRackSnapshot(),
      rack: this.rackSnapshot(),
      printer: this.printerSnapshot(),
      posterQuote: this.posterSnapshot(),
      bookshelfTip: this.bookshelfSnapshot(),
    };
  }
}

export {
  findCoffeeTiles,
  findAquariumTiles,
  findVendingTiles,
  findFridgeTiles,
  findMicrowaveTiles,
  findWaterCoolerTiles,
  findCoatRackInteractTiles,
  findRecycleBinInteractTiles,
  findPrinterTiles,
  COFFEE_GID,
  AQUARIUM_GID,
  VENDING_GID,
  FRIDGE_GID,
  MICROWAVE_GID,
  WATER_COOLER_GID,
  COAT_RACK_GID,
  RECYCLE_BIN_GID,
  PRINTER_GID,
  nearCoffee,
  nearAquarium,
  nearVending,
  nearFridge,
  nearMicrowave,
  nearCooler,
  nearRecycle,
  nearCoatRack,
  nearRack,
  nearPrinter,
  nearSleep,
  nearMascot,
  nearPlant,
  mascotPetEnabledFromQuery,
  plantWaterEnabledFromQuery,
  vendingEnabledFromQuery,
  fridgeEnabledFromQuery,
  microwaveEnabledFromQuery,
  coolerEnabledFromQuery,
  recycleEnabledFromQuery,
  coatRackEnabledFromQuery,
  rackEnabledFromQuery,
  printerEnabledFromQuery,
  printerForceFromQuery,
  bookshelfTipEnabledFromQuery,
  nearBookshelf,
  BOOKSHELF_TIPS,
};
