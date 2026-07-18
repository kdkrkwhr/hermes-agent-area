/** Smoke: Open Desk wall calendar — ?calendar=force / ?calendar=0. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-calendar";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(45000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

function expectedLabel(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${days[d.getDay()]}`;
}

async function check(label, qs, expect) {
  const root = base.replace(/\/?$/, "/");
  await page.goto(`${root}?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(800);

  const setup = await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const cal = sc?.wallCalendar;
    return {
      hasCal: !!cal,
      faceDepth: cal?.face?.depth ?? null,
      glowBlend: cal?.glow?.blendMode ?? null,
      agentDepth: 10,
    };
  });

  const wallCalendar = await page.evaluate(() => window.__HERMES_AREA__?.wallCalendar);
  const wantLabel = expectedLabel();
  const labelOk =
    !expect.active ||
    (wallCalendar?.label === wantLabel &&
      typeof wallCalendar?.date === "string" &&
      typeof wallCalendar?.weekday === "string");
  const depthOk =
    !expect.active ||
    (wallCalendar?.depth === 8 &&
      setup?.faceDepth === 8 &&
      setup?.faceDepth < setup?.agentDepth);
  const anchorOk =
    !expect.enabled ||
    (Number.isFinite(wallCalendar?.anchor?.x) && Number.isFinite(wallCalendar?.anchor?.y));
  const ok =
    !!wallCalendar &&
    wallCalendar.enabled === expect.enabled &&
    wallCalendar.active === expect.active &&
    (expect.forced == null || wallCalendar.forced === expect.forced) &&
    labelOk &&
    depthOk &&
    anchorOk;

  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      wallCalendar,
      setup,
      expect,
      wantLabel,
      labelOk,
      depthOk,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("force-on", "calendar=force&events=0&sfx=0", {
  enabled: true,
  active: true,
  forced: true,
});
await check("default-on", "events=0&sfx=0", {
  enabled: true,
  active: true,
  forced: false,
});
await check("calendar-off", "calendar=0&events=0&sfx=0", {
  enabled: false,
  active: false,
  forced: false,
});

await browser.close();
if (errors.length) {
  console.error("pageerrors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL calendar smoke");
  process.exit(1);
}
console.log("PASS calendar smoke");
