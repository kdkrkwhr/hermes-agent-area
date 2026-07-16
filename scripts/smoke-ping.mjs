/** Smoke: chatting arrival ring (?pingfx=1 force / =0 off / status edge). */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.env.SMOKE_URL || "http://127.0.0.1:5173/hermes-agent-area";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-ping";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function waitReady() {
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 15000,
  });
  await page.waitForFunction(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    return Array.isArray(sc?.agents) && sc.agents.length > 0;
  }, null, { timeout: 15000 });
}

// 1) force: ?pingfx=1 → at least one burst
await page.goto(`${base}/?pingfx=1&events=0&sfx=0&celebrate=0`, {
  waitUntil: "networkidle",
  timeout: 30000,
});
await waitReady();
await page.waitForTimeout(900);
const force = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  sc?.publishDebug?.(sc.ws?.url ?? "smoke", sc.lastSnapshot);
  return window.__HERMES_AREA__?.chatPing;
});
await page.screenshot({ path: `${shotDir}/force.png`, fullPage: true });
const forceOk =
  force?.enabled === true &&
  force?.mode === "force" &&
  (force?.burstCount ?? 0) >= 1;

// 2) off: ?pingfx=0 → no edge / force
await page.goto(`${base}/?pingfx=0&events=0&sfx=0`, {
  waitUntil: "networkidle",
  timeout: 30000,
});
await waitReady();
await page.waitForTimeout(400);
const off = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  // try toggling chatting — should NOT fire when disabled
  const a = sc?.agents?.[0];
  if (a) {
    a.serverStatus = "idle";
    sc._agentStatuses?.set(a.def.id, "idle");
    sc.syncAgentEmitter?.(a);
    a.serverStatus = "chatting";
    sc.syncAgentEmitter?.(a);
  }
  sc?.publishDebug?.(sc.ws?.url ?? "smoke", sc.lastSnapshot);
  return window.__HERMES_AREA__?.chatPing;
});
await page.screenshot({ path: `${shotDir}/off.png`, fullPage: true });
const offOk = off?.enabled === false && off?.mode === "off" && (off?.burstCount ?? 0) === 0;

// 3) edge: idle→chatting fires once; stay chatting no re-fire; chatting→idle no ping
await page.goto(`${base}/?events=0&sfx=0&celebrate=0`, {
  waitUntil: "networkidle",
  timeout: 30000,
});
await waitReady();
await page.waitForTimeout(300);
const edge = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc?.agents?.[0];
  if (!a || !sc) return { ok: false, reason: "no-agent" };

  a.serverStatus = "idle";
  sc._agentStatuses?.set(a.def.id, "idle");
  sc._chatPingBurstCount = 0;
  sc.syncAgentEmitter?.(a);

  a.serverStatus = "chatting";
  sc.syncAgentEmitter?.(a);
  const afterEnter = sc._chatPingBurstCount;

  // stay chatting — no second burst
  sc.syncAgentEmitter?.(a);
  sc.syncAgentEmitter?.(a);
  const afterStay = sc._chatPingBurstCount;

  // chatting → idle — celebrate path, not ping
  a.serverStatus = "idle";
  sc.syncAgentEmitter?.(a);
  const afterLeave = sc._chatPingBurstCount;

  // running → chatting should also fire
  a.serverStatus = "running";
  sc._agentStatuses?.set(a.def.id, "running");
  sc.syncAgentEmitter?.(a);
  a.serverStatus = "chatting";
  sc.syncAgentEmitter?.(a);
  const afterRunning = sc._chatPingBurstCount;

  sc.publishDebug?.(sc.ws?.url ?? "smoke", sc.lastSnapshot);
  return {
    afterEnter,
    afterStay,
    afterLeave,
    afterRunning,
    chatPing: window.__HERMES_AREA__?.chatPing,
  };
});
await page.screenshot({ path: `${shotDir}/edge.png`, fullPage: true });
const edgeOk =
  edge.afterEnter === 1 &&
  edge.afterStay === 1 &&
  edge.afterLeave === 1 &&
  edge.afterRunning === 2;

const fatal = errors.filter((e) => !/Framebuffer|WebGL|CORS|Failed to fetch/i.test(e));
const ok = forceOk && offOk && edgeOk && fatal.length === 0;

const result = { ok, forceOk, offOk, edgeOk, force, off, edge, errors: fatal };
console.log(JSON.stringify(result, null, 2));
await browser.close();
if (!ok) {
  console.error("FAIL chatPing smoke");
  process.exit(1);
}
console.log("PASS chatPing smoke");
