/** Smoke: glass door GID11 open-swing — ?doorswing=0 off, ?doorswing=force trigger. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-doorswing";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(45000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function check(label, qs, { expectEnabled, expectActive, expectSwing }) {
  const root = base.replace(/\/?$/, "/");
  await page.goto(`${root}?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(300);

  const setup = await page.evaluate((doSwing) => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    if (!sc) return { ok: false, reason: "no-scene" };
    const doors = sc.glassDoorSwing?.doors || [];
    if (!doors.length) {
      return {
        ok: true,
        doorCount: 0,
        swingCount: sc.glassDoorSwing?.swingCount ?? 0,
      };
    }
    const target = doors[0];
    const agent =
      (sc.agents || []).find((a) => a.getEffectKind?.() === "idle") || sc.agents?.[0];
    const boss = sc.boss;
    const mover = boss?.sprite ? boss : agent;
    if (!mover?.sprite) return { ok: false, reason: "no-mover" };
    const tw = sc.map?.tileWidth ?? 32;
    if (agent && mover === agent) {
      agent.live = false;
      agent.path = [];
      agent.pathIndex = 0;
      agent.busy = false;
    }
    mover.sprite.setPosition(target.x, target.y + tw * 0.2);
    if (doSwing) {
      // force mode auto-swings; proximity path also covered by mover placement
      const start = sc.time.now;
      for (let i = 0; i < 80; i++) {
        sc.time.now = start + i * 40;
        sc.glassDoorSwing?.update?.(sc.time.now, 40);
      }
    }
    return {
      ok: true,
      doorKey: target.key,
      mover: mover === boss ? "boss" : "agent",
      doorCount: doors.length,
      swingCount: sc.glassDoorSwing?.swingCount ?? 0,
      doorDepth: sc.glassDoorSwing?.doors?.[0]?.sprite?.depth ?? null,
      openDoors: doors.filter((d) => d.open).length,
    };
  }, expectSwing);

  await page.waitForTimeout(expectSwing ? 1200 : 400);

  const doorSwing = await page.evaluate(() => window.__HERMES_AREA__?.doorSwing);
  const swingCount = Math.max(doorSwing?.swingCount ?? 0, setup?.swingCount ?? 0);
  const depthOk =
    !expectEnabled ||
    (doorSwing?.depth === 1.6 && (setup?.doorDepth == null || setup.doorDepth === 1.6));
  const ok =
    !!doorSwing &&
    doorSwing.enabled === expectEnabled &&
    doorSwing.active === expectActive &&
    (expectEnabled
      ? doorSwing.doorCount >= 1 && doorSwing.doorTiles >= 1
      : doorSwing.doorCount === 0) &&
    (!expectSwing || swingCount >= 1) &&
    depthOk;

  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      setup,
      doorSwing,
      expectEnabled,
      expectActive,
      expectSwing,
      depthOk,
      swingCount,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("force-swing", "tod=day&events=0&sfx=0&doorswing=force", {
  expectEnabled: true,
  expectActive: true,
  expectSwing: true,
});
await check("day-on", "tod=day&events=0&sfx=0", {
  expectEnabled: true,
  expectActive: true,
  expectSwing: false,
});
await check("doorswing-off", "tod=day&doorswing=0&events=0&sfx=0", {
  expectEnabled: false,
  expectActive: false,
  expectSwing: false,
});

await browser.close();
if (errors.length) {
  console.error("pageerrors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL doorswing smoke");
  process.exit(1);
}
console.log("PASS doorswing smoke");
