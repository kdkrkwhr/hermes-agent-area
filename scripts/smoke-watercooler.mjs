/** Smoke: water_cooler — toast + lounge gather + chat bubbles; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&chatter=0`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-watercooler";
mkdirSync(shotDir, { recursive: true });

const LINES = ["오늘 blocked 많네", "커피?", "standup 언제?"];

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
  oe.waterCoolerGathered = 0;

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
    a._waterBackup = null;
    a._stretchBackup = null;
    a._chatterBackup = null;
    a.sprite.setPosition(7 * 32 + 16, 8 * 32 + 16);
    sc._emitterKinds.set(a.def.id, "idle");
    a.setStatus("대기");
  }

  oe.fire("water_cooler");
  return {
    toast: document.getElementById("office-toast")?.textContent || "",
    lastEvent: oe.lastEvent,
  };
});

await page.waitForFunction(
  () => (window.__HERMES_AREA__?.events?.waterCoolerGathered ?? 0) >= 1,
  null,
  { timeout: 25000 },
);

await page.waitForTimeout(250);

await page
  .screenshot({ path: `${shotDir}/water-mid.png`, fullPage: false })
  .catch(() => {});

const mid = await page.evaluate((lines) => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const agents = sc.agents || [];
  const br = sc.waypoints?.break || { x: 31, y: 4 };
  return {
    agentCount: agents.length,
    waterCoolerGathered: oe.waterCoolerGathered,
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    gathering: oe.isGathering(),
    events: window.__HERMES_AREA__?.events,
    chatBubbles: agents.filter((a) => lines.includes(a.statusText)).length,
    withWaterBackup: agents.filter((a) => a._waterBackup != null).length,
    statuses: agents.map((a) => a.statusText),
    nearLounge: agents.filter((a) => {
      const t = a.tilePos();
      return Math.abs(t.x - br.x) <= 10 && Math.abs(t.y - br.y) <= 10;
    }).length,
  };
}, LINES);

await page.waitForTimeout(6500);

const after = await page.evaluate((lines) => {
  const agents =
    window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene")?.agents || [];
  return {
    stillChatting: agents.filter((a) => lines.includes(a.statusText)).length,
    hasWaterBackup: agents.some((a) => a._waterBackup != null),
  };
}, LINES);

const skip = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.markGathering(5000);
  const gatheredBefore = oe.waterCoolerGathered;
  const el = document.getElementById("office-toast");
  if (el) el.textContent = "LOCKED";
  oe.fire("water_cooler");
  return {
    waterCoolerGathered: oe.waterCoolerGathered,
    gatheredBefore,
    toast: document.getElementById("office-toast")?.textContent || "",
  };
});

await page
  .screenshot({ path: `${shotDir}/water-after.png`, fullPage: false })
  .catch(() => {});

const result = { fired, mid, after, skip, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (fired.lastEvent !== "water_cooler" && mid.lastEvent !== "water_cooler") {
  console.error("FAIL: lastEvent should be water_cooler", fired, mid.lastEvent);
  process.exit(1);
}
if (!String(fired.toast).includes("정수기")) {
  console.error("FAIL: toast should say 정수기 앞 잡담 중", fired.toast);
  process.exit(1);
}
if ((mid.waterCoolerGathered ?? 0) < 1 || mid.agentCount < 2) {
  console.error("FAIL: water_cooler should gather ≥1 idle agent", mid);
  process.exit(1);
}
if ((mid.chatBubbles ?? 0) < 1 && (mid.withWaterBackup ?? 0) < 1) {
  console.error("FAIL: expected chat bubbles", mid);
  process.exit(1);
}
if (!mid.gathering) {
  console.error("FAIL: water_cooler should mark gathering", mid);
  process.exit(1);
}
if (after.hasWaterBackup) {
  console.error("FAIL: _waterBackup should clear after chat", after);
  process.exit(1);
}
if (skip.toast === "정수기 앞 잡담 중") {
  console.error("FAIL: overlapping gather should skip water toast", skip);
  process.exit(1);
}
console.log(
  "PASS: water_cooler gathered=",
  mid.waterCoolerGathered,
  "bubbles=",
  mid.chatBubbles,
  "toast=",
  fired.toast,
);
