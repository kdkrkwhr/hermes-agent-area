/** Smoke: mascot_zoomies — toast + lounge dash + dust trail; skip if no mascot. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=mascot_zoomies&tod=day&sfx=0`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-mascotzoomies";
mkdirSync(shotDir, { recursive: true });

const ZOOMIES_TOASTS = ["줌이즈!", "냥 가즈아"];

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
    return !!(sc?.officeEvents && sc?.mascot?.sprite && sc?.pathfinder);
  },
  null,
  { timeout: 15000 },
);

// wait for forceKind auto-fire
await page.waitForFunction(
  () => window.__HERMES_AREA__?.events?.lastEvent === "mascot_zoomies",
  null,
  { timeout: 8000 },
);

const forced = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const m = sc.mascot;
  const toast = document.getElementById("office-toast")?.textContent || "";
  const kids = sc.children?.list || [];
  const dust = kids.some(
    (c) =>
      c?.type === "ParticleEmitter" &&
      (c?.texture?.key === "fx-zoomies-dust" || c?.texture?.key === "fx-spark"),
  );
  return {
    lastEvent: oe.lastEvent,
    forceKind: oe.forceKind,
    toast,
    mascotZoomiesActive: oe.mascotZoomiesActive,
    isZoomies: !!m?.isZoomies?.(),
    zoomiesUntil: m?.zoomiesUntil || 0,
    dust,
    events: window.__HERMES_AREA__?.events,
  };
});

await page.waitForTimeout(700);
await page
  .screenshot({ path: `${shotDir}/zoomies-force.png`, fullPage: false })
  .catch(() => {});

const mid = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const m = sc.mascot;
  const start = { x: m.sprite.x, y: m.sprite.y };
  return { start, toast: document.getElementById("office-toast")?.textContent || "", isZoomies: !!m.isZoomies?.(), active: oe.mascotZoomiesActive };
});

await page.waitForTimeout(1200);

const moved = await page.evaluate((start) => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const m = sc.mascot;
  const dx = m.sprite.x - start.x;
  const dy = m.sprite.y - start.y;
  return {
    dist: Math.hypot(dx, dy),
    isZoomies: !!m.isZoomies?.(),
    pathLen: m.path?.length || 0,
    queueLen: m.zoomiesQueue?.length || 0,
    toast: document.getElementById("office-toast")?.textContent || "",
    lastEvent: sc.officeEvents.lastEvent,
    mascotZoomiesActive: sc.officeEvents.mascotZoomiesActive,
    events: window.__HERMES_AREA__?.events,
  };
}, mid.start);

await page
  .screenshot({ path: `${shotDir}/zoomies-mid.png`, fullPage: false })
  .catch(() => {});

// skip when mascot missing
const skip = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const backup = sc.mascot;
  sc.mascot = null;
  const el = document.getElementById("office-toast");
  if (el) el.textContent = "LOCKED";
  const beforeCount = oe.eventCount;
  oe.fire("mascot_zoomies");
  const toast = document.getElementById("office-toast")?.textContent || "";
  sc.mascot = backup;
  return { toast, eventCount: oe.eventCount, beforeCount, lastEvent: oe.lastEvent };
});

await page
  .screenshot({ path: `${shotDir}/zoomies-skip.png`, fullPage: false })
  .catch(() => {});

const result = { forced, mid, moved, skip, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (forced.forceKind !== "mascot_zoomies") {
  console.error("FAIL: forceKind should be mascot_zoomies", forced);
  process.exit(1);
}
if (forced.lastEvent !== "mascot_zoomies") {
  console.error("FAIL: force query should fire mascot_zoomies", forced);
  process.exit(1);
}
if (
  !ZOOMIES_TOASTS.some((t) => String(forced.toast).includes(t.replace("!", ""))) &&
  !ZOOMIES_TOASTS.some((t) => String(mid.toast).includes(t.replace("!", ""))) &&
  !String(forced.toast).includes("줌이즈") &&
  !String(forced.toast).includes("냥") &&
  !String(mid.toast).includes("줌이즈") &&
  !String(mid.toast).includes("냥")
) {
  console.error("FAIL: toast should be zoomies phrase", forced.toast, mid.toast);
  process.exit(1);
}
if (!forced.isZoomies && !mid.isZoomies && !moved.isZoomies) {
  console.error("FAIL: mascot should enter zoomies", forced, mid, moved);
  process.exit(1);
}
if (!forced.mascotZoomiesActive && !moved.mascotZoomiesActive) {
  console.error("FAIL: mascotZoomiesActive should be true", forced, moved);
  process.exit(1);
}
if ((moved.dist ?? 0) < 4 && (moved.pathLen ?? 0) < 1 && (moved.queueLen ?? 0) < 1) {
  console.error("FAIL: mascot should dash (move or have path/queue)", moved);
  process.exit(1);
}
if (
  ZOOMIES_TOASTS.includes(skip.toast) ||
  String(skip.toast).includes("줌이즈") ||
  String(skip.toast).includes("냥 가즈아")
) {
  console.error("FAIL: missing mascot should skip toast", skip);
  process.exit(1);
}

console.log(
  "PASS: mascot_zoomies dist=",
  moved.dist?.toFixed?.(1) ?? moved.dist,
  "toast=",
  forced.toast || mid.toast,
);
