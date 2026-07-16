/** Smoke: window rain snapshot under ?tod=night&rain=1 and ?tod=day. */
import { chromium } from "playwright";

const base = process.env.SMOKE_URL || "http://127.0.0.1:5173/hermes-agent-area";

const browser = await chromium.launch({ headless: true });

async function check(label, qs, expectActive) {
  const page = await browser.newPage();
  try {
    await page.goto(`${base}/?${qs}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
      timeout: 20000,
    });
    await page.waitForFunction(
      () =>
        window.__HERMES_AREA__?.rain &&
        window.__HERMES_AREA__.rain.emitterCount >= 1 &&
        window.__HERMES_AREA__.rain.windowTiles >= 1,
      null,
      { timeout: 10000 },
    );
    await page.waitForTimeout(400);
    const snap = await page.evaluate(() => ({
      rain: window.__HERMES_AREA__?.rain,
      lighting: window.__HERMES_AREA__?.lighting,
    }));
    const ok = !!snap.rain && snap.rain.active === expectActive;
    console.log(JSON.stringify({ label, ok, ...snap, expectActive }));
    if (!ok) process.exitCode = 1;
    return ok;
  } finally {
    await page.close();
  }
}

// weatherfx=0: isolate TOD/?rain= from live desk-brief weather
await check("force-on", "tod=day&rain=1&events=0&weatherfx=0", true);
await check("night-auto", "tod=night&events=0&weatherfx=0", true);
await check("evening-auto", "tod=evening&events=0&weatherfx=0", true);
await check("day-off", "tod=day&events=0&weatherfx=0", false);
await check("force-off-night", "tod=night&rain=0&events=0&weatherfx=0", false);

await browser.close();
if (process.exitCode) {
  console.error("FAIL rain smoke");
  process.exit(1);
}
console.log("PASS rain smoke");
