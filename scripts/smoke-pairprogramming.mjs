/** Smoke: pair_programming — toast + cyan sparkle + dualDesk 2-agent gather; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&chatter=0&tod=day`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-pairprogramming";
mkdirSync(shotDir, { recursive: true });

const PAIR_TOASTS = ["페어 각?", "페어프로그래밍!"];

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

const disabled = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const countBefore = oe.eventCount;
  oe.fire("pair_programming");
  return {
    enabled: oe.enabled,
    eventCountDelta: oe.eventCount - countBefore,
    lastEvent: oe.lastEvent,
  };
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
  oe.pairProgrammingGathered = 0;

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
    a.sprite.setPosition(7 * 32 + 16, 8 * 32 + 16);
    sc._emitterKinds.set(a.def.id, "idle");
    a.setStatus("대기");
  }

  oe.fire("pair_programming");
  return {
    toast: document.getElementById("office-toast")?.textContent || "",
    lastEvent: oe.lastEvent,
    gathering: oe.isGathering(),
    hasSparkleTex: sc.textures.exists("fx-pair-sparkle"),
    events: window.__HERMES_AREA__?.events,
  };
});

await page.waitForFunction(
  () => (window.__HERMES_AREA__?.events?.pairProgrammingGathered ?? 0) >= 1,
  null,
  { timeout: 25000 },
);

await page.waitForTimeout(250);

await page
  .screenshot({ path: `${shotDir}/pair-mid.png`, fullPage: false })
  .catch(() => {});

const mid = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const agents = sc.agents || [];
  const focus = sc.waypoints?.focusDesks || [{ x: 3, y: 19 }];
  const desks = focus;
  return {
    agentCount: agents.length,
    pairProgrammingGathered: oe.pairProgrammingGathered,
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    gathering: oe.isGathering(),
    hasSparkleTex: sc.textures.exists("fx-pair-sparkle"),
    events: window.__HERMES_AREA__?.events,
    nearDesk: agents.filter((a) => {
      const t = a.tilePos();
      return desks.some(
        (d) => Math.abs(t.x - d.x) <= 12 && Math.abs(t.y - d.y) <= 12,
      );
    }).length,
  };
});

const skip = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.markGathering(5000);
  const gatheredBefore = oe.pairProgrammingGathered;
  const el = document.getElementById("office-toast");
  if (el) el.textContent = "LOCKED";
  oe.fire("pair_programming");
  return {
    pairProgrammingGathered: oe.pairProgrammingGathered,
    gatheredBefore,
    toast: document.getElementById("office-toast")?.textContent || "",
  };
});

const forceKind = await page.evaluate(() => {
  const raw = "pair_programming";
  // probe via force parse path — kind must be in RANDOM_KINDS for ?events=
  const oe = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene")?.officeEvents;
  return {
    includes: typeof oe?.runPairProgramming === "function",
    raw,
    lastEvent: oe?.lastEvent,
  };
});

await page
  .screenshot({ path: `${shotDir}/pair-after.png`, fullPage: false })
  .catch(() => {});

const result = { disabled, fired, mid, skip, forceKind, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (disabled.enabled !== false || disabled.eventCountDelta !== 0) {
  console.error("FAIL: events=0 should keep pair_programming off", disabled);
  process.exit(1);
}
if (
  fired.lastEvent !== "pair_programming" &&
  mid.lastEvent !== "pair_programming"
) {
  console.error("FAIL: lastEvent should be pair_programming", fired, mid.lastEvent);
  process.exit(1);
}
const toastOk = PAIR_TOASTS.some((t) => String(fired.toast).includes(t.replace("!", "")))
  || String(fired.toast).includes("페어");
if (!toastOk) {
  console.error("FAIL: toast should be pair phrase", fired.toast);
  process.exit(1);
}
if (!fired.hasSparkleTex && !mid.hasSparkleTex) {
  console.error("FAIL: fx-pair-sparkle texture should exist", fired, mid);
  process.exit(1);
}
if ((mid.pairProgrammingGathered ?? 0) < 1 || mid.agentCount < 2) {
  console.error("FAIL: pair_programming should gather >=1 idle agent", mid);
  process.exit(1);
}
if ((mid.pairProgrammingGathered ?? 0) > 2) {
  console.error("FAIL: pair_programming should gather at most 2", mid);
  process.exit(1);
}
if ((mid.nearDesk ?? 0) < 1) {
  console.error("FAIL: agents should gather near dual/focus desk", mid);
  process.exit(1);
}
if (!mid.gathering) {
  console.error("FAIL: pair_programming should mark gathering", mid);
  process.exit(1);
}
if (mid.events?.lastEvent !== "pair_programming") {
  console.error("FAIL: snapshot lastEvent should be pair_programming", mid.events);
  process.exit(1);
}
if (
  PAIR_TOASTS.includes(skip.toast) ||
  String(skip.toast).includes("페어")
) {
  console.error("FAIL: overlapping gather should skip pair toast", skip);
  process.exit(1);
}
if (!forceKind.includes) {
  console.error("FAIL: runPairProgramming missing", forceKind);
  process.exit(1);
}
console.log(
  "PASS: pair_programming gathered=",
  mid.pairProgrammingGathered,
  "nearDesk=",
  mid.nearDesk,
  "toast=",
  fired.toast,
);