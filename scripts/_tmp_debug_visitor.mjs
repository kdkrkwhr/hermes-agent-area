/** Debug: dump hermes area / visitor readiness. */
import { chromium } from "playwright";

const base = process.env.SMOKE_BASE || "http://127.0.0.1:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?visitor=1&events=0`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console:${m.text()}`);
});

await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
await page.waitForTimeout(4000);

const dump = await page.evaluate(() => {
  const area = window.__HERMES_AREA__ || null;
  const game = window.__HERMES_GAME__;
  const keys = game?.scene?.keys ? Object.keys(game.scene.keys) : [];
  const sc = game?.scene?.getScene?.("OfficeScene");
  return {
    areaReady: area?.ready ?? null,
    areaKeys: area ? Object.keys(area) : null,
    areaVisitor: area?.visitor ?? null,
    gameExists: !!game,
    sceneKeys: keys,
    hasOffice: !!sc,
    hasMap: !!sc?.map,
    hasPathfinder: !!sc?.pathfinder,
    hasVisitorDirector: !!sc?.visitorDirector,
    visitorSnap: sc?.visitorDirector?.snapshot?.() ?? null,
    createError: sc?._createError ?? null,
  };
});

console.log(JSON.stringify({ url, dump, errors }, null, 2));
await browser.close();
