/** Smoke: lobby visitor walk-by — spawn, pathfind, ?visitor=0 off. */
import { chromium } from "playwright";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?visitor=1&events=0`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-visitor";

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
    return !!(sc?.visitorDirector && sc?.pathfinder && sc?.map);
  },
  null,
  { timeout: 15000 },
);

const armed = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const vd = sc.visitorDirector;
  if (vd._schedule) {
    vd._schedule.remove(false);
    vd._schedule = null;
  }
  // clear any auto-spawn from fast mode
  if (vd.visitor?.alive) vd.visitor.finish();
  vd.visitor = null;

  const ok = vd.spawnNow();
  const v = vd.visitor;
  return {
    ok,
    snap: vd.snapshot(),
    area: window.__HERMES_AREA__?.visitor,
    hasSprite: !!v?.sprite,
    tinted: v?.sprite?.tintTopLeft !== 0xffffff,
    interactive: !!v?.sprite?.input,
    toast:
      document.querySelector("#visitor-toast-host .visitor-toast")?.textContent || "",
  };
});

// let pathfinding + a few frames run
await page.waitForTimeout(1800);
const walking = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const vd = sc.visitorDirector;
  const v = vd.visitor;
  return {
    snap: vd.snapshot(),
    phase: v?.phase ?? null,
    pathLen: v?.path?.length ?? 0,
    tile: v?.alive ? v.tilePos() : null,
    busy: !!v?.busy,
  };
});

// Verify spawn() returns Promise, despawn() cleans up per spec
const spawnPromise = await page.evaluate(async () => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const vd = sc.visitorDirector;
  // clear existing state
  if (vd.visitor?.alive) vd.visitor.finish();
  vd.visitor = null;
  vd.enabled = true;

  // spawn() should return a Promise
  const result = vd.spawn();
  const isPromise = result instanceof Promise;
  const vAfterSpawn = vd.visitor;
  const hasDespawn = typeof vAfterSpawn?.despawn === "function";
  const hasFinish = typeof vAfterSpawn?.finish === "function";

  // force-finish to trigger promise resolution
  vAfterSpawn?.finish();
  const resolved = await result;

  return { isPromise, hasDespawn, hasFinish, resolved };
});


await page
  .screenshot({ path: `${shotDir}/visitor.png`, fullPage: false })
  .catch(() => {});

// ?visitor=0
await page.goto(`${base.replace(/\/?$/, "/")}?visitor=0&events=0`, {
  waitUntil: "networkidle",
  timeout: 30000,
});
await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
  timeout: 15000,
});
await page.waitForFunction(
  () => window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene")?.visitorDirector,
  null,
  { timeout: 15000 },
);
const off = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const vd = sc.visitorDirector;
  const n = vd.spawnNow();
  return { snap: vd.snapshot(), spawned: n };
});

console.log(JSON.stringify({ armed, walking, spawnPromise, off, errors }, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (!armed.ok || !armed.hasSprite || !armed.snap.active) {
  console.error("FAIL: spawnNow should create active visitor", armed);
  process.exit(1);
}
if (armed.interactive) {
  console.error("FAIL: visitor must not be interactive", armed);
  process.exit(1);
}
if (!String(armed.toast).includes("손님")) {
  console.error("FAIL: toast should mention 손님", armed.toast);
  process.exit(1);
}
if (!walking.snap.active && walking.phase !== "done") {
  console.error("FAIL: visitor should still be active after 1.8s", walking);
  process.exit(1);
}
if (!spawnPromise.isPromise) {
  console.error("FAIL: spawn() must return a Promise", spawnPromise);
  process.exit(1);
}
if (!spawnPromise.hasDespawn) {
  console.error("FAIL: visitor must have despawn() method", spawnPromise);
  process.exit(1);
}
if (!spawnPromise.hasFinish) {
  console.error("FAIL: visitor must have finish() method", spawnPromise);
  process.exit(1);
}
if (!spawnPromise.resolved) {
  console.error("FAIL: spawn() promise should resolve true on despawn", spawnPromise);
  process.exit(1);
}
if (off.spawned || off.snap.enabled || off.snap.active) {
  console.error("FAIL: ?visitor=0 must disable", off);
  process.exit(1);
}
console.log("PASS: visitor walk-by active=", walking.snap.phase);
