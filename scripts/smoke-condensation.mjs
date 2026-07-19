/** Smoke: morning window condensation — ?condensation=force / ?condensation=0 + TOD gate. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-condensation";

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
  await page.waitForTimeout(900);

  const setup = await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const fx = sc?.windowCondensation;
    return {
      hasFx: !!fx,
      gfxDepth: fx?.gfx?.depth ?? null,
      emitterDepth: fx?.emitters?.[0]?.depth ?? null,
      blindsDepth: sc?.windowBlinds?.gfx?.depth ?? null,
      rainDepth: 4,
      agentDepth: 10,
    };
  });

  const condensation = await page.evaluate(() => window.__HERMES_AREA__?.condensation);
  const lighting = await page.evaluate(() => window.__HERMES_AREA__?.lighting);
  const depthOk =
    !expect.active ||
    (condensation?.depth === 5.2 &&
      setup?.gfxDepth === 5.2 &&
      setup?.gfxDepth > setup?.rainDepth &&
      setup?.gfxDepth < setup?.agentDepth &&
      (setup?.blindsDepth == null || Math.abs(setup.gfxDepth - setup.blindsDepth) < 1));
  const ok =
    !!condensation &&
    condensation.enabled === expect.enabled &&
    condensation.active === expect.active &&
    (expect.mode == null || condensation.mode === expect.mode) &&
    (expect.enabled
      ? condensation.emitterCount >= 1 &&
        condensation.emitterCount <= 6 &&
        condensation.windowTiles >= 1
      : true) &&
    depthOk;

  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      lighting,
      condensation,
      setup,
      expect,
      depthOk,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("force-morning", "condensation=force&tod=morning&events=0&sfx=0&weatherfx=0&rain=0&snow=0&fog=0", {
  enabled: true,
  active: true,
  mode: "force",
});
await check("morning-on", "tod=morning&events=0&sfx=0&weatherfx=0&rain=0&snow=0&fog=0", {
  enabled: true,
  active: true,
  mode: "haze",
});
await check("day-off", "tod=day&events=0&sfx=0&weatherfx=0&rain=0&snow=0&fog=0", {
  enabled: true,
  active: false,
  mode: "off",
});
await check("evening-off", "tod=evening&events=0&sfx=0&weatherfx=0&rain=0&snow=0&fog=0", {
  enabled: true,
  active: false,
  mode: "off",
});
await check("night-off", "tod=night&events=0&sfx=0&weatherfx=0&rain=0&snow=0&fog=0", {
  enabled: true,
  active: false,
  mode: "off",
});
await check("condensation-off", "tod=morning&condensation=0&events=0&sfx=0&weatherfx=0&rain=0&snow=0&fog=0", {
  enabled: false,
  active: false,
});

await browser.close();
if (errors.length) {
  console.error("pageerrors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL condensation smoke");
  process.exit(1);
}
console.log("PASS condensation smoke");
