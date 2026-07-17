/** Smoke: chair GID7 idle swivel — ?chair=0 off, ?chair=force trigger. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-chair";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(45000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function check(label, qs, { expectEnabled, expectActive, expectSwivel }) {
  const root = base.replace(/\/?$/, "/");
  await page.goto(`${root}?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(300);

  const setup = await page.evaluate((doSwivel) => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    if (!sc) return { ok: false, reason: "no-scene" };
    const chairs = sc.chairSwivel?.chairs || [];
    if (!chairs.length) {
      return {
        ok: true,
        chairCount: 0,
        swivelCount: sc.chairSwivel?.swivelCount ?? 0,
        sofaDepth: sc.sofaCushion?.constructor ? 2 : null,
      };
    }
    const target = chairs[0];
    const agent =
      (sc.agents || []).find((a) => a.getEffectKind?.() === "idle") || sc.agents?.[0];
    if (!agent?.sprite) return { ok: false, reason: "no-agent" };
    const tw = sc.map?.tileWidth ?? 32;
    agent.live = false;
    agent.serverStatus = null;
    agent.serverData = null;
    agent.currentKind = "break";
    agent.path = [];
    agent.pathIndex = 0;
    agent.busy = false;
    agent.sprite.setPosition(target.x, target.y + tw * 0.35);
    if (doSwivel) {
      for (let i = 0; i < 40; i++) {
        sc.chairSwivel?.update?.(sc.time.now + i * 16, 16);
      }
    }
    return {
      ok: true,
      chairKey: target.key,
      agentId: agent.def?.id,
      chairCount: chairs.length,
      swivelCount: sc.chairSwivel?.swivelCount ?? 0,
      chairDepth: sc.chairSwivel?.chairs?.[0]?.sprite?.depth ?? null,
      sofaDepth: 2,
      beanbagDepth: 2,
    };
  }, expectSwivel);

  await page.waitForTimeout(expectSwivel ? 1100 : 400);

  const chair = await page.evaluate(() => window.__HERMES_AREA__?.chair);
  const swivelCount = Math.max(chair?.swivelCount ?? 0, setup?.swivelCount ?? 0);
  const depthOk =
    !expectEnabled ||
    (chair?.depth === 1 &&
      chair.depth !== 2 &&
      setup?.chairDepth === 1);
  const ok =
    !!chair &&
    chair.enabled === expectEnabled &&
    chair.active === expectActive &&
    (expectEnabled ? chair.chairCount >= 1 && chair.chairTiles >= 1 : chair.chairCount === 0) &&
    (!expectSwivel || swivelCount >= 1) &&
    depthOk;

  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      setup,
      chair,
      expectEnabled,
      expectActive,
      expectSwivel,
      depthOk,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("force-swivel", "tod=day&events=0&sfx=0&chair=force", {
  expectEnabled: true,
  expectActive: true,
  expectSwivel: true,
});
await check("day-on", "tod=day&events=0&sfx=0", {
  expectEnabled: true,
  expectActive: true,
  expectSwivel: false,
});
await check("chair-off", "tod=day&chair=0&events=0&sfx=0", {
  expectEnabled: false,
  expectActive: false,
  expectSwivel: false,
});

await browser.close();
if (errors.length) {
  console.error("pageerrors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL chair smoke");
  process.exit(1);
}
console.log("PASS chair smoke");
