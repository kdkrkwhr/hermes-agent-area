/** Smoke: desk sticky notes — running title visible, ?sticky=0 off. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-desksticky";

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
  a.serverData = {
    ...(a.serverData || {}),
    zone: "desk",
    task_title: "sticky smoke: Open Desk title",
    bubble: "무시될 bubble",
  };
  a.path = [];
  a.pathIndex = 0;
  a.syncUi();
  sc.deskSticky?.sync();
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  const snap = window.__HERMES_AREA__?.deskSticky;
  return {
    enabled: snap?.enabled,
    count: snap?.count ?? 0,
    title: snap?.notes?.[0]?.title ?? null,
    id: snap?.notes?.[0]?.id ?? null,
    agentId: a.def.id,
  };
});

await page.waitForTimeout(200);
await page.screenshot({ path: `${shotDir}/running.png`, fullPage: true });

const idle = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.serverStatus = "idle";
  a.currentKind = "break";
  a.serverData = { ...(a.serverData || {}), zone: "break", task_title: null };
  a.syncUi();
  sc.deskSticky?.sync();
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  const snap = window.__HERMES_AREA__?.deskSticky;
  return {
    count: snap?.count ?? 0,
    notes: snap?.notes ?? [],
  };
});

await page.screenshot({ path: `${shotDir}/idle-hidden.png`, fullPage: true });

await gotoQs("sticky=0&events=0&sfx=0");

const off = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.live = true;
  a.serverStatus = "running";
  a.currentKind = "desk";
  a.serverData = {
    ...(a.serverData || {}),
    zone: "desk",
    task_title: "should be off",
  };
  a.syncUi();
  sc.deskSticky?.sync();
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  const snap = window.__HERMES_AREA__?.deskSticky;
  return {
    enabled: snap?.enabled,
    count: snap?.count ?? 0,
  };
});

await page.screenshot({ path: `${shotDir}/sticky-off.png`, fullPage: true });

const ok =
  running.enabled === true &&
  running.count === 1 &&
  running.title === "sticky smoke: Open Desk title" &&
  running.id === running.agentId &&
  idle.count === 0 &&
  off.enabled === false &&
  off.count === 0 &&
  errors.length === 0;

const result = { ok, running, idle, off, errors, shotDir };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (!ok) {
  console.error("FAIL smoke-desksticky");
  process.exit(1);
}
console.log("PASS smoke-desksticky");
