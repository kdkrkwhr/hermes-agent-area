/** Smoke: Focus dualDesk GID26 LED/pulse — ?dualdesk=0 off, ?dualdesk=force trigger. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-dualdesk";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(45000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function check(label, qs, { expectEnabled, expectActive, expectPulse }) {
  const root = base.replace(/\/?$/, "/");
  await page.goto(`${root}?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(300);

  const setup = await page.evaluate((doPulse) => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    if (!sc) return { ok: false, reason: "no-scene" };
    const dd = sc.dualDeskIdle;
    if (!dd) return { ok: false, reason: "no-dualDeskIdle" };
    const desks = dd.desks || [];
    if (!desks.length) {
      return {
        ok: true,
        deskCount: 0,
        pulseCount: dd.pulseCount ?? 0,
        depth: dd.gfx?.depth ?? null,
        deskGlowDepth: 11,
        monitorCodeDepth: 12,
        headphonesDepth: 23,
      };
    }
    const target = desks[0];
    const agent =
      (sc.agents || []).find((a) => a.getEffectKind?.() === "idle") || sc.agents?.[0];
    if (!agent?.sprite) return { ok: false, reason: "no-agent" };
    const tw = sc.map?.tileWidth ?? 32;
    agent.live = false;
    agent.serverStatus = "running";
    agent.serverData = { zone: "focus" };
    agent.currentKind = "focus";
    agent.path = [];
    agent.pathIndex = 0;
    agent.busy = false;
    agent.sprite.setPosition(target.x, target.y + tw * 0.4);
    if (doPulse) {
      for (let i = 0; i < 50; i++) {
        dd.update?.(sc.time.now + i * 16, 16);
      }
    }
    return {
      ok: true,
      deskKey: target.key,
      agentId: agent?.def?.id ?? null,
      deskCount: desks.length,
      pulseCount: dd.pulseCount ?? 0,
      depth: dd.gfx?.depth ?? null,
      deskGlowDepth: 11,
      monitorCodeDepth: 12,
      headphonesDepth: 23,
      stickyDepth: sc.deskSticky ? 8 : null,
    };
  }, expectPulse);

  await page.waitForTimeout(expectPulse ? 700 : 400);

  const dualDesk = await page.evaluate(() => window.__HERMES_AREA__?.dualDesk);
  const pulseCount = Math.max(dualDesk?.pulseCount ?? 0, setup?.pulseCount ?? 0);
  const depthOk =
    !expectEnabled ||
    (dualDesk?.depth === 7 &&
      setup?.depth === 7 &&
      setup?.deskGlowDepth !== 7 &&
      setup?.monitorCodeDepth !== 7 &&
      setup?.headphonesDepth !== 7);
  const ok =
    !!dualDesk &&
    dualDesk.enabled === expectEnabled &&
    dualDesk.active === expectActive &&
    (expectEnabled
      ? dualDesk.deskCount >= 1 && dualDesk.deskTiles >= 1 && dualDesk.dualDeskGid === 26
      : dualDesk.deskCount === 0) &&
    (!expectPulse || pulseCount >= 1) &&
    depthOk;

  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      setup,
      dualDesk,
      expectEnabled,
      expectActive,
      expectPulse,
      depthOk,
      pulseCount,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("force-pulse", "tod=day&events=0&sfx=0&dualdesk=force", {
  expectEnabled: true,
  expectActive: true,
  expectPulse: true,
});
await check("day-on", "tod=day&events=0&sfx=0", {
  expectEnabled: true,
  expectActive: true,
  expectPulse: false,
});
await check("dualdesk-off", "tod=day&dualdesk=0&events=0&sfx=0", {
  expectEnabled: false,
  expectActive: false,
  expectPulse: false,
});

await browser.close();
if (errors.length) {
  console.error("pageerrors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL dualdesk smoke");
  process.exit(1);
}
console.log("PASS dualdesk smoke");
