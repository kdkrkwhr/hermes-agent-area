/** Smoke: bug_bash — toast + amber/lime stickies + War Room idle gather; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&chatter=0&sfx=0&tod=day`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-bugbash";
mkdirSync(shotDir, { recursive: true });

const BUG_BASH_TOASTS = ["버그배시!", "재현 ㄱㄱ"];

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
  oe.fire("bug_bash");
  return {
    enabled: oe.enabled,
    eventCountDelta: oe.eventCount - countBefore,
    lastEvent: oe.lastEvent,
  };
});

const fired = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  // pin mock: stop WS yank during gather
  sc._wsManualClose = true;
  try {
    sc.ws?.close?.();
  } catch {
    /* ignore */
  }
  sc.applySnapshot = () => {};
  sc.setLive?.(false);
  oe.enabled = true;
  if (oe._schedule) {
    oe._schedule.remove(false);
    oe._schedule = null;
  }
  oe._shipCooldownUntil = sc.time.now + 999999;
  oe._gatherUntil = 0;
  oe.bugBashGathered = 0;

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

  oe.fire("bug_bash");
  return {
    toast: document.getElementById("office-toast")?.textContent || "",
    lastEvent: oe.lastEvent,
    gathering: oe.isGathering(),
    hasStickyTex: sc.textures.exists("fx-bug-sticky"),
    events: window.__HERMES_AREA__?.events,
  };
});

await page.waitForFunction(
  () => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const gathered = window.__HERMES_AREA__?.events?.bugBashGathered ?? 0;
    if (gathered < 1) return false;
    const meet = sc?.waypoints?.meeting || { x: 17, y: 10 };
    const agents = sc?.agents || [];
    const near = agents.filter((a) => {
      const t = a.tilePos();
      return Math.abs(t.x - meet.x) <= 14 && Math.abs(t.y - meet.y) <= 14;
    }).length;
    return near >= 1;
  },
  null,
  { timeout: 25000 },
);

await page.waitForTimeout(250);

await page
  .screenshot({ path: `${shotDir}/bugbash-mid.png`, fullPage: false })
  .catch(() => {});

const mid = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const agents = sc.agents || [];
  const meet = sc.waypoints?.meeting || { x: 17, y: 10 };
  return {
    agentCount: agents.length,
    bugBashGathered: oe.bugBashGathered,
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    gathering: oe.isGathering(),
    hasStickyTex: sc.textures.exists("fx-bug-sticky"),
    events: window.__HERMES_AREA__?.events,
    nearMeeting: agents.filter((a) => {
      const t = a.tilePos();
      return Math.abs(t.x - meet.x) <= 14 && Math.abs(t.y - meet.y) <= 14;
    }).length,
    bubbleCount: agents.filter((a) => {
      const s = String(a.statusText || "");
      return s.includes("재현") || s.includes("로그");
    }).length,
  };
});

const skip = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.markGathering(5000);
  const gatheredBefore = oe.bugBashGathered;
  const el = document.getElementById("office-toast");
  if (el) el.textContent = "LOCKED";
  oe.fire("bug_bash");
  return {
    bugBashGathered: oe.bugBashGathered,
    gatheredBefore,
    toast: document.getElementById("office-toast")?.textContent || "",
  };
});

await page
  .screenshot({ path: `${shotDir}/bugbash-after.png`, fullPage: false })
  .catch(() => {});

const result = { disabled, fired, mid, skip, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (disabled.enabled !== false || disabled.eventCountDelta !== 0) {
  console.error("FAIL: events=0 should keep bug_bash off", disabled);
  process.exit(1);
}
if (fired.lastEvent !== "bug_bash" && mid.lastEvent !== "bug_bash") {
  console.error("FAIL: lastEvent should be bug_bash", fired, mid.lastEvent);
  process.exit(1);
}
const toastOk = BUG_BASH_TOASTS.some(
  (t) =>
    String(fired.toast).includes("버그") ||
    String(fired.toast).includes("재현") ||
    String(fired.toast).includes(t.replace("!", "")),
);
if (!toastOk) {
  console.error("FAIL: toast should be bug_bash phrase", fired.toast);
  process.exit(1);
}
if (!fired.hasStickyTex && !mid.hasStickyTex) {
  console.error("FAIL: fx-bug-sticky texture should exist", fired, mid);
  process.exit(1);
}
if ((mid.bugBashGathered ?? 0) < 1 || mid.agentCount < 2) {
  console.error("FAIL: bug_bash should gather ≥1 idle agent", mid);
  process.exit(1);
}
if ((mid.bugBashGathered ?? 0) > 4) {
  console.error("FAIL: bug_bash should gather at most 4", mid);
  process.exit(1);
}
if ((mid.nearMeeting ?? 0) < 1) {
  console.error("FAIL: agents should gather near meeting", mid);
  process.exit(1);
}
if (!mid.gathering) {
  console.error("FAIL: bug_bash should mark gathering", mid);
  process.exit(1);
}
if (mid.events?.lastEvent !== "bug_bash") {
  console.error("FAIL: snapshot lastEvent should be bug_bash", mid.events);
  process.exit(1);
}
if (
  BUG_BASH_TOASTS.includes(skip.toast) ||
  String(skip.toast).includes("버그") ||
  String(skip.toast).includes("재현")
) {
  console.error("FAIL: overlapping gather should skip bug_bash toast", skip);
  process.exit(1);
}
console.log(
  "PASS: bug_bash gathered=",
  mid.bugBashGathered,
  "nearMeeting=",
  mid.nearMeeting,
  "bubbles=",
  mid.bubbleCount,
  "toast=",
  fired.toast,
);
