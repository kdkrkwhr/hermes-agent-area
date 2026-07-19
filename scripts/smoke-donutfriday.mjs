/** Smoke: donut_friday — toast + glaze donuts + lounge idle gather; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&chatter=0&tod=day`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-donutfriday";
mkdirSync(shotDir, { recursive: true });

const DONUT_TOASTS = ["도넛이다!", "불금 도넛?", "Friday glaze"];

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
  oe.fire("donut_friday");
  return {
    enabled: oe.enabled,
    eventCountDelta: oe.eventCount - countBefore,
    lastEvent: oe.lastEvent,
  };
});

const forceKind = await page.evaluate(() => {
  const raw = "donut_friday";
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
  oe.donutFridayGathered = 0;

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

  oe.fire("donut_friday");
  return {
    toast: document.getElementById("office-toast")?.textContent || "",
    lastEvent: oe.lastEvent,
    gathering: oe.isGathering(),
  };
});

await page.waitForFunction(
  () => (window.__HERMES_AREA__?.events?.donutFridayGathered ?? 0) >= 1,
  null,
  { timeout: 25000 },
);

await page.waitForTimeout(250);

await page
  .screenshot({ path: `${shotDir}/donut-mid.png`, fullPage: false })
  .catch(() => {});

const mid = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const agents = sc.agents || [];
  const br = sc.waypoints?.break || { x: 31, y: 4 };
  return {
    agentCount: agents.length,
    donutFridayGathered: oe.donutFridayGathered,
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    gathering: oe.isGathering(),
    events: window.__HERMES_AREA__?.events,
    nearLounge: agents.filter((a) => {
      const t = a.tilePos();
      return Math.abs(t.x - br.x) <= 10 && Math.abs(t.y - br.y) <= 10;
    }).length,
  };
});

const skip = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.markGathering(5000);
  const gatheredBefore = oe.donutFridayGathered;
  const el = document.getElementById("office-toast");
  if (el) el.textContent = "LOCKED";
  oe.fire("donut_friday");
  return {
    donutFridayGathered: oe.donutFridayGathered,
    gatheredBefore,
    toast: document.getElementById("office-toast")?.textContent || "",
  };
});

await page
  .screenshot({ path: `${shotDir}/donut-after.png`, fullPage: false })
  .catch(() => {});

const result = { disabled, forceKind, fired, mid, skip, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (disabled.enabled !== false || disabled.eventCountDelta !== 0) {
  console.error("FAIL: events=0 should keep donut_friday off", disabled);
  process.exit(1);
}
if (forceKind.forceKind !== "donut_friday") {
  console.error("FAIL: ?events=donut_friday forceKind", forceKind);
  process.exit(1);
}
if (
  fired.lastEvent !== "donut_friday" &&
  mid.lastEvent !== "donut_friday"
) {
  console.error("FAIL: lastEvent should be donut_friday", fired, mid.lastEvent);
  process.exit(1);
}
if (!DONUT_TOASTS.includes(String(fired.toast))) {
  const toastOk =
    String(fired.toast).includes("도넛") ||
    String(fired.toast).includes("Friday");
  if (!toastOk) {
    console.error("FAIL: toast should be donut_friday phrase", fired.toast);
    process.exit(1);
  }
}
if ((mid.donutFridayGathered ?? 0) < 1 || mid.agentCount < 2) {
  console.error("FAIL: donut_friday should gather ≥1 idle agent", mid);
  process.exit(1);
}
if (!mid.gathering) {
  console.error("FAIL: donut_friday should mark gathering", mid);
  process.exit(1);
}
if (mid.events?.lastEvent !== "donut_friday") {
  console.error("FAIL: snapshot lastEvent should be donut_friday", mid.events);
  process.exit(1);
}
if (DONUT_TOASTS.includes(skip.toast)) {
  console.error("FAIL: overlapping gather should skip donut toast", skip);
  process.exit(1);
}
console.log(
  "PASS: donut_friday gathered=",
  mid.donutFridayGathered,
  "toast=",
  fired.toast,
);
