/** Smoke: context_overflow — toast + running/chatting bubble + violet/indigo particles; no gather. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&chatter=0`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-contextoverflow";
mkdirSync(shotDir, { recursive: true });

const CONTEXT_OVERFLOW_TOASTS = ["컨텍스트 풀!", "토큰 넘침"];
const CONTEXT_OVERFLOW_LINES = ["요약부터…", "윈도우 잘림"];

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
    return !!(sc?.officeEvents && (sc.agents?.length ?? 0) >= 1);
  },
  null,
  { timeout: 15000 },
);

const disabled = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const countBefore = oe.eventCount;
  oe.fire("context_overflow");
  return {
    enabled: oe.enabled,
    eventCountDelta: oe.eventCount - countBefore,
    lastEvent: oe.lastEvent,
  };
});

const mid = await page.evaluate(() => {
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
  oe.contextOverflowTarget = null;
  oe.rateLimitTarget = null;

  if (!sc._emitterKinds) sc._emitterKinds = new Map();
  const agents = sc.agents || [];
  for (const a of agents) {
    a.live = false;
    a.serverStatus = null;
    a.serverData = null;
    a.currentKind = "desk";
    a.path = [];
    a.pathIndex = 0;
    a.busy = false;
    a.idleUntil = sc.time.now + 999999;
    sc._emitterKinds.set(a.def.id, "running");
    a.setStatus("작업중");
  }

  oe.fire("context_overflow");
  const bubbles = agents
    .filter((a) => a._overflowBackup != null)
    .map((a) => ({
      id: a.def?.id,
      text: a.statusText,
      hasBackup: a._overflowBackup != null,
      kind: a.getEffectKind?.(),
    }));
  return {
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    contextOverflowTarget: oe.contextOverflowTarget,
    gathering: oe.isGathering(),
    bubbles,
    events: window.__HERMES_AREA__?.events,
  };
});

await page.waitForTimeout(400);
await page
  .screenshot({ path: `${shotDir}/overflow-mid.png`, fullPage: false })
  .catch(() => {});

const pulsed = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  return {
    contextOverflowTarget: oe.contextOverflowTarget,
    lastEvent: oe.lastEvent,
    snapshotTarget: window.__HERMES_AREA__?.events?.contextOverflowTarget,
    snapshotKind: window.__HERMES_AREA__?.events?.lastEvent,
    rateLimitTarget: oe.rateLimitTarget,
    latencySpikeAffected: oe.latencySpikeAffected,
  };
});

await page.waitForFunction(
  () => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const oe = sc?.officeEvents;
    if (!oe || oe.contextOverflowTarget != null) return false;
    return !(sc.agents || []).some((a) => a._overflowBackup != null);
  },
  null,
  { timeout: 15000 },
);

const after = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  return {
    contextOverflowTarget: oe.contextOverflowTarget,
    gathering: oe.isGathering(),
    agents: (sc.agents || []).map((a) => ({
      id: a.def?.id,
      text: a.statusText,
      hasBackup: a._overflowBackup != null,
    })),
  };
});

await page
  .screenshot({ path: `${shotDir}/overflow-after.png`, fullPage: false })
  .catch(() => {});

const skip = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  for (const a of sc.agents || []) {
    a.live = false;
    a.serverStatus = null;
    a.currentKind = "desk";
  }
  oe.markGathering(5000);
  const el = document.getElementById("office-toast");
  if (el) el.textContent = "LOCKED";
  oe.contextOverflowTarget = null;
  oe.fire("context_overflow");
  return {
    toast: document.getElementById("office-toast")?.textContent || "",
    contextOverflowTarget: oe.contextOverflowTarget,
    gathering: oe.isGathering(),
  };
});

const abortIdle = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe._gatherUntil = 0;
  const el = document.getElementById("office-toast");
  if (el) el.textContent = "LOCKED";
  oe.contextOverflowTarget = null;
  for (const a of sc.agents || []) {
    a.live = false;
    a.serverStatus = null;
    a.serverData = null;
    a.currentKind = "break";
    a.path = [];
    a.pathIndex = 0;
    a.busy = false;
    if (sc._emitterKinds) sc._emitterKinds.set(a.def.id, "idle");
  }
  oe.fire("context_overflow");
  return {
    toast: document.getElementById("office-toast")?.textContent || "",
    contextOverflowTarget: oe.contextOverflowTarget,
  };
});

const forceUrl = await page.evaluate(() => {
  const raw = new URLSearchParams("events=context_overflow").get("events");
  return { raw, kindsOk: raw === "context_overflow" };
});

const result = {
  disabled,
  mid,
  pulsed,
  after,
  skip,
  abortIdle,
  forceUrl,
  errors,
};
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (disabled.enabled !== false || disabled.eventCountDelta !== 0) {
  console.error("FAIL: events=0 should keep context_overflow off", disabled);
  process.exit(1);
}
if (mid.lastEvent !== "context_overflow") {
  console.error("FAIL: lastEvent should be context_overflow", mid.lastEvent);
  process.exit(1);
}
if (!CONTEXT_OVERFLOW_TOASTS.some((t) => String(mid.toast).includes(t))) {
  console.error("FAIL: toast should be 컨텍스트 풀!/토큰 넘침", mid.toast);
  process.exit(1);
}
if (!mid.contextOverflowTarget) {
  console.error("FAIL: contextOverflowTarget should be set", mid);
  process.exit(1);
}
if (mid.gathering) {
  console.error("FAIL: context_overflow must not mark gathering", mid);
  process.exit(1);
}
if ((mid.bubbles || []).length !== 1) {
  console.error("FAIL: expected exactly one overflow bubble", mid.bubbles);
  process.exit(1);
}
if (!CONTEXT_OVERFLOW_LINES.includes(mid.bubbles[0]?.text)) {
  console.error("FAIL: bubble should be 요약부터…/윈도우 잘림", mid.bubbles);
  process.exit(1);
}
if (mid.events?.lastEvent !== "context_overflow") {
  console.error("FAIL: snapshot lastEvent should be context_overflow", mid.events);
  process.exit(1);
}
if (mid.events?.contextOverflowTarget !== mid.contextOverflowTarget) {
  console.error("FAIL: snapshot contextOverflowTarget mismatch", mid.events);
  process.exit(1);
}
if (pulsed.snapshotTarget !== mid.contextOverflowTarget) {
  console.error("FAIL: snapshot target mismatch", pulsed, mid);
  process.exit(1);
}
if (!pulsed.contextOverflowTarget) {
  console.error("FAIL: contextOverflowTarget should hold mid-duration", pulsed);
  process.exit(1);
}
if (pulsed.rateLimitTarget != null) {
  console.error("FAIL: must not set rateLimitTarget", pulsed);
  process.exit(1);
}
if ((pulsed.latencySpikeAffected || 0) !== 0) {
  console.error("FAIL: must not touch latencySpikeAffected", pulsed);
  process.exit(1);
}
if (after.contextOverflowTarget != null) {
  console.error("FAIL: contextOverflowTarget should clear after duration", after);
  process.exit(1);
}
if ((after.agents || []).some((a) => a.hasBackup)) {
  console.error("FAIL: _overflowBackup should clear after duration", after);
  process.exit(1);
}
if (skip.toast !== "LOCKED") {
  console.error("FAIL: overlapping gather should skip toast", skip);
  process.exit(1);
}
if (abortIdle.contextOverflowTarget != null) {
  console.error("FAIL: all-idle agents should abort (no target)", abortIdle);
  process.exit(1);
}
if (abortIdle.toast !== "LOCKED") {
  console.error("FAIL: all-idle abort should not toast", abortIdle);
  process.exit(1);
}
if (!forceUrl.kindsOk) {
  console.error("FAIL: ?events=context_overflow force parse", forceUrl);
  process.exit(1);
}
console.log(
  "PASS: context_overflow target=",
  mid.contextOverflowTarget,
  "bubble=",
  mid.bubbles[0]?.text,
  "toast=",
  mid.toast,
);
