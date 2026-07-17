/** Smoke: round table GID23 mug/paper bob — ?roundtable=0 off, ?roundtable=force trigger. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-roundtable";

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
  await page.waitForTimeout(300);

  const setup = await page.evaluate((doBob) => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    if (!sc) return { ok: false, reason: "no-scene" };
    const tables = sc.roundTableIdle?.tables || [];
    if (!tables.length) {
      return {
        ok: true,
        tableCount: 0,
        bobCount: sc.roundTableIdle?.bobCount ?? 0,
        sofaDepth: sc.sofaCushion?.sofas?.[0]?.sprite?.depth ?? null,
        beanbagDepth: sc.beanbagBounce?.beans?.[0]?.sprite?.depth ?? null,
        chairDepth: sc.chairSwivel?.chairs?.[0]?.sprite?.depth ?? null,
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
        sc.roundTableIdle?.update?.(sc.time.now + i * 16, 16);
      }
    }
    const mugDepth = target.mug?.depth ?? null;
    const paperDepth = target.paper?.depth ?? null;
    return {
      ok: true,
      tableKey: target.key,
      mover: mover === boss ? "boss" : "agent",
      agentId: agent?.def?.id ?? null,
      tableCount: tables.length,
      bobCount: sc.roundTableIdle?.bobCount ?? 0,
      mugDepth,
      paperDepth,
      sofaDepth: sc.sofaCushion?.sofas?.[0]?.sprite?.depth ?? null,
      beanbagDepth: sc.beanbagBounce?.beans?.[0]?.sprite?.depth ?? null,
      chairDepth: sc.chairSwivel?.chairs?.[0]?.sprite?.depth ?? null,
    };
  }, expectBob);

  await page.waitForTimeout(expectBob ? 900 : 400);

  const roundTable = await page.evaluate(() => window.__HERMES_AREA__?.roundTable);
  const bobCount = Math.max(roundTable?.bobCount ?? 0, setup?.bobCount ?? 0);
  const depthOk =
    !expectEnabled ||
    (roundTable?.depth === 6 &&
      setup?.mugDepth === 6 &&
      setup?.paperDepth === 6 &&
      setup?.sofaDepth !== 6 &&
      setup?.beanbagDepth !== 6 &&
      setup?.chairDepth !== 6);
  const ok =
    !!roundTable &&
    roundTable.enabled === expectEnabled &&
    roundTable.active === expectActive &&
    (expectEnabled
      ? roundTable.tableCount >= 1 && roundTable.tableTiles >= 1
      : roundTable.tableCount === 0) &&
    (!expectBob || bobCount >= 1) &&
    depthOk;

  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullScreen: false, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      setup,
      roundTable,
      expectEnabled,
      expectActive,
      expectBob,
      depthOk,
      bobCount,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("force-bob", "tod=day&events=0&sfx=0&roundtable=force", {
  expectEnabled: true,
  expectActive: true,
  expectBob: true,
});
await check("day-on", "tod=day&events=0&sfx=0", {
  expectEnabled: true,
  expectActive: true,
  expectBob: false,
});
await check("roundtable-off", "tod=day&roundtable=0&events=0&sfx=0", {
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
  console.error("FAIL roundtable smoke");
  process.exit(1);
}
console.log("PASS roundtable smoke");
