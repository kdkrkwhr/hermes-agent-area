/** Smoke: aquarium fish GID-37 — day/night dim, ?fish=0 off. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-aquariumfish";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(45000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function check(label, qs, { expectActive, expectDim, expectEnabled }) {
  const root = base.replace(/\/?$/, "/");
  await page.goto(`${root}?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(800);
  const aquariumFish = await page.evaluate(() => window.__HERMES_AREA__?.aquariumFish);
  const aquarium = await page.evaluate(() => window.__HERMES_AREA__?.aquarium);
  const lighting = await page.evaluate(() => window.__HERMES_AREA__?.lighting);
  const ok =
    !!aquariumFish &&
    aquariumFish.enabled === expectEnabled &&
    aquariumFish.active === expectActive &&
    (expectDim == null || aquariumFish.dim === expectDim) &&
    (expectEnabled
      ? aquariumFish.fishCount >= 1 && aquariumFish.aquariumTiles >= 1
      : aquariumFish.fishCount === 0) &&
    // bubbles still present when fish on (no regression)
    (expectEnabled ? !!aquarium && aquarium.aquariumTiles >= 1 : true);
  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      lighting,
      aquariumFish,
      aquarium,
      expectActive,
      expectDim,
      expectEnabled,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("day-on", "tod=day&events=0&sfx=0&fish=1", {
  expectActive: true,
  expectDim: false,
  expectEnabled: true,
});
await check("night-dim", "tod=night&events=0&sfx=0", {
  expectActive: true,
  expectDim: true,
  expectEnabled: true,
});
await check("evening-dim", "tod=evening&events=0&sfx=0", {
  expectActive: true,
  expectDim: true,
  expectEnabled: true,
});
await check("fish-off", "tod=day&fish=0&events=0&sfx=0", {
  expectActive: false,
  expectDim: false,
  expectEnabled: false,
});

await browser.close();
if (errors.length) {
  console.error("pageerrors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL aquariumfish smoke");
  process.exit(1);
}
console.log("PASS aquariumfish smoke");
