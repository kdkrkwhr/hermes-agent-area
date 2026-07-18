/** Smoke: world skill chips — running shows 1+, ?skills=0 hides, force idle always. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-skills";

mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function gotoQs(qs) {
  const url = `${base.replace(/\/?$/, "/")}?${qs}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 20000,
  });
  await page.waitForFunction(
    () => {
      const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
      return (sc?.agents?.length ?? 0) >= 1;
    },
    null,
    { timeout: 20000 },
  );
}

await gotoQs("events=0&sfx=0");

const running = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.live = true;
  a.serverStatus = "running";
  a.currentKind = "desk";
  a.serverData = {
    ...(a.serverData || {}),
    zone: "desk",
    skills: a.serverData?.skills?.length
      ? a.serverData.skills
      : a.def.skills || [
          { name: "hermes-agent-area" },
          { name: "kanban-worker" },
        ],
  };
  a.path = [];
  a.pathIndex = 0;
  a.syncUi();
  const chips = a.skillChips;
  const labels = (chips?.labels || [])
    .filter((l) => l.visible)
    .map((l) => l.text);
  return {
    enabled: !!chips?.enabled,
    force: !!chips?.force,
    visible: labels.length > 0,
    labels,
    gfxVisible: !!chips?.gfx?.visible,
    id: a.def.id,
    hasSkillChips: !!chips,
  };
});

await page.waitForTimeout(200);
await page.screenshot({ path: `${shotDir}/running.png`, fullPage: true });

const idlePeek = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.serverStatus = "idle";
  a.currentKind = "break";
  let saw = false;
  let labels = [];
  for (let i = 0; i < 40; i++) {
    a.scene.time.now = i * 250;
    a.syncUi();
    const labs = (a.skillChips?.labels || [])
      .filter((l) => l.visible)
      .map((l) => l.text);
    if (labs.length) {
      saw = true;
      labels = labs;
      break;
    }
  }
  return { saw, labels };
});

await page.screenshot({ path: `${shotDir}/idle-cycle.png`, fullPage: true });

await gotoQs("skills=0&events=0&sfx=0");

const off = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.live = true;
  a.serverStatus = "running";
  a.currentKind = "desk";
  a.serverData = {
    ...(a.serverData || {}),
    skills: [{ name: "hermes-agent-area" }, { name: "kanban-worker" }],
  };
  a.syncUi();
  const chips = a.skillChips;
  const labels = (chips?.labels || [])
    .filter((l) => l.visible)
    .map((l) => l.text);
  return {
    enabled: !!chips?.enabled,
    visible: labels.length > 0,
    labels,
    gfxVisible: !!chips?.gfx?.visible,
  };
});

await page.screenshot({ path: `${shotDir}/skills-off.png`, fullPage: true });

await gotoQs("skills=force&events=0&sfx=0");

const forceIdle = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.live = true;
  a.serverStatus = "idle";
  a.currentKind = "break";
  a.serverData = {
    ...(a.serverData || {}),
    skills: [{ name: "hermes-agent-area" }, { name: "kanban-worker" }],
  };
  a.syncUi();
  const chips = a.skillChips;
  const labels = (chips?.labels || [])
    .filter((l) => l.visible)
    .map((l) => l.text);
  return {
    enabled: !!chips?.enabled,
    force: !!chips?.force,
    visible: labels.length > 0,
    labels,
  };
});

await page.screenshot({ path: `${shotDir}/skills-force-idle.png`, fullPage: true });

const offline = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.serverStatus = "offline";
  a.currentKind = "sleep";
  a.syncUi();
  const labels = (a.skillChips?.labels || [])
    .filter((l) => l.visible)
    .map((l) => l.text);
  return { visible: labels.length > 0 };
});

const ok =
  running.visible === true &&
  running.labels.length >= 1 &&
  running.labels.length <= 2 &&
  running.enabled === true &&
  off.visible === false &&
  off.enabled === false &&
  forceIdle.visible === true &&
  forceIdle.force === true &&
  offline.visible === false &&
  idlePeek.saw === true &&
  errors.length === 0;

const result = {
  ok,
  running,
  idlePeek,
  off,
  forceIdle,
  offline,
  errors,
  shotDir,
};
console.log(JSON.stringify(result, null, 2));
await browser.close();
process.exit(ok ? 0 : 1);
