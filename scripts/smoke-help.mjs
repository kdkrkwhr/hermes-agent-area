/** Smoke: help overlay `?`/`/` toggle; `?help=0` disables. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.env.SMOKE_URL || "http://127.0.0.1:5173/hermes-agent-area";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-help";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

// clear first-visit flag so hint path is deterministic
await page.addInitScript(() => {
  try {
    localStorage.setItem("hermes-area-help-seen", "1");
  } catch {
    /* ignore */
  }
});

await page.goto(`${base}/?events=0&sfx=0`, {
  waitUntil: "networkidle",
  timeout: 30000,
});
await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
  timeout: 15000,
});
await page.waitForTimeout(400);

const before = await page.evaluate(() => window.__HERMES_AREA__?.help);

// `/` opens
await page.keyboard.press("Slash");
await page.waitForTimeout(150);
const afterSlash = await page.evaluate(() => {
  const a = window.__HERMES_AREA__;
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  sc?.publishDebug?.(sc.ws?.url ?? "smoke", sc.lastSnapshot);
  return {
    help: window.__HERMES_AREA__?.help,
    panelHidden: document.querySelector(".help-overlay")?.hidden ?? null,
    hasOn: document.querySelector(".help-overlay")?.classList?.contains("is-on") ?? null,
  };
});
await page.screenshot({ path: `${shotDir}/help-open.png`, fullPage: true });

// `?` closes (Shift+Slash)
await page.keyboard.press("Shift+Slash");
await page.waitForTimeout(150);
const afterQuestion = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  sc?.publishDebug?.(sc.ws?.url ?? "smoke", sc.lastSnapshot);
  return {
    help: window.__HERMES_AREA__?.help,
    panelHidden: document.querySelector(".help-overlay")?.hidden ?? null,
  };
});
await page.screenshot({ path: `${shotDir}/help-closed.png`, fullPage: true });

// `?help=0`
await page.goto(`${base}/?help=0&events=0&sfx=0`, {
  waitUntil: "networkidle",
  timeout: 30000,
});
await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
  timeout: 15000,
});
await page.waitForTimeout(400);
await page.keyboard.press("Slash");
await page.waitForTimeout(150);
const off = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  sc?.publishDebug?.(sc.ws?.url ?? "smoke", sc.lastSnapshot);
  return {
    help: window.__HERMES_AREA__?.help,
    panel: document.querySelector(".help-overlay"),
  };
});
await page.screenshot({ path: `${shotDir}/help-off.png`, fullPage: true });

const fatal = errors.filter((e) => !/Framebuffer|WebGL/i.test(e));

const toggleOk =
  before?.enabled === true &&
  before?.open === false &&
  afterSlash?.help?.open === true &&
  afterSlash?.panelHidden === false &&
  afterSlash?.hasOn === true &&
  afterQuestion?.help?.open === false &&
  afterQuestion?.panelHidden === true;

const offOk =
  off?.help?.enabled === false &&
  off?.help?.open === false &&
  off?.panel == null;

const result = {
  before,
  afterSlash,
  afterQuestion,
  off,
  toggleOk,
  offOk,
  errors: fatal,
  ok: toggleOk && offOk && fatal.length === 0,
};

console.log(JSON.stringify(result, null, 2));
await browser.close();
if (!result.ok) {
  console.error("FAIL help smoke");
  process.exit(1);
}
console.log("PASS help smoke");
