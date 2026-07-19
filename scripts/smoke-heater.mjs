/** Smoke: winter heater ambient — ?heater=force / summer / 0 + TOD glow. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-heater";

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
    () => window.__HERMES_AREA__?.heater != null,
    null,
    { timeout: 10000 },
  );
  await page.waitForTimeout(700);

  const setup = await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const fx = sc?.winterHeater;
    return {
      hasFx: !!fx,
      gfxDepth: fx?.gfx?.depth ?? null,
      emitterDepth: fx?.emitters?.[0]?.depth ?? null,
      lampDepth: sc?.lampGlow?.gfx?.depth ?? null,
      agentDepth: 10,
    };
  });

  const heater = await page.evaluate(() => window.__HERMES_AREA__?.heater);
  const lighting = await page.evaluate(() => window.__HERMES_AREA__?.lighting);
  const depthOk =
    !expect.active ||
    (heater?.depth === 8 &&
      setup?.gfxDepth === 8 &&
      setup?.emitterDepth === 8 &&
      setup?.gfxDepth < setup?.agentDepth &&
      (setup?.lampDepth == null || setup.gfxDepth > setup.lampDepth));
  const ok =
    !!heater &&
    heater.enabled === expect.enabled &&
    heater.active === expect.active &&
    (expect.mode == null || heater.mode === expect.mode) &&
    (expect.enabled
      ? heater.emitterCount >= 2 &&
        heater.emitterCount <= 4 &&
        heater.siteCount >= 2
      : true) &&
    depthOk;

  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      lighting,
      heater,
      setup,
      expect,
      depthOk,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("force-evening", "heater=force&tod=evening&events=0&sfx=0", {
  enabled: true,
  active: true,
  mode: "force",
});
await check("force-night", "heater=force&tod=night&events=0&sfx=0", {
  enabled: true,
  active: true,
  mode: "force",
});
await check("summer-off", "heater=summer&tod=evening&events=0&sfx=0", {
  enabled: true,
  active: false,
  mode: "summer",
});
await check("heater-off", "heater=0&tod=evening&events=0&sfx=0", {
  enabled: false,
  active: false,
});

await browser.close();
if (errors.length) {
  console.error("pageerrors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL heater smoke");
  process.exit(1);
}
console.log("PASS heater smoke");
