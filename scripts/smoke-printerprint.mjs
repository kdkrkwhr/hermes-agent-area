/**
 * Smoke: Open Desk printer (GID36) E print — hint, paper burst, cooldown,
 * jam block, ?printer=0 / ?printer=force.
 * Requires vite on :5173.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "smoke-printerprint");
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
    return !!(sc?.boss?.sprite && sc?.roomInteract?.printerTiles?.length);
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

const page = await boot(`${base}?events=0&sfx=0`);

const print = await page.evaluate(async () => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const machine = sc?.roomInteract?.printerTiles?.[0];
  if (!machine || !sc?.boss?.sprite) {
    return { ok: false, why: "no-printer" };
  }
  // clear higher-priority kitchen / lounge interacts near open desk
  sc.roomInteract.aquariumFeedEnabled = false;
  sc.roomInteract.mascotPetEnabled = false;
  sc.roomInteract.plantWaterEnabled = false;
  sc.roomInteract.vendingEnabled = false;
  sc.roomInteract.fridgeEnabled = false;
  sc.roomInteract.microwaveEnabled = false;
  sc.roomInteract.coolerEnabled = false;
  sc.roomInteract.coatRackEnabled = false;
  sc.roomInteract.coffeeTiles = [];
  if (sc.mascot?.sprite) {
    sc.mascot.sprite.setPosition(machine.x + 400, machine.y + 400);
  }
  sc.boss.sprite.setPosition(machine.x + 12, machine.y + 18);
  sc.refreshInteractHud?.();
  const hint = sc.roomInteract.hintLabel();
  sc.roomInteract.tryInteract();
  await new Promise((r) => setTimeout(r, 200));
  const snap = window.__HERMES_AREA__?.printer;
  const ri = window.__HERMES_AREA__?.roomInteract;
  return {
    ok: true,
    hint,
    enabled: !!snap?.enabled,
    active: !!snap?.active,
    cooldown: !!snap?.cooldown,
    lastPrintAt: snap?.lastPrintAt ?? null,
    printerCount: snap?.printerCount ?? 0,
    kind: ri?.lastAction?.kind ?? null,
    toast: snap?.lastToast ?? null,
    papers: snap?.papers ?? 0,
    lastMachine: snap?.lastMachine ?? null,
  };
});

await page.screenshot({
  path: path.join(outDir, "print-on.png"),
  fullPage: false,
});

const cooldownHint = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const machine = sc?.roomInteract?.printerTiles?.[0];
  if (!machine || !sc?.boss?.sprite) return null;
  sc.boss.sprite.setPosition(machine.x + 12, machine.y + 18);
  sc.roomInteract.aquariumFeedEnabled = false;
  sc.roomInteract.mascotPetEnabled = false;
  sc.roomInteract.plantWaterEnabled = false;
  sc.roomInteract.vendingEnabled = false;
  sc.roomInteract.fridgeEnabled = false;
  sc.roomInteract.microwaveEnabled = false;
  sc.roomInteract.coolerEnabled = false;
  sc.roomInteract.coatRackEnabled = false;
  sc.refreshInteractHud?.();
  sc.roomInteract.printerActiveUntil = 0;
  return sc.roomInteract.hintLabel();
});

const jamBlock = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc?.officeEvents;
  const machine = sc?.roomInteract?.printerTiles?.[0];
  if (!oe || !machine || !sc?.boss?.sprite) return { ok: false, why: "no-oe" };
  sc.roomInteract.aquariumFeedEnabled = false;
  sc.roomInteract.mascotPetEnabled = false;
  sc.roomInteract.plantWaterEnabled = false;
  sc.roomInteract.vendingEnabled = false;
  sc.roomInteract.fridgeEnabled = false;
  sc.roomInteract.microwaveEnabled = false;
  sc.roomInteract.coolerEnabled = false;
  sc.roomInteract.coatRackEnabled = false;
  oe.enabled = true;
  if (oe._schedule) {
    oe._schedule.remove(false);
    oe._schedule = null;
  }
  oe.lastEvent = "printer_jam";
  oe._gatherUntil = sc.time.now + 20000;
  sc.roomInteract.printerCooldownUntil = 0;
  sc.roomInteract.printerActiveUntil = 0;
  sc.boss.sprite.setPosition(machine.x + 12, machine.y + 18);
  sc.refreshInteractHud?.();
  sc.roomInteract.tryInteract();
  const snap = window.__HERMES_AREA__?.printer;
  const ri = window.__HERMES_AREA__?.roomInteract;
  const toastEl = document.querySelector(".room-toast");
  return {
    ok: true,
    kind: ri?.lastAction?.kind ?? null,
    toast: toastEl?.textContent ?? snap?.lastToast ?? null,
    jamBlocked: !!snap?.jamBlocked,
    active: !!snap?.active,
  };
});

await page.screenshot({
  path: path.join(outDir, "print-jam.png"),
  fullPage: false,
});
await page.close();

const pageOff = await boot(`${base}?events=0&sfx=0&printer=0`);
const printOff = await pageOff.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const machine = sc?.roomInteract?.printerTiles?.[0];
  if (!machine || !sc?.boss?.sprite) return { ok: false, why: "no-printer" };
  sc.roomInteract.aquariumFeedEnabled = false;
  sc.roomInteract.mascotPetEnabled = false;
  sc.roomInteract.plantWaterEnabled = false;
  sc.roomInteract.vendingEnabled = false;
  sc.roomInteract.fridgeEnabled = false;
  sc.roomInteract.microwaveEnabled = false;
  sc.roomInteract.coolerEnabled = false;
  sc.roomInteract.coatRackEnabled = false;
  sc.boss.sprite.setPosition(machine.x + 10, machine.y + 14);
  sc.refreshInteractHud?.();
  return {
    ok: true,
    hint: sc.roomInteract.hintLabel(),
    enabled: !!window.__HERMES_AREA__?.printer?.enabled,
    flag: sc.roomInteract.printerEnabled,
  };
});
await pageOff.screenshot({
  path: path.join(outDir, "print-query-off.png"),
  fullPage: false,
});
await pageOff.close();

const pageForce = await boot(`${base}?events=0&sfx=0&printer=force`);
await pageForce.waitForFunction(
  () => window.__HERMES_AREA__?.printer?.lastPrintAt != null,
  null,
  { timeout: 8000 },
).catch(() => {});
const printForce = await pageForce.evaluate(() => {
  const snap = window.__HERMES_AREA__?.printer;
  const ri = window.__HERMES_AREA__?.roomInteract;
  return {
    ok: true,
    enabled: !!snap?.enabled,
    lastPrintAt: snap?.lastPrintAt ?? null,
    kind: ri?.lastAction?.kind ?? null,
    toast: snap?.lastToast ?? null,
    papers: snap?.papers ?? 0,
  };
});
await pageForce.screenshot({
  path: path.join(outDir, "print-force.png"),
  fullPage: false,
});
await pageForce.close();

const out = { print, cooldownHint, jamBlock, printOff, printForce, errors };
console.log(JSON.stringify(out, null, 2));

const toastOk =
  print.toast &&
  (String(print.toast).includes("출력") || String(print.toast).includes("인쇄") || String(print.toast).includes("찌르륵"));

const fail =
  !print.ok ||
  print.hint !== "E 출력" ||
  !print.active ||
  !print.cooldown ||
  print.kind !== "printer_print_start" ||
  !print.lastPrintAt ||
  print.printerCount < 1 ||
  !print.lastMachine ||
  !toastOk ||
  !String(cooldownHint || "").includes("쿨다운") ||
  jamBlock.kind !== "printer_jam_block" ||
  jamBlock.active === true ||
  printOff.hint === "E 출력" ||
  printOff.flag !== false ||
  !printForce.lastPrintAt ||
  errors.length;

await browser.close().catch(() => {});
process.exit(fail ? 1 : 0);
