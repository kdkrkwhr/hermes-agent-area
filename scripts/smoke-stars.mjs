/** Smoke: night shooting stars over GID12 — ?stars=0 off, ?stars=1/force short gap. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-stars";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(45000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function goto(qs) {
  const root = base.replace(/\/?$/, "/");
  await page.goto(`${root}?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    if (!sc) return;
    if (sc._clockOutPending) sc.cancelClockOut?.();
    document.querySelector('.clockout-modal [data-role="no"]')?.click();
    // north facade windows
    sc.cameras?.main?.centerOn?.(10 * 32, 1 * 32);
  });
}

async function snap(label) {
  const stars = await page.evaluate(() => window.__HERMES_AREA__?.stars);
  const lighting = await page.evaluate(() => window.__HERMES_AREA__?.lighting);
  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  return { stars, lighting, shot };
}

// --- force night: expect active + meteor within ~3s ---
await goto(
  "stars=1&tod=night&events=0&sfx=0&weatherfx=0&rain=0&snow=0&fog=0",
);
await page.waitForFunction(
  () => {
    const s = window.__HERMES_AREA__?.stars;
    return s?.active === true && (s?.flying === true || s?.flyCount >= 1);
  },
  null,
  { timeout: 8000 },
);
const forced = await snap("force-night");
const forceOk =
  forced.stars?.enabled === true &&
  forced.stars?.forced === true &&
  forced.stars?.active === true &&
  forced.stars?.windowTiles >= 1 &&
  forced.stars?.depth === 4 &&
  (forced.stars?.flying === true || forced.stars?.flyCount >= 1) &&
  forced.lighting === "night";
console.log(JSON.stringify({ label: "force-night", ok: forceOk, ...forced }));
if (!forceOk) process.exitCode = 1;

// --- evening force ---
await goto(
  "stars=force&tod=evening&events=0&sfx=0&weatherfx=0&rain=0&snow=0&fog=0",
);
await page.waitForTimeout(500);
const evening = await snap("evening-force");
const eveningOk =
  evening.stars?.enabled === true &&
  evening.stars?.forced === true &&
  evening.stars?.active === true &&
  evening.lighting === "evening";
console.log(JSON.stringify({ label: "evening-force", ok: eveningOk, ...evening }));
if (!eveningOk) process.exitCode = 1;

// --- day should be inactive unless forced (not forced here) ---
await goto("tod=day&events=0&sfx=0&weatherfx=0&rain=0&snow=0&fog=0");
await page.waitForTimeout(400);
const day = await snap("day-off");
const dayOk =
  day.stars?.enabled === true &&
  day.stars?.forced === false &&
  day.stars?.active === false &&
  day.lighting === "day";
console.log(JSON.stringify({ label: "day-off", ok: dayOk, ...day }));
if (!dayOk) process.exitCode = 1;

// --- night natural on ---
await goto("tod=night&events=0&sfx=0&weatherfx=0&rain=0&snow=0&fog=0");
await page.waitForTimeout(400);
const night = await snap("night-on");
const nightOk =
  night.stars?.enabled === true &&
  night.stars?.active === true &&
  night.stars?.windowTiles >= 1 &&
  night.lighting === "night";
console.log(JSON.stringify({ label: "night-on", ok: nightOk, ...night }));
if (!nightOk) process.exitCode = 1;

// --- query off ---
await goto("stars=0&tod=night&events=0&sfx=0&weatherfx=0");
await page.waitForTimeout(400);
const off = await snap("stars-off");
const offOk =
  off.stars?.enabled === false &&
  off.stars?.active === false;
console.log(JSON.stringify({ label: "stars-off", ok: offOk, ...off }));
if (!offOk) process.exitCode = 1;

// --- rain blocks even with force ---
await goto(
  "stars=1&tod=night&rain=1&events=0&sfx=0&weatherfx=0&fog=0&snow=0",
);
await page.waitForTimeout(600);
const rain = await snap("rain-block");
const rainOk =
  rain.stars?.enabled === true &&
  rain.stars?.forced === true &&
  rain.stars?.blocked === true &&
  rain.stars?.active === false;
console.log(JSON.stringify({ label: "rain-block", ok: rainOk, ...rain }));
if (!rainOk) process.exitCode = 1;

await browser.close();
if (errors.length) {
  console.error("pageerrors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL stars smoke");
  process.exit(1);
}
console.log("PASS stars smoke");
