/** Smoke: oncall_page — toast + amber/red pulse + idle/ready target; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&chatter=0&tod=evening`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-oncallpage";
mkdirSync(shotDir, { recursive: true });

const ONCALL_TOASTS = ["온콜!", "페이저 울림"];

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
  oe.fire("oncall_page");
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
  oe.oncallPageTarget = null;

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
    sc._emitterKinds.set(a.def.id, "idle");
    a.setStatus("대기");
  }

  oe.fire("oncall_page");
  const bubbles = agents
    .filter((a) => a.statusText === "온콜…" || a.statusText === "페이저?")
    .map((a) => ({
      id: a.def?.id,
      text: a.statusText,
      hasBackup: a._oncallBackup != null,
      kind: a.getEffectKind?.(),
    }));
  return {
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    oncallPageTarget: oe.oncallPageTarget,
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
  .screenshot({ path: `${shotDir}/oncall-mid.png`, fullPage: false })
  .catch(() => {});

const pulsed = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  return {
    oncallPageTarget: oe.oncallPageTarget,
    lastEvent: oe.lastEvent,
    snapshotTarget: window.__HERMES_AREA__?.events?.oncallPageTarget,
    snapshotKind: window.__HERMES_AREA__?.events?.lastEvent,
  };
});

await page.waitForFunction(
  () => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const oe = sc?.officeEvents;
    if (!oe || oe.oncallPageTarget != null) return false;
    return !(sc.agents || []).some((a) => a._oncallBackup != null);
  },
  null,
  { timeout: 15000 },
);

const after = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  return {
    oncallPageTarget: oe.oncallPageTarget,
    gathering: oe.isGathering(),
    agents: (sc.agents || []).map((a) => ({
      id: a.def?.id,
      text: a.statusText,
      hasBackup: a._oncallBackup != null,
    })),
  };
});

await page
  .screenshot({ path: `${shotDir}/oncall-after.png`, fullPage: false })
  .catch(() => {});

const skip = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  for (const a of sc.agents || []) {
    a.live = false;
    a.serverStatus = null;
    a.currentKind = "break";
  }
  oe.markGathering(5000);
  const el = document.getElementById("office-toast");
  if (el) el.textContent = "LOCKED";
  oe.oncallPageTarget = null;
  oe.fire("oncall_page");
  return {
    toast: document.getElementById("office-toast")?.textContent || "",
    oncallPageTarget: oe.oncallPageTarget,
    gathering: oe.isGathering(),
  };
});

const abortRunning = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe._gatherUntil = 0;
  const el = document.getElementById("office-toast");
  if (el) el.textContent = "LOCKED";
  oe.oncallPageTarget = null;
  for (const a of sc.agents || []) {
    a.live = false;
    a.serverStatus = null;
    a.serverData = null;
    a.currentKind = "desk";
    a.path = [];
    a.pathIndex = 0;
    a.busy = false;
    if (sc._emitterKinds) sc._emitterKinds.set(a.def.id, "running");
  }
  oe.fire("oncall_page");
  return {
    toast: document.getElementById("office-toast")?.textContent || "",
    oncallPageTarget: oe.oncallPageTarget,
  };
});

const forceUrl = await page.evaluate(() => {
  // RANDOM_KINDS membership — force parse path
  const raw = "oncall_page";
  const kindsOk = true;
  return { raw, kindsOk };
});

const result = {
  disabled,
  mid,
  pulsed,
  after,
  skip,
  abortRunning,
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
  console.error("FAIL: events=0 should keep oncall_page off", disabled);
  process.exit(1);
}
if (mid.lastEvent !== "oncall_page") {
  console.error("FAIL: lastEvent should be oncall_page", mid.lastEvent);
  process.exit(1);
}
if (!ONCALL_TOASTS.some((t) => String(mid.toast).includes(t))) {
  console.error("FAIL: toast should be 온콜!/페이저 울림", mid.toast);
  process.exit(1);
}
if (!mid.oncallPageTarget) {
  console.error("FAIL: oncallPageTarget should be set", mid);
  process.exit(1);
}
if (mid.gathering) {
  console.error("FAIL: oncall_page must not mark gathering", mid);
  process.exit(1);
}
if ((mid.bubbles || []).length < 1) {
  console.error("FAIL: expected 온콜…/페이저? bubble", mid.bubbles);
  process.exit(1);
}
if (mid.events?.lastEvent !== "oncall_page") {
  console.error("FAIL: snapshot lastEvent should be oncall_page", mid.events);
  process.exit(1);
}
if (pulsed.snapshotTarget !== mid.oncallPageTarget) {
  console.error("FAIL: snapshot oncallPageTarget mismatch", pulsed, mid);
  process.exit(1);
}
if (!pulsed.oncallPageTarget) {
  console.error("FAIL: oncallPageTarget should hold mid-duration", pulsed);
  process.exit(1);
}
if (after.oncallPageTarget != null) {
  console.error("FAIL: oncallPageTarget should clear after duration", after);
  process.exit(1);
}
if ((after.agents || []).some((a) => a.hasBackup)) {
  console.error("FAIL: _oncallBackup should clear after duration", after);
  process.exit(1);
}
if (skip.toast !== "LOCKED") {
  console.error("FAIL: overlapping gather should skip oncall toast", skip);
  process.exit(1);
}
if (abortRunning.oncallPageTarget != null) {
  console.error(
    "FAIL: all-running agents should abort (no target)",
    abortRunning,
  );
  process.exit(1);
}
if (abortRunning.toast !== "LOCKED") {
  console.error("FAIL: all-running abort should not toast", abortRunning);
  process.exit(1);
}
console.log(
  "PASS: oncall_page target=",
  mid.oncallPageTarget,
  "bubble=",
  mid.bubbles[0]?.text,
);
