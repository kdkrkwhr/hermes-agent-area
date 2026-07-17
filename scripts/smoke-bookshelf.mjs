/** Smoke: CEO bookshelf page FX + E Hermes tip — ?bookshelf=0 off, ?bookshelf=force. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-bookshelf";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];

async function boot(page, qs) {
  const root = base.replace(/\/?$/, "/");
  await page.goto(`${root}?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  await page.waitForFunction(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    return !!(sc?.boss?.sprite && sc?.roomInteract?.bookshelfTiles?.length);
  }, null, { timeout: 20000 });
  await page.waitForTimeout(400);
  await page.mouse.click(80, 80);
  await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    if (sc?._clockOutPending) sc.cancelClockOut?.();
    document.querySelector('.clockout-modal [data-role="no"]')?.click();
  });
  await page.waitForTimeout(200);
}

async function checkFx(label, qs, { expectEnabled, expectBurst }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  await boot(page, qs);

  const setup = await page.evaluate((doBurst) => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const shelf = sc?.roomInteract?.bookshelfTiles?.[0];
    if (!shelf || !sc?.boss?.sprite) return { ok: false, reason: "no-shelf" };
    sc.roomInteract.aquariumFeedEnabled = false;
    sc.roomInteract.mascotPetEnabled = false;
    sc.roomInteract.posterEnabled = false;
    sc.boss.sprite.setPosition(shelf.x + 10, shelf.y + 20);
    if (doBurst) {
      for (let i = 0; i < 8; i++) {
        sc.bookshelfPages?.update?.(sc.time.now + i * 200, 200);
      }
      sc.bookshelfPages?.triggerPageTurn?.();
    }
    return {
      ok: true,
      shelfCount: sc.roomInteract.bookshelfTiles.length,
      pageCount: sc.bookshelfPages?.pageCount ?? 0,
    };
  }, expectBurst);

  await page.waitForTimeout(expectBurst ? 500 : 300);
  const bookshelf = await page.evaluate(() => window.__HERMES_AREA__?.bookshelf);
  const pageCount = Math.max(bookshelf?.pageCount ?? 0, setup?.pageCount ?? 0);
  const ok =
    !!bookshelf &&
    bookshelf.enabled === expectEnabled &&
    (expectEnabled ? bookshelf.shelfCount >= 1 : bookshelf.shelfCount === 0) &&
    (!expectBurst || pageCount >= 1);

  const shot = `${shotDir}/${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(JSON.stringify({ label, ok, setup, bookshelf, expectEnabled, expectBurst, shot }));
  await page.close();
  if (!ok) process.exitCode = 1;
  return ok;
}

async function checkTip() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  await boot(page, "tod=day&events=0&sfx=0");

  const tip = await page.evaluate(async () => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const shelf = sc?.roomInteract?.bookshelfTiles?.[0];
    if (!shelf || !sc?.boss?.sprite) return { ok: false, why: "no-shelf" };
    sc.roomInteract.aquariumFeedEnabled = false;
    sc.roomInteract.mascotPetEnabled = false;
    sc.roomInteract.posterEnabled = false;
    sc.boss.sprite.setPosition(shelf.x + 10, shelf.y + 18);
    sc.refreshInteractHud?.();
    const hint = sc.roomInteract.hintLabel();
    sc.roomInteract.tryInteract();
    await new Promise((r) => setTimeout(r, 200));
    const snap = window.__HERMES_AREA__?.bookshelfTip;
    const ri = window.__HERMES_AREA__?.roomInteract;
    const fx = window.__HERMES_AREA__?.bookshelf;
    return {
      ok: true,
      hint,
      enabled: !!snap?.enabled,
      active: !!snap?.active,
      cooldown: !!snap?.cooldown,
      lastBookshelfAt: snap?.lastBookshelfAt ?? null,
      shelfCount: snap?.shelfCount ?? 0,
      kind: ri?.lastAction?.kind ?? null,
      lastTip: snap?.lastTip ?? null,
      pageCount: fx?.pageCount ?? 0,
    };
  });

  await page.screenshot({ path: `${shotDir}/tip-on.png`, fullPage: false });
  await page.close();

  const ok =
    tip.ok &&
    tip.hint === "E Hermes 팁" &&
    tip.active &&
    tip.cooldown &&
    tip.kind === "bookshelf_tip_start" &&
    tip.lastBookshelfAt &&
    tip.shelfCount >= 1 &&
    !!tip.lastTip &&
    tip.pageCount >= 1;

  console.log(JSON.stringify({ label: "tip", ok, tip }));
  if (!ok) process.exitCode = 1;
  return ok;
}

await checkFx("force-burst", "tod=day&events=0&sfx=0&bookshelf=force", {
  expectEnabled: true,
  expectBurst: true,
});
await checkFx("night-on", "tod=night&events=0&sfx=0&bookshelf=force", {
  expectEnabled: true,
  expectBurst: true,
});
await checkFx("bookshelf-off", "tod=day&bookshelf=0&events=0&sfx=0", {
  expectEnabled: false,
  expectBurst: false,
});
await checkTip();

await browser.close();
if (errors.length) {
  console.error("pageerrors", errors);
  process.exitCode = 1;
}
if (process.exitCode) {
  console.error("FAIL bookshelf smoke");
  process.exit(1);
}
console.log("PASS bookshelf smoke");
