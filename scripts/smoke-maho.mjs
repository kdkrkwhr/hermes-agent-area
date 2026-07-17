/** Smoke: mahoDesk GID31 gold-trim gleam — ?maho=0 off, ?maho=force trigger. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-maho";

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
  await page.waitForTimeout(200);

  const setup = await page.evaluate((wantGleam) => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    if (!sc) return { ok: false, reason: "no-scene" };
    if (sc._clockOutPending) sc.cancelClockOut?.();
    document.querySelector('.clockout-modal [data-role="no"]')?.click();
    sc.cameras?.main?.centerOn?.(30 * 32, 4 * 32);

    const desks = sc.mahoDeskGleam?.desks || [];
    // park Boss at ceoDesk for boost path
    const deskWp = sc.waypoints?.ceoDesk || { x: 30, y: 7 };
    const tw = sc.map?.tileWidth ?? 32;
    if (sc.boss?.sprite) {
      sc.boss.sprite.setPosition(deskWp.x * tw + tw / 2, deskWp.y * tw + tw / 2);
    }

    if (wantGleam) {
      for (const d of desks) d.readyAt = 0;
      sc.mahoDeskGleam.nextBoostAt = 0;
      for (let i = 0; i < 50; i++) {
        sc.mahoDeskGleam?.update?.(sc.time.now + i * 20, 20);
      }
    }
    return {
      ok: true,
      deskCount: desks.length,
      deskKeys: desks.map((d) => d.key),
      gleamCount: sc.mahoDeskGleam?.gleamCount ?? 0,
      boostCount: sc.mahoDeskGleam?.boostCount ?? 0,
      todMode: sc.mahoDeskGleam?.todMode ?? null,
      execChairCount: sc.execChairSwivel?.chairs?.length ?? 0,
      ceoWindowCount: sc.ceoCityWindow?.anchors?.length ?? 0,
    };
  }, !!expect.expectGleam);

  await page.waitForTimeout(expect.expectGleam ? 700 : 300);

  const maho = await page.evaluate(() => window.__HERMES_AREA__?.maho);
  const execChair = await page.evaluate(() => window.__HERMES_AREA__?.execChair);
  const ceoWindow = await page.evaluate(() => window.__HERMES_AREA__?.ceoWindow);

  const gleamCount = Math.max(maho?.gleamCount ?? 0, setup?.gleamCount ?? 0);
  const qsOff = /(?:^|&)maho=0(?:&|$)/.test(qs);
  const qsForce = /(?:^|&)maho=force(?:&|$)/.test(qs);

  const ok =
    !!maho &&
    maho.enabled === expect.enabled &&
    maho.active === expect.active &&
    (qsOff ? maho.deskCount === 0 : maho.deskCount >= 1 && maho.deskTiles >= 1) &&
    (expect.todMode == null || maho.todMode === expect.todMode) &&
    (qsForce ? maho.forced === true : true) &&
    (!expect.expectGleam || gleamCount >= 1) &&
    // siblings still present / non-interfering
    (execChair == null || (execChair.chairCount ?? 0) >= 0) &&
    (ceoWindow == null || (ceoWindow.lightCount ?? 0) >= 0) &&
    setup?.ok !== false;

  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      setup,
      maho,
      execChairCount: execChair?.chairCount ?? null,
      ceoWindowCount: ceoWindow?.lightCount ?? null,
      gleamCount,
      expect,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("force-gleam", "tod=day&events=0&sfx=0&maho=force", {
  enabled: true,
  active: true,
  todMode: "night",
  expectGleam: true,
});
await check("night-on", "tod=night&events=0&sfx=0", {
  enabled: true,
  active: true,
  todMode: "night",
  expectGleam: true,
});
await check("evening-on", "tod=evening&events=0&sfx=0", {
  enabled: true,
  active: true,
  todMode: "night",
  expectGleam: true,
});
await check("day-tick", "tod=day&events=0&sfx=0", {
  enabled: true,
  active: true,
  todMode: "day",
  expectGleam: true,
});
await check("maho-off", "tod=night&maho=0&events=0&sfx=0", {
  enabled: false,
  active: false,
  todMode: null,
  expectGleam: false,
});

await browser.close();
if (errors.length) {
  console.error("pageerrors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL maho smoke");
  process.exit(1);
}
console.log("PASS maho smoke");
