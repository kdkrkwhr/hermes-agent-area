/**
 * Capture README screenshots → public/assets/screenshots/
 * Requires vite on :5173 (npm run dev or npm run preview -- --port 5173)
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "assets", "screenshots");
mkdirSync(outDir, { recursive: true });

const base = process.env.SMOKE_URL || "http://127.0.0.1:5173/hermes-agent-area/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function dismissModals() {
  await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    if (sc?._clockOutPending) sc.cancelClockOut?.();
    document.querySelector('.clockout-modal [data-role="no"]')?.click();
    document.querySelector('.mg2048 [data-role="close"]')?.click();
    sc?.deskBriefPanel?.hide?.();
    sc?.roomInteract?.nap?.close?.();
  });
  await page.waitForTimeout(200);
}

async function waitReady() {
  await page.goto(base, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 20000,
  });
  await page.waitForTimeout(800);
  await page.mouse.click(100, 100);
  await dismissModals();
}

function shot(name) {
  return page.screenshot({
    path: join(outDir, name),
    type: "png",
  });
}

await waitReady();

// 1) full office overview
await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const cam = sc?.cameras?.main;
  if (cam) {
    cam.setZoom(0.55);
    cam.centerOn(20 * 32, 14 * 32);
  }
  window.__HERMES_AREA__ = {
    ...(window.__HERMES_AREA__ || {}),
    cameraFollow: false,
  };
});
await page.waitForTimeout(600);
await shot("01-office-full.png");

// 2) CEO desk + desk brief panel
await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const desk = sc?.waypoints?.ceoDesk || { x: 30, y: 7 };
  sc.boss.sprite.setPosition(desk.x * 32 + 16, desk.y * 32 + 16);
  sc.cameras.main.setZoom(1.1);
  sc.cameras.main.centerOn(desk.x * 32, desk.y * 32);
  sc.refreshInteractHud?.();
  if (!sc.deskBriefPanel?.open) sc.deskBriefPanel?.toggle?.();
});
await page.waitForTimeout(1500);
await shot("02-ceo-desk-panel.png");
await page.evaluate(() => {
  const p = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene")?.deskBriefPanel;
  if (p?.open) p.toggle?.();
});

// 3) lounge minigame 2048
await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const tile = sc?.roomInteract?.coffeeTiles?.[0];
  const br = sc?.waypoints?.break || { x: 18, y: 16 };
  if (tile) sc.boss.sprite.setPosition(tile.x, tile.y + 28);
  else sc.boss.sprite.setPosition(br.x * 32 + 16, br.y * 32 + 16);
  sc.cameras.main.setZoom(1.15);
  sc.cameras.main.centerOn(sc.boss.sprite.x, sc.boss.sprite.y);
  sc.refreshInteractHud?.();
  sc.roomInteract?.openMinigame?.();
});
await page.waitForTimeout(700);
const mgOpen = await page.evaluate(() => !!document.querySelector(".mg2048.is-open"));
await shot("03-lounge-minigame.png");

// 4) war room / meeting area
await dismissModals();
await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const meet = sc?.waypoints?.meeting || { x: 18, y: 9 };
  sc.boss.sprite.setPosition(meet.x * 32 + 16, (meet.y + 1) * 32 + 16);
  sc.cameras.main.setZoom(1.05);
  sc.cameras.main.centerOn(meet.x * 32, meet.y * 32);
  const agent = sc?.agents?.[0];
  if (agent) {
    agent.sprite.setPosition(meet.x * 32 + 16, meet.y * 32 + 16);
    agent.currentKind = "meeting";
  }
});
await page.waitForTimeout(500);
await shot("04-war-room.png");

await browser.close();

const files = [
  "01-office-full.png",
  "02-ceo-desk-panel.png",
  "03-lounge-minigame.png",
  "04-war-room.png",
];
console.log(
  JSON.stringify(
    {
      ok: errors.length === 0,
      outDir,
      files,
      errors: errors.slice(0, 8),
      mgOpen,
    },
    null,
    2,
  ),
);
