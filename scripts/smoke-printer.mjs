import { chromium } from "playwright";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0`;

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

await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.enabled = true;
  if (oe._schedule) {
    oe._schedule.remove(false);
    oe._schedule = null;
  }
  oe._shipCooldownUntil = sc.time.now + 999999;

  if (!sc._emitterKinds) sc._emitterKinds = new Map();
  const agents = sc.agents || [];
  for (const a of agents) {
    a.live = false;
    a.serverStatus = null;
    a.currentKind = "break";
    a.path = [];
    a.pathIndex = 0;
    a.busy = false;
    a.idleUntil = sc.time.now + 999999;
    a.sprite.setPosition(7 * 32 + 16, 8 * 32 + 16);
    sc._emitterKinds.set(a.def.id, "idle");
  }

  oe.fire("printer_jam");
});

await page.waitForFunction(
  () => (window.__HERMES_AREA__?.events?.printerGathered ?? 0) >= 1,
  null,
  { timeout: 20000 },
);

const result = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const agents = sc.agents || [];
  const ent = sc.waypoints?.entrance || { x: 20, y: 27 };
  const toast = document.getElementById("office-toast")?.textContent || "";
  return {
    agentCount: agents.length,
    printerGathered: oe.printerGathered,
    lastEvent: oe.lastEvent,
    toast,
    events: window.__HERMES_AREA__?.events,
    nearPrinter: agents.filter((a) => {
      const t = a.tilePos();
      return Math.abs(t.x - ent.x) <= 12 && Math.abs(t.y - ent.y) <= 12;
    }).length,
  };
});

console.log(JSON.stringify({ result, errors }, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (result.lastEvent !== "printer_jam") {
  console.error("FAIL: lastEvent should be printer_jam, got", result.lastEvent);
  process.exit(1);
}
if ((result.printerGathered ?? 0) < 1 || result.agentCount < 2) {
  console.error("FAIL: printer_jam should gather ≥1 idle agent");
  process.exit(1);
}
if (!String(result.toast).includes("프린터")) {
  console.error("FAIL: toast should mention 프린터, got:", result.toast);
  process.exit(1);
}
console.log("PASS: printerGathered=", result.printerGathered, "toast=", result.toast);
