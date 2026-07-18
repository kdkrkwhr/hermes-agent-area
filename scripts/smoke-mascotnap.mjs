/** Smoke: mascot ambient nap — pathfind sleep zone + curl + fx-zzz.
 *  `?mascotnap=force&tod=night` · skip when ?mascot=0 / ?mascotnap=0 · zoomies/pet skip.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-mascotnap";
mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];

async function boot(qs) {
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  const root = base.replace(/\/?$/, "/");
  const url = qs ? `${root}?${qs}` : root;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 20000,
  });
  await page.waitForFunction(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    return !!(sc?.pathfinder && sc?._visualEffectsReady);
  }, null, { timeout: 20000 });
  await page.waitForTimeout(300);
  return page;
}

// --- force + night ---
const page = await boot("mascotnap=force&tod=night&sfx=0");
await page.waitForFunction(
  () => {
    const s = window.__HERMES_AREA__?.mascotNap;
    return s?.enabled && (s?.sleeping || s?.pathing || (s?.fireCount ?? 0) > 0);
  },
  null,
  { timeout: 12000 },
);

// wait until curl near sleep (path may take a few seconds)
await page.waitForFunction(
  () => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const m = sc?.mascot;
    if (!m?.isNapping?.()) return false;
    const sleep = sc?.waypoints?.sleep || { x: 31, y: 21 };
    const tw = sc?.map?.tileWidth || 32;
    const dist = Math.hypot(
      m.sprite.x / tw - sleep.x,
      m.sprite.y / tw - sleep.y,
    );
    return dist <= 5.5;
  },
  null,
  { timeout: 25000 },
);

await page.waitForTimeout(900);

const forced = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const m = sc?.mascot;
  const kids = sc?.children?.list || [];
  const zzz = kids.some(
    (c) => c?.type === "ParticleEmitter" && c?.texture?.key === "fx-zzz",
  );
  const nap = window.__HERMES_AREA__?.mascotNap ?? sc?.mascotNap?.snapshot?.();
  const sleep = sc?.waypoints?.sleep || { x: 31, y: 21 };
  const tw = sc?.map?.tileWidth || 32;
  const mx = m?.sprite?.x ?? 0;
  const my = m?.sprite?.y ?? 0;
  const distTiles = Math.hypot(mx / tw - sleep.x, my / tw - sleep.y);
  return {
    nap,
    isNapping: !!m?.isNapping?.(),
    scaleY: m?.sprite?.scaleY ?? null,
    zzz,
    distTiles,
    lighting: sc?.lightingPreset?.name ?? null,
    hasMascot: !!m?.sprite,
  };
});

await page
  .screenshot({ path: `${shotDir}/force-night.png`, fullPage: false })
  .catch(() => {});
await page.close();

// --- off ---
const pageOff = await boot("mascotnap=0&tod=night&sfx=0");
await pageOff.waitForTimeout(800);
const off = await pageOff.evaluate(() => {
  const nap = window.__HERMES_AREA__?.mascotNap;
  return {
    enabled: nap?.enabled,
    sleeping: nap?.sleeping,
    fireCount: nap?.fireCount ?? 0,
    state: nap?.state,
  };
});
await pageOff
  .screenshot({ path: `${shotDir}/off.png`, fullPage: false })
  .catch(() => {});
await pageOff.close();

// --- no mascot ---
const pageNo = await boot("mascot=0&mascotnap=force&tod=night&sfx=0");
await pageNo.waitForTimeout(1200);
const noMascot = await pageNo.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const nap = window.__HERMES_AREA__?.mascotNap ?? sc?.mascotNap?.snapshot?.();
  return {
    hasMascot: !!sc?.mascot?.sprite,
    fireCount: nap?.fireCount ?? 0,
    sleeping: !!nap?.sleeping,
    state: nap?.state,
  };
});
await pageNo
  .screenshot({ path: `${shotDir}/no-mascot.png`, fullPage: false })
  .catch(() => {});
await pageNo.close();

// --- skip while zoomies ---
const pageZ = await boot("mascotnap=force&tod=night&sfx=0");
await pageZ.waitForFunction(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  return !!(sc?.mascot?.sprite && sc?.officeEvents);
}, null, { timeout: 15000 });

const zoomiesSkip = await pageZ.evaluate(async () => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const m = sc.mascot;
  const mn = sc.mascotNap;
  // force zoomies before nap can complete
  m.endNap?.();
  mn.cancelApproach?.();
  mn.state = "idle";
  mn.nextAt = sc.time.now + 50000;
  const dests = (m.loungeSpots?.() || []).slice(0, 3);
  m.startZoomies(6000, dests);
  mn.nextAt = sc.time.now - 1;
  mn.forced = true;
  await mn.beginApproach(sc.time.now);
  // should have deferred / stayed blocked
  const after = mn.snapshot();
  return {
    isZoomies: !!m.isZoomies?.(),
    napState: after.state,
    sleeping: after.sleeping,
    isNapping: !!m.isNapping?.(),
  };
});
await pageZ
  .screenshot({ path: `${shotDir}/zoomies-skip.png`, fullPage: false })
  .catch(() => {});
await pageZ.close();

const result = { forced, off, noMascot, zoomiesSkip, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (!forced.hasMascot) {
  console.error("FAIL: expected mascot", forced);
  process.exit(1);
}
if (!forced.nap?.enabled || !forced.nap?.forced) {
  console.error("FAIL: mascotnap force not enabled", forced.nap);
  process.exit(1);
}
if (!forced.isNapping && !forced.nap?.sleeping && !(forced.nap?.fireCount > 0)) {
  console.error("FAIL: force should nap", forced);
  process.exit(1);
}
if ((forced.scaleY ?? 1) > 0.95 && !forced.isNapping) {
  console.error("FAIL: curl scale expected while napping", forced);
  process.exit(1);
}
if (forced.distTiles > 6) {
  console.error("FAIL: should be near sleep zone", forced);
  process.exit(1);
}
if (off.enabled !== false) {
  console.error("FAIL: mascotnap=0 should disable", off);
  process.exit(1);
}
if (noMascot.hasMascot || noMascot.fireCount > 0 || noMascot.sleeping) {
  console.error("FAIL: mascot=0 should no-op nap", noMascot);
  process.exit(1);
}
if (zoomiesSkip.isNapping || zoomiesSkip.sleeping) {
  console.error("FAIL: zoomies should block nap start", zoomiesSkip);
  process.exit(1);
}

console.log(
  "PASS: mascotNap fireCount=",
  forced.nap?.fireCount,
  "dist=",
  forced.distTiles?.toFixed?.(1),
  "zzz=",
  forced.zzz,
);
