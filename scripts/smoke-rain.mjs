/** Smoke: window rain snapshot under ?tod=night&rain=1 and ?tod=day. */
import { chromium } from "playwright";

const base = process.env.SMOKE_URL || "http://127.0.0.1:5173";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

async function check(label, qs, expectActive) {
  await page.goto(`${base}/?${qs}`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 15000,
  });
  // allow one frame for rain sync after lighting
  await page.waitForTimeout(200);
  const rain = await page.evaluate(() => window.__HERMES_AREA__?.rain);
  const lighting = await page.evaluate(() => window.__HERMES_AREA__?.lighting);
  const ok =
    rain &&
    rain.emitterCount >= 1 &&
    rain.windowTiles >= 1 &&
    rain.active === expectActive;
  console.log(
    JSON.stringify({
      label,
      ok,
      lighting,
      rain,
      expectActive,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("force-on", "tod=day&rain=1&events=0", true);
await check("night-auto", "tod=night&rain=&events=0", true);
await check("evening-auto", "tod=evening&events=0", true);
await check("day-off", "tod=day&events=0", false);
await check("force-off-night", "tod=night&rain=0&events=0", false);

await browser.close();
if (process.exitCode) {
  console.error("FAIL rain smoke");
  process.exit(1);
}
console.log("PASS rain smoke");
