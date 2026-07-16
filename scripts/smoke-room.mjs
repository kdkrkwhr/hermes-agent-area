/**
 * Smoke: room interactions — coffee 2048, aquarium feed, nap, meeting start, lobby welcome, work expand.
 * Requires vite on :5173.
 */
import { chromium } from "playwright";

const base = process.env.SMOKE_URL || "http://127.0.0.1:5173/hermes-agent-area/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(base, { waitUntil: "load", timeout: 30000 });
await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
  timeout: 15000,
});
// postBoot sets ready before OfficeScene finishes — wait for room interact + greet
await page.waitForFunction(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  return !!(sc?.boss?.sprite && sc?.roomInteract?.coffeeTiles?.length);
}, null, { timeout: 20000 });
await page.waitForFunction(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const n =
    sc?.roomInteract?.visitCount ??
    window.__HERMES_AREA__?.roomInteract?.visitCount ??
    0;
  return n > 0;
}, null, { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(300);
await page.mouse.click(80, 80);

// dismiss lobby clock-out if welcome path triggered it
await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  if (sc?._clockOutPending) sc.cancelClockOut?.();
  document.querySelector('.clockout-modal [data-role="no"]')?.click();
});

const welcome = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const ri = sc?.roomInteract;
  return {
    visitCount:
      ri?.visitCount ?? window.__HERMES_AREA__?.roomInteract?.visitCount ?? 0,
    lastKind:
      ri?.lastAction?.kind ??
      window.__HERMES_AREA__?.roomInteract?.lastAction?.kind ??
      null,
    coffeeTiles: ri?.coffeeTiles?.length ?? 0,
  };
});

const coffee = await page.evaluate(async () => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const tile = sc?.roomInteract?.coffeeTiles?.[0];
  if (!tile || !sc?.boss?.sprite) return { ok: false, why: "no-coffee" };
  sc.boss.sprite.setPosition(tile.x, tile.y + 28);
  sc.refreshInteractHud?.();
  const hint = sc.roomInteract.hintLabel();
  sc.boss.tryFocusNearAgent();
  await new Promise((r) => setTimeout(r, 200));
  const open = !!document.querySelector(".mg2048.is-open");
  // play one move then close
  window.dispatchEvent(
    new KeyboardEvent("keydown", { code: "ArrowRight", bubbles: true }),
  );
  await new Promise((r) => setTimeout(r, 100));
  document.querySelector('.mg2048 [data-role="close"]')?.click();
  await new Promise((r) => setTimeout(r, 200));
  const score = window.__HERMES_AREA__?.roomInteract?.lastScore?.score;
  return {
    ok: true,
    hint,
    open,
    score,
    closed: !document.querySelector(".mg2048.is-open"),
  };
});

const aquarium = await page.evaluate(async () => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const tile = sc?.roomInteract?.aquariumTiles?.[0];
  if (!tile || !sc?.boss?.sprite) return { ok: false, why: "no-aquarium" };
  sc.boss.sprite.setPosition(tile.x, tile.y + 24);
  sc.refreshInteractHud?.();
  const hint = sc.roomInteract.hintLabel();
  window.dispatchEvent(
    new KeyboardEvent("keydown", { code: "KeyE", bubbles: true }),
  );
  await new Promise((r) => setTimeout(r, 120));
  sc.roomInteract.tryInteract();
  await new Promise((r) => setTimeout(r, 220));
  const snap = window.__HERMES_AREA__?.roomInteract;
  const fish = window.__HERMES_AREA__?.aquariumFish;
  const bubbles = window.__HERMES_AREA__?.aquarium;
  return {
    ok: true,
    hint,
    active: !!snap?.aquafeedActive,
    cooldown: !!snap?.aquafeedCooldown,
    lastFeedAt: snap?.lastFeedAt ?? null,
    kind: snap?.lastAction?.kind ?? null,
    fishFeedActive: !!fish?.feedActive,
    bubbleFeedActive: !!bubbles?.feedActive,
  };
});

const nap = await page.evaluate(async () => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  if (!sc?.boss?.sprite) return { ok: false, why: "no-boss" };
  const sleep = sc?.waypoints?.sleep || { x: 31, y: 21 };
  sc.boss.sprite.setPosition(sleep.x * 32 + 16, sleep.y * 32 + 16);
  sc.refreshInteractHud?.();
  const hint = sc.roomInteract.hintLabel();
  sc.boss.tryFocusNearAgent();
  await new Promise((r) => setTimeout(r, 150));
  const on = !!document.querySelector(".nap-mode.is-on");
  sc.roomInteract.nap?.close?.();
  await new Promise((r) => setTimeout(r, 100));
  return { ok: true, hint, on, off: !document.querySelector(".nap-mode.is-on") };
});

const meeting = await page.evaluate(async () => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const meet = sc?.waypoints?.meeting || { x: 18, y: 9 };
  const agent = sc?.agents?.[0];
  if (!agent?.sprite || !sc?.boss?.sprite) return { ok: false, why: "no-agent" };
  sc.roomInteract.meetingActive = false;
  agent.currentKind = "meeting";
  agent.serverStatus = "blocked";
  agent.sprite.setPosition(meet.x * 32 + 16, meet.y * 32 + 16);
  sc.boss.sprite.setPosition(meet.x * 32 + 16, (meet.y + 1) * 32 + 16);
  sc.roomInteract.updateMeeting();
  await new Promise((r) => setTimeout(r, 50));
  return {
    ok: true,
    active: !!sc.roomInteract.meetingActive,
    kind: sc.roomInteract.lastAction?.kind,
    ticker: window.__HERMES_AREA__?.whiteboardTicker?.text ?? null,
  };
});

const work = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const agent =
    sc?.agents?.find((a) => a.getEffectKind() === "running") || sc?.agents?.[0];
  if (!agent?.sprite || !sc?.boss?.sprite) return { ok: false, why: "no-worker" };
  agent.serverStatus = "running";
  agent.serverData = {
    ...(agent.serverData || {}),
    task_title: "칸반 인터랙션 스모크 작업",
  };
  agent.currentKind = "desk";
  sc.boss.sprite.setPosition(agent.sprite.x + 20, agent.sprite.y);
  sc.boss._nearAgent = agent;
  sc.boss.tryFocusNearAgent();
  const text = agent.bubbleText?.text || "";
  return {
    ok: true,
    kind: sc.roomInteract.lastAction?.kind,
    text,
    hasTask: text.includes("인터랙션") || text.includes("칸반"),
  };
});

const out = { welcome, coffee, aquarium, nap, meeting, work, errors };
console.log(JSON.stringify(out, null, 2));

const fail =
  !welcome.visitCount ||
  !coffee.open ||
  !coffee.closed ||
  aquarium.hint !== "E 먹이주기" ||
  !aquarium.active ||
  !aquarium.cooldown ||
  aquarium.kind !== "aquarium_feed_start" ||
  !aquarium.lastFeedAt ||
  !aquarium.fishFeedActive ||
  !aquarium.bubbleFeedActive ||
  !nap.on ||
  !meeting.active ||
  meeting.kind !== "meeting_start" ||
  work.kind !== "work_expand" ||
  !work.hasTask ||
  errors.length;

await browser.close().catch(() => {});
process.exit(fail ? 1 : 0);
