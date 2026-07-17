/**
 * Smoke: plant E-water — hint, droplets/boost, cooldown, ?plantwater=0.
 * Requires vite on :5173.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "smoke-plantwater");
fs.mkdirSync(outDir, { recursive: true });

const base = process.env.SMOKE_URL || "http://127.0.0.1:5173/hermes-agent-area/";
const browser = await chromium.launch({ headless: true });
const errors = [];

async function boot(url) {
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 15000,
  });
  await page.waitForFunction(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    return !!(sc?.boss?.sprite && sc?.roomInteract?.plantTiles?.length);
  }, null, { timeout: 20000 });
  await page.waitForTimeout(400);
  await page.mouse.click(80, 80);
  await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    if (sc?._clockOutPending) sc.cancelClockOut?.();
    document.querySelector('.clockout-modal [data-role="no"]')?.click();
  });
  await page.waitForFunction(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    return (sc?.roomInteract?.visitCount ?? 0) > 0;
  }, null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(200);
  return page;
}

const page = await boot(base);

const water = await page.evaluate(async () => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const plant = sc?.roomInteract?.plantTiles?.[0];
  if (!plant || !sc?.boss?.sprite) {
    return { ok: false, why: "no-plant" };
  }
  // clear of coffee / aquarium / nap / mascot (higher priority)
  sc.roomInteract.aquariumFeedEnabled = false;
  sc.roomInteract.mascotPetEnabled = false;
  if (sc.mascot?.sprite) {
    sc.mascot.sprite.setPosition(plant.x + 400, plant.y + 400);
  }
  sc.boss.sprite.setPosition(plant.x + 12, plant.y + 18);
  sc.refreshInteractHud?.();
  const hint = sc.roomInteract.hintLabel();
  sc.roomInteract.tryInteract();
  await new Promise((r) => setTimeout(r, 200));
  const snap = window.__HERMES_AREA__?.plantWater;
  const ri = window.__HERMES_AREA__?.roomInteract;
  const sway = window.__HERMES_AREA__?.plantSway;
  return {
    ok: true,
    hint,
    enabled: !!snap?.enabled,
    active: !!snap?.active,
    cooldown: !!snap?.cooldown,
    lastWaterAt: snap?.lastWaterAt ?? null,
    plantCount: snap?.plantCount ?? 0,
    kind: ri?.lastAction?.kind ?? null,
    boosted: !!sway?.boosted,
    lastPlant: snap?.lastPlant ?? null,
  };
});

await page.screenshot({
  path: path.join(outDir, "water-on.png"),
  fullPage: false,
});

const cooldownHint = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const plant = sc?.roomInteract?.plantTiles?.[0];
  if (!plant || !sc?.boss?.sprite) return null;
  sc.boss.sprite.setPosition(plant.x + 12, plant.y + 18);
  sc.roomInteract.aquariumFeedEnabled = false;
  sc.roomInteract.mascotPetEnabled = false;
  sc.refreshInteractHud?.();
  sc.roomInteract.plantWaterActiveUntil = 0;
  return sc.roomInteract.hintLabel();
});

await page.close();

// ?plantwater=0 — no water hint even when near
const pageOff = await boot(`${base}?plantwater=0`);
const waterOff = await pageOff.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const plant = sc?.roomInteract?.plantTiles?.[0];
  if (!plant || !sc?.boss?.sprite) return { ok: false, why: "no-plant" };
  sc.roomInteract.aquariumFeedEnabled = false;
  sc.roomInteract.mascotPetEnabled = false;
  sc.boss.sprite.setPosition(plant.x + 10, plant.y + 14);
  sc.refreshInteractHud?.();
  return {
    ok: true,
    hint: sc.roomInteract.hintLabel(),
    enabled: !!window.__HERMES_AREA__?.plantWater?.enabled,
    flag: sc.roomInteract.plantWaterEnabled,
  };
});
await pageOff.screenshot({
  path: path.join(outDir, "water-query-off.png"),
  fullPage: false,
});
await pageOff.close();

const out = { water, cooldownHint, waterOff, errors };
console.log(JSON.stringify(out, null, 2));

const fail =
  !water.ok ||
  water.hint !== "E 물주기" ||
  !water.active ||
  !water.cooldown ||
  water.kind !== "plant_water_start" ||
  !water.lastWaterAt ||
  water.plantCount < 1 ||
  !water.lastPlant ||
  !String(cooldownHint || "").includes("쿨다운") ||
  waterOff.hint === "E 물주기" ||
  waterOff.flag !== false ||
  errors.length;

await browser.close().catch(() => {});
process.exit(fail ? 1 : 0);
