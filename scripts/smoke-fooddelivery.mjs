/** Smoke: food_delivery — toast + bag particles + entrance/lobby idle gather; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&chatter=0&tod=day`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-fooddelivery";
mkdirSync(shotDir, { recursive: true });

const FOOD_TOASTS = ["배달 왔다!", "점심 각?", "문 앞 봉투"];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(url, {
  waitUntil: "networkidle",
  timeout: 30000,
});

await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
  timeout: 15000,
});
await page.waitForFunction(
  () => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    return !!(sc?.officeEvents && (sc.agents?.length ?? 0) >= 2);
  },
  null,
  { timeout: 15000 },
);

const disabled = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const countBefore = oe.eventCount;
  oe.fire("food_delivery");
  return {
    enabled: oe.enabled,
    eventCountDelta: oe.eventCount - countBefore,
    lastEvent: oe.lastEvent,
  };
});

const forceKind = await page.evaluate(() => {
  const raw = "food_delivery";
  try {
    const u = new URL(location.href);
    u.searchParams.set("events", raw);
    const mode = (() => {
      const v = u.searchParams.get("events");
      if (v === "0" || v === "off" || v === "false") {
        return { enabled: false, forceKind: null };
      }
      return { enabled: true, forceKind: v };
    })();
    return { raw, ...mode };
  } catch (e) {
    return { raw, error: String(e) };
  }
});

const fired = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  sc.setLive?.(false);
  oe.enabled = true;
  if (oe._schedule) {
    oe._schedule.remove(false);
    oe._schedule = null;
  }
  oe._shipCooldownUntil = sc.time.now + 999999;
  oe._gatherUntil = 0;
  oe.foodDeliveryGathered = 0;

  if (!sc._emitterKinds) sc._emitterKinds = new Map();
  const agents = sc.agents || [];
  for (const a of agents) {
    a.live = false;
    a.serverStatus = null;
    a.serverData = null;
    a.currentKind = "break";
    a.path = [];
    a.pathIndex = 0;
    a.busy = false;
    a.idleUntil = sc.time.now + 999999;
    a.sprite.setPosition(7 * 32 + 16, 8 * 32 + 16);
    sc._emitterKinds.set(a.def.id, "idle");
    a.setStatus("대기");
  }

  oe.fire("food_delivery");
  const hasBagTex = !!sc.textures?.exists?.("fx-food-bag");
  return {
    toast: document.getElementById("office-toast")?.textContent || "",
    lastEvent: oe.lastEvent,
    gathering: oe.isGathering(),
    hasBagTex,
  };
});

await page.waitForFunction(
  () => (window.__HERMES_AREA__?.events?.foodDeliveryGathered ?? 0) >= 1,
  null,
  { timeout: 25000 },
);

await page.waitForTimeout(250);

await page
  .screenshot({ path: `${shotDir}/food-mid.png`, fullPage: false })
  .catch(() => {});

const mid = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const agents = sc.agents || [];
  const ent = sc.waypoints?.entrance || { x: 20, y: 27 };
  const lob = sc.waypoints?.lobby;
  const lobCx = lob ? Math.floor((lob.xMin + lob.xMax) / 2) : ent.x;
  const lobCy = lob ? Math.floor((lob.yMin + lob.yMax) / 2) : ent.y;
  return {
    agentCount: agents.length,
    foodDeliveryGathered: oe.foodDeliveryGathered,
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    gathering: oe.isGathering(),
    events: window.__HERMES_AREA__?.events,
    nearLobby: agents.filter((a) => {
      const t = a.tilePos();
      return (
        (Math.abs(t.x - ent.x) <= 10 && Math.abs(t.y - ent.y) <= 10) ||
        (Math.abs(t.x - lobCx) <= 10 && Math.abs(t.y - lobCy) <= 10)
      );
    }).length,
  };
});

const skip = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.markGathering(5000);
  const gatheredBefore = oe.foodDeliveryGathered;
  const el = document.getElementById("office-toast");
  if (el) el.textContent = "LOCKED";
  oe.fire("food_delivery");
  return {
    foodDeliveryGathered: oe.foodDeliveryGathered,
    gatheredBefore,
    toast: document.getElementById("office-toast")?.textContent || "",
  };
});

await page
  .screenshot({ path: `${shotDir}/food-after.png`, fullPage: false })
  .catch(() => {});

const result = { disabled, forceKind, fired, mid, skip, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (disabled.enabled !== false || disabled.eventCountDelta !== 0) {
  console.error("FAIL: events=0 should keep food_delivery off", disabled);
  process.exit(1);
}
if (forceKind.forceKind !== "food_delivery") {
  console.error("FAIL: ?events=food_delivery forceKind", forceKind);
  process.exit(1);
}
if (
  fired.lastEvent !== "food_delivery" &&
  mid.lastEvent !== "food_delivery"
) {
  console.error(
    "FAIL: lastEvent should be food_delivery",
    fired,
    mid.lastEvent,
  );
  process.exit(1);
}
if (!FOOD_TOASTS.includes(String(fired.toast))) {
  const toastOk =
    String(fired.toast).includes("배달") ||
    String(fired.toast).includes("점심") ||
    String(fired.toast).includes("봉투");
  if (!toastOk) {
    console.error("FAIL: toast should be food_delivery phrase", fired.toast);
    process.exit(1);
  }
}
if (!fired.hasBagTex) {
  console.error("FAIL: fx-food-bag texture should exist after fire", fired);
  process.exit(1);
}
if ((mid.foodDeliveryGathered ?? 0) < 1 || mid.agentCount < 2) {
  console.error("FAIL: food_delivery should gather ≥1 idle agent", mid);
  process.exit(1);
}
if (!mid.gathering) {
  console.error("FAIL: food_delivery should mark gathering", mid);
  process.exit(1);
}
if (mid.events?.lastEvent !== "food_delivery") {
  console.error(
    "FAIL: snapshot lastEvent should be food_delivery",
    mid.events,
  );
  process.exit(1);
}
if ((mid.events?.foodDeliveryGathered ?? 0) < 1) {
  console.error("FAIL: snapshot foodDeliveryGathered missing", mid.events);
  process.exit(1);
}
if (FOOD_TOASTS.includes(skip.toast)) {
  console.error("FAIL: overlapping gather should skip food toast", skip);
  process.exit(1);
}
console.log(
  "PASS: food_delivery gathered=",
  mid.foodDeliveryGathered,
  "toast=",
  fired.toast,
  "nearLobby=",
  mid.nearLobby,
);
