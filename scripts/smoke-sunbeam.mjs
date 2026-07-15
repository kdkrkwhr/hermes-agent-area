/** Smoke: morning sunbeams under ?tod=morning / day / sunbeam=0. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.env.SMOKE_URL || "http://127.0.0.1:5173";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-sunbeam";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(45000);

async function check(label, qs, expectActive) {
  await page.goto(`${base}/?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(500);
  const sunbeam = await page.evaluate(() => window.__HERMES_AREA__?.sunbeam);
  const lighting = await page.evaluate(() => window.__HERMES_AREA__?.lighting);
  const qsOff = qs.includes("sunbeam=0");
  const ok =
    sunbeam &&
    sunbeam.active === expectActive &&
    (qsOff
      ? sunbeam.enabled === false
      : sunbeam.enabled === true && sunbeam.emitterCount >= 1 && sunbeam.emitterCount <= 6);
  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      lighting,
      sunbeam,
      expectActive,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("morning-on", "tod=morning&events=0&sfx=0", true);
await check("day-off", "tod=day&events=0&sfx=0", false);
await check("evening-off", "tod=evening&events=0&sfx=0", false);
await check("night-off", "tod=night&events=0&sfx=0", false);
await check("force-off-morning", "tod=morning&sunbeam=0&events=0&sfx=0", false);

await browser.close();
if (process.exitCode) {
  console.error("FAIL sunbeam smoke");
  process.exit(1);
}
console.log("PASS sunbeam smoke");
