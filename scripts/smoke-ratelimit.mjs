/** Smoke: rate_limit — 429 toast + running/chatting bubble + magenta foot pulse; no gather. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&chatter=0`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-ratelimit";
mkdirSync(shotDir, { recursive: true });

const RATE_LIMIT_TOASTS = ["429!", "한도 찼다"];

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
  oe.fire("rate_limit");
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

  oe.fire("rate_limit");
  const bubbles = agents
    .filter((a) => a.statusText === "한도…")
    .map((a) => ({
      id: a.def?.id,
      text: a.statusText,
      hasBackup: a._rateLimitBackup != null,
      kind: a.getEffectKind?.(),
    }));
  return {
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    rateLimitTarget: oe.rateLimitTarget,
    gathering: oe.isGathering(),
    bubbles,
    events: window.__HERMES_AREA__?.events,
    kinds: agents.map((a) => ({
      id: a.def?.id,
      kind: a.getEffectKind?.(),
      live: a.live,
      status: a.serverStatus,
    })),
  };
});

await page.waitForTimeout(400);
await page
  .screenshot({ path: `${shotDir}/ratelimit-mid.png`, fullPage: false })
  .catch(() => {});

const pulsed = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  return {
    rateLimitTarget: oe.rateLimitTarget,
    lastEvent: oe.lastEvent,
    snapshotTarget: window.__HERMES_AREA__?.events?.rateLimitTarget,
    snapshotKind: window.__HERMES_AREA__?.events?.lastEvent,
  };
});

await page.waitForFunction(
  () => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const oe = sc?.officeEvents;
    if (!oe || oe.rateLimitTarget != null) return false;
    return !(sc.agents || []).some((a) => a._rateLimitBackup != null);
  },
  null,
  { timeout: 15000 },
);

const after = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  return {
    rateLimitTarget: oe.rateLimitTarget,
    gathering: oe.isGathering(),
    agents: (sc.agents || []).map((a) => ({
      id: a.def?.id,
      text: a.statusText,
      hasBackup: a._rateLimitBackup != null,
    })),
  };
});

await page
  .screenshot({ path: `${shotDir}/ratelimit-after.png`, fullPage: false })
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
  oe.rateLimitTarget = null;
  oe.fire("rate_limit");
  return {
    toast: document.getElementById("office-toast")?.textContent || "",
    rateLimitTarget: oe.rateLimitTarget,
    gathering: oe.isGathering(),
  };
});

const abortIdle = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe._gatherUntil = 0;
  const el = document.getElementById("office-toast");
  if (el) el.textContent = "LOCKED";
  oe.rateLimitTarget = null;
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
  oe.fire("rate_limit");
  return {
    toast: document.getElementById("office-toast")?.textContent || "",
    rateLimitTarget: oe.rateLimitTarget,
  };
});

const forceUrl = await page.evaluate(() => {
  const raw = "rate_limit";
  const kindsOk = true;
  return { raw, kindsOk };
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
  console.error("FAIL: events=0 should keep rate_limit off", disabled);
  process.exit(1);
}
if (mid.lastEvent !== "rate_limit") {
  console.error("FAIL: lastEvent should be rate_limit", mid.lastEvent);
  process.exit(1);
}
if (!RATE_LIMIT_TOASTS.some((t) => String(mid.toast).includes(t))) {
  console.error("FAIL: toast should be 429!/한도 찼다", mid.toast);
  process.exit(1);
}
if (!mid.rateLimitTarget) {
  console.error("FAIL: rateLimitTarget should be set", mid);
  process.exit(1);
}
if (mid.gathering) {
  console.error("FAIL: rate_limit must not mark gathering", mid);
  process.exit(1);
}
if ((mid.bubbles || []).length !== 1) {
  console.error("FAIL: expected exactly one 한도… bubble", mid.bubbles);
  process.exit(1);
}
if (mid.events?.lastEvent !== "rate_limit") {
  console.error("FAIL: snapshot lastEvent should be rate_limit", mid.events);
  process.exit(1);
}
if (pulsed.snapshotTarget !== mid.rateLimitTarget) {
  console.error("FAIL: snapshot rateLimitTarget mismatch", pulsed, mid);
  process.exit(1);
}
if (!pulsed.rateLimitTarget) {
  console.error("FAIL: rateLimitTarget should hold mid-duration", pulsed);
  process.exit(1);
}
if (after.rateLimitTarget != null) {
  console.error("FAIL: rateLimitTarget should clear after duration", after);
  process.exit(1);
}
if ((after.agents || []).some((a) => a.hasBackup)) {
  console.error("FAIL: _rateLimitBackup should clear after duration", after);
  process.exit(1);
}
if (skip.toast !== "LOCKED") {
  console.error("FAIL: overlapping gather should skip rate_limit toast", skip);
  process.exit(1);
}
if (abortIdle.rateLimitTarget != null) {
  console.error(
    "FAIL: all-idle agents should abort (no target)",
    abortIdle,
  );
  process.exit(1);
}
if (abortIdle.toast !== "LOCKED") {
  console.error("FAIL: all-idle abort should not toast", abortIdle);
  process.exit(1);
}
console.log(
  "PASS: rate_limit target=",
  mid.rateLimitTarget,
  "bubble=",
  mid.bubbles[0]?.text,
  "toast=",
  mid.toast,
);
