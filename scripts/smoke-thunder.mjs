/** Smoke: ThunderFx under ?rain=1&thunder=1 (flash) and ?thunder=0 (off). */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.env.SMOKE_URL || "http://127.0.0.1:5173/hermes-agent-area";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-thunder";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(45000);

async function check(label, qs, expect, waitFlash = false) {
  await page.goto(`${base}/?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  await page.waitForFunction(
    () =>
      window.__HERMES_AREA__?.rain &&
      window.__HERMES_AREA__.rain.emitterCount >= 1,
    null,
    { timeout: 10000 },
  ).catch(() => {});

  if (waitFlash) {
    await page.waitForFunction(
      () => (window.__HERMES_AREA__?.thunder?.flashCount ?? 0) >= 1,
      null,
      { timeout: 20000 },
    );
  } else {
    await page.waitForTimeout(800);
  }

  const snap = await page.evaluate(() => ({
    thunder: window.__HERMES_AREA__?.thunder,
    rain: window.__HERMES_AREA__?.rain,
    snow: window.__HERMES_AREA__?.snow,
    lighting: window.__HERMES_AREA__?.lighting,
  }));

  const t = snap.thunder;
  const ok =
    !!t &&
    (expect.enabled == null || t.enabled === expect.enabled) &&
    (expect.fast == null || t.fast === expect.fast) &&
    (expect.canStrike == null || t.canStrike === expect.canStrike) &&
    (expect.minFlash == null || (t.flashCount ?? 0) >= expect.minFlash) &&
    (expect.maxFlash == null || (t.flashCount ?? 0) <= expect.maxFlash);

  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(JSON.stringify({ label, ok, ...snap, expect, shot }));
  if (!ok) process.exitCode = 1;
  return ok;
}

// rain on + thunder fast → canStrike + at least one flash
await check(
  "rain-thunder-on",
  "tod=day&rain=1&thunder=1&snow=0&events=0&sfx=0&weatherfx=0",
  { enabled: true, fast: true, canStrike: true, minFlash: 1 },
  true,
);

// thunder forced off while raining
await check(
  "thunder-off",
  "tod=day&rain=1&thunder=0&snow=0&events=0&sfx=0&weatherfx=0",
  { enabled: false, fast: false, canStrike: false, maxFlash: 0 },
  false,
);

// snow on → no strike even with thunder=1
await check(
  "snow-blocks",
  "tod=day&snow=1&thunder=1&rain=0&events=0&sfx=0&weatherfx=0",
  { enabled: true, fast: true, canStrike: false, maxFlash: 0 },
  false,
);

await browser.close();
if (process.exitCode) {
  console.error("FAIL smoke-thunder");
  process.exit(1);
}
console.log("PASS smoke-thunder");
