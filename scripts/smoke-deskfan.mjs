/** Smoke: desk fan GID43 spin — idle, ?deskfan=0 off, ?deskfan=force. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-deskfan";

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
    const fx = sc?.deskFanSpin;
    if (!fx) return { ok: false, reason: "no deskFanSpin" };
    const a = fx.snapshot();
    fx.update((sc.time?.now ?? 0) + 900);
    const b = fx.snapshot();
    const expected = [
      { tx: 5, ty: 3 },
      { tx: 9, ty: 3 },
      { tx: 5, ty: 17 },
    ];
    const ok =
      a.enabled === true &&
      b.active === true &&
      a.fanCount >= 2 &&
      a.fanGid === 43 &&
      Array.isArray(a.fans) &&
      expected.every((e) => a.fans.some((f) => f.tx === e.tx && f.ty === e.ty));
    return { ok, a, b };
  });
  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(JSON.stringify({ label, ...result, shot }));
  if (!result.ok) process.exitCode = 1;
  return result.ok;
}

async function checkForce(label) {
  await load("tod=day&events=0&sfx=0&deskfan=force");
  const result = await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const fx = sc?.deskFanSpin;
    if (!fx) return { ok: false, reason: "no deskFanSpin" };
    sc.cameras?.main?.centerOn?.(5 * 48 + 24, 3 * 48 + 24);
    fx.update(sc.time?.now ?? 0);
    const snap = fx.snapshot();
    const ok =
      snap.enabled === true &&
      snap.forced === true &&
      snap.active === true &&
      snap.fanCount >= 2 &&
      snap.spinningCount >= 2 &&
      fx.periodMs === 380;
    return { ok, snap, periodMs: fx.periodMs, area: window.__HERMES_AREA__?.deskFan ?? null };
  });
  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(JSON.stringify({ label, ...result, shot }));
  if (!result.ok) process.exitCode = 1;
  return result.ok;
}

async function checkOff(label) {
  await load("tod=day&events=0&sfx=0&deskfan=0");
  const snap = await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    return sc?.deskFanSpin?.snapshot?.() ?? window.__HERMES_AREA__?.deskFan ?? null;
  });
  const ok = !!snap && snap.enabled === false && snap.active === false;
  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(JSON.stringify({ label, ok, snap, shot }));
  if (!ok) process.exitCode = 1;
  return ok;
}

await checkIdle("day-on", "tod=day&events=0&sfx=0");
await checkForce("force");
await checkOff("off");

await browser.close();
if (errors.length) {
  console.error("page errors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL deskfan smoke");
  process.exit(1);
}
console.log("PASS deskfan smoke");
