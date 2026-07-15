/** Smoke: kanban locate → camera pan; ?locate=0 no-op; missing → toast. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.env.SMOKE_URL || "http://127.0.0.1:5173";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-locate";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`${base}/?events=0&sfx=0&ws=ws://127.0.0.1:9/ws`, {
  waitUntil: "networkidle",
  timeout: 30000,
});
await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
  timeout: 15000,
});
await page.waitForFunction(
  () => window.__HERMES_AREA__?.kanbanPanel?.agentCount === 3,
  null,
  { timeout: 12000 },
);
await page.waitForTimeout(400);

const before = await page.evaluate(() => {
  const a = window.__HERMES_AREA__;
  return {
    follow: a?.cameraFollow,
    freePan: a?.cameraFreePan,
    zoom: a?.cameraZoom,
    center: a?.cameraCenter,
    locateEnabled: a?.locateEnabled,
  };
});

// select default → locate button
await page.evaluate(() => {
  document.querySelector(".kanban-panel__row[data-agent-id='default']")?.click();
});
await page.waitForFunction(
  () => window.__HERMES_AREA__?.kanbanPanel?.selectedId === "default",
  null,
  { timeout: 5000 },
);

const locateBtn = await page.evaluate(async () => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const agent = sc?.agentsById?.default;
  const target = agent
    ? { x: Math.round(agent.sprite.x), y: Math.round(agent.sprite.y) }
    : null;
  const btn = document.querySelector('[data-role="locate"]');
  btn?.click();
  await new Promise((r) => setTimeout(r, 500));
  if (typeof sc?.cameras?.main?.preRender === "function") {
    sc.cameras.main.preRender(1);
  }
  sc?.publishDebug?.(sc.ws?.url ?? "smoke", sc.lastSnapshot);
  const a = window.__HERMES_AREA__;
  // re-run locate for expected clamped midPoint (edge agents get clamped)
  const expected = sc?.locateAgent
    ? (() => {
        // don't re-pan; derive clamp from current zoom/viewport
        const cam = sc.cameras.main;
        const mapW = sc.map.widthInPixels;
        const mapH = sc.map.heightInPixels;
        const halfW = cam.width / (2 * cam.zoomX);
        const halfH = cam.height / (2 * cam.zoomY);
        const cx = Math.min(
          Math.max(target.x, halfW),
          Math.max(halfW, mapW - halfW),
        );
        const cy = Math.min(
          Math.max(target.y, halfH),
          Math.max(halfH, mapH - halfH),
        );
        return { x: Math.round(cx), y: Math.round(cy) };
      })()
    : null;
  return {
    btnPresent: !!btn,
    target,
    expected,
    follow: a?.cameraFollow,
    freePan: a?.cameraFreePan,
    zoom: a?.cameraZoom,
    center: a?.cameraCenter,
  };
});

await page.screenshot({ path: `${shotDir}/locate-onion.png`, fullPage: true });

// follow on → locate again drops follow
await page.keyboard.press("KeyF");
await page.waitForTimeout(200);
const followOn = await page.evaluate(() => window.__HERMES_AREA__?.cameraFollow);

const fromFollow = await page.evaluate(async () => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const agent = sc?.agentsById?.["profile-2"];
  const target = agent
    ? { x: Math.round(agent.sprite.x), y: Math.round(agent.sprite.y) }
    : null;
  const r = sc?.locateAgent?.("profile-2");
  await new Promise((res) => setTimeout(res, 500));
  if (typeof sc?.cameras?.main?.preRender === "function") {
    sc.cameras.main.preRender(1);
  }
  sc?.publishDebug?.(sc.ws?.url ?? "smoke", sc.lastSnapshot);
  const a = window.__HERMES_AREA__;
  return {
    result: r,
    target,
    expected: r?.ok ? { x: Math.round(r.x), y: Math.round(r.y) } : null,
    follow: a?.cameraFollow,
    freePan: a?.cameraFreePan,
    zoom: a?.cameraZoom,
    center: a?.cameraCenter,
    ariaPressed: document
      .querySelector('[data-role="toggle-follow"]')
      ?.getAttribute("aria-pressed"),
  };
});

await page.screenshot({ path: `${shotDir}/locate-from-follow.png`, fullPage: true });

// missing agent → toast
const missing = await page.evaluate(async () => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const r = sc?.locateAgent?.("no-such-agent");
  await new Promise((res) => setTimeout(res, 100));
  const toast = document.getElementById("office-toast");
  return {
    result: r,
    toastText: toast?.textContent ?? null,
    toastVisible: toast?.classList.contains("is-visible") ?? false,
  };
});

// ?locate=0
await page.goto(`${base}/?locate=0&events=0&sfx=0&ws=ws://127.0.0.1:9/ws`, {
  waitUntil: "networkidle",
  timeout: 30000,
});
await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
  timeout: 15000,
});
await page.waitForTimeout(400);

const off = await page.evaluate(async () => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const beforeCenter = {
    x: Math.round(sc.cameras.main.midPoint?.x ?? 0),
    y: Math.round(sc.cameras.main.midPoint?.y ?? 0),
  };
  const r = sc?.locateAgent?.("default");
  await new Promise((res) => setTimeout(res, 450));
  sc?.publishDebug?.(sc.ws?.url ?? "smoke", sc.lastSnapshot);
  const a = window.__HERMES_AREA__;
  return {
    locateEnabled: a?.locateEnabled,
    result: r,
    beforeCenter,
    center: a?.cameraCenter,
    freePan: a?.cameraFreePan,
  };
});

await page.screenshot({ path: `${shotDir}/locate-off.png`, fullPage: true });

const fatal = errors.filter((e) => !/Framebuffer|WebGL|WebSocket connection/i.test(e));

function near(a, b, tol = 48) {
  if (!a || !b) return false;
  return Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;
}

const locateBtnOk =
  locateBtn.btnPresent &&
  locateBtn.follow === false &&
  locateBtn.freePan === true &&
  locateBtn.zoom === 2 &&
  near(locateBtn.center, locateBtn.expected);

const fromFollowOk =
  followOn === true &&
  fromFollow.follow === false &&
  fromFollow.freePan === true &&
  fromFollow.zoom === 2 &&
  fromFollow.ariaPressed === "false" &&
  near(fromFollow.center, fromFollow.expected);

const missingOk =
  missing.result?.ok === false &&
  missing.result?.reason === "missing" &&
  missing.toastVisible &&
  /오프라인|미접속/.test(missing.toastText || "");

const offOk =
  off.result?.reason === "locate-off" &&
  near(off.center, off.beforeCenter, 8) &&
  off.freePan !== true;

const result = {
  before,
  locateBtn,
  followOn,
  fromFollow,
  missing,
  off,
  locateBtnOk,
  fromFollowOk,
  missingOk,
  offOk,
  errors: fatal,
  ok:
    locateBtnOk &&
    fromFollowOk &&
    missingOk &&
    offOk &&
    fatal.length === 0,
};

console.log(JSON.stringify(result, null, 2));
await browser.close();
if (!result.ok) {
  console.error("FAIL locate smoke");
  process.exit(1);
}
console.log("PASS locate smoke");
