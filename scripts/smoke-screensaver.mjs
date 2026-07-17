/** Smoke: idle desk monitor screensaver — idle@desk shows, running swaps to code, ?screensaver=0/force. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-screensaver";

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

function seatIdleAtDesk() {
  return page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const a = sc.agents[0];
    const tw = sc.map?.tileWidth || 32;
    const th = sc.map?.tileHeight || 32;
    const desk = sc.waypoints?.desks?.[0] || { x: 3, y: 5 };
    a.live = true;
    a.serverStatus = "idle";
    a.currentKind = "desk";
    a.serverData = { ...(a.serverData || {}), zone: "desk" };
    a.path = [];
    a.pathIndex = 0;
    a.sprite.setPosition(desk.x * tw + tw / 2, desk.y * th + th / 2);
    a.syncUi();
    for (let i = 0; i < 8; i++) {
      sc.monitorCode?.sync(16);
      sc.monitorScreensaver?.sync(sc.time.now);
    }
    sc.publishDebug?.(undefined, sc.lastSnapshot);
    const ss = window.__HERMES_AREA__?.monitorScreensaver;
    const code = window.__HERMES_AREA__?.monitorCode;
    return {
      enabled: ss?.enabled,
      forced: ss?.forced,
      count: ss?.count ?? 0,
      depth: ss?.depth,
      activeIds: ss?.activeIds ?? [],
      agentId: a.def.id,
      codeCount: code?.count ?? 0,
    };
  });
}

await gotoQs("events=0&sfx=0");

const idle = await seatIdleAtDesk();
await page.waitForTimeout(400);
await page.screenshot({ path: `${shotDir}/idle-desk.png`, fullPage: true });

const running = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.serverStatus = "running";
  a.currentKind = "desk";
  a.serverData = { ...(a.serverData || {}), zone: "desk" };
  a.path = [];
  a.syncUi();
  for (let i = 0; i < 8; i++) {
    sc.monitorCode?.sync(16);
    sc.monitorScreensaver?.sync(sc.time.now);
  }
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  return {
    ssCount: window.__HERMES_AREA__?.monitorScreensaver?.count ?? 0,
    codeCount: window.__HERMES_AREA__?.monitorCode?.count ?? 0,
    codeKind: window.__HERMES_AREA__?.monitorCode?.kinds?.[a.def.id] ?? null,
  };
});
await page.screenshot({ path: `${shotDir}/running-code.png`, fullPage: true });

const breakDesk = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  const tw = sc.map?.tileWidth || 32;
  const th = sc.map?.tileHeight || 32;
  const desk = sc.waypoints?.desks?.[0] || { x: 3, y: 5 };
  a.live = true;
  a.serverStatus = "idle";
  a.currentKind = "break";
  a.serverData = { ...(a.serverData || {}), zone: "desk" };
  a.sprite.setPosition(desk.x * tw + tw / 2, desk.y * th + th / 2);
  a.path = [];
  a.syncUi();
  for (let i = 0; i < 8; i++) sc.monitorScreensaver?.sync(sc.time.now);
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  return {
    count: window.__HERMES_AREA__?.monitorScreensaver?.count ?? 0,
  };
});
await page.screenshot({ path: `${shotDir}/break-desk.png`, fullPage: true });

const away = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.serverStatus = "idle";
  a.currentKind = "break";
  a.serverData = { ...(a.serverData || {}), zone: "break" };
  a.path = [];
  a.syncUi();
  for (let i = 0; i < 8; i++) sc.monitorScreensaver?.sync(sc.time.now);
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  return {
    count: window.__HERMES_AREA__?.monitorScreensaver?.count ?? 0,
  };
});
await page.screenshot({ path: `${shotDir}/away-hidden.png`, fullPage: true });

await gotoQs("screensaver=0&events=0&sfx=0");
const off = await seatIdleAtDesk();
await page.screenshot({ path: `${shotDir}/screensaver-off.png`, fullPage: true });

await gotoQs("screensaver=force&events=0&sfx=0");
const forced = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.live = true;
  a.serverStatus = "idle";
  a.currentKind = "meeting";
  a.serverData = { ...(a.serverData || {}), zone: "meeting" };
  a.path = [];
  a.pathIndex = 0;
  a.syncUi();
  for (let i = 0; i < 8; i++) sc.monitorScreensaver?.sync(sc.time.now);
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  const ss = window.__HERMES_AREA__?.monitorScreensaver;
  return {
    enabled: ss?.enabled,
    forced: ss?.forced,
    count: ss?.count ?? 0,
    agentId: a.def.id,
    activeIds: ss?.activeIds ?? [],
  };
});
await page.screenshot({ path: `${shotDir}/force-idle.png`, fullPage: true });

const ok =
  idle.enabled === true &&
  idle.forced === false &&
  idle.count === 1 &&
  idle.activeIds.includes(idle.agentId) &&
  idle.depth === 12 &&
  idle.codeCount === 0 &&
  running.ssCount === 0 &&
  running.codeCount === 1 &&
  running.codeKind === "running" &&
  breakDesk.count === 1 &&
  away.count === 0 &&
  off.enabled === false &&
  off.count === 0 &&
  forced.enabled === true &&
  forced.forced === true &&
  forced.count >= 1 &&
  forced.activeIds.includes(forced.agentId) &&
  errors.length === 0;

const result = {
  ok,
  idle,
  running,
  breakDesk,
  away,
  off,
  forced,
  errors,
  shotDir,
};
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (!ok) {
  console.error("FAIL smoke-screensaver");
  process.exit(1);
}
console.log("PASS smoke-screensaver");
