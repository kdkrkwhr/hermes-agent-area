/** Smoke: agent bump-sorry bubble — force fire, off query, gather skip. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-bump";

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
      return (sc?.agents?.length ?? 0) >= 2;
    },
    null,
    { timeout: 20000 },
  );
}

await gotoQs("bump=force&highfive=0&events=0&sfx=0");

const fired = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  if (oe) oe._gatherUntil = 0;

  const a = sc.agents[0];
  const b = sc.agents[1];
  const ts = a.tileSize || 32;
  const tx = 18;
  const ty = 14;
  a.sprite.setPosition(tx * ts + ts / 2, ty * ts + ts / 2);
  b.sprite.setPosition(tx * ts + ts / 2 + ts * 0.25, ty * ts + ts / 2);
  // long paths so Agent.update won't clear before sample
  a.path = [
    { x: tx + 1, y: ty },
    { x: tx + 2, y: ty },
    { x: tx + 3, y: ty },
  ];
  b.path = [
    { x: tx - 1, y: ty },
    { x: tx - 2, y: ty },
    { x: tx - 3, y: ty },
  ];
  a.pathIndex = 0;
  b.pathIndex = 0;
  a.live = false;
  b.live = false;
  a.serverStatus = "idle";
  b.serverStatus = "idle";
  a.currentKind = "break";
  b.currentKind = "break";
  for (const ag of [a, b]) {
    ag._bumpBackup = null;
    ag._chatterBackup = null;
    ag._bossGreetBackup = null;
    ag._expandTimer = null;
  }
  a.setStatus("대기");
  b.setStatus("대기");

  const hf = sc.agentHighFive;
  if (hf) {
    hf._pulsing?.clear?.();
    hf.lastAt = null;
    hf.lastPair = null;
  }

  const bump = sc.agentBumpSorry;
  bump._pairReadyAt.clear();
  bump._active.clear();
  bump.fireCount = 0;
  bump.lastLine = null;
  bump.lastPair = null;

  const ta = a.tilePos();
  const tb = b.tilePos();
  const dist = Math.hypot(ta.x - tb.x, ta.y - tb.y);

  bump.fireNow();
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  const snap = window.__HERMES_AREA__?.bump;
  const withBackup = (sc.agents || []).filter((x) => x._bumpBackup != null);
  return {
    fireCount: bump.fireCount,
    lastLine: bump.lastLine,
    lastPair: bump.lastPair,
    activeCount: snap?.activeCount ?? bump._active.size,
    bubbleTexts: withBackup.map((x) => x.statusText),
    snapEnabled: snap?.enabled,
    snapForced: snap?.forced,
    distTiles: snap?.distTiles,
    dist,
    pathLens: [a.path?.length, b.path?.length],
    enabled: bump.enabled,
    forced: bump.forced,
    ids: [a.def.id, b.def.id],
  };
});

await page.waitForTimeout(200);
await page.screenshot({ path: `${shotDir}/force-on.png`, fullPage: true });

const sleepSkip = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const bump = sc.agentBumpSorry;
  for (const t of bump._restores || []) {
    try {
      t.remove(false);
    } catch {
      /* ignore */
    }
  }
  bump._restores = [];
  bump._active.clear();
  for (const a of sc.agents || []) {
    if (a._bumpBackup != null) {
      a.setStatus(a._bumpBackup);
      a._bumpBackup = null;
    }
  }

  const a = sc.agents[0];
  const b = sc.agents[1];
  a.serverStatus = "offline";
  a.currentKind = "sleep";
  a.path = [{ x: 20, y: 14 }];
  b.path = [{ x: 16, y: 14 }];
  bump._pairReadyAt.clear();
  const before = bump.fireCount;
  bump.fireNow();
  return {
    before,
    after: bump.fireCount,
    skipped: bump.fireCount === before,
  };
});

await page.screenshot({ path: `${shotDir}/sleep-skip.png`, fullPage: true });

const gatherSkip = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const bump = sc.agentBumpSorry;
  const a = sc.agents[0];
  const b = sc.agents[1];
  a.serverStatus = "idle";
  a.currentKind = "break";
  a.path = [{ x: 20, y: 14 }];
  b.path = [{ x: 16, y: 14 }];
  oe._gatherUntil = sc.time.now + 60000;
  bump._pairReadyAt.clear();
  const before = bump.fireCount;
  bump.fireNow();
  oe._gatherUntil = 0;
  return { before, after: bump.fireCount, skipped: bump.fireCount === before };
});

await gotoQs("bump=0&highfive=0&events=0&sfx=0");

const off = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const bump = sc.agentBumpSorry;
  return {
    enabled: !!bump?.enabled,
    snap: window.__HERMES_AREA__?.bump?.enabled,
  };
});

await page.screenshot({ path: `${shotDir}/bump-off.png`, fullPage: true });

await browser.close();

const ok =
  fired.enabled &&
  fired.forced &&
  fired.fireCount >= 1 &&
  LINES_OK(fired.lastLine) &&
  fired.bubbleTexts.length >= 1 &&
  sleepSkip.skipped &&
  gatherSkip.skipped &&
  off.enabled === false &&
  errors.length === 0;

function LINES_OK(line) {
  return line === "엇" || line === "미안" || line === "Oops";
}

console.log(
  JSON.stringify(
    { fired, sleepSkip, gatherSkip, off, errors, ok },
    null,
    2,
  ),
);

if (!ok) {
  console.error("FAIL bump smoke");
  process.exit(1);
}
console.log("PASS bump smoke");
