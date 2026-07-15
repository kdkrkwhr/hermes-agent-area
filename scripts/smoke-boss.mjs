import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});

await page.goto("http://127.0.0.1:5173/", {
  waitUntil: "networkidle",
  timeout: 30000,
});

await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
  timeout: 15000,
});

await page.waitForTimeout(1500);

const before = await page.evaluate(() => window.__HERMES_AREA__.boss);

// move right then try into wall cluster; also go up/down (WASD)
await page.keyboard.down("KeyD");
await page.waitForTimeout(800);
await page.keyboard.up("KeyD");
const mid = await page.evaluate(() => window.__HERMES_AREA__.boss);

await page.keyboard.down("KeyA");
await page.waitForTimeout(400);
await page.keyboard.up("KeyA");

await page.keyboard.down("KeyW");
await page.waitForTimeout(500);
await page.keyboard.up("KeyW");
const after = await page.evaluate(() => window.__HERMES_AREA__.boss);

// probe collision: slam into desk area (bottom)
for (let i = 0; i < 20; i++) {
  await page.keyboard.down("KeyS");
  await page.waitForTimeout(80);
  await page.keyboard.up("KeyS");
}
const blocked = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const boss = sc?.boss;
  const layer = sc?.collision;
  const tx = Math.floor(boss.sprite.x / 16);
  const ty = Math.floor(boss.sprite.y / 16);
  const tile = layer.getTileAt(tx, ty);
  return {
    x: Math.round(boss.sprite.x),
    y: Math.round(boss.sprite.y),
    tileIndex: tile?.index ?? 0,
    onCollision: !!(tile && tile.index > 0),
  };
});

await page.screenshot({
  path: process.env.SMOKE_OUT || "smoke-screenshot.png",
  fullPage: true,
});

const area = await page.evaluate(() => ({
  ready: window.__HERMES_AREA__?.ready,
  zoom: window.__HERMES_AREA__?.cameraZoom,
  boss: window.__HERMES_AREA__?.boss,
  agentCount: window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene")?.agents?.length,
}));

const fatal = errors.filter((e) => !/Framebuffer|WebGL/i.test(e));
const moved = before && mid && (mid.x !== before.x || mid.y !== before.y);
const result = {
  before,
  mid,
  after,
  blocked,
  area,
  moved,
  zoomOk: Number.isInteger(area.zoom) && area.zoom >= 1,
  bossOk: area.boss?.label === "대장님",
  notInsideWall: blocked.onCollision === false,
  errors: fatal,
  ok:
    !!area.ready &&
    area.agentCount === 3 &&
    moved &&
    Number.isInteger(area.zoom) &&
    area.zoom >= 1 &&
    area.boss?.label === "대장님" &&
    blocked.onCollision === false &&
    fatal.length === 0,
};
console.log(JSON.stringify(result, null, 2));
await browser.close();
if (!result.ok) process.exit(1);
