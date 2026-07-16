/** Smoke: stretch_break — toast + desk bubbles + y-scale; no gather; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=1&tod=day`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-stretch";
mkdirSync(shotDir, { recursive: true });

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

const before = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.enabled = true;
  if (oe._schedule) {
    oe._schedule.remove(false);
    oe._schedule = null;
  }
  oe._gatherUntil = 0;

  const agents = sc.agents || [];
  const positions = [];
  for (const a of agents) {
    a.live = false;
    a.serverStatus = null;
    // mix idle + running (desk)
    a.currentKind = positions.length % 2 === 0 ? "break" : "desk";
    a.path = [];
    a.pathIndex = 0;
    a.busy = false;
    a.idleUntil = sc.time.now + 999999;
    a.sprite.setScale(1, 1);
    positions.push({
      id: a.def?.id,
      x: a.sprite.x,
      y: a.sprite.y,
      kind: a.getEffectKind(),
      status: a.statusText,
    });
  }
  return { positions, agentCount: agents.length };
});

const mid = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const startNow = sc.time.now;
  oe.fire("stretch_break");
  const agents = sc.agents || [];
  return {
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    stretchAffected: oe.stretchAffected,
    gathering: oe.isGathering(),
    startNow,
    bubbles: agents.map((a) => ({
      id: a.def?.id,
      text: a.statusText,
      scaleY: a.sprite.scaleY,
      x: a.sprite.x,
      y: a.sprite.y,
      hasBackup: a._stretchBackup != null,
    })),
  };
});

await page
  .screenshot({ path: `${shotDir}/stretch-mid.png`, fullPage: false })
  .catch(() => {});

// wait for scale pulse to show (yoyo up)
await page.waitForTimeout(300);
const pulsed = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  return (sc.agents || []).some((a) => (a.sprite?.scaleY ?? 1) > 1.01);
});

// wait past max stretch (7s) + buffer
await page.waitForFunction(
  (startNow) => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    return sc && sc.time.now - startNow >= 7500;
  },
  mid.startNow,
  { timeout: 20000 },
);
await page.waitForTimeout(150);

const after = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const agents = sc.agents || [];
  return {
    stretchAffected: oe.stretchAffected,
    gathering: oe.isGathering(),
    agents: agents.map((a) => ({
      id: a.def?.id,
      text: a.statusText,
      scaleY: a.sprite.scaleY,
      x: a.sprite.x,
      y: a.sprite.y,
      hasBackup: a._stretchBackup != null,
    })),
  };
});

await page
  .screenshot({ path: `${shotDir}/stretch-after.png`, fullPage: false })
  .catch(() => {});

// overlap skip: gather lock → stretch should not toast / affect
const skip = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.markGathering(5000);
  const countBefore = oe.eventCount;
  const affectedBefore = oe.stretchAffected;
  const toastBefore =
    document.getElementById("office-toast")?.textContent || "";
  // clear toast so we can detect new one
  const el = document.getElementById("office-toast");
  if (el) el.textContent = "LOCKED";
  oe.fire("stretch_break");
  return {
    eventCountDelta: oe.eventCount - countBefore,
    stretchAffected: oe.stretchAffected,
    affectedBefore,
    toast: document.getElementById("office-toast")?.textContent || "",
    toastBefore,
    gathering: oe.isGathering(),
  };
});

const result = { before, mid, pulsed, after, skip, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (mid.lastEvent !== "stretch_break") {
  console.error("FAIL: lastEvent should be stretch_break", mid.lastEvent);
  process.exit(1);
}
if (!String(mid.toast).includes("스트레칭 타임")) {
  console.error("FAIL: toast should mention 스트레칭 타임", mid.toast);
  process.exit(1);
}
if ((mid.stretchAffected ?? 0) < 1) {
  console.error("FAIL: stretch should affect ≥1 idle/running agent", mid);
  process.exit(1);
}
if (mid.gathering) {
  console.error("FAIL: stretch_break must not mark gathering", mid);
  process.exit(1);
}
const stretchBubbles = (mid.bubbles || []).filter(
  (b) => b.text === "으쌰" || b.text === "기지개",
);
if (stretchBubbles.length < 1) {
  console.error("FAIL: expected 으쌰/기지개 bubbles", mid.bubbles);
  process.exit(1);
}
if (!pulsed) {
  console.error("FAIL: expected scaleY pulse > 1 during stretch");
  process.exit(1);
}
// desks stay put — no gather move
for (let i = 0; i < before.positions.length; i++) {
  const b = before.positions[i];
  const a = after.agents.find((x) => x.id === b.id);
  if (!a) continue;
  if (Math.abs(a.x - b.x) > 2 || Math.abs(a.y - b.y) > 2) {
    console.error("FAIL: agent moved during stretch (gather forbidden)", b, a);
    process.exit(1);
  }
  if (Math.abs((a.scaleY ?? 1) - 1) > 0.02) {
    console.error("FAIL: scaleY should restore to ~1", a);
    process.exit(1);
  }
  if (a.hasBackup) {
    console.error("FAIL: _stretchBackup should clear after duration", a);
    process.exit(1);
  }
}
if (skip.toast === "스트레칭 타임") {
  console.error("FAIL: overlapping gather should skip stretch toast", skip);
  process.exit(1);
}
console.log(
  "PASS: stretch_break affected=",
  after.stretchAffected,
  "bubbles=",
  stretchBubbles.length,
);
