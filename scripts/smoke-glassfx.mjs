/** Smoke: War Room glass partition GID17 shimmer — ?glassfx=0 off, ?glassfx=force. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-glassfx";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(45000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function check(label, qs, { expectEnabled, expectActive, expectShimmer }) {
  const root = base.replace(/\/?$/, "/");
  await page.goto(`${root}?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(300);

  const setup = await page.evaluate((doShimmer) => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    if (!sc) return { ok: false, reason: "no-scene" };
    const fx = sc.glassPartitionShimmer;
    const panes = fx?.panes || [];
    if (!panes.length) {
      return {
        ok: true,
        paneCount: 0,
        shimmerCount: fx?.shimmerCount ?? 0,
      };
    }
    const target = panes[0];
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
    mover.sprite.setPosition(target.x, target.y + tw * 0.4);
    if (doShimmer) {
      const start = sc.time.now;
      for (let i = 0; i < 100; i++) {
        sc.time.now = start + i * 40;
        sc.glassPartitionShimmer?.update?.(sc.time.now, 40);
      }
    }
    return {
      ok: true,
      paneKey: target.key,
      mover: mover === boss ? "boss" : "agent",
      paneCount: panes.length,
      shimmerCount: fx?.shimmerCount ?? 0,
      depth: fx?.snapshot?.()?.depth ?? null,
    };
  }, expectShimmer);

  await page.waitForTimeout(expectShimmer ? 1400 : 400);

  const glassfx = await page.evaluate(() => window.__HERMES_AREA__?.glassfx);
  const shimmerCount = Math.max(glassfx?.shimmerCount ?? 0, setup?.shimmerCount ?? 0);
  const depthOk = !expectEnabled || glassfx?.depth === 2.2;
  const ok =
    !!glassfx &&
    glassfx.enabled === expectEnabled &&
    glassfx.active === expectActive &&
    (expectEnabled
      ? glassfx.paneCount >= 1 && glassfx.glassTiles >= 1
      : glassfx.paneCount === 0) &&
    (!expectShimmer || shimmerCount >= 1) &&
    depthOk;

  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      setup,
      glassfx,
      expectEnabled,
      expectActive,
      expectShimmer,
      depthOk,
      shimmerCount,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("force-shimmer", "tod=day&events=0&sfx=0&glassfx=force", {
  expectEnabled: true,
  expectActive: true,
  expectShimmer: true,
});
await check("day-on", "tod=day&events=0&sfx=0", {
  expectEnabled: true,
  expectActive: true,
  expectShimmer: false,
});
await check("glassfx-off", "tod=day&glassfx=0&events=0&sfx=0", {
  expectEnabled: false,
  expectActive: false,
  expectShimmer: false,
});

await browser.close();
if (errors.length) {
  console.error("pageerrors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL glassfx smoke");
  process.exit(1);
}
console.log("PASS glassfx smoke");
