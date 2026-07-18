/** Smoke: non-lobby GID19 soft glitter. `?wallposter=force` / `?poster=0`. */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "smoke-wallposter");
fs.mkdirSync(outDir, { recursive: true });

const base = process.env.SMOKE_URL || "http://127.0.0.1:5173/hermes-agent-area/";
const browser = await chromium.launch({ headless: true });
const errors = [];

async function boot(url) {
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 15000,
  });
  await page.waitForFunction(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    return !!sc?.wallPosterAmbient;
  }, null, { timeout: 20000 });
  await page.waitForTimeout(400);
  await page.mouse.click(80, 80);
  await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    if (sc?._clockOutPending) sc.cancelClockOut?.();
    document.querySelector('.clockout-modal [data-role="no"]')?.click();
  });
  await page.waitForTimeout(200);
  return page;
}

const pageForce = await boot(`${base}?events=0&sfx=0&poster=force`);
const force = await pageForce.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const wp = sc?.wallPosterAmbient;
  if (!wp) return { ok: false, why: "no-wallPosterAmbient" };
  const a = wp.snapshot();
  const p0 = wp.phases?.[0] ?? 0;
  wp.update(sc.time.now, 1200);
  const b = wp.snapshot();
  const phaseMoved = Math.abs((b.phases?.[0] ?? 0) - p0) > 0.02;
  const lobbyOverlap = (a.posters || []).some(
    (p) => p.ty >= 25 && p.ty <= 28 && p.tx >= 14 && p.tx <= 26,
  );
  return {
    ok:
      a.enabled === true &&
      a.forced === true &&
      b.active === true &&
      a.posterGid === 19 &&
      (a.posterCount ?? 0) >= 1 &&
      (a.posterCount ?? 0) <= (a.maxTiles ?? 12) &&
      !lobbyOverlap &&
      phaseMoved,
    phaseMoved,
    lobbyOverlap,
    a,
    b,
  };
});
await pageForce.screenshot({
  path: path.join(outDir, "force-on.png"),
  fullPage: false,
});
await pageForce.close();

const pageWall = await boot(`${base}?events=0&sfx=0&wallposter=force`);
const wallForce = await pageWall.evaluate(() => {
  const snap = window.__HERMES_AREA__?.wallPoster;
  return {
    ok: !!snap && snap.enabled === true && snap.forced === true && snap.active === true,
    snap,
  };
});
await pageWall.screenshot({
  path: path.join(outDir, "wallposter-force.png"),
  fullPage: false,
});
await pageWall.close();

const pageOff = await boot(`${base}?poster=0&events=0&sfx=0`);
const off = await pageOff.evaluate(() => {
  const lp = window.__HERMES_AREA__?.poster;
  const wp = window.__HERMES_AREA__?.wallPoster;
  return {
    ok:
      lp?.enabled === false &&
      lp?.active === false &&
      wp?.enabled === false &&
      wp?.active === false,
    lp,
    wp,
  };
});
await pageOff.screenshot({
  path: path.join(outDir, "poster-off.png"),
  fullPage: false,
});
await pageOff.close();

const out = { force, wallForce, off, errors };
console.log(JSON.stringify(out, null, 2));

const fail =
  !force.ok || !wallForce.ok || !off.ok || errors.length;

await browser.close().catch(() => {});
process.exit(fail ? 1 : 0);
