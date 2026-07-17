/** Smoke: sofa GID9 cushion squash — ?sofa=0 off, ?sofa=force trigger. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-sofa";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(45000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function check(label, qs, { expectEnabled, expectActive, expectSquash }) {
  const root = base.replace(/\/?$/, "/");
  await page.goto(`${root}?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(300);

  const setup = await page.evaluate((doSquash) => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    if (!sc) return { ok: false, reason: "no-scene" };
    const sofas = sc.sofaCushion?.sofas || [];
    if (!sofas.length && doSquash !== false) {
      /* off case may have zero sofas — handled by expect */
    }
    if (!sofas.length) {
      return {
        ok: true,
        sofaCount: 0,
        squashCount: sc.sofaCushion?.squashCount ?? 0,
      };
    }
    const target = sofas[0];
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
    if (doSquash) {
      for (let i = 0; i < 40; i++) {
        sc.sofaCushion?.update?.(sc.time.now + i * 16, 16);
      }
    }
    return {
      ok: true,
      sofaKey: target.key,
      agentId: agent.def?.id,
      sofaCount: sofas.length,
      squashCount: sc.sofaCushion?.squashCount ?? 0,
    };
  }, expectSquash);

  await page.waitForTimeout(expectSquash ? 900 : 400);

  const sofa = await page.evaluate(() => window.__HERMES_AREA__?.sofa);
  const squashCount = Math.max(sofa?.squashCount ?? 0, setup?.squashCount ?? 0);
  const ok =
    !!sofa &&
    sofa.enabled === expectEnabled &&
    sofa.active === expectActive &&
    (expectEnabled ? sofa.sofaCount >= 1 && sofa.sofaTiles >= 1 : sofa.sofaCount === 0) &&
    (!expectSquash || squashCount >= 1);

  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      setup,
      sofa,
      expectEnabled,
      expectActive,
      expectSquash,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("force-squash", "tod=day&events=0&sfx=0&sofa=force", {
  expectEnabled: true,
  expectActive: true,
  expectSquash: true,
});
await check("day-on", "tod=day&events=0&sfx=0", {
  expectEnabled: true,
  expectActive: true,
  expectSquash: false,
});
await check("sofa-off", "tod=day&sofa=0&events=0&sfx=0", {
  expectEnabled: false,
  expectActive: false,
  expectSquash: false,
});

await browser.close();
if (errors.length) {
  console.error("pageerrors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL sofa smoke");
  process.exit(1);
}
console.log("PASS sofa smoke");
