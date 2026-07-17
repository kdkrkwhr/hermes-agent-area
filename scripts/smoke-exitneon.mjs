/** Smoke: lobby EXIT neon — ?exitneon=force / ?exitneon=0 + TOD gate. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-exitneon";

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
  await page.waitForTimeout(700);

  const setup = await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const neon = sc?.exitNeon;
    return {
      hasNeon: !!neon,
      panelDepth: neon?.panel?.depth ?? null,
      labelDepth: neon?.label?.depth ?? null,
      gateDepth: sc?.entranceGate?.turnstile?.depth ?? 7.5,
      agentDepth: 10,
    };
  });

  const exitNeon = await page.evaluate(() => window.__HERMES_AREA__?.exitNeon);
  const lighting = await page.evaluate(() => window.__HERMES_AREA__?.lighting);
  const depthOk =
    !expect.active ||
    (exitNeon?.depth === 7.3 &&
      setup?.panelDepth === 7.3 &&
      setup?.panelDepth < setup?.agentDepth &&
      setup?.panelDepth !== setup?.gateDepth);
  const colorOk =
    !expect.active ||
    (typeof exitNeon?.color === "number" &&
      exitNeon.color === 0xff6a2a);
  const ok =
    !!exitNeon &&
    exitNeon.enabled === expect.enabled &&
    exitNeon.active === expect.active &&
    (expect.mode == null || exitNeon.mode === expect.mode) &&
    (expect.enabled ? Number.isFinite(exitNeon.x) && Number.isFinite(exitNeon.y) : true) &&
    depthOk &&
    colorOk;

  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(
    JSON.stringify({
      label,
      ok,
      lighting,
      exitNeon,
      setup,
      expect,
      depthOk,
      colorOk,
      shot,
    }),
  );
  if (!ok) process.exitCode = 1;
  return ok;
}

await check("force-night", "exitneon=force&tod=night&events=0&sfx=0", {
  enabled: true,
  active: true,
  mode: "force",
});
await check("night-on", "tod=night&events=0&sfx=0", {
  enabled: true,
  active: true,
  mode: "neon",
});
await check("evening-on", "tod=evening&events=0&sfx=0", {
  enabled: true,
  active: true,
  mode: "neon",
});
await check("day-off", "tod=day&events=0&sfx=0", {
  enabled: true,
  active: false,
  mode: "off",
});
await check("morning-off", "tod=morning&events=0&sfx=0", {
  enabled: true,
  active: false,
  mode: "off",
});
await check("exitneon-off", "tod=night&exitneon=0&events=0&sfx=0", {
  enabled: false,
  active: false,
});

await browser.close();
if (errors.length) {
  console.error("pageerrors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL exitneon smoke");
  process.exit(1);
}
console.log("PASS exitneon smoke");
