/** Smoke: entrance gate — LED counter, turnstile pulse, ?gate=0 off. */
import { chromium } from "playwright";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?visitor=1&events=0&gate=1`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-gate";

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
    return !!(sc?.entranceGate && sc?.visitorDirector);
  },
  null,
  { timeout: 15000 },
);

const before = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const vd = sc.visitorDirector;
  if (vd.visitor?.alive) vd.visitor.finish();
  vd.visitor = null;
  return {
    gate: sc.entranceGate.snapshot(),
    area: window.__HERMES_AREA__?.gate,
  };
});

const spawned = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const vd = sc.visitorDirector;
  const ok = vd.spawnNow();
  return {
    ok,
    gate: sc.entranceGate.snapshot(),
    visitor: vd.snapshot(),
    area: window.__HERMES_AREA__?.gate,
  };
});

await page.waitForTimeout(600);

const afterEnter = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  return {
    gate: sc.entranceGate.snapshot(),
    visitor: sc.visitorDirector.snapshot(),
  };
});

// force despawn → exit pulse + counter retained
await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  sc.visitorDirector.visitor?.finish();
});

await page.waitForTimeout(400);

const afterExit = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  return {
    gate: sc.entranceGate.snapshot(),
    visitor: sc.visitorDirector.snapshot(),
  };
});

await page
  .screenshot({ path: `${shotDir}/gate-active.png`, fullPage: false })
  .catch(() => {});

// ?gate=0
await page.goto(`${base.replace(/\/?$/, "/")}?visitor=1&events=0&gate=0`, {
  waitUntil: "networkidle",
  timeout: 30000,
});
await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
  timeout: 15000,
});
const off = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  return {
    gate: sc.entranceGate?.snapshot?.() ?? null,
    enabled: sc.entranceGate?.enabled,
    turnstile: !!sc.entranceGate?.turnstile,
  };
});

console.log(
  JSON.stringify({ before, spawned, afterEnter, afterExit, off, errors }, null, 2),
);
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (!before.gate?.enabled) {
  console.error("FAIL: gate should be enabled with ?gate=1", before);
  process.exit(1);
}
if (!spawned.ok || spawned.gate.visitCount < 1) {
  console.error("FAIL: spawn should bump visit counter", spawned);
  process.exit(1);
}
if (afterEnter.gate.lastEvent !== "enter") {
  console.error("FAIL: lastEvent should be enter", afterEnter);
  process.exit(1);
}
if (afterExit.gate.lastEvent !== "exit") {
  console.error("FAIL: lastEvent should be exit after despawn", afterExit);
  process.exit(1);
}
if (afterExit.gate.visitCount < 1) {
  console.error("FAIL: visit count should persist after exit", afterExit);
  process.exit(1);
}
if (off.enabled !== false || off.turnstile) {
  console.error("FAIL: ?gate=0 must disable visuals", off);
  process.exit(1);
}
console.log("PASS: entrance gate counter=", afterExit.gate.visitCount);
