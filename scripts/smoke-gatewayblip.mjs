/** Smoke: gateway_blip — amber/red overlay pulse + idle 재연결…; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&tod=day`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-gatewayblip";
mkdirSync(shotDir, { recursive: true });

const GATEWAY_BLIP_TOASTS = ["게이트웨이?", "재연결…"];
const GATEWAY_BLIP_LINE = "재연결…";
const GATEWAY_BLIP_AMBER = 0xe8a040;
const GATEWAY_BLIP_RED = 0xd06048;
const WIFI_GRAY = 0x7a7a88;

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

const disabled = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const countBefore = oe.eventCount;
  oe.fire("gateway_blip");
  return {
    enabled: oe.enabled,
    eventCountDelta: oe.eventCount - countBefore,
    lastEvent: oe.lastEvent,
  };
});

const mid = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.enabled = true;
  if (oe._schedule) {
    oe._schedule.remove(false);
    oe._schedule = null;
  }
  oe._gatherUntil = 0;
  oe._shipCooldownUntil = sc.time.now + 999999;

  for (const a of sc.agents || []) {
    a.live = false;
    a.serverStatus = null;
    a.currentKind = "break";
    a.path = [];
    a.pathIndex = 0;
    a.busy = false;
    a.idleUntil = sc.time.now + 999999;
  }
  const startNow = sc.time.now;
  oe.fire("gateway_blip");
  const agents = sc.agents || [];
  return {
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    gatewayBlipAffected: oe.gatewayBlipAffected,
    gathering: oe.isGathering(),
    overlayFill: sc.lightingOverlay.fillColor,
    overlayAlpha: sc.lightingOverlay.fillAlpha,
    startNow,
    bubbles: agents
      .filter((a) => a._gatewayBackup != null)
      .map((a) => ({
        id: a.def?.id,
        text: a.statusText,
        hasBackup: a._gatewayBackup != null,
        kind: a.getEffectKind?.(),
      })),
    events: window.__HERMES_AREA__?.events,
  };
});

await page.waitForTimeout(280);
const pulsed = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  return {
    overlayFill: sc.lightingOverlay.fillColor,
    gatewayBlipAffected: sc.officeEvents.gatewayBlipAffected,
  };
});

await page
  .screenshot({ path: `${shotDir}/blip-mid.png`, fullPage: false })
  .catch(() => {});

// wall clock — Phaser delayedCall may stall under headless load
await page.waitForTimeout(4000);
await page.waitForFunction(
  () => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const oe = sc?.officeEvents;
    return !!oe && oe.gatewayBlipAffected === 0;
  },
  null,
  { timeout: 10000 },
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
    gatewayBlipAffected: oe.gatewayBlipAffected,
    leftovers: (sc.agents || []).some((a) => a._gatewayBackup != null),
  };
});

const skipped = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const presetFill = sc.lightingPreset?.color;
  oe._gatherUntil = sc.time.now + 60000;
  const beforeAffected = oe.gatewayBlipAffected;
  oe.fire("gateway_blip");
  return {
    gatewayBlipAffected: oe.gatewayBlipAffected,
    beforeAffected,
    overlayFill: sc.lightingOverlay.fillColor,
    presetFill,
  };
});

await page
  .screenshot({ path: `${shotDir}/blip-after.png`, fullPage: false })
  .catch(() => {});

const forceParse = await page.evaluate(() => {
  const raw = new URLSearchParams("events=gateway_blip").get("events");
  return { raw, looksForced: raw === "gateway_blip" };
});

const result = { disabled, mid, pulsed, after, skipped, forceParse, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (disabled.enabled !== false || disabled.eventCountDelta !== 0) {
  console.error("FAIL: events=0 should keep gateway_blip off", disabled);
  process.exit(1);
}
if (mid.lastEvent !== "gateway_blip") {
  console.error("FAIL: lastEvent should be gateway_blip", mid.lastEvent);
  process.exit(1);
}
if (!GATEWAY_BLIP_TOASTS.some((t) => String(mid.toast).includes(t))) {
  console.error("FAIL: toast should be 게이트웨이?/재연결…", mid.toast);
  process.exit(1);
}
const warmOk =
  mid.overlayFill === GATEWAY_BLIP_AMBER || mid.overlayFill === GATEWAY_BLIP_RED;
if (!warmOk) {
  console.error(
    "FAIL: expected amber/red overlay (not wifi gray)",
    mid.overlayFill.toString(16),
  );
  process.exit(1);
}
if (mid.overlayFill === WIFI_GRAY) {
  console.error("FAIL: gateway_blip must not use wifi gray", mid);
  process.exit(1);
}
if ((mid.overlayAlpha ?? 0) < 0.1 || (mid.overlayAlpha ?? 0) > 0.28) {
  console.error("FAIL: blip alpha should be soft", mid);
  process.exit(1);
}
if (mid.gatewayBlipAffected < 1 || mid.gatewayBlipAffected > 2) {
  console.error("FAIL: expected 1–2 idle bubbles", mid.gatewayBlipAffected);
  process.exit(1);
}
if ((mid.bubbles || []).length !== mid.gatewayBlipAffected) {
  console.error("FAIL: bubble count mismatch", mid.bubbles);
  process.exit(1);
}
for (const b of mid.bubbles) {
  if (b.text !== GATEWAY_BLIP_LINE) {
    console.error("FAIL: bubble should be 재연결…", b);
    process.exit(1);
  }
}
if (mid.gathering) {
  console.error("FAIL: gateway_blip must not mark gathering", mid);
  process.exit(1);
}
if (mid.events?.lastEvent !== "gateway_blip") {
  console.error("FAIL: snapshot lastEvent", mid.events);
  process.exit(1);
}
if (mid.events?.gatewayBlipAffected !== mid.gatewayBlipAffected) {
  console.error("FAIL: snapshot gatewayBlipAffected", mid.events);
  process.exit(1);
}
const pulseWarm =
  pulsed.overlayFill === GATEWAY_BLIP_AMBER ||
  pulsed.overlayFill === GATEWAY_BLIP_RED;
if (!pulseWarm) {
  console.error("FAIL: mid-pulse should stay amber/red", pulsed);
  process.exit(1);
}
if (
  after.overlayFill !== after.presetColor ||
  Math.abs((after.overlayFillAlpha ?? 0) - (after.presetAlpha ?? 0)) > 0.001
) {
  console.error("FAIL: overlay should restore after blip", after);
  process.exit(1);
}
if (after.gatewayBlipAffected !== 0 || after.leftovers) {
  console.error("FAIL: gatewayBlipAffected/_gatewayBackup should clear", after);
  process.exit(1);
}
if (skipped.gatewayBlipAffected !== skipped.beforeAffected) {
  console.error("FAIL: gather skip should not change affected", skipped);
  process.exit(1);
}
if (
  skipped.overlayFill === GATEWAY_BLIP_AMBER ||
  skipped.overlayFill === GATEWAY_BLIP_RED
) {
  console.error("FAIL: gather skip should not apply warm overlay", skipped);
  process.exit(1);
}
if (!forceParse.looksForced) {
  console.error("FAIL: ?events=gateway_blip force parse", forceParse);
  process.exit(1);
}

console.log(
  "PASS: gateway_blip overlay=",
  mid.overlayFill.toString(16),
  "affected=",
  mid.gatewayBlipAffected,
  "toast=",
  mid.toast,
);
