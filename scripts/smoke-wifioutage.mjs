/** Smoke: wifi_outage — soft gray overlay + idle bubbles; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&tod=day`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-wifioutage";
mkdirSync(shotDir, { recursive: true });

const WIFI_LINES = ["와이파이?", "버퍼링…"];
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

const before = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.enabled = true;
  if (oe._schedule) {
    oe._schedule.remove(false);
    oe._schedule = null;
  }
  oe._gatherUntil = 0;

  const p = sc.lightingPreset;
  return {
    presetName: p?.name ?? null,
    presetColor: p?.color ?? null,
    presetAlpha: p?.alpha ?? null,
    overlayFill: sc.lightingOverlay.fillColor,
    overlayFillAlpha: sc.lightingOverlay.fillAlpha,
    agentCount: (sc.agents || []).length,
  };
});

const mid = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  // pin mock idle in THIS tick — live WS can flip status between evaluates
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
  oe.fire("wifi_outage");
  const agents = sc.agents || [];
  return {
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    wifiOutageAffected: oe.wifiOutageAffected,
    gathering: oe.isGathering(),
    overlayFill: sc.lightingOverlay.fillColor,
    overlayAlpha: sc.lightingOverlay.fillAlpha,
    startNow,
    bubbles: agents.map((a) => ({
      id: a.def?.id,
      text: a.statusText,
      hasBackup: a._wifiBackup != null,
      kind: a.getEffectKind?.(),
    })),
    events: window.__HERMES_AREA__?.events,
  };
});

await page
  .screenshot({ path: `${shotDir}/wifi-mid.png`, fullPage: false })
  .catch(() => {});

// wait until wifi restore clears (scene clock + affected flag)
await page.waitForFunction(
  (startNow) => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const oe = sc?.officeEvents;
    if (!sc || !oe) return false;
    return sc.time.now - startNow >= 4500 && oe.wifiOutageAffected === 0;
  },
  mid.startNow,
  { timeout: 15000 },
);
await page.waitForTimeout(100);

const after = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const p = sc.lightingPreset;
  const oe = sc.officeEvents;
  return {
    presetName: p?.name ?? null,
    presetColor: p?.color ?? null,
    presetAlpha: p?.alpha ?? null,
    overlayFill: sc.lightingOverlay.fillColor,
    overlayFillAlpha: sc.lightingOverlay.fillAlpha,
    wifiOutageAffected: oe.wifiOutageAffected,
    lastEvent: oe.lastEvent,
  };
});

// skip-when-gathering (after restore so gray isn't leftover)
const skipped = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const presetFill = sc.lightingPreset?.color;
  oe._gatherUntil = sc.time.now + 60000;
  const beforeCount = oe.eventCount;
  const beforeAffected = oe.wifiOutageAffected;
  oe.fire("wifi_outage");
  return {
    eventCountDelta: oe.eventCount - beforeCount,
    wifiOutageAffected: oe.wifiOutageAffected,
    beforeAffected,
    overlayFill: sc.lightingOverlay.fillColor,
    presetFill,
  };
});

await page
  .screenshot({ path: `${shotDir}/wifi-after.png`, fullPage: false })
  .catch(() => {});

const result = { before, mid, after, skipped, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (mid.lastEvent !== "wifi_outage") {
  console.error("FAIL: lastEvent should be wifi_outage", mid.lastEvent);
  process.exit(1);
}
if (!String(mid.toast).includes("와이파이")) {
  console.error("FAIL: toast should mention 와이파이", mid.toast);
  process.exit(1);
}
if (mid.overlayFill !== WIFI_GRAY) {
  console.error("FAIL: expected soft gray overlay", mid.overlayFill, WIFI_GRAY);
  process.exit(1);
}
if ((mid.overlayAlpha ?? 0) < 0.15 || (mid.overlayAlpha ?? 0) > 0.35) {
  console.error("FAIL: gray alpha should be soft (~0.22), not blackout", mid);
  process.exit(1);
}
if (mid.wifiOutageAffected < 1 || mid.wifiOutageAffected > 3) {
  console.error("FAIL: expected 1–3 idle bubbles", mid.wifiOutageAffected);
  process.exit(1);
}
const bubbled = mid.bubbles.filter((b) => b.hasBackup);
if (bubbled.length !== mid.wifiOutageAffected) {
  console.error("FAIL: bubble backups mismatch", bubbled, mid.wifiOutageAffected);
  process.exit(1);
}
for (const b of bubbled) {
  if (!WIFI_LINES.includes(b.text)) {
    console.error("FAIL: unexpected wifi bubble text", b);
    process.exit(1);
  }
}
if (
  after.overlayFill !== after.presetColor ||
  Math.abs((after.overlayFillAlpha ?? 0) - (after.presetAlpha ?? 0)) > 0.001
) {
  console.error("FAIL: overlay should match lightingPreset after wifi", after);
  process.exit(1);
}
if (after.wifiOutageAffected !== 0) {
  console.error("FAIL: wifiOutageAffected should clear", after);
  process.exit(1);
}
// gather skip: fire still bumps lastEvent/count, but runWifiOutage returns early
if (skipped.wifiOutageAffected !== skipped.beforeAffected) {
  console.error("FAIL: gather skip should not change wifiOutageAffected", skipped);
  process.exit(1);
}
if (skipped.overlayFill === WIFI_GRAY) {
  console.error("FAIL: gather skip should not apply gray overlay", skipped);
  process.exit(1);
}
if (skipped.overlayFill !== skipped.presetFill) {
  console.error("FAIL: gather skip should leave preset overlay", skipped);
  process.exit(1);
}

console.log(
  "PASS: wifi_outage gray=",
  mid.overlayFill.toString(16),
  "affected=",
  mid.wifiOutageAffected,
);
