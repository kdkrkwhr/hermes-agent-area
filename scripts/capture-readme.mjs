/**
 * Capture README screenshots → public/assets/screenshots/
 * Requires vite on :5173 (npm run dev or npm run preview -- --port 5173)
 *
 * Shots:
 *  01-office-full, 02-ceo-desk-panel, 03-lounge-minigame, 04-war-room
 *  05-agent-bubbles, 06-weather-effects, 07-minimap, 08-cat-mascot
 *  09-clockout, 10-kanban-panel, 11-help-overlay, 12-night-mode
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "assets", "screenshots");
mkdirSync(outDir, { recursive: true });

const base = process.env.SMOKE_URL || "http://127.0.0.1:5173/hermes-agent-area/";
const withQs = (qs) => {
  const u = new URL(base);
  for (const [k, v] of Object.entries(qs)) u.searchParams.set(k, v);
  return u.toString();
};

const browser = await chromium.launch({ headless: true });
const errors = [];

async function openPage(url = base) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 20000,
  });
  await page.waitForTimeout(800);
  await page.mouse.click(100, 100);
  await dismissModals(page);
  return page;
}

async function dismissModals(page) {
  await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    if (sc?._clockOutPending) sc.cancelClockOut?.();
    document.querySelector('.clockout-modal [data-role="no"]')?.click();
    document.querySelector('.mg2048 [data-role="close"]')?.click();
    sc?.deskBriefPanel?.hide?.();
    sc?.roomInteract?.nap?.close?.();
    sc?.helpOverlay?.setOpen?.(false);
  });
  await page.waitForTimeout(200);
}

async function shot(page, name) {
  await page.screenshot({ path: join(outDir, name), type: "png" });
}

let page = await openPage();

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
await shot(page, "01-office-full.png");

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
await shot(page, "02-ceo-desk-panel.png");
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
await shot(page, "03-lounge-minigame.png");

// 4) war room / meeting area
await dismissModals(page);
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
await shot(page, "04-war-room.png");

// 5) agent bubbles — mock WS so live ticks don't clobber flavor text
await page.close();
page = await openPage(withQs({ ws: "ws://127.0.0.1:9/ws" }));
await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const desk = sc?.waypoints?.desk || { x: 8, y: 8 };
  sc.cameras.main.setZoom(1.35);
  sc.cameras.main.centerOn(desk.x * 32 + 40, desk.y * 32 + 20);
  (sc.agents || []).slice(0, 3).forEach((a, i) => {
    a.path = [];
    a.pathIndex = 0;
    a.currentKind = "desk";
    a.serverStatus = "running";
    a.live = false;
    a._expandTimer = null;
    a.sprite.setPosition(desk.x * 32 + 16 + i * 52, desk.y * 32 + 16);
    a.setStatus?.(
      i === 0 ? "칸반 태스크 처리 중…" : i === 1 ? "타이핑 중 ▌" : "배포 확인 중",
    );
  });
});
await page.waitForTimeout(700);
await shot(page, "05-agent-bubbles.png");

// 6) weather — force rain via query
await page.close();
page = await openPage(withQs({ rain: "1" }));
await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  // north windows — rain streaks most visible
  sc.cameras.main.setZoom(1.4);
  sc.cameras.main.centerOn(18 * 32, 5 * 32);
  sc.windowRain?.setWeatherForceOn?.(true);
  sc.windowRain?.sync?.();
  sc.weatherFx?.applyWeather?.({
    summary: "비 오는 날",
    sky: "흐림",
    precip: "비",
    periods: [{ time: "0:00", sky: "흐림", pty: "비", pop: 95 }],
  });
});
await page.waitForTimeout(1200);
await shot(page, "06-weather-effects.png");

// 7) minimap — zoom mid, agents spread
await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  sc.cameras.main.setZoom(1.0);
  sc.cameras.main.centerOn(16 * 32, 14 * 32);
  (sc.agents || []).forEach((a, i) => {
    a.sprite.setPosition((8 + i * 6) * 32 + 16, (10 + (i % 2) * 4) * 32 + 16);
  });
});
await page.waitForTimeout(400);
await shot(page, "07-minimap.png");

// 8) cat mascot in lounge
await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const br = sc?.waypoints?.break || { x: 18, y: 16 };
  const m = sc?.mascot;
  if (m?.sprite) {
    m.path = [];
    m.pathIndex = 0;
    m.idleUntil = sc.time.now + 60000;
    m.sprite.setPosition(br.x * 32 + 16, br.y * 32 + 16);
    m.sprite.setVisible(true);
    m.sprite.setAlpha(1);
  }
  sc.boss.sprite.setPosition(br.x * 32 + 40, br.y * 32 + 24);
  sc.cameras.main.setZoom(1.5);
  sc.cameras.main.centerOn(br.x * 32, br.y * 32);
});
await page.waitForTimeout(500);
await shot(page, "08-cat-mascot.png");

// 9) clock-out modal in lobby
await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  sc._clockOutDone = false;
  sc._clockOutPending = false;
  sc.boss.sprite.setPosition(20 * 32 + 16, 27 * 32 + 16);
  sc.cameras.main.setZoom(1.0);
  sc.cameras.main.centerOn(20 * 32, 26 * 32);
  sc._inLobby = false;
  sc.checkLobbyClockOut?.();
  if (!sc._clockOutPending) sc.openClockOutModal?.();
});
await page.waitForTimeout(400);
await shot(page, "09-clockout.png");
await dismissModals(page);

// 10) kanban panel
await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  sc.cameras.main.setZoom(0.9);
  sc.cameras.main.centerOn(14 * 32, 12 * 32);
  document.querySelector(".kanban-panel__row[data-agent-id]")?.click();
});
await page.waitForTimeout(500);
await shot(page, "10-kanban-panel.png");

// 11) help overlay
await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  sc.cameras.main.setZoom(0.7);
  sc.cameras.main.centerOn(20 * 32, 14 * 32);
  sc.helpOverlay?.setOpen?.(true);
});
await page.waitForTimeout(300);
await shot(page, "11-help-overlay.png");

// 12) night mode — dedicated load with ?tod=night
await page.close();
page = await openPage(withQs({ tod: "night" }));
await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  sc.devTimeIndex = 3;
  sc.applyTimeOfDayLighting?.();
  // desk lamps visible near open desk / focus
  sc.cameras.main.setZoom(1.15);
  sc.cameras.main.centerOn(12 * 32, 10 * 32);
  sc.lampGlow?.sync?.();
  sc.lampMoths?.sync?.();
  sc.cityLights?.sync?.();
});
await page.waitForTimeout(900);
await shot(page, "12-night-mode.png");

await page.close();
await browser.close();

const files = [
  "01-office-full.png",
  "02-ceo-desk-panel.png",
  "03-lounge-minigame.png",
  "04-war-room.png",
  "05-agent-bubbles.png",
  "06-weather-effects.png",
  "07-minimap.png",
  "08-cat-mascot.png",
  "09-clockout.png",
  "10-kanban-panel.png",
  "11-help-overlay.png",
  "12-night-mode.png",
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
