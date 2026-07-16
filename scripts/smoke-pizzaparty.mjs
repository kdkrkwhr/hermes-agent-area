/** Smoke: pizza_party — toast + lounge gather + steam/confetti; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&chatter=0`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-pizzaparty";
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
  oe.pizzaPartyGathered = 0;

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

  oe.fire("pizza_party");
  return {
    toast: document.getElementById("office-toast")?.textContent || "",
    lastEvent: oe.lastEvent,
  };
});

await page.waitForFunction(
  () => (window.__HERMES_AREA__?.events?.pizzaPartyGathered ?? 0) >= 1,
  null,
  { timeout: 25000 },
);

await page.waitForTimeout(250);

await page
  .screenshot({ path: `${shotDir}/pizza-mid.png`, fullPage: false })
  .catch(() => {});

const mid = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const agents = sc.agents || [];
  const br = sc.waypoints?.break || { x: 31, y: 4 };
  return {
    agentCount: agents.length,
    pizzaPartyGathered: oe.pizzaPartyGathered,
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
  const gatheredBefore = oe.pizzaPartyGathered;
  const el = document.getElementById("office-toast");
  if (el) el.textContent = "LOCKED";
  oe.fire("pizza_party");
  return {
    pizzaPartyGathered: oe.pizzaPartyGathered,
    gatheredBefore,
    toast: document.getElementById("office-toast")?.textContent || "",
  };
});

await page
  .screenshot({ path: `${shotDir}/pizza-after.png`, fullPage: false })
  .catch(() => {});

const result = { fired, mid, skip, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (fired.lastEvent !== "pizza_party" && mid.lastEvent !== "pizza_party") {
  console.error("FAIL: lastEvent should be pizza_party", fired, mid.lastEvent);
  process.exit(1);
}
if (!String(fired.toast).includes("피자")) {
  console.error("FAIL: toast should say 피자 왔어요", fired.toast);
  process.exit(1);
}
if ((mid.pizzaPartyGathered ?? 0) < 1 || mid.agentCount < 2) {
  console.error("FAIL: pizza_party should gather ≥1 idle agent", mid);
  process.exit(1);
}
if (!mid.gathering) {
  console.error("FAIL: pizza_party should mark gathering", mid);
  process.exit(1);
}
if (skip.toast === "피자 왔어요") {
  console.error("FAIL: overlapping gather should skip pizza toast", skip);
  process.exit(1);
}
console.log(
  "PASS: pizza_party gathered=",
  mid.pizzaPartyGathered,
  "toast=",
  fired.toast,
);
