/** Smoke: fire_drill — toast + red pulse + idle gather to entrance. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&tod=day`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-firedrill";
mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(url, {
  waitUntil: "networkidle",
  timeout: 30000,
});

await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
  timeout: 15000,
});
await page.waitForFunction(
  () => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    return !!(
      sc?.officeEvents &&
      sc?.lightingOverlay &&
      sc?.lightingPreset &&
      (sc.agents?.length ?? 0) >= 2
    );
  },
  null,
  { timeout: 15000 },
);

const before = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.enabled = true;
  if (oe._schedule) {
    oe._schedule.remove(false);
    oe._schedule = null;
  }
  // clear gather lock so fire_drill doesn't skip
  oe._gatherUntil = 0;

  const agents = sc.agents || [];
  // park near lobby so pathfind to entrance finishes inside smoke budget
  for (const a of agents) {
    a.live = false;
    a.serverStatus = null;
    a.currentKind = "break";
    a.path = [];
    a.pathIndex = 0;
    a.busy = false;
    a.idleUntil = sc.time.now + 999999;
    a.sprite.setPosition(18 * 32 + 16, 24 * 32 + 16);
  }

  const p = sc.lightingPreset;
  return {
    presetName: p?.name ?? null,
    presetColor: p?.color ?? null,
    presetAlpha: p?.alpha ?? null,
  };
});

const mid = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const startNow = sc.time.now;
  oe.fire("fire_drill");
  return {
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    gathering: oe.isGathering(),
    overlayFill: sc.lightingOverlay.fillColor,
    overlayAlpha: sc.lightingOverlay.fillAlpha,
    startNow,
  };
});

const sawRed =
  mid.overlayFill === 0xc42828 ||
  (await page
    .waitForFunction(
      () => {
        const ov =
          window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene")
            ?.lightingOverlay;
        return ov?.fillColor === 0xc42828;
      },
      null,
      { timeout: 2000 },
    )
    .then(() => true)
    .catch(() => false));

await page
  .screenshot({ path: `${shotDir}/firedrill-mid.png`, fullPage: false })
  .catch(() => {});

await page.waitForFunction(
  () => (window.__HERMES_AREA__?.events?.fireDrillGathered ?? 0) >= 1,
  null,
  { timeout: 45000 },
);

// wait past max pulse (12s) + buffer
await page.waitForFunction(
  (startNow) => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    return sc && sc.time.now - startNow >= 12500;
  },
  mid.startNow,
  { timeout: 25000 },
);
await page.waitForTimeout(150);

const after = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const p = sc.lightingPreset;
  const ent = sc.waypoints?.entrance || { x: 20, y: 27 };
  const agents = sc.agents || [];
  return {
    fireDrillGathered: oe.fireDrillGathered,
    presetName: p?.name ?? null,
    overlayFill: sc.lightingOverlay.fillColor,
    overlayFillAlpha: sc.lightingOverlay.fillAlpha,
    presetColor: p?.color ?? null,
    presetAlpha: p?.alpha ?? null,
    nearEntrance: agents.filter((a) => {
      const t = a.tilePos();
      return Math.abs(t.x - ent.x) <= 3 && Math.abs(t.y - ent.y) <= 3;
    }).length,
  };
});

await page
  .screenshot({ path: `${shotDir}/firedrill-after.png`, fullPage: false })
  .catch(() => {});

// overlap skip: gather lock → fire again should not re-toast / re-pulse
const skip = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.markGathering(5000);
  const countBefore = oe.eventCount;
  oe.fire("fire_drill");
  // runFireDrill skipped — lastEvent still set by fire(), but overlay shouldn't go red again
  // if already gathering at fire start: toast stays previous or empty of new pulse
  return {
    eventCountDelta: oe.eventCount - countBefore,
    gathering: oe.isGathering(),
    overlayFill: sc.lightingOverlay.fillColor,
  };
});

const result = { before, mid, sawRed, after, skip, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (mid.lastEvent !== "fire_drill") {
  console.error("FAIL: lastEvent should be fire_drill", mid.lastEvent);
  process.exit(1);
}
if (!String(mid.toast).includes("화재 대피 훈련")) {
  console.error("FAIL: toast should mention 화재 대피 훈련", mid.toast);
  process.exit(1);
}
if (!sawRed) {
  console.error("FAIL: expected red overlay pulse during fire_drill");
  process.exit(1);
}
if ((after.fireDrillGathered ?? 0) < 1) {
  console.error("FAIL: fire_drill should gather ≥1 idle agent", after);
  process.exit(1);
}
if (
  after.overlayFill !== after.presetColor ||
  Math.abs((after.overlayFillAlpha ?? 0) - (after.presetAlpha ?? 0)) > 0.001
) {
  console.error("FAIL: overlay should match lightingPreset after drill", after);
  process.exit(1);
}
if (after.presetName !== before.presetName) {
  console.error("FAIL: lightingPreset name should be unchanged", before, after);
  process.exit(1);
}
if (skip.overlayFill === 0xc42828) {
  console.error("FAIL: overlapping gather should skip red pulse restart", skip);
  process.exit(1);
}
console.log(
  "PASS: fire_drill gathered=",
  after.fireDrillGathered,
  "preset=",
  after.presetName,
);
