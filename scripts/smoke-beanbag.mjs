/** Smoke: beanbag GID24 squash bounce — ?beanbag=0 off, ?beanbag=force trigger. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-beanbag";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(45000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function check(label, qs, { expectEnabled, expectActive, expectBounce }) {
  const root = base.replace(/\/?$/, "/");
  await page.goto(`${root}?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(300);

  const setup = await page.evaluate((doBounce) => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    if (!sc) return { ok: false, reason: "no-scene" };
    const beans = sc.beanbagBounce?.beans || [];
    if (!beans.length) return { ok: false, reason: "no-beanbags" };
    const target = beans[0];
    const agent =
      (sc.agents || []).find((a) => a.getEffectKind?.() === "idle") || sc.agents?.[0];
    if (!agent?.sprite) return { ok: false, reason: "no-agent" };
    const tw = sc.map?.tileWidth ?? 32;
    agent.live = false;
    agent.serverStatus = null;
    agent.serverData = null;
    agent.currentKind = "break";
    agent.path = [{ x: target.tx, y: target.ty }];
    agent.pathIndex = 0;
    agent.busy = false;
    agent.sprite.setPosition(target.x, target.y + tw * 0.35);
    if (doBounce) {
      for (let i = 0; i < 40; i++) {
        sc.beanbagBounce?.update?.(sc.time.now + i * 16, 16);
      }
    }
    return {
      ok: true,
      beanKey: target.key,
      agentId: agent.def?.id,
      beanCount: beans.length,
      bounceCount: sc.beanbagBounce?.bounceCount ?? 0,
    };
  }, expectBounce);

  await page.waitForTimeout(expectBounce ? 900 : 400);

  const beanbag = await page.evaluate(() => window.__HERMES_AREA__?.beanbag);
  const bounceCount = Math.max(beanbag?.bounceCount ?? 0, setup?.bounceCount ?? 0);
  const ok =
    !!beanbag &&
    beanbag.enabled === expectEnabled &&
    beanbag.active === expectActive &&
    (expectEnabled ? beanbag.beanbagCount >= 1 && beanbag.beanbagTiles >= 1 : beanbag.beanbagCount === 0) &&
    (!expectBounce || bounceCount >= 1);

  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      setup,
      beanbag,
      expectEnabled,
      expectActive,
      expectBounce,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("force-bounce", "tod=day&events=0&sfx=0&beanbag=force", {
  expectEnabled: true,
  expectActive: true,
  expectBounce: true,
});
await check("day-on", "tod=day&events=0&sfx=0", {
  expectEnabled: true,
  expectActive: true,
  expectBounce: false,
});
await check("beanbag-off", "tod=day&beanbag=0&events=0&sfx=0", {
  expectEnabled: false,
  expectActive: false,
  expectBounce: false,
});

await browser.close();
if (errors.length) {
  console.error("pageerrors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL beanbag smoke");
  process.exit(1);
}
console.log("PASS beanbag smoke");
