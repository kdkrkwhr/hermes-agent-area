/** Smoke: rollback — rose/coral overlay + toast + Open Desk/lobby gather; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&chatter=0&sfx=0&tod=day`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-rollback";
mkdirSync(shotDir, { recursive: true });

const ROLLBACK_TOASTS = ["롤백!", "이전 버전으로"];
const ROLLBACK_CORAL = 0xd45868;
const ROLLBACK_ALPHA_MIN = 0.12;
const ROLLBACK_ALPHA_MAX = 0.18;

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
    return !!(
      sc?.officeEvents &&
      sc?.lightingOverlay &&
      sc?.lightingPreset &&
      (sc.agents?.length ?? 0) >= 2
    );
  },
  null,
  { timeout: 15000 },
);

const disabled = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const countBefore = oe.eventCount;
  oe.fire("rollback");
  return {
    enabled: oe.enabled,
    eventCountDelta: oe.eventCount - countBefore,
    lastEvent: oe.lastEvent,
  };
});

const forceKind = await page.evaluate(() => {
  const raw = "rollback";
  try {
    const u = new URL(location.href);
    u.searchParams.set("events", raw);
    const v = u.searchParams.get("events");
    return { raw, forceKind: v };
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
  oe._deployBeatCooldownUntil = 0;
  oe._gatherUntil = 0;
  oe.rollbackGathered = 0;

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

  oe.fire("rollback");
  return {
    toast: document.getElementById("office-toast")?.textContent || "",
    lastEvent: oe.lastEvent,
    gathering: oe.isGathering(),
    overlayFill: sc.lightingOverlay.fillColor,
    overlayAlpha: sc.lightingOverlay.fillAlpha,
    events: window.__HERMES_AREA__?.events,
  };
});

await page.waitForFunction(
  () => (window.__HERMES_AREA__?.events?.rollbackGathered ?? 0) >= 1,
  null,
  { timeout: 25000 },
);

await page.waitForTimeout(250);

await page
  .screenshot({ path: `${shotDir}/rollback-mid.png`, fullPage: false })
  .catch(() => {});

const mid = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const agents = sc.agents || [];
  const open = sc.waypoints?.desks || [];
  const focus = sc.waypoints?.focusDesks || [{ x: 3, y: 19 }];
  const desks = open.length ? open : focus;
  const lob = sc.waypoints?.lobby;
  const lobCx = lob
    ? Math.floor((lob.xMin + lob.xMax) / 2)
    : 20;
  const lobCy = lob
    ? Math.floor((lob.yMin + lob.yMax) / 2)
    : 27;
  return {
    agentCount: agents.length,
    rollbackGathered: oe.rollbackGathered,
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    gathering: oe.isGathering(),
    overlayFill: sc.lightingOverlay.fillColor,
    overlayAlpha: sc.lightingOverlay.fillAlpha,
    events: window.__HERMES_AREA__?.events,
    nearGather: agents.filter((a) => {
      const t = a.tilePos();
      const nearDesk = desks.some(
        (d) => Math.abs(t.x - d.x) <= 12 && Math.abs(t.y - d.y) <= 12,
      );
      const nearLob =
        Math.abs(t.x - lobCx) <= 12 && Math.abs(t.y - lobCy) <= 12;
      return nearDesk || nearLob;
    }).length,
    bubbles: agents
      .filter((a) => a._rollbackBackup != null)
      .map((a) => a.statusText),
  };
});

const skip = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.markGathering(5000);
  const gatheredBefore = oe.rollbackGathered;
  const el = document.getElementById("office-toast");
  if (el) el.textContent = "LOCKED";
  oe.fire("rollback");
  return {
    rollbackGathered: oe.rollbackGathered,
    gatheredBefore,
    toast: document.getElementById("office-toast")?.textContent || "",
  };
});

await page
  .screenshot({ path: `${shotDir}/rollback-after.png`, fullPage: false })
  .catch(() => {});

const result = { disabled, forceKind, fired, mid, skip, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (disabled.enabled !== false || disabled.eventCountDelta !== 0) {
  console.error("FAIL: events=0 should keep rollback off", disabled);
  process.exit(1);
}
if (forceKind.forceKind !== "rollback") {
  console.error("FAIL: ?events=rollback forceKind", forceKind);
  process.exit(1);
}
if (fired.lastEvent !== "rollback" && mid.lastEvent !== "rollback") {
  console.error("FAIL: lastEvent should be rollback", fired, mid.lastEvent);
  process.exit(1);
}
const toastOk =
  ROLLBACK_TOASTS.some((t) =>
    String(fired.toast).includes(t.replace("!", "")),
  ) || /롤백|이전 버전/i.test(String(fired.toast));
if (!toastOk) {
  console.error("FAIL: toast should be rollback phrase", fired.toast);
  process.exit(1);
}
if (fired.overlayFill !== ROLLBACK_CORAL) {
  console.error(
    "FAIL: overlay should be rose/coral",
    fired.overlayFill?.toString(16),
    "expected",
    ROLLBACK_CORAL.toString(16),
  );
  process.exit(1);
}
if (
  fired.overlayAlpha < ROLLBACK_ALPHA_MIN - 0.01 ||
  fired.overlayAlpha > ROLLBACK_ALPHA_MAX + 0.01
) {
  console.error(
    "FAIL: overlay alpha should be ~0.12–0.18",
    fired.overlayAlpha,
  );
  process.exit(1);
}
if ((mid.rollbackGathered ?? 0) < 1 || mid.agentCount < 2) {
  console.error("FAIL: rollback should gather >=1 idle agent", mid);
  process.exit(1);
}
if ((mid.rollbackGathered ?? 0) > 3) {
  console.error("FAIL: rollback should gather at most 3", mid);
  process.exit(1);
}
if ((mid.nearGather ?? 0) < 1) {
  console.error("FAIL: agents should gather near open desk/lobby", mid);
  process.exit(1);
}
if (!mid.gathering) {
  console.error("FAIL: rollback should mark gathering", mid);
  process.exit(1);
}
if (mid.events?.lastEvent !== "rollback") {
  console.error("FAIL: snapshot lastEvent should be rollback", mid.events);
  process.exit(1);
}
if ((mid.events?.rollbackGathered ?? 0) < 1) {
  console.error("FAIL: snapshot should expose rollbackGathered", mid.events);
  process.exit(1);
}
if (
  ROLLBACK_TOASTS.includes(skip.toast) ||
  /롤백|이전 버전/i.test(String(skip.toast))
) {
  console.error("FAIL: overlapping gather should skip rollback toast", skip);
  process.exit(1);
}
console.log(
  "PASS: rollback gathered=",
  mid.rollbackGathered,
  "nearGather=",
  mid.nearGather,
  "toast=",
  fired.toast,
  "overlay=#",
  fired.overlayFill.toString(16),
  "α=",
  fired.overlayAlpha.toFixed(3),
);
