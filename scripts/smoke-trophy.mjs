/** Smoke: CEO trophy shelf + E recent-done toast. ?trophy=0 off, ?trophy=force peek. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-trophy";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];

async function boot(page, qs) {
  const root = base.replace(/\/?$/, "/");
  await page.goto(`${root}?${qs}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 30000,
  });
  await page.waitForFunction(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    return (
      !!(sc?.boss?.sprite && sc?.trophyShelf) &&
      typeof sc?.roomInteract?.startTrophyPeek === "function"
    );
  }, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  await page.mouse.click(80, 80);
  await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    if (sc?._clockOutPending) sc.cancelClockOut?.();
    document.querySelector('.clockout-modal [data-role="no"]')?.click();
  });
  await page.waitForTimeout(200);
}

async function checkShelf() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  await boot(page, "events=0&sfx=0");

  const on = await page.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    sc.trophyShelf?.refreshFromScene?.();
    sc.publishDebug?.(undefined, sc.lastSnapshot);
    const snap = window.__HERMES_AREA__?.trophyShelf;
    const panel = window.__HERMES_AREA__?.kanbanPanel;
    return {
      enabled: snap?.enabled,
      visible: snap?.visible,
      source: snap?.source,
      itemCount: snap?.items?.length ?? 0,
      items: snap?.items ?? [],
      x: snap?.x,
      y: snap?.y,
      kanbanAgentCount: panel?.agentCount ?? null,
    };
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${shotDir}/trophy-on.png`, fullPage: true });
  await page.close();

  const pageOff = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  pageOff.on("pageerror", (e) => errors.push(String(e)));
  await boot(pageOff, "trophy=0&events=0&sfx=0");
  const off = await pageOff.evaluate(() => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    sc.trophyShelf?.refreshFromScene?.();
    sc.publishDebug?.(undefined, sc.lastSnapshot);
    const snap = window.__HERMES_AREA__?.trophyShelf;
    const peek = window.__HERMES_AREA__?.trophyPeek;
    const anchor = snap?.x != null ? { x: snap.x, y: snap.y } : peek?.anchor;
    if (anchor && sc?.boss?.sprite) {
      sc.boss.sprite.setPosition(anchor.x + 10, anchor.y + 28);
      sc.refreshInteractHud?.();
    }
    return {
      enabled: snap?.enabled,
      visible: snap?.visible,
      itemCount: snap?.items?.length ?? 0,
      interactEnabled: sc?.roomInteract?.trophyEnabled,
      hint: sc?.roomInteract?.hintLabel?.() ?? null,
      peekEnabled: peek?.enabled ?? null,
    };
  });
  await pageOff.screenshot({ path: `${shotDir}/trophy-off.png`, fullPage: true });
  await pageOff.close();

  return { on, off };
}

async function checkPeek() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  await boot(page, "tod=day&events=0&sfx=0");

  const peek = await page.evaluate(async () => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    if (!sc?.boss?.sprite || !sc?.roomInteract) return { ok: false, why: "no-scene" };
    sc.trophyShelf?.refreshFromScene?.();
    const snap = sc.trophyShelf?.snapshot?.() || window.__HERMES_AREA__?.trophyShelf;
    const x = snap?.x ?? sc.trophyShelf?.anchor?.x;
    const y = snap?.y ?? sc.trophyShelf?.anchor?.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, why: "no-anchor" };

    sc.roomInteract.aquariumFeedEnabled = false;
    sc.roomInteract.mascotPetEnabled = false;
    sc.roomInteract.plantWaterEnabled = false;
    sc.roomInteract.posterEnabled = false;
    sc.roomInteract.bookshelfTipEnabled = false;
    sc.roomInteract.vendingEnabled = false;
    sc.roomInteract._lobbyWelcomed = true;
    sc.roomInteract.trophyCooldownUntil = 0;
    sc.roomInteract.trophyActiveUntil = 0;

    sc.boss.sprite.setPosition(x + 10, y + 28);
    sc.refreshInteractHud?.();
    const hint = sc.roomInteract.hintLabel();
    sc.roomInteract.tryInteract();
    await new Promise((r) => setTimeout(r, 250));

    const tp = window.__HERMES_AREA__?.trophyPeek;
    const ri = window.__HERMES_AREA__?.roomInteract;
    return {
      ok: true,
      hint,
      enabled: !!tp?.enabled,
      active: !!tp?.active,
      cooldown: !!tp?.cooldown,
      lastTrophyAt: tp?.lastTrophyAt ?? null,
      lastToast: tp?.lastToast ?? null,
      lastItems: tp?.lastItems ?? null,
      kind: ri?.lastAction?.kind ?? null,
      toastOn: !!document.querySelector(".room-toast.is-on"),
      toastText: document.querySelector(".room-toast")?.textContent ?? null,
      itemCount: tp?.lastItems?.length ?? 0,
    };
  });

  await page.screenshot({ path: `${shotDir}/force-peek.png`, fullPage: false });
  await page.close();
  return peek;
}

async function checkForce() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  await boot(page, "trophy=force&events=0&sfx=0");
  await page.waitForFunction(() => {
    const tp = window.__HERMES_AREA__?.trophyPeek;
    return !!(tp?.lastTrophyAt || tp?.cooldown || tp?.lastToast);
  }, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  const force = await page.evaluate(() => {
    const tp = window.__HERMES_AREA__?.trophyPeek;
    const ri = window.__HERMES_AREA__?.roomInteract;
    return {
      enabled: !!tp?.enabled,
      cooldown: !!tp?.cooldown,
      lastTrophyAt: tp?.lastTrophyAt ?? null,
      kind: ri?.lastAction?.kind ?? null,
      toast: tp?.lastToast ?? null,
    };
  });
  await page.screenshot({ path: `${shotDir}/trophy-force.png`, fullPage: false });
  await page.close();
  return force;
}

const { on, off } = await checkShelf();
const peek = await checkPeek();
const force = await checkForce();

const checks = {
  enabled: on.enabled === true,
  visible: on.visible === true,
  itemCount: on.itemCount >= 2,
  source: !!on.source,
  x: Number.isFinite(on.x),
  y: Number.isFinite(on.y),
  kanban: on.kanbanAgentCount === 3,
  offEnabled: off.enabled === false,
  offVisible: off.visible === false,
  offInteract: off.interactEnabled === false,
  offHint: off.hint !== "E 트로피",
  peekOk: peek.ok === true,
  peekHint: peek.hint === "E 트로피",
  peekActive: peek.active === true,
  peekCooldown: peek.cooldown === true,
  peekKind: peek.kind === "trophy_peek_start",
  peekToast: !!peek.lastToast && peek.toastOn && peek.toastText === peek.lastToast,
  peekItems: peek.itemCount >= 1,
  forceCooldown: force.cooldown === true,
  forceKind: force.kind === "trophy_peek_start" || !!force.lastTrophyAt,
  noErrors: errors.length === 0,
};
const ok = Object.values(checks).every(Boolean);

const result = { ok, checks, on, off, peek, force, errors, shotDir };
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (!ok) {
  console.error("FAIL smoke-trophy");
  process.exit(1);
}
console.log("PASS smoke-trophy");
