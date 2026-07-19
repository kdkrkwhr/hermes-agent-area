/** Smoke: sunday_chill — soft warm tint + lounge steam; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&tod=day&sfx=0`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-sundaychill";
mkdirSync(shotDir, { recursive: true });

const SUNDAY_CHILL_TOASTS = ["일요일 감성", "느긋한 하루"];
const SUNDAY_CHILL_WARM = 0xe8c090;

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
      (sc.agents?.length ?? 0) >= 1
    );
  },
  null,
  { timeout: 15000 },
);

const mid = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.enabled = true;
  if (oe._schedule) {
    oe._schedule.remove(false);
    oe._schedule = null;
  }
  oe._gatherUntil = 0;
  const startNow = sc.time.now;
  const particleBefore = sc.children?.list?.filter?.(
    (c) => c?.type === "ParticleEmitterManager" || c?.emitting != null,
  )?.length ?? 0;
  oe.fire("sunday_chill");
  const particleAfter = sc.children?.list?.filter?.(
    (c) => c?.type === "ParticleEmitterManager" || c?.emitting != null,
  )?.length ?? 0;
  return {
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    sundayChillActive: oe.sundayChillActive,
    gathering: oe.isGathering(),
    overlayFill: sc.lightingOverlay.fillColor,
    overlayAlpha: sc.lightingOverlay.fillAlpha,
    startNow,
    particleBefore,
    particleAfter,
    events: window.__HERMES_AREA__?.events,
  };
});

await page
  .screenshot({ path: `${shotDir}/chill-mid.png`, fullPage: false })
  .catch(() => {});

await page.waitForFunction(
  (startNow) => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const oe = sc?.officeEvents;
    if (!sc || !oe) return false;
    return sc.time.now - startNow >= 8500 && oe.sundayChillActive === false;
  },
  mid.startNow,
  { timeout: 20000 },
);
await page.waitForTimeout(100);

const after = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const p = sc.lightingPreset;
  const oe = sc.officeEvents;
  return {
    presetColor: p?.color ?? null,
    presetAlpha: p?.alpha ?? null,
    overlayFill: sc.lightingOverlay.fillColor,
    overlayFillAlpha: sc.lightingOverlay.fillAlpha,
    sundayChillActive: oe.sundayChillActive,
  };
});

const skipped = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const presetFill = sc.lightingPreset?.color;
  oe._gatherUntil = sc.time.now + 60000;
  const beforeActive = oe.sundayChillActive;
  oe.fire("sunday_chill");
  return {
    sundayChillActive: oe.sundayChillActive,
    beforeActive,
    overlayFill: sc.lightingOverlay.fillColor,
    presetFill,
  };
});

await page.goto(
  `${base.replace(/\/?$/, "/")}?events=sunday_chill&tod=day&sfx=0`,
  { waitUntil: "networkidle", timeout: 30000 },
);
await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
  timeout: 15000,
});
await page.waitForFunction(
  () => window.__HERMES_AREA__?.events?.lastEvent === "sunday_chill",
  null,
  { timeout: 10000 },
);
const forced = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  return {
    forceKind: oe.forceKind,
    lastEvent: oe.lastEvent,
    gathering: oe.isGathering(),
  };
});

await page
  .screenshot({ path: `${shotDir}/chill-after.png`, fullPage: false })
  .catch(() => {});

const result = { mid, after, skipped, forced, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (mid.lastEvent !== "sunday_chill") {
  console.error("FAIL: lastEvent should be sunday_chill", mid.lastEvent);
  process.exit(1);
}
if (
  !SUNDAY_CHILL_TOASTS.some((t) => String(mid.toast).includes(t.slice(0, 3)))
) {
  console.error("FAIL: toast should be sunday_chill phrase", mid.toast);
  process.exit(1);
}
if (mid.overlayFill !== SUNDAY_CHILL_WARM) {
  console.error("FAIL: expected warm tint overlay", mid.overlayFill, SUNDAY_CHILL_WARM);
  process.exit(1);
}
if ((mid.overlayAlpha ?? 0) < 0.08 || (mid.overlayAlpha ?? 0) > 0.14) {
  console.error("FAIL: warm alpha should be ~0.1", mid);
  process.exit(1);
}
if (!mid.sundayChillActive) {
  console.error("FAIL: sundayChillActive should be true mid-event", mid);
  process.exit(1);
}
if (mid.gathering) {
  console.error("FAIL: sunday_chill must not mark gathering", mid);
  process.exit(1);
}
if (mid.events?.lastEvent !== "sunday_chill") {
  console.error("FAIL: snapshot lastEvent missing", mid.events);
  process.exit(1);
}
if (mid.events?.sundayChillActive !== true) {
  console.error("FAIL: snapshot sundayChillActive mismatch", mid.events);
  process.exit(1);
}
if (
  after.overlayFill !== after.presetColor ||
  Math.abs((after.overlayFillAlpha ?? 0) - (after.presetAlpha ?? 0)) > 0.001
) {
  console.error("FAIL: overlay should match lightingPreset after chill", after);
  process.exit(1);
}
if (after.sundayChillActive !== false) {
  console.error("FAIL: sundayChillActive should clear", after);
  process.exit(1);
}
if (skipped.sundayChillActive !== skipped.beforeActive) {
  console.error("FAIL: gather skip should not change sundayChillActive", skipped);
  process.exit(1);
}
if (skipped.overlayFill === SUNDAY_CHILL_WARM) {
  console.error("FAIL: gather skip should not apply warm overlay", skipped);
  process.exit(1);
}
if (forced.forceKind !== "sunday_chill") {
  console.error("FAIL: ?events=sunday_chill forceKind", forced);
  process.exit(1);
}
if (forced.lastEvent !== "sunday_chill") {
  console.error("FAIL: ?events=sunday_chill should fire", forced);
  process.exit(1);
}
if (forced.gathering) {
  console.error("FAIL: force sunday_chill must not gather", forced);
  process.exit(1);
}

console.log(
  "PASS: sunday_chill warm=",
  mid.overlayFill.toString(16),
  "active mid=",
  mid.sundayChillActive,
);
