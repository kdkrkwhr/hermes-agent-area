/** Smoke: ground fog mist under ?fog=force / ?fog=0 + cloudy weather stub. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.env.SMOKE_URL || "http://127.0.0.1:5173/hermes-agent-area";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-fog";

mkdirSync(shotDir, { recursive: true });

const cloudyWeather = {
  date: "2099-01-02",
  summary: "흐림",
  periods: [
    { time: "00:00", sky: "흐림", pty: "없음", pop: 20, temp: 20 },
    { time: "23:00", sky: "안개", pty: "없음", pop: 10, temp: 19 },
  ],
};

const clearWeather = {
  date: "2099-01-03",
  summary: "맑음",
  periods: [
    { time: "00:00", sky: "맑음", pty: "없음", pop: 0, temp: 22 },
    { time: "23:00", sky: "맑음", pty: "없음", pop: 0, temp: 18 },
  ],
};

let stubbedWeather = null;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(45000);

await page.route("**/api/desk-brief**", async (route) => {
  if (!stubbedWeather) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ weather: null, news: null, source: "smoke" }),
    });
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      weather: stubbedWeather,
      news: { items: [] },
      source: "smoke",
    }),
  });
});

await page.route("**/attendance-pwa/data/weather/**", async (route) => {
  if (!stubbedWeather) {
    await route.fulfill({ status: 404, body: "missing" });
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(stubbedWeather),
  });
});

async function check(label, qs, expect, waitCloudy = false) {
  await page.goto(`${base}/?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  if (waitCloudy) {
    await page.waitForFunction(
      () => window.__HERMES_AREA__?.weatherFx?.cloudy === true,
      null,
      { timeout: 10000 },
    );
  } else {
    await page.waitForTimeout(600);
  }
  const fog = await page.evaluate(() => window.__HERMES_AREA__?.fog);
  const weatherFx = await page.evaluate(() => window.__HERMES_AREA__?.weatherFx);
  const lighting = await page.evaluate(() => window.__HERMES_AREA__?.lighting);
  const ok =
    fog &&
    fog.active === expect.active &&
    (expect.enabled == null || fog.enabled === expect.enabled) &&
    (expect.mode == null || fog.mode === expect.mode) &&
    (expect.emitterCount == null || fog.emitterCount === expect.emitterCount);
  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      lighting,
      fog,
      weatherFx,
      expect,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

stubbedWeather = null;
await check("force-on", "tod=day&fog=force&events=0&sfx=0", {
  active: true,
  enabled: true,
  mode: "full",
  emitterCount: 1,
});

stubbedWeather = null;
await check("force-off", "tod=day&fog=0&events=0&sfx=0", {
  active: false,
  enabled: false,
});

stubbedWeather = cloudyWeather;
await check(
  "cloudy-on",
  "tod=day&events=0&sfx=0",
  { active: true, enabled: true, mode: "full", emitterCount: 1 },
  true,
);

stubbedWeather = clearWeather;
await check("morning-weak", "tod=morning&events=0&sfx=0", {
  active: true,
  enabled: true,
  mode: "weak",
  emitterCount: 1,
});

stubbedWeather = clearWeather;
await check("day-clear-off", "tod=day&events=0&sfx=0", {
  active: false,
  enabled: true,
  mode: "off",
});

await browser.close();
if (process.exitCode) {
  console.error("FAIL fog smoke");
  process.exit(1);
}
console.log("PASS fog smoke");
