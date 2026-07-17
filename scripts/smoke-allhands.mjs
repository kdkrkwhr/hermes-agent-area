/** Smoke: all_hands — toast + meeting gather 8–12s; skip if gathering; events=0 off. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&chatter=0`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-allhands";
mkdirSync(shotDir, { recursive: true });

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
  // ?events=0 → enabled false; fire should no-op
  const countBefore = oe.eventCount;
  oe.fire("all_hands");
  return {
    enabled: oe.enabled,
    eventCountDelta: oe.eventCount - countBefore,
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
  };
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
  oe.allHandsGathered = 0;

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

  oe.fire("all_hands");
  return {
    toast: document.getElementById("office-toast")?.textContent || "",
    lastEvent: oe.lastEvent,
    gathering: oe.isGathering(),
  };
});

await page.waitForFunction(
  () => (window.__HERMES_AREA__?.events?.allHandsGathered ?? 0) >= 1,
  null,
  { timeout: 25000 },
);

await page.waitForTimeout(250);

await page
  .screenshot({ path: `${shotDir}/allhands-mid.png`, fullPage: false })
  .catch(() => {});

const mid = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const agents = sc.agents || [];
  const meet = sc.waypoints?.meeting || { x: 17, y: 10 };
  return {
    agentCount: agents.length,
    allHandsGathered: oe.allHandsGathered,
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    gathering: oe.isGathering(),
    events: window.__HERMES_AREA__?.events,
    nearMeeting: agents.filter((a) => {
      const t = a.tilePos();
      return Math.abs(t.x - meet.x) <= 12 && Math.abs(t.y - meet.y) <= 12;
    }).length,
  };
});

const skip = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.markGathering(5000);
  const gatheredBefore = oe.allHandsGathered;
  const el = document.getElementById("office-toast");
  if (el) el.textContent = "LOCKED";
  oe.fire("all_hands");
  oe.fire("pizza_party");
  oe.fire("fire_drill");
  return {
    allHandsGathered: oe.allHandsGathered,
    gatheredBefore,
    toast: document.getElementById("office-toast")?.textContent || "",
  };
});

await page
  .screenshot({ path: `${shotDir}/allhands-after.png`, fullPage: false })
  .catch(() => {});

const result = { disabled, fired, mid, skip, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (disabled.enabled !== false || disabled.eventCountDelta !== 0) {
  console.error("FAIL: events=0 should keep all_hands off", disabled);
  process.exit(1);
}
if (fired.lastEvent !== "all_hands" && mid.lastEvent !== "all_hands") {
  console.error("FAIL: lastEvent should be all_hands", fired, mid.lastEvent);
  process.exit(1);
}
if (!String(fired.toast).includes("올핸즈")) {
  console.error("FAIL: toast should say 올핸즈!", fired.toast);
  process.exit(1);
}
if ((mid.allHandsGathered ?? 0) < 1 || mid.agentCount < 2) {
  console.error("FAIL: all_hands should gather ≥1 idle agent", mid);
  process.exit(1);
}
if ((mid.nearMeeting ?? 0) < 1) {
  console.error("FAIL: agents should gather near meeting", mid);
  process.exit(1);
}
if (!mid.gathering) {
  console.error("FAIL: all_hands should mark gathering", mid);
  process.exit(1);
}
if (skip.toast === "올핸즈!" || skip.toast === "피자 왔어요") {
  console.error("FAIL: overlapping gather should skip other gathers", skip);
  process.exit(1);
}
console.log(
  "PASS: all_hands gathered=",
  mid.allHandsGathered,
  "nearMeeting=",
  mid.nearMeeting,
  "toast=",
  fired.toast,
);
