/** Smoke: vending_jam — toast + spark at GID38 + idle gather; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&chatter=0&tod=day&sfx=0`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-vendingjam";
mkdirSync(shotDir, { recursive: true });

const VENDING_JAM_TOASTS = ["자판기 고장?", "동전 먹힘"];

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
    return !!(sc?.officeEvents && (sc.agents?.length ?? 0) >= 2);
  },
  null,
  { timeout: 15000 },
);

const forceProbe = await page.evaluate(() => {
  const raw = "vending_jam";
  try {
    const u = new URL(location.href);
    u.searchParams.set("events", raw);
    const v = u.searchParams.get("events");
    const kinds = [
      "standup",
      "microwave_ding",
      "midnight_snack",
      "food_delivery",
      "vending_jam",
      "context_overflow",
    ];
    return {
      raw,
      inKinds: kinds.includes(raw),
      // force parse mirrors officeEvents: kind must be in RANDOM_KINDS
      forceOk: !!window.__HERMES_AREA__,
    };
  } catch (e) {
    return { raw, error: String(e) };
  }
});

const fired = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  sc.setLive?.(false);
  oe.enabled = true;
  if (oe._schedule) {
    oe._schedule.remove(false);
    oe._schedule = null;
  }
  oe._shipCooldownUntil = sc.time.now + 999999;
  oe._gatherUntil = 0;
  oe.vendingJamGathered = 0;
  oe.vendingJamAt = 0;

  if (!sc._emitterKinds) sc._emitterKinds = new Map();
  const agents = sc.agents || [];
  for (const a of agents) {
    a.live = false;
    a.serverStatus = null;
    a.serverData = null;
    a.currentKind = "break";
    a.path = [];
    a.pathIndex = 0;
    a.busy = false;
    a.idleUntil = sc.time.now + 999999;
    a._waterBackup = null;
    a._stretchBackup = null;
    a._chatterBackup = null;
    a._vendingJamBackup = null;
    a.sprite.setPosition(7 * 32 + 16, 8 * 32 + 16);
    sc._emitterKinds.set(a.def.id, "idle");
    a.setStatus("대기");
  }

  const beforeAt = oe.vendingJamAt;
  oe.fire("vending_jam");
  const spark = (sc.children?.list || []).some(
    (c) => c?.type === "ParticleEmitter" && c?.texture?.key === "fx-spark",
  );
  return {
    toast: document.getElementById("office-toast")?.textContent || "",
    lastEvent: oe.lastEvent,
    vendingJamAt: oe.vendingJamAt,
    beforeAt,
    spark,
    gathering: oe.isGathering(),
    events: window.__HERMES_AREA__?.events,
  };
});

await page.waitForFunction(
  () => (window.__HERMES_AREA__?.events?.vendingJamGathered ?? 0) >= 1,
  null,
  { timeout: 25000 },
);

await page.waitForTimeout(250);

await page
  .screenshot({ path: `${shotDir}/jam-mid.png`, fullPage: false })
  .catch(() => {});

const mid = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const agents = sc.agents || [];
  const spark = (sc.children?.list || []).some(
    (c) => c?.type === "ParticleEmitter" && c?.texture?.key === "fx-spark",
  );
  const bubbleHit = agents.some((a) => {
    const t = a.statusText || a.bubbleText?.text || "";
    return t.includes("환불") || t.includes("발로");
  });
  return {
    agentCount: agents.length,
    vendingJamGathered: oe.vendingJamGathered,
    vendingJamAt: oe.vendingJamAt,
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    gathering: oe.isGathering(),
    spark,
    bubbleHit,
    events: window.__HERMES_AREA__?.events,
  };
});

const skip = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.markGathering(8000);
  const gatheredBefore = oe.vendingJamGathered;
  const atBefore = oe.vendingJamAt;
  const el = document.getElementById("office-toast");
  if (el) el.textContent = "LOCKED";
  oe.fire("vending_jam");
  return {
    toast: document.getElementById("office-toast")?.textContent || "",
    vendingJamGathered: oe.vendingJamGathered,
    gatheredBefore,
    vendingJamAt: oe.vendingJamAt,
    atBefore,
    gathering: oe.isGathering(),
  };
});

await page
  .screenshot({ path: `${shotDir}/jam-skip.png`, fullPage: false })
  .catch(() => {});

// force query auto-fire
await page.goto(`${base.replace(/\/?$/, "/")}?events=vending_jam&tod=day&sfx=0`, {
  waitUntil: "networkidle",
  timeout: 30000,
});
await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
  timeout: 15000,
});
await page.waitForFunction(
  () => window.__HERMES_AREA__?.events?.lastEvent === "vending_jam",
  null,
  { timeout: 8000 },
);
const forced = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  return {
    forceKind: oe.forceKind,
    lastEvent: oe.lastEvent,
    vendingJamAt: oe.vendingJamAt,
    toast: document.getElementById("office-toast")?.textContent || "",
    events: window.__HERMES_AREA__?.events,
  };
});

await page
  .screenshot({ path: `${shotDir}/jam-force.png`, fullPage: false })
  .catch(() => {});

const result = { forceProbe, fired, mid, skip, forced, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (fired.lastEvent !== "vending_jam") {
  console.error("FAIL: lastEvent should be vending_jam", fired);
  process.exit(1);
}
if (!(fired.vendingJamAt > fired.beforeAt)) {
  console.error("FAIL: vendingJamAt should advance on fire", fired);
  process.exit(1);
}
const toastOk = VENDING_JAM_TOASTS.some(
  (t) => String(fired.toast).includes(t) || String(mid.toast).includes(t),
);
if (!toastOk) {
  console.error("FAIL: toast should be vending jam line", fired.toast, mid.toast);
  process.exit(1);
}
if (!fired.spark && !mid.spark) {
  console.error("FAIL: expected fx-spark near vending", fired, mid);
  process.exit(1);
}
if ((mid.vendingJamGathered ?? 0) < 1 || mid.agentCount < 2) {
  console.error("FAIL: vending_jam should gather ≥1 idle agent", mid);
  process.exit(1);
}
if (!mid.gathering) {
  console.error("FAIL: gathering should be active during hold", mid);
  process.exit(1);
}
if (!mid.bubbleHit) {
  console.error("FAIL: expected 환불/발로 bubble on gathered agents", mid);
  process.exit(1);
}
if (skip.toast !== "LOCKED") {
  console.error("FAIL: overlapping gather should skip toast", skip);
  process.exit(1);
}
if (skip.vendingJamAt !== skip.atBefore) {
  console.error("FAIL: gather skip should not bump vendingJamAt", skip);
  process.exit(1);
}
if (skip.vendingJamGathered !== skip.gatheredBefore) {
  console.error("FAIL: gather skip should not bump gathered", skip);
  process.exit(1);
}
if (forced.forceKind !== "vending_jam") {
  console.error("FAIL: forceKind should be vending_jam", forced);
  process.exit(1);
}
if (forced.lastEvent !== "vending_jam") {
  console.error("FAIL: ?events=vending_jam should fire", forced);
  process.exit(1);
}
if (!(forced.vendingJamAt > 0)) {
  console.error("FAIL: snapshot vendingJamAt should be set", forced);
  process.exit(1);
}
if (mid.events?.lastEvent !== "vending_jam") {
  console.error("FAIL: debug snapshot lastEvent missing vending_jam", mid.events);
  process.exit(1);
}

console.log(
  "PASS: vending_jam gathered=",
  mid.vendingJamGathered,
  "spark=",
  !!(mid.spark || fired.spark),
  "bubble=",
  !!mid.bubbleHit,
);
