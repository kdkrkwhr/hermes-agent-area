/** Smoke: idle printer scan bar GID36 — sweep loop, ?printerscan=0 off, jam pause. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5181/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-printerscan";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(45000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function load(qs) {
  const root = base.replace(/\/?$/, "/");
  await page.goto(`${root}?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(600);
}

async function checkIdle(label, qs) {
  await load(qs);
  const result = await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const ps = sc?.printerScan;
    if (!ps) return { ok: false, reason: "no printerScan" };
    const a = ps.snapshot();
    const p0 = ps.phase;
    ps.update(sc.time.now, 900);
    const b = ps.snapshot();
    const phaseMoved = Math.abs((b.phase ?? 0) - p0) > 0.02;
    const ok =
      a.enabled === true &&
      b.active === true &&
      b.paused === false &&
      a.printerTile &&
      a.printerGid === 36 &&
      phaseMoved;
    return { ok, phaseMoved, a, b };
  });
  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(JSON.stringify({ label, ...result, shot }));
  if (!result.ok) process.exitCode = 1;
  return result.ok;
}

async function checkOff(label) {
  await load("tod=day&events=0&sfx=0&printerscan=0");
  const ps = await page.evaluate(() => window.__HERMES_AREA__?.printerScan);
  const ok = !!ps && ps.enabled === false && ps.active === false;
  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(JSON.stringify({ label, ok, ps, shot }));
  if (!ok) process.exitCode = 1;
  return ok;
}

async function checkJamPause() {
  await load("tod=day&events=0&sfx=0");
  await page.waitForFunction(
    () => {
      const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
      return !!(sc?.officeEvents && (sc.agents?.length ?? 0) >= 2);
    },
    null,
    { timeout: 15000 },
  );

  const jam = await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const oe = sc.officeEvents;
    oe.enabled = true;
    if (oe._schedule) {
      oe._schedule.remove(false);
      oe._schedule = null;
    }
    oe._shipCooldownUntil = sc.time.now + 999999;
    for (const a of sc.agents || []) {
      a.live = false;
      a.serverStatus = null;
      a.currentKind = "break";
      a.path = [];
      a.pathIndex = 0;
      a.busy = false;
      a.idleUntil = sc.time.now + 999999;
      sc._emitterKinds?.set(a.def.id, "idle");
    }
    oe.fire("printer_jam");
    return {
      lastEvent: oe.lastEvent,
      gathering: oe.isGathering(),
    };
  });

  await page.waitForFunction(
    () => window.__HERMES_AREA__?.printerScan?.paused === true,
    null,
    { timeout: 5000 },
  );

  const ps = await page.evaluate(() => ({
    printerScan: window.__HERMES_AREA__?.printerScan,
    events: window.__HERMES_AREA__?.events,
  }));

  const ok =
    jam.lastEvent === "printer_jam" &&
    ps.events?.gathering === true &&
    ps.printerScan?.paused === true &&
    ps.printerScan?.active === false;

  const shot = `${shotDir}/jam-pause.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(JSON.stringify({ label: "jam-pause", ok, jam, ps, shot }));
  if (!ok) process.exitCode = 1;
  return ok;
}

await checkIdle("idle-sweep", "tod=day&events=0&sfx=0");
await checkOff("force-off");
await checkJamPause();

await browser.close();
if (errors.length) {
  console.error("pageerrors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL printerscan smoke");
  process.exit(1);
}
console.log("PASS printerscan smoke");
