/** Smoke: hotfix_scramble — toast + soft red/amber pulse + Open Desk 2–4 gather; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&chatter=0&sfx=0&tod=day`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-hotfixscramble";
mkdirSync(shotDir, { recursive: true });

const HOTFIX_TOASTS = ["핫픽스!", "긴급 배포", "스크램블"];

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
  oe.fire("hotfix_scramble");
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
  oe.hotfixScrambleGathered = 0;

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

  oe.fire("hotfix_scramble");
  return {
    toast: document.getElementById("office-toast")?.textContent || "",
    lastEvent: oe.lastEvent,
    gathering: oe.isGathering(),
    events: window.__HERMES_AREA__?.events,
  };
});

await page.waitForFunction(
  () => (window.__HERMES_AREA__?.events?.hotfixScrambleGathered ?? 0) >= 1,
  null,
  { timeout: 25000 },
);

await page.waitForTimeout(250);

await page
  .screenshot({ path: `${shotDir}/hotfix-mid.png`, fullPage: false })
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
    hotfixScrambleGathered: oe.hotfixScrambleGathered,
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    gathering: oe.isGathering(),
    events: window.__HERMES_AREA__?.events,
    nearDesk: agents.filter((a) => {
      const t = a.tilePos();
      return desks.some(
        (d) => Math.abs(t.x - d.x) <= 12 && Math.abs(t.y - d.y) <= 12,
      );
    }).length,
  };
});

const skip = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.markGathering(5000);
  const gatheredBefore = oe.hotfixScrambleGathered;
  const el = document.getElementById("office-toast");
  if (el) el.textContent = "LOCKED";
  oe.fire("hotfix_scramble");
  return {
    hotfixScrambleGathered: oe.hotfixScrambleGathered,
    gatheredBefore,
    toast: document.getElementById("office-toast")?.textContent || "",
  };
});

const forceKind = await page.evaluate(() => {
  const raw = "hotfix_scramble";
  const oe = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene")?.officeEvents;
  const kinds = oe
    ? Object.getOwnPropertyNames(Object.getPrototypeOf(oe))
    : [];
  return {
    includes: typeof oe?.runHotfixScramble === "function",
    inKinds: true,
    raw,
    lastEvent: oe?.lastEvent,
    hasMethod: kinds.includes("runHotfixScramble") || typeof oe?.runHotfixScramble === "function",
  };
});

await page
  .screenshot({ path: `${shotDir}/hotfix-after.png`, fullPage: false })
  .catch(() => {});

const result = { disabled, fired, mid, skip, forceKind, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (disabled.enabled !== false || disabled.eventCountDelta !== 0) {
  console.error("FAIL: events=0 should keep hotfix_scramble off", disabled);
  process.exit(1);
}
if (
  fired.lastEvent !== "hotfix_scramble" &&
  mid.lastEvent !== "hotfix_scramble"
) {
  console.error("FAIL: lastEvent should be hotfix_scramble", fired, mid.lastEvent);
  process.exit(1);
}
const toastOk =
  HOTFIX_TOASTS.some((t) => String(fired.toast).includes(t.replace("!", ""))) ||
  /핫픽스|긴급|스크램블/i.test(String(fired.toast));
if (!toastOk) {
  console.error("FAIL: toast should be hotfix phrase", fired.toast);
  process.exit(1);
}
if ((mid.hotfixScrambleGathered ?? 0) < 1 || mid.agentCount < 2) {
  console.error("FAIL: hotfix_scramble should gather >=1 idle agent", mid);
  process.exit(1);
}
if ((mid.hotfixScrambleGathered ?? 0) > 4) {
  console.error("FAIL: hotfix_scramble should gather at most 4", mid);
  process.exit(1);
}
if ((mid.nearDesk ?? 0) < 1) {
  console.error("FAIL: agents should gather near open desk", mid);
  process.exit(1);
}
if (!mid.gathering) {
  console.error("FAIL: hotfix_scramble should mark gathering", mid);
  process.exit(1);
}
if (mid.events?.lastEvent !== "hotfix_scramble") {
  console.error("FAIL: snapshot lastEvent should be hotfix_scramble", mid.events);
  process.exit(1);
}
if ((mid.events?.hotfixScrambleGathered ?? 0) < 1) {
  console.error("FAIL: snapshot should expose hotfixScrambleGathered", mid.events);
  process.exit(1);
}
if (
  HOTFIX_TOASTS.includes(skip.toast) ||
  /핫픽스|긴급|스크램블/i.test(String(skip.toast))
) {
  console.error("FAIL: overlapping gather should skip hotfix toast", skip);
  process.exit(1);
}
if (!forceKind.includes) {
  console.error("FAIL: runHotfixScramble missing", forceKind);
  process.exit(1);
}
console.log(
  "PASS: hotfix_scramble gathered=",
  mid.hotfixScrambleGathered,
  "nearDesk=",
  mid.nearDesk,
  "toast=",
  fired.toast,
);