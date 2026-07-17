/** Smoke: lounge vending GID38 idle LED — pulse, ?vendingidle=0 off, ?vendingidle=force, dispense boost. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-vendingidle";

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
    const vi = sc?.vendingIdle;
    if (!vi) return { ok: false, reason: "no vendingIdle" };
    const a = vi.snapshot();
    vi.update((sc.time?.now ?? 0) + 1500);
    const b = vi.snapshot();
    const ok =
      a.enabled === true &&
      b.active === true &&
      a.machineCount === 2 &&
      a.vendingGid === 38 &&
      Array.isArray(a.machines) &&
      a.machines.length === 2;
    return { ok, a, b };
  });
  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(JSON.stringify({ label, ...result, shot }));
  if (!result.ok) process.exitCode = 1;
  return result.ok;
}

async function checkForce(label) {
  await load("tod=day&events=0&sfx=0&vendingidle=force");
  const result = await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const vi = sc?.vendingIdle;
    if (!vi) return { ok: false, reason: "no vendingIdle" };
    const snap = vi.snapshot();
    const ok =
      snap.enabled === true &&
      snap.forced === true &&
      snap.active === true &&
      snap.machineCount === 2 &&
      vi.periodMs === 1600;
    return { ok, snap, periodMs: vi.periodMs, area: window.__HERMES_AREA__?.vendingIdle ?? null };
  });
  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(JSON.stringify({ label, ...result, shot }));
  if (!result.ok) process.exitCode = 1;
  return result.ok;
}

async function checkOff(label) {
  await load("tod=day&events=0&sfx=0&vendingidle=0");
  const snap = await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    return sc?.vendingIdle?.snapshot?.() ?? window.__HERMES_AREA__?.vendingIdle ?? null;
  });
  const ok = !!snap && snap.enabled === false && snap.active === false;
  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(JSON.stringify({ label, ok, snap, shot }));
  if (!ok) process.exitCode = 1;
  return ok;
}

async function checkDispenseBoost() {
  await load("tod=day&events=0&sfx=0&vendingidle=force");
  await page.waitForFunction(
    () => {
      const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
      return !!(sc?.boss?.sprite && sc?.roomInteract?.vendingTiles?.length);
    },
    null,
    { timeout: 20000 },
  );

  const result = await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const vi = sc.vendingIdle;
    const ri = sc.roomInteract;
    const before = vi.snapshot();
    ri.vendingActiveUntil = sc.time.now + 5000;
    vi.update(sc.time.now);
    const mid = vi.snapshot();
    ri.vendingActiveUntil = 0;
    vi.update(sc.time.now + 100);
    const after = vi.snapshot();
    const ok =
      before.dispensing === false &&
      mid.dispensing === true &&
      after.dispensing === false &&
      mid.active === true;
    return { ok, before, mid, after };
  });
  const shot = `${shotDir}/dispense-boost.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(JSON.stringify({ label: "dispense-boost", ...result, shot }));
  if (!result.ok) process.exitCode = 1;
  return result.ok;
}

await checkIdle("day-on", "tod=day&events=0&sfx=0");
await checkForce("force");
await checkOff("off");
await checkDispenseBoost();

await browser.close();
if (errors.length) {
  console.error("page errors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL vendingidle smoke");
  process.exit(1);
}
console.log("PASS vendingidle smoke");
