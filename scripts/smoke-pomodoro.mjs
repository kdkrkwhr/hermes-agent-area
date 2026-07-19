/** Smoke: Focus pomodoro ring — focus running shows, open desk / idle / ?pomodoro=0 hide. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-pomodoro";

mkdirSync(shotDir, { recursive: true });

const RING_COLOR = 0x5ee0c8;
const CYCLE_S = 1500;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(45000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function gotoQs(qs) {
  const root = base.replace(/\/?$/, "/");
  await page.goto(`${root}?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
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

await gotoQs("pomodoro=force&events=0&sfx=0&chatter=0");

const focusRunning = await page.evaluate((cycleS) => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  if (sc._clockOutPending) sc.cancelClockOut?.();
  document.querySelector('.clockout-modal [data-role="no"]')?.click();

  const a = sc.agents[0];
  const tw = sc.map?.tileWidth || 32;
  const th = sc.map?.tileHeight || 32;
  const fd = sc.waypoints?.focusDesks?.[0] || { x: 3, y: 19 };
  a.live = true;
  a.serverStatus = "running";
  a.currentKind = "focus";
  a.serverData = {
    ...(a.serverData || {}),
    zone: "focus",
    task_title: "pomodoro deep work",
    task_elapsed_s: Math.floor(cycleS * 0.4),
  };
  a.path = [];
  a.pathIndex = 0;
  a.sprite.setPosition(fd.x * tw + tw / 2, fd.y * th + th / 2);
  a.syncUi();
  sc.focusPomodoro?.sync(sc.time.now);
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  const snap = window.__HERMES_AREA__?.focusPomodoro;
  const row = snap?.agents?.find((r) => r.id === a.def.id) ?? snap?.agents?.[0];
  return {
    enabled: snap?.enabled,
    forced: snap?.forced,
    count: snap?.count ?? 0,
    fill: row?.fill,
    agentId: a.def.id,
    depth: snap?.depth,
    color: snap?.color,
    cycleS: snap?.cycleS,
    outerR: snap?.outerR,
    innerR: snap?.innerR,
  };
}, CYCLE_S);

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
  a.serverData = {
    ...(a.serverData || {}),
    zone: "desk",
    task_elapsed_s: 600,
  };
  a.sprite.setPosition(desk.x * tw + tw / 2, desk.y * th + th / 2);
  a.syncUi();
  sc.focusPomodoro?.sync(sc.time.now);
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  const snap = window.__HERMES_AREA__?.focusPomodoro;
  return { count: snap?.count ?? 0 };
});

await page.screenshot({ path: `${shotDir}/open-desk-hidden.png`, fullPage: true });

const idle = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  const tw = sc.map?.tileWidth || 32;
  const th = sc.map?.tileHeight || 32;
  const fd = sc.waypoints?.focusDesks?.[0] || { x: 3, y: 19 };
  a.serverStatus = "idle";
  a.currentKind = "break";
  a.serverData = { ...(a.serverData || {}), zone: "break", task_elapsed_s: null };
  // even if parked on focus tile, idle must hide (unless force — still gated by zone)
  a.sprite.setPosition(fd.x * tw + tw / 2, fd.y * th + th / 2);
  a.syncUi();
  sc.focusPomodoro?.sync(sc.time.now);
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  const snap = window.__HERMES_AREA__?.focusPomodoro;
  return { count: snap?.count ?? 0, forced: snap?.forced };
});

await page.screenshot({ path: `${shotDir}/idle-hidden.png`, fullPage: true });

const wrapDing = await page.evaluate((cycleS) => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  const tw = sc.map?.tileWidth || 32;
  const th = sc.map?.tileHeight || 32;
  const fd = sc.waypoints?.focusDesks?.[0] || { x: 3, y: 19 };
  a.live = true;
  a.serverStatus = "running";
  a.currentKind = "focus";
  a.serverData = {
    ...(a.serverData || {}),
    zone: "focus",
    task_elapsed_s: cycleS - 2,
  };
  a.sprite.setPosition(fd.x * tw + tw / 2, fd.y * th + th / 2);
  a.syncUi();
  sc.focusPomodoro?.sync(sc.time.now);
  const before = window.__HERMES_AREA__?.focusPomodoro?.dingCount ?? 0;
  a.serverData = {
    ...(a.serverData || {}),
    task_elapsed_s: cycleS + 5,
  };
  sc.focusPomodoro?.sync(sc.time.now + 16);
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  const snap = window.__HERMES_AREA__?.focusPomodoro;
  return {
    before,
    dingCount: snap?.dingCount ?? 0,
    fill: snap?.agents?.[0]?.fill,
  };
}, CYCLE_S);

await page.screenshot({ path: `${shotDir}/cycle-complete.png`, fullPage: true });

await gotoQs("pomodoro=0&events=0&sfx=0&chatter=0");

const off = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  const tw = sc.map?.tileWidth || 32;
  const th = sc.map?.tileHeight || 32;
  const fd = sc.waypoints?.focusDesks?.[0] || { x: 3, y: 19 };
  a.live = true;
  a.serverStatus = "running";
  a.currentKind = "focus";
  a.serverData = { ...(a.serverData || {}), zone: "focus", task_elapsed_s: 400 };
  a.sprite.setPosition(fd.x * tw + tw / 2, fd.y * th + th / 2);
  a.syncUi();
  sc.focusPomodoro?.sync(sc.time.now);
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  const snap = window.__HERMES_AREA__?.focusPomodoro;
  return {
    enabled: snap?.enabled,
    count: snap?.count ?? 0,
  };
});

await page.screenshot({ path: `${shotDir}/pomodoro-off.png`, fullPage: true });

const fillOk =
  typeof focusRunning.fill === "number" &&
  Math.abs(focusRunning.fill - 0.4) < 0.02;

const ok =
  focusRunning.enabled === true &&
  focusRunning.forced === true &&
  focusRunning.count === 1 &&
  focusRunning.depth === 19.5 &&
  focusRunning.color === RING_COLOR &&
  focusRunning.cycleS === CYCLE_S &&
  focusRunning.outerR > focusRunning.innerR &&
  fillOk &&
  openDesk.count === 0 &&
  idle.count === 0 &&
  wrapDing.dingCount > wrapDing.before &&
  off.enabled === false &&
  off.count === 0 &&
  errors.length === 0;

const result = {
  ok,
  focusRunning,
  openDesk,
  idle,
  wrapDing,
  off,
  fillOk,
  errors,
  shotDir,
};
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (!ok) {
  console.error("FAIL smoke-pomodoro");
  process.exit(1);
}
console.log("PASS smoke-pomodoro");
