/** Smoke: weather JSON → rain/snow force + cloudy overlay; ?weatherfx=0 / ?rain= / ?snow= gates. */
import { chromium } from "playwright";

const base = process.env.SMOKE_URL || "http://127.0.0.1:5173/hermes-agent-area";

const rainyWeather = {
  date: "2099-01-01",
  summary: "비 옴",
  periods: [
    { time: "00:00", sky: "흐림", pty: "비", pop: 80, temp: 18 },
    { time: "23:00", sky: "흐림", pty: "비", pop: 90, temp: 17 },
  ],
};

const snowyWeather = {
  date: "2099-01-04",
  summary: "눈 옴",
  periods: [
    { time: "00:00", sky: "흐림", pty: "눈", pop: 80, temp: -2 },
    { time: "23:00", sky: "흐림", pty: "진눈개비", pop: 90, temp: -1 },
  ],
};

const cloudyWeather = {
  date: "2099-01-02",
  summary: "흐림",
  periods: [
    { time: "00:00", sky: "흐림", pty: "없음", pop: 20, temp: 20 },
    { time: "23:00", sky: "구름많음", pty: "없음", pop: 10, temp: 19 },
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

/** @type {object|null|undefined} undefined = passthrough (not used) */
let stubbedWeather = null;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.route("**/api/desk-brief**", async (route) => {
  if (stubbedWeather === undefined) {
    await route.continue();
    return;
  }
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
  if (stubbedWeather === undefined) {
    await route.continue();
    return;
  }
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

await page.route("**/attendance-pwa/data/news/**", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ items: [] }),
  });
});

async function goto(qs, waitLabel = null) {
  await page.goto(`${base}/?${qs}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 20000,
  });
  await page.waitForFunction(
    () => window.__HERMES_AREA__?.weatherFx != null,
    null,
    { timeout: 10000 },
  );
  if (waitLabel === "rain") {
    await page.waitForFunction(
      () => window.__HERMES_AREA__?.weatherFx?.raining === true,
      null,
      { timeout: 10000 },
    );
  } else if (waitLabel === "snow") {
    await page.waitForFunction(
      () => window.__HERMES_AREA__?.weatherFx?.snowing === true,
      null,
      { timeout: 10000 },
    );
  } else if (waitLabel === "cloudy") {
    await page.waitForFunction(
      () => window.__HERMES_AREA__?.weatherFx?.cloudy === true,
      null,
      { timeout: 10000 },
    );
  } else if (waitLabel === "clear") {
    await page.waitForFunction(
      () => window.__HERMES_AREA__?.weatherFx?.label === "clear",
      null,
      { timeout: 10000 },
    );
  } else if (waitLabel === "off") {
    await page.waitForFunction(
      () => window.__HERMES_AREA__?.weatherFx?.enabled === false,
      null,
      { timeout: 5000 },
    );
  } else {
    await page.waitForTimeout(700);
  }
}

async function snap() {
  return page.evaluate(() => ({
    weatherFx: window.__HERMES_AREA__?.weatherFx,
    rain: window.__HERMES_AREA__?.rain,
    snow: window.__HERMES_AREA__?.snow,
    lighting: window.__HERMES_AREA__?.lighting,
  }));
}

let failed = false;
function check(label, ok, detail) {
  console.log(JSON.stringify({ label, ok, ...detail }));
  if (!ok) failed = true;
}

stubbedWeather = rainyWeather;
await goto("tod=day&events=0&rain=", "rain");
{
  const s = await snap();
  check(
    "rain-json-forces-rain",
    s.weatherFx?.raining === true &&
      s.rain?.weatherForceOn === true &&
      s.rain?.active === true,
    s,
  );
}

stubbedWeather = snowyWeather;
await goto("tod=day&events=0&rain=&snow=", "snow");
{
  const s = await snap();
  check(
    "snow-json-forces-snow-not-rain",
    s.weatherFx?.snowing === true &&
      s.weatherFx?.raining === false &&
      s.weatherFx?.label === "snow" &&
      s.snow?.weatherForceOn === true &&
      s.snow?.active === true &&
      s.rain?.weatherForceOn === false &&
      s.rain?.active === false,
    s,
  );
}

stubbedWeather = snowyWeather;
await goto("tod=evening&events=0&rain=&snow=", "snow");
{
  const s = await snap();
  check(
    "snow-suppresses-tod-rain",
    s.weatherFx?.snowing === true &&
      s.snow?.active === true &&
      s.rain?.active === false &&
      s.rain?.weatherSnowing === true,
    s,
  );
}

stubbedWeather = null;
await goto("tod=day&events=0&rain=0&snow=1");
{
  const s = await snap();
  check(
    "snow-query-1-force",
    s.snow?.forcedOn === true &&
      s.snow?.active === true &&
      s.rain?.active === false,
    s,
  );
}

stubbedWeather = cloudyWeather;
await goto("tod=day&events=0&rain=", "cloudy");
{
  const s = await snap();
  check(
    "cloudy-json-no-rain-day",
    s.weatherFx?.cloudy === true &&
      s.weatherFx?.raining === false &&
      s.weatherFx?.snowing === false &&
      s.rain?.weatherForceOn === false &&
      s.rain?.active === false &&
      s.snow?.weatherForceOn === false &&
      s.snow?.active === false,
    s,
  );
}

stubbedWeather = clearWeather;
await goto("tod=day&events=0&rain=", "clear");
{
  const s = await snap();
  check(
    "clear-json-tod-owns-day",
    s.weatherFx?.label === "clear" &&
      s.rain?.weatherForceOn === false &&
      s.rain?.active === false,
    s,
  );
}

stubbedWeather = rainyWeather;
await goto("tod=day&events=0&rain=0", "rain");
{
  const s = await snap();
  check(
    "rain-query-0-wins",
    s.weatherFx?.raining === true && s.rain?.active === false && s.rain?.enabled === false,
    s,
  );
}

stubbedWeather = snowyWeather;
await goto("tod=day&events=0&snow=0", "snow");
{
  const s = await snap();
  check(
    "snow-query-0-wins",
    s.weatherFx?.snowing === true &&
      s.snow?.active === false &&
      s.snow?.enabled === false &&
      s.rain?.active === false,
    s,
  );
}

stubbedWeather = snowyWeather;
await goto("tod=day&events=0&weatherfx=0", "off");
{
  const s = await snap();
  check(
    "weatherfx-0-noop",
    s.weatherFx?.enabled === false &&
      s.rain?.weatherForceOn === false &&
      s.rain?.active === false &&
      s.snow?.weatherForceOn === false &&
      s.snow?.active === false,
    s,
  );
}

stubbedWeather = null;
await goto("tod=day&events=0&rain=");
{
  const s = await snap();
  check(
    "missing-weather-noop",
    s.weatherFx?.label == null &&
      s.rain?.weatherForceOn === false &&
      s.rain?.active === false &&
      s.snow?.weatherForceOn === false &&
      s.snow?.active === false,
    s,
  );
}

await browser.close();
if (failed) {
  console.error("FAIL weatherfx smoke");
  process.exit(1);
}
console.log("PASS weatherfx smoke");
