import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});

await page.goto("http://127.0.0.1:5173/hermes-agent-area/", {
  waitUntil: "networkidle",
  timeout: 30000,
});

await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
  timeout: 15000,
});
await page.waitForTimeout(800);

// dismiss clock-out if any
await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  if (sc?._clockOutPending) sc.cancelClockOut?.();
  document.querySelector('.clockout-modal [data-role="no"]')?.click();
});

const mapCheck = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const wp = sc?.waypoints || {};
  const ground = sc?.ground;
  const furn = sc?.furniture;
  const ceo = wp.ceoDesk;
  const floorAt = (x, y) => ground?.getTileAt(x, y)?.index ?? 0;
  const furnAt = (x, y) => furn?.getTileAt(x, y)?.index ?? 0;
  return {
    hasCeoDesk: !!ceo,
    ceoDesk: ceo,
    lounge0: wp.lounge?.[0],
    labelCeo: [...(sc?.children?.list || [])]
      .filter((o) => o?.text === "사장실")
      .map((o) => o.text),
    floorMahogany: floorAt(30, 5),
    deskGid: furnAt(30, 4),
    chairGid: furnAt(30, 6),
  };
});

// teleport boss to CEO desk and open panel
await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const desk = sc?.waypoints?.ceoDesk || { x: 30, y: 7 };
  sc.boss.sprite.setPosition(desk.x * 32 + 16, desk.y * 32 + 16);
  sc.boss.updateProximity();
  sc.refreshInteractHud?.();
  sc.publishDebug(sc.ws?.url ?? "smoke", sc.lastSnapshot);
});

await page.waitForFunction(() => window.__HERMES_AREA__?.nearCeoDesk === true, null, {
  timeout: 3000,
});

await page.keyboard.press("KeyE");
await page.waitForFunction(
  () => window.__HERMES_AREA__?.deskBriefOpen === true,
  null,
  { timeout: 5000 },
);

await page.waitForFunction(
  () => !!window.__HERMES_AREA__?.deskBrief?.source,
  null,
  { timeout: 8000 },
);

const openState = await page.evaluate(() => ({
  nearCeoDesk: window.__HERMES_AREA__?.nearCeoDesk,
  deskBriefOpen: window.__HERMES_AREA__?.deskBriefOpen,
  deskBrief: window.__HERMES_AREA__?.deskBrief,
  panelHidden: document.querySelector(".desk-brief")?.hidden,
  weatherText: document.querySelector(".desk-brief__weather-main")?.textContent || "",
  newsCount: document.querySelectorAll(".desk-brief__list li").length,
}));

// E again closes
await page.keyboard.press("KeyE");
await page.waitForTimeout(300);
const closed = await page.evaluate(() => ({
  deskBriefOpen: window.__HERMES_AREA__?.deskBriefOpen,
  panelHidden: document.querySelector(".desk-brief")?.hidden,
}));

const fatal = errors.filter((e) => !/Framebuffer|WebGL|CORS|Failed to fetch/i.test(e));
const ok =
  mapCheck.hasCeoDesk &&
  mapCheck.labelCeo.includes("사장실") &&
  mapCheck.floorMahogany === 30 &&
  mapCheck.deskGid === 31 &&
  openState.nearCeoDesk === true &&
  openState.deskBriefOpen === true &&
  !!openState.deskBrief?.source &&
  openState.weatherText.length > 0 &&
  closed.deskBriefOpen === false &&
  fatal.length === 0;

const result = { ok, mapCheck, openState, closed, errors: fatal };
console.log(JSON.stringify(result, null, 2));
await browser.close();
process.exit(ok ? 0 : 1);
