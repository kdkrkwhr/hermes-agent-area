/** Smoke: night flashlight under ?tod=night / day / flashlight=0 / flashlight=1 / fast. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.env.SMOKE_URL || "http://127.0.0.1:5173";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-flashlight";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(45000);

async function check(label, qs, expectActive, opts = {}) {
  await page.goto(`${base}/?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  // let a couple patrol frames paint
  await page.waitForTimeout(700);
  const flashlight = await page.evaluate(() => window.__HERMES_AREA__?.flashlight);
  const lighting = await page.evaluate(() => window.__HERMES_AREA__?.lighting);
  const qsOff = qs.includes("flashlight=0");
  const qsForce = /(?:^|&)flashlight=1(?:&|$)/.test(qs);
  const qsFast = /(?:^|&)flashlight=fast(?:&|$)/.test(qs);
  const ok =
    flashlight &&
    flashlight.active === expectActive &&
    (qsOff
      ? flashlight.enabled === false
      : flashlight.enabled === true &&
        flashlight.pathTiles >= 8 &&
        flashlight.pathLen >= 64) &&
    (qsForce || qsFast ? flashlight.forced === true : flashlight.forced === false) &&
    (qsFast ? flashlight.fast === true && flashlight.periodMs <= 20000 : true) &&
    (opts.expectX == null || Number.isFinite(flashlight.x));
  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      lighting,
      flashlight,
      expectActive,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("night-on", "tod=night&flashlight=1&events=0&sfx=0", true);
await check("evening-on", "tod=evening&events=0&sfx=0", true);
await check("day-off", "tod=day&events=0&sfx=0", false);
await check("morning-off", "tod=morning&events=0&sfx=0", false);
await check("force-on-day", "tod=day&flashlight=1&events=0&sfx=0", true);
await check("force-off-night", "tod=night&flashlight=0&events=0&sfx=0", false);
await check("fast-on", "tod=day&flashlight=fast&events=0&sfx=0", true);

await browser.close();
if (process.exitCode) {
  console.error("FAIL flashlight smoke");
  process.exit(1);
}
console.log("PASS flashlight smoke");
