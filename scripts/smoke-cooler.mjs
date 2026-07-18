/**
 * Smoke: lounge water cooler (GID41) — idle drip, E sip, ?cooler=0/force.
 * Requires vite on :5173.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "smoke-cooler");
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
    return !!(sc?.boss?.sprite && sc?.roomInteract?.coolerTiles?.length);
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

const page = await boot(`${base}?cooler=force`);

const idle = await page.evaluate(() => {
  const snap = window.__HERMES_AREA__?.waterCoolerIdle;
  return {
    enabled: !!snap?.enabled,
    forced: !!snap?.forced,
    active: !!snap?.active,
    coolerCount: snap?.coolerCount ?? 0,
    coolers: snap?.coolers ?? [],
    gid: snap?.coolerGid ?? null,
  };
});

await page.screenshot({
  path: path.join(outDir, "force-drip.png"),
  fullPage: false,
});

const sip = await page.evaluate(async () => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const machine = sc?.roomInteract?.coolerTiles?.[0];
  if (!machine || !sc?.boss?.sprite) {
    return { ok: false, why: "no-cooler" };
  }
  // clear higher-priority kitchen interactables
  sc.roomInteract.aquariumFeedEnabled = false;
  sc.roomInteract.vendingEnabled = false;
  sc.roomInteract.fridgeEnabled = false;
  sc.roomInteract.microwaveEnabled = false;
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
  const snap = window.__HERMES_AREA__?.cooler;
  const ri = window.__HERMES_AREA__?.roomInteract;
  return {
    ok: true,
    hint,
    enabled: !!snap?.enabled,
    active: !!snap?.active,
    cooldown: !!snap?.cooldown,
    lastCoolerAt: snap?.lastCoolerAt ?? null,
    coolerCount: snap?.coolerCount ?? 0,
    kind: ri?.lastAction?.kind ?? null,
    toast: snap?.lastToast ?? null,
    lastMachine: snap?.lastMachine ?? null,
  };
});

await page.screenshot({
  path: path.join(outDir, "sip-on.png"),
  fullPage: false,
});

await page.close();

const pageOff = await boot(`${base}?cooler=0`);
const coolerOff = await pageOff.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const machine = sc?.roomInteract?.coolerTiles?.[0];
  const idleSnap = window.__HERMES_AREA__?.waterCoolerIdle;
  if (!machine || !sc?.boss?.sprite) {
    return { ok: false, why: "no-cooler", idleEnabled: !!idleSnap?.enabled };
  }
  sc.roomInteract.aquariumFeedEnabled = false;
  sc.roomInteract.vendingEnabled = false;
  sc.roomInteract.fridgeEnabled = false;
  sc.roomInteract.microwaveEnabled = false;
  sc.roomInteract.mascotPetEnabled = false;
  sc.roomInteract.plantWaterEnabled = false;
  sc.boss.sprite.setPosition(machine.x + 10, machine.y + 14);
  sc.refreshInteractHud?.();
  return {
    ok: true,
    hint: sc.roomInteract.hintLabel(),
    enabled: !!window.__HERMES_AREA__?.cooler?.enabled,
    flag: sc.roomInteract.coolerEnabled,
    idleEnabled: !!idleSnap?.enabled,
    idleActive: !!idleSnap?.active,
  };
});
await pageOff.screenshot({
  path: path.join(outDir, "cooler-off.png"),
  fullPage: false,
});
await pageOff.close();
await browser.close();

if (errors.length) {
  console.error("FAIL: page errors", errors.slice(0, 5));
  process.exit(1);
}
if ((idle.coolerCount ?? 0) < 1 || idle.gid !== 41) {
  console.error("FAIL: need ≥1 GID41 cooler idle", idle);
  process.exit(1);
}
if (!idle.forced || !idle.active) {
  console.error("FAIL: ?cooler=force should force+active idle", idle);
  process.exit(1);
}
if (!sip.ok || sip.kind !== "cooler_start") {
  console.error("FAIL: E sip should cooler_start", sip);
  process.exit(1);
}
if ((sip.coolerCount ?? 0) < 1 || !sip.cooldown) {
  console.error("FAIL: cooler interact should set cooldown", sip);
  process.exit(1);
}
if (!coolerOff.ok || coolerOff.enabled || coolerOff.idleEnabled) {
  console.error("FAIL: ?cooler=0 should disable interact+idle", coolerOff);
  process.exit(1);
}

console.log(
  "PASS: cooler idle=",
  idle.coolerCount,
  "sip=",
  sip.toast,
  "off=",
  coolerOff.flag,
);
