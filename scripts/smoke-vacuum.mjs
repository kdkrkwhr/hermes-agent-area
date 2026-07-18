/** Smoke: lobby robot vacuum under ?vacuum=1 / fast / 0. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.env.SMOKE_URL || "http://127.0.0.1:5173";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-vacuum";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(45000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function check(label, qs, expect) {
  await page.goto(`${base}/?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  // let it move a bit so x/y change under force
  await page.waitForTimeout(expect.waitMs ?? 900);
  const vacuum = await page.evaluate(() => window.__HERMES_AREA__?.vacuum);
  const qsOff = /(?:^|&)vacuum=0(?:&|$)/.test(qs);
  const qsFast = /(?:^|&)vacuum=fast(?:&|$)/.test(qs);
  const ok =
    vacuum &&
    vacuum.active === expect.active &&
    (qsOff
      ? vacuum.enabled === false
      : vacuum.enabled === true &&
        vacuum.x != null &&
        vacuum.y != null &&
        vacuum.bounds != null) &&
    (qsFast ? vacuum.fast === true : expect.fast == null || vacuum.fast === expect.fast) &&
    (expect.forced == null || vacuum.forced === expect.forced);
  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      vacuum,
      expect,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("force-on", "vacuum=1&events=0&sfx=0", {
  active: true,
  forced: true,
  fast: false,
});
await check("fast", "vacuum=fast&events=0&sfx=0", {
  active: true,
  forced: true,
  fast: true,
  waitMs: 600,
});
await check("default-on", "tod=day&events=0&sfx=0", {
  active: true,
  forced: false,
  fast: false,
});
await check("force-off", "vacuum=0&events=0&sfx=0", {
  active: false,
  forced: false,
});

// movement: under vacuum=1, position should change across two samples
await page.goto(`${base}/?vacuum=1&events=0&sfx=0`, {
  waitUntil: "domcontentloaded",
  timeout: 45000,
});
await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
  timeout: 30000,
});
await page.waitForFunction(
  () => window.__HERMES_AREA__?.vacuum?.active === true && window.__HERMES_AREA__?.vacuum?.x != null,
  null,
  { timeout: 10000 },
);
const a = await page.evaluate(() => {
  const v = window.__HERMES_AREA__?.vacuum;
  return v ? { x: v.x, y: v.y, active: v.active } : null;
});
await page.waitForTimeout(1600);
const b = await page.evaluate(() => {
  const v = window.__HERMES_AREA__?.vacuum;
  return v ? { x: v.x, y: v.y, active: v.active } : null;
});
const moved =
  a &&
  b &&
  a.active &&
  b.active &&
  (Math.abs(a.x - b.x) > 2 || Math.abs(a.y - b.y) > 2);
console.log(JSON.stringify({ label: "moved", ok: !!moved, a, b }));
if (!moved) process.exitCode = 1;
await page.screenshot({ path: `${shotDir}/moved.png`, fullPage: true });

await browser.close();
if (errors.length) {
  console.error("pageerrors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL vacuum smoke");
  process.exit(1);
}
console.log("PASS vacuum smoke");
