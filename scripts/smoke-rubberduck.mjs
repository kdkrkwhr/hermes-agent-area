/** Smoke: blocked-desk rubber duck — visible when blocked@desk, hidden idle/moving/?duck=0, force shows mock blocked. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-rubberduck";

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

function seatBlockedAtDesk() {
  return page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const a = sc.agents[0];
    const tw = sc.map?.tileWidth || 32;
    const th = sc.map?.tileHeight || 32;
    const desk = sc.waypoints?.desks?.[0] || { x: 3, y: 5 };
    a.live = true;
    a.serverStatus = "blocked";
    a.currentKind = "desk";
    a.serverData = {
      ...(a.serverData || {}),
      zone: "desk",
      task_title: "rubber duck smoke",
    };
    a.path = [];
    a.pathIndex = 0;
    a.sprite.setPosition(desk.x * tw + tw / 2, desk.y * th + th / 2);
    a.syncUi();
    // ramp alpha so visible settles
    for (let i = 0; i < 8; i++) sc.rubberDuck?.sync(sc.time.now);
    sc.publishDebug?.(undefined, sc.lastSnapshot);
    const snap = window.__HERMES_AREA__?.rubberDuck;
    return {
      enabled: snap?.enabled,
      forced: snap?.forced,
      count: snap?.count ?? 0,
      depth: snap?.depth,
      duck: snap?.ducks?.[0] ?? null,
      agentId: a.def.id,
    };
  });
}

await gotoQs("events=0&sfx=0");

const blocked = await seatBlockedAtDesk();
await page.waitForTimeout(250);
await page.screenshot({ path: `${shotDir}/blocked-desk.png`, fullPage: true });

const idle = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.serverStatus = "idle";
  a.currentKind = "break";
  a.serverData = { ...(a.serverData || {}), zone: "break" };
  a.path = [];
  a.syncUi();
  for (let i = 0; i < 12; i++) sc.rubberDuck?.sync(sc.time.now);
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  return {
    count: window.__HERMES_AREA__?.rubberDuck?.count ?? 0,
  };
});
await page.screenshot({ path: `${shotDir}/idle-hidden.png`, fullPage: true });

const moving = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  const tw = sc.map?.tileWidth || 32;
  const th = sc.map?.tileHeight || 32;
  const desk = sc.waypoints?.desks?.[0] || { x: 3, y: 5 };
  a.serverStatus = "blocked";
  a.currentKind = "desk";
  a.serverData = { ...(a.serverData || {}), zone: "desk" };
  a.sprite.setPosition(desk.x * tw + tw / 2, desk.y * th + th / 2);
  a.path = [{ x: desk.x + 2, y: desk.y }, { x: desk.x + 3, y: desk.y }];
  a.pathIndex = 0;
  a.syncUi();
  for (let i = 0; i < 12; i++) sc.rubberDuck?.sync(sc.time.now);
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  return {
    count: window.__HERMES_AREA__?.rubberDuck?.count ?? 0,
  };
});
await page.screenshot({ path: `${shotDir}/moving-hidden.png`, fullPage: true });

await gotoQs("duck=0&events=0&sfx=0");
const off = await seatBlockedAtDesk();
await page.screenshot({ path: `${shotDir}/duck-off.png`, fullPage: true });

await gotoQs("duck=force&events=0&sfx=0");
const forced = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  // mock agent index 1 is blocked@meeting — force should still show
  const a = sc.agents.find((x) => x.serverStatus === "blocked") || sc.agents[1] || sc.agents[0];
  a.live = true;
  a.serverStatus = "blocked";
  a.currentKind = "meeting";
  a.serverData = { ...(a.serverData || {}), zone: "meeting" };
  a.path = [];
  a.pathIndex = 0;
  a.syncUi();
  for (let i = 0; i < 8; i++) sc.rubberDuck?.sync(sc.time.now);
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  const snap = window.__HERMES_AREA__?.rubberDuck;
  return {
    enabled: snap?.enabled,
    forced: snap?.forced,
    count: snap?.count ?? 0,
    agentId: a.def.id,
    ids: (snap?.ducks || []).map((d) => d.id),
  };
});
await page.screenshot({ path: `${shotDir}/force-blocked.png`, fullPage: true });

const ok =
  blocked.enabled === true &&
  blocked.forced === false &&
  blocked.count === 1 &&
  blocked.depth === 12 &&
  blocked.duck?.id === blocked.agentId &&
  idle.count === 0 &&
  moving.count === 0 &&
  off.enabled === false &&
  off.count === 0 &&
  forced.enabled === true &&
  forced.forced === true &&
  forced.count >= 1 &&
  forced.ids.includes(forced.agentId) &&
  errors.length === 0;

const result = { ok, blocked, idle, moving, off, forced, errors, shotDir };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (!ok) {
  console.error("FAIL smoke-rubberduck");
  process.exit(1);
}
console.log("PASS smoke-rubberduck");
