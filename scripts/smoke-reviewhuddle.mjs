/** Smoke: review_huddle — toast + amber chalk + War Room gather; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&chatter=0&tod=day`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-reviewhuddle";
mkdirSync(shotDir, { recursive: true });

const REVIEW_TOASTS = ["리뷰 허들!", "PR 각?", "리뷰 ㄱㄱ"];

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
  oe.fire("review_huddle");
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
  oe.reviewHuddleGathered = 0;

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

  oe.fire("review_huddle");
  return {
    toast: document.getElementById("office-toast")?.textContent || "",
    lastEvent: oe.lastEvent,
    gathering: oe.isGathering(),
    hasChalkTex: sc.textures.exists("fx-chalk"),
    events: window.__HERMES_AREA__?.events,
  };
});

await page.waitForFunction(
  () => (window.__HERMES_AREA__?.events?.reviewHuddleGathered ?? 0) >= 1,
  null,
  { timeout: 25000 },
);

await page.waitForTimeout(250);

await page
  .screenshot({ path: `${shotDir}/reviewhuddle-mid.png`, fullPage: false })
  .catch(() => {});

const mid = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const agents = sc.agents || [];
  const meet = sc.waypoints?.meeting || { x: 17, y: 10 };
  return {
    agentCount: agents.length,
    reviewHuddleGathered: oe.reviewHuddleGathered,
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    gathering: oe.isGathering(),
    hasChalkTex: sc.textures.exists("fx-chalk"),
    events: window.__HERMES_AREA__?.events,
    nearMeeting: agents.filter((a) => {
      const t = a.tilePos();
      return Math.abs(t.x - meet.x) <= 12 && Math.abs(t.y - meet.y) <= 12;
    }).length,
  };
});

const skip = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.markGathering(5000);
  const gatheredBefore = oe.reviewHuddleGathered;
  const el = document.getElementById("office-toast");
  if (el) el.textContent = "LOCKED";
  oe.fire("review_huddle");
  return {
    reviewHuddleGathered: oe.reviewHuddleGathered,
    gatheredBefore,
    toast: document.getElementById("office-toast")?.textContent || "",
  };
});

await page
  .screenshot({ path: `${shotDir}/reviewhuddle-after.png`, fullPage: false })
  .catch(() => {});

const result = { disabled, fired, mid, skip, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (disabled.enabled !== false || disabled.eventCountDelta !== 0) {
  console.error("FAIL: events=0 should keep review_huddle off", disabled);
  process.exit(1);
}
if (
  fired.lastEvent !== "review_huddle" &&
  mid.lastEvent !== "review_huddle"
) {
  console.error("FAIL: lastEvent should be review_huddle", fired, mid.lastEvent);
  process.exit(1);
}
const toastOk = REVIEW_TOASTS.some(
  (t) =>
    String(fired.toast).includes("리뷰") ||
    String(fired.toast).includes("PR") ||
    String(fired.toast).includes(t.replace("!", "")),
);
if (!toastOk) {
  console.error("FAIL: toast should be review phrase", fired.toast);
  process.exit(1);
}
if (!fired.hasChalkTex && !mid.hasChalkTex) {
  console.error("FAIL: fx-chalk texture should exist", fired, mid);
  process.exit(1);
}
if ((mid.reviewHuddleGathered ?? 0) < 1 || mid.agentCount < 2) {
  console.error("FAIL: review_huddle should gather ≥1 agent", mid);
  process.exit(1);
}
if ((mid.nearMeeting ?? 0) < 1) {
  console.error("FAIL: agents should gather near meeting", mid);
  process.exit(1);
}
if (!mid.gathering) {
  console.error("FAIL: review_huddle should mark gathering", mid);
  process.exit(1);
}
if (mid.events?.lastEvent !== "review_huddle") {
  console.error("FAIL: snapshot lastEvent should be review_huddle", mid.events);
  process.exit(1);
}
if (
  REVIEW_TOASTS.includes(skip.toast) ||
  String(skip.toast).includes("리뷰") ||
  String(skip.toast).includes("PR")
) {
  console.error("FAIL: overlapping gather should skip review toast", skip);
  process.exit(1);
}
console.log(
  "PASS: review_huddle gathered=",
  mid.reviewHuddleGathered,
  "nearMeeting=",
  mid.nearMeeting,
  "toast=",
  fired.toast,
);
