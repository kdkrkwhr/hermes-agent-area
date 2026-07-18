/** Smoke: birthday_balloons — toast + lounge balloons + gather; skip if gathering. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=0&chatter=0&tod=day`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-birthdayballoons";
mkdirSync(shotDir, { recursive: true });

const BIRTHDAY_TOASTS = ["생일이다!", "생일 ㅊㅋ", "케이크 각?"];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(url, {
  waitUntil: "networkidle",
  timeout: 30000,
});

await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
  timeout: 15000,
});
await page.waitForFunction(
  () => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    return !!(sc?.officeEvents && (sc.agents?.length ?? 0) >= 2);
  },
  null,
  { timeout: 15000 },
);

const fired = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  sc.setLive?.(false);
  oe.enabled = true;
  if (oe._schedule) {
    oe._schedule.remove(false);
    oe._schedule = null;
  }
  oe._shipCooldownUntil = sc.time.now + 999999;
  oe._gatherUntil = 0;
  oe.birthdayBalloonsGathered = 0;

  if (!sc._emitterKinds) sc._emitterKinds = new Map();
  const agents = sc.agents || [];
  for (const a of agents) {
    a.live = false;
    a.serverStatus = null;
    a.serverData = null;
    a.currentKind = "break";
    a.path = [];
    a.pathIndex = 0;
    a.busy = false;
    a.idleUntil = sc.time.now + 999999;
    a._waterBackup = null;
    a._stretchBackup = null;
    a._chatterBackup = null;
    a.sprite.setPosition(7 * 32 + 16, 8 * 32 + 16);
    sc._emitterKinds.set(a.def.id, "idle");
    a.setStatus("대기");
  }

  oe.fire("birthday_balloons");
  return {
    toast: document.getElementById("office-toast")?.textContent || "",
    lastEvent: oe.lastEvent,
    hasBalloonTex: sc.textures.exists("fx-balloon"),
    events: window.__HERMES_AREA__?.events,
  };
});

await page.waitForFunction(
  () => (window.__HERMES_AREA__?.events?.birthdayBalloonsGathered ?? 0) >= 1,
  null,
  { timeout: 25000 },
);

await page.waitForTimeout(250);

await page
  .screenshot({ path: `${shotDir}/birthday-mid.png`, fullPage: false })
  .catch(() => {});

const mid = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  const agents = sc.agents || [];
  const br = sc.waypoints?.break || { x: 31, y: 4 };
  return {
    agentCount: agents.length,
    birthdayBalloonsGathered: oe.birthdayBalloonsGathered,
    lastEvent: oe.lastEvent,
    toast: document.getElementById("office-toast")?.textContent || "",
    gathering: oe.isGathering(),
    hasBalloonTex: sc.textures.exists("fx-balloon"),
    events: window.__HERMES_AREA__?.events,
    nearLounge: agents.filter((a) => {
      const t = a.tilePos();
      return Math.abs(t.x - br.x) <= 10 && Math.abs(t.y - br.y) <= 10;
    }).length,
  };
});

const skip = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.markGathering(5000);
  const gatheredBefore = oe.birthdayBalloonsGathered;
  const el = document.getElementById("office-toast");
  if (el) el.textContent = "LOCKED";
  oe.fire("birthday_balloons");
  return {
    birthdayBalloonsGathered: oe.birthdayBalloonsGathered,
    gatheredBefore,
    toast: document.getElementById("office-toast")?.textContent || "",
  };
});

await page
  .screenshot({ path: `${shotDir}/birthday-after.png`, fullPage: false })
  .catch(() => {});

const result = { fired, mid, skip, errors };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length) {
  console.error("page errors", errors);
  process.exit(2);
}
if (
  fired.lastEvent !== "birthday_balloons" &&
  mid.lastEvent !== "birthday_balloons"
) {
  console.error("FAIL: lastEvent should be birthday_balloons", fired, mid.lastEvent);
  process.exit(1);
}
const toastOk = BIRTHDAY_TOASTS.some(
  (t) =>
    String(fired.toast).includes("생일") ||
    String(fired.toast).includes("케이크") ||
    String(fired.toast).includes(t.replace("!", "")),
);
if (!toastOk) {
  console.error("FAIL: toast should be birthday phrase", fired.toast);
  process.exit(1);
}
if (!fired.hasBalloonTex && !mid.hasBalloonTex) {
  console.error("FAIL: fx-balloon texture should exist", fired, mid);
  process.exit(1);
}
if ((mid.birthdayBalloonsGathered ?? 0) < 1 || mid.agentCount < 2) {
  console.error("FAIL: birthday_balloons should gather ≥1 idle agent", mid);
  process.exit(1);
}
if (!mid.gathering) {
  console.error("FAIL: birthday_balloons should mark gathering", mid);
  process.exit(1);
}
if (mid.events?.lastEvent !== "birthday_balloons") {
  console.error("FAIL: snapshot lastEvent should be birthday_balloons", mid.events);
  process.exit(1);
}
if (
  BIRTHDAY_TOASTS.includes(skip.toast) ||
  String(skip.toast).includes("생일") ||
  String(skip.toast).includes("케이크")
) {
  console.error("FAIL: overlapping gather should skip birthday toast", skip);
  process.exit(1);
}
console.log(
  "PASS: birthday_balloons gathered=",
  mid.birthdayBalloonsGathered,
  "toast=",
  fired.toast,
);
