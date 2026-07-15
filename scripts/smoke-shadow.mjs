/** Smoke: soft foot shadows on + ?shadow=0 off. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.env.SMOKE_URL || "http://127.0.0.1:5173";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-shadow";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

async function check(label, qs, expectEnabled) {
  await page.goto(`${base}/?${qs}`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 15000,
  });
  await page.waitForTimeout(500);
  const spriteShadow = await page.evaluate(() => window.__HERMES_AREA__?.spriteShadow);
  const ok =
    spriteShadow &&
    spriteShadow.enabled === expectEnabled &&
    (expectEnabled
      ? spriteShadow.count >= 1 && spriteShadow.visible >= 1
      : spriteShadow.count === 0 && spriteShadow.visible === 0);
  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      spriteShadow,
      expectEnabled,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("on-default", "events=0&sfx=0", true);
await check("force-off", "shadow=0&events=0&sfx=0", false);

await browser.close();
if (process.exitCode) {
  console.error("FAIL shadow smoke");
  process.exit(1);
}
console.log("PASS shadow smoke");
