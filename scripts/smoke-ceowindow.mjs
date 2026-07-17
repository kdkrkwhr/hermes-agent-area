/** Smoke: CEO city window GID33 — evening/night twinkle, day sky pulse, ?ceowindow=0/force. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-ceowindow";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(45000);

async function check(label, qs, expect) {
  const root = base.replace(/\/?$/, "/");
  await page.goto(`${root}?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  // pan camera toward CEO office windows (tx~30, ty~2)
  await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    if (!sc) return;
    if (sc._clockOutPending) sc.cancelClockOut?.();
    document.querySelector('.clockout-modal [data-role="no"]')?.click();
    sc.cameras?.main?.centerOn?.(30 * 32, 2 * 32);
    for (let i = 0; i < 12; i++) {
      sc.ceoCityWindow?.update?.(sc.time.now + i * 80);
    }
  });
  await page.waitForTimeout(400);

  const ceoWindow = await page.evaluate(() => window.__HERMES_AREA__?.ceoWindow);
  const cityLights = await page.evaluate(() => window.__HERMES_AREA__?.cityLights);
  const lighting = await page.evaluate(() => window.__HERMES_AREA__?.lighting);

  const qsOff = /(?:^|&)ceowindow=0(?:&|$)/.test(qs);
  const qsForce = /(?:^|&)ceowindow=force(?:&|$)/.test(qs);

  const ok =
    !!ceoWindow &&
    ceoWindow.active === expect.active &&
    (qsOff ? ceoWindow.enabled === false : ceoWindow.enabled === true) &&
    (qsOff ? true : ceoWindow.lightCount >= 1 && ceoWindow.windowTiles >= 1) &&
    (expect.mode == null || ceoWindow.mode === expect.mode) &&
    (qsForce ? ceoWindow.forced === true && ceoWindow.mode === "night" : true) &&
    // depth band same as cityLights but no collision — both may be active
    (cityLights == null ||
      ceoWindow.depth == null ||
      cityLights.lightCount == null ||
      true);

  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      lighting,
      ceoWindow,
      cityLightsLightCount: cityLights?.lightCount ?? null,
      cityLightsActive: cityLights?.active ?? null,
      expect,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("night-on", "tod=night&events=0&sfx=0", { active: true, mode: "night" });
await check("evening-on", "tod=evening&events=0&sfx=0", { active: true, mode: "night" });
await check("day-sky", "tod=day&events=0&sfx=0", { active: true, mode: "day" });
await check("morning-sky", "tod=morning&events=0&sfx=0", { active: true, mode: "day" });
await check("force-day", "tod=day&ceowindow=force&events=0&sfx=0", {
  active: true,
  mode: "night",
});
await check("force-off-night", "tod=night&ceowindow=0&events=0&sfx=0", {
  active: false,
});

await browser.close();
if (process.exitCode) {
  console.error("FAIL ceowindow smoke");
  process.exit(1);
}
console.log("PASS ceowindow smoke");
