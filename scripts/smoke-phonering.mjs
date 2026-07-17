/** Smoke: phone_ring — toast + bubble + green pulse; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=1&tod=day`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-phonering";
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
    return !!(sc?.officeEvents && (sc.agents?.length ?? 0) >= 1);
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
  oe.phoneRingTarget = null;

  const agents = sc.agents || [];
  for (const a of agents) {
    a.live = false;
    a.serverStatus = null;
    a.currentKind = "desk";
    a.path = [];
    a.pathIndex = 0;
    a.busy = false;
    a.idleUntil = sc.time.now + 999999;
  }
  return {
    agentCount: agents.length,
  };
});

const mid = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const startNow = sc.time.now;
  oe.fire("phone_ring");
  const agents = sc.agents || [];
  const bubbles = agents
    .filter(
      (a) =>
        a.statusText === "여보세요?" || a.statusText === "네 듣고 있어요",
    )
    .map((a) => ({
      id: a.def?.id,
      text: a.statusText,
      hasBackup: a._phoneBackup != null,
    }));
  const gfxCount = (sc.children?.list || []).filter(
    (c) => c?.type === "Graphics" && c.blendMode === 1 /* ADD */,
  ).length;
  return {
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    phoneRingTarget: oe.phoneRingTarget,
    gathering: oe.isGathering(),
    startNow,
    bubbles,
    gfxCount,
    events: window.__HERMES_AREA__?.events,
  };
});

await page.waitForTimeout(500);
await page
  .screenshot({ path: `${shotDir}/phone-mid.png`, fullPage: false })
  .catch(() => {});

const pulsed = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  return {
    phoneRingTarget: oe.phoneRingTarget,
    lastEvent: oe.lastEvent,
  };
});

await page.waitForTimeout(5600);

const after = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  return {
    phoneRingTarget: oe.phoneRingTarget,
    gathering: oe.isGathering(),
    agents: (sc.agents || []).map((a) => ({
      id: a.def?.id,
      text: a.statusText,
      hasBackup: a._phoneBackup != null,
    })),
  };
});

await page
  .screenshot({ path: `${shotDir}/phone-after.png`, fullPage: false })
  .catch(() => {});

const skip = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.markGathering(5000);
  const el = document.getElementById("office-toast");
  if (el) el.textContent = "LOCKED";
  oe.phoneRingTarget = null;
  oe.fire("phone_ring");
  return {
    toast: document.getElementById("office-toast")?.textContent || "",
    phoneRingTarget: oe.phoneRingTarget,
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
if (mid.lastEvent !== "phone_ring") {
  console.error("FAIL: lastEvent should be phone_ring", mid.lastEvent);
  process.exit(1);
}
if (!String(mid.toast).includes("전화 왔어요")) {
  console.error("FAIL: toast should mention 전화 왔어요", mid.toast);
  process.exit(1);
}
if (!mid.phoneRingTarget) {
  console.error("FAIL: phoneRingTarget should be set", mid);
  process.exit(1);
}
if (mid.gathering) {
  console.error("FAIL: phone_ring must not mark gathering", mid);
  process.exit(1);
}
if ((mid.bubbles || []).length < 1) {
  console.error("FAIL: expected 여보세요?/네 듣고 있어요 bubble", mid.bubbles);
  process.exit(1);
}
if (!pulsed.phoneRingTarget) {
  console.error("FAIL: phoneRingTarget should hold mid-duration", pulsed);
  process.exit(1);
}
if (after.phoneRingTarget != null) {
  console.error("FAIL: phoneRingTarget should clear after duration", after);
  process.exit(1);
}
if ((after.agents || []).some((a) => a.hasBackup)) {
  console.error("FAIL: _phoneBackup should clear after duration", after);
  process.exit(1);
}
if (skip.toast === "전화 왔어요") {
  console.error("FAIL: overlapping gather should skip phone toast", skip);
  process.exit(1);
}
console.log(
  "PASS: phone_ring target=",
  mid.phoneRingTarget,
  "bubble=",
  mid.bubbles[0]?.text,
);
