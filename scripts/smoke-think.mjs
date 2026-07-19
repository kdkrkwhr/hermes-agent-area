/** Smoke: chatting thinking dots — chatting shows, status hide, ?think=0 off, ?think=force idle. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-think";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function gotoQs(qs) {
  const url = `${base.replace(/\/?$/, "/")}?${qs}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 20000,
  });
  await page.waitForFunction(
    () => {
      const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
      return (sc?.agents?.length ?? 0) >= 1;
    },
    null,
    { timeout: 20000 },
  );
}

await gotoQs("events=0&sfx=0");

const chatting = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.live = true;
  a.serverStatus = "chatting";
  a.currentKind = "desk";
  a.serverData = { ...(a.serverData || {}), zone: "desk" };
  a.path = [];
  a.pathIndex = 0;
  a.scene.time.now = 0;
  a.syncUi();
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  const d = a.thinkingDots;
  const snap = window.__HERMES_AREA__?.thinkingDots;
  return {
    enabled: !!d?.enabled,
    force: !!d?.force,
    visible: !!d?.label?.visible,
    text: d?.label?.text || "",
    snapCount: snap?.count ?? 0,
    oy: snap?.oy,
    depth: snap?.depth,
  };
});

await page.waitForTimeout(200);
await page.screenshot({ path: `${shotDir}/chatting.png`, fullPage: true });

const cycle = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.serverStatus = "chatting";
  a.currentKind = "desk";
  const seen = new Set();
  for (let i = 0; i < 8; i++) {
    a.thinkingDots._forceTimeMs = i * 500;
    a.syncUi();
    if (a.thinkingDots?.label?.visible) seen.add(a.thinkingDots.label.text);
  }
  delete a.thinkingDots._forceTimeMs;
  a.syncUi();
  return { frames: [...seen].sort((x, y) => x.length - y.length) };
});

const idleHide = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.serverStatus = "idle";
  a.currentKind = "break";
  a.syncUi();
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  return {
    visible: !!a.thinkingDots?.label?.visible,
    snapCount: window.__HERMES_AREA__?.thinkingDots?.count ?? 0,
  };
});

await page.screenshot({ path: `${shotDir}/idle-hide.png`, fullPage: true });

const runningHide = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.serverStatus = "running";
  a.currentKind = "desk";
  a.syncUi();
  return { visible: !!a.thinkingDots?.label?.visible };
});

await gotoQs("think=0&events=0&sfx=0");

const off = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.live = true;
  a.serverStatus = "chatting";
  a.currentKind = "desk";
  a.syncUi();
  return {
    enabled: !!a.thinkingDots?.enabled,
    visible: !!a.thinkingDots?.label?.visible,
  };
});

await page.screenshot({ path: `${shotDir}/think-off.png`, fullPage: true });

await gotoQs("think=force&events=0&sfx=0");

const forceIdle = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.live = true;
  a.serverStatus = "idle";
  a.currentKind = "break";
  a.scene.time.now = 1000;
  a.syncUi();
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  const d = a.thinkingDots;
  return {
    enabled: !!d?.enabled,
    force: !!d?.force,
    visible: !!d?.label?.visible,
    text: d?.label?.text || "",
    snapCount: window.__HERMES_AREA__?.thinkingDots?.count ?? 0,
  };
});

await page.screenshot({ path: `${shotDir}/think-force-idle.png`, fullPage: true });

const ok =
  chatting.visible === true &&
  chatting.enabled === true &&
  chatting.text.length >= 1 &&
  cycle.frames.length >= 2 &&
  idleHide.visible === false &&
  runningHide.visible === false &&
  off.visible === false &&
  off.enabled === false &&
  forceIdle.visible === true &&
  forceIdle.force === true &&
  errors.length === 0;

const result = {
  ok,
  chatting,
  cycle,
  idleHide,
  runningHide,
  off,
  forceIdle,
  errors,
  shotDir,
};
console.log(JSON.stringify(result, null, 2));
await browser.close();
process.exit(ok ? 0 : 1);