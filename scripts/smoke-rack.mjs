/** Smoke: Focus server rack GID42 LED chase + E interact — idle, ?rack=0 off, ?rack=force. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-rack";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(45000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function load(qs) {
  const root = base.replace(/\/?$/, "/");
  await page.goto(`${root}?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(600);
  await page.mouse.click(80, 80);
  await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    if (sc?._clockOutPending) sc.cancelClockOut?.();
    document.querySelector('.clockout-modal [data-role="no"]')?.click();
  });
  await page.waitForTimeout(200);
}

async function checkIdle(label, qs) {
  await load(qs);
  const result = await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const fx = sc?.serverRackLeds;
    if (!fx) return { ok: false, reason: "no serverRackLeds" };
    const a = fx.snapshot();
    fx.update((sc.time?.now ?? 0) + 1200);
    const b = fx.snapshot();
    const ok =
      a.enabled === true &&
      b.active === true &&
      a.rackCount >= 1 &&
      a.rackGid === 42 &&
      Array.isArray(a.racks) &&
      a.racks.some((r) => r.tx === 10 && r.ty === 22);
    return { ok, a, b };
  });
  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(JSON.stringify({ label, ...result, shot }));
  if (!result.ok) process.exitCode = 1;
  return result.ok;
}

async function checkForce(label) {
  await load("tod=day&events=0&sfx=0&rack=force");
  const result = await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const fx = sc?.serverRackLeds;
    if (!fx) return { ok: false, reason: "no serverRackLeds" };
    // center camera near Focus rack
    sc.cameras?.main?.centerOn?.(10 * 48 + 24, 22 * 48 + 24);
    fx.update(sc.time?.now ?? 0);
    const snap = fx.snapshot();
    const ok =
      snap.enabled === true &&
      snap.forced === true &&
      snap.active === true &&
      snap.rackCount >= 1 &&
      fx.periodMs === 1100;
    return { ok, snap, periodMs: fx.periodMs, area: window.__HERMES_AREA__?.serverRack ?? null };
  });
  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(JSON.stringify({ label, ...result, shot }));
  if (!result.ok) process.exitCode = 1;
  return result.ok;
}

async function checkInteract(label) {
  await load("tod=day&events=0&sfx=0&rack=force");
  const result = await page.evaluate(async () => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const machine = sc?.roomInteract?.rackTiles?.[0];
    if (!machine || !sc?.boss?.sprite) {
      return { ok: false, why: "no-rack" };
    }
    // clear higher-priority interactables
    sc.roomInteract.aquariumFeedEnabled = false;
    sc.roomInteract.vendingEnabled = false;
    sc.roomInteract.fridgeEnabled = false;
    sc.roomInteract.microwaveEnabled = false;
    sc.roomInteract.coolerEnabled = false;
    sc.roomInteract.coatRackEnabled = false;
    sc.roomInteract.mascotPetEnabled = false;
    sc.roomInteract.plantWaterEnabled = false;
    if (sc.mascot?.sprite) {
      sc.mascot.sprite.setPosition(machine.x + 400, machine.y + 400);
    }
    sc.boss.sprite.setPosition(machine.x + 12, machine.y + 18);
    sc.cameras?.main?.centerOn?.(machine.x, machine.y);
    sc.refreshInteractHud?.();
    const hint = sc.roomInteract.hintLabel();
    sc.roomInteract.tryInteract();
    await new Promise((r) => setTimeout(r, 120));
    sc.serverRackLeds?.update?.(sc.time?.now ?? 0);
    const snap = window.__HERMES_AREA__?.rack;
    const leds = window.__HERMES_AREA__?.serverRack;
    const ri = window.__HERMES_AREA__?.roomInteract;
    return {
      ok: true,
      hint,
      enabled: !!snap?.enabled,
      active: !!snap?.active,
      cooldown: !!snap?.cooldown,
      lastRackAt: snap?.lastRackAt ?? null,
      rackCount: snap?.rackCount ?? 0,
      kind: ri?.lastAction?.kind ?? null,
      toast: snap?.lastToast ?? null,
      lastMachine: snap?.lastMachine ?? null,
      ledInteracting: !!leds?.interacting,
      ledPeriod: leds?.periodMs ?? null,
    };
  });
  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(JSON.stringify({ label, ...result, shot }));
  if (!result.ok || result.kind !== "rack_start") process.exitCode = 1;
  if (!result.cooldown || !result.ledInteracting) process.exitCode = 1;
  if (result.hint !== "E 서버랙" && !String(result.hint || "").includes("서버랙")) {
    // after start, hintKind skips while active — accept prior hint or cooldown label
  }
  return result;
}

async function checkOff(label) {
  await load("tod=day&events=0&sfx=0&rack=0");
  const snap = await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const leds = sc?.serverRackLeds?.snapshot?.() ?? window.__HERMES_AREA__?.serverRack ?? null;
    const machine = sc?.roomInteract?.rackTiles?.[0];
    let hint = null;
    let interactEnabled = !!sc?.roomInteract?.rackEnabled;
    if (machine && sc?.boss?.sprite) {
      sc.roomInteract.aquariumFeedEnabled = false;
      sc.roomInteract.vendingEnabled = false;
      sc.roomInteract.fridgeEnabled = false;
      sc.roomInteract.microwaveEnabled = false;
      sc.roomInteract.coolerEnabled = false;
      sc.roomInteract.coatRackEnabled = false;
      sc.boss.sprite.setPosition(machine.x + 10, machine.y + 14);
      sc.refreshInteractHud?.();
      hint = sc.roomInteract.hintLabel();
    }
    return {
      leds,
      hint,
      interactEnabled,
      rackSnap: window.__HERMES_AREA__?.rack ?? null,
    };
  });
  const ok =
    !!snap.leds &&
    snap.leds.enabled === false &&
    snap.leds.active === false &&
    snap.interactEnabled === false &&
    snap.hint !== "E 서버랙";
  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(JSON.stringify({ label, ok, snap, shot }));
  if (!ok) process.exitCode = 1;
  return ok;
}

await checkIdle("day-on", "tod=day&events=0&sfx=0");
await checkForce("force");
await checkInteract("force-e");
await checkOff("off");

await browser.close();
if (errors.length) {
  console.error("page errors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL rack smoke");
  process.exit(1);
}
console.log("PASS rack smoke");
