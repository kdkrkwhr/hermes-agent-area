/** Smoke: code_freeze — cool-blue overlay + idle bubbles; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&tod=day`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-codefreeze";
mkdirSync(shotDir, { recursive: true });

const FREEZE_TOASTS = ["코드프리즈!", "머지 잠금"];
const FREEZE_LINES = ["커밋 금지?", "핫픽스만"];
const FREEZE_BLUE = 0x4a7ec8;

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
  oe.fire("code_freeze");
  const agents = sc.agents || [];
  return {
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    codeFreezeAffected: oe.codeFreezeAffected,
    gathering: oe.isGathering(),
    overlayFill: sc.lightingOverlay.fillColor,
    overlayAlpha: sc.lightingOverlay.fillAlpha,
    startNow,
    bubbles: agents.map((a) => ({
      id: a.def?.id,
      text: a.statusText,
      hasBackup: a._freezeBackup != null,
      kind: a.getEffectKind?.(),
    })),
    events: window.__HERMES_AREA__?.events,
  };
});

await page
  .screenshot({ path: `${shotDir}/freeze-mid.png`, fullPage: false })
  .catch(() => {});

await page.waitForFunction(
  (startNow) => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const oe = sc?.officeEvents;
    if (!sc || !oe) return false;
    return sc.time.now - startNow >= 7500 && oe.codeFreezeAffected === 0;
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
    presetName: p?.name ?? null,
    presetColor: p?.color ?? null,
    presetAlpha: p?.alpha ?? null,
    overlayFill: sc.lightingOverlay.fillColor,
    overlayFillAlpha: sc.lightingOverlay.fillAlpha,
    codeFreezeAffected: oe.codeFreezeAffected,
    lastEvent: oe.lastEvent,
  };
});

const skipped = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const presetFill = sc.lightingPreset?.color;
  oe._gatherUntil = sc.time.now + 60000;
  const beforeAffected = oe.codeFreezeAffected;
  oe.fire("code_freeze");
  return {
    codeFreezeAffected: oe.codeFreezeAffected,
    beforeAffected,
    overlayFill: sc.lightingOverlay.fillColor,
    presetFill,
  };
});

await page
  .screenshot({ path: `${shotDir}/freeze-after.png`, fullPage: false })
  .catch(() => {});

const result = { before, mid, after, skipped, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (mid.lastEvent !== "code_freeze") {
  console.error("FAIL: lastEvent should be code_freeze", mid.lastEvent);
  process.exit(1);
}
if (!FREEZE_TOASTS.some((t) => String(mid.toast).includes(t.replace("!", "")))) {
  console.error("FAIL: toast should be code freeze", mid.toast);
  process.exit(1);
}
if (mid.overlayFill !== FREEZE_BLUE) {
  console.error("FAIL: expected cool-blue overlay", mid.overlayFill, FREEZE_BLUE);
  process.exit(1);
}
if ((mid.overlayAlpha ?? 0) < 0.1 || (mid.overlayAlpha ?? 0) > 0.22) {
  console.error("FAIL: blue alpha should be soft (~0.15)", mid);
  process.exit(1);
}
if (mid.codeFreezeAffected < 1 || mid.codeFreezeAffected > 2) {
  console.error("FAIL: expected 1–2 idle bubbles", mid.codeFreezeAffected);
  process.exit(1);
}
if (mid.gathering) {
  console.error("FAIL: code_freeze must not mark gathering", mid);
  process.exit(1);
}
const bubbled = mid.bubbles.filter((b) => b.hasBackup);
if (bubbled.length !== mid.codeFreezeAffected) {
  console.error("FAIL: bubble backups mismatch", bubbled, mid.codeFreezeAffected);
  process.exit(1);
}
for (const b of bubbled) {
  if (!FREEZE_LINES.includes(b.text)) {
    console.error("FAIL: unexpected freeze bubble text", b);
    process.exit(1);
  }
}
if (mid.events?.lastEvent !== "code_freeze") {
  console.error("FAIL: snapshot lastEvent missing", mid.events);
  process.exit(1);
}
if (mid.events?.codeFreezeAffected !== mid.codeFreezeAffected) {
  console.error("FAIL: snapshot codeFreezeAffected mismatch", mid.events);
  process.exit(1);
}
if (
  after.overlayFill !== after.presetColor ||
  Math.abs((after.overlayFillAlpha ?? 0) - (after.presetAlpha ?? 0)) > 0.001
) {
  console.error("FAIL: overlay should match lightingPreset after freeze", after);
  process.exit(1);
}
if (after.codeFreezeAffected !== 0) {
  console.error("FAIL: codeFreezeAffected should clear", after);
  process.exit(1);
}
if (skipped.codeFreezeAffected !== skipped.beforeAffected) {
  console.error("FAIL: gather skip should not change codeFreezeAffected", skipped);
  process.exit(1);
}
if (skipped.overlayFill === FREEZE_BLUE) {
  console.error("FAIL: gather skip should not apply blue overlay", skipped);
  process.exit(1);
}
if (skipped.overlayFill !== skipped.presetFill) {
  console.error("FAIL: gather skip should leave preset overlay", skipped);
  process.exit(1);
}

console.log(
  "PASS: code_freeze blue=",
  mid.overlayFill.toString(16),
  "affected=",
  mid.codeFreezeAffected,
);
