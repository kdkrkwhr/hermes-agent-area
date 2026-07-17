/** Smoke: War Room whiteboard chalk scribble. ?scribble=force / =0. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-scribble";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];

async function boot(page, qs) {
  const root = base.replace(/\/?$/, "/");
  await page.goto(`${root}?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  await page.waitForFunction(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    return !!sc?.whiteboardScribble;
  }, null, { timeout: 20000 });
  await page.waitForTimeout(400);
  await page.mouse.click(80, 80);
  await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    if (sc?._clockOutPending) sc.cancelClockOut?.();
    document.querySelector('.clockout-modal [data-role="no"]')?.click();
  });
  await page.waitForTimeout(200);
}

async function checkForce() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  await boot(page, "scribble=force&events=0&sfx=0&tod=day");

  // force bursts on construct; nudge update + ticker change for more strokes
  await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const fx = sc?.whiteboardScribble;
    if (!fx) return;
    fx.burst("smoke");
    for (let i = 0; i < 4; i++) {
      fx.update(sc.time.now + 5000 + i * 2000, 200);
    }
    fx.updateFromSnapshot({
      stats: { raw: { running: 2, blocked: 1, ready: 3, review: 0 } },
    });
  });
  await page.waitForTimeout(500);

  const snap = await page.evaluate(() => window.__HERMES_AREA__?.whiteboardScribble);
  const ticker = await page.evaluate(() => window.__HERMES_AREA__?.whiteboardTicker);
  const ok =
    !!snap &&
    snap.enabled === true &&
    snap.forced === true &&
    snap.active === true &&
    (snap.tiles ?? 0) >= 1 &&
    (snap.strokeCount ?? 0) >= 2 &&
    snap.depth === 7 &&
    ticker != null;

  const shot = `${shotDir}/force-on.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(JSON.stringify({ label: "force-on", ok, snap, ticker: !!ticker, shot }));
  await page.close();
  if (!ok) process.exitCode = 1;
  return ok;
}

async function checkOff() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  await boot(page, "scribble=0&events=0&sfx=0&tod=day");
  await page.waitForTimeout(300);

  const snap = await page.evaluate(() => window.__HERMES_AREA__?.whiteboardScribble);
  const ok =
    !!snap &&
    snap.enabled === false &&
    snap.active === false &&
    snap.forced === false &&
    (snap.strokeCount ?? 0) === 0;

  const shot = `${shotDir}/force-off.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(JSON.stringify({ label: "scribble-off", ok, snap, shot }));
  await page.close();
  if (!ok) process.exitCode = 1;
  return ok;
}

await checkForce();
await checkOff();

await browser.close();
if (errors.length) {
  console.error("pageerrors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL scribble smoke");
  process.exit(1);
}
console.log("PASS scribble smoke");
