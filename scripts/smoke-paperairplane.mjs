/** Smoke: paper_airplane — toast + flyby sprite; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&chatter=0`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-paperairplane";
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
    return !!(sc?.officeEvents && sc?.map);
  },
  null,
  { timeout: 15000 },
);

const fired = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.enabled = true;
  if (oe._schedule) {
    oe._schedule.remove(false);
    oe._schedule = null;
  }
  oe._gatherUntil = 0;
  oe.paperAirplaneActive = false;

  oe.fire("paper_airplane");

  const plane = sc.children?.list?.find?.(
    (c) => c?.texture?.key === "fx-paper-plane",
  );
  return {
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    paperAirplaneActive: oe.paperAirplaneActive,
    hasPlane: !!plane,
    planeDepth: plane?.depth ?? null,
    events: window.__HERMES_AREA__?.events,
  };
});

await page.waitForTimeout(1200);

await page
  .screenshot({ path: `${shotDir}/plane-mid.png`, fullPage: false })
  .catch(() => {});

const mid = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const plane = sc.children?.list?.find?.(
    (c) => c?.texture?.key === "fx-paper-plane" && c.active,
  );
  return {
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    paperAirplaneActive: oe.paperAirplaneActive,
    hasPlane: !!plane,
    planeX: plane?.x ?? null,
    planeY: plane?.y ?? null,
    events: window.__HERMES_AREA__?.events,
  };
});

// wait until flyby finishes (max 7s + buffer)
await page.waitForFunction(
  () => window.__HERMES_AREA__?.events?.paperAirplaneActive === false,
  null,
  { timeout: 12000 },
);

await page
  .screenshot({ path: `${shotDir}/plane-after.png`, fullPage: false })
  .catch(() => {});

const after = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const plane = sc.children?.list?.find?.(
    (c) => c?.texture?.key === "fx-paper-plane" && c.active,
  );
  return {
    paperAirplaneActive: oe.paperAirplaneActive,
    hasPlane: !!plane,
  };
});

const skip = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.markGathering(5000);
  const el = document.getElementById("office-toast");
  if (el) el.textContent = "LOCKED";
  oe.fire("paper_airplane");
  const plane = sc.children?.list?.find?.(
    (c) => c?.texture?.key === "fx-paper-plane" && c.active,
  );
  return {
    toast: document.getElementById("office-toast")?.textContent || "",
    paperAirplaneActive: oe.paperAirplaneActive,
    hasPlane: !!plane,
  };
});

const result = { fired, mid, after, skip, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (fired.lastEvent !== "paper_airplane") {
  console.error("FAIL: lastEvent should be paper_airplane", fired);
  process.exit(1);
}
if (!String(fired.toast).includes("비행기")) {
  console.error("FAIL: toast should mention 비행기", fired.toast);
  process.exit(1);
}
if (!fired.hasPlane || !fired.paperAirplaneActive) {
  console.error("FAIL: plane sprite should spawn", fired);
  process.exit(1);
}
if (fired.planeDepth != null && fired.planeDepth < 9) {
  console.error("FAIL: plane depth should sit above furniture", fired);
  process.exit(1);
}
if (!mid.hasPlane && mid.paperAirplaneActive) {
  console.error("FAIL: mid-flight should keep plane visible", mid);
  process.exit(1);
}
if (after.paperAirplaneActive || after.hasPlane) {
  console.error("FAIL: plane should destroy after flyby", after);
  process.exit(1);
}
if (skip.toast === "누가 비행기 날림" || skip.hasPlane) {
  console.error("FAIL: overlapping gather should skip flyby", skip);
  process.exit(1);
}
console.log("PASS: paper_airplane toast=", fired.toast);
