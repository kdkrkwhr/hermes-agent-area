/** Smoke: merge_conflict — toast + red/amber spark + open/dual desk 2–3 gather; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&chatter=0&tod=day`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-mergeconflict";
mkdirSync(shotDir, { recursive: true });

const MERGE_TOASTS = ["머지 충돌!", "CONFLICT", "rebase ㄱㄱ"];

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
  oe.fire("merge_conflict");
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
  oe.mergeConflictGathered = 0;

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

  oe.fire("merge_conflict");
  return {
    toast: document.getElementById("office-toast")?.textContent || "",
    lastEvent: oe.lastEvent,
    gathering: oe.isGathering(),
    hasSparkTex: sc.textures.exists("fx-merge-spark"),
    events: window.__HERMES_AREA__?.events,
  };
});

await page.waitForFunction(
  () => (window.__HERMES_AREA__?.events?.mergeConflictGathered ?? 0) >= 1,
  null,
  { timeout: 25000 },
);

await page.waitForTimeout(250);

await page
  .screenshot({ path: `${shotDir}/merge-mid.png`, fullPage: false })
  .catch(() => {});

const mid = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const agents = sc.agents || [];
  const open = sc.waypoints?.desks || [];
  const focus = sc.waypoints?.focusDesks || [{ x: 3, y: 19 }];
  const desks = open.length ? open : focus;
  return {
    agentCount: agents.length,
    mergeConflictGathered: oe.mergeConflictGathered,
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    gathering: oe.isGathering(),
    hasSparkTex: sc.textures.exists("fx-merge-spark"),
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
  const gatheredBefore = oe.mergeConflictGathered;
  const el = document.getElementById("office-toast");
  if (el) el.textContent = "LOCKED";
  oe.fire("merge_conflict");
  return {
    mergeConflictGathered: oe.mergeConflictGathered,
    gatheredBefore,
    toast: document.getElementById("office-toast")?.textContent || "",
  };
});

const forceKind = await page.evaluate(() => {
  const raw = "merge_conflict";
  const oe = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene")?.officeEvents;
  return {
    includes: typeof oe?.runMergeConflict === "function",
    raw,
    lastEvent: oe?.lastEvent,
  };
});

await page
  .screenshot({ path: `${shotDir}/merge-after.png`, fullPage: false })
  .catch(() => {});

const result = { disabled, fired, mid, skip, forceKind, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (disabled.enabled !== false || disabled.eventCountDelta !== 0) {
  console.error("FAIL: events=0 should keep merge_conflict off", disabled);
  process.exit(1);
}
if (
  fired.lastEvent !== "merge_conflict" &&
  mid.lastEvent !== "merge_conflict"
) {
  console.error("FAIL: lastEvent should be merge_conflict", fired, mid.lastEvent);
  process.exit(1);
}
const toastOk =
  MERGE_TOASTS.some((t) => String(fired.toast).includes(t.replace("!", ""))) ||
  /머지|CONFLICT|rebase/i.test(String(fired.toast));
if (!toastOk) {
  console.error("FAIL: toast should be merge_conflict phrase", fired.toast);
  process.exit(1);
}
if (!fired.hasSparkTex && !mid.hasSparkTex) {
  console.error("FAIL: fx-merge-spark texture should exist", fired, mid);
  process.exit(1);
}
if ((mid.mergeConflictGathered ?? 0) < 1 || mid.agentCount < 2) {
  console.error("FAIL: merge_conflict should gather >=1 idle agent", mid);
  process.exit(1);
}
if ((mid.mergeConflictGathered ?? 0) > 3) {
  console.error("FAIL: merge_conflict should gather at most 3", mid);
  process.exit(1);
}
if ((mid.nearDesk ?? 0) < 1) {
  console.error("FAIL: agents should gather near open/dual desk", mid);
  process.exit(1);
}
if (!mid.gathering) {
  console.error("FAIL: merge_conflict should mark gathering", mid);
  process.exit(1);
}
if (mid.events?.lastEvent !== "merge_conflict") {
  console.error("FAIL: snapshot lastEvent should be merge_conflict", mid.events);
  process.exit(1);
}
if (
  MERGE_TOASTS.includes(skip.toast) ||
  /머지|CONFLICT|rebase/i.test(String(skip.toast))
) {
  console.error("FAIL: overlapping gather should skip merge toast", skip);
  process.exit(1);
}
if (!forceKind.includes) {
  console.error("FAIL: runMergeConflict missing", forceKind);
  process.exit(1);
}
console.log(
  "PASS: merge_conflict gathered=",
  mid.mergeConflictGathered,
  "nearDesk=",
  mid.nearDesk,
  "toast=",
  fired.toast,
);
