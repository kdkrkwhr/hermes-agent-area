/**
 * Smoke: teleport boss into lobby -> clock-out modal -> confirm -> done flag.
 * Requires vite already on :5173 (same as smoke-boss).
 */
import { chromium } from "playwright";

const base = process.env.SMOKE_URL || "http://127.0.0.1:5173/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(base, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
  timeout: 15000,
});
await page.waitForTimeout(800);

await page.mouse.click(100, 100);

const entered = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  if (!sc?.boss?.sprite) return { ok: false, why: "no-boss" };
  sc.boss.sprite.x = 20 * 32 + 16;
  sc.boss.sprite.y = 27 * 32 + 16;
  sc._inLobby = false;
  sc._clockOutPending = false;
  sc._clockOutDone = false;
  sc.checkLobbyClockOut();
  return {
    ok: true,
    pending: !!sc._clockOutPending,
    locked: !!sc.clockOutLocked,
    modalHidden: document.querySelector(".clockout-modal")?.hidden === false,
  };
});

await page.waitForTimeout(200);

const afterCancel = await page.evaluate(() => {
  document.querySelector('.clockout-modal [data-role="no"]')?.click();
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  return {
    pending: !!sc?._clockOutPending,
    locked: !!sc?.clockOutLocked,
    done: !!sc?._clockOutDone,
  };
});

const reenter = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  sc.boss.sprite.x = 12 * 32 + 16;
  sc.boss.sprite.y = 24 * 32 + 16;
  sc.checkLobbyClockOut();
  sc.boss.sprite.x = 20 * 32 + 16;
  sc.boss.sprite.y = 27 * 32 + 16;
  sc.checkLobbyClockOut();
  return {
    pending: !!sc._clockOutPending,
    modalOpen: document.querySelector(".clockout-modal")?.hidden === false,
  };
});

await page.waitForTimeout(100);
await page.click('.clockout-modal [data-role="yes"]');
await page.waitForTimeout(300);

const confirmed = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const fade = document.querySelector(".clockout-fade");
  return {
    done: !!sc?._clockOutDone,
    fadeOn: fade?.classList?.contains("is-on") === true,
    clockOut: window.__HERMES_AREA__?.clockOut,
  };
});

const fatal = errors.filter((e) => !/Framebuffer|WebGL/i.test(e));
const result = {
  entered,
  afterCancel,
  reenter,
  confirmed,
  errors: fatal,
  ok:
    entered.ok &&
    entered.pending === true &&
    entered.modalHidden === true &&
    afterCancel.pending === false &&
    afterCancel.done === false &&
    reenter.pending === true &&
    confirmed.done === true &&
    confirmed.fadeOn === true &&
    fatal.length === 0,
};

console.log(JSON.stringify(result, null, 2));
await browser.close();
if (!result.ok) process.exit(1);