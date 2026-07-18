/** Smoke: flower-pot pollinators — ?pollinator=force&tod=day orbit; night/rain off. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-pollinator";

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
    // Open Desk / lounge flower pots — center roughly mid-map
    const pots = sc.plantPollinators?.pots;
    if (pots?.length) {
      const avgX = pots.reduce((s, p) => s + p.x, 0) / pots.length;
      const avgY = pots.reduce((s, p) => s + p.y, 0) / pots.length;
      sc.cameras?.main?.centerOn?.(avgX, avgY);
    }
  });
}

async function snap(label) {
  const pollinator = await page.evaluate(() => window.__HERMES_AREA__?.pollinator);
  const lighting = await page.evaluate(() => window.__HERMES_AREA__?.lighting);
  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  return { pollinator, lighting, shot };
}

// --- force day: expect active + pots ---
await goto(
  "pollinator=force&tod=day&events=0&sfx=0&weatherfx=0&rain=0&snow=0",
);
await page.waitForTimeout(700);
const forced = await snap("force-day");
const forceOk =
  forced.pollinator?.enabled === true &&
  forced.pollinator?.forced === true &&
  forced.pollinator?.active === true &&
  forced.pollinator?.potCount >= 1 &&
  forced.pollinator?.count >= 1 &&
  forced.pollinator?.depth === 3.5 &&
  forced.lighting === "day";
console.log(JSON.stringify({ label: "force-day", ok: forceOk, ...forced }));
if (!forceOk) process.exitCode = 1;

// --- morning natural on ---
await goto("tod=morning&events=0&sfx=0&weatherfx=0&rain=0&snow=0");
await page.waitForTimeout(500);
const morning = await snap("morning-on");
const morningOk =
  morning.pollinator?.enabled === true &&
  morning.pollinator?.forced === false &&
  morning.pollinator?.active === true &&
  morning.pollinator?.potCount >= 1 &&
  morning.lighting === "morning";
console.log(JSON.stringify({ label: "morning-on", ok: morningOk, ...morning }));
if (!morningOk) process.exitCode = 1;

// --- day natural on ---
await goto("tod=day&events=0&sfx=0&weatherfx=0&rain=0&snow=0");
await page.waitForTimeout(500);
const day = await snap("day-on");
const dayOk =
  day.pollinator?.enabled === true &&
  day.pollinator?.active === true &&
  day.lighting === "day";
console.log(JSON.stringify({ label: "day-on", ok: dayOk, ...day }));
if (!dayOk) process.exitCode = 1;

// --- evening off ---
await goto("tod=evening&events=0&sfx=0&weatherfx=0");
await page.waitForTimeout(400);
const evening = await snap("evening-off");
const eveningOk =
  evening.pollinator?.enabled === true &&
  evening.pollinator?.forced === false &&
  evening.pollinator?.active === false &&
  evening.lighting === "evening";
console.log(JSON.stringify({ label: "evening-off", ok: eveningOk, ...evening }));
if (!eveningOk) process.exitCode = 1;

// --- night off ---
await goto("tod=night&events=0&sfx=0&weatherfx=0");
await page.waitForTimeout(400);
const night = await snap("night-off");
const nightOk =
  night.pollinator?.enabled === true &&
  night.pollinator?.active === false &&
  night.lighting === "night";
console.log(JSON.stringify({ label: "night-off", ok: nightOk, ...night }));
if (!nightOk) process.exitCode = 1;

// --- query off ---
await goto("pollinator=0&tod=day&events=0&sfx=0");
await page.waitForTimeout(400);
const off = await snap("pollinator-off");
const offOk =
  off.pollinator?.enabled === false &&
  off.pollinator?.active === false;
console.log(JSON.stringify({ label: "pollinator-off", ok: offOk, ...off }));
if (!offOk) process.exitCode = 1;

// --- rain blocks even with force ---
await goto(
  "pollinator=force&tod=day&rain=1&events=0&sfx=0&weatherfx=0&snow=0",
);
await page.waitForTimeout(600);
const rain = await snap("rain-block");
const rainOk =
  rain.pollinator?.enabled === true &&
  rain.pollinator?.forced === true &&
  rain.pollinator?.precip === true &&
  rain.pollinator?.active === false;
console.log(JSON.stringify({ label: "rain-block", ok: rainOk, ...rain }));
if (!rainOk) process.exitCode = 1;

await browser.close();
if (errors.length) {
  console.error("pageerrors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL pollinator smoke");
  process.exit(1);
}
console.log("PASS pollinator smoke");
