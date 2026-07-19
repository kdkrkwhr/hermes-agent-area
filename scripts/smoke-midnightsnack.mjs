/** Smoke: midnight_snack — toast + steam/crumb + fridge/vending idle gather; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&chatter=0&tod=night`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-midnightsnack";
mkdirSync(shotDir, { recursive: true });

const SNACK_TOASTS = ["야식?", "컵라면 각", "냉장고 털자"];

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
  oe.fire("midnight_snack");
  return {
    enabled: oe.enabled,
    eventCountDelta: oe.eventCount - countBefore,
    lastEvent: oe.lastEvent,
  };
});

const forceKind = await page.evaluate(() => {
  const raw = "midnight_snack";
  try {
    const u = new URL(location.href);
    u.searchParams.set("events", raw);
    const mode = (() => {
      const v = u.searchParams.get("events");
      if (v === "0" || v === "off" || v === "false") {
        return { enabled: false, forceKind: null };
      }
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
  oe.midnightSnackGathered = 0;

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

  oe.fire("midnight_snack");
  return {
    toast: document.getElementById("office-toast")?.textContent || "",
    lastEvent: oe.lastEvent,
    gathering: oe.isGathering(),
    tod: sc.lightingPreset?.name || null,
  };
});

await page.waitForFunction(
  () => (window.__HERMES_AREA__?.events?.midnightSnackGathered ?? 0) >= 1,
  null,
  { timeout: 25000 },
);

await page.waitForTimeout(250);

await page
  .screenshot({ path: `${shotDir}/snack-mid.png`, fullPage: false })
  .catch(() => {});

const mid = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const agents = sc.agents || [];
  const br = sc.waypoints?.break || { x: 31, y: 4 };
  return {
    agentCount: agents.length,
    midnightSnackGathered: oe.midnightSnackGathered,
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    gathering: oe.isGathering(),
    events: window.__HERMES_AREA__?.events,
    nearLounge: agents.filter((a) => {
      const t = a.tilePos();
      return Math.abs(t.x - br.x) <= 12 && Math.abs(t.y - br.y) <= 12;
    }).length,
  };
});

const skip = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.markGathering(5000);
  const gatheredBefore = oe.midnightSnackGathered;
  const el = document.getElementById("office-toast");
  if (el) el.textContent = "LOCKED";
  oe.fire("midnight_snack");
  return {
    midnightSnackGathered: oe.midnightSnackGathered,
    gatheredBefore,
    toast: document.getElementById("office-toast")?.textContent || "",
  };
});

await page
  .screenshot({ path: `${shotDir}/snack-after.png`, fullPage: false })
  .catch(() => {});

const result = { disabled, forceKind, fired, mid, skip, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (disabled.enabled !== false || disabled.eventCountDelta !== 0) {
  console.error("FAIL: events=0 should keep midnight_snack off", disabled);
  process.exit(1);
}
if (forceKind.forceKind !== "midnight_snack") {
  console.error("FAIL: ?events=midnight_snack forceKind", forceKind);
  process.exit(1);
}
if (
  fired.lastEvent !== "midnight_snack" &&
  mid.lastEvent !== "midnight_snack"
) {
  console.error(
    "FAIL: lastEvent should be midnight_snack",
    fired,
    mid.lastEvent,
  );
  process.exit(1);
}
if (!SNACK_TOASTS.includes(String(fired.toast))) {
  const toastOk =
    String(fired.toast).includes("야식") ||
    String(fired.toast).includes("컵라면") ||
    String(fired.toast).includes("냉장고");
  if (!toastOk) {
    console.error("FAIL: toast should be midnight_snack phrase", fired.toast);
    process.exit(1);
  }
}
if ((mid.midnightSnackGathered ?? 0) < 1 || mid.agentCount < 2) {
  console.error("FAIL: midnight_snack should gather ≥1 idle agent", mid);
  process.exit(1);
}
if (!mid.gathering) {
  console.error("FAIL: midnight_snack should mark gathering", mid);
  process.exit(1);
}
if (mid.events?.lastEvent !== "midnight_snack") {
  console.error(
    "FAIL: snapshot lastEvent should be midnight_snack",
    mid.events,
  );
  process.exit(1);
}
if (SNACK_TOASTS.includes(skip.toast)) {
  console.error("FAIL: overlapping gather should skip snack toast", skip);
  process.exit(1);
}
console.log(
  "PASS: midnight_snack gathered=",
  mid.midnightSnackGathered,
  "toast=",
  fired.toast,
  "tod=",
  fired.tod,
);
