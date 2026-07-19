/** Random FE-only office events: toast + particles. `?events=0` off, `?events=1` fast, `?events=code_freeze` / `?events=build_fail` / `?events=sprint_retro` / `?events=donut_friday` / `?events=midnight_snack` / `?events=food_delivery` / `?events=tea_time` force. */

import Phaser from "phaser";
import { findWhiteboardAnchor } from "../ui/whiteboardTicker.js";
import { findDualDeskTiles } from "./dualDeskIdle.js";
import { findOpenDeskTiles } from "./openDeskIdle.js";

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
  "microwave_ding",
  "deploy_celebrate",
  "mascot_zoomies",
  "birthday_balloons",
  "review_huddle",
  "coffee_spill",
  "pair_programming",
  "merge_conflict",
  "hotfix_scramble",
  "build_fail",
  "code_freeze",
  "sprint_retro",
  "donut_friday",
  "midnight_snack",
  "food_delivery",
  "tea_time",
];
/** wifi_outage: soft gray overlay + idle bubbles (ms) — not full blackout */
const WIFI_MIN_MS = 2000;
const WIFI_MAX_MS = 4000;
const WIFI_LINES = ["와이파이?", "버퍼링…"];
const WIFI_GRAY = 0x7a7a88;
const WIFI_ALPHA = 0.22;
/** code_freeze: cool-blue overlay + idle bubbles (ms) — no gather/move */
const FREEZE_MIN_MS = 4000;
const FREEZE_MAX_MS = 7000;
const FREEZE_TOASTS = ["코드프리즈!", "머지 잠금"];
const FREEZE_LINES = ["커밋 금지?", "핫픽스만"];
/** soft cool blue — deploy lock vibe */
const FREEZE_BLUE = 0x4a7ec8;
const FREEZE_ALPHA = 0.15;
/** weekday 16–19: higher pick weight */
const FREEZE_HOUR_START = 16;
const FREEZE_HOUR_END = 19;
const FREEZE_WEIGHT = 3;
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
/** deploy_celebrate: lobby/lounge gather + teal/cyan confetti (ms) */
const DEPLOY_HOLD_MIN_MS = 5000;
const DEPLOY_HOLD_MAX_MS = 8000;
const DEPLOY_TOASTS = ["배포 성공!", "프로덕션 각"];
/** soft teal/cyan — taskCelebrate mint + cyan family */
const DEPLOY_TINTS = [0x5ee0c8, 0x7ec8ff, 0x7eecc8, 0xa8fff0, 0xffffff];
/** weekday 10–12 · 14–18: higher pick weight */
const DEPLOY_AM_START = 10;
const DEPLOY_AM_END = 12;
const DEPLOY_PM_START = 14;
const DEPLOY_PM_END = 18;
const DEPLOY_WEIGHT = 3;
/** mascot_zoomies: lounge dash + dust (ms); weight=1 default */
const ZOOMIES_HOLD_MIN_MS = 4000;
const ZOOMIES_HOLD_MAX_MS = 7000;
const ZOOMIES_TOASTS = ["줌이즈!", "냥 가즈아"];
const ZOOMIES_DUST_TEX = "fx-zoomies-dust";
/** birthday_balloons: lounge gather + soft balloons (ms); weight=1 */
const BIRTHDAY_HOLD_MIN_MS = 6000;
const BIRTHDAY_HOLD_MAX_MS = 10000;
const BIRTHDAY_TOASTS = ["생일이다!", "생일 ㅊㅋ", "케이크 각?"];
const BIRTHDAY_BALLOON_TEX = "fx-balloon";
/** pastel pink / sky / lavender */
const BIRTHDAY_TINTS = [0xff8eb8, 0x7ec8ff, 0xc9a0ff];
/** review_huddle: War Room whiteboard gather + soft amber chalk (ms) */
const REVIEW_HOLD_MIN_MS = 6000;
const REVIEW_HOLD_MAX_MS = 10000;
const REVIEW_TOASTS = ["리뷰 허들!", "PR 각?", "리뷰 ㄱㄱ"];
const REVIEW_CHALK_TEX = "fx-chalk";
/** soft amber chalk dust */
const REVIEW_TINTS = [0xe8b060, 0xd4a050, 0xf0c878, 0xffe8c0];
/** weekday 10–12 · 14–17: higher pick weight */
const REVIEW_AM_START = 10;
const REVIEW_AM_END = 12;
const REVIEW_PM_START = 14;
const REVIEW_PM_END = 17;
const REVIEW_WEIGHT = 3;
/** sprint_retro: War Room whiteboard gather + pastel sticky notes (ms) */
const RETRO_HOLD_MIN_MS = 6000;
const RETRO_HOLD_MAX_MS = 10000;
const RETRO_TOASTS = ["회고 각!", "레트로!", "Keep/Problem/Try"];
const RETRO_STICKY_TEX = "fx-retro-sticky";
/** soft pastel sticky — pale yellow / pink / mint */
const RETRO_TINTS = [0xfff3a0, 0xffb8d0, 0xa8f0d0, 0xffe8b0, 0xd8f5e8];
/** weekday 16–18: higher pick weight */
const RETRO_HOUR_START = 16;
const RETRO_HOUR_END = 18;
const RETRO_WEIGHT = 3;
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
const VENDING_GID = 38;
const FRIDGE_GID = 39;
const MICROWAVE_GID = 40;
const WATER_COOLER_GID = 41;
/** coffee_spill: soft puddle + gather (ms) */
const COFFEE_SPILL_MIN_MS = 6000;
const COFFEE_SPILL_MAX_MS = 10000;
const COFFEE_PUDDLE_TEX = "fx-coffee-puddle";
/** lunch-ish 11–15: higher pick weight for coffee_spill */
const COFFEE_SPILL_HOUR_START = 11;
const COFFEE_SPILL_HOUR_END = 15;
const COFFEE_SPILL_WEIGHT = 2;
/** pair_programming: dualDesk 2-agent gather + cyan sparkle (ms) */
const PAIR_HOLD_MIN_MS = 6000;
const PAIR_HOLD_MAX_MS = 10000;
const PAIR_TOASTS = ["페어 각?", "페어프로그래밍!"];
const PAIR_SPARKLE_TEX = "fx-pair-sparkle";
/** soft cyan / teal — monitor gleam */
const PAIR_TINTS = [0x5ee0c8, 0x7ec8ff, 0x40d0c0, 0xa8fff0];
/** weekday 10–12 · 14–17: higher pick weight */
const PAIR_AM_START = 10;
const PAIR_AM_END = 12;
const PAIR_PM_START = 14;
const PAIR_PM_END = 17;
const PAIR_WEIGHT = 2;
/** merge_conflict: Open Desk / dualDesk gather + red/amber conflict spark (ms) */
const MERGE_HOLD_MIN_MS = 4000;
const MERGE_HOLD_MAX_MS = 7000;
const MERGE_TOASTS = ["머지 충돌!", "CONFLICT", "rebase ㄱㄱ"];
const MERGE_SPARK_TEX = "fx-merge-spark";
/** soft red / amber — git conflict vibe */
const MERGE_TINTS = [0xff5544, 0xff8844, 0xe8a040, 0xffcc66];
/** spark burst only — short, not full hold */
const MERGE_SPARK_MIN_MS = 1500;
const MERGE_SPARK_MAX_MS = 2500;
/** weight=1 always (no TOD boost) */
const MERGE_WEIGHT = 1;
/** hotfix_scramble: Open Desk urgent gather + soft red/amber pulse (ms) */
const HOTFIX_HOLD_MIN_MS = 5000;
const HOTFIX_HOLD_MAX_MS = 8000;
const HOTFIX_TOASTS = ["핫픽스!", "긴급 배포", "스크램블"];
/** soft red / amber — urgency pulse (not full fire_drill) */
const HOTFIX_PULSE_COLOR = 0xe85030;
const HOTFIX_PULSE_AMBER = 0xe8a040;
const HOTFIX_PULSE_ALPHA = 0.12;
const HOTFIX_PULSE_MIN_MS = 2000;
const HOTFIX_PULSE_MAX_MS = 3000;
/** weekday 10–12 · 14–18: higher pick weight */
const HOTFIX_AM_START = 10;
const HOTFIX_AM_END = 12;
const HOTFIX_PM_START = 14;
const HOTFIX_PM_END = 18;
const HOTFIX_WEIGHT = 3;
/** build_fail: Open Desk gather + soft rose/red overlay (ms) — CI red vibe */
const BUILD_FAIL_MIN_MS = 4000;
const BUILD_FAIL_MAX_MS = 7000;
const BUILD_FAIL_TOASTS = ["빌드 깨짐!", "CI 빨강"];
const BUILD_FAIL_LINES = ["뭐가 깨졌지?", "로그 각"];
/** soft rose/red — distinct from hotfix pulse / deploy teal */
const BUILD_FAIL_ROSE = 0xc04558;
const BUILD_FAIL_ALPHA_MIN = 0.12;
const BUILD_FAIL_ALPHA_MAX = 0.18;
/** weekday 10–12 · 14–18: same window as deploy (one pick per tick) */
const BUILD_FAIL_WEIGHT = 3;
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
/** weekday 11–14: higher pick weight for microwave_ding */
const MICROWAVE_HOUR_START = 11;
const MICROWAVE_HOUR_END = 14;
const MICROWAVE_WEIGHT = 3;
/** microwave_ding: short steam puff at coffee/break (ms) */
const MICROWAVE_STEAM_MS = 1400;
/** weekday afternoon: higher pick weight for water_cooler */
const WATER_HOUR_START = 14;
const WATER_HOUR_END = 17;
const WATER_WEIGHT = 3;
/** weekday late afternoon: higher pick weight for pizza_party */
const PIZZA_HOUR_START = 16;
const PIZZA_HOUR_END = 18;
const PIZZA_WEIGHT = 3;
/** donut_friday: lounge gather + soft glaze donuts (ms); Fri weight↑ */
const DONUT_HOLD_MIN_MS = 6000;
const DONUT_HOLD_MAX_MS = 10000;
const DONUT_TOASTS = ["도넛이다!", "불금 도넛?", "Friday glaze"];
const DONUT_TEX = "fx-donut";
/** soft pink / glaze / cream */
const DONUT_TINTS = [0xffb0c8, 0xffd4a8, 0xffe8f0];
/** weekday weight=1, Friday=4 */
const DONUT_WEEKDAY_WEIGHT = 1;
const DONUT_FRIDAY_WEIGHT = 4;
/** midnight_snack: fridge/vending gather + steam/crumb (ms); evening/night only */
const SNACK_HOLD_MIN_MS = 6000;
const SNACK_HOLD_MAX_MS = 10000;
const SNACK_TOASTS = ["야식?", "컵라면 각", "냉장고 털자"];
const SNACK_CRUMB_TEX = "fx-snack-crumb";
/** soft noodle cream / brown crumb */
const SNACK_CRUMB_TINTS = [0xffe8c0, 0xd4a574, 0xfff0d8, 0xc09060];
/** hour 20–24: higher pick weight; else weight=1 (evening/night only) */
const SNACK_HOUR_START = 20;
const SNACK_HOUR_END = 24;
const SNACK_WEIGHT = 3;
/** food_delivery: lobby/entrance bag particles + idle gather (ms) */
const FOOD_HOLD_MIN_MS = 5000;
const FOOD_HOLD_MAX_MS = 8000;
const FOOD_BAG_MIN_MS = 2500;
const FOOD_BAG_MAX_MS = 4000;
const FOOD_TOASTS = ["배달 왔다!", "점심 각?", "문 앞 봉투"];
const FOOD_BAG_TEX = "fx-food-bag";
/** soft brown / orange — distinct from parcel cardboard box */
const FOOD_BAG_TINTS = [0xc4783a, 0xe09050, 0xd46828, 0xf0a868, 0xb86830];
/** weekday 11–13 · 17–20: higher pick weight; else weight=1 */
const FOOD_LUNCH_START = 11;
const FOOD_LUNCH_END = 13;
const FOOD_DINNER_START = 17;
const FOOD_DINNER_END = 20;
const FOOD_WEIGHT = 3;
/** tea_time: lounge gather + soft steam/mug (ms); weekday 14–16 weight↑ */
const TEA_HOLD_MIN_MS = 5000;
const TEA_HOLD_MAX_MS = 8000;
const TEA_TOASTS = ["티타임!", "홍차 각?"];
const TEA_MUG_TEX = "fx-tea-mug";
/** soft cream / amber tea tint */
const TEA_MUG_TINTS = [0xffe8c8, 0xe8c090, 0xd4a060, 0xfff0d8];
/** weekday 14–16: higher pick weight */
const TEA_HOUR_START = 14;
const TEA_HOUR_END = 16;
const TEA_WEIGHT = 3;
/** Tiny confetti bit for deploy_celebrate (taskCelebrate-style). */
const DEPLOY_CONFETTI_TEX = "fx-confetti";
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

/**
 * coffee_spill anchor: coffee(GID16) → fridge/microwave → lounge/break.
 * @returns {{x:number,y:number}} tile coords
 */
function findCoffeeSpillTile(scene) {
  const layer = scene.furniture;
  if (layer?.getTileAt) {
    let fridge = null;
    let microwave = null;
    for (let ty = 0; ty < scene.map.height; ty++) {
      for (let tx = 0; tx < scene.map.width; tx++) {
        const tile = layer.getTileAt(tx, ty);
        if (!tile) continue;
        if (tile.index === COFFEE_GID) return { x: tx, y: ty };
        if (tile.index === FRIDGE_GID && !fridge) fridge = { x: tx, y: ty };
        if (tile.index === MICROWAVE_GID && !microwave)
          microwave = { x: tx, y: ty };
      }
    }
    if (fridge) return fridge;
    if (microwave) return microwave;
  }
  const lou = scene.waypoints?.lounge;
  if (Array.isArray(lou) && lou.length) {
    const spot = lou[Math.floor(Math.random() * lou.length)];
    return { x: spot.x, y: spot.y };
  }
  const br = scene.waypoints?.break || { x: 31, y: 4 };
  return { x: br.x, y: br.y };
}

/**
 * midnight_snack anchor: fridge(GID39) / vending(GID38) → lounge/break.
 * @returns {{x:number,y:number}} tile coords
 */
function findMidnightSnackTile(scene) {
  const layer = scene.furniture;
  const anchors = [];
  if (layer?.getTileAt) {
    for (let ty = 0; ty < scene.map.height; ty++) {
      for (let tx = 0; tx < scene.map.width; tx++) {
        const tile = layer.getTileAt(tx, ty);
        if (!tile) continue;
        if (tile.index === FRIDGE_GID || tile.index === VENDING_GID) {
          anchors.push({ x: tx, y: ty });
        }
      }
    }
  }
  if (anchors.length) {
    return anchors[Math.floor(Math.random() * anchors.length)];
  }
  const lou = scene.waypoints?.lounge;
  if (Array.isArray(lou) && lou.length) {
    const spot = lou[Math.floor(Math.random() * lou.length)];
    return { x: spot.x, y: spot.y };
  }
  const br = scene.waypoints?.break || { x: 31, y: 4 };
  return { x: br.x, y: br.y };
}

/** Soft coffee puddle oval — ADD + alpha fade. */
function ensureCoffeePuddleTexture(scene) {
  if (scene.textures.exists(COFFEE_PUDDLE_TEX)) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0x8b4a28, 1);
  g.fillEllipse(20, 14, 36, 22);
  g.fillStyle(0xc47840, 0.7);
  g.fillEllipse(18, 12, 22, 12);
  g.fillStyle(0xe8b888, 0.45);
  g.fillEllipse(16, 11, 10, 6);
  g.generateTexture(COFFEE_PUDDLE_TEX, 40, 28);
  g.destroy();
}

/** Prefer GID41 waterCooler; fallback coffee then break waypoint. */
function findWaterCoolerTile(scene) {
  const layer = scene.furniture;
  if (layer?.getTileAt) {
    for (let ty = 0; ty < scene.map.height; ty++) {
      for (let tx = 0; tx < scene.map.width; tx++) {
        const tile = layer.getTileAt(tx, ty);
        if (tile?.index === WATER_COOLER_GID) return tileCenter(scene, tx, ty);
      }
    }
  }
  return findCoffeeTile(scene);
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

/** Soft dust puff for mascot_zoomies trail. */
function ensureZoomiesDustTexture(scene) {
  if (scene.textures.exists(ZOOMIES_DUST_TEX)) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xd8d0c4, 0.9);
  g.fillCircle(4, 4, 3.5);
  g.fillStyle(0xc0b8ac, 0.55);
  g.fillCircle(2, 5, 2);
  g.generateTexture(ZOOMIES_DUST_TEX, 8, 8);
  g.destroy();
}

/** Soft oval balloon (tinted at emit) + tiny string nub. */
function ensureBirthdayBalloonTexture(scene) {
  if (scene.textures.exists(BIRTHDAY_BALLOON_TEX)) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xffffff, 1);
  g.fillEllipse(8, 7, 12, 14);
  g.fillStyle(0xffffff, 0.55);
  g.fillEllipse(6, 5, 4, 5);
  g.fillStyle(0xe8e0d8, 0.9);
  g.fillRect(7, 14, 2, 4);
  g.generateTexture(BIRTHDAY_BALLOON_TEX, 16, 20);
  g.destroy();
}

/** Soft chalk speck for review_huddle (tinted amber at emit). */
function ensureReviewChalkTexture(scene) {
  if (scene.textures.exists(REVIEW_CHALK_TEX)) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xffffff, 0.95);
  g.fillCircle(3, 3, 2.5);
  g.fillStyle(0xffffff, 0.5);
  g.fillRect(1, 5, 5, 1.5);
  g.generateTexture(REVIEW_CHALK_TEX, 8, 8);
  g.destroy();
}

/** Soft rounded sticky note for sprint_retro (pastel tint at emit). */
function ensureRetroStickyTexture(scene) {
  if (scene.textures.exists(RETRO_STICKY_TEX)) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xffffff, 1);
  g.fillRoundedRect(1, 1, 10, 10, 1.5);
  g.fillStyle(0xffffff, 0.45);
  g.fillRect(3, 4, 6, 1.2);
  g.fillRect(3, 7, 4.5, 1.2);
  g.generateTexture(RETRO_STICKY_TEX, 12, 12);
  g.destroy();
}

/** Soft donut ring for donut_friday (pink/glaze tint at emit). */
function ensureDonutTexture(scene) {
  if (scene.textures.exists(DONUT_TEX)) return;
  const canvas = scene.textures.createCanvas(DONUT_TEX, 16, 16);
  const ctx = canvas.getContext();
  ctx.clearRect(0, 0, 16, 16);
  ctx.beginPath();
  ctx.arc(8, 8, 7, 0, Math.PI * 2);
  ctx.arc(8, 8, 2.8, 0, Math.PI * 2, true);
  ctx.fillStyle = "#ffffff";
  ctx.fill("evenodd");
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.ellipse(5.5, 5, 4, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  canvas.refresh();
}

/** Soft snack crumb fleck for midnight_snack. */
function ensureSnackCrumbTexture(scene) {
  if (scene.textures.exists(SNACK_CRUMB_TEX)) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xffffff, 1);
  g.fillCircle(4, 4, 3.5);
  g.fillStyle(0xffffff, 0.55);
  g.fillCircle(3, 3, 1.5);
  g.generateTexture(SNACK_CRUMB_TEX, 8, 8);
  g.destroy();
}

/**
 * Soft delivery bag silhouette for food_delivery (brown/orange tint at emit).
 * Shape distinct from parcel cardboard box (PARCEL_TEX).
 */
function ensureFoodBagTexture(scene) {
  if (scene.textures.exists(FOOD_BAG_TEX)) return;
  const g = scene.make.graphics({ add: false });
  // bag body — rounded pouch (not cardboard box)
  g.fillStyle(0xffffff, 1);
  g.fillRoundedRect(2, 5, 12, 10, 2);
  // folded top flap
  g.fillStyle(0xffffff, 0.95);
  g.fillTriangle(2, 6, 8, 1, 14, 6);
  // handle — two verticals + top bar (no strokeEllipse)
  g.fillStyle(0xffffff, 0.9);
  g.fillRect(5, 1, 1.5, 4);
  g.fillRect(9.5, 1, 1.5, 4);
  g.fillRect(5, 1, 6, 1.5);
  // soft highlight
  g.fillStyle(0xffffff, 0.4);
  g.fillRect(4, 8, 3, 5);
  g.generateTexture(FOOD_BAG_TEX, 16, 16);
  g.destroy();
}

/** Soft tea mug silhouette for tea_time (cream/amber tint at emit). */
function ensureTeaMugTexture(scene) {
  if (scene.textures.exists(TEA_MUG_TEX)) return;
  const g = scene.make.graphics({ add: false });
  // cup body
  g.fillStyle(0xffffff, 1);
  g.fillRoundedRect(3, 4, 9, 10, 1.5);
  // handle
  g.fillStyle(0xffffff, 0.95);
  g.fillRect(11, 7, 3, 1.5);
  g.fillRect(13, 7, 1.5, 4);
  g.fillRect(11, 10, 3, 1.5);
  // rim highlight
  g.fillStyle(0xffffff, 0.45);
  g.fillRect(4, 5, 7, 1.5);
  g.generateTexture(TEA_MUG_TEX, 16, 16);
  g.destroy();
}

/**
 * pair_programming gather tile: prefer walkable focusDesks near dualDesk,
 * then open desks. Furniture GID26 itself is often blocked for pathfind.
 * @returns {{x:number,y:number}} tile coords
 */
function findPairDeskTile(scene) {
  const focus = scene.waypoints?.focusDesks;
  if (Array.isArray(focus) && focus.length) {
    const spot = focus[Math.floor(Math.random() * focus.length)];
    return { x: spot.x, y: spot.y };
  }
  const desks = findDualDeskTiles(scene);
  if (desks.length) {
    const d = desks[Math.floor(Math.random() * desks.length)];
    // stand just south of furniture when possible
    return { x: d.tx, y: d.ty + 1 };
  }
  const open = scene.waypoints?.desks;
  if (Array.isArray(open) && open.length) {
    const spot = open[Math.floor(Math.random() * open.length)];
    return { x: spot.x, y: spot.y };
  }
  return { x: 3, y: 19 };
}

/** Nearest dualDesk furniture center for sparkle VFX (px), else gather tile center. */
function findPairSparklePx(scene, gatherTile) {
  const desks = findDualDeskTiles(scene);
  if (desks.length) {
    let best = desks[0];
    let bestD = Infinity;
    for (const d of desks) {
      const dist = Math.hypot(d.tx - gatherTile.x, d.ty - gatherTile.y);
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return { x: best.x, y: best.y };
  }
  return tileCenter(scene, gatherTile.x, gatherTile.y);
}

/** Soft cyan/teal monitor sparkle speck. */
function ensurePairSparkleTexture(scene) {
  if (scene.textures.exists(PAIR_SPARKLE_TEX)) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xffffff, 1);
  g.fillCircle(3, 3, 2.2);
  g.fillStyle(0xffffff, 0.55);
  g.fillCircle(5, 2, 1.2);
  g.generateTexture(PAIR_SPARKLE_TEX, 8, 8);
  g.destroy();
}

/**
 * merge_conflict gather tile: prefer open desks, then dualDesk focus,
 * then dualDesk south stand. Same pathfind-safe idea as pair_programming.
 * @returns {{x:number,y:number}} tile coords
 */
function findMergeConflictDeskTile(scene) {
  const open = scene.waypoints?.desks;
  if (Array.isArray(open) && open.length) {
    const spot = open[Math.floor(Math.random() * open.length)];
    return { x: spot.x, y: spot.y };
  }
  const opens = findOpenDeskTiles(scene);
  if (opens.length) {
    const d = opens[Math.floor(Math.random() * opens.length)];
    return { x: d.tx, y: d.ty + 1 };
  }
  return findPairDeskTile(scene);
}

/** Nearest open/dual desk furniture center for conflict spark (px). */
function findMergeConflictSparkPx(scene, gatherTile) {
  const opens = findOpenDeskTiles(scene);
  const duals = findDualDeskTiles(scene);
  const desks = opens.length ? opens : duals;
  if (desks.length) {
    let best = desks[0];
    let bestD = Infinity;
    for (const d of desks) {
      const dist = Math.hypot(d.tx - gatherTile.x, d.ty - gatherTile.y);
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return { x: best.x, y: best.y };
  }
  return tileCenter(scene, gatherTile.x, gatherTile.y);
}

/** Soft red/amber conflict spark speck. */
function ensureMergeSparkTexture(scene) {
  if (scene.textures.exists(MERGE_SPARK_TEX)) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xffffff, 1);
  g.fillCircle(3, 3, 2.4);
  g.fillStyle(0xffffff, 0.65);
  g.fillRect(2, 1, 2, 5);
  g.fillRect(1, 2, 5, 2);
  g.generateTexture(MERGE_SPARK_TEX, 8, 8);
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

/** Soft confetti rect — shared with taskCelebrate when present. */
function ensureDeployConfettiTexture(scene) {
  if (scene.textures.exists(DEPLOY_CONFETTI_TEX)) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xffffff, 1);
  g.fillRect(2, 1, 4, 3);
  g.generateTexture(DEPLOY_CONFETTI_TEX, 8, 8);
  g.destroy();
}

/**
 * Lobby center tile, else lounge/break, else entrance — deploy gather anchor.
 * @param {Phaser.Scene} scene
 */
function findDeployGatherAnchor(scene) {
  const lob = scene.waypoints?.lobby;
  if (
    lob &&
    Number.isFinite(lob.xMin) &&
    Number.isFinite(lob.xMax) &&
    Number.isFinite(lob.yMin) &&
    Number.isFinite(lob.yMax)
  ) {
    return {
      x: Math.floor((lob.xMin + lob.xMax) / 2),
      y: Math.floor((lob.yMin + lob.yMax) / 2),
    };
  }
  const lou = scene.waypoints?.lounge;
  if (Array.isArray(lou) && lou.length) {
    return { x: lou[0].x, y: lou[0].y };
  }
  const br = scene.waypoints?.break;
  if (br) return { x: br.x, y: br.y };
  const ent = scene.waypoints?.entrance || { x: 20, y: 27 };
  return { x: ent.x, y: ent.y };
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

/** idle + review + blocked — PR review huddle at War Room. */
function isReviewHuddleGatherable(agent) {
  if (!agent?.sprite) return false;
  const s = agent?.serverStatus;
  if (s === "running" || s === "chatting" || s === "offline" || s === "todo") {
    return false;
  }
  if (agent.live) {
    return s === "idle" || s === "review" || s === "blocked";
  }
  const kind = agent.getEffectKind?.();
  return (
    kind === "idle" ||
    agent.currentKind === "review" ||
    agent.currentKind === "blocked" ||
    agent.currentKind === "queue"
  );
}

/** idle / ready only — pair programming at dual desk (exactly 2). */
function isPairProgrammingGatherable(agent) {
  if (!agent?.sprite) return false;
  const s = agent?.serverStatus;
  if (
    s === "running" ||
    s === "blocked" ||
    s === "chatting" ||
    s === "offline" ||
    s === "review" ||
    s === "todo"
  ) {
    return false;
  }
  if (agent.live) {
    return s === "idle" || s === "ready";
  }
  const kind = agent.getEffectKind?.();
  return kind === "idle" || kind === "ready";
}

/** idle / ready — merge conflict huddle at open/dual desk (2–3). */
function isMergeConflictGatherable(agent) {
  return isPairProgrammingGatherable(agent);
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
    this.donutFridayGathered = 0;
    this.midnightSnackGathered = 0;
    this.foodDeliveryGathered = 0;
    this.teaTimeGathered = 0;
    this.allHandsGathered = 0;
    this.wifiOutageAffected = 0;
    this.codeFreezeAffected = 0;
    this.happyHourGathered = 0;
    this.deployCelebrateGathered = 0;
    this.birthdayBalloonsGathered = 0;
    this.reviewHuddleGathered = 0;
    this.sprintRetroGathered = 0;
    this.pairProgrammingGathered = 0;
    this.mergeConflictGathered = 0;
    this.hotfixScrambleGathered = 0;
    this.buildFailGathered = 0;
    this.mascotZoomiesActive = false;
    this.microwaveDingAt = 0;
    this.parcelActive = false;
    this.parcelNearBoss = false;
    this.paperAirplaneActive = false;
    this.phoneRingTarget = null;
    this.wetFloorActive = false;
    this.coffeeSpillGathered = 0;
    this.coffeeSpillActive = false;
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
    const presetName = this.scene.lightingPreset?.name;
    const night = presetName === "night";
    const eveningNight = presetName === "evening" || night;
    const now = new Date();
    const hour = now.getHours();
    const weekday = now.getDay() >= 1 && now.getDay() <= 5;
    const lunchWindow =
      hour >= LUNCH_HOUR_START && hour < LUNCH_HOUR_END;
    const microwaveWindow =
      weekday &&
      hour >= MICROWAVE_HOUR_START &&
      hour < MICROWAVE_HOUR_END;
    const waterWindow =
      weekday && hour >= WATER_HOUR_START && hour < WATER_HOUR_END;
    const pizzaWindow =
      weekday && hour >= PIZZA_HOUR_START && hour < PIZZA_HOUR_END;
    const happyWindow =
      weekday && hour >= HAPPY_HOUR_START && hour < HAPPY_HOUR_END;
    const deployWindow =
      weekday &&
      ((hour >= DEPLOY_AM_START && hour < DEPLOY_AM_END) ||
        (hour >= DEPLOY_PM_START && hour < DEPLOY_PM_END));
    const reviewWindow =
      weekday &&
      ((hour >= REVIEW_AM_START && hour < REVIEW_AM_END) ||
        (hour >= REVIEW_PM_START && hour < REVIEW_PM_END));
    const retroWindow =
      weekday && hour >= RETRO_HOUR_START && hour < RETRO_HOUR_END;
    const coffeeSpillWindow =
      hour >= COFFEE_SPILL_HOUR_START && hour < COFFEE_SPILL_HOUR_END;
    const pairWindow =
      weekday &&
      ((hour >= PAIR_AM_START && hour < PAIR_AM_END) ||
        (hour >= PAIR_PM_START && hour < PAIR_PM_END));
    const hotfixWindow =
      weekday &&
      ((hour >= HOTFIX_AM_START && hour < HOTFIX_AM_END) ||
        (hour >= HOTFIX_PM_START && hour < HOTFIX_PM_END));
    const freezeWindow =
      weekday && hour >= FREEZE_HOUR_START && hour < FREEZE_HOUR_END;
    const snackWindow =
      hour >= SNACK_HOUR_START && hour < SNACK_HOUR_END;
    const foodWindow =
      weekday &&
      ((hour >= FOOD_LUNCH_START && hour < FOOD_LUNCH_END) ||
        (hour >= FOOD_DINNER_START && hour < FOOD_DINNER_END));
    const teaWindow =
      weekday && hour >= TEA_HOUR_START && hour < TEA_HOUR_END;
    const friday = now.getDay() === 5;
    const raining = isRainingNow(this.scene);
    const pool = [];
    for (const k of RANDOM_KINDS) {
      if (k === "quiet_hours" && !night) continue;
      if (k === "midnight_snack" && !eveningNight) continue;
      let weight = 1;
      if (k === "lunch_rush" && lunchWindow) weight = LUNCH_WEIGHT;
      else if (k === "microwave_ding" && microwaveWindow)
        weight = MICROWAVE_WEIGHT;
      else if (k === "water_cooler" && waterWindow) weight = WATER_WEIGHT;
      else if (k === "pizza_party" && pizzaWindow) weight = PIZZA_WEIGHT;
      else if (k === "donut_friday")
        weight = friday ? DONUT_FRIDAY_WEIGHT : DONUT_WEEKDAY_WEIGHT;
      else if (k === "midnight_snack" && snackWindow) weight = SNACK_WEIGHT;
      else if (k === "food_delivery" && foodWindow) weight = FOOD_WEIGHT;
      else if (k === "tea_time" && teaWindow) weight = TEA_WEIGHT;
      else if (k === "happy_hour" && happyWindow)
        weight = friday ? HAPPY_FRIDAY_WEIGHT : HAPPY_WEIGHT;
      else if (k === "deploy_celebrate" && deployWindow) weight = DEPLOY_WEIGHT;
      else if (k === "review_huddle" && reviewWindow) weight = REVIEW_WEIGHT;
      else if (k === "sprint_retro" && retroWindow) weight = RETRO_WEIGHT;
      else if (k === "wet_floor" && raining) weight = WET_FLOOR_RAIN_WEIGHT;
      else if (k === "coffee_spill" && coffeeSpillWindow)
        weight = COFFEE_SPILL_WEIGHT;
      else if (k === "pair_programming" && pairWindow) weight = PAIR_WEIGHT;
      else if (k === "merge_conflict") weight = MERGE_WEIGHT;
      else if (k === "hotfix_scramble" && hotfixWindow) weight = HOTFIX_WEIGHT;
      else if (k === "build_fail" && deployWindow) weight = BUILD_FAIL_WEIGHT;
      else if (k === "code_freeze" && freezeWindow) weight = FREEZE_WEIGHT;
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
    else if (kind === "donut_friday") this.runDonutFriday();
    else if (kind === "midnight_snack") this.runMidnightSnack();
    else if (kind === "food_delivery") this.runFoodDelivery();
    else if (kind === "tea_time") this.runTeaTime();
    else if (kind === "paper_airplane") this.runPaperAirplane();
    else if (kind === "phone_ring") this.runPhoneRing();
    else if (kind === "wet_floor") this.runWetFloor();
    else if (kind === "all_hands") this.runAllHands();
    else if (kind === "wifi_outage") this.runWifiOutage();
    else if (kind === "happy_hour") this.runHappyHour();
    else if (kind === "microwave_ding") this.runMicrowaveDing();
    else if (kind === "deploy_celebrate") this.runDeployCelebrate();
    else if (kind === "mascot_zoomies") this.runMascotZoomies();
    else if (kind === "birthday_balloons") this.runBirthdayBalloons();
    else if (kind === "review_huddle") this.runReviewHuddle();
    else if (kind === "sprint_retro") this.runSprintRetro();
    else if (kind === "coffee_spill") this.runCoffeeSpill();
    else if (kind === "pair_programming") this.runPairProgramming();
    else if (kind === "merge_conflict") this.runMergeConflict();
    else if (kind === "hotfix_scramble") this.runHotfixScramble();
    else if (kind === "build_fail") this.runBuildFail();
    else if (kind === "code_freeze") this.runCodeFreeze();

    this.publish();
  }

  /**
   * Coffee spill: toast + soft ADD puddle 6–10s at coffee/kitchen +
   * idle 2–3 → ±1 ring. Skip if gather active. Optional hiss SFX.
   */
  runCoffeeSpill() {
    if (this.isGathering()) return;

    const holdMs =
      COFFEE_SPILL_MIN_MS +
      Math.floor(
        Math.random() * (COFFEE_SPILL_MAX_MS - COFFEE_SPILL_MIN_MS + 1),
      );
    this.markGathering(holdMs + 12000);
    this.showToast("커피 엎침!", 3000);
    this.playCoffeeSpillHiss();

    const pt = findCoffeeSpillTile(this.scene);
    const { x, y } = tileCenter(this.scene, pt.x, pt.y);
    this.spawnCoffeePuddle(x, y + 4, holdMs);
    void this.gatherIdleToMeeting(pt, "coffeeSpillGathered");
  }

  /** Soft coffee puddle on floor — ADD blend, alpha fade out. */
  spawnCoffeePuddle(x, y, lifeMs) {
    ensureCoffeePuddleTexture(this.scene);
    this.coffeeSpillActive = true;
    const puddle = this.scene.add.image(x, y, COFFEE_PUDDLE_TEX);
    puddle.setDepth(8);
    puddle.setScale(1.55);
    puddle.setAlpha(0.9);
    puddle.setBlendMode(Phaser.BlendModes.ADD);

    const life =
      lifeMs ??
      COFFEE_SPILL_MIN_MS +
        Math.floor(
          Math.random() * (COFFEE_SPILL_MAX_MS - COFFEE_SPILL_MIN_MS + 1),
        );
    const fadeMs = 900;

    const fade = this.scene.time.delayedCall(Math.max(0, life - fadeMs), () => {
      this.scene.tweens.add({
        targets: puddle,
        alpha: 0,
        duration: fadeMs,
        ease: "Sine.easeIn",
        onComplete: () => {
          puddle.destroy();
          this.coffeeSpillActive = false;
          this.publish();
        },
      });
    });

    this.track(() => {
      fade.remove(false);
      this.scene.tweens.killTweensOf(puddle);
      puddle.destroy();
      this.coffeeSpillActive = false;
    });
    this.publish();
  }

  /** Short hiss/drip — skip if muted/locked. */
  playCoffeeSpillHiss() {
    const audio = this.scene.officeAudio;
    if (!audio || audio.muted || !audio.unlocked) return;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const n = Math.floor(ctx.sampleRate * 0.18);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < n; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / n);
      }
      const noise = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(900, t0);
      filter.Q.setValueAtTime(0.8, t0);
      noise.buffer = buf;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.05, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(t0);
      noise.stop(t0 + 0.18);

      const drip = ctx.createOscillator();
      const dripGain = ctx.createGain();
      drip.type = "sine";
      drip.frequency.setValueAtTime(620, t0 + 0.05);
      drip.frequency.exponentialRampToValueAtTime(220, t0 + 0.14);
      dripGain.gain.setValueAtTime(0.0001, t0 + 0.05);
      dripGain.gain.exponentialRampToValueAtTime(0.035, t0 + 0.06);
      dripGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
      drip.connect(dripGain);
      dripGain.connect(ctx.destination);
      drip.start(t0 + 0.05);
      drip.stop(t0 + 0.17);
    } catch {
      /* autoplay / headless */
    }
  }

  /**
   * Microwave ding: toast + ding SFX + short steam at coffee (GID16) / break.
   * Skip if gather is active. No agent move.
   */
  runMicrowaveDing() {
    if (this.isGathering()) return;

    this.showToast("띵~ 데워졌다", 2600);
    this.playMicrowaveDing();
    const { x, y } = findCoffeeTile(this.scene);
    this.spawnSteamBurst(x, y - 8, MICROWAVE_STEAM_MS);
    this.microwaveDingAt = Date.now();
    this.publish();
  }

  /** Short microwave “ding” beep — skip if muted/locked. */
  playMicrowaveDing() {
    const audio = this.scene.officeAudio;
    if (!audio || audio.muted || !audio.unlocked) return;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1760, t0); // A6 — classic ding
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.055, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.3);
    } catch {
      /* autoplay / headless */
    }
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
    const { x, y } = findWaterCoolerTile(this.scene);
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
    const cooler = findWaterCoolerTile(this.scene);
    const tw = this.scene.map?.tileWidth ?? 32;
    const th = this.scene.map?.tileHeight ?? 32;
    const cx = Math.floor(cooler.x / tw);
    const cy = Math.floor(cooler.y / th);
    const lou = this.scene.waypoints?.lounge;
    const spots =
      Array.isArray(lou) && lou.length
        ? shuffleInPlace([...lou])
        : [
            { x: cx, y: cy },
            { x: cx - 1, y: cy + 1 },
            { x: cx + 1, y: cy },
            { x: cx + 2, y: cy - 1 },
            { x: cx - 2, y: cy },
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
   * Donut Friday: toast + soft pink/glaze donuts at lounge + idle 2–4 gather 6–10s.
   * Skip if another gather is active. Optional bite SFX (mute-safe).
   * No running/blocked (isStandupGatherable). Fri weight↑ in fireRandom.
   */
  runDonutFriday() {
    if (this.isGathering()) return;

    const holdMs =
      DONUT_HOLD_MIN_MS +
      Math.floor(Math.random() * (DONUT_HOLD_MAX_MS - DONUT_HOLD_MIN_MS + 1));
    this.markGathering(holdMs + 12000);
    const toast =
      DONUT_TOASTS[Math.floor(Math.random() * DONUT_TOASTS.length)];
    this.showToast(toast, 3200);
    this.playDonutBite();

    const br = this.scene.waypoints?.break || { x: 31, y: 4 };
    const { x, y } = tileCenter(this.scene, br.x, br.y);
    this.spawnDonutParticles(x, y - 10, Math.min(4500, holdMs));
    void this.gatherIdleToDonutFriday(holdMs);
  }

  /** Soft pink/glaze donut flecks at lounge. */
  spawnDonutParticles(x, y, ms = 4000) {
    ensureDonutTexture(this.scene);
    const emitter = this.scene.add.particles(x, y, DONUT_TEX, {
      speed: { min: 18, max: 62 },
      angle: { min: 0, max: 360 },
      gravityY: 28,
      scale: { start: 0.9, end: 0.3 },
      alpha: { start: 0.92, end: 0 },
      lifespan: { min: 700, max: 1300 },
      frequency: 70,
      quantity: 1,
      tint: DONUT_TINTS,
      rotate: { min: -40, max: 40 },
    });
    emitter.setDepth(12);
    const stop = this.scene.time.delayedCall(ms, () => {
      emitter.stop();
      this.scene.time.delayedCall(800, () => emitter.destroy());
    });
    this.track(() => {
      stop.remove(false);
      try {
        emitter.destroy();
      } catch {
        /* ignore */
      }
    });
  }

  /** Idle/break 2–4 → lounge spots; hold 6–10s → wander restore. */
  async gatherIdleToDonutFriday(holdMs) {
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
      DONUT_HOLD_MIN_MS +
        Math.floor(Math.random() * (DONUT_HOLD_MAX_MS - DONUT_HOLD_MIN_MS + 1));
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

    this.donutFridayGathered = gathered;
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

  /** Soft donut-bite blip — skip if muted/locked. */
  playDonutBite() {
    const audio = this.scene.officeAudio;
    if (!audio || audio.muted || !audio.unlocked) return;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(280, t0);
      osc.frequency.exponentialRampToValueAtTime(140, t0 + 0.08);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.035, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.12);
    } catch {
      /* autoplay / headless */
    }
  }

  /**
   * Midnight snack: toast + steam/crumb at fridge/vending + idle 2–4 gather 6–10s.
   * Skip if another gather is active. evening/night only in fireRandom (force OK).
   * Anchor: fridge(GID39)/vending(GID38) → lounge/break. Depth 11–12 (idle FX untouched).
   */
  runMidnightSnack() {
    if (this.isGathering()) return;

    const holdMs =
      SNACK_HOLD_MIN_MS +
      Math.floor(Math.random() * (SNACK_HOLD_MAX_MS - SNACK_HOLD_MIN_MS + 1));
    this.markGathering(holdMs + 12000);
    const toast =
      SNACK_TOASTS[Math.floor(Math.random() * SNACK_TOASTS.length)];
    this.showToast(toast, 3200);

    const pt = findMidnightSnackTile(this.scene);
    const { x, y } = tileCenter(this.scene, pt.x, pt.y);
    this.spawnSteamBurst(x, y - 8, Math.min(4500, holdMs));
    this.spawnSnackCrumbParticles(x, y - 6, Math.min(4500, holdMs));
    void this.gatherIdleToMidnightSnack(holdMs, pt);
  }

  /** Soft cream/brown crumb flecks at snack anchor. */
  spawnSnackCrumbParticles(x, y, ms = 4000) {
    ensureSnackCrumbTexture(this.scene);
    const emitter = this.scene.add.particles(x, y, SNACK_CRUMB_TEX, {
      speed: { min: 14, max: 48 },
      angle: { min: 0, max: 360 },
      gravityY: 36,
      scale: { start: 0.95, end: 0.25 },
      alpha: { start: 0.88, end: 0 },
      lifespan: { min: 600, max: 1100 },
      frequency: 80,
      quantity: 1,
      tint: SNACK_CRUMB_TINTS,
      rotate: { min: -50, max: 50 },
    });
    emitter.setDepth(12);
    const stop = this.scene.time.delayedCall(ms, () => {
      emitter.stop();
      this.scene.time.delayedCall(800, () => emitter.destroy());
    });
    this.track(() => {
      stop.remove(false);
      try {
        emitter.destroy();
      } catch {
        /* ignore */
      }
    });
  }

  /** Idle/break 2–4 → fridge/vending ±1 ring; hold 6–10s → wander restore. */
  async gatherIdleToMidnightSnack(holdMs, anchorTile) {
    const agents = this.scene.agents || [];
    const pool = shuffleInPlace(
      agents.filter((a) => isStandupGatherable(a)),
    );
    const want = Math.min(pool.length, 2 + Math.floor(Math.random() * 3));
    const candidates = pool.slice(0, want);
    const pt = anchorTile || findMidnightSnackTile(this.scene);
    const spots = meetingOffsets(pt);
    const hold =
      holdMs ??
      SNACK_HOLD_MIN_MS +
        Math.floor(Math.random() * (SNACK_HOLD_MAX_MS - SNACK_HOLD_MIN_MS + 1));
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

    this.midnightSnackGathered = gathered;
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
   * Food delivery: toast + soft brown/orange bags at lobby/entrance + idle 1–3 gather 5–8s.
   * Skip if another gather is active. Short ding respects mute/?sfx=0.
   * No running/blocked (isStandupGatherable). Weekday 11–13 · 17–20 weight↑.
   */
  runFoodDelivery() {
    if (this.isGathering()) return;

    const holdMs =
      FOOD_HOLD_MIN_MS +
      Math.floor(Math.random() * (FOOD_HOLD_MAX_MS - FOOD_HOLD_MIN_MS + 1));
    this.markGathering(holdMs + 12000);
    const toast =
      FOOD_TOASTS[Math.floor(Math.random() * FOOD_TOASTS.length)];
    this.showToast(toast, 3200);
    this.playFoodDing();

    const bagMs =
      FOOD_BAG_MIN_MS +
      Math.floor(Math.random() * (FOOD_BAG_MAX_MS - FOOD_BAG_MIN_MS + 1));
    const spot = findParcelSpot(this.scene);
    this.spawnFoodBagParticles(spot.x, spot.y - 8, bagMs);
    void this.gatherIdleToFoodDelivery(holdMs);
  }

  /** Soft brown/orange delivery-bag flecks near lobby entrance. */
  spawnFoodBagParticles(x, y, ms = 3000) {
    ensureFoodBagTexture(this.scene);
    const emitter = this.scene.add.particles(x, y, FOOD_BAG_TEX, {
      speed: { min: 16, max: 52 },
      angle: { min: 0, max: 360 },
      gravityY: 32,
      scale: { start: 0.95, end: 0.28 },
      alpha: { start: 0.9, end: 0 },
      lifespan: { min: 650, max: 1200 },
      frequency: 75,
      quantity: 1,
      tint: FOOD_BAG_TINTS,
      rotate: { min: -35, max: 35 },
    });
    emitter.setDepth(12);
    const stop = this.scene.time.delayedCall(ms, () => {
      emitter.stop();
      this.scene.time.delayedCall(800, () => emitter.destroy());
    });
    this.track(() => {
      stop.remove(false);
      try {
        emitter.destroy();
      } catch {
        /* ignore */
      }
    });
  }

  /** Idle 1–3 → entrance/lobby ring; hold 5–8s → wander restore. */
  async gatherIdleToFoodDelivery(holdMs) {
    const agents = this.scene.agents || [];
    const pool = shuffleInPlace(
      agents.filter((a) => isStandupGatherable(a)),
    );
    const want = Math.min(pool.length, 1 + Math.floor(Math.random() * 3));
    const candidates = pool.slice(0, want);
    const ent = this.scene.waypoints?.entrance || { x: 20, y: 27 };
    const anchor = findDeployGatherAnchor(this.scene);
    const spots = [
      ...meetingOffsets(ent),
      ...meetingOffsets(anchor),
      { x: ent.x, y: ent.y },
      { x: anchor.x, y: anchor.y },
    ];
    const hold =
      holdMs ??
      FOOD_HOLD_MIN_MS +
        Math.floor(Math.random() * (FOOD_HOLD_MAX_MS - FOOD_HOLD_MIN_MS + 1));
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

    this.foodDeliveryGathered = gathered;
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

  /** Short delivery ding — skip if muted/locked (?sfx=0). */
  playFoodDing() {
    const audio = this.scene.officeAudio;
    if (!audio || audio.muted || !audio.unlocked) return;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1320, t0);
      osc.frequency.exponentialRampToValueAtTime(990, t0 + 0.12);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.045, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.2);
    } catch {
      /* autoplay / headless */
    }
  }

  /**
   * Tea time: toast + soft steam/mug at lounge (coffee/cooler) + idle gather 5–8s.
   * Skip if another gather is active. Cup clink respects mute/lock.
   * Weekday 14–16 weight↑ in fireRandom.
   */
  runTeaTime() {
    if (this.isGathering()) return;

    const holdMs =
      TEA_HOLD_MIN_MS +
      Math.floor(Math.random() * (TEA_HOLD_MAX_MS - TEA_HOLD_MIN_MS + 1));
    this.markGathering(holdMs + 12000);
    const toast =
      TEA_TOASTS[Math.floor(Math.random() * TEA_TOASTS.length)];
    this.showToast(toast, 3200);
    this.playTeaClink();

    const coffee = findCoffeeTile(this.scene);
    this.spawnSteamBurst(coffee.x, coffee.y - 8, Math.min(4000, holdMs));
    this.spawnTeaMugParticles(coffee.x, coffee.y - 10, Math.min(4000, holdMs));
    void this.gatherIdleToTeaTime(holdMs);
  }

  /** Soft cream/amber mug flecks at lounge coffee. */
  spawnTeaMugParticles(x, y, ms = 4000) {
    ensureTeaMugTexture(this.scene);
    const emitter = this.scene.add.particles(x, y, TEA_MUG_TEX, {
      speed: { min: 12, max: 42 },
      angle: { min: 200, max: 340 },
      gravityY: 22,
      scale: { start: 0.85, end: 0.25 },
      alpha: { start: 0.9, end: 0 },
      lifespan: { min: 700, max: 1200 },
      frequency: 110,
      quantity: 1,
      tint: TEA_MUG_TINTS,
      rotate: { min: -25, max: 25 },
    });
    emitter.setDepth(12);
    const stop = this.scene.time.delayedCall(ms, () => {
      emitter.stop();
      this.scene.time.delayedCall(800, () => emitter.destroy());
    });
    this.track(() => {
      stop.remove(false);
      try {
        emitter.destroy();
      } catch {
        /* ignore */
      }
    });
  }

  /** Idle/break 2–4 → lounge spots; hold 5–8s → wander restore. */
  async gatherIdleToTeaTime(holdMs) {
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
      TEA_HOLD_MIN_MS +
        Math.floor(Math.random() * (TEA_HOLD_MAX_MS - TEA_HOLD_MIN_MS + 1));
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

    this.teaTimeGathered = gathered;
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

  /** Soft cup clink for tea_time — skip if muted/locked. */
  playTeaClink() {
    const audio = this.scene.officeAudio;
    if (!audio || audio.muted || !audio.unlocked) return;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const notes = [880, 1175]; // A5 → D6 — softer than happy clink
      for (let i = 0; i < notes.length; i++) {
        const start = t0 + i * 0.06;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(notes[i], start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.03, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.2);
      }
    } catch {
      /* autoplay / headless */
    }
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
            agent._wifiBackup == null &&
            agent._freezeBackup == null
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
            agent._waterBackup == null &&
            agent._freezeBackup == null
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
   * Code freeze: toast + cool-blue overlay 4–7s + idle bubbles on 1–2 agents.
   * No gather / no move of running·blocked. Skip if gather active.
   * Optional freeze chime respects mute/lock.
   */
  runCodeFreeze() {
    if (this.isGathering()) return;

    const toast =
      FREEZE_TOASTS[Math.floor(Math.random() * FREEZE_TOASTS.length)];
    this.showToast(toast, 3000);
    this.playFreezeChime();

    const duration =
      FREEZE_MIN_MS +
      Math.floor(Math.random() * (FREEZE_MAX_MS - FREEZE_MIN_MS + 1));

    const overlay = this.scene.lightingOverlay;
    const preset = this.scene.lightingPreset;
    const restoreOverlay = () => {
      const p = this.scene.lightingPreset;
      if (overlay && p) overlay.setFillStyle(p.color, p.alpha);
    };
    if (overlay && preset) {
      overlay.setFillStyle(FREEZE_BLUE, FREEZE_ALPHA);
    }

    const pool = shuffleInPlace(
      (this.scene.agents || []).filter((a) => isWifiEligible(a)),
    );
    const want = Math.min(
      pool.length,
      1 + Math.floor(Math.random() * 2), // 1–2
    );
    const picked = pool.slice(0, want);
    this.codeFreezeAffected = picked.length;
    this.publish();

    const restores = [];
    for (const agent of picked) {
      agent._freezeBackup = agent.statusText;
      agent.setStatus(
        FREEZE_LINES[Math.floor(Math.random() * FREEZE_LINES.length)],
      );
      restores.push(agent);
    }

    const restore = this.scene.time.delayedCall(duration, () => {
      restoreOverlay();
      for (const agent of restores) {
        if (agent._freezeBackup != null) {
          if (
            !agent._expandTimer &&
            agent._bossGreetBackup == null &&
            agent._coffeeBackup == null &&
            agent._workBackup == null &&
            agent._specBackup == null &&
            agent._stretchBackup == null &&
            agent._phoneBackup == null &&
            agent._waterBackup == null &&
            agent._wifiBackup == null
          ) {
            agent.setStatus(agent._freezeBackup);
          }
          agent._freezeBackup = null;
        }
      }
      this.codeFreezeAffected = 0;
      this.publish();
    });

    this.track(() => {
      restore.remove(false);
      restoreOverlay();
      for (const agent of restores) {
        if (agent._freezeBackup != null) {
          agent.setStatus(agent._freezeBackup);
          agent._freezeBackup = null;
        }
      }
      this.codeFreezeAffected = 0;
    });
  }

  /** Soft freeze chime (descending cool tone) — skip if muted/locked. */
  playFreezeChime() {
    const audio = this.scene.officeAudio;
    if (!audio || audio.muted || !audio.unlocked) return;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      // E5 → C5 — short “lock” drop
      const notes = [659, 523];
      for (let i = 0; i < notes.length; i++) {
        const start = t0 + i * 0.08;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(notes[i], start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.035, start + 0.015);
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

  /**
   * Deploy celebrate: toast + teal/cyan confetti + idle/break → lobby/lounge 5–8s.
   * Skip if another gather is active. Chime respects mute/lock.
   */
  runDeployCelebrate() {
    if (this.isGathering()) return;

    const holdMs =
      DEPLOY_HOLD_MIN_MS +
      Math.floor(Math.random() * (DEPLOY_HOLD_MAX_MS - DEPLOY_HOLD_MIN_MS + 1));
    this.markGathering(holdMs + 12000);
    const toast =
      DEPLOY_TOASTS[Math.floor(Math.random() * DEPLOY_TOASTS.length)];
    this.showToast(toast, 3200);
    this.playDeployChime();

    const anchor = findDeployGatherAnchor(this.scene);
    const { x, y } = tileCenter(this.scene, anchor.x, anchor.y);
    this.spawnDeployBurst(x, y - 10);

    void this.gatherIdleToDeployCelebrate(holdMs, anchor);
  }

  /** Soft teal/cyan ADD burst (taskCelebrate tone) + short spark ring. */
  spawnDeployBurst(x, y) {
    ensureDeployConfettiTexture(this.scene);
    const qty = 10 + Math.floor(Math.random() * 7);
    const confetti = this.scene.add.particles(x, y, DEPLOY_CONFETTI_TEX, {
      speed: { min: 28, max: 72 },
      angle: { min: 200, max: 340 },
      gravityY: 40,
      scale: { start: 0.85, end: 0.15 },
      alpha: { start: 0.9, end: 0 },
      lifespan: { min: 600, max: 900 },
      quantity: qty,
      frequency: -1,
      tint: DEPLOY_TINTS,
      blendMode: "ADD",
      rotate: { min: -40, max: 40 },
    });
    confetti.setDepth(12);
    confetti.explode(qty);

    const spark = this.scene.add.particles(x, y, "fx-spark", {
      speed: { min: 30, max: 90 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 0.95, end: 0 },
      lifespan: { min: 400, max: 750 },
      frequency: -1,
      quantity: 14,
      tint: DEPLOY_TINTS,
      blendMode: "ADD",
    });
    spark.setDepth(12);
    spark.explode(14);

    const clear = this.scene.time.delayedCall(1100, () => {
      try {
        confetti.destroy();
      } catch {
        /* ignore */
      }
      try {
        spark.destroy();
      } catch {
        /* ignore */
      }
    });
    this.track(() => {
      clear.remove(false);
      try {
        confetti.destroy();
      } catch {
        /* ignore */
      }
      try {
        spark.destroy();
      } catch {
        /* ignore */
      }
    });
  }

  /** Idle/break 2–4 → lobby/lounge spots; hold 5–8s → wander restore. */
  async gatherIdleToDeployCelebrate(holdMs, anchor) {
    const agents = this.scene.agents || [];
    const pool = shuffleInPlace(
      agents.filter((a) => isStandupGatherable(a)),
    );
    const want = Math.min(pool.length, 2 + Math.floor(Math.random() * 3));
    const candidates = pool.slice(0, want);
    const center = anchor || findDeployGatherAnchor(this.scene);
    const lou = this.scene.waypoints?.lounge;
    const spots =
      Array.isArray(lou) && lou.length
        ? shuffleInPlace([...lou])
        : [
            center,
            { x: center.x - 1, y: center.y + 1 },
            { x: center.x + 1, y: center.y },
            { x: center.x + 2, y: center.y - 1 },
            { x: center.x - 2, y: center.y },
          ];
    const hold =
      holdMs ??
      DEPLOY_HOLD_MIN_MS +
        Math.floor(Math.random() * (DEPLOY_HOLD_MAX_MS - DEPLOY_HOLD_MIN_MS + 1));
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

    this.deployCelebrateGathered = gathered;
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

  /** Short deploy success chime — skip if muted/locked. */
  playDeployChime() {
    const audio = this.scene.officeAudio;
    if (!audio || audio.muted || !audio.unlocked) return;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      // C6 → E6 → G6 — soft “ship” arpeggio
      const notes = [1047, 1319, 1568];
      for (let i = 0; i < notes.length; i++) {
        const start = t0 + i * 0.06;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(notes[i], start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.038, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.22);
      }
    } catch {
      /* autoplay / headless */
    }
  }


  /**
   * Mascot zoomies: toast + soft dust/speed-line trail + lounge dash 3–5 spots.
   * Skip if no mascot. Does not move agents/boss or mark gathering.
   */
  runMascotZoomies() {
    const mascot = this.scene.mascot;
    if (!mascot?.sprite || typeof mascot.startZoomies !== "function") {
      return;
    }

    const holdMs =
      ZOOMIES_HOLD_MIN_MS +
      Math.floor(
        Math.random() * (ZOOMIES_HOLD_MAX_MS - ZOOMIES_HOLD_MIN_MS + 1),
      );
    const toast =
      ZOOMIES_TOASTS[Math.floor(Math.random() * ZOOMIES_TOASTS.length)];
    this.showToast(toast, 2800);

    const spots = mascot.loungeSpots?.() || [];
    const br = this.scene.waypoints?.break || { x: 31, y: 4 };
    const pool =
      Array.isArray(spots) && spots.length
        ? [...spots]
        : [
            br,
            { x: br.x + 1, y: br.y + 1 },
            { x: br.x - 1, y: br.y + 2 },
            { x: br.x + 2, y: br.y },
            { x: br.x - 2, y: br.y + 1 },
          ];
    shuffleInPlace(pool);
    const n = 3 + Math.floor(Math.random() * 3); // 3–5
    const dests = [];
    for (let i = 0; i < n; i++) {
      dests.push(pool[i % pool.length]);
    }

    this.mascotZoomiesActive = true;
    mascot.startZoomies(holdMs, dests);
    this.spawnZoomiesTrail(mascot, holdMs);

    const clear = this.scene.time.delayedCall(holdMs + 80, () => {
      this.mascotZoomiesActive = false;
      this.publish();
    });
    this.track(() => {
      clear.remove(false);
      try {
        mascot.endZoomies?.();
      } catch {
        /* ignore */
      }
      this.mascotZoomiesActive = false;
    });
    this.publish();
  }

  /** Soft dust + speed-line particles that follow the zooming mascot. */
  spawnZoomiesTrail(mascot, ms) {
    ensureZoomiesDustTexture(this.scene);
    const dust = this.scene.add.particles(0, 0, ZOOMIES_DUST_TEX, {
      follow: mascot.sprite,
      followOffset: { x: 0, y: 6 },
      speed: { min: 8, max: 36 },
      angle: { min: 140, max: 220 },
      gravityY: -8,
      scale: { start: 0.55, end: 0.08 },
      alpha: { start: 0.38, end: 0 },
      lifespan: { min: 260, max: 480 },
      frequency: 42,
      quantity: 1,
      tint: [0xd8d0c4, 0xc8c0b4, 0xe8e0d4],
    });
    dust.setDepth(8);

    const lines = this.scene.add.particles(0, 0, "fx-spark", {
      follow: mascot.sprite,
      followOffset: { x: 0, y: 2 },
      speed: { min: 40, max: 90 },
      angle: { min: 160, max: 200 },
      scale: { start: 0.45, end: 0.05 },
      alpha: { start: 0.55, end: 0 },
      lifespan: { min: 180, max: 320 },
      frequency: 70,
      quantity: 1,
      tint: [0xffffff, 0xffe8c8, 0xffd0a0],
      blendMode: "ADD",
    });
    lines.setDepth(10);

    const stop = this.scene.time.delayedCall(ms, () => {
      dust.stop();
      lines.stop();
      this.scene.time.delayedCall(500, () => {
        dust.destroy();
        lines.destroy();
      });
    });
    this.track(() => {
      stop.remove(false);
      try {
        dust.destroy();
      } catch {
        /* ignore */
      }
      try {
        lines.destroy();
      } catch {
        /* ignore */
      }
    });
  }

  /**
   * Birthday balloons: toast + soft pastel balloons at lounge + idle 2–3 gather 6–10s.
   * Skip if another gather is active. Optional soft pop SFX (mute-safe).
   */
  runBirthdayBalloons() {
    if (this.isGathering()) return;

    const holdMs =
      BIRTHDAY_HOLD_MIN_MS +
      Math.floor(
        Math.random() * (BIRTHDAY_HOLD_MAX_MS - BIRTHDAY_HOLD_MIN_MS + 1),
      );
    this.markGathering(holdMs + 12000);
    const toast =
      BIRTHDAY_TOASTS[Math.floor(Math.random() * BIRTHDAY_TOASTS.length)];
    this.showToast(toast, 3200);
    this.playBirthdayPop();

    const br = this.scene.waypoints?.break || { x: 31, y: 4 };
    const { x, y } = tileCenter(this.scene, br.x, br.y);
    this.spawnBirthdayBalloons(x, y - 12, Math.min(5500, holdMs));
    void this.gatherIdleToBirthdayBalloons(holdMs);
  }

  /** Soft rising oval balloons — runtime texture, pastel tints. */
  spawnBirthdayBalloons(x, y, ms = 5000) {
    ensureBirthdayBalloonTexture(this.scene);
    const emitter = this.scene.add.particles(x, y, BIRTHDAY_BALLOON_TEX, {
      speedX: { min: -28, max: 28 },
      speedY: { min: -55, max: -22 },
      gravityY: -12,
      scale: { start: 0.95, end: 0.35 },
      alpha: { start: 0.92, end: 0 },
      lifespan: { min: 900, max: 1600 },
      frequency: 90,
      quantity: 1,
      tint: BIRTHDAY_TINTS,
      rotate: { min: -12, max: 12 },
    });
    emitter.setDepth(12);
    const stop = this.scene.time.delayedCall(ms, () => {
      emitter.stop();
      this.scene.time.delayedCall(900, () => emitter.destroy());
    });
    this.track(() => {
      stop.remove(false);
      try {
        emitter.destroy();
      } catch {
        /* ignore */
      }
    });
  }

  /** Idle/break 2–3 → lounge spots; hold 6–10s → wander restore. */
  async gatherIdleToBirthdayBalloons(holdMs) {
    const agents = this.scene.agents || [];
    const pool = shuffleInPlace(
      agents.filter((a) => isStandupGatherable(a)),
    );
    const want = Math.min(pool.length, 2 + Math.floor(Math.random() * 2));
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
      BIRTHDAY_HOLD_MIN_MS +
        Math.floor(
          Math.random() * (BIRTHDAY_HOLD_MAX_MS - BIRTHDAY_HOLD_MIN_MS + 1),
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

    this.birthdayBalloonsGathered = gathered;
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

  /** Soft balloon-pop blip — skip if muted/locked. */
  playBirthdayPop() {
    const audio = this.scene.officeAudio;
    if (!audio || audio.muted || !audio.unlocked) return;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(520, t0);
      osc.frequency.exponentialRampToValueAtTime(180, t0 + 0.12);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.045, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.16);
    } catch {
      /* autoplay / headless */
    }
  }

  /**
   * Review huddle: toast + soft amber chalk at War Room whiteboard +
   * idle/review/blocked 2–4 → meeting ring 6–10s. Skip if gathering.
   */
  runReviewHuddle() {
    if (this.isGathering()) return;

    const holdMs =
      REVIEW_HOLD_MIN_MS +
      Math.floor(
        Math.random() * (REVIEW_HOLD_MAX_MS - REVIEW_HOLD_MIN_MS + 1),
      );
    this.markGathering(holdMs + 12000);
    const toast =
      REVIEW_TOASTS[Math.floor(Math.random() * REVIEW_TOASTS.length)];
    this.showToast(toast, 3200);
    this.playReviewChalk();

    const meet = this.scene.waypoints?.meeting || { x: 17, y: 10 };
    const anchor = findWhiteboardAnchor(this.scene);
    const px = Number.isFinite(anchor?.x)
      ? anchor.x
      : tileCenter(this.scene, meet.x, meet.y).x;
    const py = Number.isFinite(anchor?.y)
      ? anchor.y
      : tileCenter(this.scene, meet.x, meet.y).y;
    this.spawnReviewChalk(px, py, Math.min(5000, holdMs));

    const glow = this.scene.add.circle(px, py + 8, 48, 0xe8b060, 0.32);
    glow.setDepth(7);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    const tween = this.scene.tweens.add({
      targets: glow,
      alpha: 0,
      scale: 1.35,
      duration: Math.min(3200, holdMs),
      ease: "Sine.easeOut",
      onComplete: () => glow.destroy(),
    });
    this.track(() => {
      tween.stop();
      glow.destroy();
    });

    void this.gatherIdleToReviewHuddle(holdMs);
  }

  /** Soft amber chalk flecks at whiteboard. */
  spawnReviewChalk(x, y, ms = 4000) {
    ensureReviewChalkTexture(this.scene);
    const emitter = this.scene.add.particles(x, y, REVIEW_CHALK_TEX, {
      speedX: { min: -22, max: 22 },
      speedY: { min: -18, max: 8 },
      gravityY: 18,
      scale: { start: 0.85, end: 0.2 },
      alpha: { start: 0.88, end: 0 },
      lifespan: { min: 700, max: 1300 },
      frequency: 70,
      quantity: 1,
      tint: REVIEW_TINTS,
      rotate: { min: -40, max: 40 },
    });
    emitter.setDepth(12);
    const stop = this.scene.time.delayedCall(ms, () => {
      emitter.stop();
      this.scene.time.delayedCall(800, () => emitter.destroy());
    });
    this.track(() => {
      stop.remove(false);
      try {
        emitter.destroy();
      } catch {
        /* ignore */
      }
    });
  }

  /** Idle/review/blocked 2–4 → War Room meeting ±1; hold 6–10s → restore. */
  async gatherIdleToReviewHuddle(holdMs) {
    const agents = this.scene.agents || [];
    const pool = shuffleInPlace(
      agents.filter((a) => isReviewHuddleGatherable(a)),
    );
    const want = Math.min(pool.length, 2 + Math.floor(Math.random() * 3));
    const candidates = pool.slice(0, want);
    const meet = this.scene.waypoints?.meeting || { x: 17, y: 10 };
    const spots = meetingOffsets(meet);
    const hold =
      holdMs ??
      REVIEW_HOLD_MIN_MS +
        Math.floor(
          Math.random() * (REVIEW_HOLD_MAX_MS - REVIEW_HOLD_MIN_MS + 1),
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

    this.reviewHuddleGathered = gathered;
    this.publish();

    if (!moved.length) return;

    const restore = this.scene.time.delayedCall(hold, () => {
      for (const agent of moved) {
        if (
          !isReviewHuddleGatherable(agent) &&
          !isStandupGatherable(agent)
        ) {
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

  /** Soft chalk tick — skip if muted/locked. */
  playReviewChalk() {
    const audio = this.scene.officeAudio;
    if (!audio || audio.muted || !audio.unlocked) return;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, t0);
      osc.frequency.exponentialRampToValueAtTime(420, t0 + 0.08);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.035, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.11);
    } catch {
      /* autoplay / headless */
    }
  }

  /**
   * Sprint retro: toast + pastel sticky notes at War Room whiteboard +
   * idle-only 2–4 → meeting ring 6–10s. Skip if gathering. No running/blocked.
   */
  runSprintRetro() {
    if (this.isGathering()) return;

    const holdMs =
      RETRO_HOLD_MIN_MS +
      Math.floor(
        Math.random() * (RETRO_HOLD_MAX_MS - RETRO_HOLD_MIN_MS + 1),
      );
    this.markGathering(holdMs + 12000);
    const toast =
      RETRO_TOASTS[Math.floor(Math.random() * RETRO_TOASTS.length)];
    this.showToast(toast, 3200);
    this.playRetroRustle();

    const meet = this.scene.waypoints?.meeting || { x: 17, y: 10 };
    const anchor = findWhiteboardAnchor(this.scene);
    const px = Number.isFinite(anchor?.x)
      ? anchor.x
      : tileCenter(this.scene, meet.x, meet.y).x;
    const py = Number.isFinite(anchor?.y)
      ? anchor.y
      : tileCenter(this.scene, meet.x, meet.y).y;
    this.spawnRetroStickies(px, py, Math.min(5000, holdMs));

    const glow = this.scene.add.circle(px, py + 8, 48, 0xfff3a0, 0.28);
    glow.setDepth(7);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    const tween = this.scene.tweens.add({
      targets: glow,
      alpha: 0,
      scale: 1.35,
      duration: Math.min(3200, holdMs),
      ease: "Sine.easeOut",
      onComplete: () => glow.destroy(),
    });
    this.track(() => {
      tween.stop();
      glow.destroy();
    });

    void this.gatherIdleToSprintRetro(holdMs);
  }

  /** Soft pastel sticky-note flecks at whiteboard. */
  spawnRetroStickies(x, y, ms = 4000) {
    ensureRetroStickyTexture(this.scene);
    const emitter = this.scene.add.particles(x, y, RETRO_STICKY_TEX, {
      speedX: { min: -26, max: 26 },
      speedY: { min: -28, max: 6 },
      gravityY: 22,
      scale: { start: 0.95, end: 0.35 },
      alpha: { start: 0.9, end: 0 },
      lifespan: { min: 800, max: 1400 },
      frequency: 75,
      quantity: 1,
      tint: RETRO_TINTS,
      rotate: { min: -25, max: 25 },
    });
    emitter.setDepth(12);
    const stop = this.scene.time.delayedCall(ms, () => {
      emitter.stop();
      this.scene.time.delayedCall(800, () => emitter.destroy());
    });
    this.track(() => {
      stop.remove(false);
      try {
        emitter.destroy();
      } catch {
        /* ignore */
      }
    });
  }

  /** Idle only 2–4 → War Room meeting ±1; hold 6–10s → restore. */
  async gatherIdleToSprintRetro(holdMs) {
    const agents = this.scene.agents || [];
    const pool = shuffleInPlace(
      agents.filter((a) => isStandupGatherable(a)),
    );
    const want = Math.min(pool.length, 2 + Math.floor(Math.random() * 3));
    const candidates = pool.slice(0, want);
    const meet = this.scene.waypoints?.meeting || { x: 17, y: 10 };
    const spots = meetingOffsets(meet);
    const hold =
      holdMs ??
      RETRO_HOLD_MIN_MS +
        Math.floor(
          Math.random() * (RETRO_HOLD_MAX_MS - RETRO_HOLD_MIN_MS + 1),
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

    this.sprintRetroGathered = gathered;
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

  /** Soft paper rustle — skip if muted/locked. */
  playRetroRustle() {
    const audio = this.scene.officeAudio;
    if (!audio || audio.muted || !audio.unlocked) return;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const bufferSize = Math.floor(ctx.sampleRate * 0.08);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        const env = 1 - i / bufferSize;
        data[i] = (Math.random() * 2 - 1) * 0.35 * env * env;
      }
      const src = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      src.buffer = buffer;
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(1800, t0);
      filter.Q.setValueAtTime(0.7, t0);
      gain.gain.setValueAtTime(0.028, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start(t0);
      src.stop(t0 + 0.1);
    } catch {
      /* autoplay / headless */
    }
  }


  /**
   * Pair programming: toast + cyan/teal monitor sparkle at dualDesk +
   * idle/ready exactly 2 -> desk +/-1 ring 6-10s. Skip if gathering.
   */
  runPairProgramming() {
    if (this.isGathering()) return;

    const holdMs =
      PAIR_HOLD_MIN_MS +
      Math.floor(
        Math.random() * (PAIR_HOLD_MAX_MS - PAIR_HOLD_MIN_MS + 1),
      );
    this.markGathering(holdMs + 12000);
    const toast =
      PAIR_TOASTS[Math.floor(Math.random() * PAIR_TOASTS.length)];
    this.showToast(toast, 3200);
    this.playPairClick();

    const desk = findPairDeskTile(this.scene);
    const sparkle = findPairSparklePx(this.scene, desk);
    const x = sparkle.x;
    const y = sparkle.y;
    this.spawnPairSparkle(x, y - 6, Math.min(5000, holdMs));

    const glow = this.scene.add.circle(x, y + 4, 40, 0x5ee0c8, 0.28);
    glow.setDepth(7);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    const tween = this.scene.tweens.add({
      targets: glow,
      alpha: 0,
      scale: 1.3,
      duration: Math.min(2800, holdMs),
      ease: "Sine.easeOut",
      onComplete: () => glow.destroy(),
    });
    this.track(() => {
      tween.stop();
      glow.destroy();
    });

    void this.gatherIdleToPairProgramming(holdMs, desk);
  }

  /** Soft cyan/teal flecks above dual monitors. */
  spawnPairSparkle(x, y, ms = 4000) {
    ensurePairSparkleTexture(this.scene);
    const emitter = this.scene.add.particles(x, y, PAIR_SPARKLE_TEX, {
      speedX: { min: -16, max: 16 },
      speedY: { min: -28, max: -6 },
      gravityY: 12,
      scale: { start: 0.9, end: 0.15 },
      alpha: { start: 0.9, end: 0 },
      lifespan: { min: 500, max: 1100 },
      frequency: 80,
      quantity: 1,
      tint: PAIR_TINTS,
    });
    emitter.setDepth(12);
    const stop = this.scene.time.delayedCall(ms, () => {
      emitter.stop();
      this.scene.time.delayedCall(700, () => emitter.destroy());
    });
    this.track(() => {
      stop.remove(false);
      try {
        emitter.destroy();
      } catch {
        /* ignore */
      }
    });
  }

  /** Idle/ready exactly 2 -> dualDesk +/-1; hold 6-10s -> restore. */
  async gatherIdleToPairProgramming(holdMs, deskTile) {
    const agents = this.scene.agents || [];
    const pool = shuffleInPlace(
      agents.filter((a) => isPairProgrammingGatherable(a)),
    );
    const want = Math.min(pool.length, 2);
    const candidates = pool.slice(0, want);
    const desk = deskTile || findPairDeskTile(this.scene);
    const focus = this.scene.waypoints?.focusDesks;
    const spots =
      Array.isArray(focus) && focus.length >= 2
        ? shuffleInPlace(focus.slice()).slice(0, 2)
        : meetingOffsets(desk);
    const hold =
      holdMs ??
      PAIR_HOLD_MIN_MS +
        Math.floor(
          Math.random() * (PAIR_HOLD_MAX_MS - PAIR_HOLD_MIN_MS + 1),
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

    this.pairProgrammingGathered = gathered;
    this.publish();

    if (!moved.length) return;

    const restore = this.scene.time.delayedCall(hold, () => {
      for (const agent of moved) {
        if (
          !isPairProgrammingGatherable(agent) &&
          !isStandupGatherable(agent)
        ) {
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

  /** Soft keyboard/click tick — skip if muted/locked. */
  playPairClick() {
    const audio = this.scene.officeAudio;
    if (!audio || audio.muted || !audio.unlocked) return;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(720, t0);
      osc.frequency.exponentialRampToValueAtTime(380, t0 + 0.06);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.028, t0 + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.09);
    } catch {
      /* autoplay / headless */
    }
  }

  /**
   * Merge conflict: toast + red/amber conflict spark at open/dual desk +
   * idle/ready 2–3 → desk +/-1 ring 4–7s. Skip if gathering.
   * Whoosh already fired in fire(); mute respected there / here.
   */
  runMergeConflict() {
    if (this.isGathering()) return;

    const holdMs =
      MERGE_HOLD_MIN_MS +
      Math.floor(
        Math.random() * (MERGE_HOLD_MAX_MS - MERGE_HOLD_MIN_MS + 1),
      );
    this.markGathering(holdMs + 12000);
    const toast =
      MERGE_TOASTS[Math.floor(Math.random() * MERGE_TOASTS.length)];
    this.showToast(toast, 3200);

    const desk = findMergeConflictDeskTile(this.scene);
    const spark = findMergeConflictSparkPx(this.scene, desk);
    const x = spark.x;
    const y = spark.y;
    const sparkMs =
      MERGE_SPARK_MIN_MS +
      Math.floor(
        Math.random() * (MERGE_SPARK_MAX_MS - MERGE_SPARK_MIN_MS + 1),
      );
    this.spawnMergeConflictSpark(x, y - 6, sparkMs);

    const glow = this.scene.add.circle(x, y + 4, 42, 0xff5544, 0.26);
    glow.setDepth(7);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    const tween = this.scene.tweens.add({
      targets: glow,
      alpha: 0,
      scale: 1.35,
      duration: Math.min(2400, holdMs),
      ease: "Sine.easeOut",
      onComplete: () => glow.destroy(),
    });
    this.track(() => {
      tween.stop();
      glow.destroy();
    });

    void this.gatherIdleToMergeConflict(holdMs, desk);
  }

  /** Soft red/amber conflict flecks above desk monitors. */
  spawnMergeConflictSpark(x, y, ms = 2000) {
    ensureMergeSparkTexture(this.scene);
    const emitter = this.scene.add.particles(x, y, MERGE_SPARK_TEX, {
      speedX: { min: -22, max: 22 },
      speedY: { min: -36, max: -8 },
      gravityY: 18,
      scale: { start: 1.0, end: 0.12 },
      alpha: { start: 0.95, end: 0 },
      lifespan: { min: 400, max: 900 },
      frequency: 55,
      quantity: 2,
      tint: MERGE_TINTS,
    });
    emitter.setDepth(12);
    const stop = this.scene.time.delayedCall(ms, () => {
      emitter.stop();
      this.scene.time.delayedCall(600, () => emitter.destroy());
    });
    this.track(() => {
      stop.remove(false);
      try {
        emitter.destroy();
      } catch {
        /* ignore */
      }
    });
  }

  /** Idle/ready 2–3 -> open/dual desk +/-1; hold 4–7s -> restore. */
  async gatherIdleToMergeConflict(holdMs, deskTile) {
    const agents = this.scene.agents || [];
    const pool = shuffleInPlace(
      agents.filter((a) => isMergeConflictGatherable(a)),
    );
    const want = Math.min(pool.length, 2 + Math.floor(Math.random() * 2));
    const candidates = pool.slice(0, want);
    const desk = deskTile || findMergeConflictDeskTile(this.scene);
    const openWp = this.scene.waypoints?.desks;
    const focus = this.scene.waypoints?.focusDesks;
    const spots =
      Array.isArray(openWp) && openWp.length >= 2
        ? shuffleInPlace(openWp.slice()).slice(0, 3)
        : Array.isArray(focus) && focus.length >= 2
          ? shuffleInPlace(focus.slice()).slice(0, 3)
          : meetingOffsets(desk);
    const hold =
      holdMs ??
      MERGE_HOLD_MIN_MS +
        Math.floor(
          Math.random() * (MERGE_HOLD_MAX_MS - MERGE_HOLD_MIN_MS + 1),
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

    this.mergeConflictGathered = gathered;
    this.publish();

    if (!moved.length) return;

    const restore = this.scene.time.delayedCall(hold, () => {
      for (const agent of moved) {
        if (
          !isMergeConflictGatherable(agent) &&
          !isStandupGatherable(agent)
        ) {
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
   * Hotfix scramble: toast + soft red/amber pulse 2–3s +
   * idle/break 2–4 → Open Desk ring; hold 5–8s. Skip if gather active.
   * Optional short alert tone (mute / ?sfx=0 skip).
   */
  runHotfixScramble() {
    if (this.isGathering()) return;

    const holdMs =
      HOTFIX_HOLD_MIN_MS +
      Math.floor(
        Math.random() * (HOTFIX_HOLD_MAX_MS - HOTFIX_HOLD_MIN_MS + 1),
      );
    this.markGathering(holdMs + 12000);
    const toast =
      HOTFIX_TOASTS[Math.floor(Math.random() * HOTFIX_TOASTS.length)];
    this.showToast(toast, 3200);
    this.playHotfixAlert();

    const pulseMs =
      HOTFIX_PULSE_MIN_MS +
      Math.floor(
        Math.random() * (HOTFIX_PULSE_MAX_MS - HOTFIX_PULSE_MIN_MS + 1),
      );
    const overlay = this.scene.lightingOverlay;
    const preset = this.scene.lightingPreset;
    if (overlay && preset) {
      const restoreOverlay = () => {
        const p = this.scene.lightingPreset;
        if (overlay && p) overlay.setFillStyle(p.color, p.alpha);
      };
      let on = true;
      let amber = false;
      overlay.setFillStyle(HOTFIX_PULSE_COLOR, HOTFIX_PULSE_ALPHA);
      const pulse = this.scene.time.addEvent({
        delay: 320,
        loop: true,
        callback: () => {
          on = !on;
          if (on) {
            amber = !amber;
            overlay.setFillStyle(
              amber ? HOTFIX_PULSE_AMBER : HOTFIX_PULSE_COLOR,
              HOTFIX_PULSE_ALPHA,
            );
          } else restoreOverlay();
        },
      });
      const clearPulse = this.scene.time.delayedCall(pulseMs, () => {
        pulse.remove(false);
        restoreOverlay();
      });
      this.track(() => {
        pulse.remove(false);
        clearPulse.remove(false);
        restoreOverlay();
      });
    }

    const desk = findMergeConflictDeskTile(this.scene);
    void this.gatherIdleToHotfixScramble(holdMs, desk);
  }

  /** Short urgent alert chirp — skip if muted/locked. */
  playHotfixAlert() {
    const audio = this.scene.officeAudio;
    if (!audio || audio.muted || !audio.unlocked) return;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      for (let i = 0; i < 2; i++) {
        const start = t0 + i * 0.11;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(990, start);
        osc.frequency.exponentialRampToValueAtTime(720, start + 0.08);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.038, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.1);
      }
    } catch {
      /* autoplay / headless */
    }
  }

  /** Idle/break 2–4 → Open Desk +/-1 ring; hold 5–8s → restore. */
  async gatherIdleToHotfixScramble(holdMs, deskTile) {
    const agents = this.scene.agents || [];
    const pool = shuffleInPlace(
      agents.filter((a) => isStandupGatherable(a)),
    );
    const want = Math.min(pool.length, 2 + Math.floor(Math.random() * 3));
    const candidates = pool.slice(0, want);
    const desk = deskTile || findMergeConflictDeskTile(this.scene);
    const openWp = this.scene.waypoints?.desks;
    const opens = findOpenDeskTiles(this.scene);
    const spots =
      Array.isArray(openWp) && openWp.length >= 2
        ? shuffleInPlace(openWp.slice()).slice(0, 4)
        : opens.length
          ? shuffleInPlace(
              opens.map((d) => ({ x: d.tx, y: d.ty + 1 })),
            ).slice(0, 4)
          : meetingOffsets(desk);
    const hold =
      holdMs ??
      HOTFIX_HOLD_MIN_MS +
        Math.floor(
          Math.random() * (HOTFIX_HOLD_MAX_MS - HOTFIX_HOLD_MIN_MS + 1),
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

    this.hotfixScrambleGathered = gathered;
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
   * Build fail: toast + soft rose/red overlay 4–7s +
   * idle 1–3 → Open Desk gather. Skip if gather active
   * (printer_jam / hotfix / etc.). Bubbles: CI panic lines.
   */
  runBuildFail() {
    if (this.isGathering()) return;

    const holdMs =
      BUILD_FAIL_MIN_MS +
      Math.floor(
        Math.random() * (BUILD_FAIL_MAX_MS - BUILD_FAIL_MIN_MS + 1),
      );
    this.markGathering(holdMs + 12000);
    const toast =
      BUILD_FAIL_TOASTS[Math.floor(Math.random() * BUILD_FAIL_TOASTS.length)];
    this.showToast(toast, 3200);

    const alpha =
      BUILD_FAIL_ALPHA_MIN +
      Math.random() * (BUILD_FAIL_ALPHA_MAX - BUILD_FAIL_ALPHA_MIN);
    const overlay = this.scene.lightingOverlay;
    const preset = this.scene.lightingPreset;
    const restoreOverlay = () => {
      const p = this.scene.lightingPreset;
      if (overlay && p) overlay.setFillStyle(p.color, p.alpha);
    };
    if (overlay && preset) {
      overlay.setFillStyle(BUILD_FAIL_ROSE, alpha);
      const clearOverlay = this.scene.time.delayedCall(holdMs, () => {
        restoreOverlay();
      });
      this.track(() => {
        clearOverlay.remove(false);
        restoreOverlay();
      });
    }

    const desk = findMergeConflictDeskTile(this.scene);
    void this.gatherIdleToBuildFail(holdMs, desk);
  }

  /** Idle 1–3 → Open Desk +/-1 ring; hold 4–7s → restore + clear bubbles. */
  async gatherIdleToBuildFail(holdMs, deskTile) {
    const agents = this.scene.agents || [];
    const pool = shuffleInPlace(
      agents.filter((a) => isStandupGatherable(a)),
    );
    const want = Math.min(pool.length, 1 + Math.floor(Math.random() * 3));
    const candidates = pool.slice(0, want);
    const desk = deskTile || findMergeConflictDeskTile(this.scene);
    const openWp = this.scene.waypoints?.desks;
    const opens = findOpenDeskTiles(this.scene);
    const spots =
      Array.isArray(openWp) && openWp.length >= 2
        ? shuffleInPlace(openWp.slice()).slice(0, 3)
        : opens.length
          ? shuffleInPlace(
              opens.map((d) => ({ x: d.tx, y: d.ty + 1 })),
            ).slice(0, 3)
          : meetingOffsets(desk);
    const hold =
      holdMs ??
      BUILD_FAIL_MIN_MS +
        Math.floor(
          Math.random() * (BUILD_FAIL_MAX_MS - BUILD_FAIL_MIN_MS + 1),
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
      agent._buildFailBackup = agent.statusText;
      agent.setStatus(
        BUILD_FAIL_LINES[Math.floor(Math.random() * BUILD_FAIL_LINES.length)],
      );
    }

    this.buildFailGathered = gathered;
    this.publish();

    if (!moved.length) return;

    const restore = this.scene.time.delayedCall(hold, () => {
      for (const agent of moved) {
        if (agent._buildFailBackup != null) {
          if (
            !agent._expandTimer &&
            agent._bossGreetBackup == null &&
            agent._coffeeBackup == null &&
            agent._workBackup == null &&
            agent._specBackup == null &&
            agent._stretchBackup == null &&
            agent._phoneBackup == null &&
            agent._waterBackup == null &&
            agent._wifiBackup == null &&
            agent._freezeBackup == null
          ) {
            agent.setStatus(agent._buildFailBackup);
          }
          agent._buildFailBackup = null;
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
      this.buildFailGathered = 0;
      this.publish();
    });
    this.track(() => {
      restore.remove(false);
      for (const agent of moved) {
        if (agent._buildFailBackup != null) {
          agent.setStatus(agent._buildFailBackup);
          agent._buildFailBackup = null;
        }
      }
      this.buildFailGathered = 0;
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
      donutFridayGathered: this.donutFridayGathered,
      midnightSnackGathered: this.midnightSnackGathered,
      foodDeliveryGathered: this.foodDeliveryGathered,
      teaTimeGathered: this.teaTimeGathered,
      allHandsGathered: this.allHandsGathered,
      wifiOutageAffected: this.wifiOutageAffected,
      codeFreezeAffected: this.codeFreezeAffected,
      happyHourGathered: this.happyHourGathered,
      deployCelebrateGathered: this.deployCelebrateGathered,
      birthdayBalloonsGathered: this.birthdayBalloonsGathered,
      reviewHuddleGathered: this.reviewHuddleGathered,
      sprintRetroGathered: this.sprintRetroGathered,
      pairProgrammingGathered: this.pairProgrammingGathered,
      mergeConflictGathered: this.mergeConflictGathered,
      hotfixScrambleGathered: this.hotfixScrambleGathered,
      buildFailGathered: this.buildFailGathered,
      mascotZoomiesActive: this.mascotZoomiesActive,
      microwaveDingAt: this.microwaveDingAt,
      parcelActive: this.parcelActive,
      parcelNearBoss: this.parcelNearBoss,
      paperAirplaneActive: this.paperAirplaneActive,
      phoneRingTarget: this.phoneRingTarget,
      wetFloorActive: this.wetFloorActive,
      coffeeSpillGathered: this.coffeeSpillGathered,
      coffeeSpillActive: this.coffeeSpillActive,
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
