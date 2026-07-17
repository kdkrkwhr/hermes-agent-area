/** Smoke: exec chair GID32 idle swivel — ?execchair=0 off, ?execchair=force trigger. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-execchair";

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
    const chairs = sc.execChairSwivel?.chairs || [];
    if (!chairs.length) {
      return {
        ok: true,
        chairCount: 0,
        swivelCount: sc.execChairSwivel?.swivelCount ?? 0,
        openDeskChairCount: sc.chairSwivel?.chairs?.length ?? 0,
      };
    }
    const target = chairs[0];
    // Prefer Boss (spec: idle/break · Boss proximity); fall back to idle agent
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
    if (doSwivel) {
      for (let i = 0; i < 40; i++) {
        sc.execChairSwivel?.update?.(sc.time.now + i * 16, 16);
      }
    }
    return {
      ok: true,
      chairKey: target.key,
      mover: mover === boss ? "boss" : "agent",
      agentId: agent?.def?.id ?? null,
      chairCount: chairs.length,
      swivelCount: sc.execChairSwivel?.swivelCount ?? 0,
      chairDepth: sc.execChairSwivel?.chairs?.[0]?.sprite?.depth ?? null,
      openDeskChairCount: sc.chairSwivel?.chairs?.length ?? 0,
      openDeskSwivelCount: sc.chairSwivel?.swivelCount ?? 0,
      expectedTile: "30,6",
    };
  }, expectSwivel);

  await page.waitForTimeout(expectSwivel ? 1100 : 400);

  const execChair = await page.evaluate(() => window.__HERMES_AREA__?.execChair);
  const openDesk = await page.evaluate(() => window.__HERMES_AREA__?.chair);
  const swivelCount = Math.max(execChair?.swivelCount ?? 0, setup?.swivelCount ?? 0);
  const depthOk =
    !expectEnabled ||
    (execChair?.depth === 1 && setup?.chairDepth === 1);
  const isolated =
    !expectSwivel ||
    (setup?.openDeskSwivelCount === 0 || setup?.openDeskSwivelCount == null);
  const tileOk =
    !expectEnabled ||
    !setup?.chairKey ||
    setup.chairKey === "30,6";
  const ok =
    !!execChair &&
    execChair.enabled === expectEnabled &&
    execChair.active === expectActive &&
    (expectEnabled ? execChair.chairCount >= 1 && execChair.chairTiles >= 1 : execChair.chairCount === 0) &&
    (!expectSwivel || swivelCount >= 1) &&
    depthOk &&
    isolated &&
    tileOk;

  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      setup,
      execChair,
      openDeskChairCount: openDesk?.chairCount ?? null,
      expectEnabled,
      expectActive,
      expectSwivel,
      depthOk,
      isolated,
      tileOk,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("force-swivel", "tod=day&events=0&sfx=0&execchair=force", {
  expectEnabled: true,
  expectActive: true,
  expectSwivel: true,
});
await check("day-on", "tod=day&events=0&sfx=0", {
  expectEnabled: true,
  expectActive: true,
  expectSwivel: false,
});
await check("execchair-off", "tod=day&execchair=0&events=0&sfx=0", {
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
  console.error("FAIL execchair smoke");
  process.exit(1);
}
console.log("PASS execchair smoke");
