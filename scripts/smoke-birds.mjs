/** Smoke: window bird flyby under ?tod=day / night / birds=0 / birds=1 / fast. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.env.SMOKE_URL || "http://127.0.0.1:5173";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-birds";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

async function check(label, qs, expect, opts = {}) {
  await page.goto(`${base}/?${qs}`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 15000,
  });

  if (opts.waitFly) {
    await page.waitForFunction(
      () => {
        const b = window.__HERMES_AREA__?.birds;
        return b && (b.flying === true || b.flyCount >= 1);
      },
      null,
      { timeout: opts.waitFlyMs ?? 8000 },
    );
  } else {
    await page.waitForTimeout(500);
  }

  const birds = await page.evaluate(() => window.__HERMES_AREA__?.birds);
  const lighting = await page.evaluate(() => window.__HERMES_AREA__?.lighting);
  const qsOff = /(?:^|&)birds=0(?:&|$)/.test(qs);
  const qsForce = /(?:^|&)birds=(?:1|fast)(?:&|$)/.test(qs);
  const qsFast = /(?:^|&)birds=fast(?:&|$)/.test(qs);

  const ok =
    birds &&
    birds.active === expect.active &&
    (qsOff
      ? birds.enabled === false
      : birds.enabled === true && birds.windowTiles >= 1) &&
    (qsForce ? birds.forced === true : birds.forced === false) &&
    (qsFast ? birds.fast === true : birds.fast === false) &&
    (opts.expectFlying
      ? birds.flying === true || birds.flyCount >= 1
      : true);

  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      lighting,
      birds,
      expect,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("day-on", "tod=day&events=0&sfx=0&weatherfx=0", { active: true });
await check("morning-on", "tod=morning&events=0&sfx=0&weatherfx=0", {
  active: true,
});
await check("night-off", "tod=night&events=0&sfx=0&weatherfx=0", {
  active: false,
});
await check("evening-off", "tod=evening&events=0&sfx=0&weatherfx=0", {
  active: false,
});
await check("force-off", "tod=day&birds=0&events=0&sfx=0&weatherfx=0", {
  active: false,
});
await check(
  "force-flyby",
  "tod=day&birds=1&events=0&sfx=0&weatherfx=0",
  { active: true },
  { waitFly: true, expectFlying: true, waitFlyMs: 8000 },
);
await check(
  "fast-flyby",
  "tod=night&birds=fast&events=0&sfx=0&weatherfx=0",
  { active: true },
  { waitFly: true, expectFlying: true, waitFlyMs: 8000 },
);

await browser.close();
if (process.exitCode) {
  console.error("FAIL birds smoke");
  process.exit(1);
}
console.log("PASS birds smoke");
