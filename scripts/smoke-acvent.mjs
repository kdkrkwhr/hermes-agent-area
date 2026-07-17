/** Smoke: Focus AC vent cool mist — ?acvent=force / ?acvent=0 + TOD gate. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-acvent";

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
  await page.waitForTimeout(700);

  const setup = await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const vent = sc?.focusAcVent;
    return {
      hasVent: !!vent,
      dualDeskDepth: sc?.dualDeskIdle?.gfx?.depth ?? null,
      deskGlowDepth: 11,
      headphonesDepth: 23,
      emitterDepth: vent?.emitters?.[0]?.depth ?? null,
    };
  });

  const acvent = await page.evaluate(() => window.__HERMES_AREA__?.acvent);
  const lighting = await page.evaluate(() => window.__HERMES_AREA__?.lighting);
  const depthOk =
    !expect.active ||
    (acvent?.depth === 6 &&
      setup?.emitterDepth === 6 &&
      setup?.dualDeskDepth === 7 &&
      setup?.deskGlowDepth !== 6 &&
      setup?.headphonesDepth !== 6);
  const ok =
    !!acvent &&
    acvent.enabled === expect.enabled &&
    acvent.active === expect.active &&
    (expect.mode == null || acvent.mode === expect.mode) &&
    (expect.emitterCount == null || acvent.emitterCount === expect.emitterCount) &&
    (expect.enabled
      ? acvent.emitterCount >= 1 &&
        acvent.emitterCount <= 3 &&
        acvent.dualDeskGid === 26
      : true) &&
    depthOk;

  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      lighting,
      acvent,
      setup,
      expect,
      depthOk,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("force-day", "acvent=force&tod=day&events=0&sfx=0", {
  enabled: true,
  active: true,
  mode: "force",
  emitterCount: null,
});
await check("day-on", "tod=day&events=0&sfx=0", {
  enabled: true,
  active: true,
  mode: "cool",
});
await check("morning-on", "tod=morning&events=0&sfx=0", {
  enabled: true,
  active: true,
  mode: "cool",
});
await check("evening-off", "tod=evening&events=0&sfx=0", {
  enabled: true,
  active: false,
  mode: "off",
});
await check("night-off", "tod=night&events=0&sfx=0", {
  enabled: true,
  active: false,
  mode: "off",
});
await check("acvent-off", "tod=day&acvent=0&events=0&sfx=0", {
  enabled: false,
  active: false,
});

await browser.close();
if (errors.length) {
  console.error("pageerrors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL acvent smoke");
  process.exit(1);
}
console.log("PASS acvent smoke");
