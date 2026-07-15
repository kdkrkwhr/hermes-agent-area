import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
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

// wait for live WS snapshot
await page.waitForFunction(
  () => window.__HERMES_AREA__?.live === true && window.__HERMES_AREA__?.snapshot?.agents?.length >= 3,
  null,
  { timeout: 20000 },
).catch(() => {});

await page.waitForTimeout(5000);

// Audio: unlock on gesture, BGM loop, M mute toggle + HUD glyph
await page.click("canvas", { position: { x: 200, y: 200 } });
await page.waitForFunction(
  () =>
    window.__HERMES_AREA__?.audio?.unlocked === true &&
    window.__HERMES_AREA__?.audio?.bgmPlaying === true,
  null,
  { timeout: 8000 },
);

const audioBeforeMute = await page.evaluate(() => window.__HERMES_AREA__?.audio);
await page.keyboard.press("M");
await page.waitForFunction(
  () => window.__HERMES_AREA__?.audio?.muted === true,
  null,
  { timeout: 3000 },
);
const mutedSnap = await page.evaluate(() => ({
  audio: window.__HERMES_AREA__?.audio,
  muteKey: localStorage.getItem("hermes-area-mute"),
  cacheKeys: (() => {
    const g = window.__HERMES_GAME__;
    const sc = g?.scene?.getScene?.("OfficeScene");
    const audio = sc?.cache?.audio;
    return audio ? audio.getKeys() : [];
  })(),
}));

await page.keyboard.press("M");
await page.waitForFunction(
  () => window.__HERMES_AREA__?.audio?.muted === false,
  null,
  { timeout: 3000 },
);

const snapshot = await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  const g = window.__HERMES_GAME__;
  const sc = g?.scene?.getScene?.("OfficeScene");
  const agents = sc?.agents || [];
  const liveSnap = window.__HERMES_AREA__?.snapshot;
  const boss = window.__HERMES_AREA__?.boss;
  return {
    ready: !!window.__HERMES_AREA__?.ready,
    live: !!window.__HERMES_AREA__?.live,
    scenes: window.__HERMES_AREA__?.scenes || [],
    canvas: !!canvas,
    canvasSize: canvas ? { w: canvas.width, h: canvas.height } : null,
    agentCount: agents.length,
    statuses: agents.map((a) => a.statusText),
    serverStatuses: agents.map((a) => a.serverStatus),
    positions: agents.map((a) => ({
      id: a.def.id,
      x: Math.round(a.sprite.x),
      y: Math.round(a.sprite.y),
      pathLen: a.path.length,
      name: a.def.displayName,
      live: a.live,
    })),
    boss,
    cameraZoom: window.__HERMES_AREA__?.cameraZoom,
    wsAgents: liveSnap?.agents?.map((a) => ({
      id: a.id,
      status: a.status,
      zone: a.zone,
      bubble: a.bubble,
      task_id: a.task_id,
    })),
    audio: window.__HERMES_AREA__?.audio ?? null,
  };
});

const outDir = process.env.SMOKE_OUT || "smoke-screenshot.png";
await page.screenshot({ path: outDir, fullPage: true });
const fatal = errors.filter((e) => !/Framebuffer|WebGL/i.test(e));
const hasOnionRunning = snapshot.wsAgents?.some(
  (a) => a.id === "onion" && a.status === "running",
);
const hasOfflineClaude = snapshot.wsAgents?.some(
  (a) => a.id === "claude" && a.status === "offline",
);
// overview stretch zoom may be fractional / <1
const zoomOk = typeof snapshot.cameraZoom === "number" && snapshot.cameraZoom > 0;
const bossOk =
  snapshot.boss &&
  snapshot.boss.label === "대장님" &&
  typeof snapshot.boss.x === "number";
const audioCacheOk = ["office-ambient", "sfx-running", "sfx-blocked"].every((k) =>
  mutedSnap.cacheKeys.includes(k),
);
const audioOk =
  audioBeforeMute?.unlocked === true &&
  audioBeforeMute?.bgmPlaying === true &&
  mutedSnap.audio?.muted === true &&
  mutedSnap.muteKey === "1" &&
  audioCacheOk &&
  snapshot.audio?.muted === false;

const result = {
  snapshot,
  errors,
  hasOnionRunning,
  hasOfflineClaude,
  zoomOk,
  bossOk,
  audioOk,
  mutedSnap,
  ok:
    snapshot.canvas &&
    snapshot.agentCount === 3 &&
    fatal.length === 0 &&
    zoomOk &&
    bossOk &&
    audioOk &&
    snapshot.ready === true,
};
console.log(JSON.stringify(result, null, 2));
await browser.close();
if (!result.ok) process.exit(1);
