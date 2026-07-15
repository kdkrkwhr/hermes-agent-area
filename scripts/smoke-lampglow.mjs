/** Smoke: lamp glow GID20 under ?tod=night / day / lampglow=0. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const base = process.env.SMOKE_URL || "http://127.0.0.1:5173";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-lampglow";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

async function check(label, qs, expectActive) {
  await page.goto(`${base}/?${qs}`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 15000,
  });
  await page.waitForTimeout(400);
  const lampGlow = await page.evaluate(() => window.__HERMES_AREA__?.lampGlow);
  const lighting = await page.evaluate(() => window.__HERMES_AREA__?.lighting);
  const qsOff = qs.includes("lampglow=0");
  const ok =
    lampGlow &&
    lampGlow.active === expectActive &&
    (qsOff
      ? lampGlow.enabled === false
      : lampGlow.enabled === true && lampGlow.lampCount >= 1);
  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      lighting,
      lampGlow,
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
await check("force-off-night", "tod=night&lampglow=0&events=0&sfx=0", false);

await browser.close();
if (process.exitCode) {
  console.error("FAIL lampglow smoke");
  process.exit(1);
}
console.log("PASS lampglow smoke");
