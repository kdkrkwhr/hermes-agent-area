/** Smoke: TOD BGM filter morph — ?tod= + L cycle; mute/?sfx preserved. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = (process.env.SMOKE_URL || "http://127.0.0.1:5173").replace(/\/?$/, "");
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-todbgm";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(45000);

const EXPECT = {
  morning: { freqMax: 14000, freqMin: 7000, rateMin: 1.01 },
  day: { freqMax: 22000, freqMin: 12000, rateMin: 0.98, rateMax: 1.02 },
  evening: { freqMax: 5500, freqMin: 2000, rateMax: 0.99 },
  night: { freqMax: 2800, freqMin: 800, rateMax: 0.96 },
};

async function unlockAudio() {
  await page.click("canvas", { position: { x: 220, y: 220 } });
  await page.waitForFunction(
    () =>
      window.__HERMES_AREA__?.audio?.unlocked === true &&
      window.__HERMES_AREA__?.audio?.bgmPlaying === true,
    null,
    { timeout: 10000 },
  );
}

async function audioSnap() {
  return page.evaluate(() => {
    const a = window.__HERMES_AREA__?.audio;
    const lighting = window.__HERMES_AREA__?.lighting;
    return { audio: a, lighting };
  });
}

function toneOk(tod, audio) {
  const exp = EXPECT[tod];
  if (!exp || !audio) return false;
  if (audio.tod !== tod) return false;
  if (!audio.bgmPlaying) return false;
  const f = audio.filterFreq;
  if (typeof f !== "number") return false;
  if (f < exp.freqMin || f > exp.freqMax) return false;
  const r = audio.bgmRate;
  if (typeof r === "number") {
    if (exp.rateMin != null && r < exp.rateMin) return false;
    if (exp.rateMax != null && r > exp.rateMax) return false;
  }
  return true;
}

async function checkTod(label, tod) {
  await page.goto(`${base}/?tod=${tod}&events=0`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  await unlockAudio();
  // allow filter ramp
  await page.waitForTimeout(200);
  const snap = await audioSnap();
  const ok = toneOk(tod, snap.audio) && snap.lighting === tod;
  await page.screenshot({ path: `${shotDir}/${label}.png`, fullPage: true });
  console.log(JSON.stringify({ label, ok, ...snap }));
  if (!ok) process.exitCode = 1;
  return snap;
}

// 1) each ?tod=
for (const tod of ["morning", "day", "evening", "night"]) {
  await checkTod(`tod-${tod}`, tod);
}

// 2) L cycle from morning → day without cutting BGM
await page.goto(`${base}/?tod=morning&events=0`, {
  waitUntil: "domcontentloaded",
  timeout: 45000,
});
await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
  timeout: 30000,
});
await unlockAudio();
const beforeL = await audioSnap();
await page.keyboard.press("L");
await page.waitForTimeout(300);
const afterL = await audioSnap();
const lOk =
  beforeL.audio?.bgmPlaying === true &&
  afterL.audio?.bgmPlaying === true &&
  afterL.lighting === "day" &&
  afterL.audio?.tod === "day" &&
  typeof afterL.audio?.filterFreq === "number" &&
  afterL.audio.filterFreq > (beforeL.audio?.filterFreq ?? 0);
await page.screenshot({ path: `${shotDir}/l-cycle.png`, fullPage: true });
console.log(JSON.stringify({ label: "l-cycle", ok: lOk, beforeL, afterL }));
if (!lOk) process.exitCode = 1;

// 3) M mute still works with TOD filter
await page.keyboard.press("M");
await page.waitForFunction(() => window.__HERMES_AREA__?.audio?.muted === true, null, {
  timeout: 3000,
});
const muted = await audioSnap();
await page.keyboard.press("M");
await page.waitForFunction(() => window.__HERMES_AREA__?.audio?.muted === false, null, {
  timeout: 3000,
});
const unmuted = await audioSnap();
const muteOk =
  muted.audio?.muted === true &&
  unmuted.audio?.muted === false &&
  unmuted.audio?.bgmPlaying === true &&
  unmuted.audio?.tod === "day";
console.log(JSON.stringify({ label: "mute-preserve", ok: muteOk, muted: muted.audio, unmuted: unmuted.audio }));
if (!muteOk) process.exitCode = 1;

// 4) ?sfx=0 still disables SFX flag (BGM ok)
await page.goto(`${base}/?tod=night&sfx=0&events=0`, {
  waitUntil: "domcontentloaded",
  timeout: 45000,
});
await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
  timeout: 30000,
});
await unlockAudio();
await page.waitForTimeout(200);
const sfxSnap = await audioSnap();
const sfxOk =
  sfxSnap.audio?.sfxEnabled === false &&
  sfxSnap.audio?.bgmPlaying === true &&
  toneOk("night", sfxSnap.audio);
console.log(JSON.stringify({ label: "sfx0-bgm", ok: sfxOk, ...sfxSnap }));
if (!sfxOk) process.exitCode = 1;

await browser.close();
if (process.exitCode) {
  console.error("FAIL todbgm smoke");
  process.exit(1);
}
console.log("PASS todbgm smoke");
