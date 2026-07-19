/** Smoke: lobby kanban wall TV signage — counts, news crawl, depth, ?signage=0. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-signage";
mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function waitReady(p) {
  await p.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 15000,
  });
}

const onUrl = `${base.replace(/\/?$/, "/")}?ws=ws://127.0.0.1:9/ws&events=0`;
await page.goto(onUrl, { waitUntil: "networkidle", timeout: 30000 });
await waitReady(page);
await page.waitForFunction(
  () => {
    const s = window.__HERMES_AREA__?.signage;
    return s?.enabled === true && s?.text && Number.isFinite(s.x);
  },
  null,
  { timeout: 12000 },
);

const on = await page.evaluate(() => {
  const area = window.__HERMES_AREA__;
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const sig = sc?.lobbySignage;
  return {
    signage: area?.signage,
    panelStats: area?.kanbanPanel?.stats,
    depth: sig?.tv?.depth ?? null,
    agentDepth: sc?.agents?.[0]?.sprite?.depth ?? 10,
    furnitureDepth: 0,
    hasTv: !!sig?.tv,
    hasLines: !!(sig?.line1 && sig?.line2),
    mode: sig?.mode ?? area?.signage?.mode ?? null,
    modes: sig?.modes ?? area?.signage?.modes ?? null,
  };
});

// inject news → modes must include news; force flip then screenshot
const news = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const sig = sc?.lobbySignage;
  if (!sig?.updateNews) return { ok: false, reason: "no-updateNews" };
  sig.updateNews({
    news: {
      markets: {
        kr: {
          items: [
            { title: "스모크 헤드라인 A — Hermes Area lobby crawl" },
            { title: "스모크 헤드라인 B — amber flip" },
          ],
        },
      },
    },
  });
  // force news mode for screenshot
  if (typeof sig.advanceMode === "function") {
    sig.mode = "kanban";
    sig.advanceMode();
  } else {
    sig.mode = "news";
    sig.applyMode?.(true);
  }
  const snap = sig.snapshot?.() ?? window.__HERMES_AREA__?.signage;
  return {
    ok: true,
    mode: snap?.mode,
    modes: snap?.modes,
    headlines: snap?.headlines,
    text: snap?.text,
    title: sig?.title?.text,
  };
});

await page
  .screenshot({ path: `${shotDir}/signage-news.png`, fullPage: false })
  .catch(() => {});
await page
  .screenshot({ path: `${shotDir}/signage.png`, fullPage: false })
  .catch(() => {});

const offUrl = `${base.replace(/\/?$/, "/")}?signage=0&ws=ws://127.0.0.1:9/ws&events=0`;
await page.goto(offUrl, { waitUntil: "networkidle", timeout: 30000 });
await waitReady(page);
await page.waitForFunction(
  () => window.__HERMES_AREA__?.signage?.enabled === false,
  null,
  { timeout: 10000 },
);
const off = await page.evaluate(() => ({
  signage: window.__HERMES_AREA__?.signage,
  hasTv: !!window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene")?.lobbySignage
    ?.tv,
}));

await browser.close();

const counts = on.signage?.counts || {};
const depthOk =
  on.depth != null &&
  on.depth > on.furnitureDepth &&
  on.depth < (on.agentDepth ?? 10);
const countsOk =
  Number.isFinite(counts.running) &&
  Number.isFinite(counts.blocked) &&
  Number.isFinite(counts.ready) &&
  Number.isFinite(counts.review) &&
  (counts.running >= 1 || counts.blocked >= 1 || counts.ready >= 1);
const newsOk =
  news?.ok === true &&
  Array.isArray(news?.modes) &&
  news.modes.includes("kanban") &&
  news.modes.includes("news") &&
  news.mode === "news" &&
  (news.headlines?.length ?? 0) >= 1 &&
  !!news.text;
const onOk =
  on.signage?.enabled === true &&
  on.hasTv &&
  on.hasLines &&
  !!on.signage?.text &&
  depthOk &&
  countsOk;
const offOk = off.signage?.enabled === false && !off.hasTv;

const result = {
  on,
  news,
  off,
  depthOk,
  countsOk,
  newsOk,
  fatal: errors.filter((e) => !/Framebuffer|WebGL|WebSocket connection/i.test(e)),
  ok:
    onOk &&
    offOk &&
    newsOk &&
    errors.filter((e) => !/Framebuffer|WebGL|WebSocket connection/i.test(e)).length === 0,
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
console.log("PASS: lobby signage");
