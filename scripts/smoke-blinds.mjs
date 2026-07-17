/** Smoke: TOD window blinds under ?tod=morning/night + blinds=0/1. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.env.SMOKE_URL || "http://127.0.0.1:5173";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-blinds";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(45000);

async function check(label, qs, expect) {
  await page.goto(`${base}/?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(400);

  const blinds = await page.evaluate(() => window.__HERMES_AREA__?.blinds);
  const lighting = await page.evaluate(() => window.__HERMES_AREA__?.lighting);
  const rain = await page.evaluate(() => window.__HERMES_AREA__?.rain);
  const birds = await page.evaluate(() => window.__HERMES_AREA__?.birds);

  const qsOff = /(?:^|&)blinds=0(?:&|$)/.test(qs);
  const coverOk =
    expect.coverMin == null ||
    (blinds &&
      blinds.cover >= expect.coverMin &&
      blinds.cover <= expect.coverMax);

  const ok =
    blinds &&
    blinds.active === expect.active &&
    (qsOff ? blinds.enabled === false : blinds.enabled === true) &&
    (qsOff ? true : blinds.windowTiles >= 1) &&
    coverOk &&
    // outdoor FX still publish (not wiped by blinds)
    rain != null &&
    birds != null;

  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      lighting,
      blinds,
      expect,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("morning-open", "tod=morning&events=0&sfx=0&weatherfx=0", {
  active: true,
  coverMin: 0.05,
  coverMax: 0.25,
});
await check("day-open", "tod=day&events=0&sfx=0&weatherfx=0", {
  active: true,
  coverMin: 0.05,
  coverMax: 0.25,
});
await check("evening-half", "tod=evening&events=0&sfx=0&weatherfx=0", {
  active: true,
  coverMin: 0.4,
  coverMax: 0.6,
});
await check("night-closed", "tod=night&events=0&sfx=0&weatherfx=0", {
  active: true,
  coverMin: 0.75,
  coverMax: 1,
});
await check("force-off", "tod=night&blinds=0&events=0&sfx=0&weatherfx=0", {
  active: false,
});
await check("force-on-night", "tod=night&blinds=1&events=0&sfx=0&weatherfx=0", {
  active: true,
  coverMin: 0.75,
  coverMax: 1,
});

await browser.close();
if (process.exitCode) {
  console.error("FAIL blinds smoke");
  process.exit(1);
}
console.log("PASS blinds smoke");
