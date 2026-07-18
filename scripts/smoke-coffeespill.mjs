/** Smoke: coffee_spill — toast + puddle + ±1 gather; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&chatter=0&tod=day`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-coffeespill";
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
  oe.coffeeSpillGathered = 0;
  oe.coffeeSpillActive = false;

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

  oe.fire("coffee_spill");
  return {
    toast: document.getElementById("office-toast")?.textContent || "",
    lastEvent: oe.lastEvent,
    hasPuddleTex: sc.textures.exists("fx-coffee-puddle"),
    coffeeSpillActive: oe.coffeeSpillActive,
    events: window.__HERMES_AREA__?.events,
  };
});

await page.waitForFunction(
  () => (window.__HERMES_AREA__?.events?.coffeeSpillGathered ?? 0) >= 1,
  null,
  { timeout: 25000 },
);

await page.waitForTimeout(250);

await page
  .screenshot({ path: `${shotDir}/spill-mid.png`, fullPage: false })
  .catch(() => {});

const mid = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const agents = sc.agents || [];
  return {
    agentCount: agents.length,
    coffeeSpillGathered: oe.coffeeSpillGathered,
    coffeeSpillActive: oe.coffeeSpillActive,
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    gathering: oe.isGathering(),
    hasPuddleTex: sc.textures.exists("fx-coffee-puddle"),
    events: window.__HERMES_AREA__?.events,
  };
});

const skip = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.markGathering(5000);
  const gatheredBefore = oe.coffeeSpillGathered;
  const el = document.getElementById("office-toast");
  if (el) el.textContent = "LOCKED";
  oe.fire("coffee_spill");
  return {
    coffeeSpillGathered: oe.coffeeSpillGathered,
    gatheredBefore,
    toast: document.getElementById("office-toast")?.textContent || "",
  };
});

const forceKind = await page.evaluate(() => {
  const raw = "coffee_spill";
  const kinds = [
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
  ];
  return { includes: kinds.includes(raw), raw };
});

await page
  .screenshot({ path: `${shotDir}/spill-after.png`, fullPage: false })
  .catch(() => {});

const result = { fired, mid, skip, forceKind, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (fired.lastEvent !== "coffee_spill" && mid.lastEvent !== "coffee_spill") {
  console.error("FAIL: lastEvent should be coffee_spill", fired, mid.lastEvent);
  process.exit(1);
}
if (!String(fired.toast).includes("커피 엎침")) {
  console.error("FAIL: toast should be 커피 엎침!", fired.toast);
  process.exit(1);
}
if (!fired.hasPuddleTex && !mid.hasPuddleTex) {
  console.error("FAIL: fx-coffee-puddle texture should exist", fired, mid);
  process.exit(1);
}
if (!fired.coffeeSpillActive && !mid.coffeeSpillActive) {
  console.error("FAIL: coffeeSpillActive should be true during puddle", fired, mid);
  process.exit(1);
}
if ((mid.coffeeSpillGathered ?? 0) < 1 || mid.agentCount < 2) {
  console.error("FAIL: coffee_spill should gather ≥1 idle agent", mid);
  process.exit(1);
}
if (!mid.gathering) {
  console.error("FAIL: coffee_spill should mark gathering", mid);
  process.exit(1);
}
if (mid.events?.lastEvent !== "coffee_spill") {
  console.error("FAIL: snapshot lastEvent should be coffee_spill", mid.events);
  process.exit(1);
}
if (String(skip.toast).includes("커피 엎침")) {
  console.error("FAIL: overlapping gather should skip coffee toast", skip);
  process.exit(1);
}
if (!forceKind.includes) {
  console.error("FAIL: coffee_spill missing from RANDOM_KINDS", forceKind);
  process.exit(1);
}
console.log(
  "PASS: coffee_spill gathered=",
  mid.coffeeSpillGathered,
  "toast=",
  fired.toast,
);
