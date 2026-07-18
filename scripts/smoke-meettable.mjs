/** Smoke: War Room meeting table leaf GID8 paper bob — ?meettable=0 off, ?meettable=force trigger. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-meettable";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(45000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function check(label, qs, { expectEnabled, expectActive, expectBob }) {
  const root = base.replace(/\/?$/, "/");
  await page.goto(`${root}?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(500);

  const setup = await page.evaluate((doBob) => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    if (!sc) return { ok: false, reason: "no-scene" };
    const tables = sc.meetingTableIdle?.tables || [];
    if (!tables.length) {
      return {
        ok: true,
        tableCount: 0,
        tileCount: sc.meetingTableIdle?.tiles?.length ?? 0,
        bobCount: sc.meetingTableIdle?.bobCount ?? 0,
      };
    }
    const target = tables[0];
    const boss = sc.boss;
    const agent =
      (sc.agents || []).find((a) => a.getEffectKind?.() === "idle") || sc.agents?.[0];
    const mover = boss?.sprite ? boss : agent;
    if (!mover?.sprite) return { ok: false, reason: "no-mover" };
    const tw = sc.map?.tileWidth ?? 32;
    if (agent && mover === agent) {
      agent.live = false;
      agent.serverStatus = null;
      agent.serverData = null;
      agent.currentKind = "break";
      agent.path = [];
      agent.pathIndex = 0;
      agent.busy = false;
    }
    mover.sprite.setPosition(target.x, target.y + tw * 0.35);
    if (doBob) {
      for (let i = 0; i < 40; i++) {
        sc.meetingTableIdle?.update?.(sc.time.now + i * 16, 16);
      }
    }
    return {
      ok: true,
      tableKey: target.key,
      mover: mover === boss ? "boss" : "agent",
      tableCount: tables.length,
      tileCount: sc.meetingTableIdle?.tiles?.length ?? 0,
      bobCount: sc.meetingTableIdle?.bobCount ?? 0,
      paperDepth: target.paper?.depth ?? null,
      docDepth: target.doc?.depth ?? null,
    };
  }, expectBob);

  await page.waitForTimeout(expectBob ? 900 : 400);

  // HMR / mid-nav can kill the evaluate context — re-wait ready then read snapshot.
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 15000,
  });
  const meetingTable = await page.evaluate(() => window.__HERMES_AREA__?.meetingTable);
  const bobCount = Math.max(meetingTable?.bobCount ?? 0, setup?.bobCount ?? 0);
  const ok =
    !!meetingTable &&
    meetingTable.enabled === expectEnabled &&
    meetingTable.active === expectActive &&
    (expectEnabled
      ? meetingTable.tileCount >= 2 && meetingTable.tableCount >= 2
      : meetingTable.tileCount === 0 || meetingTable.tableCount === 0) &&
    (!expectBob || bobCount >= 1);

  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullScreen: false, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      setup,
      meetingTable,
      expectEnabled,
      expectActive,
      expectBob,
      bobCount,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("force-bob", "tod=day&events=0&sfx=0&meettable=force", {
  expectEnabled: true,
  expectActive: true,
  expectBob: true,
});
await check("day-on", "tod=day&events=0&sfx=0", {
  expectEnabled: true,
  expectActive: true,
  expectBob: false,
});
await check("meettable-off", "tod=day&meettable=0&events=0&sfx=0", {
  expectEnabled: false,
  expectActive: false,
  expectBob: false,
});

await browser.close();
if (errors.length) {
  console.error("pageerrors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL meettable smoke");
  process.exit(1);
}
console.log("PASS meettable smoke");
