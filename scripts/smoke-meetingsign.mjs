/** Smoke: War Room meeting door free/busy tablet.
 *  ?meetingsign=tablet (free) · force (busy) · 0 (off)
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-meetingsign";

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
  if (expect.state) {
    await page.waitForFunction(
      (want) => {
        const s = window.__HERMES_AREA__?.meetingDoorSign;
        return s?.active === true && s?.state === want;
      },
      expect.state,
      { timeout: 8000 },
    );
  } else {
    await page.waitForTimeout(600);
  }

  const setup = await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const sign = sc?.meetingDoorSign;
    return {
      hasSign: !!sign,
      rootDepth: sign?.root?.depth ?? null,
      agentDepth: 10,
      labelText: sign?.label?.text ?? null,
      subText: sign?.sub?.text ?? null,
    };
  });

  const snap = await page.evaluate(() => window.__HERMES_AREA__?.meetingDoorSign);
  const depthOk =
    !expect.active ||
    (snap?.depth === 8.2 &&
      setup?.rootDepth === 8.2 &&
      setup?.rootDepth < setup?.agentDepth);
  const stateOk = expect.state == null || snap?.state === expect.state;
  const slotOk =
    expect.state !== "free" ||
    (typeof snap?.slot === "string" && snap.slot.length > 0);
  const labelOk =
    !expect.active ||
    (expect.state === "busy"
      ? setup?.labelText === "회의중"
      : expect.state === "free"
        ? setup?.labelText === "비어있음"
        : true);
  const ok =
    !!snap &&
    snap.enabled === expect.enabled &&
    snap.active === expect.active &&
    (expect.forced == null || snap.forced === expect.forced) &&
    (expect.forceFree == null || snap.forceFree === expect.forceFree) &&
    stateOk &&
    slotOk &&
    labelOk &&
    depthOk &&
    (expect.enabled
      ? Number.isFinite(snap?.anchor?.tx) && Number.isFinite(snap?.anchor?.ty)
      : true);

  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      snap,
      setup,
      expect,
      depthOk,
      stateOk,
      slotOk,
      labelOk,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("tablet-free", "meetingsign=tablet&events=0&sfx=0", {
  enabled: true,
  active: true,
  forced: false,
  forceFree: true,
  state: "free",
});
await check("force-busy", "meetingsign=force&events=0&sfx=0", {
  enabled: true,
  active: true,
  forced: true,
  forceFree: false,
  state: "busy",
});
await check("forceFree-alias", "meetingsign=forceFree&events=0&sfx=0", {
  enabled: true,
  active: true,
  forced: false,
  forceFree: true,
  state: "free",
});
await check("sign-off", "meetingsign=0&events=0&sfx=0", {
  enabled: false,
  active: false,
});

await browser.close();
if (errors.length) {
  console.error("pageerrors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL meetingsign smoke");
  process.exit(1);
}
console.log("PASS meetingsign smoke");
