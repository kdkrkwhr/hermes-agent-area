/** Smoke: lamp moths under ?tod=night / day / moths=0 / moths=1 force. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.env.SMOKE_URL || "http://127.0.0.1:5173";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-moths";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

async function check(label, qs, expectActive, opts = {}) {
  await page.goto(`${base}/?${qs}`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 15000,
  });
  // let a couple orbit frames paint
  await page.waitForTimeout(600);
  const moths = await page.evaluate(() => window.__HERMES_AREA__?.moths);
  const lighting = await page.evaluate(() => window.__HERMES_AREA__?.lighting);
  const qsOff = qs.includes("moths=0");
  const qsForce = /(?:^|&)moths=1(?:&|$)/.test(qs);
  const ok =
    moths &&
    moths.active === expectActive &&
    (qsOff
      ? moths.enabled === false
      : moths.enabled === true && moths.count >= 1 && moths.lampCount >= 1) &&
    (qsForce ? moths.forced === true : moths.forced === false) &&
    (opts.minCount == null || moths.count >= opts.minCount);
  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      lighting,
      moths,
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
await check("force-on-day", "tod=day&moths=1&events=0&sfx=0", true);
await check("force-off-night", "tod=night&moths=0&events=0&sfx=0", false);

await browser.close();
if (process.exitCode) {
  console.error("FAIL moths smoke");
  process.exit(1);
}
console.log("PASS moths smoke");
