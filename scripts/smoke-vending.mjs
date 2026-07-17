/**
 * Smoke: lounge/corridor vending E — hint, snack burst, cooldown, ?vending=0.
 * Requires vite on :5173.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "smoke-vending");
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
    return !!(sc?.boss?.sprite && sc?.roomInteract?.vendingTiles?.length);
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

const vend = await page.evaluate(async () => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const machine = sc?.roomInteract?.vendingTiles?.[0];
  if (!machine || !sc?.boss?.sprite) {
    return { ok: false, why: "no-vending" };
  }
  // clear higher-priority interactables
  sc.roomInteract.aquariumFeedEnabled = false;
  sc.roomInteract.mascotPetEnabled = false;
  sc.roomInteract.plantWaterEnabled = false;
  if (sc.mascot?.sprite) {
    sc.mascot.sprite.setPosition(machine.x + 400, machine.y + 400);
  }
  sc.boss.sprite.setPosition(machine.x + 12, machine.y + 18);
  sc.refreshInteractHud?.();
  const hint = sc.roomInteract.hintLabel();
  sc.roomInteract.tryInteract();
  await new Promise((r) => setTimeout(r, 200));
  const snap = window.__HERMES_AREA__?.vending;
  const ri = window.__HERMES_AREA__?.roomInteract;
  return {
    ok: true,
    hint,
    enabled: !!snap?.enabled,
    active: !!snap?.active,
    cooldown: !!snap?.cooldown,
    lastVendAt: snap?.lastVendAt ?? null,
    vendingCount: snap?.vendingCount ?? 0,
    kind: ri?.lastAction?.kind ?? null,
    toast: snap?.lastToast ?? null,
    snacks: snap?.snacks ?? 0,
    lastMachine: snap?.lastMachine ?? null,
  };
});

await page.screenshot({
  path: path.join(outDir, "vend-on.png"),
  fullPage: false,
});

const cooldownHint = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const machine = sc?.roomInteract?.vendingTiles?.[0];
  if (!machine || !sc?.boss?.sprite) return null;
  sc.boss.sprite.setPosition(machine.x + 12, machine.y + 18);
  sc.roomInteract.aquariumFeedEnabled = false;
  sc.roomInteract.mascotPetEnabled = false;
  sc.roomInteract.plantWaterEnabled = false;
  sc.refreshInteractHud?.();
  sc.roomInteract.vendingActiveUntil = 0;
  return sc.roomInteract.hintLabel();
});

await page.close();

const pageOff = await boot(`${base}?vending=0`);
const vendOff = await pageOff.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const machine = sc?.roomInteract?.vendingTiles?.[0];
  if (!machine || !sc?.boss?.sprite) return { ok: false, why: "no-vending" };
  sc.roomInteract.aquariumFeedEnabled = false;
  sc.roomInteract.mascotPetEnabled = false;
  sc.roomInteract.plantWaterEnabled = false;
  sc.boss.sprite.setPosition(machine.x + 10, machine.y + 14);
  sc.refreshInteractHud?.();
  return {
    ok: true,
    hint: sc.roomInteract.hintLabel(),
    enabled: !!window.__HERMES_AREA__?.vending?.enabled,
    flag: sc.roomInteract.vendingEnabled,
  };
});
await pageOff.screenshot({
  path: path.join(outDir, "vend-query-off.png"),
  fullPage: false,
});
await pageOff.close();

const out = { vend, cooldownHint, vendOff, errors };
console.log(JSON.stringify(out, null, 2));

const fail =
  !vend.ok ||
  vend.hint !== "E 스낵뽑기" ||
  !vend.active ||
  !vend.cooldown ||
  vend.kind !== "vending_start" ||
  !vend.lastVendAt ||
  vend.vendingCount < 1 ||
  !vend.lastMachine ||
  !vend.toast ||
  !String(vend.toast).includes("딸깍") ||
  !String(cooldownHint || "").includes("쿨다운") ||
  vendOff.hint === "E 스낵뽑기" ||
  vendOff.flag !== false ||
  errors.length;

await browser.close().catch(() => {});
process.exit(fail ? 1 : 0);
