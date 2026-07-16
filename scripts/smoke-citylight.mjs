/** Smoke: city-light twinkle under ?tod=night / day / citylight=0. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.env.SMOKE_URL || "http://127.0.0.1:5173";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-citylight";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(45000);

async function check(label, qs, expectActive) {
  await page.goto(`${base}/?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(600);
  const cityLights = await page.evaluate(() => window.__HERMES_AREA__?.cityLights);
  const lighting = await page.evaluate(() => window.__HERMES_AREA__?.lighting);
  const qsOff = qs.includes("citylight=0");
  const ok =
    cityLights &&
    cityLights.active === expectActive &&
    (qsOff
      ? cityLights.enabled === false
      : cityLights.enabled === true &&
        cityLights.lightCount >= 1 &&
        cityLights.lightCount <= 14);
  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      lighting,
      cityLights,
      expectActive,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("night-on", "tod=night&events=0&sfx=0", true);
await check("evening-on", "tod=evening&events=0&sfx=0", true);
await check("day-off", "tod=day&events=0&sfx=0", false);
await check("morning-off", "tod=morning&events=0&sfx=0", false);
await check("force-off-night", "tod=night&citylight=0&events=0&sfx=0", false);

await browser.close();
if (process.exitCode) {
  console.error("FAIL citylight smoke");
  process.exit(1);
}
console.log("PASS citylight smoke");
