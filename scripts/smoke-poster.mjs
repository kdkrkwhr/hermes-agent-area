/** Smoke: lobby poster GID19 glitter + E-quote toast. `?poster=0` off. */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "smoke-poster");
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
    return !!(sc?.boss?.sprite && sc?.roomInteract?.posterTiles?.length);
  }, null, { timeout: 20000 });
  await page.waitForTimeout(400);
  await page.mouse.click(80, 80);
  await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    if (sc?._clockOutPending) sc.cancelClockOut?.();
    document.querySelector('.clockout-modal [data-role="no"]')?.click();
  });
  await page.waitForTimeout(200);
  return page;
}

const page = await boot(`${base}?events=0&sfx=0`);

const fx = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const lp = sc?.lobbyPoster;
  if (!lp) return { ok: false, why: "no-lobbyPoster" };
  const a = lp.snapshot();
  const p0 = lp.phases?.[0] ?? 0;
  lp.update(sc.time.now, 900);
  const b = lp.snapshot();
  const phaseMoved = Math.abs((b.phases?.[0] ?? 0) - p0) > 0.02;
  return {
    ok:
      a.enabled === true &&
      b.active === true &&
      a.posterGid === 19 &&
      (a.posterCount ?? 0) >= 2 &&
      phaseMoved,
    phaseMoved,
    a,
    b,
  };
});

const quote = await page.evaluate(async () => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const poster = sc?.roomInteract?.posterTiles?.[0];
  if (!poster || !sc?.boss?.sprite) return { ok: false, why: "no-poster" };
  sc.roomInteract.aquariumFeedEnabled = false;
  sc.roomInteract.mascotPetEnabled = false;
  sc.roomInteract.plantWaterEnabled = false;
  sc.roomInteract.vendingEnabled = false;
  sc.roomInteract._lobbyWelcomed = true;
  if (sc.mascot?.sprite) {
    sc.mascot.sprite.setPosition(poster.x + 400, poster.y + 400);
  }
  sc.boss.sprite.setPosition(poster.x + 10, poster.y + 14);
  sc.refreshInteractHud?.();
  const hint = sc.roomInteract.hintLabel();
  sc.roomInteract.tryInteract();
  await new Promise((r) => setTimeout(r, 200));
  const snap = window.__HERMES_AREA__?.posterQuote;
  const ri = window.__HERMES_AREA__?.roomInteract;
  return {
    ok: true,
    hint,
    enabled: !!snap?.enabled,
    cooldown: !!snap?.cooldown,
    lastQuote: snap?.lastQuote ?? null,
    lastPosterAt: snap?.lastPosterAt ?? null,
    posterCount: snap?.posterCount ?? 0,
    toastOn: !!document.querySelector(".room-toast.is-on"),
    toastText: document.querySelector(".room-toast")?.textContent ?? null,
  };
});

await page.screenshot({ path: path.join(outDir, "poster-on.png"), fullPage: false });
await page.close();

const pageOff = await boot(`${base}?poster=0&events=0&sfx=0`);
const off = await pageOff.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const poster = sc?.roomInteract?.posterTiles?.[0];
  const lp = sc?.lobbyPoster?.snapshot?.();
  if (!poster || !sc?.boss?.sprite) return { ok: false, why: "no-poster" };
  sc.roomInteract.plantWaterEnabled = false;
  sc.boss.sprite.setPosition(poster.x + 10, poster.y + 14);
  sc.refreshInteractHud?.();
  return {
    ok: true,
    hint: sc.roomInteract.hintLabel(),
    fxEnabled: lp?.enabled,
    interactEnabled: sc.roomInteract.posterEnabled,
    fxActive: lp?.active,
  };
});
await pageOff.screenshot({ path: path.join(outDir, "poster-off.png"), fullPage: false });
await pageOff.close();

const out = { fx, quote, off, errors };
console.log(JSON.stringify(out, null, 2));

const fail =
  !fx.ok ||
  !quote.ok ||
  quote.hint !== "E 한마디" ||
  !quote.cooldown ||
  !quote.lastQuote ||
  !quote.lastPosterAt ||
  quote.posterCount < 2 ||
  !quote.toastOn ||
  quote.toastText !== quote.lastQuote ||
  off.hint === "E 한마디" ||
  off.fxEnabled !== false ||
  off.interactEnabled !== false ||
  off.fxActive !== false ||
  errors.length;

await browser.close().catch(() => {});
process.exit(fail ? 1 : 0);
