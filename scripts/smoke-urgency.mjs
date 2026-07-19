/** Smoke: runtime urgency bar (progress≥0.8 rose pulse + sweat) — ?urgency=force / ?urgency=0. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-urgency";

mkdirSync(shotDir, { recursive: true });

const URGENCY_BAR = 0xf06090;
const NORMAL_BAR = 0x5be0c8;
const OVERTIME_AMBER = 0xffb060;
const DESK_GLOW_TEAL = 0x5ee0c8;

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
  await page.waitForTimeout(350);

  const setup = await page.evaluate((cfg) => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    if (!sc) return { ok: false, reason: "no-scene" };
    if (sc._clockOutPending) sc.cancelClockOut?.();
    document.querySelector('.clockout-modal [data-role="no"]')?.click();

    const agents = sc.agents || [];
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      a.live = false;
      a.serverStatus = i === 0 ? "running" : i === 1 ? "idle" : "blocked";
      a.path = [];
      a.pathIndex = 0;
      a.currentKind = i === 0 ? "desk" : "break";
      a._urgencySweatCount = 0;
      a._urgencyNextSweatAt = 0;
      if (i === 0) {
        a.serverData = {
          ...(a.serverData || {}),
          task_progress: cfg.progress,
          task_elapsed_s: 900,
          task_title: "urgency smoke",
        };
      } else {
        a.serverData = {
          ...(a.serverData || {}),
          task_progress: null,
          task_elapsed_s: null,
        };
      }
      a.syncUi?.();
      if (i === 0 && a.sprite) {
        const desks = sc.waypoints?.desks || [];
        const d = desks[a.def?.homeDesk ?? 0] || desks[0];
        const tw = sc.map?.tileWidth ?? 32;
        if (d) a.sprite.setPosition(d.x * tw + tw / 2, d.y * tw + tw / 2);
      }
    }
    sc.cameras?.main?.centerOn?.(agents[0]?.sprite?.x ?? 400, agents[0]?.sprite?.y ?? 300);

    // advance a few frames so pulse + sweat CD can fire under force
    for (let i = 0; i < 30; i++) {
      agents[0]?.drawProgressBar?.();
      if (cfg.forceSweat) {
        agents[0]._urgencyNextSweatAt = 0;
        agents[0]?.drawProgressBar?.();
      }
    }
    sc.publishDebug?.(undefined, sc.lastSnapshot);

    const urg = window.__HERMES_AREA__?.urgency;
    const row = urg?.agents?.find((r) => r.id === agents[0]?.def?.id) ?? urg?.agents?.[0];
    return {
      ok: true,
      urgency: urg,
      row,
      statuses: agents.map((a) => a.serverStatus),
      sweatCount: agents[0]?._urgencySweatCount ?? 0,
    };
  }, {
    progress: expect.progress,
    forceSweat: !!expect.expectSweat,
  });

  await page.waitForTimeout(200);
  const urg = setup?.urgency;
  const row = setup?.row;

  const colorDistinct =
    urg?.barColor === URGENCY_BAR &&
    urg?.normalColor === NORMAL_BAR &&
    urg?.overtimeAmber === OVERTIME_AMBER &&
    urg?.deskGlowTeal === DESK_GLOW_TEAL &&
    urg.barColor !== urg.overtimeAmber &&
    urg.barColor !== urg.deskGlowTeal;

  const urgentOk = expect.expectUrgent
    ? row?.urgent === true && row?.color === URGENCY_BAR && (urg?.urgentCount ?? 0) >= 1
    : row?.urgent !== true && (urg?.urgentCount ?? 0) === 0;

  const progressOk =
    expect.expectProgress == null ||
    (typeof row?.progress === "number" &&
      Math.abs(row.progress - expect.expectProgress) < 0.001);

  const sweatOk =
    !expect.expectSweat || (setup?.sweatCount ?? 0) >= 1;

  const modeOk =
    urg?.enabled === expect.enabled &&
    (expect.forced == null || urg?.forced === expect.forced);

  const ok =
    !!urg &&
    setup?.ok !== false &&
    modeOk &&
    colorDistinct &&
    urgentOk &&
    progressOk &&
    sweatOk;

  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      urg,
      row,
      sweatCount: setup?.sweatCount,
      expect,
      colorDistinct,
      urgentOk,
      progressOk,
      sweatOk,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("force-on", "urgency=force&events=0&sfx=0&chatter=0", {
  enabled: true,
  forced: true,
  progress: null,
  expectUrgent: true,
  expectProgress: 0.9,
  expectSweat: true,
});
await check("high-progress", "events=0&sfx=0&chatter=0", {
  enabled: true,
  forced: false,
  progress: 0.85,
  expectUrgent: true,
  expectProgress: 0.85,
  expectSweat: false,
});
await check("low-progress", "events=0&sfx=0&chatter=0", {
  enabled: true,
  forced: false,
  progress: 0.42,
  expectUrgent: false,
  expectProgress: 0.42,
  expectSweat: false,
});
await check("indeterminate", "events=0&sfx=0&chatter=0", {
  enabled: true,
  forced: false,
  progress: null,
  expectUrgent: false,
  expectProgress: null,
  expectSweat: false,
});
await check("urgency-off", "urgency=0&events=0&sfx=0&chatter=0", {
  enabled: false,
  forced: false,
  progress: 0.92,
  expectUrgent: false,
  expectProgress: 0.92,
  expectSweat: false,
});

await browser.close();
if (errors.length) {
  console.error("pageerrors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL urgency smoke");
  process.exit(1);
}
console.log("PASS urgency smoke");
