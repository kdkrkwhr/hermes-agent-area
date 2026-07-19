/** Smoke: flaky_test — amber flicker + idle bubbles; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&tod=day`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-flakytest";
mkdirSync(shotDir, { recursive: true });

const FLAKY_TOASTS = ["플레이키!", "재시도 각"];
const FLAKY_LINES = ["flake…", "재시도?", "플레임?"];
const FLAKY_AMBER = 0xe8b040;

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
    hasRunFlaky: typeof oe.runFlakyTest === "function",
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
  oe.fire("flaky_test");
  const agents = sc.agents || [];
  return {
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    flakyTestAffected: oe.flakyTestAffected,
    gathering: oe.isGathering(),
    overlayFill: sc.lightingOverlay.fillColor,
    overlayAlpha: sc.lightingOverlay.fillAlpha,
    startNow,
    bubbles: agents.map((a) => ({
      id: a.def?.id,
      text: a.statusText,
      hasBackup: a._flakyBackup != null,
      kind: a.getEffectKind?.(),
    })),
    events: window.__HERMES_AREA__?.events,
  };
});

await page
  .screenshot({ path: `${shotDir}/flaky-mid.png`, fullPage: false })
  .catch(() => {});

// Catch amber during flicker pulse (may briefly restore to preset)
const flickerHit = await page.evaluate(async (amber) => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const start = sc.time.now;
  let sawAmber = sc.lightingOverlay.fillColor === amber;
  let minA = sc.lightingOverlay.fillAlpha;
  let maxA = sc.lightingOverlay.fillAlpha;
  while (sc.time.now - start < 800) {
    const c = sc.lightingOverlay.fillColor;
    const a = sc.lightingOverlay.fillAlpha;
    if (c === amber) {
      sawAmber = true;
      minA = Math.min(minA, a);
      maxA = Math.max(maxA, a);
    }
    await new Promise((r) => setTimeout(r, 30));
  }
  return { sawAmber, minA, maxA };
}, FLAKY_AMBER);

await page.waitForFunction(
  (startNow) => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const oe = sc?.officeEvents;
    if (!sc || !oe) return false;
    return sc.time.now - startNow >= 6500 && oe.flakyTestAffected === 0;
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
    flakyTestAffected: oe.flakyTestAffected,
    lastEvent: oe.lastEvent,
  };
});

const skipped = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const presetFill = sc.lightingPreset?.color;
  oe._gatherUntil = sc.time.now + 60000;
  const beforeAffected = oe.flakyTestAffected;
  oe.fire("flaky_test");
  return {
    flakyTestAffected: oe.flakyTestAffected,
    beforeAffected,
    overlayFill: sc.lightingOverlay.fillColor,
    presetFill,
  };
});

await page
  .screenshot({ path: `${shotDir}/flaky-after.png`, fullPage: false })
  .catch(() => {});

const result = { before, mid, flickerHit, after, skipped, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (!before.hasRunFlaky) {
  console.error("FAIL: runFlakyTest missing", before);
  process.exit(1);
}
if (mid.lastEvent !== "flaky_test") {
  console.error("FAIL: lastEvent should be flaky_test", mid.lastEvent);
  process.exit(1);
}
if (!FLAKY_TOASTS.some((t) => String(mid.toast).includes(t.replace("!", "")))) {
  console.error("FAIL: toast should be flaky phrase", mid.toast);
  process.exit(1);
}
if (!flickerHit.sawAmber && mid.overlayFill !== FLAKY_AMBER) {
  console.error("FAIL: expected amber flicker", mid.overlayFill, flickerHit);
  process.exit(1);
}
const alphaSample =
  mid.overlayFill === FLAKY_AMBER ? mid.overlayAlpha : flickerHit.maxA;
if ((alphaSample ?? 0) < 0.1 || (alphaSample ?? 0) > 0.22) {
  console.error("FAIL: amber alpha should be soft (~0.12–0.2)", {
    mid,
    flickerHit,
  });
  process.exit(1);
}
if (mid.flakyTestAffected < 1 || mid.flakyTestAffected > 2) {
  console.error("FAIL: expected 1–2 idle bubbles", mid.flakyTestAffected);
  process.exit(1);
}
if (mid.gathering) {
  console.error("FAIL: flaky_test must not mark gathering", mid);
  process.exit(1);
}
const bubbled = mid.bubbles.filter((b) => b.hasBackup);
if (bubbled.length !== mid.flakyTestAffected) {
  console.error("FAIL: bubble backups mismatch", bubbled, mid.flakyTestAffected);
  process.exit(1);
}
for (const b of bubbled) {
  if (!FLAKY_LINES.includes(b.text)) {
    console.error("FAIL: unexpected flaky bubble text", b);
    process.exit(1);
  }
}
if (mid.events?.lastEvent !== "flaky_test") {
  console.error("FAIL: snapshot lastEvent missing", mid.events);
  process.exit(1);
}
if (mid.events?.flakyTestAffected !== mid.flakyTestAffected) {
  console.error("FAIL: snapshot flakyTestAffected mismatch", mid.events);
  process.exit(1);
}
if (
  after.overlayFill !== after.presetColor ||
  Math.abs((after.overlayFillAlpha ?? 0) - (after.presetAlpha ?? 0)) > 0.001
) {
  console.error("FAIL: overlay should match lightingPreset after flaky", after);
  process.exit(1);
}
if (after.flakyTestAffected !== 0) {
  console.error("FAIL: flakyTestAffected should clear", after);
  process.exit(1);
}
if (skipped.flakyTestAffected !== skipped.beforeAffected) {
  console.error("FAIL: gather skip should not change flakyTestAffected", skipped);
  process.exit(1);
}
if (skipped.overlayFill === FLAKY_AMBER) {
  console.error("FAIL: gather skip should not apply amber overlay", skipped);
  process.exit(1);
}
if (skipped.overlayFill !== skipped.presetFill) {
  console.error("FAIL: gather skip should leave preset overlay", skipped);
  process.exit(1);
}

console.log(
  "PASS: flaky_test amber=",
  FLAKY_AMBER.toString(16),
  "affected=",
  mid.flakyTestAffected,
);
