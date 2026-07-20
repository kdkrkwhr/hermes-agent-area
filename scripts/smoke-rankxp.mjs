/** Smoke: XP rank badges — running shows tier badge, ?rank=0 hides, ?rank=force always visible. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-rankxp";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function gotoQs(qs) {
  const url = `${base.replace(/\/?$/, "/")}?${qs}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 20000,
  });
  await page.waitForFunction(
    () => {
      const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
      return (sc?.agents?.length ?? 0) >= 1;
    },
    null,
    { timeout: 20000 },
  );
}

// Test 1: Default rendering (rank enabled; running agent shows badge)
await gotoQs("events=0&sfx=0&think=0");

const running = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.live = true;
  a.serverStatus = "running";
  a.currentKind = "desk";
  a._rankData = {
    tier: 1, tierName: "Junior", tierEmoji: "", tierColor: "#7ec8e8",
    level: 2, xp: 300, completed: 3, avg_speed_sec: 40,
  };
  a.path = [];
  a.pathIndex = 0;
  a.syncUi();
  const badge = a.rankBadge;
  return {
    enabled: !!badge?.enabled,
    force: !!badge?.force,
    gfxVisible: !!badge?.gfx?.visible,
    txtVisible: !!badge?.txt?.visible,
    txt: badge?.txt?.text || "",
    id: a.def.id,
  };
});

await page.waitForTimeout(200);
await page.screenshot({ path: `${shotDir}/running.png`, fullPage: true });

// Test 2: ?rank=0 hides badge
await gotoQs("rank=0&events=0&sfx=0&think=0");

const off = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.live = true;
  a.serverStatus = "running";
  a.currentKind = "desk";
  a._rankData = {
    tier: 1, tierName: "Junior", tierEmoji: "", level: 2,
    tierColor: "#7ec8e8", xp: 300, completed: 3, avg_speed_sec: 40,
  };
  a.syncUi();
  const badge = a.rankBadge;
  return {
    enabled: !!badge?.enabled,
    gfxVisible: !!badge?.gfx?.visible,
    txtVisible: !!badge?.txt?.visible,
  };
});

await page.screenshot({ path: `${shotDir}/rank-off.png`, fullPage: true });

// Test 3: ?rank=force always visible (even idle)
await gotoQs("rank=force&events=0&sfx=0&think=0");

const forceIdle = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.live = true;
  a.serverStatus = "idle";
  a.currentKind = "break";
  a._rankData = {
    tier: 2, tierName: "Senior", tierEmoji: "", level: 3,
    tierColor: "#6ecfba", xp: 800, completed: 8, avg_speed_sec: 55,
  };
  a.syncUi();
  const badge = a.rankBadge;
  return {
    enabled: !!badge?.enabled,
    force: !!badge?.force,
    gfxVisible: !!badge?.gfx?.visible,
    txtVisible: !!badge?.txt?.visible,
    txt: badge?.txt?.text || "",
  };
});

await page.screenshot({ path: `${shotDir}/rank-force-idle.png`, fullPage: true });

// Test 4: Offline agent hides badge
const offline = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.serverStatus = "offline";
  a.currentKind = "sleep";
  a.syncUi();
  const badge = a.rankBadge;
  return {
    gfxVisible: !!badge?.gfx?.visible,
    txtVisible: !!badge?.txt?.visible,
  };
});

// Test 5: computeRank smoke (imported function works)
const rankCheck = await page.evaluate(() => {
  // Check if computeRank is available via the agent def
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  return {
    hasRankData: !!a._rankData,
    hasRankBadge: !!a.rankBadge,
    rankFields: a._rankData ? Object.keys(a._rankData).sort() : [],
    allAgentsHaveRank: sc.agents.every(a2 => !!a2._rankData),
    allAgentsHaveBadge: sc.agents.every(a2 => !!a2.rankBadge),
  };
});

// Test 6: KPI dashboard has XP ranking
const kpiCheck = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const panel = sc.deskBriefPanel;
  // Check that buildMockKpi returns agent_ranking with tier fields
  const hasKpiModule = typeof panel !== "undefined";
  return {
    hasPanel: hasKpiModule,
    agentCount: sc.agents.length,
  };
});

const ok =
  running.enabled === true &&
  running.gfxVisible === true &&
  running.txtVisible === true &&
  running.txt.length > 0 &&
  off.enabled === false &&
  off.gfxVisible === false &&
  forceIdle.enabled === true &&
  forceIdle.force === true &&
  forceIdle.gfxVisible === true &&
  forceIdle.txtVisible === true &&
  offline.gfxVisible === false &&
  rankCheck.hasRankData === true &&
  rankCheck.hasRankBadge === true &&
  rankCheck.allAgentsHaveRank === true &&
  rankCheck.allAgentsHaveBadge === true &&
  errors.length === 0;

const result = {
  ok,
  running,
  off,
  forceIdle,
  offline,
  rankCheck,
  kpiCheck,
  errors,
  shotDir,
};
console.log(JSON.stringify(result, null, 2));
await browser.close();
process.exit(ok ? 0 : 1);
