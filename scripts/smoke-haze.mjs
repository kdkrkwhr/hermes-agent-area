/** Smoke: summer haze ambient — ?haze=force / 0 + TOD sync. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-haze";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(45000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function check(label, qs, expect) {
  const root = base.replace(/\/?$/, "/");
  await page.goto(`${root}?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  await page.waitForFunction(
    () => window.__HERMES_AREA__?.haze != null,
    null,
    { timeout: 10000 },
  );
  await page.waitForTimeout(700);

  const setup = await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const fx = sc?.summerHaze;
    return {
      hasFx: !!fx,
      gfxDepth: fx?.gfx?.depth ?? null,
      emitterDepth: fx?.emitters?.[0]?.depth ?? null,
      heaterDepth: sc?.winterHeater?.gfx?.depth ?? null,
      dustDepth: sc?.dustMotes?.emitter?.depth ?? null,
      agentDepth: 10,
    };
  });

  const haze = await page.evaluate(() => window.__HERMES_AREA__?.haze);
  const lighting = await page.evaluate(() => window.__HERMES_AREA__?.lighting);
  const depthOk =
    !expect.active ||
    (haze?.depth === 8.5 &&
      setup?.gfxDepth === 8.5 &&
      setup?.emitterDepth === 8.5 &&
      setup?.gfxDepth < setup?.agentDepth &&
      (setup?.heaterDepth == null || setup.gfxDepth !== setup.heaterDepth));
  const ok =
    !!haze &&
    haze.enabled === expect.enabled &&
    haze.active === expect.active &&
    (expect.mode == null || haze.mode === expect.mode) &&
    (expect.tod == null || haze.tod === expect.tod || lighting === expect.tod) &&
    (expect.enabled
      ? haze.emitterCount >= 2 &&
        haze.emitterCount <= 3 &&
        haze.siteCount >= 2 &&
        haze.siteCount <= 3
      : true) &&
    depthOk;

  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      lighting,
      haze,
      setup,
      expect,
      depthOk,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("force-day", "haze=force&tod=day&events=0&sfx=0", {
  enabled: true,
  active: true,
  mode: "force",
  tod: "day",
});
await check("force-evening", "haze=force&tod=evening&events=0&sfx=0", {
  enabled: true,
  active: true,
  mode: "force",
  tod: "evening",
});
await check("force-night", "haze=force&tod=night&events=0&sfx=0", {
  enabled: true,
  active: true,
  mode: "force",
  tod: "night",
});
await check("haze-off", "haze=0&tod=day&events=0&sfx=0", {
  enabled: false,
  active: false,
});

await browser.close();
if (errors.length) {
  console.error("pageerrors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL haze smoke");
  process.exit(1);
}
console.log("PASS haze smoke");
