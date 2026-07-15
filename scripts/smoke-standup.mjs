import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

// events=0 so random fire doesn't race the test
await page.goto("http://127.0.0.1:5173/?events=0", {
  waitUntil: "networkidle",
  timeout: 30000,
});

await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
  timeout: 15000,
});

const result = await page.evaluate(async () => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.enabled = true;
  if (oe._schedule) {
    oe._schedule.remove(false);
    oe._schedule = null;
  }

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
  }

  oe.fire("standup");
  await new Promise((r) => setTimeout(r, 1000));

  const meet = sc.waypoints?.meeting || { x: 18, y: 9 };
  return {
    agentCount: agents.length,
    standupGathered: oe.standupGathered,
    events: window.__HERMES_AREA__?.events,
    paths: agents.map((a) => a.path?.length || 0),
    near: agents.filter((a) => {
      const t = a.tilePos();
      return Math.abs(t.x - meet.x) <= 12 && Math.abs(t.y - meet.y) <= 12;
    }).length,
  };
});

console.log(JSON.stringify({ result, errors }, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if ((result.standupGathered ?? 0) < 1 || result.agentCount < 2) {
  console.error("FAIL: standup should gather ≥1 idle agent");
  process.exit(1);
}
console.log("PASS: standupGathered=", result.standupGathered);
