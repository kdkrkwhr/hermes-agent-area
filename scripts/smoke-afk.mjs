/** Smoke: AFK desk BRB placard — idle@desk +90s / force / busy hide / ?afk=0. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-afk";

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

function seatIdleAtDesk(extraMs = 0) {
  return page.evaluate((extraMs) => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const a = sc.agents[0];
    const tw = sc.map?.tileWidth || 48;
    const th = sc.map?.tileHeight || 48;
    const desk = sc.waypoints?.desks?.[0] || { x: 3, y: 5 };
    a.live = true;
    a.serverStatus = "idle";
    a.currentKind = "desk";
    a.serverData = { ...(a.serverData || {}), zone: "desk" };
    a.path = [];
    a.pathIndex = 0;
    a.sprite.setPosition(desk.x * tw + tw / 2, desk.y * th + th / 2);
    a.syncUi();
    // seed idle clock then advance past 90s when requested
    const now = sc.time.now;
    sc.afkDeskSign?._idleSince?.set(a.def.id, now - extraMs);
    for (let i = 0; i < 10; i++) sc.afkDeskSign?.update(sc.time.now, 16);
    sc.publishDebug?.(undefined, sc.lastSnapshot);
    const snap = window.__HERMES_AREA__?.afkDeskSign;
    return {
      enabled: snap?.enabled,
      forced: snap?.forced,
      count: snap?.count ?? 0,
      depth: snap?.depth,
      idleMs: snap?.idleMs,
      signW: snap?.signW,
      activeIds: snap?.activeIds ?? [],
      agentId: a.def.id,
    };
  }, extraMs);
}

await gotoQs("events=0&sfx=0");

const early = await seatIdleAtDesk(0);
await page.screenshot({ path: `${shotDir}/idle-early.png`, fullPage: true });

const idle90 = await seatIdleAtDesk(90_000);
await page.waitForTimeout(200);
await page.screenshot({ path: `${shotDir}/idle-90s.png`, fullPage: true });

const running = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.serverStatus = "running";
  a.currentKind = "desk";
  a.serverData = { ...(a.serverData || {}), zone: "desk" };
  a.path = [];
  a.syncUi();
  for (let i = 0; i < 8; i++) sc.afkDeskSign?.update(sc.time.now, 16);
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  return { count: window.__HERMES_AREA__?.afkDeskSign?.count ?? 0 };
});
await page.screenshot({ path: `${shotDir}/running-hidden.png`, fullPage: true });

const ready = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  const tw = sc.map?.tileWidth || 48;
  const th = sc.map?.tileHeight || 48;
  const desk = sc.waypoints?.desks?.[0] || { x: 3, y: 5 };
  a.serverStatus = "ready";
  a.currentKind = "desk";
  a.serverData = { ...(a.serverData || {}), zone: "desk" };
  a.sprite.setPosition(desk.x * tw + tw / 2, desk.y * th + th / 2);
  a.path = [];
  a.syncUi();
  const now = sc.time.now;
  sc.afkDeskSign?._idleSince?.set(a.def.id, now - 90_000);
  for (let i = 0; i < 8; i++) sc.afkDeskSign?.update(sc.time.now, 16);
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  return {
    count: window.__HERMES_AREA__?.afkDeskSign?.count ?? 0,
    activeIds: window.__HERMES_AREA__?.afkDeskSign?.activeIds ?? [],
    agentId: a.def.id,
  };
});
await page.screenshot({ path: `${shotDir}/ready-90s.png`, fullPage: true });

const away = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.serverStatus = "idle";
  a.currentKind = "break";
  a.serverData = { ...(a.serverData || {}), zone: "break" };
  a.path = [];
  a.syncUi();
  sc.afkDeskSign?._idleSince?.set(a.def.id, sc.time.now - 90_000);
  for (let i = 0; i < 8; i++) sc.afkDeskSign?.update(sc.time.now, 16);
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  return { count: window.__HERMES_AREA__?.afkDeskSign?.count ?? 0 };
});
await page.screenshot({ path: `${shotDir}/away-hidden.png`, fullPage: true });

await gotoQs("afk=0&events=0&sfx=0");
const off = await seatIdleAtDesk(90_000);
await page.screenshot({ path: `${shotDir}/afk-off.png`, fullPage: true });

await gotoQs("afk=force&events=0&sfx=0");
const forced = await seatIdleAtDesk(0);
await page.screenshot({ path: `${shotDir}/force-idle.png`, fullPage: true });

const ok =
  early.enabled === true &&
  early.forced === false &&
  early.count === 0 &&
  idle90.count === 1 &&
  idle90.activeIds.includes(idle90.agentId) &&
  idle90.depth === 14 &&
  idle90.idleMs === 90_000 &&
  idle90.signW === 29 &&
  running.count === 0 &&
  ready.count === 1 &&
  ready.activeIds.includes(ready.agentId) &&
  away.count === 0 &&
  off.enabled === false &&
  off.count === 0 &&
  forced.enabled === true &&
  forced.forced === true &&
  forced.count === 1 &&
  forced.activeIds.includes(forced.agentId) &&
  errors.length === 0;

const result = {
  ok,
  early,
  idle90,
  running,
  ready,
  away,
  off,
  forced,
  errors,
  shotDir,
};
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (!ok) {
  console.error("FAIL smoke-afk");
  process.exit(1);
}
console.log("PASS smoke-afk");
