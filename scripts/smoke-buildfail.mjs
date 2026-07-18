/** Smoke: build_fail — rose/red overlay + toast + Open Desk 1–3 gather; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&chatter=0&sfx=0&tod=day`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-buildfail";
mkdirSync(shotDir, { recursive: true });

const BUILD_FAIL_TOASTS = ["빌드 깨짐!", "CI 빨강"];
const BUILD_FAIL_ROSE = 0xc04558;
const BUILD_FAIL_ALPHA_MIN = 0.12;
const BUILD_FAIL_ALPHA_MAX = 0.18;

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
  oe.fire("build_fail");
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
  oe.buildFailGathered = 0;

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

  oe.fire("build_fail");
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
  () => (window.__HERMES_AREA__?.events?.buildFailGathered ?? 0) >= 1,
  null,
  { timeout: 25000 },
);

await page.waitForTimeout(250);

await page
  .screenshot({ path: `${shotDir}/buildfail-mid.png`, fullPage: false })
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
    buildFailGathered: oe.buildFailGathered,
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    gathering: oe.isGathering(),
    overlayFill: sc.lightingOverlay.fillColor,
    overlayAlpha: sc.lightingOverlay.fillAlpha,
    events: window.__HERMES_AREA__?.events,
    nearDesk: agents.filter((a) => {
      const t = a.tilePos();
      return desks.some(
        (d) => Math.abs(t.x - d.x) <= 12 && Math.abs(t.y - d.y) <= 12,
      );
    }).length,
    bubbles: agents
      .filter((a) => a._buildFailBackup != null)
      .map((a) => a.statusText),
  };
});

const skip = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.markGathering(5000);
  const gatheredBefore = oe.buildFailGathered;
  const el = document.getElementById("office-toast");
  if (el) el.textContent = "LOCKED";
  const overlayBefore = sc.lightingOverlay.fillColor;
  oe.fire("build_fail");
  return {
    buildFailGathered: oe.buildFailGathered,
    gatheredBefore,
    toast: document.getElementById("office-toast")?.textContent || "",
    overlayFill: sc.lightingOverlay.fillColor,
    overlayBefore,
  };
});

const forceKind = await page.evaluate(() => {
  const oe =
    window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene")?.officeEvents;
  return {
    includes: typeof oe?.runBuildFail === "function",
    raw: "build_fail",
    lastEvent: oe?.lastEvent,
  };
});

await page
  .screenshot({ path: `${shotDir}/buildfail-after.png`, fullPage: false })
  .catch(() => {});

const result = { disabled, fired, mid, skip, forceKind, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (disabled.enabled !== false || disabled.eventCountDelta !== 0) {
  console.error("FAIL: events=0 should keep build_fail off", disabled);
  process.exit(1);
}
if (fired.lastEvent !== "build_fail" && mid.lastEvent !== "build_fail") {
  console.error("FAIL: lastEvent should be build_fail", fired, mid.lastEvent);
  process.exit(1);
}
const toastOk =
  BUILD_FAIL_TOASTS.some((t) =>
    String(fired.toast).includes(t.replace("!", "")),
  ) || /빌드|CI|빨강/i.test(String(fired.toast));
if (!toastOk) {
  console.error("FAIL: toast should be build_fail phrase", fired.toast);
  process.exit(1);
}
if (fired.overlayFill !== BUILD_FAIL_ROSE) {
  console.error(
    "FAIL: overlay should be rose/red",
    fired.overlayFill?.toString(16),
    "expected",
    BUILD_FAIL_ROSE.toString(16),
  );
  process.exit(1);
}
if (
  fired.overlayAlpha < BUILD_FAIL_ALPHA_MIN - 0.01 ||
  fired.overlayAlpha > BUILD_FAIL_ALPHA_MAX + 0.01
) {
  console.error(
    "FAIL: overlay alpha should be ~0.12–0.18",
    fired.overlayAlpha,
  );
  process.exit(1);
}
if ((mid.buildFailGathered ?? 0) < 1 || mid.agentCount < 2) {
  console.error("FAIL: build_fail should gather >=1 idle agent", mid);
  process.exit(1);
}
if ((mid.buildFailGathered ?? 0) > 3) {
  console.error("FAIL: build_fail should gather at most 3", mid);
  process.exit(1);
}
if ((mid.nearDesk ?? 0) < 1) {
  console.error("FAIL: agents should gather near open desk", mid);
  process.exit(1);
}
if (!mid.gathering) {
  console.error("FAIL: build_fail should mark gathering", mid);
  process.exit(1);
}
if (mid.events?.lastEvent !== "build_fail") {
  console.error("FAIL: snapshot lastEvent should be build_fail", mid.events);
  process.exit(1);
}
if ((mid.events?.buildFailGathered ?? 0) < 1) {
  console.error("FAIL: snapshot should expose buildFailGathered", mid.events);
  process.exit(1);
}
if (
  BUILD_FAIL_TOASTS.includes(skip.toast) ||
  /빌드|CI|빨강/i.test(String(skip.toast))
) {
  console.error("FAIL: overlapping gather should skip build_fail toast", skip);
  process.exit(1);
}
if (!forceKind.includes) {
  console.error("FAIL: runBuildFail missing", forceKind);
  process.exit(1);
}
console.log(
  "PASS: build_fail gathered=",
  mid.buildFailGathered,
  "nearDesk=",
  mid.nearDesk,
  "toast=",
  fired.toast,
  "overlay=#",
  fired.overlayFill.toString(16),
  "α=",
  fired.overlayAlpha.toFixed(3),
);
