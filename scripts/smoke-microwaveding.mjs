/** Smoke: microwave_ding — toast + steam at coffee/break; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=microwave_ding&tod=day`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-microwaveding";
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
    return !!(sc?.officeEvents && sc?.map && sc?.furniture);
  },
  null,
  { timeout: 15000 },
);

// wait for forceKind auto-fire (?events=microwave_ding)
await page.waitForFunction(
  () => window.__HERMES_AREA__?.events?.lastEvent === "microwave_ding",
  null,
  { timeout: 8000 },
);

const forced = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const toast = document.getElementById("office-toast")?.textContent || "";
  const steam = (sc.children?.list || []).some(
    (c) => c?.type === "ParticleEmitter" && c?.texture?.key === "fx-steam",
  );
  return {
    lastEvent: oe.lastEvent,
    forceKind: oe.forceKind,
    microwaveDingAt: oe.microwaveDingAt,
    toast,
    steam,
    gathering: oe.isGathering(),
    events: window.__HERMES_AREA__?.events,
  };
});

await page
  .screenshot({ path: `${shotDir}/ding-force.png`, fullPage: false })
  .catch(() => {});

// manual fire after clearing schedule + gather lock
const mid = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.enabled = true;
  if (oe._schedule) {
    oe._schedule.remove(false);
    oe._schedule = null;
  }
  oe._gatherUntil = 0;
  const beforeAt = oe.microwaveDingAt;
  oe.fire("microwave_ding");
  const steam = (sc.children?.list || []).some(
    (c) => c?.type === "ParticleEmitter" && c?.texture?.key === "fx-steam",
  );
  return {
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    microwaveDingAt: oe.microwaveDingAt,
    beforeAt,
    steam,
    gathering: oe.isGathering(),
    events: window.__HERMES_AREA__?.events,
  };
});

await page.waitForTimeout(400);
await page
  .screenshot({ path: `${shotDir}/ding-mid.png`, fullPage: false })
  .catch(() => {});

const skip = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.markGathering(8000);
  const el = document.getElementById("office-toast");
  if (el) el.textContent = "LOCKED";
  const beforeAt = oe.microwaveDingAt;
  oe.fire("microwave_ding");
  return {
    toast: document.getElementById("office-toast")?.textContent || "",
    microwaveDingAt: oe.microwaveDingAt,
    beforeAt,
    gathering: oe.isGathering(),
  };
});

await page
  .screenshot({ path: `${shotDir}/ding-skip.png`, fullPage: false })
  .catch(() => {});

const result = { forced, mid, skip, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (forced.forceKind !== "microwave_ding") {
  console.error("FAIL: forceKind should be microwave_ding", forced);
  process.exit(1);
}
if (forced.lastEvent !== "microwave_ding") {
  console.error("FAIL: force query should fire microwave_ding", forced);
  process.exit(1);
}
if (!(forced.microwaveDingAt > 0)) {
  console.error("FAIL: snapshot microwaveDingAt should be set", forced);
  process.exit(1);
}
if (!String(forced.toast).includes("데워졌다") && !String(mid.toast).includes("데워졌다")) {
  console.error("FAIL: toast should mention 데워졌다", forced.toast, mid.toast);
  process.exit(1);
}
if (mid.lastEvent !== "microwave_ding") {
  console.error("FAIL: lastEvent should be microwave_ding", mid.lastEvent);
  process.exit(1);
}
if (!(mid.microwaveDingAt > mid.beforeAt)) {
  console.error("FAIL: microwaveDingAt should advance on fire", mid);
  process.exit(1);
}
if (mid.gathering) {
  console.error("FAIL: microwave_ding must not mark gathering", mid);
  process.exit(1);
}
if (!mid.steam && !forced.steam) {
  console.error("FAIL: expected fx-steam puff near coffee/break", mid, forced);
  process.exit(1);
}
if (skip.toast === "띵~ 데워졌다") {
  console.error("FAIL: overlapping gather should skip microwave toast", skip);
  process.exit(1);
}
if (skip.microwaveDingAt !== skip.beforeAt) {
  console.error("FAIL: gather skip should not bump microwaveDingAt", skip);
  process.exit(1);
}

console.log(
  "PASS: microwave_ding at=",
  mid.microwaveDingAt,
  "steam=",
  !!(mid.steam || forced.steam),
);
