/**
 * Smoke: lounge mascot E-pet — hint, hearts, cooldown, ?mascotpet=0 / ?mascot=0.
 * Requires vite on :5173.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "smoke-mascotpet");
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
    return !!(sc?.boss?.sprite && sc?.roomInteract);
  }, null, { timeout: 20000 });
  await page.waitForTimeout(400);
  await page.mouse.click(80, 80);
  await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    if (sc?._clockOutPending) sc.cancelClockOut?.();
    document.querySelector('.clockout-modal [data-role="no"]')?.click();
  });
  // greetOnStart delayedCall(400) can overwrite lastAction — wait it out
  await page.waitForFunction(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    return (sc?.roomInteract?.visitCount ?? 0) > 0;
  }, null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(200);
  return page;
}

const page = await boot(base);

const pet = await page.evaluate(async () => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const m = sc?.mascot;
  if (!m?.sprite || !sc?.boss?.sprite) {
    return { ok: false, why: "no-mascot" };
  }
  // park clear of coffee / aquarium / nap (higher priority than pet)
  const tw = sc.map.tileWidth;
  const sleep = sc.waypoints?.sleep || { x: 31, y: 21 };
  const clear = { x: (sleep.x - 8) * tw + tw / 2, y: (sleep.y - 4) * tw + tw / 2 };
  m.path = [];
  m.pathIndex = 0;
  m.idleUntil = sc.time.now + 60000;
  m.sprite.setPosition(clear.x, clear.y);
  sc.boss.sprite.setPosition(clear.x + 18, clear.y + 6);
  sc.roomInteract.aquariumFeedEnabled = false;
  sc.refreshInteractHud?.();
  const hint = sc.roomInteract.hintLabel();
  sc.roomInteract.tryInteract();
  await new Promise((r) => setTimeout(r, 180));
  const snap = window.__HERMES_AREA__?.mascotPet;
  const ri = window.__HERMES_AREA__?.roomInteract;
  return {
    ok: true,
    hint,
    enabled: !!snap?.enabled,
    active: !!snap?.active,
    cooldown: !!snap?.cooldown,
    lastPetAt: snap?.lastPetAt ?? null,
    hearts: snap?.hearts ?? 0,
    kind: ri?.lastAction?.kind ?? null,
    petting: !!m.isPetting?.(),
  };
});

await page.screenshot({
  path: path.join(outDir, "pet-on.png"),
  fullPage: false,
});

const cooldownHint = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const m = sc?.mascot;
  if (!m?.sprite || !sc?.boss?.sprite) return null;
  sc.boss.sprite.setPosition(m.sprite.x + 18, m.sprite.y);
  sc.roomInteract.aquariumFeedEnabled = false;
  sc.refreshInteractHud?.();
  // force past active window but keep cooldown
  sc.roomInteract.mascotPetActiveUntil = 0;
  m.endPet?.();
  return sc.roomInteract.hintLabel();
});

await page.close();

// ?mascotpet=0 — no pet hint even when near
const pageOff = await boot(`${base}?mascotpet=0`);
const petOff = await pageOff.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const m = sc?.mascot;
  if (!m?.sprite || !sc?.boss?.sprite) return { ok: false, why: "no-mascot" };
  const tw = sc.map.tileWidth;
  const sleep = sc.waypoints?.sleep || { x: 31, y: 21 };
  const clear = { x: (sleep.x - 8) * tw + tw / 2, y: (sleep.y - 4) * tw + tw / 2 };
  m.path = [];
  m.sprite.setPosition(clear.x, clear.y);
  sc.boss.sprite.setPosition(clear.x + 16, clear.y);
  sc.roomInteract.aquariumFeedEnabled = false;
  sc.refreshInteractHud?.();
  return {
    ok: true,
    hint: sc.roomInteract.hintLabel(),
    enabled: !!window.__HERMES_AREA__?.mascotPet?.enabled,
    flag: sc.roomInteract.mascotPetEnabled,
  };
});
await pageOff.screenshot({
  path: path.join(outDir, "pet-query-off.png"),
  fullPage: false,
});
await pageOff.close();

// ?mascot=0 — no mascot → no pet
const pageNoCat = await boot(`${base}?mascot=0`);
const noCat = await pageNoCat.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  return {
    mascot: !!sc?.mascot,
    hint: sc?.roomInteract?.hintLabel?.() ?? null,
    enabled: !!window.__HERMES_AREA__?.mascotPet?.enabled,
  };
});
await pageNoCat.close();

const out = { pet, cooldownHint, petOff, noCat, errors };
console.log(JSON.stringify(out, null, 2));

const fail =
  !pet.ok ||
  pet.hint !== "E 쓰다듬기" ||
  !pet.active ||
  !pet.cooldown ||
  pet.kind !== "mascot_pet_start" ||
  !pet.lastPetAt ||
  pet.hearts < 6 ||
  pet.hearts > 10 ||
  !pet.petting ||
  !String(cooldownHint || "").includes("쿨다운") ||
  petOff.hint === "E 쓰다듬기" ||
  petOff.flag !== false ||
  noCat.mascot ||
  noCat.enabled ||
  errors.length;

await browser.close().catch(() => {});
process.exit(fail ? 1 : 0);
