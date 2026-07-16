/** Smoke: CEO office achievement shelf — mock done items visible, ?trophy=0 off. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-trophy";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function gotoQs(qs) {
  const url = `${base.replace(/\/?$/, "/")}?${qs}`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 15000,
  });
  await page.waitForFunction(
    () => {
      const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
      return (sc?.agents?.length ?? 0) >= 1;
    },
    null,
    { timeout: 15000 },
  );
}

await gotoQs("events=0&sfx=0");

const on = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  sc.trophyShelf?.refreshFromScene?.();
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  const snap = window.__HERMES_AREA__?.trophyShelf;
  const panel = window.__HERMES_AREA__?.kanbanPanel;
  const brief = window.__HERMES_AREA__?.deskBrief;
  return {
    enabled: snap?.enabled,
    visible: snap?.visible,
    source: snap?.source,
    itemCount: snap?.items?.length ?? 0,
    items: snap?.items ?? [],
    x: snap?.x,
    y: snap?.y,
    kanbanAgentCount: panel?.agentCount ?? null,
    deskBriefOpen: !!window.__HERMES_AREA__?.deskBriefOpen,
    deskBriefSource: brief?.source ?? null,
  };
});

await page.waitForTimeout(200);
await page.screenshot({ path: `${shotDir}/trophy-on.png`, fullPage: true });

await gotoQs("trophy=0&events=0&sfx=0");

const off = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  sc.trophyShelf?.refreshFromScene?.();
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  const snap = window.__HERMES_AREA__?.trophyShelf;
  return {
    enabled: snap?.enabled,
    visible: snap?.visible,
    itemCount: snap?.items?.length ?? 0,
  };
});

await page.screenshot({ path: `${shotDir}/trophy-off.png`, fullPage: true });

const checks = {
  enabled: on.enabled === true,
  visible: on.visible === true,
  itemCount: on.itemCount >= 2,
  source: !!on.source,
  x: Number.isFinite(on.x),
  y: Number.isFinite(on.y),
  kanban: on.kanbanAgentCount === 3,
  offEnabled: off.enabled === false,
  offVisible: off.visible === false,
  noErrors: errors.length === 0,
};
const ok = Object.values(checks).every(Boolean);

const result = { ok, checks, on, off, errors, shotDir };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (!ok) {
  console.error("FAIL smoke-trophy");
  process.exit(1);
}
console.log("PASS smoke-trophy");
