/** Smoke: evening/night running overtime amber desk — ?overtime=force / ?overtime=0. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-overtime";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(45000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function check(label, qs, expect) {
  const root = base.replace(/\/?$/, "/");
  await page.goto(`${root}?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(400);

  const setup = await page.evaluate((wantBubble) => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    if (!sc) return { ok: false, reason: "no-scene" };
    if (sc._clockOutPending) sc.cancelClockOut?.();
    document.querySelector('.clockout-modal [data-role="no"]')?.click();

    const agents = sc.agents || [];
    // paint one running + one idle + one blocked (boost only on running)
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      // stay mock-live=false so WS snapshot won't stomp status mid-assert
      a.live = false;
      a.serverStatus = i === 0 ? "running" : i === 1 ? "idle" : "blocked";
      a.path = [];
      a.pathIndex = 0;
      a.currentKind = i === 0 ? "desk" : i === 1 ? "break" : "meeting";
      a.syncUi?.();
      if (i === 0 && a.sprite) {
        const desks = sc.waypoints?.desks || [];
        const d = desks[a.def?.homeDesk ?? 0] || desks[0];
        const tw = sc.map?.tileWidth ?? 32;
        if (d) a.sprite.setPosition(d.x * tw + tw / 2, d.y * tw + tw / 2);
      }
    }
    sc.cameras?.main?.centerOn?.(agents[0]?.sprite?.x ?? 400, agents[0]?.sprite?.y ?? 300);

    sc.overtimeDesk?.sync?.();
    for (let i = 0; i < 40; i++) {
      sc.overtimeDesk?.update?.(sc.time.now + i * 40);
    }
    if (wantBubble) {
      sc.overtimeDesk.nextBubbleAt = 0;
      sc.overtimeDesk?.fireNow?.();
    }
    // final update so desks[] / active stick in snapshot
    sc.overtimeDesk?.update?.(sc.time.now);
    sc.overtimeDesk?.publish?.();
    sc.publishDebug?.(undefined, sc.lastSnapshot);

    const ot = window.__HERMES_AREA__?.overtime;
    return {
      ok: true,
      overtime: ot,
      boostCount: ot?.boostCount ?? 0,
      bubbleCount: ot?.bubbleCount ?? 0,
      lastLine: ot?.lastLine ?? null,
      todOk: ot?.todOk ?? false,
      forced: ot?.forced ?? false,
      active: ot?.active ?? false,
      depth: ot?.depth ?? null,
      deskGlowDepth: 11,
      agentCount: agents.length,
      statuses: agents.map((a) => a.serverStatus),
    };
  }, !!expect.expectBubble);

  await page.waitForTimeout(250);

  const lighting = await page.evaluate(() => window.__HERMES_AREA__?.lighting);
  const overtime = setup?.overtime;

  const qsOff = /(?:^|&)overtime=0(?:&|$)/.test(qs);
  const qsForce = /(?:^|&)overtime=force(?:&|$)/.test(qs);

  const depthOk =
    !expect.expectBoost ||
    (overtime?.depth === 10.7 && overtime.depth < 11);
  const colorOk =
    !expect.expectBoost ||
    (typeof overtime?.color === "number" && overtime.color === 0xffb060);

  const boostOk = expect.expectBoost
    ? (overtime?.boostCount ?? 0) === 1 && overtime?.active === true
    : (overtime?.boostCount ?? 0) === 0 && overtime?.active === false;

  const bubbleOk =
    !expect.expectBubble ||
    ((overtime?.bubbleCount ?? 0) >= 1 &&
      typeof overtime?.lastLine === "string" &&
      overtime.lastLine.length > 0);

  const ok =
    !!overtime &&
    overtime.enabled === expect.enabled &&
    (expect.todOk == null || overtime.todOk === expect.todOk) &&
    (qsOff ? overtime.enabled === false : true) &&
    (qsForce ? overtime.forced === true : true) &&
    boostOk &&
    bubbleOk &&
    depthOk &&
    colorOk &&
    setup?.ok !== false;

  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      lighting,
      overtime,
      setup,
      expect,
      depthOk,
      colorOk,
      boostOk,
      bubbleOk,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("force-night", "overtime=force&tod=night&events=0&sfx=0&chatter=0", {
  enabled: true,
  todOk: true,
  expectBoost: true,
  expectBubble: true,
});
await check("night-on", "tod=night&events=0&sfx=0&chatter=0", {
  enabled: true,
  todOk: true,
  expectBoost: true,
  expectBubble: false,
});
await check("evening-on", "tod=evening&events=0&sfx=0&chatter=0", {
  enabled: true,
  todOk: true,
  expectBoost: true,
  expectBubble: false,
});
await check("day-off", "tod=day&events=0&sfx=0&chatter=0", {
  enabled: true,
  todOk: false,
  expectBoost: false,
  expectBubble: false,
});
await check("morning-off", "tod=morning&events=0&sfx=0&chatter=0", {
  enabled: true,
  todOk: false,
  expectBoost: false,
  expectBubble: false,
});
await check("overtime-off", "tod=night&overtime=0&events=0&sfx=0&chatter=0", {
  enabled: false,
  todOk: false,
  expectBoost: false,
  expectBubble: false,
});

await browser.close();
if (errors.length) {
  console.error("pageerrors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL overtime smoke");
  process.exit(1);
}
console.log("PASS overtime smoke");
