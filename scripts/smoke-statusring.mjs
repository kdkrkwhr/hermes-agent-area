/** Smoke: agent status-color foot rings — colors by status, ?statusring=0 off. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base =
  process.env.SMOKE_BASE ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:5173/hermes-agent-area/";
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-statusring";

mkdirSync(shotDir, { recursive: true });

const EXPECT = {
  running: 0x4ecdc4,
  chatting: 0x88aaff,
  blocked: 0xe8a040,
  review: 0xc9a0ff,
  idle: 0x6a8a7a,
  ready: 0x6a8a7a,
  todo: 0x6a8a7a,
  offline: 0x556070,
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function gotoQs(qs) {
  const url = `${base.replace(/\/?$/, "/")}?${qs}`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 15000,
  });
  await page.waitForFunction(
    () => {
      const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
      return (sc?.agents?.length ?? 0) >= 1;
    },
    null,
    { timeout: 15000 },
  );
}

function paintStatuses(statuses) {
  return page.evaluate((sts) => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const agents = sc?.agents || [];
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      const st = sts[i % sts.length];
      a.live = true;
      a.serverStatus = st;
      a.path = [];
      a.pathIndex = 0;
      a.syncUi();
    }
    sc.publishDebug?.(undefined, sc.lastSnapshot);
    return window.__HERMES_AREA__?.statusFootRing ?? null;
  }, statuses);
}

await gotoQs("events=0&sfx=0");

// mock defaults: running / blocked / ready — syncUi once via paint
const mockSnap = await paintStatuses(["running", "blocked", "ready"]);
await page.waitForTimeout(200);
await page.screenshot({ path: `${shotDir}/mock-rgb.png`, fullPage: true });

const mockOk =
  mockSnap?.enabled === true &&
  mockSnap?.count >= 3 &&
  mockSnap?.visible >= 3 &&
  mockSnap.rings?.some((r) => r.key === "running" && r.color === EXPECT.running) &&
  mockSnap.rings?.some((r) => r.key === "blocked" && r.color === EXPECT.blocked) &&
  mockSnap.rings?.some((r) => r.key === "ready" && r.color === EXPECT.ready);

console.log(JSON.stringify({ label: "mock-rgb", ok: mockOk, mockSnap }, null, 0));

const allStatuses = [
  "running",
  "chatting",
  "blocked",
  "review",
  "idle",
  "ready",
  "todo",
  "offline",
];
const colorSnap = await paintStatuses(allStatuses);
await page.waitForTimeout(150);
await page.screenshot({ path: `${shotDir}/all-statuses.png`, fullPage: true });

const colorMiss = [];
for (const key of allStatuses) {
  const ring = colorSnap?.rings?.find((r) => r.key === key);
  // todo/ready/idle share palette — key may be exact from paint
  const want = EXPECT[key];
  if (!ring || ring.color !== want) {
    colorMiss.push({ key, ring, want });
  }
}
// With 3 agents cycling 8 statuses we only see 3 keys at once — check by forcing one agent each
const perStatus = {};
for (const st of allStatuses) {
  const snap = await page.evaluate((status) => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    const a = sc.agents[0];
    a.live = true;
    a.serverStatus = status;
    a.path = [];
    a.syncUi();
    sc.publishDebug?.(undefined, sc.lastSnapshot);
    const r = window.__HERMES_AREA__?.statusFootRing?.rings?.[0];
    return { key: r?.key, color: r?.color, status };
  }, st);
  perStatus[st] = snap;
}
await page.screenshot({ path: `${shotDir}/offline.png`, fullPage: true });

const perOk = allStatuses.every(
  (st) => perStatus[st]?.key === st && perStatus[st]?.color === EXPECT[st],
);
console.log(JSON.stringify({ label: "per-status", ok: perOk, perStatus }, null, 0));

// moving alpha drop
const moveCheck = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const a = sc.agents[0];
  a.live = true;
  a.serverStatus = "running";
  a.path = [];
  a.syncUi();
  const idleA = a.statusRingGfx?._statusRingAlpha;
  a.path = [{ x: 10, y: 10 }, { x: 11, y: 10 }];
  a.pathIndex = 0;
  a.syncUi();
  const moveA = a.statusRingGfx?._statusRingAlpha;
  a.path = [];
  a.syncUi();
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  return { idleA, moveA, dropped: moveA < idleA };
});
console.log(JSON.stringify({ label: "move-alpha", ok: moveCheck.dropped, moveCheck }, null, 0));

await gotoQs("statusring=0&events=0&sfx=0");
const offSnap = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  sc.publishDebug?.(undefined, sc.lastSnapshot);
  return window.__HERMES_AREA__?.statusFootRing ?? null;
});
await page.screenshot({ path: `${shotDir}/force-off.png`, fullPage: true });
const offOk = offSnap?.enabled === false && (offSnap?.count ?? 0) === 0;
console.log(JSON.stringify({ label: "force-off", ok: offOk, offSnap }, null, 0));

// Boss must not have statusRingGfx
const bossOk = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  return sc?.boss?.statusRingGfx == null;
});
console.log(JSON.stringify({ label: "boss-skip", ok: bossOk }));

await browser.close();

const ok =
  mockOk &&
  perOk &&
  moveCheck.dropped &&
  offOk &&
  bossOk &&
  errors.length === 0;

if (!ok) {
  console.error("FAIL statusring smoke", { errors, colorMiss });
  process.exit(1);
}
console.log("PASS statusring smoke");
