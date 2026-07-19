/** Smoke: War Room whiteboard vote stickers. ?wbvote=force / =0. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-wbvote";

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
    return !!sc?.whiteboardVote;
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
  await boot(page, "wbvote=force&events=0&sfx=0&tod=day");

  await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const fx = sc?.whiteboardVote;
    if (!fx) return;
    // center camera on board
    if (fx.anchor) sc.cameras?.main?.centerOn?.(fx.anchor.x, fx.anchor.y);
    fx.burst("smoke");
    for (let i = 0; i < 3; i++) {
      fx.update(sc.time.now + 4000 + i * 2500, 200);
    }
  });
  await page.waitForTimeout(600);

  const snap = await page.evaluate(() => window.__HERMES_AREA__?.whiteboardVote);
  const scribble = await page.evaluate(() => window.__HERMES_AREA__?.whiteboardScribble);
  const ticker = await page.evaluate(() => window.__HERMES_AREA__?.whiteboardTicker);
  const ok =
    !!snap &&
    snap.enabled === true &&
    snap.forced === true &&
    snap.active === true &&
    (snap.tiles ?? 0) >= 1 &&
    (snap.count ?? 0) >= 3 &&
    snap.depth === 7.5 &&
    snap.busy === true &&
    scribble != null &&
    ticker != null;

  const shot = `${shotDir}/force-on.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label: "force-on",
      ok,
      snap,
      scribbleDepth: scribble?.depth,
      ticker: !!ticker,
      shot,
    }),
  );
  await page.close();
  if (!ok) process.exitCode = 1;
  return ok;
}

async function checkOff() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  await boot(page, "wbvote=0&events=0&sfx=0&tod=day");
  await page.waitForTimeout(300);

  const snap = await page.evaluate(() => window.__HERMES_AREA__?.whiteboardVote);
  const ok =
    !!snap &&
    snap.enabled === false &&
    snap.active === false &&
    snap.forced === false &&
    (snap.count ?? 0) === 0;

  const shot = `${shotDir}/force-off.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(JSON.stringify({ label: "wbvote-off", ok, snap, shot }));
  await page.close();
  if (!ok) process.exitCode = 1;
  return ok;
}

async function checkInteract() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  await boot(page, "wbvote=1&events=0&sfx=0&tod=day");

  const result = await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const fx = sc?.whiteboardVote;
    const ri = sc?.roomInteract;
    if (!fx?.anchor || !sc.boss?.sprite || !ri) return { ok: false, reason: "missing" };
    const before = fx.stickers?.length ?? 0;
    sc.boss.sprite.setPosition(fx.anchor.x + 8, fx.anchor.y + 40);
    const consumed = ri.startWhiteboardVote();
    const toast = document.querySelector(".room-toast")?.textContent || "";
    const after = fx.stickers?.length ?? 0;
    const action = ri.lastAction;
    return {
      ok: consumed === true && toast.includes("투표") && after >= before,
      before,
      after,
      toast,
      action,
      burstCount: fx.burstCount,
    };
  });
  await page.waitForTimeout(300);
  const snap = await page.evaluate(() => window.__HERMES_AREA__?.whiteboardVote);
  const ok = result.ok === true && (snap?.burstCount ?? 0) >= 1;
  const shot = `${shotDir}/interact.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(JSON.stringify({ label: "interact", ok, result, snap, shot }));
  await page.close();
  if (!ok) process.exitCode = 1;
  return ok;
}

await checkForce();
await checkOff();
await checkInteract();

await browser.close();
if (errors.length) {
  console.error("pageerrors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL wbvote smoke");
  process.exit(1);
}
console.log("PASS wbvote smoke");
