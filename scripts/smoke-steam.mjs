/** Smoke: ambient coffee steam GID16 — day/night dim, ?steam=0 off. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5181/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-steam";

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
  await page.waitForTimeout(500);
  const steam = await page.evaluate(() => window.__HERMES_AREA__?.steam);
  const lighting = await page.evaluate(() => window.__HERMES_AREA__?.lighting);
  const ok =
    !!steam &&
    steam.enabled === expectEnabled &&
    steam.active === expectActive &&
    (expectDim == null || steam.dim === expectDim) &&
    (expectEnabled
      ? steam.emitterCount >= 1 && steam.coffeeTiles >= 1
      : steam.emitterCount === 0);
  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      lighting,
      steam,
      expectActive,
      expectDim,
      expectEnabled,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("day-on", "tod=day&events=0&sfx=0", {
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
await check("steam-off", "tod=day&steam=0&events=0&sfx=0", {
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
  console.error("FAIL steam smoke");
  process.exit(1);
}
console.log("PASS steam smoke");
