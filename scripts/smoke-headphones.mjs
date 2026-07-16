/** Smoke: Focus headphones — focus running shows, open desk / idle / ?headphones=0 hide. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-headphones";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function gotoQs(qs) {
  const url = `${base.replace(/\/?$/, "/")}?${qs}`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 15000,
  });
  await page.waitForFunction(
    () => {
      const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
      return (sc?.agents?.length ?? 0) >= 1;
    },
    null,
    { timeout: 15000 },
  );
}

await gotoQs("events=0&sfx=0");

const focusRunning = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  const tw = sc.map?.tileWidth || 32;
  const th = sc.map?.tileHeight || 32;
  const fd = sc.waypoints?.focusDesks?.[0] || { x: 3, y: 19 };
  a.live = true;
  a.serverStatus = "running";
  a.currentKind = "focus";
  a.serverData = { ...(a.serverData || {}), zone: "focus", task_title: "deep work" };
  a.path = [];
  a.pathIndex = 0;
  a.sprite.setPosition(fd.x * tw + tw / 2, fd.y * th + th / 2);
  a.syncUi();
  sc.focusHeadphones?.sync();
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  const snap = window.__HERMES_AREA__?.focusHeadphones;
  return {
    enabled: snap?.enabled,
    count: snap?.count ?? 0,
    activeIds: snap?.activeIds ?? [],
    agentId: a.def.id,
    depth: snap?.depth,
  };
});

await page.waitForTimeout(200);
await page.screenshot({ path: `${shotDir}/focus-running.png`, fullPage: true });

const openDesk = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  const tw = sc.map?.tileWidth || 32;
  const th = sc.map?.tileHeight || 32;
  const desk = sc.waypoints?.desks?.[0] || { x: 3, y: 5 };
  a.serverStatus = "running";
  a.currentKind = "desk";
  a.serverData = { ...(a.serverData || {}), zone: "desk" };
  a.sprite.setPosition(desk.x * tw + tw / 2, desk.y * th + th / 2);
  a.syncUi();
  sc.focusHeadphones?.sync();
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  const snap = window.__HERMES_AREA__?.focusHeadphones;
  return {
    count: snap?.count ?? 0,
    activeIds: snap?.activeIds ?? [],
  };
});

await page.screenshot({ path: `${shotDir}/open-desk-hidden.png`, fullPage: true });

const idle = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.serverStatus = "idle";
  a.currentKind = "break";
  a.serverData = { ...(a.serverData || {}), zone: "break" };
  a.syncUi();
  sc.focusHeadphones?.sync();
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  const snap = window.__HERMES_AREA__?.focusHeadphones;
  return { count: snap?.count ?? 0 };
});

await page.screenshot({ path: `${shotDir}/idle-hidden.png`, fullPage: true });

await gotoQs("headphones=0&events=0&sfx=0");

const off = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  const tw = sc.map?.tileWidth || 32;
  const th = sc.map?.tileHeight || 32;
  const fd = sc.waypoints?.focusDesks?.[0] || { x: 3, y: 19 };
  a.live = true;
  a.serverStatus = "running";
  a.currentKind = "focus";
  a.serverData = { ...(a.serverData || {}), zone: "focus" };
  a.sprite.setPosition(fd.x * tw + tw / 2, fd.y * th + th / 2);
  a.syncUi();
  sc.focusHeadphones?.sync();
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  const snap = window.__HERMES_AREA__?.focusHeadphones;
  return {
    enabled: snap?.enabled,
    count: snap?.count ?? 0,
  };
});

await page.screenshot({ path: `${shotDir}/headphones-off.png`, fullPage: true });

const ok =
  focusRunning.enabled === true &&
  focusRunning.count === 1 &&
  focusRunning.activeIds.includes(focusRunning.agentId) &&
  focusRunning.depth === 23 &&
  openDesk.count === 0 &&
  idle.count === 0 &&
  off.enabled === false &&
  off.count === 0 &&
  errors.length === 0;

const result = { ok, focusRunning, openDesk, idle, off, errors, shotDir };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (!ok) {
  console.error("FAIL smoke-headphones");
  process.exit(1);
}
console.log("PASS smoke-headphones");
