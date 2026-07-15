import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });

async function runCase(label, url) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForFunction(() => window.__HERMES_AREA__?.ready === true, null, {
    timeout: 15000,
  });
  await page.waitForFunction(
    () =>
      window.__HERMES_AREA__?.kanbanPanel?.agentCount === 3 &&
      document.querySelector(".kanban-panel__list li"),
    null,
    { timeout: 12000 },
  );

  await page.evaluate(() => {
    document.querySelector(".kanban-panel__row[data-agent-id='onion']")?.click();
  });
  await page.waitForFunction(
    () => window.__HERMES_AREA__?.kanbanPanel?.selectedId === "onion",
    null,
    { timeout: 5000 },
  );

  const snapshot = await page.evaluate(() => ({
    kanbanPanel: window.__HERMES_AREA__?.kanbanPanel,
    live: window.__HERMES_AREA__?.live,
    agents: window.__HERMES_AREA__?.snapshot?.agents?.map((a) => ({
      id: a.id,
      status: a.status,
      task_title: a.task_title,
    })),
    detailVisible: !document.querySelector(".kanban-panel__detail[hidden]"),
    rowCount: document.querySelectorAll(".kanban-panel__row").length,
    statsText: document.querySelector(".kanban-panel__stats")?.textContent,
  }));

  await page.close();
  const fatal = errors.filter(
    (e) => !/Framebuffer|WebGL|WebSocket connection/i.test(e),
  );
  return { label, snapshot, fatal };
}

const mockCase = await runCase(
  "mock",
  "http://127.0.0.1:5173/?ws=ws://127.0.0.1:9/ws",
);
await new Promise((r) => setTimeout(r, 500));
const liveCase = await runCase("live", "http://127.0.0.1:5173/");

function okCase(c, { mock = false } = {}) {
  const p = c.snapshot.kanbanPanel;
  const hasTitles = c.snapshot.agents?.some((a) => a.task_title);
  const statsOk = mock
    ? p?.stats?.running >= 1 && p?.stats?.blocked >= 1 && p?.mode === "mock"
    : p?.stats?.running >= 1 && p?.mode === "live";
  return (
    c.fatal.length === 0 &&
    c.snapshot.rowCount === 3 &&
    statsOk &&
    hasTitles &&
    (c.snapshot.detailVisible === true || c.snapshot.kanbanPanel?.selectedId === "onion")
  );
}

const result = {
  mock: { ...mockCase, ok: okCase(mockCase, { mock: true }) },
  live: { ...liveCase, ok: okCase(liveCase, { mock: false }) },
  ok: okCase(mockCase, { mock: true }) && okCase(liveCase, { mock: false }),
};

console.log(JSON.stringify(result, null, 2));
await browser.close();
if (!result.ok) process.exit(1);
