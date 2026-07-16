/** Smoke: desk monitor glow — blocked amber, running mint, ?deskfx=0 off. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-deskglow";

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

const blocked = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.live = true;
  a.serverStatus = "blocked";
  a.currentKind = "desk";
  a.path = [];
  a.pathIndex = 0;
  a.setStatus("검토 대기");
  a.syncUi();
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  return {
    kind: window.__HERMES_AREA__?.deskGlow?.[a.def.id] ?? null,
    visible: !!a.deskGlowGfx?.visible,
    deskFxEnabled: window.__HERMES_AREA__?.deskFxEnabled,
    id: a.def.id,
  };
});

await page.waitForTimeout(450);
await page.screenshot({ path: `${shotDir}/blocked.png`, fullPage: true });

const running = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.serverStatus = "running";
  a.serverData = { ...(a.serverData || {}), zone: "desk" };
  a.currentKind = "desk";
  a.syncUi();
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  return {
    kind: window.__HERMES_AREA__?.deskGlow?.[a.def.id] ?? null,
    visible: !!a.deskGlowGfx?.visible,
  };
});

await page.screenshot({ path: `${shotDir}/running.png`, fullPage: true });

await gotoQs("deskfx=0&events=0&sfx=0");

const off = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.live = true;
  a.serverStatus = "blocked";
  a.currentKind = "desk";
  a.syncUi();
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  return {
    kind: window.__HERMES_AREA__?.deskGlow?.[a.def.id] ?? null,
    visible: !!a.deskGlowGfx?.visible,
    deskFxEnabled: window.__HERMES_AREA__?.deskFxEnabled,
  };
});

await page.screenshot({ path: `${shotDir}/deskfx-off.png`, fullPage: true });

const ok =
  blocked.kind === "blocked" &&
  blocked.visible === true &&
  running.kind === "running" &&
  running.visible === true &&
  off.visible === false &&
  off.deskFxEnabled === false &&
  errors.length === 0;

const result = { ok, blocked, running, off, errors, shotDir };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (!ok) {
  console.error("FAIL smoke-deskglow");
  process.exit(1);
}
console.log("PASS smoke-deskglow");
