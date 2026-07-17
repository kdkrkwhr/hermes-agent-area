/** Smoke: sleepRug GID28 soft sheen — ?sleeprug=0 off, ?sleeprug=force trigger. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-sleeprug";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(45000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function check(label, qs, { expectEnabled, expectActive, expectFlash, expectTodAlpha }) {
  const root = base.replace(/\/?$/, "/");
  await page.goto(`${root}?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(300);

  const setup = await page.evaluate((doFlash) => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    if (!sc) return { ok: false, reason: "no-scene" };
    const rugs = sc.sleepRugSheen?.rugs || [];
    const rug18 = sc.rugSheen?.rugs || [];
    if (!rugs.length) {
      return {
        ok: true,
        rugCount: 0,
        flashCount: sc.sleepRugSheen?.flashCount ?? 0,
        rug18Count: rug18.length,
      };
    }
    const target = rugs[0];
    const agent =
      (sc.agents || []).find((a) => a.getEffectKind?.() === "idle") || sc.agents?.[0];
    if (!agent?.sprite) return { ok: false, reason: "no-agent" };
    agent.live = false;
    agent.serverStatus = null;
    agent.serverData = null;
    agent.currentKind = "sleep";
    agent.path = [{ x: target.tx, y: target.ty }];
    agent.pathIndex = 0;
    agent.busy = false;
    agent.sprite.setPosition(target.x, target.y);
    if (doFlash) {
      for (let i = 0; i < 50; i++) {
        sc.sleepRugSheen?.update?.(sc.time.now + i * 16, 16);
      }
    }
    return {
      ok: true,
      rugKey: target.key,
      agentId: agent.def?.id,
      rugCount: rugs.length,
      rug18Count: rug18.length,
      flashCount: sc.sleepRugSheen?.flashCount ?? 0,
      // GID18 must stay independent
      rug18Gid: sc.rugSheen?.snapshot?.()?.rugGid ?? null,
      sleepGid: sc.sleepRugSheen?.snapshot?.()?.sleepRugGid ?? null,
    };
  }, expectFlash);

  await page.waitForTimeout(expectFlash ? 900 : 400);

  const sleeprug = await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    return (
      window.__HERMES_AREA__?.sleeprug ??
      sc?.sleepRugSheen?.snapshot?.() ??
      null
    );
  });
  const rug = await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    return window.__HERMES_AREA__?.rug ?? sc?.rugSheen?.snapshot?.() ?? null;
  });
  // ensure publishDebug carries sleeprug for subsequent checks
  await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    sc?.publishDebug?.(sc?.wsUrl);
  });
  const flashCount = Math.max(sleeprug?.flashCount ?? 0, setup?.flashCount ?? 0);
  const todOk =
    expectTodAlpha == null ||
    (typeof sleeprug?.todAlpha === "number" &&
      Math.abs(sleeprug.todAlpha - expectTodAlpha) < 0.05);
  const ok =
    !!sleeprug &&
    sleeprug.enabled === expectEnabled &&
    sleeprug.active === expectActive &&
    (expectEnabled ? sleeprug.rugCount >= 1 && sleeprug.rugTiles >= 1 : sleeprug.rugCount === 0) &&
    (!expectFlash || flashCount >= 1) &&
    todOk &&
    // non-interference: GID18 still present and separate key
    (expectEnabled ? rug?.rugGid === 18 && sleeprug.sleepRugGid === 28 : true);

  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      setup,
      sleeprug,
      rugGid: rug?.rugGid,
      expectEnabled,
      expectActive,
      expectFlash,
      expectTodAlpha,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("force-sheen", "tod=day&events=0&sfx=0&sleeprug=force", {
  expectEnabled: true,
  expectActive: true,
  expectFlash: true,
  expectTodAlpha: 1,
});
await check("day-on", "tod=day&events=0&sfx=0", {
  expectEnabled: true,
  expectActive: true,
  expectFlash: false,
  expectTodAlpha: 1,
});
await check("night-soft", "tod=night&events=0&sfx=0", {
  expectEnabled: true,
  expectActive: true,
  expectFlash: false,
  expectTodAlpha: 0.72,
});
await check("walk-sheen", "tod=day&events=0&sfx=0", {
  expectEnabled: true,
  expectActive: true,
  expectFlash: true,
});
await check("sleeprug-off", "tod=day&sleeprug=0&events=0&sfx=0", {
  expectEnabled: false,
  expectActive: false,
  expectFlash: false,
});

await browser.close();
if (errors.length) {
  console.error("pageerrors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL sleeprug smoke");
  process.exit(1);
}
console.log("PASS sleeprug smoke");
