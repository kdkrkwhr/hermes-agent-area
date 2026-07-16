/** Smoke: walk footprint trails on + ?footprints=0 off. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.env.SMOKE_URL || "http://127.0.0.1:5173";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-footprints";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

async function check(label, qs, expectEnabled) {
  await page.goto(`${base}/?${qs}`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 15000,
  });
  // let agents walk a bit so marks can spawn when enabled
  await page.waitForTimeout(expectEnabled ? 1800 : 400);
  const footprints = await page.evaluate(() => window.__HERMES_AREA__?.footprints);
  const ok =
    footprints &&
    footprints.enabled === expectEnabled &&
    (expectEnabled
      ? footprints.trails >= 1
      : footprints.trails === 0 && footprints.marks === 0);
  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      footprints,
      expectEnabled,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("on-default", "events=0&sfx=0", true);
await check("force-off", "footprints=0&events=0&sfx=0", false);

await browser.close();
if (process.exitCode) {
  console.error("FAIL footprints smoke");
  process.exit(1);
}
console.log("PASS footprints smoke");
