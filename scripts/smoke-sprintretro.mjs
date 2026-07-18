/** Smoke: sprint_retro — toast + pastel sticky + War Room idle gather; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&chatter=0&tod=day`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-sprintretro";
mkdirSync(shotDir, { recursive: true });

const RETRO_TOASTS = ["회고 각!", "레트로!", "Keep/Problem/Try"];

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
  oe.fire("sprint_retro");
  return {
    enabled: oe.enabled,
    eventCountDelta: oe.eventCount - countBefore,
    lastEvent: oe.lastEvent,
  };
});

const forceKind = await page.evaluate(() => {
  const raw = "sprint_retro";
  try {
    const u = new URL(location.href);
    u.searchParams.set("events", raw);
    // probe parse via recreating mode from query string
    const mode = (() => {
      const v = u.searchParams.get("events");
      if (v === "0" || v === "off" || v === "false") {
        return { enabled: false, forceKind: null };
      }
      // mirror RANDOM_KINDS membership via fire path after enable
      return { enabled: true, forceKind: v };
    })();
    return { raw, ...mode };
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
  oe._gatherUntil = 0;
  oe.sprintRetroGathered = 0;

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

  oe.fire("sprint_retro");
  return {
    toast: document.getElementById("office-toast")?.textContent || "",
    lastEvent: oe.lastEvent,
    gathering: oe.isGathering(),
    hasStickyTex: sc.textures.exists("fx-retro-sticky"),
    events: window.__HERMES_AREA__?.events,
  };
});

await page.waitForFunction(
  () => (window.__HERMES_AREA__?.events?.sprintRetroGathered ?? 0) >= 1,
  null,
  { timeout: 25000 },
);

await page.waitForTimeout(250);

await page
  .screenshot({ path: `${shotDir}/sprintretro-mid.png`, fullPage: false })
  .catch(() => {});

const mid = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const agents = sc.agents || [];
  const meet = sc.waypoints?.meeting || { x: 17, y: 10 };
  return {
    agentCount: agents.length,
    sprintRetroGathered: oe.sprintRetroGathered,
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    gathering: oe.isGathering(),
    hasStickyTex: sc.textures.exists("fx-retro-sticky"),
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
  const gatheredBefore = oe.sprintRetroGathered;
  const el = document.getElementById("office-toast");
  if (el) el.textContent = "LOCKED";
  oe.fire("sprint_retro");
  return {
    sprintRetroGathered: oe.sprintRetroGathered,
    gatheredBefore,
    toast: document.getElementById("office-toast")?.textContent || "",
  };
});

await page
  .screenshot({ path: `${shotDir}/sprintretro-after.png`, fullPage: false })
  .catch(() => {});

const result = { disabled, forceKind, fired, mid, skip, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (disabled.enabled !== false || disabled.eventCountDelta !== 0) {
  console.error("FAIL: events=0 should keep sprint_retro off", disabled);
  process.exit(1);
}
if (
  fired.lastEvent !== "sprint_retro" &&
  mid.lastEvent !== "sprint_retro"
) {
  console.error("FAIL: lastEvent should be sprint_retro", fired, mid.lastEvent);
  process.exit(1);
}
const toastOk =
  RETRO_TOASTS.some((t) => String(fired.toast).includes(t.replace("!", ""))) ||
  String(fired.toast).includes("회고") ||
  String(fired.toast).includes("레트로") ||
  String(fired.toast).includes("Keep");
if (!toastOk) {
  console.error("FAIL: toast should be sprint_retro phrase", fired.toast);
  process.exit(1);
}
if (!fired.hasStickyTex && !mid.hasStickyTex) {
  console.error("FAIL: fx-retro-sticky texture should exist", fired, mid);
  process.exit(1);
}
if ((mid.sprintRetroGathered ?? 0) < 1 || mid.agentCount < 2) {
  console.error("FAIL: sprint_retro should gather ≥1 idle agent", mid);
  process.exit(1);
}
if ((mid.nearMeeting ?? 0) < 1) {
  console.error("FAIL: agents should gather near meeting", mid);
  process.exit(1);
}
if (!mid.gathering) {
  console.error("FAIL: sprint_retro should mark gathering", mid);
  process.exit(1);
}
if (mid.events?.lastEvent !== "sprint_retro") {
  console.error("FAIL: snapshot lastEvent should be sprint_retro", mid.events);
  process.exit(1);
}
if (
  RETRO_TOASTS.includes(skip.toast) ||
  String(skip.toast).includes("회고") ||
  String(skip.toast).includes("레트로") ||
  String(skip.toast).includes("Keep")
) {
  console.error("FAIL: overlapping gather should skip sprint_retro toast", skip);
  process.exit(1);
}
console.log(
  "PASS: sprint_retro gathered=",
  mid.sprintRetroGathered,
  "nearMeeting=",
  mid.nearMeeting,
  "toast=",
  fired.toast,
);
