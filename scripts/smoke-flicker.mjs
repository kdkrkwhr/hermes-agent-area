/** Smoke: power_flicker — dark overlay flash then TOD preset restore. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=1&tod=day`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-flicker";
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
    return !!(sc?.officeEvents && sc?.lightingOverlay && sc?.lightingPreset);
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
  const p = sc.lightingPreset;
  return {
    presetName: p?.name ?? null,
    presetColor: p?.color ?? null,
    presetAlpha: p?.alpha ?? null,
    overlayFill: sc.lightingOverlay.fillColor,
    overlayFillAlpha: sc.lightingOverlay.fillAlpha,
  };
});

const mid = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const startNow = sc.time.now;
  oe.fire("power_flicker");
  return {
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    events: window.__HERMES_AREA__?.events,
    immediateAlpha: sc.lightingOverlay.fillAlpha,
    startNow,
  };
});

const sawDark =
  mid.immediateAlpha > 0.3 ||
  (await page
    .waitForFunction(
      () => {
        const ov =
          window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene")
            ?.lightingOverlay;
        return (ov?.fillAlpha ?? 0) > 0.3;
      },
      null,
      { timeout: 1500 },
    )
    .then(() => true)
    .catch(() => false));

await page.screenshot({ path: `${shotDir}/flicker-mid.png`, fullPage: false }).catch(() => {});

// wait until scene clock is 1400ms past fire (max flicker 1200ms)
await page.waitForFunction(
  (startNow) => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    return sc && sc.time.now - startNow >= 1400;
  },
  mid.startNow,
  { timeout: 8000 },
);
await page.waitForTimeout(100);

const after = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const p = sc.lightingPreset;
  return {
    presetName: p?.name ?? null,
    presetColor: p?.color ?? null,
    presetAlpha: p?.alpha ?? null,
    overlayFill: sc.lightingOverlay.fillColor,
    overlayFillAlpha: sc.lightingOverlay.fillAlpha,
    lastEvent: sc.officeEvents.lastEvent,
  };
});

await page.screenshot({ path: `${shotDir}/flicker-after.png`, fullPage: false }).catch(() => {});

const result = { before, mid, sawDark, after, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (mid.lastEvent !== "power_flicker") {
  console.error("FAIL: lastEvent should be power_flicker", mid.lastEvent);
  process.exit(1);
}
if (!String(mid.toast).includes("정전")) {
  console.error("FAIL: toast should mention 정전", mid.toast);
  process.exit(1);
}
if (!sawDark) {
  console.error("FAIL: expected at least one dark overlay flash during flicker");
  process.exit(1);
}
if (
  after.overlayFill !== after.presetColor ||
  Math.abs((after.overlayFillAlpha ?? 0) - (after.presetAlpha ?? 0)) > 0.001
) {
  console.error("FAIL: overlay should match lightingPreset after flicker", after);
  process.exit(1);
}
if (after.presetName !== before.presetName) {
  console.error("FAIL: lightingPreset name should be unchanged", before, after);
  process.exit(1);
}
console.log("PASS: power_flicker restored preset=", after.presetName);
