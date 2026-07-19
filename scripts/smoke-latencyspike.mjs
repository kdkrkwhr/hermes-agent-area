/** Smoke: latency_spike — violet/indigo overlay + idle lag bubbles; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&tod=day`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-latencyspike";
mkdirSync(shotDir, { recursive: true });

const LATENCY_SPIKE_TOASTS = ["랙?", "핑 스파이크", "RTT…"];
const LATENCY_SPIKE_LINES = ["버퍼링…", "끊겼나?"];
const LATENCY_SPIKE_VIOLET = 0x7a4fd0;
const LATENCY_SPIKE_INDIGO = 0x4a58c8;
const GATEWAY_BLIP_AMBER = 0xe8a040;
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
  oe.fire("latency_spike");
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
  oe.wifiOutageAffected = 0;
  oe.gatewayBlipAffected = 0;
  oe.latencySpikeAffected = 0;
  oe.codeFreezeAffected = 0;

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
  const scaleBefore = sc.time.timeScale;
  oe.fire("latency_spike");
  const agents = sc.agents || [];
  return {
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    latencySpikeAffected: oe.latencySpikeAffected,
    gathering: oe.isGathering(),
    overlayFill: sc.lightingOverlay.fillColor,
    overlayAlpha: sc.lightingOverlay.fillAlpha,
    timeScale: sc.time.timeScale,
    scaleBefore,
    startNow,
    bubbles: agents
      .filter((a) => a._latencyBackup != null)
      .map((a) => ({
        id: a.def?.id,
        text: a.statusText,
        hasBackup: a._latencyBackup != null,
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
    latencySpikeAffected: sc.officeEvents.latencySpikeAffected,
    timeScale: sc.time.timeScale,
  };
});

await page
  .screenshot({ path: `${shotDir}/spike-mid.png`, fullPage: false })
  .catch(() => {});

// wall clock — Phaser delayedCall may stall under headless load
await page.waitForTimeout(4500);
await page.waitForFunction(
  () => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const oe = sc?.officeEvents;
    return !!oe && oe.latencySpikeAffected === 0;
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
    latencySpikeAffected: oe.latencySpikeAffected,
    timeScale: sc.time.timeScale,
    leftovers: (sc.agents || []).some((a) => a._latencyBackup != null),
  };
});

const skipped = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const presetFill = sc.lightingPreset?.color;
  oe._gatherUntil = sc.time.now + 60000;
  const beforeAffected = oe.latencySpikeAffected;
  oe.fire("latency_spike");
  return {
    latencySpikeAffected: oe.latencySpikeAffected,
    beforeAffected,
    overlayFill: sc.lightingOverlay.fillColor,
    presetFill,
  };
});

const overlaySkip = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe._gatherUntil = 0;
  oe.gatewayBlipAffected = 2;
  const before = oe.latencySpikeAffected;
  oe.fire("latency_spike");
  const afterAffected = oe.latencySpikeAffected;
  oe.gatewayBlipAffected = 0;
  return { before, afterAffected };
});

await page
  .screenshot({ path: `${shotDir}/spike-after.png`, fullPage: false })
  .catch(() => {});

const forceParse = await page.evaluate(() => {
  const raw = new URLSearchParams("events=latency_spike").get("events");
  return { raw, looksForced: raw === "latency_spike" };
});

const result = {
  disabled,
  mid,
  pulsed,
  after,
  skipped,
  overlaySkip,
  forceParse,
  errors,
};
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (disabled.enabled !== false || disabled.eventCountDelta !== 0) {
  console.error("FAIL: events=0 should keep latency_spike off", disabled);
  process.exit(1);
}
if (mid.lastEvent !== "latency_spike") {
  console.error("FAIL: lastEvent should be latency_spike", mid.lastEvent);
  process.exit(1);
}
if (!LATENCY_SPIKE_TOASTS.some((t) => String(mid.toast).includes(t))) {
  console.error("FAIL: toast should be 랙?/핑 스파이크/RTT…", mid.toast);
  process.exit(1);
}
const coolOk =
  mid.overlayFill === LATENCY_SPIKE_VIOLET ||
  mid.overlayFill === LATENCY_SPIKE_INDIGO;
if (!coolOk) {
  console.error(
    "FAIL: expected violet/indigo overlay",
    mid.overlayFill.toString(16),
  );
  process.exit(1);
}
if (mid.overlayFill === WIFI_GRAY || mid.overlayFill === GATEWAY_BLIP_AMBER) {
  console.error("FAIL: latency_spike must not use wifi/gateway colors", mid);
  process.exit(1);
}
if ((mid.overlayAlpha ?? 0) < 0.08 || (mid.overlayAlpha ?? 0) > 0.22) {
  console.error("FAIL: spike alpha should be soft", mid);
  process.exit(1);
}
if (mid.latencySpikeAffected < 1 || mid.latencySpikeAffected > 2) {
  console.error("FAIL: expected 1–2 idle bubbles", mid.latencySpikeAffected);
  process.exit(1);
}
if ((mid.bubbles || []).length !== mid.latencySpikeAffected) {
  console.error("FAIL: bubble count mismatch", mid.bubbles);
  process.exit(1);
}
for (const b of mid.bubbles) {
  if (!LATENCY_SPIKE_LINES.includes(b.text)) {
    console.error("FAIL: bubble should be 버퍼링…/끊겼나?", b);
    process.exit(1);
  }
}
if (mid.gathering) {
  console.error("FAIL: latency_spike must not mark gathering", mid);
  process.exit(1);
}
if (mid.events?.lastEvent !== "latency_spike") {
  console.error("FAIL: snapshot lastEvent", mid.events);
  process.exit(1);
}
if (mid.events?.latencySpikeAffected !== mid.latencySpikeAffected) {
  console.error("FAIL: snapshot latencySpikeAffected", mid.events);
  process.exit(1);
}
const pulseCool =
  pulsed.overlayFill === LATENCY_SPIKE_VIOLET ||
  pulsed.overlayFill === LATENCY_SPIKE_INDIGO;
if (!pulseCool) {
  console.error("FAIL: mid-pulse should stay violet/indigo", pulsed);
  process.exit(1);
}
if (
  after.overlayFill !== after.presetColor ||
  Math.abs((after.overlayFillAlpha ?? 0) - (after.presetAlpha ?? 0)) > 0.001
) {
  console.error("FAIL: overlay should restore after spike", after);
  process.exit(1);
}
if (after.latencySpikeAffected !== 0 || after.leftovers) {
  console.error("FAIL: latencySpikeAffected/_latencyBackup should clear", after);
  process.exit(1);
}
if (Math.abs((after.timeScale ?? 1) - 1) > 0.001) {
  console.error("FAIL: timeScale should restore to 1", after);
  process.exit(1);
}
if (skipped.latencySpikeAffected !== skipped.beforeAffected) {
  console.error("FAIL: gather skip should not change affected", skipped);
  process.exit(1);
}
if (
  skipped.overlayFill === LATENCY_SPIKE_VIOLET ||
  skipped.overlayFill === LATENCY_SPIKE_INDIGO
) {
  console.error("FAIL: gather skip should not apply cool overlay", skipped);
  process.exit(1);
}
if (overlaySkip.afterAffected !== overlaySkip.before) {
  console.error("FAIL: active overlay should skip latency_spike", overlaySkip);
  process.exit(1);
}
if (!forceParse.looksForced) {
  console.error("FAIL: ?events=latency_spike force parse", forceParse);
  process.exit(1);
}

console.log(
  "PASS: latency_spike overlay=",
  mid.overlayFill.toString(16),
  "affected=",
  mid.latencySpikeAffected,
  "toast=",
  mid.toast,
);
