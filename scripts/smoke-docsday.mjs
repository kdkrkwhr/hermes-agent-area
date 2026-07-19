/** Smoke: docs_day — toast + bookshelf gather + page boost; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&chatter=0&tod=day`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-docsday";
mkdirSync(shotDir, { recursive: true });

const DOCS_TOASTS = ["문서 데이!", "스펙 각", "README…"];

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
  oe.fire("docs_day");
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
  oe.docsDayGathered = 0;

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

  const pageCountBefore = sc.bookshelfPages?.pageCount ?? 0;
  oe.fire("docs_day");
  return {
    toast: document.getElementById("office-toast")?.textContent || "",
    lastEvent: oe.lastEvent,
    gathering: oe.isGathering(),
    pageCountBefore,
    pageCountAfter: sc.bookshelfPages?.pageCount ?? 0,
    hasBoost: typeof sc.bookshelfPages?.boost === "function",
    shelfCount: sc.bookshelfPages?.tiles?.length ?? 0,
    events: window.__HERMES_AREA__?.events,
  };
});

await page.waitForFunction(
  () => (window.__HERMES_AREA__?.events?.docsDayGathered ?? 0) >= 1,
  null,
  { timeout: 25000 },
);

// path to CEO bookshelf is long (~10–15s from open desks) — wait for arrival
await page.waitForFunction(
  () => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const agents = sc?.agents || [];
    const shelves = sc?.bookshelfPages?.tiles || [];
    const desk = sc?.waypoints?.ceoDesk || { x: 30, y: 7 };
    return agents.some((a) => {
      const t = a.tilePos();
      if (Math.abs(t.x - desk.x) <= 4 && Math.abs(t.y - desk.y) <= 4) return true;
      for (const s of shelves) {
        if (Math.abs(t.x - s.tx) <= 5 && Math.abs(t.y - s.ty) <= 5) return true;
      }
      return t.x >= 26 && t.x <= 34 && t.y >= 2 && t.y <= 11;
    });
  },
  null,
  { timeout: 25000 },
);

await page.waitForTimeout(250);

await page
  .screenshot({ path: `${shotDir}/docsday-mid.png`, fullPage: false })
  .catch(() => {});

const mid = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const agents = sc.agents || [];
  const shelves = sc.bookshelfPages?.tiles || [];
  const shelf = shelves[0];
  return {
    agentCount: agents.length,
    docsDayGathered: oe.docsDayGathered,
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    gathering: oe.isGathering(),
    pageCount: sc.bookshelfPages?.pageCount ?? 0,
    events: window.__HERMES_AREA__?.events,
    nearShelf: (() => {
      const desk = sc.waypoints?.ceoDesk || { x: 30, y: 7 };
      return agents.filter((a) => {
        const t = a.tilePos();
        if (Math.abs(t.x - desk.x) <= 5 && Math.abs(t.y - desk.y) <= 5) {
          return true;
        }
        if (shelf && Math.abs(t.x - shelf.tx) <= 6 && Math.abs(t.y - shelf.ty) <= 6) {
          return true;
        }
        return t.x >= 26 && t.x <= 34 && t.y >= 2 && t.y <= 11;
      }).length;
    })(),
  };
});

const skip = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.markGathering(5000);
  const gatheredBefore = oe.docsDayGathered;
  const el = document.getElementById("office-toast");
  if (el) el.textContent = "LOCKED";
  oe.fire("docs_day");
  return {
    docsDayGathered: oe.docsDayGathered,
    gatheredBefore,
    toast: document.getElementById("office-toast")?.textContent || "",
  };
});

await page
  .screenshot({ path: `${shotDir}/docsday-after.png`, fullPage: false })
  .catch(() => {});

const result = { disabled, fired, mid, skip, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (disabled.enabled !== false || disabled.eventCountDelta !== 0) {
  console.error("FAIL: events=0 should keep docs_day off", disabled);
  process.exit(1);
}
if (fired.lastEvent !== "docs_day" && mid.lastEvent !== "docs_day") {
  console.error("FAIL: lastEvent should be docs_day", fired, mid.lastEvent);
  process.exit(1);
}
const toastOk = DOCS_TOASTS.some(
  (t) =>
    String(fired.toast).includes("문서") ||
    String(fired.toast).includes("스펙") ||
    String(fired.toast).includes("README") ||
    String(fired.toast).includes(t.replace("!", "")),
);
if (!toastOk) {
  console.error("FAIL: toast should be docs phrase", fired.toast);
  process.exit(1);
}
if (!fired.hasBoost) {
  console.error("FAIL: BookshelfPages.boost should exist", fired);
  process.exit(1);
}
if ((mid.docsDayGathered ?? 0) < 1 || mid.agentCount < 2) {
  console.error("FAIL: docs_day should gather ≥1 agent", mid);
  process.exit(1);
}
if ((mid.nearShelf ?? 0) < 1) {
  console.error("FAIL: agents should gather near bookshelf", mid);
  process.exit(1);
}
if (!mid.gathering) {
  console.error("FAIL: docs_day should mark gathering", mid);
  process.exit(1);
}
if (mid.events?.lastEvent !== "docs_day") {
  console.error("FAIL: snapshot lastEvent should be docs_day", mid.events);
  process.exit(1);
}
if ((mid.pageCount ?? 0) < 1 && (fired.pageCountAfter ?? 0) <= (fired.pageCountBefore ?? 0)) {
  console.error("FAIL: page flutter boost should increase pageCount", fired, mid);
  process.exit(1);
}
if (
  DOCS_TOASTS.includes(skip.toast) ||
  String(skip.toast).includes("문서") ||
  String(skip.toast).includes("스펙") ||
  String(skip.toast).includes("README")
) {
  console.error("FAIL: overlapping gather should skip docs toast", skip);
  process.exit(1);
}
console.log(
  "PASS: docs_day gathered=",
  mid.docsDayGathered,
  "nearShelf=",
  mid.nearShelf,
  "pageCount=",
  mid.pageCount,
  "toast=",
  fired.toast,
);
