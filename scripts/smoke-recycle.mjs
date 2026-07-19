/**
 * Smoke: lounge recycle bin (GID45) — idle rustle, E toss, ?recycle=0/force.
 * Requires vite on :5173.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "smoke-recycle");
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
    return !!(sc?.boss?.sprite && sc?.roomInteract?.recycleTiles?.length);
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

const page = await boot(`${base}?recycle=force&sfx=0&events=0`);

const idle = await page.evaluate(() => {
  const snap = window.__HERMES_AREA__?.recycleBinIdle;
  return {
    enabled: !!snap?.enabled,
    forced: !!snap?.forced,
    active: !!snap?.active,
    binCount: snap?.binCount ?? 0,
    bins: snap?.bins ?? [],
    gid: snap?.recycleBinGid ?? null,
  };
});

await page.screenshot({
  path: path.join(outDir, "force-rustle.png"),
  fullPage: false,
});

const toss = await page.evaluate(async () => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const machine = sc?.roomInteract?.recycleTiles?.[0];
  if (!machine || !sc?.boss?.sprite) {
    return { ok: false, why: "no-recycle" };
  }
  sc.roomInteract.aquariumFeedEnabled = false;
  sc.roomInteract.vendingEnabled = false;
  sc.roomInteract.fridgeEnabled = false;
  sc.roomInteract.microwaveEnabled = false;
  sc.roomInteract.coolerEnabled = false;
  sc.roomInteract.coatRackEnabled = false;
  sc.roomInteract.mascotPetEnabled = false;
  sc.roomInteract.plantWaterEnabled = false;
  sc.roomInteract.posterEnabled = false;
  if (sc.mascot?.sprite) {
    sc.mascot.sprite.setPosition(machine.x + 400, machine.y + 400);
  }
  sc.boss.sprite.setPosition(machine.x + 12, machine.y + 18);
  sc.refreshInteractHud?.();
  const hint = sc.roomInteract.hintLabel();
  sc.roomInteract.tryInteract();
  await new Promise((r) => setTimeout(r, 200));
  const snap = window.__HERMES_AREA__?.recycle;
  const ri = window.__HERMES_AREA__?.roomInteract;
  return {
    ok: true,
    hint,
    enabled: !!snap?.enabled,
    active: !!snap?.active,
    cooldown: !!snap?.cooldown,
    papers: snap?.papers ?? 0,
    lastRecycleAt: snap?.lastRecycleAt ?? null,
    recycleCount: snap?.recycleCount ?? 0,
    kind: ri?.lastAction?.kind ?? null,
    toast: snap?.lastToast ?? null,
    lastMachine: snap?.lastMachine ?? null,
  };
});

await page.screenshot({
  path: path.join(outDir, "toss-on.png"),
  fullPage: false,
});

await page.close();

const pageOff = await boot(`${base}?recycle=0&sfx=0&events=0`);
const binOff = await pageOff.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const machine = sc?.roomInteract?.recycleTiles?.[0];
  const idleSnap = window.__HERMES_AREA__?.recycleBinIdle;
  if (!machine || !sc?.boss?.sprite) {
    return { ok: false, why: "no-recycle", idleEnabled: !!idleSnap?.enabled };
  }
  sc.roomInteract.aquariumFeedEnabled = false;
  sc.roomInteract.vendingEnabled = false;
  sc.roomInteract.fridgeEnabled = false;
  sc.roomInteract.microwaveEnabled = false;
  sc.roomInteract.coolerEnabled = false;
  sc.roomInteract.coatRackEnabled = false;
  sc.roomInteract.mascotPetEnabled = false;
  sc.roomInteract.plantWaterEnabled = false;
  sc.roomInteract.posterEnabled = false;
  sc.boss.sprite.setPosition(machine.x + 10, machine.y + 14);
  sc.refreshInteractHud?.();
  return {
    ok: true,
    hint: sc.roomInteract.hintLabel(),
    enabled: !!window.__HERMES_AREA__?.recycle?.enabled,
    flag: sc.roomInteract.recycleEnabled,
    idleEnabled: !!idleSnap?.enabled,
    idleActive: !!idleSnap?.active,
  };
});
await pageOff.screenshot({
  path: path.join(outDir, "recycle-off.png"),
  fullPage: false,
});
await pageOff.close();
await browser.close();

if (errors.length) {
  console.error("FAIL: page errors", errors.slice(0, 5));
  process.exit(1);
}
if ((idle.binCount ?? 0) < 1 || idle.gid !== 45) {
  console.error("FAIL: need ≥1 GID45 recycleBin idle", idle);
  process.exit(1);
}
if (!idle.forced || !idle.active) {
  console.error("FAIL: ?recycle=force should force+active idle", idle);
  process.exit(1);
}
if (!toss.ok || (toss.recycleCount ?? 0) < 1 || !toss.cooldown || !toss.toast || (toss.papers ?? 0) < 1) {
  console.error("FAIL: E toss should set papers+cooldown+toast", toss);
  process.exit(1);
}
if (toss.kind && toss.kind !== "recycle_start" && toss.kind !== "lobby_enter") {
  console.error("FAIL: unexpected lastAction kind", toss);
  process.exit(1);
}
if (!binOff.ok || binOff.enabled || binOff.idleEnabled) {
  console.error("FAIL: ?recycle=0 should disable interact+idle", binOff);
  process.exit(1);
}

console.log(
  "PASS: recycle idle=",
  idle.binCount,
  "toss=",
  toss.toast,
  "papers=",
  toss.papers,
  "off=",
  binOff.flag,
);
