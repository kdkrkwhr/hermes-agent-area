/** Smoke: rug GID18 walk sheen — ?rug=0 off, ?rug=force trigger. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-rug";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(45000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function check(label, qs, { expectEnabled, expectActive, expectFlash }) {
  const root = base.replace(/\/?$/, "/");
  await page.goto(`${root}?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(300);

  const setup = await page.evaluate((doFlash) => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    if (!sc) return { ok: false, reason: "no-scene" };
    const rugs = sc.rugSheen?.rugs || [];
    if (!rugs.length) {
      return {
        ok: true,
        rugCount: 0,
        flashCount: sc.rugSheen?.flashCount ?? 0,
      };
    }
    const target = rugs[0];
    const agent =
      (sc.agents || []).find((a) => a.getEffectKind?.() === "idle") || sc.agents?.[0];
    if (!agent?.sprite) return { ok: false, reason: "no-agent" };
    agent.live = false;
    agent.serverStatus = null;
    agent.serverData = null;
    agent.currentKind = "break";
    agent.path = [{ x: target.tx, y: target.ty }];
    agent.pathIndex = 0;
    agent.busy = false;
    agent.sprite.setPosition(target.x, target.y);
    if (doFlash) {
      for (let i = 0; i < 50; i++) {
        sc.rugSheen?.update?.(sc.time.now + i * 16, 16);
      }
    }
    return {
      ok: true,
      rugKey: target.key,
      agentId: agent.def?.id,
      rugCount: rugs.length,
      flashCount: sc.rugSheen?.flashCount ?? 0,
    };
  }, expectFlash);

  await page.waitForTimeout(expectFlash ? 900 : 400);

  const rug = await page.evaluate(() => window.__HERMES_AREA__?.rug);
  const flashCount = Math.max(rug?.flashCount ?? 0, setup?.flashCount ?? 0);
  const ok =
    !!rug &&
    rug.enabled === expectEnabled &&
    rug.active === expectActive &&
    (expectEnabled ? rug.rugCount >= 1 && rug.rugTiles >= 1 : rug.rugCount === 0) &&
    (!expectFlash || flashCount >= 1);

  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      setup,
      rug,
      expectEnabled,
      expectActive,
      expectFlash,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("force-sheen", "tod=day&events=0&sfx=0&rug=force", {
  expectEnabled: true,
  expectActive: true,
  expectFlash: true,
});
await check("day-on", "tod=day&events=0&sfx=0", {
  expectEnabled: true,
  expectActive: true,
  expectFlash: false,
});
await check("walk-sheen", "tod=day&events=0&sfx=0", {
  expectEnabled: true,
  expectActive: true,
  expectFlash: true,
});
await check("rug-off", "tod=day&rug=0&events=0&sfx=0", {
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
  console.error("FAIL rug smoke");
  process.exit(1);
}
console.log("PASS rug smoke");
