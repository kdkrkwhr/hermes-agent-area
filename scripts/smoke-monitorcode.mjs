/** Smoke: monitor code scroll — running shows, blocked hides, ?codescroll=0 / ?deskfx=0 off. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-monitorcode";

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

const running = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.live = true;
  a.serverStatus = "running";
  a.currentKind = "desk";
  a.serverData = { ...(a.serverData || {}), zone: "desk" };
  a.path = [];
  a.pathIndex = 0;
  a.syncUi();
  sc.monitorCode?.sync(16);
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  const snap = window.__HERMES_AREA__?.monitorCode;
  return {
    enabled: snap?.enabled,
    count: snap?.count ?? 0,
    activeIds: snap?.activeIds ?? [],
    kinds: snap?.kinds ?? {},
    agentId: a.def.id,
    depth: snap?.depth,
    glowKind: window.__HERMES_AREA__?.deskGlow?.[a.def.id] ?? null,
  };
});

await page.waitForTimeout(500);
await page.screenshot({ path: `${shotDir}/running.png`, fullPage: true });

const blocked = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.serverStatus = "blocked";
  a.currentKind = "desk";
  a.serverData = { ...(a.serverData || {}), zone: "desk" };
  a.syncUi();
  sc.monitorCode?.sync(16);
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  const snap = window.__HERMES_AREA__?.monitorCode;
  return {
    count: snap?.count ?? 0,
    glowKind: window.__HERMES_AREA__?.deskGlow?.[a.def.id] ?? null,
    glowVisible: !!a.deskGlowGfx?.visible,
  };
});

await page.screenshot({ path: `${shotDir}/blocked-no-scroll.png`, fullPage: true });

const chatting = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.serverStatus = "chatting";
  a.currentKind = "desk";
  a.serverData = { ...(a.serverData || {}), zone: "desk" };
  a.syncUi();
  sc.monitorCode?.sync(16);
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  const snap = window.__HERMES_AREA__?.monitorCode;
  return {
    count: snap?.count ?? 0,
    kind: snap?.kinds?.[a.def.id] ?? null,
  };
});

await page.screenshot({ path: `${shotDir}/chatting.png`, fullPage: true });

await gotoQs("codescroll=0&events=0&sfx=0");

const offCode = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.live = true;
  a.serverStatus = "running";
  a.currentKind = "desk";
  a.serverData = { ...(a.serverData || {}), zone: "desk" };
  a.syncUi();
  sc.monitorCode?.sync(16);
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  const snap = window.__HERMES_AREA__?.monitorCode;
  return {
    enabled: snap?.enabled,
    count: snap?.count ?? 0,
  };
});

await page.screenshot({ path: `${shotDir}/codescroll-off.png`, fullPage: true });

await gotoQs("deskfx=0&events=0&sfx=0");

const offDesk = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.live = true;
  a.serverStatus = "running";
  a.currentKind = "desk";
  a.serverData = { ...(a.serverData || {}), zone: "desk" };
  a.syncUi();
  sc.monitorCode?.sync(16);
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  const snap = window.__HERMES_AREA__?.monitorCode;
  return {
    enabled: snap?.enabled,
    count: snap?.count ?? 0,
    glowVisible: !!a.deskGlowGfx?.visible,
  };
});

await page.screenshot({ path: `${shotDir}/deskfx-off.png`, fullPage: true });

const ok =
  running.enabled === true &&
  running.count === 1 &&
  running.activeIds.includes(running.agentId) &&
  running.kinds[running.agentId] === "running" &&
  running.depth === 12 &&
  blocked.count === 0 &&
  blocked.glowKind === "blocked" &&
  blocked.glowVisible === true &&
  chatting.count === 1 &&
  chatting.kind === "chatting" &&
  offCode.enabled === false &&
  offCode.count === 0 &&
  offDesk.enabled === false &&
  offDesk.count === 0 &&
  errors.length === 0;

const result = {
  ok,
  running,
  blocked,
  chatting,
  offCode,
  offDesk,
  errors,
  shotDir,
};
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (!ok) {
  console.error("FAIL smoke-monitorcode");
  process.exit(1);
}
console.log("PASS smoke-monitorcode");
