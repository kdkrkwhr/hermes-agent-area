/** Smoke: Nap Pod GID14 breathe under ?tod=night / day / nappod=0 / nappod=1. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.env.SMOKE_URL || "http://127.0.0.1:5173";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-nappod";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(45000);

async function check(label, qs, expect) {
  await page.goto(`${base}/?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(500);
  const nappod = await page.evaluate(() => window.__HERMES_AREA__?.nappod);
  const lighting = await page.evaluate(() => window.__HERMES_AREA__?.lighting);
  const qsOff = qs.includes("nappod=0");
  const qsForce = /(?:^|&)nappod=1(?:&|$)/.test(qs);
  const ok =
    nappod &&
    nappod.active === expect.active &&
    (qsOff
      ? nappod.enabled === false
      : nappod.enabled === true && nappod.podCount >= 1) &&
    (expect.todScale == null || Math.abs(nappod.todScale - expect.todScale) < 0.05) &&
    (qsForce ? nappod.forced === true && nappod.todScale === 1 : true);
  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      lighting,
      nappod,
      expect,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("night-on", "tod=night&events=0&sfx=0", { active: true, todScale: 1 });
await check("evening-on", "tod=evening&events=0&sfx=0", { active: true, todScale: 1 });
await check("day-weak", "tod=day&events=0&sfx=0", { active: true, todScale: 0.35 });
await check("morning-weak", "tod=morning&events=0&sfx=0", { active: true, todScale: 0.42 });
await check("force-night", "tod=day&nappod=1&events=0&sfx=0", { active: true, todScale: 1 });
await check("force-off-night", "tod=night&nappod=0&events=0&sfx=0", { active: false });

await browser.close();
if (process.exitCode) {
  console.error("FAIL nappod smoke");
  process.exit(1);
}
console.log("PASS nappod smoke");
