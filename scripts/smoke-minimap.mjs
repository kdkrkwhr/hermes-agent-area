/** Smoke: minimap click pans camera; ?minimap=0 disables; follow→overview sync. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.env.SMOKE_URL || "http://127.0.0.1:5173";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-minimap";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`${base}/?events=0&sfx=0`, {
  waitUntil: "networkidle",
  timeout: 30000,
});
await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
  timeout: 15000,
});
await page.waitForTimeout(600);

const before = await page.evaluate(() => {
  const a = window.__HERMES_AREA__;
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  return {
    follow: a?.cameraFollow,
    freePan: a?.cameraFreePan,
    zoom: a?.cameraZoom,
    center: a?.cameraCenter,
    minimap: a?.minimap,
    mapW: sc?.map?.widthInPixels,
    mapH: sc?.map?.heightInPixels,
  };
});

// overview + click top-left corner of minimap (~10%)
const panTopLeft = await page.evaluate(async () => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const mm = sc?.minimap;
  if (!mm?.root || !mm.enabled) return { ok: false, reason: "no minimap" };
  const lx = mm.miniW * 0.1;
  const ly = mm.miniH * 0.1;
  mm.onClick(lx, ly);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  sc.publishDebug?.(sc.ws?.url ?? "smoke", sc.lastSnapshot);
  const a = window.__HERMES_AREA__;
  return {
    ok: true,
    follow: a?.cameraFollow,
    freePan: a?.cameraFreePan,
    zoom: a?.cameraZoom,
    center: a?.cameraCenter,
    scroll: a?.cameraScroll,
    hudFollow:
      typeof document !== "undefined"
        ? document.querySelector('[data-role="toggle-follow"]')?.getAttribute(
            "aria-pressed",
          )
        : null,
  };
});

await page.screenshot({ path: `${shotDir}/pan-top-left.png`, fullPage: true });

// enter follow, then click bottom-right → must drop follow + pan
await page.keyboard.press("KeyF");
await page.waitForTimeout(200);
const followOn = await page.evaluate(() => ({
  follow: window.__HERMES_AREA__?.cameraFollow,
  zoom: window.__HERMES_AREA__?.cameraZoom,
}));

const panFromFollow = await page.evaluate(async () => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const mm = sc?.minimap;
  const lx = mm.miniW * 0.9;
  const ly = mm.miniH * 0.9;
  mm.onClick(lx, ly);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  sc.publishDebug?.(sc.ws?.url ?? "smoke", sc.lastSnapshot);
  const a = window.__HERMES_AREA__;
  const btn = document.querySelector('[data-role="toggle-follow"]');
  return {
    follow: a?.cameraFollow,
    freePan: a?.cameraFreePan,
    zoom: a?.cameraZoom,
    center: a?.cameraCenter,
    ariaPressed: btn?.getAttribute("aria-pressed"),
    btnText: btn?.textContent,
  };
});

await page.screenshot({ path: `${shotDir}/pan-from-follow.png`, fullPage: true });

// ?minimap=0
await page.goto(`${base}/?minimap=0&events=0&sfx=0`, {
  waitUntil: "networkidle",
  timeout: 30000,
});
await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
  timeout: 15000,
});
await page.waitForTimeout(400);
const off = await page.evaluate(() => window.__HERMES_AREA__?.minimap);
await page.screenshot({ path: `${shotDir}/minimap-off.png`, fullPage: true });

const fatal = errors.filter((e) => !/Framebuffer|WebGL/i.test(e));
const mapW = before.mapW || 1;
const mapH = before.mapH || 1;
const tl = panTopLeft.center || { x: 0, y: 0 };
const br = panFromFollow.center || { x: 0, y: 0 };

const panTopLeftOk =
  panTopLeft.ok &&
  panTopLeft.follow === false &&
  panTopLeft.freePan === true &&
  panTopLeft.zoom === 2 &&
  tl.x < mapW * 0.35 &&
  tl.y < mapH * 0.35;

const panFromFollowOk =
  followOn.follow === true &&
  panFromFollow.follow === false &&
  panFromFollow.freePan === true &&
  panFromFollow.zoom === 2 &&
  panFromFollow.ariaPressed === "false" &&
  br.x > mapW * 0.55 &&
  br.y > mapH * 0.55;

const offOk = off && off.enabled === false;

const result = {
  before,
  panTopLeft,
  followOn,
  panFromFollow,
  off,
  panTopLeftOk,
  panFromFollowOk,
  offOk,
  errors: fatal,
  ok: panTopLeftOk && panFromFollowOk && offOk && fatal.length === 0,
};

console.log(JSON.stringify(result, null, 2));
await browser.close();
if (!result.ok) {
  console.error("FAIL minimap smoke");
  process.exit(1);
}
console.log("PASS minimap smoke");
