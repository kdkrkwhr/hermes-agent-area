/** Smoke: idle lounge ambient chatter — fire, gather-pause, ?chatter=0. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-chatter";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function gotoQs(qs) {
  const url = `${base.replace(/\/?$/, "/")}${qs ? `?${qs}` : ""}`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 20000,
  });
  // ready can flip before OfficeScene.create finishes — wait for chatter
  await page.waitForFunction(
    () => {
      const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
      return (
        !!sc?.idleChatter &&
        (sc.agents?.length ?? 0) >= 2 &&
        window.__HERMES_AREA__?.chatter != null
      );
    },
    null,
    { timeout: 25000 },
  );
}

await gotoQs("chatter=1&events=0&sfx=0");

const fired = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const ic = sc.idleChatter;
  const oe = sc.officeEvents;
  if (oe?._schedule) {
    oe._schedule.remove(false);
    oe._schedule = null;
  }
  oe.enabled = false;

  for (const a of sc.agents || []) {
    a.live = false;
    a.serverStatus = null;
    a.currentKind = "break";
    a.path = [];
    a.pathIndex = 0;
    a.busy = false;
    a.idleUntil = sc.time.now + 999999;
    a._expandTimer = null;
    a._bossGreetBackup = null;
    a._coffeeBackup = null;
    a._workBackup = null;
    a._specBackup = null;
    a._chatterBackup = null;
    a.setStatus("휴식 중 ☕");
  }

  ic.fireNow();
  ic.fireNow();

  const withBubble = (sc.agents || []).filter((a) => a._chatterBackup != null);
  return {
    chatter: window.__HERMES_AREA__?.chatter ?? null,
    fired: ic.fired,
    poolSize: ic.snapshot().poolSize,
    withBubble: withBubble.length,
    sample: withBubble[0]?.statusText ?? null,
    gathering: !!oe.isGathering?.(),
  };
});

await page.waitForTimeout(200);
await page.screenshot({ path: `${shotDir}/fired.png`, fullPage: true });

const gatherPause = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const ic = sc.idleChatter;
  const oe = sc.officeEvents;
  const before = ic.fired;
  oe.markGathering(60000);
  ic.fireNow();
  return {
    gathering: oe.isGathering(),
    firedBefore: before,
    firedAfter: ic.fired,
    paused: ic.fired === before,
    chatterGathering: window.__HERMES_AREA__?.chatter?.gathering,
  };
});

await gotoQs("chatter=0&events=0&sfx=0");

const off = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const ic = sc.idleChatter;
  const before = ic.fired;
  ic.fireNow();
  return {
    enabled: ic.enabled,
    firedBefore: before,
    firedAfter: ic.fired,
    chatter: window.__HERMES_AREA__?.chatter ?? null,
  };
});

await page.screenshot({ path: `${shotDir}/chatter-off.png`, fullPage: true });

const ok =
  fired.fired >= 2 &&
  fired.poolSize >= 10 &&
  fired.withBubble >= 1 &&
  gatherPause.paused === true &&
  gatherPause.gathering === true &&
  off.enabled === false &&
  off.firedAfter === off.firedBefore &&
  errors.length === 0;

const result = { ok, fired, gatherPause, off, errors, shotDir };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (!ok) {
  console.error("FAIL smoke-chatter");
  process.exit(1);
}
console.log("PASS smoke-chatter fired=", fired.fired, "pool=", fired.poolSize);
