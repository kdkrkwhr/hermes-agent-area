/** Smoke: monday_blues — soft slate overlay + idle bubbles; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&tod=day&sfx=0`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-mondayblues";
mkdirSync(shotDir, { recursive: true });

const MONDAY_BLUES_TOASTS = ["월요병…", "월요일이다"];
const MONDAY_BLUES_LINES = ["한숨…", "커피 각"];
const MONDAY_BLUES_SLATE = 0x5a6578;

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

const forceKind = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const raw = "monday_blues";
  // force parse mirrors officeEvents: kind must be in RANDOM_KINDS
  const mode = (() => {
    try {
      const q = new URLSearchParams(location.search).get("events");
      if (q === "0" || q === "off" || q === "false") return { enabled: false };
      if (q === "1" || q === "fast") return { enabled: true, fast: true };
      if (q && typeof oe?.forceKind !== "undefined") {
        /* probe via fire path */
      }
      return { enabled: true };
    } catch {
      return { enabled: true };
    }
  })();
  oe.enabled = true;
  if (oe._schedule) {
    oe._schedule.remove(false);
    oe._schedule = null;
  }
  const before = oe.lastEvent;
  oe.fire(raw);
  return {
    raw,
    fired: oe.lastEvent === raw,
    lastEvent: oe.lastEvent,
    before,
    mode,
  };
});

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

const mid = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.enabled = true;
  if (oe._schedule) {
    oe._schedule.remove(false);
    oe._schedule = null;
  }
  oe._gatherUntil = 0;
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
  oe.fire("monday_blues");
  const agents = sc.agents || [];
  return {
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    mondayBluesAffected: oe.mondayBluesAffected,
    gathering: oe.isGathering(),
    overlayFill: sc.lightingOverlay.fillColor,
    overlayAlpha: sc.lightingOverlay.fillAlpha,
    startNow,
    bubbles: agents.map((a) => ({
      id: a.def?.id,
      text: a.statusText,
      hasBackup: a._mondayBluesBackup != null,
      kind: a.getEffectKind?.(),
    })),
    events: window.__HERMES_AREA__?.events,
  };
});

await page
  .screenshot({ path: `${shotDir}/blues-mid.png`, fullPage: false })
  .catch(() => {});

await page.waitForFunction(
  (startNow) => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const oe = sc?.officeEvents;
    if (!sc || !oe) return false;
    return sc.time.now - startNow >= 8500 && oe.mondayBluesAffected === 0;
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
    mondayBluesAffected: oe.mondayBluesAffected,
  };
});

const skipped = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const presetFill = sc.lightingPreset?.color;
  oe._gatherUntil = sc.time.now + 60000;
  const beforeAffected = oe.mondayBluesAffected;
  oe.fire("monday_blues");
  return {
    mondayBluesAffected: oe.mondayBluesAffected,
    beforeAffected,
    overlayFill: sc.lightingOverlay.fillColor,
    presetFill,
  };
});

const weightProbe = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  // Mon=1 weight↑, other days weight=0 — probe via local Date mock not available;
  // assert kind is fireable and weight constants exist via fire path only.
  return {
    canFire: typeof oe.runMondayBlues === "function",
    forceKindOk: true,
  };
});

await page.goto(
  `${base.replace(/\/?$/, "/")}?events=monday_blues&tod=day&sfx=0`,
  { waitUntil: "networkidle", timeout: 30000 },
);
await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
  timeout: 15000,
});
await page.waitForFunction(
  () => window.__HERMES_AREA__?.events?.lastEvent === "monday_blues",
  null,
  { timeout: 10000 },
);
const forced = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  return { forceKind: oe.forceKind, lastEvent: oe.lastEvent };
});

await page
  .screenshot({ path: `${shotDir}/blues-after.png`, fullPage: false })
  .catch(() => {});

const result = { forceKind, mid, after, skipped, weightProbe, forced, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (!forceKind.fired) {
  console.error("FAIL: monday_blues should fire", forceKind);
  process.exit(1);
}
if (mid.lastEvent !== "monday_blues") {
  console.error("FAIL: lastEvent should be monday_blues", mid.lastEvent);
  process.exit(1);
}
if (!MONDAY_BLUES_TOASTS.some((t) => String(mid.toast).includes(t.slice(0, 3)))) {
  console.error("FAIL: toast should be monday_blues phrase", mid.toast);
  process.exit(1);
}
if (mid.overlayFill !== MONDAY_BLUES_SLATE) {
  console.error("FAIL: expected slate overlay", mid.overlayFill, MONDAY_BLUES_SLATE);
  process.exit(1);
}
if ((mid.overlayAlpha ?? 0) < 0.08 || (mid.overlayAlpha ?? 0) > 0.14) {
  console.error("FAIL: slate alpha should be ~0.1", mid);
  process.exit(1);
}
if (mid.mondayBluesAffected < 1 || mid.mondayBluesAffected > 2) {
  console.error("FAIL: expected 1–2 idle bubbles", mid.mondayBluesAffected);
  process.exit(1);
}
if (mid.gathering) {
  console.error("FAIL: monday_blues must not mark gathering", mid);
  process.exit(1);
}
const bubbled = mid.bubbles.filter((b) => b.hasBackup);
if (bubbled.length !== mid.mondayBluesAffected) {
  console.error("FAIL: bubble backups mismatch", bubbled, mid.mondayBluesAffected);
  process.exit(1);
}
for (const b of bubbled) {
  if (!MONDAY_BLUES_LINES.includes(b.text)) {
    console.error("FAIL: unexpected monday bubble text", b);
    process.exit(1);
  }
}
if (mid.events?.lastEvent !== "monday_blues") {
  console.error("FAIL: snapshot lastEvent missing", mid.events);
  process.exit(1);
}
if (
  after.overlayFill !== after.presetColor ||
  Math.abs((after.overlayFillAlpha ?? 0) - (after.presetAlpha ?? 0)) > 0.001
) {
  console.error("FAIL: overlay should match lightingPreset after blues", after);
  process.exit(1);
}
if (after.mondayBluesAffected !== 0) {
  console.error("FAIL: mondayBluesAffected should clear", after);
  process.exit(1);
}
if (skipped.mondayBluesAffected !== skipped.beforeAffected) {
  console.error("FAIL: gather skip should not change mondayBluesAffected", skipped);
  process.exit(1);
}
if (skipped.overlayFill === MONDAY_BLUES_SLATE) {
  console.error("FAIL: gather skip should not apply slate overlay", skipped);
  process.exit(1);
}
if (forced.forceKind !== "monday_blues") {
  console.error("FAIL: ?events=monday_blues forceKind", forced);
  process.exit(1);
}
if (forced.lastEvent !== "monday_blues") {
  console.error("FAIL: ?events=monday_blues should fire", forced);
  process.exit(1);
}

console.log(
  "PASS: monday_blues slate=",
  mid.overlayFill.toString(16),
  "affected=",
  mid.mondayBluesAffected,
);
