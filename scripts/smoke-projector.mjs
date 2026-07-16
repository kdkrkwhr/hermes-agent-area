/** Smoke: War Room meeting projector beam. ?projector=1 force / =0 off. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-projector";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(45000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function waitReady() {
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  await page.waitForFunction(
    () => {
      const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
      return !!(sc?.meetingProjector && (sc.agents?.length ?? 0) >= 2);
    },
    null,
    { timeout: 20000 },
  );
}

async function checkForceOn() {
  const root = base.replace(/\/?$/, "/");
  await page.goto(`${root}?projector=1&events=0&sfx=0&tod=day`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await waitReady();
  // fade-in ~700ms
  await page.waitForTimeout(900);
  const snap = await page.evaluate(() => window.__HERMES_AREA__?.meetingProjector);
  const ticker = await page.evaluate(() => window.__HERMES_AREA__?.whiteboardTicker);
  const events = await page.evaluate(() => window.__HERMES_AREA__?.events);
  const ok =
    !!snap &&
    snap.enabled === true &&
    snap.forced === true &&
    snap.active === true &&
    snap.reason === "force" &&
    // ticker / events still present (no regression)
    ticker != null &&
    events != null &&
    events.enabled === false;
  const shot = `${shotDir}/force-on.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(JSON.stringify({ label: "force-on", ok, snap, ticker: !!ticker, events, shot }));
  if (!ok) process.exitCode = 1;
  return ok;
}

async function checkOff() {
  const root = base.replace(/\/?$/, "/");
  await page.goto(`${root}?projector=0&events=0&sfx=0&tod=day`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await waitReady();
  await page.waitForTimeout(400);
  const snap = await page.evaluate(() => window.__HERMES_AREA__?.meetingProjector);
  const ok =
    !!snap &&
    snap.enabled === false &&
    snap.active === false &&
    snap.forced === false;
  const shot = `${shotDir}/force-off.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(JSON.stringify({ label: "force-off", ok, snap, shot }));
  if (!ok) process.exitCode = 1;
  return ok;
}

async function checkMeetingTrigger() {
  const root = base.replace(/\/?$/, "/");
  await page.goto(`${root}?events=0&sfx=0&tod=day`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await waitReady();

  await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const meet = sc.waypoints?.meeting || { x: 18, y: 9 };
    const tw = sc.map.tileWidth;
    const th = sc.map.tileHeight;
    const agents = sc.agents || [];
    for (let i = 0; i < Math.min(2, agents.length); i++) {
      const a = agents[i];
      a.live = false;
      a.serverStatus = null;
      a.currentKind = "meeting";
      a.path = [];
      a.pathIndex = 0;
      a.busy = true;
      a.idleUntil = sc.time.now + 9e9;
      a.goRandom = () => {};
      a.wanderLounge = () => {};
      a.moveToTile = async () => false;
      a.applyServer = async () => {};
      const ox = (i % 2) * 1;
      const oy = Math.floor(i / 2);
      a.sprite.setPosition(
        (meet.x + ox) * tw + tw / 2,
        (meet.y + oy) * th + th / 2,
      );
    }
    // third agent stay far so count stays exactly 2
    for (let i = 2; i < agents.length; i++) {
      const a = agents[i];
      a.busy = true;
      a.path = [];
      a.goRandom = () => {};
      a.moveToTile = async () => false;
      a.sprite.setPosition(3 * tw + tw / 2, 20 * th + th / 2);
    }
  });

  await page.waitForFunction(
    () => {
      const p = window.__HERMES_AREA__?.meetingProjector;
      return (
        p?.active === true &&
        p?.reason === "meeting" &&
        (p?.meetingCount ?? 0) >= 2 &&
        (p?.fade ?? 0) >= 0.5
      );
    },
    null,
    { timeout: 5000 },
  );

  const snap = await page.evaluate(() => window.__HERMES_AREA__?.meetingProjector);
  const ok =
    !!snap &&
    snap.enabled === true &&
    snap.active === true &&
    snap.reason === "meeting" &&
    snap.meetingCount >= 2;
  const shot = `${shotDir}/meeting-on.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(JSON.stringify({ label: "meeting-on", ok, snap, shot }));
  if (!ok) process.exitCode = 1;
  return ok;
}

async function checkStandupTrigger() {
  const root = base.replace(/\/?$/, "/");
  await page.goto(`${root}?events=0&sfx=0&tod=day`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await waitReady();

  await page.evaluate(() => {
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
  });

  await page.waitForFunction(
    () => {
      const p = window.__HERMES_AREA__?.meetingProjector;
      const e = window.__HERMES_AREA__?.events;
      return (
        (e?.standupGathering === true || e?.lastEvent === "standup") &&
        p?.active === true &&
        p?.reason === "standup"
      );
    },
    null,
    { timeout: 8000 },
  );

  const snap = await page.evaluate(() => ({
    projector: window.__HERMES_AREA__?.meetingProjector,
    events: window.__HERMES_AREA__?.events,
  }));
  const ok =
    snap.projector?.active === true &&
    snap.projector?.reason === "standup" &&
    (snap.events?.standupGathering === true ||
      snap.events?.lastEvent === "standup");
  const shot = `${shotDir}/standup-on.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(JSON.stringify({ label: "standup-on", ok, ...snap, shot }));
  if (!ok) process.exitCode = 1;
  return ok;
}

await checkForceOn();
await checkOff();
await checkMeetingTrigger();
await checkStandupTrigger();

await browser.close();
if (errors.length) {
  console.error("pageerrors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL projector smoke");
  process.exit(1);
}
console.log("PASS projector smoke");
