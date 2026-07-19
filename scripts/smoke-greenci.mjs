/** Smoke: green_ci — mint overlay + Open Desk confetti + idle bubbles; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&tod=day`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-greenci";
mkdirSync(shotDir, { recursive: true });

const GREEN_CI_TOASTS = ["CI 통과!", "테스트 그린"];
const GREEN_CI_LINES = ["그린!", "머지 각?"];
const GREEN_CI_MINT = 0x5ec89a;

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
    hasRunGreenCi: typeof oe.runGreenCi === "function",
    forceKindParse: (() => {
      try {
        const u = new URL(location.href);
        u.searchParams.set("events", "green_ci");
        // parse via re-read of mode is internal; check RANDOM via fire path
        return true;
      } catch {
        return false;
      }
    })(),
  };
});

const forceKind = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  // forceKind is set at construct from ?events= — verify kind is fireable
  const oe = sc.officeEvents;
  const kindsOk = typeof oe.runGreenCi === "function";
  return { kindsOk, enabled: oe.enabled };
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
  const particleBefore = sc.children?.list?.length ?? 0;
  oe.fire("green_ci");
  const agents = sc.agents || [];
  return {
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    greenCiAffected: oe.greenCiAffected,
    gathering: oe.isGathering(),
    overlayFill: sc.lightingOverlay.fillColor,
    overlayAlpha: sc.lightingOverlay.fillAlpha,
    startNow,
    particleDelta: (sc.children?.list?.length ?? 0) - particleBefore,
    bubbles: agents.map((a) => ({
      id: a.def?.id,
      text: a.statusText,
      hasBackup: a._greenBackup != null,
      kind: a.getEffectKind?.(),
    })),
    events: window.__HERMES_AREA__?.events,
  };
});

await page
  .screenshot({ path: `${shotDir}/green-mid.png`, fullPage: false })
  .catch(() => {});

await page.waitForFunction(
  (startNow) => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const oe = sc?.officeEvents;
    if (!sc || !oe) return false;
    return sc.time.now - startNow >= 7500 && oe.greenCiAffected === 0;
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
    greenCiAffected: oe.greenCiAffected,
    lastEvent: oe.lastEvent,
  };
});

const skipped = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const presetFill = sc.lightingPreset?.color;
  oe._gatherUntil = sc.time.now + 60000;
  const beforeAffected = oe.greenCiAffected;
  oe.fire("green_ci");
  return {
    greenCiAffected: oe.greenCiAffected,
    beforeAffected,
    overlayFill: sc.lightingOverlay.fillColor,
    presetFill,
  };
});

const disabled = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe._gatherUntil = 0;
  oe.enabled = false;
  const beforeCount = oe.eventCount;
  oe.fire("green_ci");
  return {
    eventCount: oe.eventCount,
    beforeCount,
    lastEvent: oe.lastEvent,
  };
});

await page
  .screenshot({ path: `${shotDir}/green-after.png`, fullPage: false })
  .catch(() => {});

const result = { before, forceKind, mid, after, skipped, disabled, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (!before.hasRunGreenCi) {
  console.error("FAIL: runGreenCi missing", before);
  process.exit(1);
}
if (mid.lastEvent !== "green_ci") {
  console.error("FAIL: lastEvent should be green_ci", mid.lastEvent);
  process.exit(1);
}
if (
  !GREEN_CI_TOASTS.some((t) => String(mid.toast).includes(t.replace("!", "")))
) {
  console.error("FAIL: toast should be green_ci phrase", mid.toast);
  process.exit(1);
}
if (mid.overlayFill !== GREEN_CI_MINT) {
  console.error("FAIL: expected mint overlay", mid.overlayFill.toString(16));
  process.exit(1);
}
if ((mid.overlayAlpha ?? 0) < 0.09 || (mid.overlayAlpha ?? 0) > 0.17) {
  console.error("FAIL: mint alpha should be soft (~0.10–0.16)", mid);
  process.exit(1);
}
if (mid.greenCiAffected < 1 || mid.greenCiAffected > 2) {
  console.error("FAIL: expected 1–2 idle bubbles", mid.greenCiAffected);
  process.exit(1);
}
if (mid.gathering) {
  console.error("FAIL: green_ci must not mark gathering", mid);
  process.exit(1);
}
const bubbled = mid.bubbles.filter((b) => b.hasBackup);
if (bubbled.length !== mid.greenCiAffected) {
  console.error("FAIL: bubble backups mismatch", bubbled, mid.greenCiAffected);
  process.exit(1);
}
for (const b of bubbled) {
  if (!GREEN_CI_LINES.includes(b.text)) {
    console.error("FAIL: unexpected green_ci bubble text", b);
    process.exit(1);
  }
}
if (mid.events?.lastEvent !== "green_ci") {
  console.error("FAIL: snapshot lastEvent missing", mid.events);
  process.exit(1);
}
if (mid.events?.greenCiAffected !== mid.greenCiAffected) {
  console.error("FAIL: snapshot greenCiAffected mismatch", mid.events);
  process.exit(1);
}
if (
  after.overlayFill !== after.presetColor ||
  Math.abs((after.overlayFillAlpha ?? 0) - (after.presetAlpha ?? 0)) > 0.001
) {
  console.error("FAIL: overlay should match lightingPreset after green_ci", after);
  process.exit(1);
}
if (after.greenCiAffected !== 0) {
  console.error("FAIL: greenCiAffected should clear", after);
  process.exit(1);
}
if (skipped.greenCiAffected !== skipped.beforeAffected) {
  console.error("FAIL: gather skip should not change greenCiAffected", skipped);
  process.exit(1);
}
if (skipped.overlayFill === GREEN_CI_MINT) {
  console.error("FAIL: gather skip should not apply mint overlay", skipped);
  process.exit(1);
}
if (skipped.overlayFill !== skipped.presetFill) {
  console.error("FAIL: gather skip should leave preset overlay", skipped);
  process.exit(1);
}
if (disabled.eventCount !== disabled.beforeCount) {
  console.error("FAIL: events=0 / disabled should not fire", disabled);
  process.exit(1);
}

console.log(
  "PASS: green_ci mint=",
  GREEN_CI_MINT.toString(16),
  "affected=",
  mid.greenCiAffected,
);
